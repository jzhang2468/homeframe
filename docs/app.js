import { WORLD } from './world.js';
import { Simulation } from './simulation.js';
import { CityView } from './scene.js';
import { DEFAULT_SETUP, ExperimentControls } from './experiment-controls.js';

const $ = id => document.getElementById(id);
const TICK = 0.1;
const LIMIT = 240;
const speeds = [1, 2, 4, 8, 16];
const layers = {
  sensors: 'The selected robot’s sensor field and the space it has mapped.',
  paths: 'Every robot’s route, drawn together. Color shows which crew took each path.',
  traffic: 'Repeated visits build up at thresholds, around obstacles and near the docks.',
};
const roles = {
  tidy: { label: 'TIDY', goal: 'Discover nearby clutter and deliver it to the sorting dock.', color: '#5fe6ff' },
  care: { label: 'CARE', goal: 'Detect spills and leaks. Service urgent chores before returning to charge.', color: '#ffad76' },
};
let config = structuredClone(DEFAULT_SETUP);
let experiments;
let editorScene;
let sim;
let view;
let selectedId;
let currentLayer = 'sensors';
let playing = false;
let complete = false;
let speed = 1;
let accumulator = 0;
let lastFrame = performance.now();
let lastUI = 0;
let comparison;
let comparisonRun;
let toastTimer;
const knowledgeContext = $('knowledge').getContext('2d');

const asClock = t => {
  const second = Math.floor(t + 0.0001);
  return String(Math.floor(second / 60)).padStart(2, '0') + ':' + String(second % 60).padStart(2, '0');
};
const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const titleCase = value => {
  const clean = String(value ?? '').replaceAll('-', ' ').replaceAll('_', ' ');
  return clean ? clean[0].toUpperCase() + clean.slice(1) : 'Exploring';
};
const label = a => {
  const index = sim.agents.indexOf(a) + 1;
  return roles[a.type].label + ' / ' + String(index).padStart(2, '0');
};
const byId = id => sim?.agents.find(agent => agent.id === id);
const visibleCount = known => known?.size ?? 0;

function announce(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2700);
}

function changeTab(tab, focus = false) {
  if (tab !== 'setup') experiments?.finishEdit();
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', active);
    button.tabIndex = active ? 0 : -1;
    $('panel-' + button.dataset.tab).hidden = !active;
    if (active && focus) button.focus();
  }
  updateUI();
}

function selectAgent(id, reveal = true) {
  const agent = byId(id);
  if (!agent) return;
  selectedId = id;
  $('agent-select').value = id;
  view?.select(id);
  if (reveal) changeTab('robot');
  else updateRobot(agent);
}

function refreshTransport() {
  const text = complete ? 'Replay' : playing ? 'Pause' : sim?.time > 0 ? 'Resume' : 'Run';
  $('play-label').textContent = text;
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', text + ' simulation');
  const status = complete ? 'complete' : playing ? 'running' : sim?.time > 0 ? 'paused' : 'ready';
  $('run-status').dataset.status = status;
  $('run-status').querySelector('span').textContent = status === 'complete' ? 'TRIAL COMPLETE' : status.toUpperCase();
}

function startTrial(run = false) {
  sim = new Simulation(WORLD, config);
  accumulator = 0;
  lastFrame = performance.now();
  complete = false;
  playing = run;
  const choices = sim.agents.map(agent => new Option(label(agent), agent.id));
  $('agent-select').replaceChildren(...choices);
  selectedId = byId(selectedId)?.id ?? sim.agents[0].id;
  view?.setSimulations(sim);
  view?.setLayer(currentLayer);
  selectAgent(selectedId, false);
  $('trial-id').textContent = 'SEED ' + config.seed;
  refreshTransport();
  updateUI();
  view?.render();
}

function tickTrial() {
  if (experiments?.editing) return;
  if (playing && sim) {
    playing = false;
  } else if (complete) {
    startTrial(true);
    return;
  } else {
    playing = true;
  }
  lastFrame = performance.now();
  refreshTransport();
}

function agentTask(agent) {
  const task = agent.currentTask ?? agent.taskId ?? agent.carrying;
  return typeof task === 'string' ? sim.tasks.find(item => item.id === task) : task;
}

function savedLandmarks(agent) {
  return [...(agent.landmarkMemory?.values?.() ?? [])];
}

function drawPrivateMap(agent) {
  const canvas = $('knowledge');
  const ctx = knowledgeContext;
  const { width, height } = canvas;
  const grid = sim.grid;
  if (!ctx || !grid) return;
  ctx.fillStyle = '#0b111a';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min((width - 44) / grid.cols, (height - 26) / grid.rows);
  const left = (width - grid.cols * scale) / 2;
  const top = (height - grid.rows * scale) / 2;
  const mapWidth = grid.cols * scale;
  const mapHeight = grid.rows * scale;
  ctx.fillStyle = '#101a27';
  ctx.fillRect(left, top, mapWidth, mapHeight);
  ctx.strokeStyle = '#263247';
  ctx.lineWidth = 1;
  ctx.strokeRect(left - .5, top - .5, mapWidth + 1, mapHeight + 1);
  for (const index of agent.known ?? []) {
    const i = Array.isArray(index) ? index[0] : index;
    const seen = agent.visible?.has(i);
    const blocked = agent.knownBlocked ? agent.knownBlocked.has(i) : Boolean(grid.blocked[i]);
    ctx.fillStyle = blocked ? (seen ? '#a0aaba' : '#636e80') : (seen ? '#78dce8' : '#2c526c');
    ctx.fillRect(left + i % grid.cols * scale, top + (grid.rows - 1 - Math.floor(i / grid.cols)) * scale, scale + .25, scale + .25);
  }

  const point = p => [
    left + (p.x - grid.minX) / grid.cellSize * scale,
    top + mapHeight - (p.y - grid.minY) / grid.cellSize * scale,
  ];
  for (const task of agent.knownTasks?.values?.() ?? []) {
    if (task.status === 'complete' || task.status === 'carried') continue;
    const cell = sim.cellAt(task.x, task.y);
    if (!agent.known?.has(cell)) continue;
    const [x, y] = point(task);
    ctx.strokeStyle = task.kind === 'clutter' ? '#dfff89' : '#ffad76';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  }
  for (const mark of savedLandmarks(agent)) {
    if (!Number.isFinite(mark.x) || !Number.isFinite(mark.y)) continue;
    const [x, y] = point(mark);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#bc9bff';
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
  }
  for (const other of agent.occupants?.values?.() ?? []) {
    if (!Number.isFinite(other.x) || !Number.isFinite(other.y)) continue;
    const [x, y] = point(other);
    ctx.fillStyle = '#ffad76';
    ctx.globalAlpha = Math.max(.35, 1 - (sim.time - other.observedAt) / 24);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const [x, y] = point(agent);
  ctx.fillStyle = roles[agent.type].color;
  ctx.strokeStyle = '#f4fdff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 5.3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(agent.heading) * 13, y - Math.sin(agent.heading) * 13);
  ctx.stroke();
}

function updateRobot(agent) {
  if (!agent || $('panel-robot').hidden) return;
  const role = roles[agent.type];
  const task = agentTask(agent);
  const marks = savedLandmarks(agent);
  const using = agent.returnAnchor ?? (agent.phase === 'return' && agent.usedLandmarks?.length ? agent.landmarkMemory.get(agent.usedLandmarks[0]) : undefined);
  $('robot-role').dataset.type = agent.type;
  $('role-name').textContent = role.label;
  $('role-objective').textContent = role.goal;
  $('robot-parameters-live').textContent = number(agent.speed, 2) + ' m/s · ' +
    number(agent.vision, 1) + ' m range · ' + number(agent.fov * 180 / Math.PI, 1) + '° view';
  $('agent-action').textContent = sim.time < TICK / 2 ? 'Waiting to start' : titleCase(agent.state ?? agent.phase);
  $('agent-target').textContent = (task?.name ?? agent.goal?.name ?? (using?.name ? 'Navigating via ' + using.name : null)) ?? 'Scanning for a destination';
  $('agent-battery').textContent = number(agent.battery) + '%';
  $('agent-map-count').textContent = visibleCount(agent.known) + ' cells';
  $('agent-tasks').textContent = agent.tasksCompleted ?? 0;
  $('map-mode').textContent = config.memory ? 'MEMORY ON' : 'LOCAL SENSING ONLY';
  $('landmark-label').textContent = config.memory ? 'SAVED LANDMARKS' : 'VISIBLE LANDMARKS';
  $('map-mark-label').textContent = config.memory ? 'Saved' : 'Landmark';
  $('landmark-count').textContent = marks.length;
  const entries = marks.slice(-3).reverse().map(mark => '◇  ' + (mark.name || titleCase(mark.id)));
  if (using?.name) entries.unshift('↳ Using ' + using.name);
  else if (agent.memoryHits) entries.unshift('↳ Reused ' + agent.memoryHits + (agent.memoryHits === 1 ? ' landmark' : ' landmarks'));
  if (!entries.length) entries.push(config.memory ? 'Awaiting first observation.' : 'No landmarks are retained in this run.');
  $('landmark-log').replaceChildren(...entries.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  drawPrivateMap(agent);
}

function updateUI() {
  if (!sim) return;
  const m = sim.getMetrics();
  const memory = m.memoryUses ?? m.landmarkReuses ?? m.memoryHits ?? sim.agents.reduce((sum, agent) => sum + (agent.memoryHits ?? 0), 0);
  const yields = m.yields ?? m.robotYields ?? m.avoidanceEvents ?? sim.agents.reduce((sum, agent) => sum + (agent.yields ?? agent.avoidanceEvents ?? 0), 0);
  $('clock').value = asClock(m.time);
  $('total-tasks').textContent = m.completedTasks + ' / ' + m.totalTasks;
  $('total-map').textContent = number(m.exploration) + '%';
  $('total-reuse').textContent = memory;
  $('total-yields').textContent = yields;
  updateRobot(byId(selectedId));
  if (!$('panel-chores').hidden) updateChores(m);
}

function updateChores(metrics) {
  $('detected-count').value = metrics.discoveredTasks + ' / ' + metrics.totalTasks + ' detected';
  const statusLabels = { complete: 'Resolved', carried: 'In transit', working: 'In service', pending: 'Detected' };
  const rows = sim.tasks.map(task => {
    const state = task.discoveredAt == null ? 'Undetected' : (statusLabels[task.status] ?? 'Detected');
    const li = document.createElement('li');
    const status = document.createElement('span');
    status.dataset.state = state;
    status.textContent = state;
    const name = document.createElement('strong');
    name.textContent = task.name;
    const kind = document.createElement('small');
    kind.textContent = titleCase(task.kind) + (task.robotId ? ' · ' + task.robotId : '');
    li.append(name, status, kind);
    return li;
  });
  $('chore-board').replaceChildren(...rows);
}

function renderComparison() {
  const { a: on, b: off, matchedReturn, mode } = comparison;
  const time = (value, count) => count ? number(value, 1) + ' s' : '—';
  const rows = [
    ['Chores completed', on.completedTasks + '/' + on.totalTasks, off.completedTasks + '/' + off.totalTasks],
    ...(mode === 'ab' ? [
      ['TIDY completed', on.byType.tidy.completedTasks, off.byType.tidy.completedTasks],
      ['CARE completed', on.byType.care.completedTasks, off.byType.care.completedTasks],
      ['Yield episodes', on.yieldEvents, off.yieldEvents],
    ] : []),
    ['Returns completed', on.completedReturns, off.completedReturns],
    ['Mean completed return', time(on.meanReturnTime, on.completedReturns), time(off.meanReturnTime, off.completedReturns)],
    ['Travel per robot', number(on.meanDistance, 1) + ' m', number(off.meanDistance, 1) + ' m'],
    ['Energy per chore', number(on.energyPerTask, 1), number(off.energyPerTask, 1)],
    ['Area discovered', number(on.exploration, 1) + '%', number(off.exploration, 1) + '%'],
  ];
  const labels = mode === 'ab' ? ['SETUP A', 'SETUP B'] : ['MEMORY', 'NO MEMORY'];
  $('comparison').innerHTML = '<table class="compare-table"><thead><tr><th scope="col">METRIC</th><th scope="col">' + labels[0] +
    '</th><th scope="col">' + labels[1] + '</th></tr></thead><tbody>' +
    rows.map(([metric, onValue, offValue]) => '<tr><th scope="row">' + metric + '</th><td>' + onValue + '</td><td>' + offValue + '</td></tr>').join('') +
    '</tbody></table><p class="muted">Return time includes completed trips only. Energy is in model battery units. Results describe this simulated trial.</p>';
  if (matchedReturn) {
    const callout = document.createElement('p');
    callout.className = 'matched-return';
    const { retained, local } = matchedReturn;
    callout.textContent = retained.robotId + ' · same chore and departure: ' + number(retained.seconds, 1) + ' s with memory / ' + number(local.seconds, 1) + ' s without.';
    $('comparison').append(callout);
  }
  $('comparison').hidden = false;
}

function matchReturn(on, off) {
  const returns = on.agents.flatMap(robot => robot.returnTrips).sort((a, b) => a.startedAt - b.startedAt);
  for (const retained of returns) {
    if (!retained.taskId) continue;
    const local = off.agents.find(robot => robot.id === retained.robotId)?.returnTrips.find(trip =>
      trip.taskId === retained.taskId && trip.homeId === retained.homeId &&
      Math.abs(trip.startedAt - retained.startedAt) < TICK / 2 &&
      Math.hypot(trip.depart.x - retained.depart.x, trip.depart.y - retained.depart.y) < .02);
    if (local) return { retained, local };
  }
  return null;
}

function clearComparison() {
  comparisonRun?.abort();
  comparisonRun = undefined;
  comparison = undefined;
  $('comparison').hidden = true;
  $('compare-progress').textContent = '';
  experiments.setComparing(false);
}

function runComparison(mode) {
  if (comparisonRun && !comparisonRun.signal.aborted) return;
  const configurations = mode === 'ab'
    ? structuredClone(experiments.slots)
    : { a: { ...structuredClone(config), memory: true }, b: { ...structuredClone(config), memory: false } };
  if (!configurations.a || !configurations.b) return;
  let a, b;
  try {
    a = new Simulation(WORLD, configurations.a);
    b = new Simulation(WORLD, configurations.b);
  } catch (error) {
    announce(error.message);
    return;
  }
  const run = new AbortController();
  comparisonRun = run;
  experiments.setComparing(true);
  $('comparison').hidden = true;
  const label = mode === 'ab' ? 'Running setups A and B' : 'Running both memory settings';
  $('compare-progress').textContent = label + '…';
  const steps = Math.round(LIMIT / TICK);
  let step = 0;
  function process() {
    if (run.signal.aborted) return;
    const until = performance.now() + 11;
    while (step < steps && performance.now() < until) {
      a.step(TICK);
      b.step(TICK);
      step++;
    }
    if (step < steps) {
      $('compare-progress').textContent = label + ' · ' + Math.floor(step / steps * 100) + '%';
      setTimeout(process, 0);
      return;
    }
    comparison = {
      mode, configurations, horizon: LIMIT, a: a.getMetrics(), b: b.getMetrics(),
      matchedReturn: mode === 'memory' ? matchReturn(a, b) : null,
    };
    comparisonRun = undefined;
    $('compare-progress').textContent = (mode === 'ab' ? 'SETUPS A / B' : 'MEMORY ON / OFF · SEED ' + config.seed) + ' · ' + LIMIT + ' s EACH';
    experiments.setComparing(false);
    renderComparison();
  }
  setTimeout(process, 0);
}

function showEditor() {
  playing = false;
  accumulator = 0;
  view?.top();
  view?.select(null);
  view?.setLayer('editor');
  view?.setEditing(true);
  $('run-status').dataset.status = 'editing';
  $('run-status').querySelector('span').textContent = 'EDITING';
  $('orbit-hint').textContent = 'DRAG A CHORE · SCROLL TO ZOOM';
  $('layer-note').textContent = 'Changes apply to the setup. Use Run this setup to send robots to the new chore locations.';
}

function renderEditor(preview, id) {
  if (editorScene !== preview) {
    editorScene = preview;
    view?.setSimulations(preview);
  }
  view?.selectTask(id);
  view?.render();
}

function hideEditor() {
  editorScene = undefined;
  view?.setEditing(false);
  view?.setSimulations(sim);
  view?.select(selectedId);
  view?.setLayer(currentLayer);
  view?.resetCamera();
  $('layer-note').textContent = layers[currentLayer];
  $('layer-note').removeAttribute('data-invalid');
  $('orbit-hint').textContent = 'DRAG TO ORBIT · SCROLL TO ZOOM';
  refreshTransport();
}

function exportRun() {
  const report = {
    experiment: 'HOMEFRAME',
    assumptions: 'Fictional 20 × 15 m test apartment. Agent sensing and battery use are simulated.',
    configuration: { ...config, timeLimit: LIMIT, timeStep: TICK },
    metrics: sim.getMetrics(),
    savedSetups: structuredClone(experiments.slots),
    comparison: comparison ?? null,
    pairedMemoryTest: comparison?.mode === 'memory' ? {
      seed: comparison.configurations.a.seed,
      population: comparison.configurations.a.population,
      scenario: comparison.configurations.a.scenario,
      horizon: comparison.horizon,
      on: comparison.a,
      off: comparison.b,
      matchedReturn: comparison.matchedReturn,
    } : null,
    robots: sim.agents.map(a => ({
      id: a.id, type: a.type, battery: a.battery, distance: a.distance, chores: a.tasksCompleted,
      landmarks: savedLandmarks(a), landmarkReuses: a.memoryHits, path: a.path,
    })),
    chores: sim.tasks.map(t => ({ id: t.id, kind: t.kind, x: t.x, y: t.y, status: t.status, discoveredBy: [...(t.discoveredBy ?? [])] })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'homeframe-seed-' + config.seed + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Trial data exported.');
}

function setup() {
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => changeTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = ['robot', 'setup', 'chores', 'results'];
      const index = tabs.indexOf(button.dataset.tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      event.preventDefault();
      changeTab(tabs[next], true);
    });
  }
  $('agent-select').addEventListener('change', e => selectAgent(e.target.value, false));
  $('play').addEventListener('click', tickTrial);
  $('reset').addEventListener('click', () => { startTrial(false); announce('Reset to the beginning of the same trial.'); });
  $('step').addEventListener('click', () => {
    if (complete) return;
    playing = false;
    accumulator = 0;
    for (let i = 0; i < 50 && !complete; i++) advanceTick();
    refreshTransport();
    updateUI();
    view?.render();
  });
  $('speed').addEventListener('click', () => {
    speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    $('speed').textContent = speed + '×';
  });
  $('setup-shortcut').addEventListener('click', () => {
    changeTab('setup', true);
  });
  $('protocol').addEventListener('click', () => $('protocol-dialog').showModal());
  $('top').addEventListener('click', () => view?.top());
  $('iso').addEventListener('click', () => view?.resetCamera());
  $('zoom-in').addEventListener('click', () => view?.zoom(1.2));
  $('zoom-out').addEventListener('click', () => view?.zoom(1 / 1.2));
  $('compare').addEventListener('click', () => runComparison('memory'));
  $('compare-ab').addEventListener('click', () => runComparison('ab'));
  $('export').addEventListener('click', exportRun);
  for (const button of document.querySelectorAll('[data-layer]')) {
    button.addEventListener('click', () => {
      currentLayer = button.dataset.layer;
      for (const item of document.querySelectorAll('[data-layer]')) {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', item === button);
      }
      view?.setLayer(currentLayer);
      $('layer-note').textContent = layers[currentLayer];
    });
  }
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && experiments.editing && !$('protocol-dialog').open) {
      experiments.finishEdit(true);
      return;
    }
    if (event.code !== 'Space' || event.repeat || $('protocol-dialog').open ||
        event.target.closest?.('button,input,select,textarea,a,[contenteditable]')) return;
    event.preventDefault();
    tickTrial();
  });
}

function advanceTick() {
  sim.step(TICK);
  if (sim.time >= LIMIT - 0.001) {
    complete = true;
    playing = false;
    refreshTransport();
  }
}

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, .06);
  lastFrame = now;
  if (playing && !document.hidden) {
    accumulator += delta * speed;
    let step = 0;
    while (accumulator >= TICK && step < 18 && !complete) {
      advanceTick();
      accumulator -= TICK;
      step++;
    }
  }
  view?.render();
  if (now - lastUI > 185) {
    updateUI();
    lastUI = now;
  }
  requestAnimationFrame(frame);
}

experiments = new ExperimentControls({
  start: next => {
    if (comparison?.mode === 'memory' || comparisonRun) clearComparison();
    config = next;
    startTrial(true);
    changeTab('robot');
    announce('Trial started with seed ' + config.seed + '.');
  },
  showEditor, hideEditor, renderEditor, onSlotsChange: clearComparison, notify: announce,
});
setup();
try {
  view = new CityView($('scene-host'), WORLD, {
    onSelect: id => selectAgent(id),
    onTaskSelect: id => experiments.selectTask(id),
    onTaskMove: position => experiments.move(position),
    validateTaskPosition: position => experiments.validate(position),
    onTaskInvalid: message => experiments.message(message || 'Choose open floor.', true),
  });
  $('loading').hidden = true;
} catch (error) {
  $('loading').textContent = 'The 3D view needs WebGL. You can still run trials and inspect robot maps and results.';
  console.error(error);
}
startTrial();
requestAnimationFrame(frame);
