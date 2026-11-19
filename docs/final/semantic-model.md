# HOMEFRAME — Shared Circulation

A source-informed spatial design laboratory for the public ground floor of Moxy East Village, 112 East 11th Street, Manhattan. The designer generates alternative arrangements of a robot base, reserved holding bay and junction furnishing, then observes guests and delivery robots navigating the same seeded demands.

This is a proposed robot retrofit, not a description of current hotel operations. Outputs are deterministic simulation outcomes, not measured stress, pedestrian forecasts, or safety certification.

## Real-world grounding and boundaries

The historical source is the [2018 NYC Community Board 3 filing, ground-floor plan on page 24](https://www.nyc.gov/html/mancb3/downloads/sla/2018/12/questionnaires/18-%20112%20East%2011th%20Street_Questionnaire.pdf). The model follows the recognizable reception, lift lobby, Grab & Go, studios, kitchen/service side, lounge, bar and terrace connections. Furniture and design alternatives are simplified proposals.

The source reports the lounge as 1,061 sq ft, Grab & Go as 1,166 sq ft, bar as 892 sq ft, and terrace as 534 sq ft. Their 3,653 sq ft sum is the programmed public-area subset, not the building footprint. The implementation estimates drawing scale from the identifiable lounge rectangle and its stated area. Digitized polygons are approximate; they are not an as-built survey. The source places the floor 4.5 ft below grade, represented as `z = −1.3716 m`. Stairs, lift interiors, mechanical areas and the restaurant void are excluded. No elevator journey or vertical circulation is simulated.

A second direct reference is the [Pudu FlashBot Max product specification](https://www.pudurobotics.com/en/products/flashbot-new): approximately 0.538 × 0.534 × 1.052 m, with a published cruising-speed range of 0.5–1.2 m/s. The model uses a circular 0.27 m radius footprint, a 1.052 m rendered height, and seeded 0.76–0.88 m/s preferred speed. The circle is a simplified body approximation, not a reproduction of its sensors, braking envelope, or navigation stack. Guest dimensions, speeds, demand, field of view and region factors are explicit modeling assumptions.

The secondary assignment criterion is met through historical plan data and a real robot size/speed reference. The project does **not** claim surveyed measurements of the entire place in three physical dimensions.

## Entities and environment

`dist/world.js` exports `createWorld(design)`. The environment comprises polygonal walkable rooms, static walls/furniture, semantic doors, arrival points, an independent fixed kitchen pickup, venue targets, a movable robot base and spatial-effect regions. `dist/simulation.js` provides the DOM-free `Simulation` engine. `dist/scene.js` visualizes the engine's actual candidate world.

The environment is physical and partially observable. Geometry remains static during a run; people and robots occupy space and move over time. Deterministic pseudorandom generators set arrival times, destinations, individual preferred speeds, initial poses and destination-cue errors. Replay requires the same design, seed, population, memory setting and fixed timestep. The comparison protocol advances 0.1 simulated seconds per tick for 300 seconds.

### Two agent types and their goals

| Agent | Goal and decisions | Measurable performance |
|---|---|---|
| Guest | Arrive at reception or the lift landing, locate an assigned public venue, dwell 5–10 s, then return to the arrival point. Plan a route from private observations; avoid nearby bodies. | Completed visits / scheduled guests; complete visit time including dwell; cumulative movement wait; traveled metres. |
| Delivery robot | Start from its own parking pose around the selected base, obtain an available order, travel to the **fixed kitchen pickup**, collect for 1.8 s, locate the public venue, hand over for 3 s, and return to its parking pose. Give perceived guests crossing priority; use an observed holding bay when available. | Handoffs / released orders; complete base→kitchen→venue→base cycles; completed cycle time; movement wait; traveled metres; yield episodes and holding-bay uses. |

The default cohort is 24 guests, 4 robots and 8 orders. Six guests are present at time zero; subsequent guests arrive over the first minute, subject to local spawn clearance. Initial orders are available immediately; the remainder have seeded release times. Robots obtain the queue at their base. Moving the base never moves the kitchen food source.

A handoff and a completed round trip are separate events. An order is a completed round trip only after its robot returns. A guest is complete only after returning to arrival. Unfinished work at 300 s stays unfinished. Means of completed trip times are conditional on completion, so completion counts must be assessed alongside time averages.

## Two location representations, used in behavior

Every agent has both representations, exposed by `describeAgent(id).location`:

1. **World frame:** `{x, y, z, floorId}`. Local metres use x right/east and y up/north in the plan view; z is the floor elevation relative to grade. This frame drives collision checks, sensing, movement, trails and geometric distances. The drawing is source-informed rather than survey-georeferenced.
2. **Semantic room/threshold frame:** `{roomId, roomName, u, v, nearestDoorId, routeRooms}`. The containing room defines a local origin at its polygon's minimum x/y. Thus `u = x − room.origin.x`, `v = y − room.origin.y`, in metres. In connecting thresholds the fallback is `circulation`. A private observed-door graph represents room adjacency; `routeRooms` is the current learned topological route.

This is more than metadata: `_topologicalRoute()` searches the agent's learned door graph, and `_plan()` selects its next remembered threshold as an intermediate waypoint. `_semanticArrival()` checks the assigned room or an observed connecting doorway when recognizing goal arrival. Continuous motion updates room membership, triggering replanning and passage-throughput observations. The observer's `nearestDoorId` label is not itself fed into A*.

## Two distance metrics

| Metric | Definition and unit | Domain and use |
|---|---|---|
| Euclidean | `sqrt((x₁−x₂)² + (y₁−y₂)² + (z₁−z₂)²)`, metres | Continuous world coordinates. Goal bearing, proximity, movement and the inspector's straight-line distance. |
| Walkable grid-network | Shortest sum of cardinal 0.5 m edges and diagonal `0.5√2 m` edges; diagonals cannot cut blocked corners. | The observer's navigable 0.5 m grid nodes. Dijkstra fields measure available route length around physical obstacles. |

Network distance is a metric **on grid nodes**: zero self-distance, symmetry, nonnegative lengths and shortest-path triangle inequality. Inspector endpoints are quantized to their containing navigable nodes, or the nearest navigable node if the containing node is blocked. Therefore two continuous positions in the same cell can display zero network distance, and a displayed network estimate can be slightly shorter than the continuous straight-line distance because of endpoint quantization. It is not claimed to be an exact continuous geodesic.

`networkDistance()` is an observer-only measurement of the complete geometry. Agents never call this function to discover a route. `describeAgent(id).distances` reports remaining straight-line and network estimates to the current commanded target plus accumulated traveled metres. `meanEuclideanDistance` and `meanNetworkDistance` summarize direct origin-to-venue demand pairs; they are descriptive geometry references, not complete robot cycle lengths. Actual cycle distance is recorded in `returnTrips[].distance` and includes kitchen repositioning.

Travel time and waiting time are separate measured quantities in simulated seconds, not additional mathematical distance metrics.

## Partial knowledge, perception and planning

### Explicit prior

Agents are not born with an obstacle map. They know their own initial origin/parking pose and the assigned destination's room identity, plus a coarse coordinate cue with a seeded error of 1.3–3.1 m. This task cue gives a general direction; it does not provide a route or unseen walls. Robots are given pickup/delivery/base goals by the order cycle. The full true target remains available to the simulator for observer measurement and recognition when sensed.

### Sensing

`canSee()` limits ordinary environmental sensing by range, cone and wall occlusion:

- Guest: 8 m range; `0.84π` radians, approximately 151° field of view.
- Robot: 6 m range; `0.72π` radians, approximately 130° field of view.
- A near-contact radius of 0.55 m can be sensed regardless of heading.
- Opaque obstacle cells block sight beyond their first surface. Low furniture marked `occludes:false` blocks bodies but not the view.
- Sensing refreshes every 0.4 simulated seconds. Agents rotate during initial and search scans.
- Short-range, line-of-sight body avoidance operates within 1.8 m, including close bodies outside the forward cone. This local collision response does not reveal distant geometry or supply a global route.

The renderer can show the observer's complete floor, destinations and all agents. This privileged display is not agent knowledge.

### Private maps and functional landmarks

Each agent owns independent `known`, `visible`, `landmarkMemory`, `knownDoors`, `knownRooms`, `knownRegions`, `roomGraph` and observed-occupant records. Sensing adds walls/free cells, observed threshold identities, room labels, targets, base, pickup and spatial regions. Discoveries are not automatically shared with other agents.

Stored destination coordinates replace a noisy cue on a later goal. Stored door connections select intermediate navigation waypoints. The parking/arrival origin is reused on the return leg. `memoryEvents` logs actual stored-memory consumption with `{time, agentId, landmarkId, kind, fromRoom, toRoom}`; event kinds include `door-route`, `return-origin`, and `destination-recall`. Events are counted once per landmark/kind in each goal leg and require the saved observation to be older than 0.2 s. These are reuse events, not proof that a landmark was invisible at that exact instant.

When memory is disabled, each sensing refresh discards retained cells, landmarks, room/door graph, spatial regions and occupant records beyond the current observation. A currently confirmed goal remains working command state until that leg ends; it is not an inherited obstacle map. Accumulated observer discovery coverage is kept separately from retained agent-map coverage.

### Planning and movement

`_plan()` performs 8-neighbor A* on the agent's private knowledge. A cell is rejected as blocked only if that agent knows the cell. Unknown cells remain traversable in its tentative plan, with a higher cost of 1.6 versus 1 for known cells. Observed region costs and currently observed body occupancy alter route cost. The heuristic uses 0.7 times grid Euclidean distance; cardinal/diagonal step lengths differ. Replanning occurs periodically, on new blocked route observations, on semantic room transitions and during recovery.

A learned topological route can supply an intermediate observed doorway. If no learned semantic connection exists, the agent searches toward the noisy destination cue. When that cue is reached without confirmation, it scans and changes its local search point. Physical geometry always rejects illegal motion, even when the tentative route crosses an unseen wall. There is no teleportation recovery. A stalled agent tries a locally visible alternate waypoint and replans.

The body model uses continuous polygon collision checks and finite-radius bodies. Social separation and local side-stepping affect velocity. Robots initially yield to seen guests in conflict; the lift-approach priority region extends the yielding distance. If a robot's yield fails to clear for 3.5 s, it tries a locally visible backoff position rather than waiting indefinitely across a crossing. A designated bay offers a known place to step aside, with capacity two; entering it is counted only when selected for an actual encounter.

## Obstacles, hindrances and affordances

| Spatial concept | Model object | Actual behavioral effect |
|---|---|---|
| Obstacle | Walls, reception desk, counters, meeting tables, sofas, base equipment and optional partition/console | Blocks physical traversal. Opaque objects also block sensing. A blocked cell affects A* only after the individual observes it. |
| Hindrance | Arrival crossing | Multiplies both roles' movement speed by 0.78 and observed route cost by 1.16. |
| Hindrance | Guest-priority lift approach | For robots, speed ×0.65, observed route cost ×1.35 and earlier yielding to perceived guests. |
| Hindrance | Furnished junction | Speed ×0.87 for console or ×0.78 for partition; observed route cost ×1.15. The furnishing also changes physical passage geometry. |
| Affordance | Service-side clear route | For robots, speed ×1.05 and observed route cost ×0.88. |
| Affordance | Reserved service-side or lounge holding bay | A perceived robot refuge, capacity two; route cost ×0.75 and maneuver speed ×0.8 while inside. Selected during actual guest conflicts; may increase a robot's detour while freeing circulation. |

These are disclosed model assumptions rather than calibrated material properties. Their effects enter speed, route choice, yielding and physical geometry. No layout receives a baked-in discount to its reported wait or trip time.

## Measurement and aggregate evidence

`getMetrics()` reports scheduled/spawned/completed guests, completed handoffs, full robot cycles, active counts, completed-trip means, mean wait by role, total distance, yield episodes, bay uses, exploration and retained coverage. `contestedPassages` includes named threshold throughput, nearby conflict episodes and associated wait seconds.

Movement wait increments when an agent wants to move but stops for priority or travels below 18% of its current desired speed. It excludes intentional guest dwell, order collection, service handover, search scanning and dispatch idle. A yield episode begins on the transition into avoidance/yield; it is not incremented every frame. Passage assignment uses the nearest threshold within 5 m, so these are local vicinity observations rather than a calibrated doorway queue detector.

`grid.visits` accumulates occupant-seconds by cell; `grid.roleVisits.guest/robot` separates roles. `grid.wait` accumulates modeled movement-wait seconds. `grid.pressure` is only a compatibility alias for that wait array; it is not psychological stress. `grid.everObserved` supports cumulative discovery, while `grid.knowledgeCounts` supports current shared coverage of independent memories. Trails are per-agent positions recorded at approximately 0.3 s intervals.

`energyUsed` is a synthetic movement/service index: 0.08 per traveled robot metre, 0.006 per movement-tick second and 0.035 per pickup/service second. `battery = max(0,100−index)` is a display proxy. It is not Wh, a battery discharge model, or a scheduling constraint.

## Primary function: generate and evolve environments

There are 27 legal combinations of three spatial design variables:

- Robot base: kitchen, service corridor, or lounge edge.
- Holding bay: none, service-side, or lounge.
- Junction: open, low console furnishing, or offset partition.

Fixed room geometry, kitchen pickup and venue demand locations remain stable; only the designated base/furnishing/bay interventions change. The app provides named starter environments, side-by-side A/B runs, and a manual selection loop. After both candidates have run the 300 s horizon, the designer can select A or B as the parent, then generate two new one-variable alternatives from that parent. No automatic optimum or universal winner is claimed.

`dist/app.js` records `lineage` entries containing `{generation, selected, design, demand, metrics}`. An experiment export contains the current candidates, parent, generation, lineage, environment library and each simulation's metrics and agent paths. The same seed, counts, goal choices and arrival/order release schedules are regenerated for both candidates. A relocated base intentionally changes robot parking origin positions and the resulting kitchen repositioning. This is controlled **demand equivalence**, not identical physical initial robot poses across different layouts.

A credible comparison reads completion counts first, then guest and robot delay, route length and where conflicts accumulate. A holding bay can help one seeded arrival pattern and add a detour under another.

## Reproduction and evidence

From this directory, run:

```sh
node --test tests/engine.test.mjs
node tests/benchmark.mjs
```

The engine tests cover seeded replay; identical demand across layouts; connectivity of all 27 combinations; FOV and wall occlusion; private incomplete maps; an explicit test proving unknown obstacles do not secretly inform A*; no-memory clearing; actual memory reuse; both types' complete goals; fixed kitchen pickup order; continuous physical boundaries and absence of teleportation; both location frames; network metric properties on nodes; functional holding-bay use; region speed effects; finite metrics and heatmaps.

`validation.json` contains the engine source SHA-256, protocol, 16-test result summary, all four starter designs for seeds 7, 42 and 99, and a seed-42 memory-off ablation. The three seeds are a robustness probe, not statistical or empirical calibration. Source data and renderer labels should not be mistaken for current operational verification.

## Assignment mapping

| Final requirement | Implemented evidence |
|---|---|
| Baseline simulation of a semantic spatial idea | Source-informed shared hotel circulation and reference layout. |
| Two notions of location, each agent located in each | World x/y/z and room-local u/v plus learned threshold graph; both used in movement/planning/arrival. |
| Two distance notions with own metric | Continuous Euclidean metres; shortest grid-network metres on nodes, with endpoint quantization disclosed. |
| Two kinds of agent with goals and performance | Guest venue visits and return; robot kitchen collection, delivery and return, with completion/time/wait/distance metrics. |
| Limited knowledge, scanning and memory | Finite cones, opaque occlusion, scans, private occupancy/semantic maps, saved landmarks used on later route decisions. |
| Planning ahead with limited knowledge | Private-map A*, unknown-cell cost, observed semantic waypoints, physical rejection and replanning. |
| Environment characteristics | Physical, partially observable, multi-agent, static geometry with dynamic occupants, seeded deterministic replay. |
| Obstacles, hindrances and affordances | Blocking furniture/walls; speed and route-cost regions; guest priority; observed holding bays. |
| Primary: generate multiple environment options | 27 configurations; A/B evaluation, selected parent, two child variations and exported lineage. |
| Secondary: real-world data | 2018 NYC ground-floor plan and area/elevation facts, plus published robot dimensions/speed reference. |
| Deliverable semantic model | This Markdown file; native diagrams, videos, URL and environment series are supplied by the companion presentation/package. |
