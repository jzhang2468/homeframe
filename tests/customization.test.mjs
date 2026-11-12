import assert from 'node:assert/strict';
import {Simulation, ROBOT_DEFAULT_PARAMS, ROBOT_PARAM_LIMITS, TASK_POSITION_RULES} from '../docs/simulation.js';
import {WORLD} from '../docs/world.js';

const advance = (sim, seconds) => { for (let i = 0; i < seconds * 10; i++) sim.step(.1); };
const pose = sim => sim.agents.map(a => ({id: a.id, x: a.x, y: a.y, heading: a.heading, speed: a.speed, battery: a.battery}));
const base = new Simulation(WORLD);
const explicitDefaults = new Simulation(WORLD, {robotParams: structuredClone(ROBOT_DEFAULT_PARAMS), taskPositions: {}});
assert.deepEqual(pose(base), pose(explicitDefaults));
advance(base, 45); advance(explicitDefaults, 45);
assert.deepEqual(pose(base), pose(explicitDefaults));
assert.deepEqual(base.getMetrics(), explicitDefaults.getMetrics(), 'explicit defaults must preserve exact pre-customization outcomes');

const fresh = new Simulation(WORLD);
assert(fresh.tasks.every(t => fresh.validateTaskPosition(t.id, t.x, t.y).valid), 'existing valid chore locations remain accepted');
const oldSource = structuredClone(WORLD.tasks);
const id = 'clutter-05', old = fresh.tasks.find(t => t.id === id);
const destination = fresh.freeCells.map(i => fresh.pointAt(i)).find(p => Math.hypot(p.x - old.x, p.y - old.y) > 6 && fresh.validateTaskPosition(id, p.x, p.y).valid);
assert(destination, 'fixture needs an alternate connected floor location');
const moved = new Simulation(WORLD, {taskPositions: {[id]: destination}});
assert.equal(moved.tasks.find(t => t.id === id).x, destination.x);
assert.equal(moved.tasks.find(t => t.id === id).y, destination.y);
assert(moved.tasks.find(t => t.id === id).positionEdited);
assert.deepEqual(WORLD.tasks, oldSource, 'edits must not mutate the original world or source task list');
assert.deepEqual(pose(fresh), pose(moved), 'moving a chore must not change seeded robot starting conditions');
const remembered = new Simulation(WORLD, {taskPositions: {[id]: destination}, memory: true});
const forgotten = new Simulation(WORLD, {taskPositions: {[id]: destination}, memory: false});
assert.deepEqual(pose(remembered), pose(forgotten));
assert.deepEqual(remembered.tasks, forgotten.tasks, 'memory comparison must keep edited chores identical');
advance(fresh, 60); advance(moved, 60);
assert.notDeepEqual(moved.tasks.map(t => [t.id, t.status, t.startedAt]), fresh.tasks.map(t => [t.id, t.status, t.startedAt]), 'edited task locations must alter sensing and work, not only rendering');

const validation = new Simulation(WORLD);
assert.equal(validation.validateTaskPosition(id, 200, 200).code, 'outside-floor');
assert.equal(validation.validateTaskPosition(id, NaN, 0).code, 'invalid-coordinate');
assert.equal(validation.validateTaskPosition('missing', 0, 0).code, 'unknown-task');
assert.equal(validation.validateTaskPosition(id, -1, 5).code, 'blocked');
const other = validation.tasks.find(t => t.id !== id);
assert.equal(validation.validateTaskPosition(id, other.x, other.y).code, 'chore-spacing');
const dock = validation.portals[0];
assert(!validation.validateTaskPosition(id, dock.x, dock.y).valid);
assert.throws(() => new Simulation(WORLD, {taskPositions: {[id]: {x: -1, y: 5}}}), /Invalid position/);
assert.throws(() => new Simulation(WORLD, {taskPositions: {missing: {x: 0, y: 0}}}), /Unknown chore/);
validation.validateTaskPosition(id, destination.x, destination.y);
const cache = validation._reachableByRole.get('tidy');
for (let i = 0; i < 100; i++) validation.validateTaskPosition(id, destination.x, destination.y);
assert.equal(validation._reachableByRole.get('tidy'), cache, 'drag validation reuses cached connectivity');

const first = validation.tasks[0], second = validation.tasks[2];
const swapped = new Simulation(WORLD, {taskPositions: {[first.id]: {x: second.x, y: second.y}, [second.id]: {x: first.x, y: first.y}}});
assert.equal(swapped.tasks.find(t => t.id === first.id).x, second.x, 'batch edits validate final positions rather than rejecting a legitimate swap');
const afterparty = new Simulation(WORLD, {scenario: 'afterparty'});
const extraPosition = afterparty.freeCells.map(i => afterparty.pointAt(i)).find(p => afterparty.validateTaskPosition('extra-1', p.x, p.y).valid);
const editedParty = new Simulation(WORLD, {scenario: 'afterparty', taskPositions: {'extra-1': extraPosition}});
assert.equal(editedParty.tasks.length, 18);
assert.equal(editedParty.tasks.find(t => t.id === 'extra-1').x, extraPosition.x);

const dividedHome = {
  walkable: [[[-6, -3], [-2, -3], [-2, 3], [-6, 3]], [[2, -3], [6, -3], [6, 3], [2, 3]]],
  buildings: [], fixedObstacles: [], landmarks: [],
  portals: [{id: 'dock', kind: 'dock', name: 'Left dock', x: -4, y: 0}],
  tasks: [{id: 'left-task', kind: 'clutter', name: 'Clutter', x: -4, y: 1.5, work: 2}], rooms: []
};
const divided = new Simulation(dividedHome, {population: 2});
assert.equal(divided.validateTaskPosition('left-task', 4, 0).code, 'unreachable', 'free but disconnected floor cannot accept a chore');

const normal = new Simulation(WORLD);
const slower = new Simulation(WORLD, {robotParams: {tidy: {speed: .35}}});
for (let i = 0; i < normal.agents.length; i++) {
  if (normal.agents[i].type === 'care') assert.equal(normal.agents[i].speed, slower.agents[i].speed);
  else assert.equal(slower.agents[i].speed, normal.agents[i].speed * (.35 / ROBOT_DEFAULT_PARAMS.tidy.speed));
}
advance(normal, 30); advance(slower, 30);
assert.notEqual(normal.getMetrics(false).totalDistance, slower.getMetrics(false).totalDistance, 'speed control must change motion');

const shortSight = new Simulation(WORLD, {robotParams: {tidy: {vision: 2}}});
const longSight = new Simulation(WORLD, {robotParams: {tidy: {vision: 9}}});
for (const sim of [shortSight, longSight]) Object.assign(sim.agents[0], {x: .75, y: 0, heading: Math.PI / 2});
assert(!shortSight.canSee(shortSight.agents[0], .75, 4));
assert(longSight.canSee(longSight.agents[0], .75, 4), 'vision range must change what can be detected');
const narrow = new Simulation(WORLD, {robotParams: {tidy: {fov: Math.PI / 4}}});
const wide = new Simulation(WORLD, {robotParams: {tidy: {fov: Math.PI * 10 / 9}}});
for (const sim of [narrow, wide]) Object.assign(sim.agents[0], {x: .75, y: 0, heading: Math.PI / 2});
assert(!narrow.canSee(narrow.agents[0], 1.75, 2));
assert(wide.canSee(wide.agents[0], 1.75, 2), 'cone aperture must affect sensing independently of range');
assert.throws(() => new Simulation(WORLD, {robotParams: {tidy: {fov: 140}}}), /radians/);
assert.throws(() => new Simulation(WORLD, {robotParams: {care: {speed: 0}}}), /m\/s/);
assert.throws(() => new Simulation(WORLD, {robotParams: {care: {vision: NaN}}}), /metres/);
assert.throws(() => new Simulation(WORLD, {robotParams: {scout: {speed: .5}}}), /Unknown robot role/);

console.log(JSON.stringify({passed: true, checks: ['exact explicit defaults', 'seeded custom positioning', 'source immutability', 'edited memory pairing', 'task sensing and work changed', 'blocked and outside placement rejected', 'spacing and dock clearance', 'cached connectivity', 'simultaneous swaps', 'afterparty task editing', 'unreachable floor rejected', 'seeded speed jitter preserved', 'role-specific speed changes motion', 'vision range affects sensing', 'FOV affects sensing', 'parameter validation'],
  units: {speed: 'm/s role base with existing proportional seeded jitter', vision: 'metres', fov: 'radians'},
  defaults: ROBOT_DEFAULT_PARAMS, limits: ROBOT_PARAM_LIMITS, placementRules: TASK_POSITION_RULES}, null, 2));
