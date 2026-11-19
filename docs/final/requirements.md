# Final requirement mapping

The submission uses the manual environment-generation option and the historic real-world-data option. The alternatives in the final brief permit these choices.

| Final requirement | Implementation and visible evidence |
| --- | --- |
| Baseline from a semantic model | Reference arrangement of the source-informed Moxy East Village public floor. The semantic model documents spaces, relations, agents and rules. |
| Two notions of location | Metric world location `(x,y,z)` and room-relative `(room,u,v)` location. The Agent inspector displays both, and room/door relations support navigation. |
| Two notions of distance | Euclidean metres and walkable-network metres, shown for the same agent and destination. The complete-network measurement is observer-side. |
| Two kinds of spatial agents | Hotel guests and delivery robots. |
| Limited knowledge with scanning | Agents reveal only their occluded, finite field of view on their private maps. |
| Spatial memory and reused landmarks | Observed doors, destinations and robot bases become saved landmarks for later choices and returns. |
| Goals and measurable performance | Guest destination journeys and waiting. Robot kitchen pickup, delivery and base return, with completed deliveries, time, waiting and energy. |
| Planning ahead | Paths depend on privately observed cells, goal cues and remembered thresholds. Agents replan around newly encountered obstacles and occupants. |
| Physical environment | A single-level architectural floor in metres, rendered as a 3D cutaway. |
| Partial observability | The observer sees the cutaway, while each agent has its own observed map. |
| Multiple space-consuming agents | Agents have nonzero physical bodies and avoid one another. |
| Dynamic/static choice | Dynamic occupants and queues in a fixed floor arrangement during each run. |
| Deterministic/non-deterministic choice | Deterministic, seeded simulation. Matching seeds create matching demand for layout comparisons. |
| Obstacles | Walls, cores, furniture and other agents constrain movement. |
| Hindrances | Arrival crossings, guest-priority lift approaches and furnished junctions alter cost or speed. |
| Affordances | Clear service routes and holding bays support robot passage and yielding. |
| Primary function | Generate two layout alternatives, run them side by side, select a parent, then generate two descendants. |
| Secondary function | Historic real-world plan relationships and area data from a NYC public filing. Robot dimensions/speed are benchmarked to manufacturer specifications. |
| URL | Public GitHub Pages application. |
| Semantic model | Linked Markdown file. |
| Requirement diagrams | Native editable diagrams in the final deck. |
| Instruction-manual video | A separate video demonstrates running the app and generating an environment. |
| Demo video | A separate video demonstrates selection across successive pairs of simulated environments. |
| Interesting environments | The deck and experiment export document generated arrangements, agent traces, performance and reasons for investigating each. |

## Data and interpretation

The 2018 plan is an architectural source for program connections and approximate digitization. It does not verify the current hotel interior. The single-floor elevation is the source's 4.5 feet below grade. Interior clear heights, cutaway heights, furnishing abstractions, sensor parameters, pedestrian demand, robot policies, region effects and proposed interventions are model choices.

The submission satisfies the real-world-data alternative. It does not claim a surveyed model of true three-dimensional geometry and time. The robot model simplifies the rectangular physical platform to a circular body and a rule-based navigation system.

Source plan: https://www.nyc.gov/html/mancb3/downloads/sla/2018/12/questionnaires/18-%20112%20East%2011th%20Street_Questionnaire.pdf

Robot benchmark: https://www.pudurobotics.com/en/products/flashbot-new
