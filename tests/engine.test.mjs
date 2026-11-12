import assert from 'node:assert/strict';
import {Simulation} from '../docs/simulation.js';
import {WORLD} from '../docs/world.js';

const advance = (sim, seconds, dt = .1) => { for (let n = 0; n < Math.round(seconds / dt); n++) sim.step(dt); };
const origins = sim => sim.agents.map(a => ({id: a.id, type: a.type, x: a.x, y: a.y, speed: a.speed, battery: a.battery, home: a.home, hint: a.homeHint}));
const withMemory = new Simulation(WORLD, {population: 6, seed: 42, memory: true});
const withoutMemory = new Simulation(WORLD, {population: 6, seed: 42, memory: false});
assert.deepEqual(origins(withMemory), origins(withoutMemory), 'paired runs must share robot origins, speeds, battery and coarse task hints');
assert.deepEqual(withMemory.tasks, withoutMemory.tasks, 'paired runs must share chores');
assert.equal(withMemory.agents.filter(a => a.type === 'tidy').length, 4);
assert.equal(withMemory.agents.filter(a => a.type === 'care').length, 2);
assert(withMemory.agents.every(a => a.known.size < withMemory.grid.blocked.length / 4));
assert(withMemory.agents.every(a => a.knownTasks.size === 0), 'robots must not know chores behind room walls at spawn');

const observer = withMemory.agents[0];
const pose = {x: observer.x, y: observer.y, heading: observer.heading};
observer.x = 0; observer.y = 5; observer.heading = Math.PI;
assert(!withMemory.canSee(observer, -2, 5), '18cm internal walls must occlude a room even with50cm navigation cells');
assert(withMemory.canSee(observer, -.4, 5), 'near side of wall remains visible');
assert(!withMemory.canSee(observer, 1, 5), 'the rear of the vision cone must remain unknown');
Object.assign(observer, pose);

const repeated = new Simulation(WORLD, {population: 6, seed: 42, memory: true});
advance(withMemory, 10); advance(repeated, 10);
assert.deepEqual(origins(withMemory), origins(repeated));
assert.deepEqual(withMemory.getMetrics(), repeated.getMetrics(), 'fixed timestep and seed produce deterministic results');

let lastCoverage = 0;
const previousTaskStates = new Map(withMemory.tasks.map(t => [t.id, t.status]));
for (let n = 0; n < 2300; n++) {
  const previous = withMemory.agents.map(a => ({x: a.x, y: a.y, battery: a.battery, energyUsed: a.energyUsed}));
  withMemory.step(.1);
  for (let i = 0; i < withMemory.agents.length; i++) {
    const a = withMemory.agents[i];
    assert(withMemory.isWalkable(a.x, a.y), 'robot cannot cross physical walls or furniture');
    assert(Math.hypot(a.x - previous[i].x, a.y - previous[i].y) <= a.speed * 1.12 * .1 + 1e-7, 'no teleportation');
    assert(Number.isFinite(a.battery) && a.battery >= 0 && a.battery <= 100);
    assert(a.energyUsed + 1e-9 >= previous[i].energyUsed, 'consumed energy must be cumulative');
  }
  for (const task of withMemory.tasks) {
    if (task.status !== 'pending') {
      const worker = withMemory.getAgent(task.robotId);
      assert(worker && task.discoveredBy.has(worker.id), 'a robot must detect a chore before claiming it');
      assert(task.kind === 'clutter' ? worker.type === 'tidy' : worker.type === 'care', 'robot roles must perform distinct compatible work');
    }
    if (task.status === 'complete' && previousTaskStates.get(task.id) !== 'complete') {
      const worker = withMemory.getAgent(task.robotId);
      assert.equal(task.progress, 1);
      if (task.kind === 'clutter') assert(Math.hypot(worker.x - worker.home.x, worker.y - worker.home.y) < .91, 'clutter is completed only after physical delivery');
    }
    previousTaskStates.set(task.id, task.status);
  }
  const coverage = withMemory.getMetrics(false).exploration;
  assert(coverage + 1e-9 >= lastCoverage, 'ever-discovered observer coverage cannot decrease'); lastCoverage = coverage;
}
advance(withoutMemory, 240);
const on = withMemory.getMetrics(false), off = withoutMemory.getMetrics(false);
assert.equal(on.completedTasks, 12, 'the standard six-robot household must finish all twelve chores');
assert(on.completedTasks > off.completedTasks, 'reference memory ablation should affect achieved work, not a baked-in score');
assert(on.memoryUses > 0 && off.memoryUses === 0);
assert(on.avoidanceEvents > 0);
assert(withMemory.agents.some(a => [...a.landmarkMemory.values()].some(l => l.category === 'chore')), 'observed chores must be saved as informative landmarks');
assert(withoutMemory.agents.every(a => [...a.known].every(i => a.visible.has(i))), 'no-memory maps retain only current observation cells');
assert(off.exploration >= off.retainedCoverage, 'ever observed coverage is distinct from currently retained knowledge');

const firstOn = withMemory.agents[0].returnTrips.find(t => t.reason === 'delivery');
const firstOff = withoutMemory.agents[0].returnTrips.find(t => t.reason === 'delivery');
assert(firstOn && firstOff);
assert.equal(firstOn.taskId, firstOff.taskId);
assert.equal(firstOn.startedAt, firstOff.startedAt);
assert.deepEqual(firstOn.depart, firstOff.depart, 'focused return comparison needs equal task, start time and start pose');
assert(firstOn.seconds < firstOff.seconds, 'the matched first return actually benefits from remembered navigation');

const busy = new Simulation(WORLD, {population: 6, seed: 42, scenario: 'afterparty'});
assert.equal(busy.tasks.length, 18);
assert(busy.tasks.every(t => busy.isWalkable(t.x, t.y)), 'scenario tasks must start on accessible floor cells');
advance(busy, 240);
assert(busy.getMetrics(false).completedTasks >= 14);

console.log(JSON.stringify({passed: true, checks: ['seeded paired robots and chores', 'two specialized roles', 'limited initial knowledge', 'thin-wall occlusion', 'vision direction', 'determinism', 'physical collision', 'no teleport', 'battery and energy bounds', 'perception before claiming', 'role-compatible work', 'physical deliveries', 'monotonic cumulative coverage', 'chore landmarks', 'functional landmark reuse', 'memory-off map clearing', 'yield episodes', 'matched return evidence', 'busy household scenario'],
  routine: {memory: {completed: on.completedTasks, energy: +on.energyUsed.toFixed(2), energyPerTask: +on.energyPerTask.toFixed(2), returnTrips: on.completedReturns, area: +on.exploration.toFixed(1)},
    noMemory: {completed: off.completedTasks, energy: +off.energyUsed.toFixed(2), energyPerTask: +off.energyPerTask.toFixed(2), returnTrips: off.completedReturns, area: +off.exploration.toFixed(1)}},
  matchedFirstReturn: {robotId: firstOn.robotId, taskId: firstOn.taskId, startedAt: +firstOn.startedAt.toFixed(1), rememberedSeconds: +firstOn.seconds.toFixed(1), noMemorySeconds: +firstOff.seconds.toFixed(1)},
  afterpartyCompleted: busy.getMetrics(false).completedTasks}, null, 2));
