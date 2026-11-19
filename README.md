# HOMEFRAME · Spatial Agents

[Open the hotel circulation final project](https://jzhang2468.github.io/homeframe/final/)

[Read the final semantic model](docs/final/semantic-model.md)

[Open the public simulation](https://jzhang2468.github.io/homeframe/)

HOMEFRAME is an interactive agent-based study of how autonomous household robots discover chores, navigate an unfamiliar apartment and reuse spatial memory. The fictional 20 × 15 m apartment uses the same footprint polygons for its rendered layout, traversability and sensor occlusion.

Run a local static server with `python3 -m http.server 8080 --directory docs`, then open http://localhost:8080/. The app bundles its fonts and Three.js. Its normal UI does not require keys, API calls, or a database.

- **Run** advances the model in 0.1-second ticks. **Setup** selects the chore layout, fleet size, trial seed and memory setting.
- **Robot** exposes one agent's current task, observations, private map and stored landmarks. Select a robot from the list or click it in the apartment.
- **Chores** shows the experiment observer when each task is undetected, detected, in service, carried or resolved.
- **Trails** overlays all robot paths. **Traffic** encodes time spent in each cell.
- **Results** runs both memory settings with the same seed, robot count, layout and 240-second horizon. The two runs are independent of the animated view. Export includes the current run and any completed pair.

| Workshop item | Evidence |
| --- | --- |
| Two or more types | TIDY collects nearby clutter and delivers it to its sorting dock. CARE responds to spills and leaks, prioritizes urgent jobs, and returns to charge. |
| 1. Limited initial knowledge | Agents start with a role and home information. Their first scan fills only the space visible from the spawn pose. |
| 2. Limited sensing | Finite range and field of view with wall/furniture occlusion. The Sensors layer outlines the selected robot's field. |
| 3. Agents as obstacles | Observed robots increase local traversal cost. Physical clearance forces robots to yield or detour; avoidance episodes are counted. |
| 4. Goals and performance criteria | TIDY prefers nearby known jobs to limit travel. CARE weighs urgency and distance. Low battery changes the return decision. |
| 5. Goal-relevant mapping | Each agent discovers and labels local free space, obstacles, doors, task cues and other robots on its own map. |
| 6–7. Landmark storage and reuse | Docks and thresholds save coordinates and observation times. Return planning can route via a previously crossed threshold and the remembered dock. |
| 8. Single-agent knowledge | Robot tab shows the private map with separate symbols for observed obstacles, chores, occupants and saved landmarks. |
| 9–10. Many agents and aggregation | Configurable fleet; Trails overlays paths and Traffic displays occupancy time. The lab shows completion, discovery, reuses and avoidance counts. |
| 11. Presentation | The separate screenshot deck shows the apartment, roles, perception, landmark use, fleet traces and matched results. The workshop post requires a shareable URL and team names. |

## Interpreting the test

Spatial-memory mode retains observed cells and landmarks. The local-sensing mode forgets previous spatial observations, can continue its current commanded task, and receives a coarse home cue for return. Both use the same model geometry and task distribution. Their different histories may expose different tasks and returns. Compare completion counts alongside means that include only completed trips. Battery units and simulated seconds belong to the model. Robot performance has not been calibrated against physical hardware.

Run the engine checks with `npm test`.

## Reference trial

Six robots, daily routine, seed 42, 240 simulated seconds. The retaining fleet completed 12 of 12 chores and the local-sensing fleet completed 5 of 12. TIDY T01 carried the same service-corridor object from the same departure pose at 13.5 s in both runs. It reached the sorting dock in 11.1 s with retention and 12.9 s with local sensing. This is an individual matched example. The two fleets' means include different completed return trips.

## Build and compare your own experiments

In **Lab setup**, choose **Move chores**. Drag a marker in the apartment or select its name and enter X/Y metres. You can also tap a marker and then tap open floor. The editor rejects walls, furniture, locations without a route to the appropriate dock, and spots that are too close to other chores or the docks. **Done editing** retains the layout in the setup. **Run this setup** starts a fresh run with those locations.

Open **Robot parameters** to change either crew's base speed, sensor range, and field of view. Individual speeds retain their seeded variation. Range and view angle control actual sensing and occlusion. The selected robot's effective parameters appear in its inspector.

**Save as A** and **Save as B** capture independent setups. **Results → Run A/B comparison** advances both configurations for 240 simulated seconds, with per-role completion, returns, travel, energy, discovery, and robot yields. The interface lists which settings differ. Hold the seed and other settings fixed to investigate one change at a time. The browser retains A and B locally. **Test memory on / off** still compares both memory settings for the active trial. JSON export includes the saved configurations and latest comparison.
