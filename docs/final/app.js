import { createWorld, DESIGN_DEFAULTS } from './world.js';
import { Simulation } from './simulation.js';
import { CityView } from './scene.js';

const $ = id => document.getElementById(id);
const HORIZON = 300;
const TICK = .1;
const fields = {
  dock: { label: 'Robot base', values: [['kitchen', 'Kitchen base'], ['service', 'Service base'], ['lounge', 'Lounge-edge base']] },
  bay: { label: 'Robot passing bay', values: [['none', 'No designated bay'], ['service', 'Service-side bay'], ['lounge', 'Lounge-side bay']] },
  junction: { label: 'Shared junction', values: [['console', 'Furnished junction'], ['open', 'Clear junction'], ['partition', 'Screened junction']] },
};
const reference = [
  { name: 'Reference layout', design: { ...DESIGN_DEFAULTS }, why: 'A shared junction concentrates guest and delivery paths near the public rooms.' },
  { name: 'Clear circulation', design: { dock: 'kitchen', bay: 'lounge', junction: 'open' }, why: 'A clear junction and a passing bay test whether robots can yield without occupying the main path.' },
  { name: 'Service buffer', design: { dock: 'service', bay: 'service', junction: 'partition' }, why: 'A service-side robot base and a screen test the trade-off between separation and travel distance.' },
];
let demand = { seed: 42, guests: 24, robots: 4, memory: true };
let candidates = [structuredClone(reference[0]), structuredClone(reference[1])];
let parent = structuredClone(reference[0]);
let generation = 0;
let lineage = [];
let library = [];
let view;
let simulations = [];
let showingPair = false;
let activeDesign = structuredClone(reference[0]);
let selected = null;
let selectedWorld = 0;
let playing = false;
let speed = 1;
let layer = 'sensors';
let last = performance.now();
let uiAt = 0;
let accumulator = 0;
let evaluation;
let toastTimer;
const mapContext = $('knowledge').getContext('2d');
const clone = value => structuredClone(value);
const fmt = (value, places = 0) => Number.isFinite(value) ? value.toFixed(places) : '—';
const clock = value => { const seconds = Math.floor(value + .000001); return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); };
const fingerprint = design => ['dock', 'bay', 'junction'].map(key => design[key]).join('/');
const describe = design => Object.entries(fields).map(([key, field]) => field.values.find(([value]) => value === design[key])?.[1]).join(' · ');
const text = (tag, value, className) => Object.assign(document.createElement(tag), { textContent: value, ...(className ? { className } : {}) });
const currentSimulation = () => simulations[showingPair ? selectedWorld : 0];

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3700);
}

function setTab(name, focus = false) {
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', active);
    button.tabIndex = active ? 0 : -1;
    $('panel-' + button.dataset.tab).hidden = !active;
    if (focus && active) button.focus();
  }
  updateUI();
}

function fillDesign(design) {
  for (const key of Object.keys(fields)) $('design-' + key).value = design[key];
}

function readDesign() {
  return Object.fromEntries(Object.keys(fields).map(key => [key, $('design-' + key).value]));
}

function buildControls() {
  for (const [key, field] of Object.entries(fields)) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = text('label', field.label);
    label.htmlFor = 'design-' + key;
    const select = document.createElement('select');
    select.id = label.htmlFor;
    select.replaceChildren(...field.values.map(([value, label]) => new Option(label, value)));
    row.append(label, select);
    $('design-fields').append(row);
  }
  fillDesign(DESIGN_DEFAULTS);
}

function stopEvaluation() {
  evaluation?.abort();
  evaluation = undefined;
  $('compare-finish').disabled = false;
}

function startSingle(option, run = false) {
  stopEvaluation();
  activeDesign = clone(option);
  simulations = [new Simulation(createWorld(option.design), demand)];
  showingPair = false;
  selectedWorld = 0;
  selected = simulations[0].agents[0]?.id;
  playing = run;
  accumulator = 0;
  view?.setSimulations(simulations[0]);
  view?.select(selected);
  view?.setLayer(layer);
  $('pair-labels').hidden = true;
  $('scene-title').textContent = option.name.toUpperCase();
  updateAgentChoices();
  updateUI();
  transportState();
}

function startPair(run = false) {
  stopEvaluation();
  simulations = candidates.map(option => new Simulation(createWorld(option.design), demand));
  showingPair = true;
  selectedWorld = 0;
  selected = simulations[0].agents[0]?.id;
  playing = run;
  accumulator = 0;
  view?.setSimulations(simulations[1], simulations[0]);
  view?.select(selected, selectedWorld);
  view?.setLayer(layer);
  $('pair-labels').hidden = false;
  $('label-a').textContent = 'A · ' + candidates[0].name;
  $('label-b').textContent = 'B · ' + candidates[1].name;
  $('scene-title').textContent = 'PAIRED ENVIRONMENTS';
  $('comparison-progress').textContent = 'Same demand and seed ' + demand.seed + ' in both environments.';
  updateAgentChoices();
  renderSlots();
  updateUI();
  transportState();
}

function transportState() {
  const ended = simulations.length && simulations.every(sim => sim.time >= HORIZON - .001);
  $('play').textContent = playing ? 'Pause' : ended ? 'Replay' : simulations[0]?.time ? 'Resume' : 'Run';
  $('play').setAttribute('aria-label', $('play').textContent + ' simulation');
  $('run-status').textContent = evaluation ? 'EVALUATING' : ended ? 'COMPLETE' : playing ? 'RUNNING' : simulations[0]?.time ? 'PAUSED' : 'READY';
  $('run-status').dataset.status = ended ? 'complete' : playing ? 'running' : 'ready';
  $('seed-label').textContent = 'SEED ' + demand.seed;
}

function advance() {
  if (simulations.every(sim => sim.time >= HORIZON - .001)) return false;
  for (const sim of simulations) if (sim.time < HORIZON - .001) sim.step(TICK);
  if (simulations.every(sim => sim.time >= HORIZON - .001)) {
    playing = false;
    if (showingPair) recordPair();
    transportState();
  }
  return true;
}

function selectAgent(id, index = 0) {
  selectedWorld = showingPair ? index : 0;
  selected = id;
  view?.select(id, selectedWorld);
  updateAgentChoices();
  setTab('agent');
}

function updateAgentChoices() {
  const entries = [];
  simulations.forEach((sim, index) => {
    for (const agent of sim.agents) {
      const value = index + ':' + agent.id;
      const label = (showingPair ? (index === 0 ? 'A · ' : 'B · ') : '') + (agent.type === 'robot' ? 'Robot ' : 'Guest ') + agent.id;
      entries.push(new Option(label, value));
    }
  });
  $('agent-select').replaceChildren(...entries);
  $('agent-select').value = selectedWorld + ':' + selected;
}

function drawKnowledge(sim, agent) {
  const ctx = mapContext;
  const c = $('knowledge');
  const g = sim.grid;
  ctx.fillStyle = '#0b111a';
  ctx.fillRect(0, 0, c.width, c.height);
  if (!g || !agent) return;
  const scale = Math.min((c.width - 24) / g.cols, (c.height - 18) / g.rows);
  const ox = (c.width - g.cols * scale) / 2;
  const oy = (c.height - g.rows * scale) / 2;
  for (const i of agent.known ?? []) {
    ctx.fillStyle = g.blocked[i] ? '#778496' : agent.visible?.has(i) ? '#79dce9' : '#304c65';
    ctx.fillRect(ox + i % g.cols * scale, oy + (g.rows - 1 - Math.floor(i / g.cols)) * scale, scale + .2, scale + .2);
  }
  const point = p => [ox + (p.x - g.minX) / g.cellSize * scale, oy + (g.rows - (p.y - g.minY) / g.cellSize) * scale];
  for (const mark of agent.landmarkMemory?.values?.() ?? []) {
    if (!Number.isFinite(mark.x)) continue;
    const [x, y] = point(mark);
    ctx.fillStyle = '#bc9bff';
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  }
  for (const mark of agent.occupants?.values?.() ?? []) {
    const [x, y] = point(mark);
    ctx.fillStyle = '#ffad76';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 2 * Math.PI); ctx.fill();
  }
  const [x, y] = point(agent);
  ctx.fillStyle = '#f5fcff';
  ctx.beginPath(); ctx.arc(x, y, 4.3, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = '#f5fcff';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(agent.heading) * 10, y - Math.sin(agent.heading) * 10); ctx.stroke();
}

function updateInspector() {
  if ($('panel-agent').hidden || !selected) return;
  const sim = currentSimulation();
  const agent = sim?.getAgent(selected);
  const detail = sim?.describeAgent(selected);
  if (!agent || !detail) return;
  const robot = agent.type === 'robot';
  $('agent-role').dataset.type = agent.type;
  $('role-name').textContent = robot ? 'DELIVERY ROBOT' : 'HOTEL GUEST';
  $('role-goal').textContent = robot ? 'Pick up in the kitchen, deliver to a public room, then return to base. Track deliveries, trip time and waiting.' : 'Reach a public destination and leave. Track completed journeys, travel time and waiting.';
  $('agent-action').textContent = detail.state;
  $('agent-goal').textContent = detail.goal?.name ?? 'Waiting for scheduled arrival';
  const w = detail.location.world;
  const r = detail.location.semantic;
  $('world-location').textContent = 'x ' + fmt(w.x, 1) + ' · y ' + fmt(w.y, 1) + ' · z ' + fmt(w.z, 2);
  $('room-location').textContent = r.roomName + ' · u ' + fmt(r.u, 1) + ' · v ' + fmt(r.v, 1);
  $('distance-euclidean').textContent = fmt(detail.distances.euclidean, 1) + ' m';
  $('distance-network').textContent = fmt(detail.distances.network, 1) + ' m';
  const marks = [...(agent.landmarkMemory?.values?.() ?? [])];
  $('memory-count').textContent = marks.length + ' landmarks';
  $('agent-landmarks').replaceChildren(...marks.slice(-3).reverse().map(mark => text('li', '◇ ' + (mark.name ?? mark.id))));
  drawKnowledge(sim, agent);
}

function renderSlots() {
  $('candidate-slots').replaceChildren(...candidates.map((option, index) => {
    const card = document.createElement('article');
    card.className = 'candidate-slot';
    card.append(text('strong', (index === 0 ? 'A · ' : 'B · ') + option.name), text('p', describe(option.design)));
    return card;
  }));
  $('parent-name').textContent = 'Parent · ' + parent.name;
  $('generation-label').textContent = 'Generation ' + generation + ' · ' + lineage.length + ' selections';
}

function renderResults() {
  if (!showingPair || simulations.length !== 2) {
    $('result-table').replaceChildren();
    $('passage-diagnostics').replaceChildren();
    return;
  }
  const [a, b] = simulations.map(sim => sim.getMetrics(false));
  const rows = [
    ['Guest journeys', a.guestsCompleted + '/' + a.totalGuests, b.guestsCompleted + '/' + b.totalGuests],
    ['Full robot cycles', a.robotRoundTrips, b.robotRoundTrips],
    ['Deliveries', a.deliveriesCompleted + '/' + a.totalDeliveries, b.deliveriesCompleted + '/' + b.totalDeliveries],
    ['Guest trip', a.guestsCompleted ? fmt(a.meanGuestTripTime, 1) + ' s' : '—', b.guestsCompleted ? fmt(b.meanGuestTripTime, 1) + ' s' : '—'],
    ['Guest wait', fmt(a.meanGuestWait, 1) + ' s', fmt(b.meanGuestWait, 1) + ' s'],
    ['Robot round trip', a.robotRoundTrips ? fmt(a.meanRobotTripTime, 1) + ' s' : '—', b.robotRoundTrips ? fmt(b.meanRobotTripTime, 1) + ' s' : '—'],
    ['Robot wait', fmt(a.meanRobotWait, 1) + ' s', fmt(b.meanRobotWait, 1) + ' s'],
    ['Yield episodes', a.yieldEvents, b.yieldEvents],
    ['Bay uses', a.bayUses, b.bayUses],
  ];
  const table = document.createElement('table');
  table.className = 'compare-table';
  const head = document.createElement('thead');
  const title = document.createElement('tr');
  for (const value of ['METRIC', 'A', 'B']) title.append(text('th', value));
  head.append(title);
  const body = document.createElement('tbody');
  for (const [name, av, bv] of rows) {
    const row = document.createElement('tr');
    const th = text('th', name); th.scope = 'row';
    row.append(th, text('td', String(av)), text('td', String(bv))); body.append(row);
  }
  table.append(head, body);
  $('result-table').replaceChildren(table);
  const passages = [a, b].map((metrics, index) => {
    const passage = metrics.contestedPassages[0];
    return text('p', (index === 0 ? 'A' : 'B') + ' · ' + (passage ? passage.name + ': ' + fmt(passage.waitSeconds, 1) + ' s accumulated waiting' : 'No threshold waiting recorded'));
  });
  $('passage-diagnostics').replaceChildren(text('strong', 'Threshold diagnosis'), ...passages);
}

function updateUI() {
  if (!simulations.length) return;
  const sim = currentSimulation();
  const m = sim.getMetrics(false);
  $('clock').value = clock(sim.time);
  $('total-guests').textContent = m.guestsCompleted + ' / ' + m.totalGuests;
  $('total-robots').textContent = m.deliveriesCompleted + ' / ' + m.totalDeliveries;
  $('total-delay').textContent = fmt(m.meanGuestWait, 1) + 's';
  const reuses = sim.agents.reduce((sum, agent) => sum + (agent.memoryHits ?? 0), 0);
  $('total-memory').textContent = reuses;
  updateInspector();
  if (!$('panel-results').hidden) renderResults();
}

function recordPair() {
  for (let i = 0; i < 2; i++) {
    const option = clone(candidates[i]);
    const metrics = simulations[i].getMetrics(false);
    const key = fingerprint(option.design) + '/' + JSON.stringify(demand);
    const entry = { key, ...option, demand: clone(demand), generation, metrics };
    const index = library.findIndex(item => item.key === key);
    if (index >= 0) library[index] = entry; else library.push(entry);
  }
  renderHistory();
}

function renderHistory() {
  const options = [...library].reverse();
  for (const option of reference) if (!options.some(item => fingerprint(item.design) === fingerprint(option.design))) options.push(option);
  $('design-history').replaceChildren(...options.slice(0, 9).map(option => {
    const card = document.createElement('article');
    card.className = 'history-item';
    card.append(text('h3', option.name), text('p', option.why ?? describe(option.design)));
    if (option.metrics) card.append(text('p', option.metrics.guestsCompleted + '/' + option.metrics.totalGuests + ' guest journeys · ' +
      option.metrics.deliveriesCompleted + '/' + option.metrics.totalDeliveries + ' deliveries\n' +
      fmt(option.metrics.meanGuestWait, 1) + ' s guest wait · ' + fmt(option.metrics.meanRobotWait, 1) + ' s robot wait\nSeed ' + option.demand.seed + ' · 300 s', 'history-metrics'));
    const button = text('button', 'View layout', 'metal-button');
    button.addEventListener('click', () => { fillDesign(option.design); startSingle(option); setTab('design'); $('viewport').scrollIntoView({ block: 'start' }); });
    card.append(button);
    return card;
  }));
}

function evaluatePair() {
  startPair(false);
  const run = new AbortController();
  evaluation = run;
  $('compare-finish').disabled = true;
  let count = 0;
  function chunk() {
    if (run.signal.aborted) return;
    const until = performance.now() + 12;
    while (count < HORIZON / TICK && performance.now() < until) {
      for (const sim of simulations) sim.step(TICK);
      count++;
    }
    $('comparison-progress').textContent = 'Evaluating · ' + Math.round(count / (HORIZON / TICK) * 100) + '%';
    updateUI();
    if (count < HORIZON / TICK) { setTimeout(chunk, 0); return; }
    evaluation = undefined;
    $('compare-finish').disabled = false;
    $('comparison-progress').textContent = '300 s each · ' + demand.guests + ' guests · ' + demand.robots + ' robots · seed ' + demand.seed;
    recordPair();
    transportState();
  }
  setTimeout(chunk, 0);
}

function chooseParent(index) {
  if (!showingPair) { toast('Run the current A / B pair first.'); return; }
  const metrics = simulations[index].getMetrics(false);
  if (simulations[index].time < HORIZON - .001) { toast('Evaluate the full 300-second horizon before selecting a parent.'); return; }
  parent = clone(candidates[index]);
  lineage.push({ generation, selected: index === 0 ? 'A' : 'B', design: clone(parent), demand: clone(demand), metrics });
  fillDesign(parent.design);
  renderSlots();
  setTab('design');
  toast(parent.name + ' selected. Generate its next two variations.');
}

function generateOptions() {
  const possibilities = [];
  for (const key of Object.keys(fields)) {
    for (const [value] of fields[key].values) if (parent.design[key] !== value) possibilities.push({ ...parent.design, [key]: value });
  }
  const offset = generation * 2 % possibilities.length;
  generation++;
  candidates = [0, 1].map(index => ({ name: 'Generation ' + generation + ' ' + (index === 0 ? 'A' : 'B'), design: possibilities[(offset + index * 3) % possibilities.length],
    why: 'Variation of ' + parent.name + '. ' + describe(possibilities[(offset + index * 3) % possibilities.length]) + '.' }));
  if (fingerprint(candidates[0].design) === fingerprint(candidates[1].design)) candidates[1].design = possibilities[(offset + 1) % possibilities.length];
  renderSlots();
  startPair(false);
  setTab('results');
}

function exportExperiment() {
  const result = { project: 'HOMEFRAME Shared Circulation', source: 'NYC Community Board 3, Moxy East Village public filing, 2018',
    interpretation: 'Approximate plan digitization and hypothetical robot service. Results are uncalibrated simulation outcomes.',
    horizon: HORIZON, tick: TICK, demand, candidates, parent, generation, lineage,
    environments: library, current: simulations.map(sim => ({ design: sim.site.design, metrics: sim.getMetrics(false),
      agents: sim.agents.map(agent => ({ ...sim.describeAgent(agent.id), path: agent.path })) })) };
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  link.href = url; link.download = 'homeframe-circulation-seed-' + demand.seed + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyDemand() {
  if (!['guest-count', 'robot-count', 'seed'].every(id => $(id).reportValidity())) return;
  stopEvaluation();
  demand = { seed: Number($('seed').value), guests: Number($('guest-count').value), robots: Number($('robot-count').value), memory: $('memory').checked };
  startPair(false);
  toast('Both candidates reset with matching demand.');
}

function bind() {
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => setTab(button.dataset.tab));
    button.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const names = ['design', 'agent', 'results'];
      const index = names.indexOf(button.dataset.tab);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      e.preventDefault(); setTab(names[next], true);
    });
  }
  $('preview').addEventListener('click', () => startSingle({ name: 'Custom layout', design: readDesign() }, true));
  for (const [index, id] of ['save-a', 'save-b'].entries()) $(id).addEventListener('click', () => {
    stopEvaluation();
    candidates[index] = { name: 'Custom ' + (index === 0 ? 'A' : 'B'), design: readDesign() };
    startPair(false); setTab('design'); toast('Layout saved as ' + (index === 0 ? 'A' : 'B') + '.');
  });
  $('generate').addEventListener('click', generateOptions);
  $('compare-run').addEventListener('click', () => { startPair(true); setTab('results'); });
  $('compare-finish').addEventListener('click', evaluatePair);
  $('choose-a').addEventListener('click', () => chooseParent(0));
  $('choose-b').addEventListener('click', () => chooseParent(1));
  $('export').addEventListener('click', exportExperiment);
  $('demand-apply').addEventListener('click', applyDemand);
  $('play').addEventListener('click', () => {
    if (evaluation) return;
    if (simulations.every(sim => sim.time >= HORIZON - .001)) { if (showingPair) startPair(true); else startSingle(activeDesign, true); }
    else { playing = !playing; transportState(); }
  });
  $('reset').addEventListener('click', () => showingPair ? startPair(false) : startSingle(activeDesign));
  $('step').addEventListener('click', () => { if (evaluation) return; playing = false; accumulator = 0; for (let i = 0; i < 100; i++) if (!advance()) break; updateUI(); transportState(); });
  $('speed').addEventListener('click', () => { speed = speed === 16 ? 1 : speed * 2; $('speed').textContent = speed + '×'; });
  $('camera-focus').addEventListener('click', () => view?.focusJunction());
  $('camera-top').addEventListener('click', () => view?.top());
  $('camera-iso').addEventListener('click', () => view?.resetCamera());
  $('camera-plus').addEventListener('click', () => view?.zoom(1.2));
  $('camera-minus').addEventListener('click', () => view?.zoom(1 / 1.2));
  $('agent-select').addEventListener('change', e => { const [index, id] = e.target.value.split(':'); selectAgent(id, Number(index)); });
  for (const button of document.querySelectorAll('[data-layer]')) button.addEventListener('click', () => {
    layer = button.dataset.layer;
    view?.setLayer(layer);
    for (const item of document.querySelectorAll('[data-layer]')) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); }
    $('layer-note').textContent = layer === 'paths' ? 'Guest and delivery routes show where paths overlap across each environment.' : layer === 'traffic' ? 'Repeated occupation highlights the shared passages and waiting locations.' : 'Select an agent to inspect its local sensing and remembered places.';
  });
  $('source-open').addEventListener('click', () => $('source-dialog').showModal());
  $('submission-open').addEventListener('click', () => $('submission-dialog').showModal());
}

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - last) / 1000, .06);
  last = now;
  if (playing && !evaluation && !document.hidden) {
    accumulator += delta * speed;
    let count = 0;
    while (accumulator >= TICK && count++ < 18 && playing) { advance(); accumulator -= TICK; }
  }
  view?.render();
  if (now - uiAt > 250) { updateUI(); uiAt = now; }
}

buildControls();
const sourceFacts = createWorld(DESIGN_DEFAULTS).sourceFacts;
const sourceInfo = document.createElement('div');
sourceInfo.className = 'source-facts';
for (const [name, value] of [['Lounge', sourceFacts.hotelLoungeSqFt + ' sq ft'], ['Grab & Go', sourceFacts.grabGoSqFt + ' sq ft'], ['Bar', sourceFacts.barSqFt + ' sq ft'], ['Terrace', sourceFacts.terraceSqFt + ' sq ft']]) sourceInfo.append(text('p', name + ' · ' + value));
$('source-data').append(sourceInfo);
bind();
try {
  view = new CityView($('scene-host'), createWorld(DESIGN_DEFAULTS), { onSelect: selectAgent });
  $('loading').hidden = true;
} catch (error) {
  $('loading').textContent = 'The 3D view needs WebGL. Simulation controls and results remain available.';
  console.error(error);
}
renderSlots();
renderHistory();
startSingle(reference[0]);
requestAnimationFrame(frame);
