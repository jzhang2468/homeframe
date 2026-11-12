/** HOMEFRAME · original fictional apartment, dimensions in metres.
 * Physical polygons are shared by rendering, collision and limited-vision sensing.
 * This is a designed test environment, not a surveyed dwelling.
 */
const rect=(x,y,w,h)=>[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
const obstacle=(id,kind,x,y,w,h,height,extra={})=>({id,kind,x,y,w,h,height,polygon:rect(x,y,w,h),...extra});
const walls=[
 obstacle('north-wall','wall',0,7.5,20.3,.22,2.7),
 obstacle('west-wall','wall',-10,0,.22,15.2,2.7),
 obstacle('east-wall','wall',10,0,.22,15.2,.42,{cutaway:true}),
 obstacle('south-west-wall','wall',-5.5,-7.5,9,.22,.42,{cutaway:true}),
 obstacle('south-east-wall','wall',6.25,-7.5,7.5,.22,.42,{cutaway:true}),
 obstacle('west-spine-1','wall',-1,-6.2,.18,2.6,1.1,{cutaway:true}),
 obstacle('west-spine-2','wall',-1,-.45,.18,5.1,1.1,{cutaway:true}),
 obstacle('west-spine-3','wall',-1,5.8,.18,3.4,1.1,{cutaway:true}),
 obstacle('east-spine-1','wall',2.5,-6.2,.18,2.6,1.1,{cutaway:true}),
 obstacle('east-spine-2','wall',2.5,-.45,.18,5.1,1.1,{cutaway:true}),
 obstacle('east-spine-3','wall',2.5,5.8,.18,3.4,1.1,{cutaway:true}),
 obstacle('west-cross-1','wall',-7.8,0,4.4,.18,1.1,{cutaway:true}),
 obstacle('west-cross-2','wall',-2.4,0,2.8,.18,1.1,{cutaway:true}),
 obstacle('east-cross-1','wall',4.05,0,3.1,.18,1.1,{cutaway:true}),
 obstacle('east-cross-2','wall',8.8,0,2.4,.18,1.1,{cutaway:true}),
];
const furniture=[
 obstacle('sofa','sofa',-8.6,-4.7,1.6,4.0,.75,{color:0x344759,occludes:false}),
 obstacle('coffee-table','table',-5.6,-4.5,1.8,1.3,.43,{occludes:false}),
 obstacle('media-console','console',-2.0,-6.6,1.1,1.0,.55,{occludes:false}),
 obstacle('lounge-plant','plant',-8.8,-1.2,.8,.8,1.5),
 obstacle('kitchen-back','counter',-6.5,6.9,6.8,1.05,.94),
 obstacle('kitchen-left','counter',-9.25,4.6,1.1,3.5,.94),
 obstacle('fridge','fridge',-2.2,6.55,1.3,1.6,2.1),
 obstacle('island','island',-5.7,3.2,2.8,1.35,.96),
 obstacle('stool-one','stool',-6.4,2.05,.55,.55,.65,{occludes:false}),
 obstacle('stool-two','stool',-5.2,2.05,.55,.55,.65,{occludes:false}),
 obstacle('bed','bed',7.2,-4.8,2.9,3.8,.5,{occludes:false}),
 obstacle('nightstand','nightstand',4.95,-6.05,.75,.8,.6,{occludes:false}),
 obstacle('wardrobe','wardrobe',8.55,-1.05,2.1,1.1,2.1),
 obstacle('bedroom-desk','desk',4.1,-1.05,1.9,.9,.78,{occludes:false}),
 obstacle('shower','shower',8.55,6.05,2.2,2.2,1.7,{occludes:false}),
 obstacle('bath-vanity','vanity',4.5,6.8,2.3,1.0,.9),
 obstacle('toilet','toilet',4.05,4.45,.8,1.3,.75,{occludes:false}),
 obstacle('washer','washer',8.8,2.35,1.0,1.2,.98),
 obstacle('dryer','dryer',7.55,2.35,1.0,1.2,.98),
 obstacle('utility-cabinet','cabinet',6.2,6.9,1.0,1.0,1.8),
 obstacle('tidy-dock','dock',.0,6.9,1.0,1.2,.35,{occludes:false}),
 obstacle('care-dock','dock',1.5,6.9,1.0,1.2,.35,{occludes:false}),
];
const rooms=[
 {id:'lounge',name:'LOUNGE',label:'01 / LOUNGE',polygon:rect(-5.5,-3.75,9,7.5),color:0x192735,labelAt:{x:-6.3,y:-2.05}},
 {id:'kitchen',name:'KITCHEN',label:'02 / KITCHEN',polygon:rect(-5.5,3.75,9,7.5),color:0x202b35,labelAt:{x:-4.0,y:1.05}},
 {id:'spine',name:'SERVICE SPINE',label:'SERVICE SPINE',polygon:rect(.75,0,3.5,15),color:0x25333c,labelAt:{x:.75,y:-5.8}},
 {id:'bedroom',name:'BEDROOM',label:'03 / BEDROOM',polygon:rect(6.25,-3.75,7.5,7.5),color:0x252638,labelAt:{x:4.3,y:-3.6}},
 {id:'bath',name:'BATH + UTILITY',label:'04 / UTILITY',polygon:rect(6.25,3.75,7.5,7.5),color:0x1c3037,labelAt:{x:5.0,y:1.1}},
];
const portals=[
 {id:'dock-tidy',name:'Tidy sorting and charging dock',x:0,y:5.7,kind:'dock'},
 {id:'dock-care',name:'Care charging dock',x:1.5,y:5.7,kind:'charger'},
];
const landmarks=[
 ...portals,
 {id:'door-lounge',name:'Lounge threshold',x:-1,y:-3.9,kind:'door'},
 {id:'door-kitchen',name:'Kitchen threshold',x:-1,y:3.0,kind:'door'},
 {id:'door-bedroom',name:'Bedroom threshold',x:2.5,y:-3.9,kind:'door'},
 {id:'door-utility',name:'Utility threshold',x:2.5,y:3.0,kind:'door'},
 {id:'living-north',name:'Open kitchen passage',x:-4.65,y:0,kind:'door'},
 {id:'east-passage',name:'Bedroom / bath passage',x:6.6,y:0,kind:'door'},
 {id:'entry-checkpoint',name:'Apartment entry checkpoint',x:.75,y:-6.6,kind:'room'},
 {id:'repair-station',name:'Service station',x:1.5,y:4.8,kind:'station'},
 {id:'kitchen-marker',name:'Kitchen island corner',x:-3.7,y:3.1,kind:'room'},
 {id:'lounge-marker',name:'Lounge table corner',x:-4.2,y:-4.5,kind:'room'},
];
const tasks=[
 {id:'clutter-01',kind:'clutter',name:'Clear scattered items',x:-6.9,y:-1.6,work:5,roomId:'lounge',priority:1},
 {id:'clutter-02',kind:'clutter',name:'Collect floor clutter',x:-3.0,y:-5.9,work:5,roomId:'lounge',priority:1},
 {id:'clutter-03',kind:'clutter',name:'Collect bedroom objects',x:4.1,y:-5.0,work:6,roomId:'bedroom',priority:1},
 {id:'clutter-04',kind:'clutter',name:'Sort loose kitchen items',x:-8.0,y:1.4,work:5,roomId:'kitchen',priority:1},
 {id:'clutter-05',kind:'clutter',name:'Clear service corridor',x:.7,y:-1.0,work:4,roomId:'spine',priority:1},
 {id:'clutter-06',kind:'clutter',name:'Collect loose laundry',x:8.4,y:.8,work:6,roomId:'bath',priority:1},
 {id:'clutter-07',kind:'clutter',name:'Collect dropped items',x:-6.9,y:-6.5,work:5,roomId:'lounge',priority:1},
 {id:'clutter-08',kind:'clutter',name:'Clear the wardrobe approach',x:8.6,y:-2.25,work:5,roomId:'bedroom',priority:1},
 {id:'spill-01',kind:'spill',name:'Clean kitchen spill',x:-3.5,y:5.0,work:9,roomId:'kitchen',priority:2},
 {id:'spill-02',kind:'spill',name:'Clean utility puddle',x:5.3,y:2.2,work:8,roomId:'bath',priority:2},
 {id:'leak-01',kind:'leak',name:'Repair washer leak',x:8.8,y:3.8,work:12,roomId:'bath',priority:3},
 {id:'leak-02',kind:'leak',name:'Check kitchen valve',x:-8.0,y:5.1,work:11,roomId:'kitchen',priority:3},
];
export const WORLD={
 name:'HOMEFRAME',subtitle:'Autonomous domestic systems / Test apartment 01',
 bounds:{minX:-10.4,maxX:10.4,minY:-7.9,maxY:7.9},
 studyBounds:{minX:-10,maxX:10,minY:-7.5,maxY:7.5},
 walkable:[rect(0,0,19.76,14.76)],buildings:[],fixedObstacles:[...walls,...furniture],walls,furniture,rooms,portals,landmarks,tasks,
 labels:rooms.map(r=>({text:r.label,x:r.labelAt.x,y:r.labelAt.y,size:.38})),
 provenance:{geometry:'Original fictional 20 × 15 metre apartment test environment. Walls and furniture polygons are shared by robot collision, sensing and rendering.',sources:[],limitations:['Synthetic household task benchmark; not calibrated to a physical robot or dwelling.','Cutaway wall heights reveal the experiment to the observer. Robots still obey their occluded local sensing.','Decorative textiles and small tabletop objects are not collision geometry.']}
};
export const SITE=WORLD;
export default WORLD;
