/* HOMEFRAME — an illustrative, deterministic domestic-robot simulation.
 * A robot owns its map, observed chores and saved landmarks. There is no global
 * task allocator. Full geometry is consulted by sensors and collision physics,
 * while navigation only reads occupancy the robot has personally discovered.
 */
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => ((a - b + Math.PI * 3) % TAU) - Math.PI;
const polygonOf = p => p?.polygon || p;
const mean = list => list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : 0;

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function intersectsCell(polygon, x, y, half) {
  const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
  if (Math.max(...xs) < x - half || Math.min(...xs) > x + half || Math.max(...ys) < y - half || Math.min(...ys) > y + half) return false;
  if (polygon.some(([px, py]) => px >= x - half && px <= x + half && py >= y - half && py <= y + half)) return true;
  const corners = [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]];
  if (corners.some(([px, py]) => pointInPolygon(px, py, polygon))) return true;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < polygon.length; i++) for (let j = 0; j < 4; j++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = corners[j], d = corners[(j + 1) % 4];
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  }
  return false;
}

class Heap {
  constructor() { this.items = []; }
  get length() { return this.items.length; }
  push(node) {
    const a = this.items; a.push(node); let i = a.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (a[parent].f <= node.f) break; a[i] = a[parent]; i = parent; }
    a[i] = node;
  }
  pop() {
    const a = this.items, result = a[0], tail = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].f < a[child].f) child++;
        if (tail.f <= a[child].f) break;
        a[i] = a[child]; i = child;
      }
      a[i] = tail;
    }
    return result;
  }
}

export const ROBOT_TYPES = Object.freeze({
  tidy: {name: 'TIDY', role: 'Collect clutter and deliver it to the dock', criterion: 'Deliveries per metre and battery unit'},
  care: {name: 'CARE', role: 'Find and service spills and leaks', criterion: 'Urgency-weighted response time and service completion'}
});

// API units are metres, seconds and radians. UI controls may display degrees.
export const ROBOT_DEFAULT_PARAMS = Object.freeze({
  tidy: Object.freeze({speed: .68, vision: 4.8, fov: Math.PI * .78}),
  care: Object.freeze({speed: .59, vision: 5.8, fov: Math.PI * .78})
});
export const ROBOT_PARAM_LIMITS = Object.freeze({
  speed: Object.freeze({min: .25, max: 1.25}),
  vision: Object.freeze({min: 2, max: 9}),
  fov: Object.freeze({min: Math.PI / 4, max: Math.PI * 10 / 9})
});
export const TASK_POSITION_RULES = Object.freeze({clearance: .25, minTaskDistance: .8, minDockDistance: .9});

export class Simulation {
  constructor(site, options = {}) {
    this.site = site;
    this.options = {population: 6, seed: 42, memory: true, scenario: 'routine', cellSize: .5, ...options};
    this.reset();
  }

  reset(options = {}) {
    this.options = {...this.options, ...options};
    this._setRobotParams();
    this.scenario = this.options.scenario;
    this.time = 0; this.history = []; this.events = []; this.completedReturns = []; this._historyAt = 0;
    this._makeWorld();
    this._makeTasks();
    this.agents = [];
    const population = clamp(Math.round(this.options.population), 2, 24);
    for (let i = 0; i < population; i++) this.agents.push(this._makeRobot(i));
    for (const a of this.agents) this._sense(a);
    for (const a of this.agents) this._decide(a);
    return this;
  }

  _setRobotParams() {
    const supplied = this.options.robotParams || {};
    if (typeof supplied !== 'object' || Array.isArray(supplied)) throw new TypeError('robotParams must contain tidy and/or care parameter objects.');
    for (const role of Object.keys(supplied)) if (!ROBOT_DEFAULT_PARAMS[role]) throw new RangeError(`Unknown robot role: ${role}.`);
    this.robotParams = {};
    for (const role of ['tidy', 'care']) {
      const values = supplied[role] || {};
      if (typeof values !== 'object' || Array.isArray(values)) throw new TypeError(`robotParams.${role} must be a parameter object.`);
      for (const key of Object.keys(values)) if (!ROBOT_PARAM_LIMITS[key]) throw new RangeError(`Unknown ${role} parameter: ${key}.`);
      this.robotParams[role] = {...ROBOT_DEFAULT_PARAMS[role]};
      for (const [key, value] of Object.entries(values)) {
        const {min, max} = ROBOT_PARAM_LIMITS[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min - 1e-12 || value > max + 1e-12) {
          const units = key === 'speed' ? 'm/s' : key === 'vision' ? 'metres' : 'radians';
          throw new RangeError(`${role}.${key} must be between ${min} and ${max} ${units}.`);
        }
        this.robotParams[role][key] = clamp(value, min, max);
      }
    }
  }

  _makeWorld() {
    this.walkable = (this.site.walkable || []).map(polygonOf);
    if (!this.walkable.length) throw new Error('The home needs connected walkable polygons.');
    this.obstacles = [...(this.site.buildings || []), ...(this.site.fixedObstacles || [])];
    this.occluders = this.obstacles.filter(p => p.occludes !== false);
    const points = this.walkable.flat();
    const cellSize = this.options.cellSize;
    const minX = Math.min(...points.map(p => p[0])) - cellSize;
    const minY = Math.min(...points.map(p => p[1])) - cellSize;
    const maxX = Math.max(...points.map(p => p[0])) + cellSize;
    const maxY = Math.max(...points.map(p => p[1])) + cellSize;
    const cols = Math.ceil((maxX - minX) / cellSize), rows = Math.ceil((maxY - minY) / cellSize), n = cols * rows;
    this.grid = {cols, rows, minX, minY, cellSize, blocked: new Uint8Array(n), visionBlocked: new Uint8Array(n),
      visits: new Float32Array(n), pressure: new Float32Array(n), knowledgeCounts: new Uint16Array(n), taskCounts: new Uint16Array(n),
      everObserved: new Uint8Array(n)};
    this.freeCells = [];
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(i), half = cellSize * .48;
      // Intersect whole cells: testing only centres can make a 22cm wall disappear
      // between two 50cm grid centres and incorrectly reveal the room behind it.
      const inside = this.walkable.some(poly => pointInPolygon(p.x, p.y, poly));
      this.grid.blocked[i] = !inside || this.obstacles.some(o => intersectsCell(polygonOf(o), p.x, p.y, half)) ? 1 : 0;
      this.grid.visionBlocked[i] = this.occluders.some(o => intersectsCell(polygonOf(o), p.x, p.y, half)) ? 1 : 0;
      if (!this.grid.blocked[i]) this.freeCells.push(i);
    }
    this.portals = (this.site.portals || []).map(p => ({...p, ...this._nearestFree(p.x, p.y)}));
    if (!this.portals.length) throw new Error('The home needs at least one robot dock.');
    this.landmarks = (this.site.landmarks || []).map(p => ({...p, ...this._nearestFree(p.x, p.y)}));
    // These cached physical components validate an editor placement only. Robots
    // never consult them when exploring, choosing chores or planning routes.
    this._reachableByRole = new Map();
    this._g = new Float32Array(n); this._previous = new Int32Array(n); this._seen = new Uint32Array(n); this._searchId = 0;
  }

  _physicalFree(x, y) {
    return this.walkable.some(p => pointInPolygon(x, y, p)) && !this.obstacles.some(o => pointInPolygon(x, y, polygonOf(o)));
  }

  cellAt(x, y) {
    const g = this.grid, col = Math.floor((x - g.minX) / g.cellSize), row = Math.floor((y - g.minY) / g.cellSize);
    return col < 0 || row < 0 || col >= g.cols || row >= g.rows ? -1 : row * g.cols + col;
  }

  pointAt(index) {
    const g = this.grid;
    return {x: g.minX + (index % g.cols + .5) * g.cellSize,
      y: g.minY + (Math.floor(index / g.cols) + .5) * g.cellSize};
  }

  isWalkable(x, y, radius = 0) {
    const samples = radius ? [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]] : [[0, 0]];
    return samples.every(([dx, dy]) => { const i = this.cellAt(x + dx, y + dy); return i >= 0 && !this.grid.blocked[i]; });
  }

  _nearestFree(x, y) {
    if (this.isWalkable(x, y, .22)) return {x, y};
    let closest = null, best = Infinity;
    for (const i of this.freeCells) {
      const p = this.pointAt(i), d = Math.hypot(x - p.x, y - p.y);
      if (d < best && this.isWalkable(p.x, p.y, .22)) { closest = p; best = d; }
    }
    if (!closest) throw new Error('No free floor area for a robot.');
    return closest;
  }

  _reachableForRole(role) {
    if (this._reachableByRole.has(role)) return this._reachableByRole.get(role);
    const home = this.portals.find(p => p.kind === (role === 'care' ? 'charger' : 'dock')) || this.portals[0];
    const g = this.grid, reachable = new Uint8Array(g.blocked.length), start = this.cellAt(home.x, home.y), queue = [start];
    if (start >= 0 && !g.blocked[start]) reachable[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], col = index % g.cols, row = Math.floor(index / g.cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = col + dx, y = row + dy, next = y * g.cols + x;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.rows || g.blocked[next] || reachable[next]) continue;
        reachable[next] = 1; queue.push(next);
      }
    }
    this._reachableByRole.set(role, reachable);
    return reachable;
  }

  validateTaskPosition(taskId, x, y, options = {}) {
    return this._validateTaskPositionAgainst(taskId, x, y, this.tasks, options);
  }

  _validateTaskPositionAgainst(taskId, x, y, tasks, options = {}) {
    const reject = (code, reason) => ({valid: false, code, reason, x, y});
    const task = tasks.find(t => t.id === taskId);
    if (!task) return reject('unknown-task', 'This chore is not part of the current household scenario.');
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return reject('invalid-coordinate', 'Choose a finite point on the apartment floor.');
    const minimum = options.minTaskDistance ?? TASK_POSITION_RULES.minTaskDistance;
    if (!Number.isFinite(minimum) || minimum < 0) return reject('invalid-option', 'Minimum chore spacing must be a non-negative distance.');
    if (this.cellAt(x, y) < 0 || !this.walkable.some(p => pointInPolygon(x, y, p))) return reject('outside-floor', 'Choose a point inside the apartment floor.');
    if (!this.isWalkable(x, y, TASK_POSITION_RULES.clearance - 1e-7)) return reject('blocked', 'Leave more room around walls, furniture and door edges.');
    const role = task.kind === 'clutter' ? 'tidy' : 'care';
    if (!this._reachableForRole(role)[this.cellAt(x, y)]) return reject('unreachable', 'Choose floor space connected to this robot’s dock.');
    if (this.portals.some(p => Math.hypot(p.x - x, p.y - y) < TASK_POSITION_RULES.minDockDistance)) return reject('dock-clearance', 'Keep chores at least 0.9 m from the docks.');
    if (tasks.some(t => t.id !== taskId && Math.hypot(t.x - x, t.y - y) < minimum)) return reject('chore-spacing', `Leave at least ${minimum} m between chores.`);
    const room = (this.site.rooms || []).find(r => pointInPolygon(x, y, polygonOf(r)));
    return {valid: true, code: 'valid', reason: 'Ready to place this chore.', x, y, ...(room ? {roomId: room.id} : {})};
  }

  _makeTasks() {
    this.tasks = (this.site.tasks || []).map(t => ({...t, ...this._nearestFree(t.x, t.y), work: t.work || 6,
      priority: t.priority || (t.kind === 'leak' ? 3 : t.kind === 'spill' ? 2 : 1),
      status: 'pending', robotId: null, progress: 0, discoveredBy: new Set(), discoveredAt: null, startedAt: null, completedAt: null}));
    if (this.scenario === 'afterparty') {
      const rng = seededRandom((Number(this.options.seed) || 42) + 7001);
      for (let n = 0; n < 6; n++) {
        let p;
        for (let attempt = 0; attempt < 100; attempt++) {
          p = this.pointAt(this.freeCells[Math.floor(rng() * this.freeCells.length)]);
          if (this.isWalkable(p.x, p.y, .3) && this.tasks.every(t => distance(t, p) > 1.2)
            && this.portals.every(d => distance(d, p) > 2)) break;
        }
        this.tasks.push({id: `extra-${n + 1}`, kind: n % 3 === 2 ? 'spill' : 'clutter', name: n % 3 === 2 ? 'Clean party spill' : 'Collect party clutter',
          ...p, work: n % 3 === 2 ? 8 : 5, priority: n % 3 === 2 ? 2 : 1, status: 'pending', robotId: null, progress: 0,
          discoveredBy: new Set(), discoveredAt: null, startedAt: null, completedAt: null});
      }
    }
    const overrides = this.options.taskPositions || {};
    if (typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('taskPositions must map chore IDs to {x, y} coordinates.');
    for (const id of Object.keys(overrides)) if (!this.tasks.some(t => t.id === id)) throw new RangeError(`Unknown chore position override: ${id}.`);
    const proposed = this.tasks.map(task => {
      if (!Object.prototype.hasOwnProperty.call(overrides, task.id)) return task;
      const position = overrides[task.id];
      if (!position || typeof position !== 'object') throw new TypeError(`Position for ${task.id} must contain x and y coordinates.`);
      return {...task, x: position.x, y: position.y};
    });
    // Validate all final positions together, so swapping two chores is permitted.
    for (const id of Object.keys(overrides)) {
      const task = proposed.find(t => t.id === id);
      const result = this._validateTaskPositionAgainst(id, task.x, task.y, proposed);
      if (!result.valid) throw new RangeError(`Invalid position for ${id}: ${result.reason}`);
      if (result.roomId) task.roomId = result.roomId;
      task.positionEdited = true;
    }
    this.tasks = proposed;
    this.totalTasks = this.tasks.length;
  }

  _makeRobot(index) {
    const rng = seededRandom((Number(this.options.seed) || 42) * 65537 + index * 7919 + 17);
    const spawnRng = seededRandom((Number(this.options.seed) || 42) * 19427 + index * 4621 + 29);
    const type = index % 3 === 1 ? 'care' : 'tidy';
    const home = this.portals.find(p => p.kind === (type === 'care' ? 'charger' : 'dock')) || this.portals[index % this.portals.length];
    let position = {...home};
    for (let n = 0; n < 250; n++) {
      const angle = spawnRng() * TAU, radius = .35 + Math.sqrt(spawnRng()) * (1.1 + this.options.population * .045);
      const x = home.x + Math.cos(angle) * radius, y = home.y + Math.sin(angle) * radius;
      if (this.isWalkable(x, y, .23) && !this.agents.some(a => Math.hypot(a.x - x, a.y - y) < .52)) { position = {x, y}; break; }
    }
    const hintAngle = rng() * TAU;
    const heading = -Math.PI / 2 + (rng() - .5) * 1.3;
    const nominalSpeed = type === 'tidy' ? .63 + rng() * .1 : .55 + rng() * .08;
    const settings = this.robotParams[type];
    return {
      id: `${type === 'tidy' ? 'T' : 'C'}${String(index + 1).padStart(2, '0')}`, type, ...position,
      heading, radius: .21, speed: nominalSpeed * (settings.speed / ROBOT_DEFAULT_PARAMS[type].speed),
      fov: settings.fov, vision: settings.vision,
      battery: 88 + rng() * 12, energyUsed: 0, carrying: null, tasksCompleted: 0, currentTask: null,
      known: new Set(), visible: new Set(), landmarks: new Set([home.id]), landmarkMemory: new Map([[home.id, {...home, observedAt: 0}]]),
      knownTasks: new Map(), visibleAgents: new Set(), occupants: new Map(), cellVisits: new Map(),
      path: [{x: position.x, y: position.y}], route: [], home: {...home},
      homeHint: {x: home.x + Math.cos(hintAngle) * 1.8, y: home.y + Math.sin(hintAngle) * 1.8},
      goal: null, phase: 'explore', state: 'Scanning the home', completed: false, active: true,
      distance: 0, elapsed: 0, memoryHits: 0, usedLandmarks: [], returnTrips: [], responseTimes: [],
      efficiency: 0, avoidanceEvents: 0, blockedSeconds: 0, motionLoad: 0,
      _rng: rng, _senseAt: 0, _planAt: 0, _decideAt: 0, _trailAt: 0, _scanLeft: .5 + rng() * .5,
      _stuck: 0, _scanAttempts: 0, _workLeft: 0, _returnStarted: null, _lastMove: 0, _frontierCooldown: new Map(),
      _goalConfirmed: false, _chargeTarget: 95, _destinationFound: false, _yielding: false, _yieldClearFor: 0
    };
  }

  getAgent(id) { return this.agents.find(a => a.id === id) || null; }

  _lineVisible(x0, y0, x1, y1) {
    const g = this.grid, target = this.cellAt(x1, y1), d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / (g.cellSize * .35));
    for (let n = 1; n < steps; n++) {
      const i = this.cellAt(x0 + (x1 - x0) * n / steps, y0 + (y1 - y0) * n / steps);
      if (i < 0) return false;
      if (g.visionBlocked[i]) return i === target;
    }
    return true;
  }

  canSee(a, x, y) {
    const d = Math.hypot(x - a.x, y - a.y);
    return d <= a.vision && (d < .55 || Math.abs(angleDiff(Math.atan2(y - a.y, x - a.x), a.heading)) <= a.fov / 2)
      && this._lineVisible(a.x, a.y, x, y);
  }

  _sense(a) {
    const g = this.grid, radius = Math.ceil(a.vision / g.cellSize), at = this.cellAt(a.x, a.y), cx = at % g.cols, cy = Math.floor(at / g.cols);
    const visible = new Set();
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows || dx * dx + dy * dy > radius * radius) continue;
      const i = y * g.cols + x, p = this.pointAt(i);
      if (this.canSee(a, p.x, p.y)) visible.add(i);
    }
    a.visible = visible;
    if (!this.options.memory) {
      for (const i of a.known) g.knowledgeCounts[i]--;
      a.known.clear(); a.landmarks.clear(); a.landmarkMemory.clear(); a.occupants.clear();
      for (const i of a.cellVisits.keys()) if (!visible.has(i)) a.cellVisits.delete(i);
      for (const i of a._frontierCooldown.keys()) if (!visible.has(i)) a._frontierCooldown.delete(i);
      const committed = a.currentTask && a.knownTasks.get(a.currentTask);
      a.knownTasks.clear();
      if (committed) a.knownTasks.set(committed.id, committed);
    }
    for (const i of visible) {
      // Observer-only cumulative coverage never enters a robot's route planner.
      g.everObserved[i] = 1;
      if (!a.known.has(i)) { a.known.add(i); g.knowledgeCounts[i]++; }
    }
    for (const landmark of this.landmarks.concat(this.portals)) {
      if (!this.canSee(a, landmark.x, landmark.y)) continue;
      a.landmarks.add(landmark.id); a.landmarkMemory.set(landmark.id, {...landmark, observedAt: this.time});
      if (a.phase === 'return' && landmark.id === a.home.id && !a._goalConfirmed) {
        a.goal = {...landmark, kind: 'home', approximate: false}; a._goalConfirmed = true; a._planAt = 0;
      }
    }
    for (const task of this.tasks) {
      if (!this.canSee(a, task.x, task.y) || task.status === 'carried') continue;
      const record = {id: task.id, category: 'chore', kind: task.kind, name: task.name, x: task.x, y: task.y,
        priority: task.priority, status: task.status, robotId: task.robotId, observedAt: this.time};
      a.knownTasks.set(task.id, record); a.landmarkMemory.set(task.id, record); a.landmarks.add(task.id);
      if (!task.discoveredBy.has(a.id)) {
        task.discoveredBy.add(a.id);
        if (task.discoveredAt === null) { task.discoveredAt = this.time; this._event(`${a.id} detected ${task.kind}`, a.id, task.id); }
      }
      if (a.currentTask === task.id && task.robotId !== a.id && task.status !== 'pending') {
        a.currentTask = null; a.goal = null; a.route = []; a.phase = 'explore'; a._decideAt = 0;
      }
    }
    a.visibleAgents = new Set(); a._crowdCells = new Map();
    for (const other of this.agents) {
      if (other === a || !this.canSee(a, other.x, other.y)) continue;
      a.visibleAgents.add(other.id); a.occupants.set(other.id, {id: other.id, x: other.x, y: other.y, observedAt: this.time});
      const i = this.cellAt(other.x, other.y), x = i % g.cols, y = Math.floor(i / g.cols);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const next = (y + dy) * g.cols + x + dx;
        a._crowdCells.set(next, (a._crowdCells.get(next) || 0) + (dx || dy ? .25 : 1.2));
      }
    }
    if (a.route.slice(0, 6).some(p => { const i = this.cellAt(p.x, p.y); return a.known.has(i) && g.blocked[i]; })) a._planAt = 0;
    a._senseAt = this.time + .36;
  }

  _event(message, robotId, taskId = null) {
    this.events.push({time: this.time, message, robotId, taskId});
    if (this.events.length > 200) this.events.shift();
  }

  _compatible(a, task) { return a.type === 'tidy' ? task.kind === 'clutter' : ['spill', 'leak'].includes(task.kind); }

  _decide(a) {
    if (['working', 'return', 'charge'].includes(a.phase) || a.carrying) return;
    if (a.phase === 'idle' && !this.options.memory) a._scanAttempts = 0;
    if (a.battery < 25) { this._return(a, 'recharge'); return; }
    const choices = Array.from(a.knownTasks.values()).filter(t => t.status === 'pending' && this._compatible(a, t));
    choices.sort((p, q) => {
      const value = t => a.type === 'care' ? t.priority * 10 + Math.min(this.time / 15, 10) - distance(a, t) * .7
        : -distance(a, t) - (a.cellVisits.get(this.cellAt(t.x, t.y)) || 0) * .1;
      return value(q) - value(p);
    });
    if (choices.length) {
      const task = choices[0];
      if (a.currentTask !== task.id || a.phase !== 'task') {
        const remembered = a.landmarkMemory.get(task.id);
        a.currentTask = task.id; a.goal = {...(remembered || task), kind: 'task', approximate: false};
        if (this.options.memory && remembered && !this.canSee(a, remembered.x, remembered.y)) {
          a.memoryHits++; a.usedLandmarks = [remembered.id];
        }
        a.phase = 'task'; a.state = a.type === 'care' ? `Responding to ${task.kind}` : 'Collecting a discovered object';
        a._goalConfirmed = true; a.returnAnchor = null; a._scanLeft = 0; a._planAt = 0;
        this._plan(a);
      }
    } else if (!a.goal || a.phase === 'idle' || a.phase !== 'explore') this._explore(a);
    a._decideAt = this.time + 1.2;
  }

  _explore(a) {
    const g = this.grid, candidates = [];
    for (const i of a.known) {
      if (g.blocked[i] || (a._frontierCooldown.get(i) || 0) > this.time) continue;
      const x = i % g.cols, y = Math.floor(i / g.cols), p = this.pointAt(i), d = distance(a, p);
      if (d < 1.1) continue;
      let unknown = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= g.cols || y + dy >= g.rows) continue;
        if (!a.known.has((y + dy) * g.cols + x + dx)) unknown++;
      }
      if (!unknown) continue;
      const visited = a.cellVisits.get(i) || 0;
      const individuality = Math.sin(i * .173 + Number(a.id.slice(1)) * 5.3) * .7;
      const score = unknown * 2.3 - d * .6 - visited * .7 + individuality;
      candidates.push({i, p, score});
    }
    candidates.sort((p, q) => q.score - p.score);
    if (candidates.length) {
      const selected = candidates[0];
      a.goal = {...selected.p, id: `frontier-${selected.i}`, name: 'Unexplored room edge', kind: 'explore'};
      a.phase = 'explore'; a.state = 'Mapping the next room'; a.currentTask = null; a._goalConfirmed = false;
      a._planAt = 0; a._scanAttempts = 0;
      this._plan(a);
    } else {
      a.goal = null; a.route = []; a.currentTask = null;
      if (a._scanAttempts < 2) {
        a._scanLeft = 2; a._scanAttempts++; a.phase = 'explore'; a.state = 'Scanning for a doorway';
      } else if (distance(a, a.home) > 1.2) this._return(a, 'survey');
      else { a.phase = 'idle'; a.state = 'Docked · awaiting a new discovery'; a.active = false; a._decideAt = this.time + 4; }
    }
  }

  _plan(a) {
    if (!a.goal) { a.route = []; return; }
    const g = this.grid, start = this.cellAt(a.x, a.y), target = a.returnAnchor || a.goal;
    const gx = clamp(Math.floor((target.x - g.minX) / g.cellSize), 0, g.cols - 1);
    const gy = clamp(Math.floor((target.y - g.minY) / g.cellSize), 0, g.rows - 1);
    let end = gy * g.cols + gx;
    if (a.known.has(end) && g.blocked[end]) {
      let best = Infinity;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = gx + dx, y = gy + dy, i = y * g.cols + x;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.rows || (a.known.has(i) && g.blocked[i])) continue;
        const score = dx * dx + dy * dy + (a.known.has(i) ? 0 : 1);
        if (score < best) { best = score; end = i; }
      }
    }
    const ex = end % g.cols, ey = Math.floor(end / g.cols), search = ++this._searchId, heap = new Heap();
    this._seen[start] = search; this._g[start] = 0; this._previous[start] = -1; heap.push({i: start, f: 0});
    let reached = start, nearest = Infinity, iterations = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (heap.length && iterations++ < 9000) {
      const {i} = heap.pop(), x = i % g.cols, y = Math.floor(i / g.cols), h = Math.hypot(ex - x, ey - y);
      if (h < nearest) { nearest = h; reached = i; }
      if (i === end) break;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy, next = ny * g.cols + nx;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || (a.known.has(next) && g.blocked[next])) continue;
        if (dx && dy) {
          const n1 = y * g.cols + nx, n2 = ny * g.cols + x;
          if ((a.known.has(n1) && g.blocked[n1]) || (a.known.has(n2) && g.blocked[n2])) continue;
        }
        const cost = this._g[i] + (dx && dy ? 1.4142 : 1) * (a.known.has(next) ? 1 : 1.65) + (a._crowdCells?.get(next) || 0);
        if (this._seen[next] !== search || cost < this._g[next] - .001) {
          this._seen[next] = search; this._g[next] = cost; this._previous[next] = i;
          heap.push({i: next, f: cost + Math.hypot(ex - nx, ey - ny)});
        }
      }
    }
    const route = [];
    for (let i = reached, n = 0; i !== start && i >= 0 && n++ < 2500; i = this._previous[i]) route.push(this.pointAt(i));
    a.route = route.reverse();
    const startCenter = this.pointAt(start);
    if (distance(a, startCenter) > .22) a.route.unshift(startCenter);
    a._planAt = this.time + 2 + (Number(a.id.slice(1)) % 5) * .08;
  }

  _return(a, reason = 'delivery') {
    a._returnContext = {depart: {x: a.x, y: a.y}, startedAt: this.time, taskId: a.carrying || a.currentTask || null,
      homeId: a.home.id, distanceAtStart: a.distance, energyAtStart: a.energyUsed};
    a.phase = 'return'; a._returnReason = reason; a._returnStarted = this.time; a.currentTask = null; a._scanLeft = 0;
    const remembered = this.options.memory && a.landmarkMemory.get(a.home.id);
    a.usedLandmarks = []; a.returnAnchor = null;
    if (remembered) {
      a.goal = {...remembered, kind: 'home', approximate: false}; a._goalConfirmed = true; a.usedLandmarks.push(remembered.id);
      const d = distance(a, remembered);
      const choices = Array.from(a.landmarkMemory.values()).filter(l => l.id !== a.home.id && l.kind === 'door'
        && distance(a, l) > 1.8 && distance(l, remembered) < d * .85
        && distance(a, l) + distance(l, remembered) < d * 1.65 && a.path.some(p => distance(p, l) < 1.1));
      choices.sort((p, q) => distance(a, p) + distance(p, remembered) - distance(a, q) - distance(q, remembered));
      if (choices.length) { a.returnAnchor = {...choices[0]}; a.usedLandmarks.push(choices[0].id); }
      a.memoryHits += a.usedLandmarks.length;
      a.state = a.returnAnchor ? `Returning via ${a.returnAnchor.name}` : 'Returning to remembered dock';
    } else {
      a.goal = {...a.home, ...a.homeHint, kind: 'home', approximate: true}; a._goalConfirmed = false;
      a.state = 'Locating the charging dock';
    }
    a._planAt = 0; this._plan(a);
  }

  _startWork(a, task) {
    if (task.status !== 'pending') {
      const record = a.knownTasks.get(task.id);
      if (record) Object.assign(record, {status: task.status, robotId: task.robotId});
      a.currentTask = null; a.goal = null; a.phase = 'explore'; a._decideAt = 0; return;
    }
    task.status = 'working'; task.robotId = a.id; task.startedAt = this.time;
    const record = a.knownTasks.get(task.id);
    if (record) Object.assign(record, {status: 'working', robotId: a.id});
    a.currentTask = task.id; a.phase = 'working'; a.route = []; a._workLeft = task.work;
    a.responseTimes.push(this.time); a.state = a.type === 'tidy' ? 'Grasping and sorting clutter' : task.kind === 'leak' ? 'Sealing the detected leak' : 'Cleaning the detected spill';
    this._event(`${a.id} started ${task.kind}`, a.id, task.id);
  }

  _finishWork(a) {
    const task = this.tasks.find(t => t.id === a.currentTask);
    if (!task || task.robotId !== a.id) { a.phase = 'explore'; a.goal = null; return; }
    task.progress = 1;
    if (a.type === 'tidy') {
      task.status = 'carried'; a.carrying = task.id;
      const record = a.knownTasks.get(task.id); if (record) Object.assign(record, {status: 'carried', robotId: a.id});
      this._return(a, 'delivery');
    } else {
      task.status = 'complete'; task.completedAt = this.time; a.tasksCompleted++;
      const record = a.knownTasks.get(task.id); if (record) Object.assign(record, {status: 'complete', robotId: a.id});
      this._event(`${a.id} resolved ${task.kind}`, a.id, task.id);
      this._return(a, 'service');
    }
  }

  _dock(a) {
    if (a._returnStarted !== null) {
      const context = a._returnContext || {depart: {x: a.x, y: a.y}, startedAt: a._returnStarted};
      const trip = {robotId: a.id, type: a.type, seconds: this.time - a._returnStarted, reason: a._returnReason,
        depart: {...context.depart}, startedAt: context.startedAt, completedAt: this.time,
        taskId: context.taskId || null, homeId: a.home.id, distance: a.distance - (context.distanceAtStart || 0),
        energyUsed: a.energyUsed - (context.energyAtStart || 0)};
      a.returnTrips.push(trip); this.completedReturns.push(trip); a._returnStarted = null;
    }
    if (a.carrying) {
      const task = this.tasks.find(t => t.id === a.carrying);
      if (task) {
        task.status = 'complete'; task.completedAt = this.time; a.tasksCompleted++;
        const record = a.knownTasks.get(task.id); if (record) Object.assign(record, {status: 'complete', robotId: a.id});
        this._event(`${a.id} delivered clutter`, a.id, task.id);
      }
      a.carrying = null;
    }
    a.phase = 'charge'; a.state = 'Docked · replenishing battery'; a.goal = null; a.route = []; a.currentTask = null;
    a._chargeTarget = Math.max(a.battery + 5, 96); a._chargeTarget = Math.min(100, a._chargeTarget);
    a._chargeLeft = 3;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let rest = Math.min(dt, 5);
    while (rest > .000001) { const slice = Math.min(rest, .1); this._tick(slice); rest -= slice; }
  }

  _tick(dt) {
    this.time += dt;
    for (const a of this.agents) {
      a.elapsed += dt; a.active = a.phase !== 'idle';
      if (this.time >= a._senseAt) this._sense(a);
      if (a.phase === 'charge') {
        a.battery = Math.min(100, a.battery + 3.5 * dt); a._chargeLeft -= dt;
        if (a.battery >= a._chargeTarget && a._chargeLeft <= 0) {
          a.phase = 'explore'; a.goal = null; a._scanAttempts = 0; a._decideAt = 0; a.state = 'Ready for the next chore';
        }
        this._record(a, dt, 0, 0, true); continue;
      }
      if (a.phase === 'working') {
        a._workLeft -= dt;
        const task = this.tasks.find(t => t.id === a.currentTask);
        if (task) task.progress = clamp(1 - a._workLeft / task.work, 0, 1);
        this._energy(a, dt * .28);
        this._record(a, dt, 0, 0, true);
        if (a._workLeft <= 0) this._finishWork(a);
        continue;
      }
      if (this.time >= a._decideAt) this._decide(a);
      if (a._scanLeft > 0) {
        a.heading += dt * 3.2; a._scanLeft -= dt; this._energy(a, dt * .035);
        this._record(a, dt, 0, 0, true);
        if (a._scanLeft <= 0) { this._sense(a); this._decide(a); if (!a.goal) this._explore(a); }
        continue;
      }
      if (a.phase === 'idle' || !a.goal) { this._energy(a, dt * .008); this._record(a, dt, 0, 0, true); continue; }
      if (a.returnAnchor && distance(a, a.returnAnchor) < .7) { a.returnAnchor = null; a._planAt = 0; a.state = 'Returning to remembered dock'; }
      if (this.time >= a._planAt || !a.route.length) this._plan(a);
      while (a.route.length && distance(a, a.route[0]) < .18) a.route.shift();
      const waypoint = a.route[0] || a.goal;
      let dx = waypoint.x - a.x, dy = waypoint.y - a.y, len = Math.hypot(dx, dy);
      if (len) { dx /= len; dy /= len; }
      const desiredSpeed = a.speed * (a.carrying ? .82 : 1) * (a.battery < 12 ? .65 : 1);
      let vx = dx * desiredSpeed, vy = dy * desiredSpeed, crowd = 0;
      const neighbours = this.agents.filter(b => b !== a && distance(a, b) < 1.7);
      let yielding = false;
      for (const b of neighbours) {
        const rx = a.x - b.x, ry = a.y - b.y, d = Math.hypot(rx, ry);
        if (d < .9) crowd += 1 - d / .9;
        if (d < .85 && d > .0001) {
          const force = Math.pow(1 - d / .85, 2) * 2.8;
          vx += rx / d * force; vy += ry / d * force;
          yielding = true;
        }
        const ahead = (b.x - a.x) * dx + (b.y - a.y) * dy;
        if (ahead > 0 && ahead < 1.25 && d < 1.1) { vx += dy * .22; vy -= dx * .22; yielding = true; }
      }
      if (yielding) {
        if (!a._yielding) a.avoidanceEvents++;
        a._yielding = true; a._yieldClearFor = 0;
      } else {
        a._yieldClearFor += dt;
        if (a._yieldClearFor > 1) a._yielding = false;
      }
      const speed = Math.hypot(vx, vy);
      if (speed > desiredSpeed * 1.12) { vx *= desiredSpeed * 1.12 / speed; vy *= desiredSpeed * 1.12 / speed; }
      a.heading += clamp(angleDiff(Math.atan2(vy, vx), a.heading), -4.5 * dt, 4.5 * dt);
      const before = {x: a.x, y: a.y};
      const clear = (x, y) => this.isWalkable(x, y, a.radius) && !neighbours.some(b => Math.hypot(x - b.x, y - b.y) < a.radius + b.radius - .02
        && Math.hypot(x - b.x, y - b.y) < distance(a, b));
      const nx = a.x + vx * dt, ny = a.y + vy * dt;
      if (clear(nx, ny)) { a.x = nx; a.y = ny; }
      else if (clear(nx, a.y)) a.x = nx;
      else if (clear(a.x, ny)) a.y = ny;
      const moved = distance(a, before); a.distance += moved; a._lastMove = moved / dt;
      this._energy(a, dt * .025 + moved * (a.carrying ? .29 : .22));
      this._record(a, dt, crowd, moved / dt, false);
      if (moved / dt < desiredSpeed * .1) a._stuck += dt; else a._stuck = Math.max(0, a._stuck - dt);
      if (a._stuck > 1.8) this._recover(a, neighbours);
      if (this.time >= a._trailAt) {
        if (distance(a, a.path[a.path.length - 1]) > .12) a.path.push({x: a.x, y: a.y});
        if (a.path.length > 2000) a.path.shift();
        a._trailAt = this.time + .2;
      }
      const cell = this.cellAt(a.x, a.y);
      a.cellVisits.set(cell, (a.cellVisits.get(cell) || 0) + dt);
      if (a.phase === 'task') {
        const task = this.tasks.find(t => t.id === a.currentTask);
        if (task && distance(a, task) < .7 && this._lineVisible(a.x, a.y, task.x, task.y)) this._startWork(a, task);
      } else if (a.phase === 'return' && distance(a, a.home) < .9 && a._goalConfirmed) this._dock(a);
      else if (a.phase === 'explore' && distance(a, a.goal) < .55) {
        a._frontierCooldown.set(this.cellAt(a.goal.x, a.goal.y), this.time + 15);
        a.goal = null; a.route = []; a._scanLeft = 1.9; a._scanAttempts = 0; a.state = 'Scanning a new room';
      } else if (a.phase === 'return' && !a._goalConfirmed && distance(a, a.goal) < .55) {
        a._scanLeft = 1.9; a.heading += .8; a._senseAt = 0;
      }
    }
    if (this.time >= this._historyAt) {
      const m = this.getMetrics(false);
      this.history.push({time: this.time, completedTasks: m.completedTasks, completed: m.completedTasks, meanBattery: m.meanBattery,
        energyUsed: m.energyUsed, exploration: m.exploration, efficiency: m.efficiency});
      if (this.history.length > 900) this.history.shift();
      this._historyAt = this.time + 1;
    }
  }

  _recover(a, neighbours) {
    if (!a._yielding) a.avoidanceEvents++;
    a._yielding = true; a._yieldClearFor = 0;
    this._sense(a);
    const candidates = Array.from(a.visible).filter(i => !this.grid.blocked[i]).map(i => this.pointAt(i))
      .filter(p => distance(a, p) > .65 && distance(a, p) < 1.5 && this._lineVisible(a.x, a.y, p.x, p.y));
    const quality = p => neighbours.reduce((sum, b) => sum + Math.max(0, 1.2 - distance(p, b)), 0) + distance(p, a.goal) * .02;
    candidates.sort((p, q) => quality(p) - quality(q));
    this._plan(a);
    if (candidates.length) a.route.unshift(candidates[0]);
    a._planAt = this.time + 1.5; a._stuck = .3;
    if (!candidates.length) { a._scanLeft = 1.4; a.heading += 1; }
  }

  _energy(a, amount) {
    a.energyUsed += amount; a.battery = clamp(a.battery - amount, 0, 100);
    a.efficiency = a.tasksCompleted / Math.max(.1, a.energyUsed);
  }

  _record(a, dt, crowd, speed, voluntary) {
    if (!voluntary && speed < a.speed * .2) a.blockedSeconds += dt;
    a.motionLoad = voluntary ? 0 : clamp(crowd * 50 + (1 - speed / a.speed) * 50, 0, 100);
    const i = this.cellAt(a.x, a.y);
    if (i >= 0) { this.grid.visits[i] += dt; this.grid.pressure[i] += a.motionLoad * dt; }
  }

  getMetrics(includeHistory = true) {
    const complete = this.tasks.filter(t => t.status === 'complete');
    const service = complete.filter(t => t.kind !== 'clutter');
    const knownFree = this.freeCells.filter(i => this.grid.knowledgeCounts[i] > 0).length;
    const everObservedFree = this.freeCells.filter(i => this.grid.everObserved[i]).length;
    const energyUsed = this.agents.reduce((sum, a) => sum + a.energyUsed, 0);
    const group = type => {
      const robots = this.agents.filter(a => a.type === type), tasks = complete.filter(t => robots.some(a => a.id === t.robotId));
      return {count: robots.length, completedTasks: tasks.length, energyUsed: robots.reduce((s, a) => s + a.energyUsed, 0),
        meanBattery: mean(robots.map(a => a.battery)), meanDistance: mean(robots.map(a => a.distance)),
        meanReturnTime: mean(this.completedReturns.filter(t => t.type === type).map(t => t.seconds))};
    };
    return {time: this.time, active: this.agents.filter(a => a.phase !== 'idle').length, completed: complete.length,
      completedTasks: complete.length, totalTasks: this.tasks.length, pendingTasks: this.tasks.length - complete.length,
      discoveredTasks: this.tasks.filter(t => t.discoveredAt !== null).length,
      completedReturns: this.completedReturns.length, meanReturnTime: mean(this.completedReturns.map(t => t.seconds)),
      meanDistance: mean(this.agents.map(a => a.distance)), totalDistance: this.agents.reduce((sum, a) => sum + a.distance, 0),
      energyUsed, energyPerTask: complete.length ? energyUsed / complete.length : null,
      avoidanceEvents: this.agents.reduce((sum, a) => sum + a.avoidanceEvents, 0),
      yieldEvents: this.agents.reduce((sum, a) => sum + a.avoidanceEvents, 0),
      blockedSeconds: this.agents.reduce((sum, a) => sum + a.blockedSeconds, 0),
      meanBattery: mean(this.agents.map(a => a.battery)), exploration: this.freeCells.length ? everObservedFree / this.freeCells.length * 100 : 0,
      retainedCoverage: this.freeCells.length ? knownFree / this.freeCells.length * 100 : 0, everObservedFree,
      efficiency: complete.length / Math.max(.1, energyUsed), meanResponseTime: mean(service.map(t => t.startedAt)),
      taskCompletionTimes: complete.map(t => ({id: t.id, kind: t.kind, seconds: t.completedAt, robotId: t.robotId})),
      memoryUses: this.agents.reduce((sum, a) => sum + a.memoryHits, 0), history: includeHistory ? this.history : [],
      byType: {tidy: group('tidy'), care: group('care')}};
  }
}
