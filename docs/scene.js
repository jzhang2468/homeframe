import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
const V=(x,y,h=0)=>new THREE.Vector3(x,h,-y);
const C={cyan:0x68e7ff,amber:0xffb75c,violet:0xb89cff,steel:0x8293a4,ink:0x101a29};
function shape(poly){const s=new THREE.Shape();poly.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
function prism(poly,height,mat,bottom=0){const g=new THREE.ExtrudeGeometry(shape(poly),{depth:height,bevelEnabled:false});g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,mat);m.position.y=bottom;m.castShadow=true;m.receiveShadow=true;return m;}
function box(w,h,d,mat,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function cyl(r,h,mat,x=0,y=0,z=0,r2=r,segments=24){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,h,segments),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function edges(mesh,color=0xa5bdd4,opacity=.18){const line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,28),new THREE.LineBasicMaterial({color,transparent:true,opacity}));line.position.copy(mesh.position);return line;}
function mat(color,metalness=.65,roughness=.42,emissive=0,emissiveIntensity=0){return new THREE.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity});}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,.75)');g.addColorStop(.2,'rgba(255,255,255,.3)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
function textTexture(text,color='#a6c8df',small=false){const c=document.createElement('canvas');c.width=1024;c.height=128;const x=c.getContext('2d');x.font=`${small?400:600} 44px ${small?'monospace':'Arial'}`;x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(text,512,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function floorText(text,x,y,size=.5,color='#a6c8df'){const m=new THREE.Mesh(new THREE.PlaneGeometry(size*8,size),new THREE.MeshBasicMaterial({map:textTexture(text,color,true),transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.copy(V(x,y,.045));return m;}
function line(points,color,opacity=1){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false}));}
function glowingDisc(tex,color,r,x=0,y=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(r*2,r*2),new THREE.MeshBasicMaterial({map:tex,color,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.copy(V(x,y,.035));return m;}
function robot(type,materials,glowTex){const g=new THREE.Group(),tidy=type==='tidy',accent=tidy?C.cyan:C.amber;const trim=mat(accent,.3,.3,accent,1.1),dark=materials.black,white=materials.robot;
 if(tidy){
  g.add(cyl(.37,.2,dark,0,.18,0));g.add(cyl(.34,.24,white,0,.34,0,.36));g.add(cyl(.31,.025,trim,0,.47,0));g.add(cyl(.26,.045,dark,0,.50,0));
  g.add(box(.32,.22,.23,white,0,.63,0));g.add(box(.27,.09,.035,dark,0,.66,.129));g.add(box(.18,.025,.04,trim,0,.67,.151));
  const antenna=cyl(.022,.18,materials.chrome,.1,.82,-.05);g.add(antenna);const tip=new THREE.Mesh(new THREE.SphereGeometry(.04,8,6),trim);tip.position.set(.1,.93,-.05);g.add(tip);
  for(const s of [-1,1]){const wheel=cyl(.13,.11,materials.rubber,s*.33,.16,0);wheel.rotation.z=Math.PI/2;g.add(wheel);}
  // Small articulated grabbers identify the collection robot immediately.
  for(const s of [-1,1]){g.add(box(.055,.07,.24,materials.chrome,s*.21,.25,.35));g.add(box(.055,.07,.1,trim,s*.15,.25,.48));}
 }else{
  g.add(box(.59,.24,.65,dark,0,.22,0));g.add(box(.49,.28,.56,white,0,.43,0));g.add(box(.51,.045,.58,trim,0,.59,0));
  g.add(cyl(.055,.37,materials.chrome,0,.77,-.06));g.add(box(.39,.17,.29,white,0,.99,-.06));g.add(box(.31,.09,.04,dark,0,1,.1));
  for(const s of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.034,8,8),trim);eye.position.set(s*.095,1,.13);g.add(eye);for(const z of [-.23,.23]){const wheel=cyl(.12,.10,materials.rubber,s*.31,.16,z);wheel.rotation.z=Math.PI/2;g.add(wheel);}}
  const arm=new THREE.Group();arm.position.set(.28,.59,0);arm.add(box(.045,.28,.045,materials.chrome,0,.1,0));arm.add(box(.24,.045,.045,materials.chrome,.09,.24,0));arm.add(box(.05,.13,.05,trim,.19,.19,0));g.add(arm);
 }
 const halo=glowingDisc(glowTex,accent,.86);g.add(halo);
 const cargo=box(.22,.18,.22,mat(0xcea978,.2,.7),0,.62,-.15);cargo.visible=false;g.add(cargo);
 const selected=new THREE.Mesh(new THREE.RingGeometry(.54,.575,48),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));selected.rotation.x=-Math.PI/2;selected.position.y=.055;selected.visible=false;g.add(selected);
 return {group:g,halo,cargo,selected,accent};}
export class HomeView{
 constructor(host,world,callbacks={}){this.host=host;this.site=world;this.callbacks=callbacks;this.worlds=[];this.layer='robots';this.selected=null;this.selectedWorld=0;this.frame=0;this.overhead=false;this.editing=false;this.selectedTask=null;this._editGesture=null;this._cursorBeforeEdit='';this.glow=glowTexture();this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.16;this.renderer.setClearColor(0x080c17,0);host.appendChild(this.renderer.domElement);this.camera=new THREE.OrthographicCamera(-15,15,15,-15,.1,300);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minZoom=.55;this.controls.maxZoom=4;this.controls.minPolarAngle=.06;this.controls.maxPolarAngle=Math.PI*.47;this.controls.target.set(0,0,0);this.controls.panSpeed=.6;this.controls.rotateSpeed=.55;this.ray=new THREE.Raycaster();this.ndc=new THREE.Vector2();this.ground=new THREE.Plane(new THREE.Vector3(0,1,0),-.05);this.pointer=null;const canvas=this.renderer.domElement;
 canvas.addEventListener('pointerdown',e=>this.pointerDown(e),{capture:true});
 canvas.addEventListener('pointermove',e=>this.pointerMove(e),{capture:true});
 canvas.addEventListener('pointerup',e=>this.pointerUp(e),{capture:true});
 canvas.addEventListener('pointercancel',e=>this.pointerCancel(e),{capture:true});
 canvas.addEventListener('lostpointercapture',e=>this.pointerCancel(e),{capture:true});
 canvas.addEventListener('pointerleave',()=>{if(this.editing&&!this._editGesture)this.setEditCursor(this.selectedTask?'crosshair':'default');});
this._observer=new ResizeObserver(()=>this.resize());this._observer.observe(host);this.resetCamera();this.resize();}
 resetCamera(){this.camera.position.set(19,28,30);this.camera.zoom=1.16;this.controls.target.set(0,0,0);this.camera.lookAt(this.controls.target);this.controls.update();this.overhead=false;this.resize();}
 zoom(n){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*n,.55,4);this.camera.updateProjectionMatrix();}
 top(){this.overhead=!this.overhead;const t=this.controls.target;this.camera.position.set(t.x+(this.overhead?0:19),this.overhead?40:28,t.z+(this.overhead?.001:30));this.camera.lookAt(t);this.controls.update();}
 resize(){this.width=this.host.clientWidth;this.height=this.host.clientHeight;if(!this.width||!this.height)return;this.renderer.setSize(this.width,this.height);this.resizeCamera();}
 resizeCamera(){if(!this.width||!this.height)return;const aspect=this.width/Math.max(1,this.worlds.length)/this.height;const span=Math.max(25,36/aspect);this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();}
 select(id,index=0){this.selected=id;this.selectedWorld=index;}
 setLayer(layer){this.layer=layer;}
 /** Edit API: placement validation is pure; only onTaskMove commits application state. */
 setEditing(enabled){
  const next=Boolean(enabled);if(next===this.editing){this.refreshEditHighlights();return;}
  this.cancelEditGesture();this.pointer=null;
  if(next)this._cursorBeforeEdit=this.renderer.domElement.style.cursor;
  this.editing=next;this.renderer.domElement.dataset.editing=String(next);
  this.renderer.domElement.style.cursor=next?(this.selectedTask?'crosshair':'default'):this._cursorBeforeEdit;
  this.refreshEditHighlights();
 }
 selectTask(id){
  if(this._editGesture&&this._editGesture.id!==id)this.cancelEditGesture();
  this.selectedTask=id??null;this.refreshEditHighlights();
  if(this.editing&&!this._editGesture)this.setEditCursor(this.selectedTask?'crosshair':'default');
 }
 setSimulations(primary,baseline=null){
  this.cancelEditGesture();for(const w of this.worlds)this.disposeWorld(w);
  this.worlds=baseline?[this.makeWorld(baseline),this.makeWorld(primary)]:[this.makeWorld(primary)];
  this.resizeCamera();this.refreshEditHighlights();
 }
 setEditCursor(cursor){if(this.editing)this.renderer.domElement.style.cursor=cursor;}
 pointerContext(e,forcedIndex){
  const rect=this.renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;
  const localX=e.clientX-rect.left,index=forcedIndex??(this.worlds.length===2&&localX>rect.width/2?1:0),w=this.worlds[index];if(!w)return null;
  const width=rect.width/this.worlds.length;this.ndc.set((localX-index*width)/width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  this.camera.updateMatrixWorld();this.ray.setFromCamera(this.ndc,this.camera);const point=new THREE.Vector3();
  const hit=this.ray.ray.intersectPlane(this.ground,point);
  return {w,index,rect,width,point:hit?{x:point.x,y:-point.z}:null};
 }
 taskAtPointer(e,context){
  if(!context)return null;const {w,rect,width,index}=context;
  // A screen-space target stays usable when the entire apartment fits a phone.
  let best=null,bestDistance=e.pointerType==='touch'?25:18;
  for(const task of w.sim.tasks||[]){
   const group=w.tasks.get(task.id);if(!group)continue;
   const p=V(task.x,task.y,.09).project(this.camera);if(p.z< -1||p.z>1)continue;
   const sx=rect.left+index*width+(p.x+1)*width/2,sy=rect.top+(1-p.y)*rect.height/2;
   const d=Math.hypot(e.clientX-sx,e.clientY-sy);if(d<bestDistance){bestDistance=d;best=task;}
  }
  return best;
 }
 validatePlacement(id,x,y,index=0){
  if(!Number.isFinite(x)||!Number.isFinite(y))return {valid:false,message:'Choose a point on the apartment floor.'};
  try{
   if(this.callbacks.validateTaskPosition){const result=this.callbacks.validateTaskPosition({id,x,y});return typeof result==='boolean'?{valid:result,message:result?'':'Choose clear floor space.'}:{valid:result?.valid===true,message:result?.message||'Choose clear floor space.'};}
   const sim=this.worlds[index]?.sim;if(!sim?.isWalkable(x,y,.32))return {valid:false,message:'Choose clear floor space, away from walls and furniture.'};
   if((sim.tasks||[]).some(t=>t.id!==id&&Math.hypot(t.x-x,t.y-y)<.7))return {valid:false,message:'Leave some space between chores.'};
   return {valid:true,message:''};
  }catch{return {valid:false,message:'That position could not be validated. Try another point.'};}
 }
 pointerDown(e){
  if(e.button!==0&&e.pointerType!=='touch')return;
  if(!this.editing){this.pointer={x:e.clientX,y:e.clientY,id:e.pointerId};return;}
  if(this._editGesture){if(e.pointerId!==this._editGesture.pointerId){e.preventDefault();e.stopImmediatePropagation();}return;}
  const context=this.pointerContext(e);if(!context?.point)return;
  const task=this.taskAtPointer(e,context);
  if(!task){this.pointer={x:e.clientX,y:e.clientY,id:e.pointerId,world:context.index,floor:true};return;}
  // Capture before OrbitControls sees the event: dragging a chore must not orbit.
  e.preventDefault();e.stopImmediatePropagation();this.pointer=null;
  this.selectTask(task.id);this.callbacks.onTaskSelect?.(task.id);
  const w=this.worlds[context.index],current=w?.sim.tasks?.find(t=>t.id===task.id);if(!current||!this.editing)return;
  const controlsEnabled=this.controls.enabled;this.controls.enabled=false;
  this._editGesture={id:task.id,index:context.index,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,original:{x:current.x,y:current.y},point:{x:current.x,y:current.y},offset:{x:current.x-context.point.x,y:current.y-context.point.y},dragging:false,validation:{valid:true,message:''},controlsEnabled};
  try{this.renderer.domElement.setPointerCapture(e.pointerId);}catch{}
  this.setEditCursor('grab');this.refreshEditHighlights();
 }
 pointerMove(e){
  if(!this.editing)return;const gesture=this._editGesture;
  if(gesture){
   if(gesture.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
   if(!gesture.dragging&&Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)<5)return;
   gesture.dragging=true;const context=this.pointerContext(e,gesture.index);
   if(!context?.point){gesture.validation={valid:false,message:'Choose a point on the apartment floor.'};this.setEditCursor('not-allowed');this.refreshEditHighlights();return;}
   gesture.point={x:Math.round((context.point.x+gesture.offset.x)*100)/100,y:Math.round((context.point.y+gesture.offset.y)*100)/100};
   gesture.validation=this.validatePlacement(gesture.id,gesture.point.x,gesture.point.y,gesture.index);
   const group=context.w.tasks.get(gesture.id);group?.position.copy(V(gesture.point.x,gesture.point.y));
   this.setEditCursor(gesture.validation.valid?'grabbing':'not-allowed');this.refreshEditHighlights();return;
  }
  if(this.pointer)return;const context=this.pointerContext(e),task=this.taskAtPointer(e,context);this.setEditCursor(task?'grab':this.selectedTask?'crosshair':'default');
 }
 pointerUp(e){
  const gesture=this._editGesture;
  if(this.editing&&gesture&&gesture.pointerId===e.pointerId){
   e.preventDefault();e.stopImmediatePropagation();const move=gesture.dragging?{id:gesture.id,...gesture.point}:null,index=gesture.index;
   this.cancelEditGesture();if(move)this.commitTaskMove(move,index);return;
  }
  const pointer=this.pointer;this.pointer=null;if(!pointer||pointer.id!==e.pointerId||Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>=6)return;
  if(!this.editing){this.pick(e);return;}
  const context=this.pointerContext(e,pointer.world);if(!context?.point)return;
  const task=this.taskAtPointer(e,context);if(task){this.selectTask(task.id);this.callbacks.onTaskSelect?.(task.id);return;}
  if(this.selectedTask)this.commitTaskMove({id:this.selectedTask,x:Math.round(context.point.x*100)/100,y:Math.round(context.point.y*100)/100},context.index);
 }
 pointerCancel(e){
  if(this._editGesture?.pointerId===e.pointerId)this.cancelEditGesture();
  if(this.pointer?.id===e.pointerId)this.pointer=null;
 }
 cancelEditGesture(){
  const gesture=this._editGesture;if(!gesture)return;this._editGesture=null;
  const group=this.worlds[gesture.index]?.tasks.get(gesture.id);group?.position.copy(V(gesture.original.x,gesture.original.y));
  this.controls.enabled=gesture.controlsEnabled;
  try{if(this.renderer.domElement.hasPointerCapture(gesture.pointerId))this.renderer.domElement.releasePointerCapture(gesture.pointerId);}catch{}
  this.setEditCursor(this.selectedTask?'crosshair':'default');this.refreshEditHighlights();
 }
 commitTaskMove(move,index=0){
  const validation=this.validatePlacement(move.id,move.x,move.y,index);
  if(!validation.valid){this.callbacks.onTaskInvalid?.(validation.message);this.refreshEditHighlights();return false;}
  try{
   if(!this.callbacks.onTaskMove||this.callbacks.onTaskMove(move)===false){this.callbacks.onTaskInvalid?.('The chore could not be moved. Choose another position.');this.refreshEditHighlights();return false;}
   this.selectedTask=move.id;this.refreshEditHighlights();return true;
  }catch{this.callbacks.onTaskInvalid?.('The chore could not be moved. Please try again.');this.refreshEditHighlights();return false;}
 }
 refreshEditHighlights(){
  for(let index=0;index<this.worlds.length;index++){
   const w=this.worlds[index],editor=w.editor;if(!editor)continue;
   editor.root.visible=this.editing;const task=w.sim.tasks?.find(t=>t.id===this.selectedTask);
   editor.selection.visible=this.editing&&!!task;editor.origin.visible=false;
   if(task){const gesture=this._editGesture?.id===task.id&&this._editGesture.index===index?this._editGesture:null,p=gesture?.dragging?gesture.point:task;
    editor.selection.position.copy(V(p.x,p.y,.095));const valid=!gesture?.dragging||gesture.validation.valid;
    editor.material.color.setHex(valid?0xdfff89:0xff657a);editor.selection.scale.setScalar(gesture?.dragging?1.07:1);
    if(gesture?.dragging){editor.origin.visible=true;editor.origin.position.copy(V(gesture.original.x,gesture.original.y,.085));}
   }
   for(const t of w.sim.tasks||[]){const object=w.tasks.get(t.id);if(object)object.visible=this.editing||!['complete','carried'].includes(t.status);}
  }
 }

 disposeWorld(w){w.scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map&&m.map!==this.glow)m.map.dispose();m.dispose();}if(o.shadow?.map)o.shadow.map.dispose();});w.environment?.dispose();}
 environment(){const s=new THREE.Scene();s.background=new THREE.Color(0x253244);const emit=c=>new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide});const panel=(w,h,x,y,z,c,ry=0,rx=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),emit(c));m.position.set(x,y,z);m.rotation.set(rx,ry,0);s.add(m);};panel(12,3,0,8,-8,0xb4d4ef);panel(16,5,0,4,8,0x476a95,Math.PI);panel(5,12,-9,3,0,0x75bed5,Math.PI/2);panel(5,12,9,3,0,0x755b92,-Math.PI/2);panel(12,12,0,9,0,0x9fb8d1,0,Math.PI/2);const pm=new THREE.PMREMGenerator(this.renderer),r=pm.fromScene(s,.08);pm.dispose();s.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return r;}
 makeWorld(sim){const scene=new THREE.Scene(),env=this.environment();scene.environment=env.texture;scene.add(new THREE.HemisphereLight(0xc8e4ff,0x0a1025,2.2));const key=new THREE.DirectionalLight(0xc7e4ff,2.6);key.position.set(-10,24,18);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:2,far:65});key.shadow.bias=-.0002;key.shadow.normalBias=.045;scene.add(key);const rim=new THREE.DirectionalLight(0xb49bff,1.6);rim.position.set(15,10,-12);scene.add(rim);const cyan=new THREE.PointLight(C.cyan,19,15,2);cyan.position.set(-5,3,5);scene.add(cyan);const pink=new THREE.PointLight(0x9b78ff,14,15,2);pink.position.set(7,3,-5);scene.add(pink);const warm=new THREE.PointLight(C.amber,24,12,2);warm.position.set(6.0,2.4,-3.8);scene.add(warm);
 const m={steel:mat(0x7a8da0,.88,.3),edge:mat(0xb4c3cd,.95,.22),black:mat(0x152231,.72,.37),chrome:mat(0xd0dce1,.95,.19),rubber:mat(0x080e17,.05,.95),robot:mat(0xc9d6dc,.8,.24),fabric:mat(0x3f4a63,.04,.96),soft:mat(0x9ca9b8,.04,.9),glass:new THREE.MeshPhysicalMaterial({color:0x8cddff,metalness:.15,roughness:.12,transparent:true,opacity:.19,side:THREE.DoubleSide,depthWrite:false}),cyan:mat(C.cyan,.3,.35,C.cyan,1.1),amber:mat(C.amber,.25,.4,C.amber,.7),violet:mat(C.violet,.4,.35,C.violet,.75)};
 // A machined presentation plinth, with recessed chassis and illuminated perimeter.
 const base=box(22.2,.54,17.2,m.steel,0,-.52,0);scene.add(base,edges(base,0xd9edff,.22));scene.add(box(21.4,.18,16.4,m.black,0,-.85,0));scene.add(box(21.9,.025,16.9,m.cyan,0,-.23,0));scene.add(box(21.76,.07,16.76,m.black,0,-.18,0));
 for(const x of [-10.65,10.65])for(const z of [-8.15,8.15]){scene.add(cyl(.12,.04,m.black,x,-.21,z));scene.add(box(.13,.015,.025,m.edge,x,-.18,z));}
 // Brushed strips and serial markings give the chassis a material scale.
 for(let i=0;i<36;i++){const q=box(21.3,.002,.006,new THREE.MeshBasicMaterial({color:0xc5d4dd,transparent:true,opacity:.12}),0,-.239,-8.36+i*.009);scene.add(q);}const plate=box(4.7,.25,.025,m.black,-6.9,-.5,8.62);scene.add(plate);const serial=new THREE.Mesh(new THREE.PlaneGeometry(4.3,.3),new THREE.MeshBasicMaterial({map:textTexture('HOMEFRAME / UNIT 01','#98bfd8',true),transparent:true}));serial.position.set(-6.9,-.5,8.64);scene.add(serial);
 for(const room of this.site.rooms){scene.add(prism(room.polygon,.08,mat(room.color,.47,.56),-.09));const pts=[...room.polygon,room.polygon[0]].map(p=>V(p[0],p[1],.006));scene.add(line(pts,0x4b657b,.6));scene.add(floorText(room.label,room.labelAt.x,room.labelAt.y,.35,'#637f94'));}
 const floorGrid=[];for(let x=-9.5;x<10;x+=.5)floorGrid.push(V(x,-7.38,.006),V(x,7.38,.006));for(let y=-7;y<7.5;y+=.5)floorGrid.push(V(-9.88,y,.006),V(9.88,y,.006));scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(floorGrid),new THREE.LineBasicMaterial({color:0x7ba5c0,transparent:true,opacity:.075})));
 for(const o of this.site.walls){const wall=prism(o.polygon,o.height,m.steel,.01);scene.add(wall,edges(wall,0xc3e4fa,.3));const top=prism(o.polygon,.025,m.edge,o.height+.015);scene.add(top);if(o.w>.4)scene.add(box(o.w-.04,.018,.025,m.cyan,o.x,.16,-o.y+.13));else scene.add(box(.025,.018,o.h-.04,m.cyan,o.x+.13,.16,-o.y));}
 // Back wall glazing and service panels. These are decorative within blocked walls.
 for(const x of [-7.4,-4.1,4.5,7.8]){scene.add(box(2.55,1.35,.07,m.black,x,1.8,-7.34));scene.add(box(2.37,1.2,.04,m.glass,x,1.8,-7.29));for(const sx of [-.75,0,.75])scene.add(box(.025,1.2,.03,m.edge,x+sx,1.8,-7.25));scene.add(box(2.38,.025,.04,m.cyan,x,1.18,-7.24));}
 const rug=box(5.1,.025,5.0,mat(0x283b50,.05,.96),-6.0,.025,4.6);scene.add(rug);for(let i=0;i<12;i++)scene.add(box(4.9,.002,.014,new THREE.MeshBasicMaterial({color:0x93c4d1,transparent:true,opacity:.12}),-6,.04,2.24+i*.42));
 const benches=[];for(const o of this.site.furniture){const g=this.furnish(o,m);g.position.copy(V(o.x,o.y,0));g.userData.obstacleId=o.id;scene.add(g);benches.push(g);}
 // Localized luminous floor accents emphasize the domestic systems and doorway thresholds.
 for(const room of this.site.rooms){const col=room.id==='bedroom'?C.violet:room.id==='bath'?C.amber:C.cyan;const q=room.polygon;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];scene.add(line([V(a[0],a[1],.025),V(b[0],b[1],.025)],col,.42));}}
 for(const p of [{x:-1,y:-3.9,c:C.cyan},{x:-1,y:3,c:C.cyan},{x:2.5,y:-3.9,c:C.violet},{x:2.5,y:3,c:C.amber}]){const light=glowingDisc(this.glow,p.c,1.2,p.x,p.y);light.material.opacity=.75;light.scale.set(.72,1.1,1);scene.add(light);}
 scene.add(floorText('SORT + CHARGE',.05,4.9,.22,'#66dcf5'));
 // Door threshold lights match openings in the physical collision world.
 for(const l of this.site.landmarks.filter(l=>l.kind==='door')){const vertical=l.id.startsWith('door-');const strip=box(vertical?.07:1.55,.025,vertical?1.55:.07,l.id.includes('utility')?m.amber:l.id.includes('bedroom')?m.violet:m.cyan,l.x,.035,-l.y);scene.add(strip);}
 for(const p of this.site.portals){const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.46,48),new THREE.MeshBasicMaterial({color:p.kind==='charger'?C.amber:C.cyan,transparent:true,opacity:.8,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.copy(V(p.x,p.y,.03));scene.add(ring);}
 const tasks=new Map();for(const t of sim.tasks||this.site.tasks){const g=this.taskObject(t,m);g.position.copy(V(t.x,t.y,0));scene.add(g);tasks.set(t.id,g);}
 const editorRoot=new THREE.Group(),editMaterial=new THREE.MeshBasicMaterial({color:0xdfff89,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false,depthTest:false});
 const editSelection=new THREE.Group(),editRing=new THREE.Mesh(new THREE.RingGeometry(.56,.61,48),editMaterial);editRing.rotation.x=-Math.PI/2;editSelection.add(editRing);
 for(const [x,y] of [[-.77,0],[.77,0],[0,-.77],[0,.77]]){const tick=box(x?.24:.035,.012,y?.24:.035,editMaterial,x,0,y);tick.castShadow=false;tick.receiveShadow=false;editSelection.add(tick);}
 editSelection.renderOrder=10;editSelection.traverse(o=>{o.renderOrder=10;});editorRoot.add(editSelection);
 const editOrigin=new THREE.Mesh(new THREE.RingGeometry(.47,.49,40),new THREE.MeshBasicMaterial({color:0xc2d0df,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}));editOrigin.rotation.x=-Math.PI/2;editorRoot.add(editOrigin);editorRoot.visible=false;scene.add(editorRoot);
 const editor={root:editorRoot,selection:editSelection,origin:editOrigin,material:editMaterial};
 const robots=new Map();for(const a of sim.agents){const r=robot(a.type,m,this.glow);r.group.userData.agentId=a.id;r.group.traverse(o=>{o.userData.agentId=a.id;});scene.add(r.group);robots.set(a.id,r);}
 const trail=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.68,depthWrite:false}));trail.frustumCulled=false;scene.add(trail);const route=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:C.cyan,transparent:true,opacity:.9,dashSize:.18,gapSize:.12,depthWrite:false}));route.frustumCulled=false;scene.add(route);
 const g=sim.grid,canvas=document.createElement('canvas');canvas.width=g.cols;canvas.height=g.rows;const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;const width=g.cols*g.cellSize,height=g.rows*g.cellSize;const overlay=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.75}));overlay.rotation.x=-Math.PI/2;overlay.position.copy(V(g.minX+width/2,g.minY+height/2,.06));scene.add(overlay);
 const landmarkMarks=new THREE.Group(),landmarkGeometry=new THREE.OctahedronGeometry(.085,0),landmarkMaterial=new THREE.MeshBasicMaterial({color:C.violet,transparent:true,opacity:.85});scene.add(landmarkMarks);const fov=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:C.cyan,transparent:true,opacity:.5,depthWrite:false}));scene.add(fov);return {scene,sim,environment:env,robots,tasks,trail,route,overlay,canvas,texture,landmarkMarks,landmarkGeometry,landmarkMaterial,fov,editor,materials:m};}
 furnish(o,m){const g=new THREE.Group(),w=o.w,d=o.h;const b=(ww,hh,dd,ma,x=0,y=0,z=0)=>g.add(box(ww,hh,dd,ma,x,y,z));
 switch(o.kind){
 case 'sofa':b(w,.25,d,m.black,0,.21);b(w-.12,.3,d-.12,m.fabric,0,.47);b(.23,.48,d,m.fabric,-w/2+.08,.69);for(let z=-d/2+.55;z<d/2;z+=.97)b(w-.3,.12,.89,m.soft,.06,.66,z);b(w,.31,.22,m.fabric,0,.67,-d/2+.05);b(w,.31,.22,m.fabric,0,.67,d/2-.05);break;
 case 'table':b(w,.08,d,m.edge,0,.43);b(w-.08,.035,d-.08,m.black,0,.487);for(const x of [-w*.38,w*.38])for(const z of [-d*.32,d*.32])b(.035,.4,.035,m.chrome,x,.21,z);b(.34,.025,.27,mat(0x71658a,.1,.8),.3,.52,.15);g.add(cyl(.11,.13,m.soft,-.3,.56,-.15));break;
 case 'console':b(w,.55,d,m.black,0,.29);b(w*.8,.025,d*.7,m.edge,0,.58);b(w*.8,.62,.04,m.black,0,.95,-d*.2);b(w*.74,.52,.01,m.glass,0,.95,-d*.2+.03);b(w*.32,.018,.03,m.cyan,0,.66,-d*.2+.045);break;
 case 'plant':g.add(cyl(.24,.45,m.steel,0,.25,0,.19));for(let i=0;i<7;i++){const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,1),mat(0x31585f,.1,.8));leaf.scale.set(.6,1.8,.6);leaf.rotation.z=(i-3)*.22;leaf.position.set(Math.sin(i*2.4)*.18,.85+Math.cos(i)*.2,Math.cos(i*2.4)*.18);g.add(leaf);}break;
 case 'counter':case 'island':b(w,.85,d,m.black,0,.43);b(w+.05,.075,d+.05,m.edge,0,.91);b(w-.04,.025,.025,m.cyan,0,.83,d/2+.015);for(let x=-w/2+.5;x<w/2;x+=.85)b(.014,.63,.025,m.steel,x,.43,d/2+.018);if(o.id==='kitchen-back'){b(1.1,.018,.68,m.black,-1.0,.96);for(const x of [-1.22,-.78])for(const z of [-.17,.17])g.add(cyl(.12,.012,m.chrome,x,.977,z));b(.9,.025,.62,m.black,1.35,.97);b(.7,.025,.44,m.steel,1.35,.982);b(.035,.34,.035,m.chrome,1.35,1.12,-.25);b(.035,.035,.25,m.chrome,1.35,1.28,-.14);}if(o.kind==='island'){b(.6,.06,.36,m.black,-.5,1,.1);b(.12,.22,.12,m.soft,.6,1.08,0);}break;
 case 'stool':g.add(cyl(.27,.08,m.soft,0,.65));g.add(cyl(.035,.6,m.chrome,0,.32));g.add(cyl(.22,.035,m.black,0,.035));break;
 case 'fridge':b(w,2.0,d,m.steel,0,1);b(w-.08,1.14,.035,m.edge,0,1.36,d/2+.025);b(w-.08,.68,.035,m.edge,0,.39,d/2+.025);b(.025,.45,.055,m.black,w*.32,1.3,d/2+.06);b(.18,.15,.035,m.black,-w*.18,1.5,d/2+.06);b(.12,.025,.01,m.cyan,-w*.18,1.51,d/2+.086);break;
 case 'bed':b(w,.3,d,m.black,0,.22);b(w-.1,.25,d-.12,m.soft,0,.47);b(w+.1,.8,.14,m.fabric,0,.52,d/2-.02);b(w-.18,.07,d*.58,mat(0x556080,.03,.95),0,.63,-d*.15);for(const x of [-w*.24,w*.24])b(w*.4,.12,.7,mat(0xc2c7cc,.02,.9),x,.69,d*.31);b(w,.015,.025,m.violet,0,.2,-d/2-.02);break;
 case 'nightstand':b(w,.58,d,m.steel,0,.3);b(w*.75,.014,.02,m.black,0,.4,d/2+.02);g.add(cyl(.13,.025,m.chrome,0,.61));g.add(cyl(.025,.35,m.chrome,0,.8));g.add(cyl(.18,.15,m.soft,0,.96,0,.24));break;
 case 'wardrobe':case 'cabinet':b(w,o.height,d,m.steel,0,o.height/2);for(const x of [-w*.24,w*.24]){b(w*.46,o.height-.1,.025,m.black,x,o.height/2,d/2+.02);b(.025,.32,.04,m.chrome,x*.2,o.height*.5,d/2+.05);}break;
 case 'desk':b(w,.06,d,m.edge,0,.78);for(const x of [-w*.4,w*.4])b(.05,.75,d*.8,m.chrome,x,.4);b(.65,.04,.4,m.black,0,.83);const screen=box(.62,.4,.025,m.black,0,1.04,-.17);screen.rotation.x=-.1;g.add(screen);b(.56,.32,.01,m.glass,0,1.04,-.145);break;
 case 'shower':b(w,.09,d,m.soft,0,.07);b(w-.16,.025,d-.16,m.black,0,.13);b(.035,1.7,d,m.glass,-w/2+.02,.9);b(w,1.7,.035,m.glass,0,.9,d/2-.02);b(.03,1.8,.03,m.chrome,-w/2+.02,.92,d/2-.02);g.add(cyl(.12,.025,m.chrome,0,.153));break;
 case 'vanity':b(w,.76,d,m.black,0,.4);b(w+.05,.09,d+.04,m.soft,0,.85);b(.85,.025,.65,m.steel,0,.91);g.add(cyl(.025,.22,m.chrome,0,1.01,-.34));b(.03,.03,.22,m.chrome,0,1.12,-.25);b(w*.85,1.05,.035,m.glass,0,1.66,-d/2);break;
 case 'toilet':g.add(cyl(.28,.42,m.soft,0,.25,.15,.24));g.add(cyl(.33,.08,m.soft,0,.49,.15,.31));b(.56,.6,.25,m.soft,0,.52,-.4);break;
 case 'washer':case 'dryer':b(w,.95,d,m.soft,0,.5);b(w-.1,.11,.025,m.steel,0,.87,d/2+.02);const door=cyl(.31,.045,m.black,0,.43,d/2+.045);door.rotation.x=Math.PI/2;g.add(door);const glass=cyl(.235,.05,m.glass,0,.43,d/2+.073);glass.rotation.x=Math.PI/2;g.add(glass);b(.15,.025,.01,m.cyan,-.25,.88,d/2+.043);break;
 case 'dock':b(w,.16,d,m.black,0,.1);b(w,.35,.25,m.steel,0,.26,-d/2+.1);b(w*.8,.025,.025,o.id.includes('care')?m.amber:m.cyan,0,.42,-d/2+.24);for(const x of [-.15,.15])b(.12,.015,d*.6,m.chrome,x,.19,.1);break;
 default:b(w,o.height||.6,d,m.steel,0,(o.height||.6)/2);
 }return g;}
 taskObject(t,m){const g=new THREE.Group();if(t.kind==='clutter'){const ma=mat(0x9b879d,.25,.7);for(let i=0;i<3;i++){const q=box(.15+i*.035,.11,.18,ma,(i-1)*.17,.07,Math.sin(i*3)*.14);q.rotation.y=i*.8;g.add(q);}}else{const puddle=new THREE.Mesh(new THREE.CircleGeometry(t.kind==='leak'?.45:.37,32),new THREE.MeshPhysicalMaterial({color:t.kind==='leak'?0xff806a:0x62bde6,metalness:.7,roughness:.1,transparent:true,opacity:.55,depthWrite:false}));puddle.rotation.x=-Math.PI/2;puddle.scale.set(1,.7,1);puddle.position.y=.018;g.add(puddle);if(t.kind==='leak'){const droplet=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),m.amber);droplet.position.y=.43;g.add(droplet);}}
 const color=t.kind==='clutter'?C.cyan:t.kind==='leak'?0xff7869:C.amber;const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.42,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.028;g.add(ring);g.userData.ring=ring;g.userData.taskId=t.id;g.add(glowingDisc(this.glow,color,.7));g.traverse(o=>{o.userData.taskId=t.id;});return g;}
 updateWorld(w,index){const sim=w.sim;for(const a of sim.agents){let r=w.robots.get(a.id);if(!r){r=robot(a.type,w.materials,this.glow);w.scene.add(r.group);w.robots.set(a.id,r);}r.group.visible=a.active!==false;r.group.position.copy(V(a.x,a.y,0));r.group.rotation.y=(a.heading||0)+Math.PI/2;r.cargo.visible=!!a.carrying;r.selected.visible=!this.editing&&a.id===this.selected;r.halo.material.opacity=a.phase==='working'?.85:.45;r.halo.scale.setScalar(1+Math.sin(performance.now()*.002+Number(String(a.id).replace(/\D/g,'')))*.06);}
 for(const t of sim.tasks||[]){let o=w.tasks.get(t.id);if(!o){o=this.taskObject(t,w.materials);o.position.copy(V(t.x,t.y));w.scene.add(o);w.tasks.set(t.id,o);}if(!(this._editGesture?.id===t.id&&this._editGesture.index===index&&this._editGesture.dragging))o.position.copy(V(t.x,t.y));o.visible=this.editing||!['complete','carried'].includes(t.status);if(o.userData.ring){o.userData.ring.material.opacity=t.status==='working'?.95:.5+Math.sin(performance.now()*.003)*.18;o.userData.ring.scale.setScalar(t.status==='working'?1+Math.sin(performance.now()*.005)*.12:1);}}
 if(this.editing){w.trail.visible=false;w.route.visible=false;w.overlay.visible=false;w.fov.visible=false;w.landmarkMarks.visible=false;this.refreshEditHighlights();return;}w.landmarkMarks.visible=true;
 if(this.frame%6!==0)return;const selected=sim.agents.find(a=>a.id===this.selected),points=[],vertexColors=[];const showPaths=['paths','trails','routes'].includes(this.layer);for(const a of showPaths?sim.agents:selected?[selected]:[]){const color=new THREE.Color(a.type==='tidy'?C.cyan:C.amber);for(let j=1;j<(a.path||[]).length;j++){const p=a.path[j-1],q=a.path[j];points.push(V(p.x,p.y,.075),V(q.x,q.y,.075));vertexColors.push(color.r,color.g,color.b,color.r,color.g,color.b);}}w.trail.geometry.dispose();w.trail.geometry=new THREE.BufferGeometry().setFromPoints(points);w.trail.geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));w.trail.visible=points.length>0;const route=(selected?.route||[]).filter(p=>p&&typeof p==='object'&&Number.isFinite(p.x)).map(p=>V(p.x,p.y,.09));if(selected&&route.length)route.unshift(V(selected.x,selected.y,.09));w.route.geometry.dispose();w.route.geometry=new THREE.BufferGeometry().setFromPoints(route);w.route.computeLineDistances();w.route.visible=route.length>1;this.updateOverlay(w,selected);}
 updateOverlay(w,a){const g=w.sim.grid,x=w.canvas.getContext('2d');x.clearRect(0,0,g.cols,g.rows);const knowledge=['knowledge','memory','shared'].includes(this.layer),pressure=['pressure','stress','heatmap'].includes(this.layer),traffic=this.layer==='traffic';const counts=g.knowledgeCounts||[];let max=1;for(const n of traffic?(g.visits||[]):counts)max=Math.max(max,n);for(let i=0;i<g.cols*g.rows;i++){let c=null;if(traffic&&(g.visits?.[i]||0)>0){const t=Math.log1p(g.visits[i])/Math.log1p(max);c=`rgba(${Math.round(107+148*t)},${Math.round(222-48*t)},${Math.round(255-145*t)},${.13+.55*t})`;}else if(knowledge&&counts[i])c=`rgba(111,209,255,${.08+.5*counts[i]/max})`;else if(pressure&&(g.visits?.[i]||0)>0){const n=(g.pressure?.[i]||0)/Math.max(.001,g.visits[i]);c=`rgba(255,${Math.round(180-Math.min(1,n/80)*100)},100,.45)`;}else if(a?.visible?.has(i))c='rgba(97,226,255,.25)';else if(a?.known?.has(i))c='rgba(97,170,225,.045)';if(c){x.fillStyle=c;x.fillRect(i%g.cols,g.rows-1-Math.floor(i/g.cols),1,1);}}w.overlay.visible=knowledge||pressure||traffic||!!a;w.texture.needsUpdate=true;
 w.landmarkMarks.clear();if(a){for(const lm of a.landmarkMemory?.values?.()||[]){if(!Number.isFinite(lm.x))continue;const mark=new THREE.Mesh(w.landmarkGeometry,w.landmarkMaterial);mark.position.copy(V(lm.x,lm.y,.16));w.landmarkMarks.add(mark);}const boundary=[];const fov=a.fov??Math.PI*.7,vision=a.vision??4;boundary.push(V(a.x,a.y,.085));for(let k=0;k<=36;k++){const angle=(a.heading||0)-fov/2+fov*k/36;let d=0;for(let rr=.12;rr<=vision;rr+=.12){const px=a.x+Math.cos(angle)*rr,py=a.y+Math.sin(angle)*rr;if(w.sim.canSee&&!w.sim.canSee(a,px,py))break;d=rr;}boundary.push(V(a.x+Math.cos(angle)*d,a.y+Math.sin(angle)*d,.085));}boundary.push(V(a.x,a.y,.085));w.fov.geometry.dispose();w.fov.geometry=new THREE.BufferGeometry().setFromPoints(boundary);w.fov.visible=true;}else w.fov.visible=false;}
 render(){this.frame++;this.controls.update();this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,this.width,this.height);this.renderer.clear();for(let i=0;i<this.worlds.length;i++){const w=this.worlds[i];this.updateWorld(w,i);const width=this.width/this.worlds.length;this.renderer.setViewport(i*width,0,width,this.height);this.renderer.setScissor(i*width,0,width,this.height);this.renderer.setScissorTest(true);this.renderer.render(w.scene,this.camera);}this.renderer.setScissorTest(false);}
 pick(e){const r=this.renderer.domElement.getBoundingClientRect(),x=e.clientX-r.left,index=this.worlds.length===2&&x>r.width/2?1:0,w=this.worlds[index];if(!w)return;const width=r.width/this.worlds.length;this.ndc.set((x-index*width)/width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.ndc,this.camera);const robotGroups=[...w.robots.values()].map(r=>r.group);const hits=this.ray.intersectObjects(robotGroups,true);if(hits.length&&hits[0].object.userData.agentId){this.callbacks.onSelect?.(hits[0].object.userData.agentId,index);return;}const p=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.ground,p))return;let best=null,distance=.7/Math.sqrt(this.camera.zoom);for(const a of w.sim.agents){const d=Math.hypot(a.x-p.x,a.y+p.z);if(d<distance){distance=d;best=a;}}if(best)this.callbacks.onSelect?.(best.id,index);else this.callbacks.onGround?.(p.x,-p.z,index);}
 snapshot(){this.render();return this.renderer.domElement.toDataURL('image/png');}
}
export {HomeView as CityView,HomeView as RobotView};
