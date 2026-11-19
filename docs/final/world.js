/** Moxy East Village / source-informed ground-floor circulation laboratory.
 * Pixel traces reference p24 of the 2018 NYC CB3 filing (rotated for reading).
 * This is approximate digitization, not an as-built survey or live hotel model.
 */
const FLOOR_Z=-4.5*.3048;
const SCALE=Math.sqrt((1061*.09290304)/(268*200));
const point=(px,py)=>({x:+((px-958.5)*SCALE).toFixed(3),y:+((793.5-py)*SCALE).toFixed(3)});
const poly=points=>points.map(([x,y])=>{const p=point(x,y);return[p.x,p.y]});
const rect=(x,y,w,h)=>[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
const pr=(x0,y0,x1,y1)=>poly([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
const obstacle=(id,kind,px,py,w,h,height=1,extra={})=>{const p=point(px,py);return{id,kind,...p,w,h,height,polygon:rect(p.x,p.y,w,h),...extra}};
const wall=(id,x0,y0,x1,y1,height=1.15,extra={})=>{const p=point((x0+x1)/2,(y0+y1)/2),w=Math.max(.16,Math.abs(x1-x0)*SCALE),h=Math.max(.16,Math.abs(y1-y0)*SCALE);return{id,kind:'wall',...p,w,h,height,polygon:rect(p.x,p.y,w,h),...extra}};
const room=(id,name,polygon,labelPixel,extra={})=>({id,name,polygon,floorZ:FLOOR_Z,origin:{x:Math.min(...polygon.map(p=>p[0])),y:Math.min(...polygon.map(p=>p[1])),z:FLOOR_Z},labelAt:point(...labelPixel),...extra});
export const DESIGN_DEFAULTS=Object.freeze({dock:'kitchen',bay:'none',junction:'console'});
export const DESIGN_OPTIONS=Object.freeze({
 dock:[{value:'kitchen',label:'Kitchen base'},{value:'service',label:'Service corridor'},{value:'lounge',label:'Lounge-edge base'}],
 bay:[{value:'none',label:'No reserved bay'},{value:'service',label:'Service-side holding bay'},{value:'lounge',label:'Lounge holding bay'}],
 junction:[{value:'open',label:'Open junction'},{value:'console',label:'Low furnishing'},{value:'partition',label:'Offset partition'}],
});
export const PRESETS=[
 {id:'reference',name:'Reference arrangement',design:{...DESIGN_DEFAULTS}},
 {id:'clear-circulation',name:'Clear circulation',design:{dock:'kitchen',bay:'lounge',junction:'open'}},
 {id:'service-buffer',name:'Service buffer',design:{dock:'service',bay:'service',junction:'partition'}},
 {id:'lounge-dispatch',name:'Lounge base',design:{dock:'lounge',bay:'none',junction:'console'}},
];
export function normalizeDesign(design={}){return Object.fromEntries(Object.entries(DESIGN_DEFAULTS).map(([k,v])=>[k,DESIGN_OPTIONS[k].some(o=>o.value===design[k])?design[k]:v]));}
const baseRooms=[
 room('reception','Reception',pr(1196,420,1393,684),[1325,630],{color:0x1d2c3d}),
 room('lift-lobby','Guest lift lobby',pr(1288,684,1393,814),[1342,752],{color:0x243648}),
 room('arrival-passage','Arrival passage',pr(1134,624,1196,790),[1165,667],{color:0x1d2b3c}),
 room('grab-go','Grab & Go',pr(1000,643,1134,762),[1066,698],{color:0x252d40,publishedAreaSqFt:1166}),
 room('promenade','Shared promenade',pr(730,761,1134,830),[933,803],{color:0x203644}),
 room('studio-a','Studio A',pr(788,643,891,761),[839,691],{color:0x292a41}),
 room('studio-b','Studio B',pr(891,643,1000,761),[947,691],{color:0x292a41}),
 room('kitchen','Kitchen prep',pr(696,643,788,789),[741,685],{color:0x1e3a48}),
 room('service-corridor','Service corridor',poly([[516,791],[696,791],[696,738],[730,738],[730,830],[516,830]]),[642,814],{color:0x28323e}),
 room('lounge','Hotel lounge',poly([[866,830],[1134,830],[1134,909],[1196,909],[1196,1030],[866,1030]]),[1015,925],{color:0x252d41,publishedAreaSqFt:1061}),
 room('bar','Hotel bar',pr(1195,814,1393,1074),[1243,969],{color:0x302e3e,publishedAreaSqFt:892}),
 room('terrace','Lounge terrace',pr(1136,1074,1393,1172),[1266,1136],{color:0x21343b,publishedAreaSqFt:534}),
];
const door=(id,name,px,py,connects,width=1.8)=>({id,name,...point(px,py),connects,width,kind:'door',floorZ:FLOOR_Z});
const doors=[
 door('reception-lifts','Lift vestibule threshold',1337,684,['reception','lift-lobby'],3.0),
 door('lifts-bar','Lift / bar threshold',1335,814,['lift-lobby','bar'],3.2),
 door('reception-passage','Reception side doorway',1196,653,['reception','arrival-passage'],1.8),
 door('passage-grab','Grab & Go doorway',1134,730,['arrival-passage','grab-go'],1.8),
 door('grab-promenade','Grab & Go junction',1065,761,['grab-go','promenade'],3.5),
 door('studio-a-door','Studio A doorway',837,761,['studio-a','promenade'],1.6),
 door('studio-b-door','Studio B doorway',946,761,['studio-b','promenade'],1.6),
 door('kitchen-promenade','Kitchen dispatch threshold',757,789,['kitchen','promenade'],1.8),
 door('service-promenade','Service corridor threshold',730,810,['service-corridor','promenade'],1.55),
 door('promenade-lounge','Lounge threshold',1032,830,['promenade','lounge'],4.3),
 door('lounge-bar','Lounge / bar passage',1195,964,['lounge','bar'],4.5),
 door('bar-terrace','Terrace doorway',1296,1074,['bar','terrace'],1.8),
];
const walls=[
 wall('outer-north',506,405,1411,405,2.7),wall('outer-west',506,405,506,1182,2.7),wall('outer-east',1411,405,1411,1182,.45,{cutaway:true}),wall('outer-south',506,1182,1411,1182,.45,{cutaway:true}),
 wall('void-front',730,416,1134,416,1.1),wall('void-left',730,416,730,643,1.1),wall('void-right',1134,416,1134,624,1.1),wall('void-rear',730,643,1134,643,1.1),
 wall('kitchen-left',696,643,696,789,1.15),wall('kitchen-front',696,643,788,643,1.15),wall('kitchen-right',788,643,788,761,1.15),wall('kitchen-bottom-a',696,789,735,789,1.15),wall('kitchen-bottom-b',779,789,788,789,1.15),
 wall('studio-divider',891,643,891,761,1.15),wall('studio-b-right',1000,643,1000,761,1.15),
 wall('studio-a-south-a',788,761,818,761,1.0),wall('studio-a-south-b',856,761,891,761,1.0),wall('studio-b-south-a',891,761,927,761,1.0),wall('studio-b-south-b',965,761,1000,761,1.0),
 wall('grab-east-a',1134,643,1134,708,1.15),wall('grab-east-b',1134,751,1134,790,1.15),
 wall('arrival-east-a',1196,624,1196,632,1.1),wall('arrival-east-b',1196,674,1196,790,1.1),
 wall('service-bottom',516,830,866,830,1.1),wall('lounge-west',866,830,866,1030,1.2),wall('lounge-south',866,1030,1195,1030,.7,{glass:true}),
 wall('bar-west-north',1195,814,1195,909,1.15),wall('bar-west-south',1195,1030,1195,1074,1.1),
 wall('bar-south-a',1195,1074,1273,1074,.9,{glass:true}),wall('bar-south-b',1320,1074,1393,1074,.9,{glass:true}),
 wall('terrace-west',1136,1074,1136,1172,.6,{glass:true}),wall('terrace-south',1136,1172,1393,1172,.6,{glass:true}),
];
const furniture=[
 obstacle('reception-desk','reception',1380,655,.8,3.2,1.05),
 obstacle('arrival-stair','stair',1357,506,2.4,7.2,1.05),
 obstacle('pe4-core','lift',1225,550,2.6,3.2,2.3,{label:'PE4'}),
 obstacle('guest-lift-1','lift',1248,715,3.1,2.1,2.4,{label:'PE1'}),
 obstacle('guest-lift-2','lift',1248,777,3.1,2.1,2.4,{label:'PE2'}),
 obstacle('service-lift','lift',657,740,2.7,3.1,2.3,{label:'PE3'}),
 obstacle('kitchen-counter-n','counter',741,659,3.0,.65,.95),obstacle('kitchen-counter-w','counter',706,711,.6,3.3,.95),
 obstacle('kitchen-fridge','cabinet',775,714,.65,1.2,1.8),
 obstacle('studio-a-table','meeting',839,709,2.5,1.25,.78,{occludes:false}),obstacle('studio-b-table','meeting',946,709,2.5,1.25,.78,{occludes:false}),
 obstacle('grab-counter','counter',1106,773,1.4,.7,1.0),
 obstacle('grab-table-a','round-table',1035,680,.72,.72,.74,{occludes:false}),obstacle('grab-table-b','round-table',1091,681,.72,.72,.74,{occludes:false}),
 obstacle('lounge-table','meeting',1017,932,2.7,2.1,.6,{occludes:false}),
 obstacle('lounge-sofa-w','sofa',896,928,.75,3.0,.75,{occludes:false}),obstacle('lounge-sofa-s','sofa',988,1014,3.2,.72,.75,{occludes:false}),
 obstacle('lounge-seat-ne','lounge-chair',1104,876,.8,.85,.65,{occludes:false}),obstacle('lounge-seat-se','lounge-chair',1106,997,.8,.85,.65,{occludes:false}),
 obstacle('bar-counter','bar-counter',1347,965,2.4,6.5,1.05),
 obstacle('bar-table-a','round-table',1238,923,.74,.74,.74,{occludes:false}),obstacle('bar-table-b','round-table',1235,1024,.74,.74,.74,{occludes:false}),
 obstacle('terrace-table-a','round-table',1176,1115,.8,.8,.74,{occludes:false}),obstacle('terrace-table-b','round-table',1350,1122,.8,.8,.74,{occludes:false}),
 obstacle('terrace-sofa','sofa',1262,1155,5.0,.7,.75,{occludes:false}),
];
const destinations=[
 {id:'studio-a-delivery',name:'Studio A service',...point(837,747),roomId:'studio-a',doorId:'studio-a-door',kind:'both'},
 {id:'studio-b-delivery',name:'Studio B service',...point(946,747),roomId:'studio-b',doorId:'studio-b-door',kind:'both'},
 {id:'lounge-west-service',name:'Lounge west service',...point(935,902),roomId:'lounge',doorId:'promenade-lounge',kind:'both'},
 {id:'lounge-east-service',name:'Lounge east service',...point(1113,944),roomId:'lounge',doorId:'lounge-bar',kind:'both'},
 {id:'bar-visit',name:'Bar visit',...point(1268,992),roomId:'bar',doorId:'lifts-bar',kind:'guest-goal'},
 {id:'terrace-visit',name:'Terrace visit',...point(1299,1120),roomId:'terrace',doorId:'bar-terrace',kind:'guest-goal'},
 {id:'grab-go-visit',name:'Grab & Go visit',...point(1065,737),roomId:'grab-go',doorId:'grab-promenade',kind:'guest-goal'},
 {id:'lift-visit',name:'Guest lift access',...point(1313,742),roomId:'lift-lobby',doorId:'reception-lifts',kind:'guest-goal'},
];
const dockLocations={kitchen:{...point(755,771),roomId:'kitchen',name:'Kitchen base'},service:{...point(704,812),roomId:'service-corridor',name:'Service base'},lounge:{...point(901,809),roomId:'promenade',name:'Lounge-edge base'}};
const bayShapes={service:pr(744,796,780,824),lounge:pr(1078,852,1129,901)};
const sourceUrl='https://www.nyc.gov/html/mancb3/downloads/sla/2018/12/questionnaires/18-%20112%20East%2011th%20Street_Questionnaire.pdf';
export function createWorld(input={}){
 const design=normalizeDesign(input),rooms=structuredClone(baseRooms),fixedObstacles=structuredClone([...walls,...furniture]);
 const dispatch={id:'dispatch',kind:'dock',...dockLocations[design.dock],floorZ:FLOOR_Z};
 const pickup={id:'kitchen-pickup',name:'Kitchen order pickup',...point(756,774),roomId:'kitchen',kind:'pickup',floorZ:FLOOR_Z};
 // Dispatch face is a movable furnishing; the portal is its clear approach point.
 const dockUnit={id:'movable-dispatch-unit',kind:'dock',x:dispatch.x,y:dispatch.y+.6,w:1.1,h:.5,height:.85,occludes:false};dockUnit.polygon=rect(dockUnit.x,dockUnit.y,dockUnit.w,dockUnit.h);fixedObstacles.push(dockUnit);
 const movable=[];
 if(design.junction==='console')movable.push(obstacle('junction-console','console',1075,789,1.6,.58,.72,{occludes:false,designVariable:true}));
 if(design.junction==='partition')movable.push(obstacle('junction-partition','partition',1042,796,.18,1.65,1.55,{designVariable:true}));
 fixedObstacles.push(...movable);
 const regions=[
 {id:'arrival-slow-zone',name:'Arrival crossing',polygon:pr(1197,624,1328,684),kind:'hindrance',effect:'slow',roles:['robot','guest'],speedFactor:.78,costFactor:1.16,roomId:'reception'},
 {id:'guest-lift-priority',name:'Guest-priority lift approach',polygon:pr(1288,685,1392,814),kind:'hindrance',effect:'guest-priority',roles:['robot'],speedFactor:.65,costFactor:1.35,roomId:'lift-lobby'},
 {id:'service-route',name:'Service-side clear route',polygon:pr(731,796,1000,829),kind:'affordance',effect:'clear-route',roles:['robot'],speedFactor:1.05,costFactor:.88,roomId:'promenade'},
 ];
 if(design.bay!=='none')regions.push({id:'holding-bay',name:design.bay==='service'?'Service-side holding bay':'Lounge holding bay',polygon:bayShapes[design.bay],kind:'affordance',effect:'holding-bay',roles:['robot'],speedFactor:.8,costFactor:.75,capacity:2,roomId:design.bay==='service'?'promenade':'lounge'});
 if(design.junction!=='open')regions.push({id:'junction-friction',name:'Furnished junction',polygon:pr(1016,765,1129,826),kind:'hindrance',effect:'slow',roles:['guest','robot'],speedFactor:design.junction==='partition'?.78:.87,costFactor:1.15,roomId:'promenade'});
 const landmarks=[pickup,...doors.map(d=>({...d,kind:'door',roomId:d.connects[0]})),{...dispatch,kind:'dock'},{id:'reception-landmark',name:'Reception desk',...point(1355,653),kind:'reception',roomId:'reception'},{id:'lifts-landmark',name:'Guest lifts',...point(1311,742),kind:'lift',roomId:'lift-lobby'},{id:'kitchen-landmark',name:'Kitchen prep entrance',...point(756,774),kind:'room',roomId:'kitchen'}];
 const portals=[{id:'guest-arrival',name:'Hotel reception arrival',...point(1318,628),kind:'entrance',roomId:'reception',floorZ:FLOOR_Z},{id:'guest-lift-arrival',name:'Guest lift arrival',...point(1317,763),kind:'entrance',roomId:'lift-lobby',floorZ:FLOOR_Z},dispatch];
 const bounds={minX:point(500,1188).x,maxX:point(1417,400).x,minY:point(500,1188).y,maxY:point(1417,400).y};
 for(const r of rooms)r.doors=doors.filter(d=>d.connects.includes(r.id)).map(d=>d.id);
 return {name:'Moxy East Village',subtitle:'Ground-floor circulation / 112 East 11th Street, NYC',design,floorZ:FLOOR_Z,bounds,studyBounds:{...bounds},walkable:rooms.map(r=>r.polygon),rooms,doors:structuredClone(doors),portals,landmarks,pickup,destinations:structuredClone(destinations),regions,fixedObstacles,buildings:[],walls:structuredClone(walls),furniture:fixedObstacles.filter(o=>o.kind!=='wall'),movable,
 nonWalkable:[{id:'restaurant-void',name:'Restaurant below / void',polygon:pr(730,416,1134,643),kind:'void'},{id:'mechanical',name:'Mechanical / outside model',polygon:pr(506,830,866,1086),kind:'back-of-house'},{id:'service-cores',name:'Service cores',polygon:pr(506,416,696,791),kind:'back-of-house'},{id:'roof-void',name:'Glass roof / restaurant below',polygon:pr(866,1030,1136,1172),kind:'void'}],
 designZone:{name:'Grab & Go / lounge junction',polygon:pr(1008,762,1132,829)},
 robotSpecification:{name:'PUDU FlashBot Max',widthM:.538,depthM:.534,heightM:1.052,cruiseSpeedMps:[.5,1.2],modeledRadiusM:.27,url:'https://www.pudurobotics.com/en/products/flashbot-new',note:'Published body dimensions inform an approximate cylindrical collision footprint; operational performance is simulated.'},
 sourceFacts:{address:'112 East 11th Street, Manhattan',documentYear:2018,planPage:24,floorBelowGradeFt:4.5,floorBelowGradeM:FLOOR_Z,hotelLoungeSqFt:1061,grabGoSqFt:1166,barSqFt:892,terraceSqFt:534,publicProgramSqFt:3653,scaleMetresPerPixel:SCALE},
 provenance:{geometry:'Source-informed, approximate digitization of the Moxy East Village ground-floor plan in a 2018 NYC Community Board 3 filing. Major program locations and connections follow that drawing; dispatch equipment, holding bays, simplified furniture and junction alternatives are design proposals.',retrieved:'2026-11-19',sources:[{title:'NYC CB3 — Moxy East Village filing, 2018, ground-floor plan p24',url:sourceUrl},{title:'PUDU FlashBot Max — body dimensions and cruise speed',url:'https://www.pudurobotics.com/en/products/flashbot-new'}],limitations:['The 3,653 sq ft figure describes four programmed public areas, not the full building footprint.','Scale is estimated from the identifiable lounge rectangle and its published 1,061 sq ft area. The digitized polygons are approximate, not surveyed dimensions.','The source places this floor 4.5 ft (1.3716 m) below grade. The renderer uses a cutaway and compresses walls for visibility.','The actual 2026 layout and operating procedures have not been verified. Robot delivery is a proposed use, not a claim about hotel operations.','Mechanical rooms, stairs, guest lift interiors and the restaurant void are outside this single-level model. Arrivals enter at modeled ground-floor landing points.','Demand, pedestrian preferences and region effects are explicit simulation assumptions. Robot body dimensions are source informed; collision shape, speed choices and behavior are approximations.']}}
}
export const WORLD=createWorld();
export const SITE=WORLD;
export default WORLD;
