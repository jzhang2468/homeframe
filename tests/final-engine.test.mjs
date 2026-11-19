import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, pointInPolygon} from '../docs/final/simulation.js';
import {WORLD, PRESETS, createWorld, DESIGN_OPTIONS} from '../docs/final/world.js';
const run=(s,seconds=300)=>{for(let i=0;i<Math.round(seconds*10);i++)s.step(.1);return s;};
const tiny=()=>({design:{},floorZ:-1.3716,walkable:[[[-5,-4],[5,-4],[5,4],[-5,4]]],fixedObstacles:[{id:'wall',polygon:[[-.15,-4],[.15,-4],[.15,2.5],[-.15,2.5]]}],buildings:[],rooms:[{id:'main',name:'Test room',origin:{x:-5,y:-4},polygon:[[-5,-4],[5,-4],[5,4],[-5,4]]}],doors:[],regions:[],landmarks:[],portals:[{id:'arrival',kind:'entrance',name:'Arrival',x:-4,y:0,roomId:'main'},{id:'dispatch',kind:'dock',name:'Base',x:-4,y:-2,roomId:'main'}],pickup:{id:'pickup',name:'Pickup',kind:'pickup',x:-4,y:-2,roomId:'main'},destinations:[{id:'target',name:'Target',kind:'both',x:4,y:0,roomId:'main'}]});
const isolated=()=>new Simulation(tiny(),{guests:1,robots:0,deliveries:0});
const baseline=run(new Simulation(WORLD));

test('seeded replay gives identical state and objective metrics',()=>{
 const a=run(new Simulation(WORLD),35),b=run(new Simulation(WORLD),35);
 assert.deepEqual(a.getMetrics(),b.getMetrics());
 assert.deepEqual(a.agents.map(x=>[x.id,x.x,x.y,x.phase,x.distance]),b.agents.map(x=>[x.id,x.x,x.y,x.phase,x.distance]));
});
test('all environment candidates keep identical seeded demand ids, goals and release times',()=>{
 for(const p of PRESETS)assert.deepEqual(new Simulation(createWorld(p.design)).demands,baseline.demands);
});
test('all 27 legal environmental combinations have network access to every destination and kitchen',()=>{
 for(const dock of DESIGN_OPTIONS.dock)for(const bay of DESIGN_OPTIONS.bay)for(const junction of DESIGN_OPTIONS.junction){
  const s=new Simulation(createWorld({dock:dock.value,bay:bay.value,junction:junction.value}),{guests:0,robots:0,deliveries:0});
  for(const target of [...s.destinations,s.pickup])assert.notEqual(s.networkDistance(s.dock,target),null,`${dock.value}/${bay.value}/${junction.value}: ${target.id}`);
 }
});
test('FOV has finite range, rear exclusion and opaque-wall occlusion',()=>{
 const s=isolated(),a=s.agents[0];Object.assign(a,{x:-3,y:0,heading:0,vision:5});
 assert.equal(s.canSee(a,-1,0),true);assert.equal(s.canSee(a,3,0),false);assert.equal(s.canSee(a,-4,0),false);assert.equal(s.canSee(a,4,3),false);
});
test('private maps start incomplete and are distinct objects',()=>{
 const s=new Simulation(WORLD);const a=s.agents[0],b=s.agents[1];
 assert.notEqual(a.known,b.known);assert.notEqual(a.landmarkMemory,b.landmarkMemory);assert.ok(a.known.size<s.grid.blocked.length/2);assert.ok(a.known.size>0);
});
test('unknown obstacles do not secretly inform A*; observation changes the route',()=>{
 const s=isolated(),a=s.agents[0];Object.assign(a,{x:-4,y:0,goal:{x:4,y:0},actualTarget:{x:4,y:0,roomId:'main'},_holding:null});a.known.clear();a.knownDoors.clear();a.roomGraph.clear();s._plan(a);
 assert.ok(a.route.some(p=>s.grid.blocked[s.cellAt(p.x,p.y)]),'unknown route may optimistically cross an unseen wall');
 a.known=new Set(Array.from(s.grid.blocked.keys()));s._plan(a);
 assert.ok(a.route.length>0);assert.ok(a.route.every(p=>!s.grid.blocked[s.cellAt(p.x,p.y)]));assert.ok(a.route.some(p=>p.y>2.5),'observed wall requires a detour');
});
test('memory-off clears retained cells and door/landmark graph beyond current sensing',()=>{
 const s=new Simulation(WORLD,{memory:false});run(s,20);
 for(const a of s.agents.filter(a=>a.spawned&&!a.completed)){s._sense(a);assert.deepEqual(a.known,a.visible);for(const d of a.knownDoors.values())assert.ok(s.canSee(a,d.x,d.y));}
 assert.equal(s.memoryEvents.length,0);assert.ok(s.getMetrics().exploration>=s.getMetrics().retainedCoverage);
 for(const count of s.grid.knowledgeCounts)assert.ok(count<=s.agents.length);
});
test('saved door and origin landmarks are actually consumed by later navigation',()=>{
 assert.ok(baseline.memoryEvents.some(e=>e.kind==='door-route'));
 assert.ok(baseline.memoryEvents.some(e=>e.kind==='return-origin'));
 assert.ok(baseline.memoryEvents.every(e=>e.agentId&&e.landmarkId&&e.time>0));
});
test('both reference roles finish meaningful explicit tasks within 300 simulated seconds',()=>{
 const m=baseline.getMetrics();assert.equal(m.guestsCompleted,24);assert.equal(m.deliveriesCompleted,8);assert.equal(m.robotRoundTrips,8);
 assert.ok(m.meanGuestTripTime>0);assert.ok(m.meanRobotTripTime>0);assert.ok(m.totalWait>0);
});
test('every robot handoff follows fixed kitchen pickup and return completion follows handoff',()=>{
 assert.equal(baseline.tasks.length,8);
 for(const t of baseline.tasks){assert.ok(t.claimedAt<=t.pickedUpAt);assert.ok(t.pickedUpAt<t.deliveredAt);assert.ok(t.deliveredAt<t.completedAt);}
 for(const p of PRESETS)assert.deepEqual(new Simulation(createWorld(p.design)).pickup,baseline.pickup);
});
test('physical bodies remain in navigable geometry without teleport jumps',()=>{
 const s=new Simulation(WORLD);let previous=new Map(s.agents.map(a=>[a.id,{x:a.x,y:a.y}]));
 for(let i=0;i<1300;i++){s.step(.1);for(const a of s.agents){const p=previous.get(a.id);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)<.2);if(a.spawned)assert.ok(s.isWalkable(a.x,a.y,a.radius),`${a.id} physical boundary`);previous.set(a.id,{x:a.x,y:a.y});}}
});
test('world and room-relative frames reconstruct position and room graph guides route',()=>{
 const s=run(new Simulation(WORLD),32);let routed=0;
 for(const a of s.agents.filter(a=>a.spawned)){const info=s.describeAgent(a.id),r=s.rooms.find(r=>r.id===info.location.semantic.roomId);assert.equal(info.location.world.z,WORLD.floorZ);if(r){assert.ok(Math.abs(r.origin.x+info.location.semantic.u-a.x)<1e-9);assert.ok(Math.abs(r.origin.y+info.location.semantic.v-a.y)<1e-9);assert.ok(pointInPolygon(a.x,a.y,r.polygon));}if(a.navigationAnchor)routed++;}
 assert.ok(routed>0);
});
test('network distance is a symmetric shortest-path metric on walkable grid nodes',()=>{
 const s=isolated(),a=s.pointAt(s.cellAt(-4,0)),b=s.pointAt(s.cellAt(4,0)),c=s.pointAt(s.cellAt(3,3));
 assert.equal(s.networkDistance(a,a),0);assert.ok(Math.abs(s.networkDistance(a,b)-s.networkDistance(b,a))<1e-9);
 assert.ok(s.networkDistance(a,b)>=s.euclideanDistance(a,b));assert.ok(s.networkDistance(a,b)<=s.networkDistance(a,c)+s.networkDistance(c,b)+1e-9);
});
test('holding-bay affordance is used locally and physically changes wait/travel',()=>{
 const clear=run(new Simulation(createWorld(PRESETS[1].design))),a=baseline.getMetrics(),b=clear.getMetrics();
 assert.ok(b.bayUses>0);assert.notEqual(a.totalWait,b.totalWait);assert.notEqual(a.totalDistance,b.totalDistance);assert.equal(b.guestsCompleted,24);assert.equal(b.robotRoundTrips,8);
});
test('speed-region hindrance changes movement rather than applying a results discount',()=>{
 const w=tiny();w.fixedObstacles=[];w.regions=[{id:'slow',name:'Slow zone',polygon:w.walkable[0],roles:['guest','robot'],speedFactor:.5,costFactor:1.2,effect:'slow'}];
 const fast=isolated(),slow=new Simulation(w,{guests:1,robots:0,deliveries:0});fast.site.fixedObstacles=[];fast.obstacles=[];
 for(const s of [fast,slow]){const a=s.agents[0];Object.assign(a,{x:-3,y:0,heading:0,_scanLeft:0,goal:{x:-1,y:0},actualTarget:{x:4,y:0,roomId:'main'},_goalConfirmed:false,_senseAt:999,_planAt:999,route:[{x:-1,y:0}]});s.step(.1);}
 assert.ok(slow.agents[0].distance<fast.agents[0].distance*.7);
});
test('aggregate heatmaps, waiting episodes and exported numbers are finite',()=>{
 const m=baseline.getMetrics();for(const [key,v]of Object.entries(m))if(typeof v==='number')assert.ok(Number.isFinite(v),key);
 assert.ok(m.yieldEvents>0);assert.ok(m.contestedPassages.some(p=>p.throughput>0));assert.ok(baseline.grid.visits.some(v=>v>0));assert.ok(baseline.grid.wait.some(v=>v>0));
 assert.equal(baseline.agents.filter(a=>a.type==='robot').every(a=>a.radius===.27),true);
});
