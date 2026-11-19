/* HOMEFRAME / Moxy circulation design lab. Deterministic model, not measured hotel operations. */
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

export const MODEL = Object.freeze({cellSize: .5, guestSpeed: 1.22, robotSpeed: .82, guestVision: 8, robotVision: 6,
  guestFov: Math.PI * .84, robotFov: Math.PI * .72, guestDwell: 7, deliveryService: 3, arrivalWindow: 60});

export class Simulation {
  constructor(site, options = {}) {
    this.site = site;
    this.options = {seed: 42, guests: 24, robots: 4, deliveries: 8, memory: true, cellSize: MODEL.cellSize, ...options};
    this.reset();
  }

  reset(options = {}) {
    this.options = {...this.options, ...options}; this.design = this.site.design;
    this.time = 0; this.history = []; this.events = []; this.memoryEvents = []; this.returnTrips = []; this._historyAt = 0;
    this.floorZ = this.site.floorZ ?? 0; this.floorId = 'ground-public';
    this._makeWorld(); this._makeDemands(); this.agents = [];
    this.passages = new Map(this.doors.map(d => [d.id, {id: d.id, name: d.name, events: 0, waitSeconds: 0, throughput: 0}]));
    for (let i = 0; i < this.demands.guests.length; i++) this.agents.push(this._makeAgent('guest', i));
    for (let i = 0; i < this.options.robots; i++) this.agents.push(this._makeAgent('robot', i));
    for (const a of this.agents) if (a.spawned) { this._sense(a); this._activate(a); }
    this._demandMetrics = null;
    return this;
  }

  _makeWorld() {
    this.walkable = this.site.walkable.map(polygonOf);
    this.obstacles = [...(this.site.buildings || []), ...(this.site.fixedObstacles || [])].map(o => { const polygon = polygonOf(o); return {...o, polygon, minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])), minY: Math.min(...polygon.map(p => p[1])), maxY: Math.max(...polygon.map(p => p[1]))}; });
    this.occluders = this.obstacles.filter(o => o.occludes !== false);
    this.rooms = this.site.rooms || []; this.doors = this.site.doors || [];
    this.regions = (this.site.regions || []).map(r => ({...r, center: {x: mean(r.polygon.map(p => p[0])), y: mean(r.polygon.map(p => p[1]))}}));
    const all = this.walkable.flat(), size = this.options.cellSize;
    const minX = Math.min(...all.map(p => p[0])) - size, minY = Math.min(...all.map(p => p[1])) - size;
    const cols = Math.ceil((Math.max(...all.map(p => p[0])) - minX + size) / size);
    const rows = Math.ceil((Math.max(...all.map(p => p[1])) - minY + size) / size), n = cols * rows;
    const waits = new Float32Array(n);
    this.grid = {cols, rows, minX, minY, cellSize: size, blocked: new Uint8Array(n), visionBlocked: new Uint8Array(n),
      visits: new Float32Array(n), wait: waits, pressure: waits, roleVisits: {guest: new Float32Array(n), robot: new Float32Array(n)},
      knowledgeCounts: new Uint16Array(n), everObserved: new Uint8Array(n)};
    this.freeCells = [];
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(i), half = size * .48;
      this.grid.blocked[i] = this.isWalkable(p.x, p.y, .27) ? 0 : 1;
      this.grid.visionBlocked[i] = this.occluders.some(o => intersectsCell(polygonOf(o), p.x, p.y, half)) ? 1 : 0;
      if (!this.grid.blocked[i]) this.freeCells.push(i);
    }
    this.portals = this.site.portals.map(p => ({...p, ...this._nearestFree(p.x, p.y)}));
    this.dock = this.portals.find(p => p.kind === 'dock');
    this.pickup = {...this.site.pickup, ...this._nearestFree(this.site.pickup.x, this.site.pickup.y)};
    if (!this.dock) throw new Error('The design needs a dispatch dock.');
    this.destinations = this.site.destinations.map(p => ({...p, ...this._nearestFree(p.x, p.y)}));
    this.landmarkDefinitions = [...(this.site.landmarks || []), ...this.portals, ...this.destinations].map(l => ({...l, ...this._nearestFree(l.x, l.y)}));
    this._g = new Float64Array(n); this._previous = new Int32Array(n); this._seen = new Uint32Array(n); this._searchId = 0;
    this._networkFields = new Map();
    this._regionCells = new Map(this.regions.map(r => [r.id, new Set(this.freeCells.filter(i => { const p = this.pointAt(i); return pointInPolygon(p.x, p.y, r.polygon); }))]));
  }

  cellAt(x, y) {
    const g = this.grid, col = Math.floor((x - g.minX) / g.cellSize), row = Math.floor((y - g.minY) / g.cellSize);
    return col < 0 || row < 0 || col >= g.cols || row >= g.rows ? -1 : row * g.cols + col;
  }

  pointAt(index) {
    const g = this.grid;
    return {x: g.minX + (index % g.cols + .5) * g.cellSize, y: g.minY + (Math.floor(index / g.cols) + .5) * g.cellSize};
  }

  isWalkable(x, y, radius = 0) {
    // Continuous physical geometry checks the body; the planner reads only sensed grid cells.
    for (let k = 0; k < (radius ? 8 : 1); k++) {
      const px = x + (radius ? Math.cos(k * Math.PI / 4) * radius : 0), py = y + (radius ? Math.sin(k * Math.PI / 4) * radius : 0);
      if (!this.walkable.some(poly => pointInPolygon(px, py, poly))) return false;
    }
    for (const o of this.obstacles) {
      if (x + radius < o.minX || x - radius > o.maxX || y + radius < o.minY || y - radius > o.maxY) continue;
      if (pointInPolygon(x, y, o.polygon)) return false;
      for (let j = 0; j < o.polygon.length; j++) {
        const [ax, ay] = o.polygon[j], [bx, by] = o.polygon[(j + 1) % o.polygon.length], dx = bx - ax, dy = by - ay;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < radius) return false;
      }
    }
    return true;
  }

  _nearestFree(x, y) {
    if (this.isWalkable(x, y, .27)) return {x, y};
    let best = null, shortest = Infinity;
    for (const i of this.freeCells) { const p = this.pointAt(i), d = Math.hypot(x - p.x, y - p.y);
      if (d < shortest && this.isWalkable(p.x, p.y, .27)) { best = p; shortest = d; } }
    if (!best) throw new Error('No navigable floor in this design.');
    return best;
  }

  _makeDemands() {
    const rng = seededRandom(Number(this.options.seed) || 42), entrances = this.portals.filter(p => p.kind === 'entrance');
    const guestGoals = this.destinations.filter(d => d.kind !== 'delivery-goal');
    const robotGoals = this.destinations.filter(d => d.kind !== 'guest-goal');
    const guests = [], deliveries = [];
    for (let i = 0; i < this.options.guests; i++) {
      const origin = entrances[i % entrances.length], target = guestGoals[Math.floor(rng() * guestGoals.length)];
      guests.push({id: `G${String(i + 1).padStart(2, '0')}`, arrivalTime: i < 6 ? 0 : +(6 + rng() * 54).toFixed(1),
        originId: origin.id, destinationId: target.id, destinationRoomId: target.roomId, dwellSeconds: 5 + rng() * 5, deadline: 95});
    }
    for (let i = 0; i < this.options.deliveries; i++) {
      const target = robotGoals[Math.floor(rng() * robotGoals.length)];
      deliveries.push({id: `D${String(i + 1).padStart(2, '0')}`, releaseTime: i < this.options.robots ? 0 : +(8 + (i - this.options.robots) * 9 + rng() * 4).toFixed(1),
        destinationId: target.id, destinationRoomId: target.roomId, deadline: 150});
    }
    this.demands = {guests, deliveries};
    this.tasks = deliveries.map(d => ({...this.destinations.find(t => t.id === d.destinationId), ...d, kind: 'delivery', name: `Deliver to ${this.destinations.find(t => t.id === d.destinationId).name}`, id: d.id, status: 'queued', robotId: null,
      claimedAt: null, deliveredAt: null, completedAt: null, progress: 0}));
  }

  _makeAgent(type, index) {
    const id = type === 'guest' ? this.demands.guests[index].id : `R${String(index + 1).padStart(2, '0')}`;
    const rng = seededRandom((Number(this.options.seed) || 42) * 65537 + (type === 'guest' ? 0 : 10000) + index * 7919 + 17);
    const demand = type === 'guest' ? this.demands.guests[index] : null;
    const origin = type === 'guest' ? this.portals.find(p => p.id === demand.originId) : this.dock;
    let p = {x: origin.x, y: origin.y};
    for (let attempt = 0; attempt < 150; attempt++) {
      const theta = rng() * TAU, radius = Math.sqrt(rng()) * (type === 'guest' ? 1.9 : 1.8), x = origin.x + Math.cos(theta) * radius, y = origin.y + Math.sin(theta) * radius;
      if (this.isWalkable(x, y, .27) && !this.agents.some(a => a.spawned && Math.hypot(a.x - x, a.y - y) < .54)) { p = {x, y}; break; }
    }
    const home = type === 'robot' ? {...origin, ...p, id: `parking-${id}`, name: `${origin.name} / ${id} parking`, roomId: this.rooms.find(r => pointInPolygon(p.x, p.y, r.polygon))?.id || origin.roomId} : {...origin};
    const a = {id, type, ...p, z: this.floorZ, heading: rng() * TAU, radius: type === 'guest' ? .22 : .27,
      speed: type === 'guest' ? 1.12 + rng() * .2 : .76 + rng() * .12,
      vision: type === 'guest' ? MODEL.guestVision : MODEL.robotVision, fov: type === 'guest' ? MODEL.guestFov : MODEL.robotFov,
      spawnTime: demand?.arrivalTime || 0, spawned: !demand || demand.arrivalTime === 0, completed: false, active: true,
      demand, origin: {...origin}, home, phase: type === 'guest' ? 'outbound' : 'dispatch', state: 'Arriving', goal: null, actualTarget: null,
      known: new Set(), visible: new Set(), landmarks: new Set([home.id]), landmarkMemory: new Map([[home.id, {...home, observedAt: 0}]]),
      knownRooms: new Set([origin.roomId]), knownDoors: new Map(), roomGraph: new Map(), knownRegions: new Set(), occupants: new Map(), visibleAgents: new Set(),
      path: [{x: p.x, y: p.y}], route: [], routeRooms: [], navigationAnchor: null,
      distance: 0, elapsed: 0, waitSeconds: 0, dwellSeconds: 0, scanSeconds: 0, energyUsed: 0, battery: 100,
      tasksCompleted: 0, deliveries: 0, carrying: null, currentTask: null, yieldEvents: 0, avoidanceEvents: 0, bayUses: 0,
      memoryHits: 0, usedLandmarks: [], returnTrips: [], location: null,
      _rng: rng, _senseAt: 0, _planAt: 0, _trailAt: 0, _stuck: 0, _searchCount: 0, _scanLeft: .5 + rng() * .5,
      _dwellLeft: 0, _workLeft: 0, _goalConfirmed: false, _yielding: false, _yieldClearFor: 0, _tripStarted: null,
      _memoryUseKeys: new Set(), _lastPassage: null, _holding: null, _lastMove: 0};
    a.location = this._location(a);
    return a;
  }

  _activate(a) {
    if (a.type === 'guest') this._setGoal(a, this.destinations.find(d => d.id === a.demand.destinationId), 'outbound');
    else if (distance(a, a.home) > 1.1) this._setGoal(a, a.home, 'dispatch');
    else this._claimDelivery(a);
  }

  _location(a) {
    const room = this.rooms.find(r => pointInPolygon(a.x, a.y, r.polygon));
    const near = this.doors.reduce((best, d) => !best || distance(a, d) < distance(a, best) ? d : best, null);
    const origin = room?.origin || {x: 0, y: 0};
    return {world: {x: a.x, y: a.y, z: this.floorZ, floorId: this.floorId},
      semantic: {roomId: room?.id || 'circulation', roomName: room?.name || 'Connecting circulation',
        u: a.x - origin.x, v: a.y - origin.y, nearestDoorId: near?.id || null, routeRooms: [...a.routeRooms]}};
  }

  _setGoal(a, target, phase) {
    a.actualTarget = {...target}; a.phase = phase; a._searchCount = 0; a._memoryUseKeys.clear();
    const remembered = this.options.memory && a.landmarkMemory.get(target.id);
    if (remembered) {
      a.goal = {...remembered, approximate: false}; a._goalConfirmed = true;
      this._useMemory(a, remembered, phase === 'return' ? 'return-origin' : 'destination-recall');
    } else {
      const theta = a._rng() * TAU, error = 1.3 + a._rng() * 1.8;
      a.goal = {...target, x: target.x + Math.cos(theta) * error, y: target.y + Math.sin(theta) * error, approximate: true};
      a._goalConfirmed = false;
    }
    a._hint = {x: a.goal.x, y: a.goal.y};
    a.state = phase === 'return' ? (this.options.memory ? 'Returning by remembered places' : 'Finding the return destination') : phase === 'dispatch' ? 'Approaching base' : phase === 'to-pickup' ? 'Finding the fixed kitchen pickup' : a.type === 'guest' ? `Finding ${target.name}` : `Delivering to ${target.name}`;
    a.navigationAnchor = null; a.route = []; a._planAt = 0; this._sense(a); this._plan(a);
  }

  _useMemory(a, landmark, kind) {
    if (!this.options.memory || !landmark || landmark.observedAt >= this.time - .2) return;
    const key = `${kind}:${landmark.id}`;
    if (a._memoryUseKeys.has(key)) return;
    a._memoryUseKeys.add(key); a.memoryHits++; a.usedLandmarks.push(landmark.id);
    this.memoryEvents.push({time: this.time, agentId: a.id, landmarkId: landmark.id, kind, fromRoom: a.location?.semantic.roomId, toRoom: a.actualTarget?.roomId});
  }

  _claimDelivery(a) {
    if (distance(a, a.home) > 1.1) return;
    const job = this.tasks.find(t => t.status === 'queued' && t.releaseTime <= this.time);
    if (!job) { a.phase = 'dispatch'; a.goal = null; a.route = []; a.state = 'At dispatch · awaiting an order'; return; }
    job.status = 'collecting'; job.robotId = a.id; job.claimedAt = this.time;
    a.carrying = null; a.currentTask = job.id; a._tripStarted = this.time; a._tripWaitStart = a.waitSeconds;
    a._tripStartPose = {x: a.x, y: a.y}; a._tripStartDistance = a.distance;
    this._setGoal(a, this.pickup, 'to-pickup');
  }

  _lineVisible(x0, y0, x1, y1) {
    const target = this.cellAt(x1, y1), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (this.grid.cellSize * .35));
    for (let k = 1; k < n; k++) {
      const i = this.cellAt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
      if (i < 0) return false;
      if (this.grid.visionBlocked[i]) return i === target;
    }
    return true;
  }

  canSee(a, x, y) {
    const d = Math.hypot(x - a.x, y - a.y);
    return d <= a.vision && (d < .55 || Math.abs(angleDiff(Math.atan2(y - a.y, x - a.x), a.heading)) <= a.fov / 2) && this._lineVisible(a.x, a.y, x, y);
  }

  _sense(a) {
    const g = this.grid, r = Math.ceil(a.vision / g.cellSize), cell = this.cellAt(a.x, a.y), cx = cell % g.cols, cy = Math.floor(cell / g.cols), visible = new Set();
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows || dx * dx + dy * dy > r * r) continue;
      const index = y * g.cols + x, p = this.pointAt(index);
      if (this.canSee(a, p.x, p.y)) visible.add(index);
    }
    if (!this.options.memory) {
      for (const i of a.known) g.knowledgeCounts[i]--;
      a.known.clear(); a.landmarks.clear(); a.landmarkMemory.clear(); a.knownDoors.clear(); a.knownRooms.clear(); a.knownRegions.clear(); a.occupants.clear();
    }
    a.visible = visible;
    for (const i of visible) { g.everObserved[i] = 1; if (!a.known.has(i)) { a.known.add(i); g.knowledgeCounts[i]++; } }
    a.location = this._location(a); a.knownRooms.add(a.location.semantic.roomId);
    for (const l of this.landmarkDefinitions) if (this.canSee(a, l.x, l.y)) {
      a.landmarks.add(l.id); a.landmarkMemory.set(l.id, {...l, observedAt: this.time});
      if (l.roomId) a.knownRooms.add(l.roomId);
    }
    for (const d of this.doors) if (this.canSee(a, d.x, d.y)) {
      a.knownDoors.set(d.id, {...d, observedAt: this.time});
      a.landmarks.add(d.id); a.landmarkMemory.set(d.id, {...d, kind: 'door', observedAt: this.time});
      d.connects.forEach(id => a.knownRooms.add(id));
    }
    a.roomGraph = new Map();
    for (const d of a.knownDoors.values()) for (const from of d.connects) for (const to of d.connects) if (from !== to) {
      if (!a.roomGraph.has(from)) a.roomGraph.set(from, new Map());
      a.roomGraph.get(from).set(to, d.id);
    }
    for (const region of this.regions) if (pointInPolygon(a.x, a.y, region.polygon) || this.canSee(a, region.center.x, region.center.y)) a.knownRegions.add(region.id);
    if (a.actualTarget && this.canSee(a, a.actualTarget.x, a.actualTarget.y)) {
      a.landmarks.add(a.actualTarget.id); a.landmarkMemory.set(a.actualTarget.id, {...a.actualTarget, kind: 'destination', observedAt: this.time});
      if (!a._goalConfirmed) { a.goal = {...a.actualTarget, approximate: false}; a._goalConfirmed = true; a._planAt = 0; }
    }
    a.visibleAgents = new Set(); a._crowdCells = new Map();
    for (const b of this.agents) if (b !== a && b.spawned && !b.completed && this.canSee(a, b.x, b.y)) {
      a.visibleAgents.add(b.id); a.occupants.set(b.id, {id: b.id, type: b.type, x: b.x, y: b.y, observedAt: this.time});
      const i = this.cellAt(b.x, b.y), col = i % g.cols, row = Math.floor(i / g.cols);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const next = (row + dy) * g.cols + col + dx;
        a._crowdCells.set(next, (a._crowdCells.get(next) || 0) + (dx || dy ? .25 : 1.4));
      }
    }
    if (a.route.slice(0, 7).some(p => { const i = this.cellAt(p.x, p.y); return a.known.has(i) && g.blocked[i]; })) a._planAt = 0;
    a._senseAt = this.time + .4;
  }

  _topologicalRoute(a) {
    const from = a.location.semantic.roomId, to = a.actualTarget?.roomId;
    if (!to || from === to) return {rooms: from ? [from] : [], doors: []};
    const queue = [from], previous = new Map([[from, null]]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const at = queue[cursor]; if (at === to) break;
      for (const [next, doorId] of a.roomGraph.get(at) || []) if (!previous.has(next)) { previous.set(next, {room: at, doorId}); queue.push(next); }
    }
    if (!previous.has(to)) return {rooms: [], doors: []};
    const rooms = [to], doors = [];
    for (let at = to; at !== from;) { const edge = previous.get(at); doors.push(edge.doorId); at = edge.room; rooms.push(at); }
    return {rooms: rooms.reverse(), doors: doors.reverse()};
  }

  _plan(a) {
    if (!a.goal) { a.route = []; return; }
    a.location = this._location(a);
    const topology = this._topologicalRoute(a); a.routeRooms = topology.rooms;
    let target = a._holding?.point || a.goal;
    a.navigationAnchor = null;
    if (!a._holding) for (const id of topology.doors) {
      const door = a.knownDoors.get(id);
      if (door && distance(a, door) > 1) { a.navigationAnchor = door; target = door; this._useMemory(a, door, 'door-route'); break; }
    }
    const g = this.grid, start = this.cellAt(a.x, a.y);
    const gx = clamp(Math.floor((target.x - g.minX) / g.cellSize), 0, g.cols - 1), gy = clamp(Math.floor((target.y - g.minY) / g.cellSize), 0, g.rows - 1);
    let end = gy * g.cols + gx;
    if (a.known.has(end) && g.blocked[end]) {
      let best = Infinity;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = gx + dx, y = gy + dy, i = y * g.cols + x;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.rows || (a.known.has(i) && g.blocked[i])) continue;
        const score = dx * dx + dy * dy + (a.known.has(i) ? 0 : 1);
        if (score < best) { best = score; end = i; }
      }
    }
    const ex = end % g.cols, ey = Math.floor(end / g.cols), search = ++this._searchId, heap = new Heap();
    this._seen[start] = search; this._g[start] = 0; this._previous[start] = -1; heap.push({i: start, f: 0});
    let reached = start, nearest = Infinity, iterations = 0;
    while (heap.length && iterations++ < 16000) {
      const {i} = heap.pop(), x = i % g.cols, y = Math.floor(i / g.cols), h = Math.hypot(ex - x, ey - y);
      if (h < nearest) { nearest = h; reached = i; } if (i === end) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * g.cols + nx;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || (a.known.has(next) && g.blocked[next])) continue;
        if (dx && dy) { const n1 = y * g.cols + nx, n2 = ny * g.cols + x;
          if ((a.known.has(n1) && g.blocked[n1]) || (a.known.has(n2) && g.blocked[n2])) continue; }
        let factor = a.known.has(next) ? 1 : 1.6;
        if (a.known.has(next)) for (const r of this.regions) if (a.knownRegions.has(r.id) && r.roles.includes(a.type) && this._regionCells.get(r.id).has(next)) factor *= r.costFactor || 1;
        const cost = this._g[i] + (dx && dy ? Math.SQRT2 : 1) * factor + (a._crowdCells?.get(next) || 0);
        if (this._seen[next] !== search || cost < this._g[next] - .0001) {
          this._seen[next] = search; this._g[next] = cost; this._previous[next] = i;
          heap.push({i: next, f: cost + Math.hypot(ex - nx, ey - ny) * .7});
        }
      }
    }
    const route = [];
    for (let i = reached, n = 0; i !== start && i >= 0 && n++ < 3500; i = this._previous[i]) route.push(this.pointAt(i));
    a.route = route.reverse();
    a._planAt = this.time + 2.4 + Number(a.id.slice(1)) % 5 * .08;
  }

  _priority(a) {
    if (a.type !== 'robot' || !['outbound', 'return', 'to-pickup'].includes(a.phase)) return false;
    const seenGuests = this.agents.filter(b => b.type === 'guest' && b.spawned && !b.completed && this.canSee(a, b.x, b.y));
    const priorityZone = this.regions.find(r => r.effect === 'guest-priority' && a.knownRegions.has(r.id) && pointInPolygon(a.x, a.y, r.polygon));
    const conflicting = seenGuests.filter(b => distance(a, b) < (priorityZone ? 2.8 : 1.65)
      && Math.cos(angleDiff(Math.atan2(b.y - a.y, b.x - a.x), a.heading)) > -.2);
    if (a._holding) {
      const nearby = seenGuests.some(b => distance(b, a._holding.encounter) < 2.4);
      if (nearby) a._holding.clearAt = this.time + 1.1;
      if ((!nearby && this.time >= a._holding.clearAt) || (a._holding.until && this.time >= a._holding.until)) { a._holding = null; a._planAt = 0; a.state = 'Resuming the service route'; return false; }
      return distance(a, a._holding.point) < .6;
    }
    if (!conflicting.length) return false;
    const bay = this.regions.filter(r => r.effect === 'holding-bay' && a.knownRegions.has(r.id) && distance(a, r.center) < 5)
      .sort((p, q) => distance(a, p.center) - distance(a, q.center))[0];
    if (bay) {
      const occupants = this.agents.filter(b => b !== a && b.type === 'robot' && b._holding?.regionId === bay.id).length;
      if (occupants < (bay.capacity || 1)) {
        const candidates = [...this._regionCells.get(bay.id)].filter(i => a.known.has(i)).map(i => this.pointAt(i))
          .filter(p => this.isWalkable(p.x, p.y, a.radius) && this.agents.every(b => b === a || !b.spawned || b.completed || distance(b, p) > .65));
        candidates.sort((p, q) => distance(a, p) - distance(a, q));
        if (candidates.length) { a._holding = {regionId: bay.id, point: candidates[0], encounter: {x: a.x, y: a.y}, clearAt: this.time + 1.2};
          a.bayUses++; this._beginYield(a); a.state = `Yielding in ${bay.name}`; a._planAt = 0; return false; }
      }
    }
    this._beginYield(a);
    if (this.time - a._yieldStarted > 3.5) {
      const candidates = [...a.visible].filter(i => !this.grid.blocked[i]).map(i => this.pointAt(i))
        .filter(p => distance(a, p) > .9 && distance(a, p) < 2.1 && this.isWalkable(p.x, p.y, a.radius)
          && this.agents.every(b => b === a || !b.spawned || b.completed || distance(b, p) > .7));
      const score = p => Math.min(...conflicting.map(b => distance(p, b))) - distance(a, p) * .15;
      candidates.sort((p, q) => score(q) - score(p));
      if (candidates.length) { a._holding = {regionId: null, point: candidates[0], encounter: {x: a.x, y: a.y}, clearAt: this.time + 1, until: this.time + 5}; a._planAt = 0; a.state = 'Backing away to release the crossing'; a._yieldStarted = this.time; return false; }
    }
    a.state = 'Giving guests crossing priority'; return true;
  }

  _beginYield(a) {
    if (!a._yielding) {
      a.yieldEvents++; a.avoidanceEvents++; a._yielding = true; a._yieldStarted = this.time;
      const near = this.doors.reduce((best, d) => !best || distance(a, d) < distance(a, best) ? d : best, null);
      a._yieldPassage = near && distance(a, near) < 5 ? near.id : null;
      if (a._yieldPassage) this.passages.get(a._yieldPassage).events++;
    }
    a._yieldClearFor = 0;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 5);
    while (remaining > 1e-7) { const slice = Math.min(remaining, .1); this._tick(slice); remaining -= slice; }
  }

  _tick(dt) {
    this.time += dt;
    for (const a of this.agents) {
      if (a.completed) continue;
      if (!a.spawned) {
        if (this.time < a.spawnTime) continue;
        if (this.agents.some(b => b !== a && b.spawned && !b.completed && distance(a, b) < .5)) continue;
        a.spawned = true; this._sense(a); this._activate(a);
      }
      a.elapsed += dt; a.active = true; a.location = this._location(a);
      if (this.time >= a._senseAt) this._sense(a);
      if (a.phase === 'dispatch' && !a.goal) { this._claimDelivery(a); a.active = a.phase !== 'dispatch'; this._record(a, dt, false); continue; }
      if (a.phase === 'pickup' || a.phase === 'service') {
        a._workLeft -= dt; a.energyUsed += dt * .035; a.battery = Math.max(0, 100 - a.energyUsed);
        if (a._workLeft <= 0) {
          if (a.phase === 'pickup') { const task = this.tasks.find(t => t.id === a.currentTask); task.status = 'carried'; task.pickedUpAt = this.time; a.carrying = task.id; this._setGoal(a, this.destinations.find(d => d.id === task.destinationId), 'outbound'); }
          else { const task = this.tasks.find(t => t.id === a.currentTask); task.status = 'delivered'; task.deliveredAt = this.time; task.progress = 1; a.deliveries++; a.carrying = null; this._setGoal(a, a.home, 'return'); }
        }
        this._record(a, dt, false); continue;
      }
      if (a.phase === 'visit') {
        a._dwellLeft -= dt; a.dwellSeconds += dt;
        if (a._dwellLeft <= 0) this._setGoal(a, a.origin, 'return');
        this._record(a, dt, false); continue;
      }
      if (a._scanLeft > 0) { a.heading += dt * 3.2; a._scanLeft -= dt; a.scanSeconds += dt; this._record(a, dt, false); continue; }
      if (!a.goal) continue;
      const priorityStop = this._priority(a);
      if (this.time >= a._planAt || !a.route.length || (a.navigationAnchor && distance(a, a.navigationAnchor) < .85)) this._plan(a);
      while (a.route.length && distance(a, a.route[0]) < .06) a.route.shift();
      const waypoint = a.route[0] || a._holding?.point || a.goal;
      let dx = waypoint.x - a.x, dy = waypoint.y - a.y, d = Math.hypot(dx, dy);
      if (d) { dx /= d; dy /= d; }
      let speedFactor = 1;
      for (const r of this.regions) if (r.roles.includes(a.type) && pointInPolygon(a.x, a.y, r.polygon)) speedFactor *= r.speedFactor || 1;
      const desired = a.speed * speedFactor, neighbours = this.agents.filter(b => b !== a && b.spawned && !b.completed && distance(a, b) < 1.8 && this._lineVisible(a.x, a.y, b.x, b.y));
      let vx = dx * Math.min(desired, d / dt), vy = dy * Math.min(desired, d / dt), yieldNeeded = priorityStop || !!a._holding;
      for (const b of neighbours) {
        const rx = a.x - b.x, ry = a.y - b.y, separation = Math.hypot(rx, ry), radius = a.type === 'robot' ? 1.05 : .9;
        if (separation < radius && separation > .0001) { const force = Math.pow(1 - separation / radius, 2) * 3.4; vx += rx / separation * force; vy += ry / separation * force; yieldNeeded = true; }
        const ahead = (b.x - a.x) * dx + (b.y - a.y) * dy;
        if (ahead > 0 && ahead < 1.4 && separation < 1.2 && this.isWalkable(a.x + dy * .35, a.y - dx * .35, a.radius)) { vx += dy * .22; vy -= dx * .22; }
      }
      if (yieldNeeded) this._beginYield(a); else { a._yieldClearFor += dt; if (a._yieldClearFor > 1) { a._yielding = false; a._yieldPassage = null; } }
      const velocity = Math.hypot(vx, vy);
      if (velocity > desired * 1.12) { vx *= desired * 1.12 / velocity; vy *= desired * 1.12 / velocity; }
      if (priorityStop) { vx = 0; vy = 0; }
      if (vx || vy) a.heading += clamp(angleDiff(Math.atan2(vy, vx), a.heading), -4.5 * dt, 4.5 * dt);
      const before = {x: a.x, y: a.y};
      const clear = (x, y) => this.isWalkable(x, y, a.radius) && !neighbours.some(b => Math.hypot(x - b.x, y - b.y) < a.radius + b.radius - .02 && Math.hypot(x - b.x, y - b.y) < distance(a, b));
      const nx = a.x + vx * dt, ny = a.y + vy * dt;
      if (clear(nx, ny)) { a.x = nx; a.y = ny; }
      else if (clear(nx, a.y)) a.x = nx;
      else if (clear(a.x, ny)) a.y = ny;
      const moved = distance(a, before); a.distance += moved; a._lastMove = moved / dt;
      if (a.type === 'robot') { a.energyUsed += moved * .08 + dt * .006; a.battery = Math.max(0, 100 - a.energyUsed); }
      const waiting = priorityStop || moved / dt < desired * .18;
      if (waiting) { a.waitSeconds += dt; if (a._yieldPassage) this.passages.get(a._yieldPassage).waitSeconds += dt; }
      if (!priorityStop && moved / dt < desired * .12) a._stuck += dt; else a._stuck = Math.max(0, a._stuck - dt);
      if (a._stuck > 2) this._recover(a, neighbours);
      this._record(a, dt, waiting);
      if (this.time >= a._trailAt) { if (distance(a, a.path[a.path.length - 1]) > .18) a.path.push({x: a.x, y: a.y}); if (a.path.length > 2200) a.path.shift(); a._trailAt = this.time + .3; }
      const previousRoom = a.location.semantic.roomId; a.location = this._location(a);
      if (previousRoom !== a.location.semantic.roomId) {
        const passage = this.doors.find(t => t.connects.includes(previousRoom) && t.connects.includes(a.location.semantic.roomId));
        if (passage) this.passages.get(passage.id).throughput++;
        a._planAt = 0;
      }
      if (!a._holding && a.actualTarget && a._goalConfirmed && distance(a, a.actualTarget) < (a.type === 'robot' && a.phase === 'return' ? .25 : .85) && this._semanticArrival(a)) this._arrive(a);
      else if (!a._goalConfirmed && distance(a, a.goal) < .6) {
        a._scanLeft = 1.9; a._searchCount++; a._planAt = 0;
        const theta = a._searchCount * 2.39996, radius = Math.min(4, 1 + a._searchCount * .5);
        a.goal = {...a.goal, x: a._hint.x + Math.cos(theta) * radius, y: a._hint.y + Math.sin(theta) * radius};
      }
    }
    if (this.time >= this._historyAt) {
      const m = this.getMetrics(false);
      this.history.push({time: this.time, guestsCompleted: m.guestsCompleted, deliveriesCompleted: m.deliveriesCompleted, totalWait: m.totalWait,
        meanGuestWait: m.meanGuestWait, meanRobotWait: m.meanRobotWait, exploration: m.exploration});
      if (this.history.length > 600) this.history.shift(); this._historyAt = this.time + 1;
    }
  }

  _semanticArrival(a) {
    const goalRoom = a.actualTarget.roomId, current = a.location.semantic.roomId;
    if (!goalRoom || current === goalRoom) return true;
    return [...a.knownDoors.values()].some(d => d.connects.includes(current) && d.connects.includes(goalRoom) && distance(a, d) < 1.4);
  }

  _arrive(a) {
    a.landmarks.add(a.actualTarget.id); a.landmarkMemory.set(a.actualTarget.id, {...a.actualTarget, observedAt: this.time});
    if (a.type === 'guest') {
      if (a.phase === 'outbound') { a.phase = 'visit'; a._dwellLeft = a.demand.dwellSeconds; a.state = `Visiting ${a.actualTarget.name}`; a.route = []; }
      else { a.completed = true; a.active = false; a.state = 'Visit complete · returned to arrival'; a.route = []; a.completedAt = this.time; }
    } else if (a.phase === 'to-pickup') { a.phase = 'pickup'; a._workLeft = 1.8; a.state = 'Collecting at the fixed kitchen'; a.route = []; }
    else if (a.phase === 'outbound') { a.phase = 'service'; a._workLeft = MODEL.deliveryService; a.state = 'Handing over the delivery'; a.route = []; }
    else {
      if (a.currentTask) {
        const task = this.tasks.find(t => t.id === a.currentTask); task.status = 'complete'; task.completedAt = this.time;
        const trip = {robotId: a.id, taskId: task.id, startedAt: a._tripStarted, completedAt: this.time, seconds: this.time - a._tripStarted,
          waitSeconds: a.waitSeconds - a._tripWaitStart, distance: a.distance - a._tripStartDistance, depart: {...a._tripStartPose}};
        a.returnTrips.push(trip); this.returnTrips.push(trip); a.tasksCompleted++; a.currentTask = null;
      }
      a.goal = null; a.phase = 'dispatch'; a.route = []; a._holding = null; a.state = 'At dispatch'; this._claimDelivery(a);
    }
  }

  _recover(a, neighbours) {
    this._sense(a); this._beginYield(a);
    const candidates = [...a.visible].filter(i => !this.grid.blocked[i]).map(i => this.pointAt(i))
      .filter(p => distance(a, p) > .7 && distance(a, p) < 1.8 && this._lineVisible(a.x, a.y, p.x, p.y));
    const score = p => neighbours.reduce((sum, b) => sum + Math.max(0, 1.3 - distance(p, b)), 0) + distance(p, a.goal) * .03;
    candidates.sort((p, q) => score(p) - score(q)); this._plan(a);
    if (candidates.length) a.route.unshift(candidates[0]); else { a._scanLeft = 1.3; a.heading += 1; }
    a._planAt = this.time + 1.8; a._stuck = .2;
  }

  _record(a, dt, waiting) {
    const i = this.cellAt(a.x, a.y); if (i < 0) return;
    this.grid.visits[i] += dt; this.grid.roleVisits[a.type][i] += dt; if (waiting) this.grid.wait[i] += dt;
  }

  euclideanDistance(from, to) { return Math.hypot(from.x - to.x, from.y - to.y, (from.z ?? this.floorZ) - (to.z ?? this.floorZ)); }

  _networkCell(p) {
    const raw = this.cellAt(p.x, p.y);
    if (raw >= 0 && !this.grid.blocked[raw]) return raw;
    // Observer metric snaps physical positions between nodes to the nearest navigable node.
    let closest = -1, best = Infinity;
    for (const i of this.freeCells) { const q = this.pointAt(i), d = distance(p, q); if (d < best) { best = d; closest = i; } }
    return closest;
  }

  networkDistance(from, to) {
    const start = this._networkCell(from), end = this._networkCell(to), g = this.grid;
    if (start < 0 || end < 0) return null;
    if (!this._networkFields.has(end)) {
      const values = new Float64Array(g.blocked.length); values.fill(Infinity); values[end] = 0;
      const heap = new Heap(); heap.push({i: end, f: 0});
      while (heap.length) {
        const node = heap.pop(); if (node.f > values[node.i] + 1e-9) continue;
        const x = node.i % g.cols, y = Math.floor(node.i / g.cols);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx, ny = y + dy, i = ny * g.cols + nx;
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || g.blocked[i]) continue;
          if (dx && dy && (g.blocked[y * g.cols + nx] || g.blocked[ny * g.cols + x])) continue;
          const length = node.f + g.cellSize * (dx && dy ? Math.SQRT2 : 1);
          if (length < values[i] - 1e-9) { values[i] = length; heap.push({i, f: length}); }
        }
      }
      this._networkFields.set(end, values);
    }
    const result = this._networkFields.get(end)[start]; return Number.isFinite(result) ? result : null;
  }

  getAgent(id) { return this.agents.find(a => a.id === id) || null; }

  describeAgent(id) {
    const a = this.getAgent(id); if (!a) return null;
    const target = a.actualTarget || a.home;
    return {id: a.id, type: a.type, state: a.state, phase: a.phase, goal: a.actualTarget ? {id: target.id, name: target.name, roomId: target.roomId} : null,
      location: this._location(a), distances: {euclidean: this.euclideanDistance(a, target), network: this.networkDistance(a, target), travelled: a.distance},
      performance: {elapsed: a.elapsed, waitSeconds: a.waitSeconds, deliveries: a.deliveries, yields: a.yieldEvents, energyUsed: a.energyUsed},
      knowledge: {cells: a.known.size, landmarks: a.landmarks.size, rooms: a.knownRooms.size, doors: a.knownDoors.size},
      spawned: a.spawned, completed: a.completed};
  }

  getMetrics(includeHistory = true) {
    const guests = this.agents.filter(a => a.type === 'guest'), spawned = guests.filter(a => a.spawned), completed = guests.filter(a => a.completed), robots = this.agents.filter(a => a.type === 'robot');
    if (!this._demandMetrics) {
      const pairs = this.demands.guests.map(d => [this.portals.find(p => p.id === d.originId), this.destinations.find(t => t.id === d.destinationId)])
        .concat(this.demands.deliveries.map(d => [this.dock, this.destinations.find(t => t.id === d.destinationId)]));
      this._demandMetrics = {euclidean: mean(pairs.map(([p, q]) => this.euclideanDistance(p, q))), network: mean(pairs.map(([p, q]) => this.networkDistance(p, q)).filter(x => x !== null))};
    }
    const role = list => ({count: list.length, completed: list.filter(a => a.completed).length, meanWait: mean(list.map(a => a.waitSeconds)),
      meanDistance: mean(list.map(a => a.distance)), yieldEvents: list.reduce((s, a) => s + a.yieldEvents, 0)});
    return {time: this.time, totalGuests: guests.length, guestsSpawned: spawned.length, guestsCompleted: completed.length,
      totalDeliveries: this.tasks.length, deliveriesCompleted: this.tasks.filter(t => t.deliveredAt !== null).length, robotRoundTrips: this.returnTrips.length,
      activeGuests: spawned.filter(a => !a.completed).length, activeRobots: robots.filter(a => a.phase !== 'dispatch' || a.goal).length,
      meanGuestTripTime: mean(completed.map(a => a.elapsed)), meanRobotTripTime: mean(this.returnTrips.map(t => t.seconds)),
      meanGuestWait: mean(spawned.map(a => a.waitSeconds)), meanRobotWait: mean(robots.map(a => a.waitSeconds)),
      totalWait: this.agents.reduce((s, a) => s + a.waitSeconds, 0), totalDistance: this.agents.reduce((s, a) => s + a.distance, 0),
      energyUsed: robots.reduce((s, a) => s + a.energyUsed, 0), yieldEvents: this.agents.reduce((s, a) => s + a.yieldEvents, 0), bayUses: robots.reduce((s, a) => s + a.bayUses, 0),
      exploration: this.freeCells.filter(i => this.grid.everObserved[i]).length / this.freeCells.length * 100,
      retainedCoverage: this.freeCells.filter(i => this.grid.knowledgeCounts[i] > 0).length / this.freeCells.length * 100,
      meanEuclideanDistance: this._demandMetrics.euclidean, meanNetworkDistance: this._demandMetrics.network,
      contestedPassages: [...this.passages.values()].filter(p => p.events || p.waitSeconds || p.throughput).sort((a, b) => b.waitSeconds - a.waitSeconds),
      history: includeHistory ? this.history : [], byType: {guest: role(spawned), robot: {...role(robots), deliveriesCompleted: this.tasks.filter(t => t.deliveredAt !== null).length,
        roundTrips: this.returnTrips.length, meanTripTime: mean(this.returnTrips.map(t => t.seconds))}}};
  }
}

