import * as THREE from './vendor/three.module.min.js';
import {buildAthlete,makeSurfaceTexture,softBoxGeometry,netGeometry,mergeRigidParts} from './art.mjs';
import {RALLY,hitZone,inHitRange} from './rally-core.mjs';

export function buildRallyWorld(){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e6d6');
 const camera=new THREE.PerspectiveCamera(40,.65,.1,100),matte=new Map();
 const material=color=>{if(!matte.has(color))matte.set(color,new THREE.MeshStandardMaterial({color,roughness:.82}));return matte.get(color);};
 const mesh=(geometry,color,parent=scene,x=0,y=0,z=0,shadow=true)=>{
  const o=new THREE.Mesh(geometry,typeof color==='string'?material(color):color);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o;
 };
 const box=(w,h,d,color,parent,x,y,z)=>mesh(softBoxGeometry(w,h,d,Math.min(.07,h*.4)),color,parent,x,y,z);
 scene.add(new THREE.HemisphereLight('#fff3dc','#6f8a73',2.1));
 const sun=new THREE.DirectionalLight('#fff2dd',2.7);sun.position.set(-6,13,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
 sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.025;scene.add(sun);
 const rim=new THREE.DirectionalLight('#cce6ef',.8);rim.position.set(5,8,-12);scene.add(rim);
 const ground=mesh(new THREE.PlaneGeometry(100,100),'#e7e6d6',scene,0,-.35,-5,false);ground.rotation.x=-Math.PI/2;
 box(9.3,.3,15.4,'#b9c3a8',scene,0,-.22,-5);
 box(9.1,.10,15.2,'#ece2c8',scene,0,-.055,-5);
 const texture=makeSurfaceTexture('turf'),field=new THREE.MeshStandardMaterial({color:'#2f7863',roughness:.95,map:texture});
 mesh(new THREE.BoxGeometry(8.15,.045,14.7),field,scene,0,-.01,-5,false);
 const stripeMat=new THREE.MeshStandardMaterial({color:'#377f69',roughness:.95,map:texture});
 for(let i=0;i<7;i++)mesh(new THREE.PlaneGeometry(8.1,.9),stripeMat,scene,0,.016,1.7-i*2,false).rotation.x=-Math.PI/2;
 const line=(x,z,w,d)=>mesh(new THREE.BoxGeometry(w,.012,d),'#f4efd3',scene,x,.022,-z,false);
 for(const x of [-RALLY.side,RALLY.side])line(x,5,.035,10);
 for(const z of [0,5,10])line(0,z,7.64,.035);
 for(const z of [2.6,7.4])line(0,z,7.64,.025);
 line(0,5,.025,4.8);
 for(const side of [-1,1]){
  box(.14,.30,14,'#9cac89',scene,side*(RALLY.side+.07),.15,-5);
  mesh(new THREE.CylinderGeometry(.04,.04,14,8),'#eee9d2',scene,side*(RALLY.side+.07),.40,-5,false).rotation.x=Math.PI/2;
 }
 const net=new THREE.Group();net.position.z=-RALLY.netZ;scene.add(net);
 for(const x of [-3.9,3.9])mesh(new THREE.CylinderGeometry(.055,.06,.73,10),'#eae6cc',net,x,.365,0);
 const grid=new THREE.LineSegments(netGeometry(3.82,RALLY.netHeight,RALLY.netHeight,0,.018),new THREE.LineBasicMaterial({color:'#e8ecd8',transparent:true,opacity:.58}));net.add(grid);
 box(7.8,.035,.035,'#fff3d5',net,0,RALLY.netHeight,0);
 mergeRigidParts(scene);

 function athlete(goalie){
  const a=buildAthlete({jersey:goalie?'#356f91':'#f6e9ce',accent:goalie?'#edc25e':'#ed774b',number:goalie?'1':'01',goalie});
  for(const arm of a.arms)mesh(new THREE.SphereGeometry(.105,12,8),a.skin,arm,0,-.44,0,false);
  const racket=new THREE.Group();racket.position.set(.015,-.43,-.025);a.arms[1].add(racket);
  mesh(new THREE.CylinderGeometry(.04,.04,.42,8),'#a68856',racket,0,.18,0);
  const paint=new THREE.MeshStandardMaterial({color:goalie?'#edc25e':'#ed774b',roughness:.45,emissive:'#ff7530',emissiveIntensity:0});
  const head=mesh(new THREE.TorusGeometry(.28,.032,6,28),paint,racket,0,.59,0);head.scale.y=1.25;
  const pts=[];for(let i=-2;i<=2;i++){const k=i*.085;pts.push(new THREE.Vector3(k,.39,0),new THREE.Vector3(k,.79,0),new THREE.Vector3(-.22,.59+k,0),new THREE.Vector3(.22,.59+k,0));}
  racket.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#f6e8c1'})));
  mergeRigidParts(a.group,{keep:o=>o===head||o.name==='jersey-number'});scene.add(a.group);
  return {...a,racket,head};
 }
 const near=athlete(false),far=athlete(true);far.group.rotation.y=Math.PI;
 const player=near.group,opponent=far.group;
 const ballPaint=new THREE.MeshStandardMaterial({color:'#ffd15b',roughness:.4}),ball=mesh(new THREE.SphereGeometry(RALLY.radius,18,12),ballPaint);
 const seams=new THREE.TorusGeometry(RALLY.radius,.006,4,28);
 for(const axis of [0,1]){const seam=mesh(seams,'#fff7d7',ball,0,0,0,false);if(axis===0)seam.rotation.x=Math.PI/2;else seam.rotation.y=Math.PI/2;}
 function flat(geometry,color,opacity,y){
  const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=y;scene.add(m);return m;
 }
 const shadow=flat(new THREE.CircleGeometry(.18,20),'#143e31',.3,.030);
 const landing=flat(new THREE.RingGeometry(.21,.27,32),'#e8edb6',.9,.036);
 const hitArea=flat(new THREE.PlaneGeometry(1,1),'#e5edc6',.10,.031);
 const sweetBand=flat(new THREE.PlaneGeometry(1,1),'#f4bd69',.4,.035);
 const chargeRing=flat(new THREE.RingGeometry(.43,.49,36),'#ff9452',.75,.033);chargeRing.visible=false;
 function update(s,reduceMotion=false){
  const phase=s.phase==='paused'?s.previousPhase:s.phase;
  player.position.set(s.player.x,0,-s.player.z);opponent.position.set(s.opponent.x,0,-s.opponent.z);
  const swing=s.swing?Math.sin(Math.min(1,s.swing.time/(RALLY.windup+RALLY.active))*Math.PI):0;
  near.torso.rotation.y=-swing*.3;near.arms[1].rotation.x=.25+swing*.9;near.arms[0].rotation.x=.25+swing*.2;near.racket.rotation.x=-1.05-swing*.85;
  const counterFlash=s.lastShot?.kind==='counter'&&s.lastShot.hitter==='player'&&s.elapsed-s.lastShot.at>=0&&s.elapsed-s.lastShot.at<.18;
  near.head.material.emissive.set('#64ddbb');near.head.material.emissiveIntensity=counterFlash?.85:0;
  const charging=s.opponent.heavy&&s.opponent.chargeAt!==null&&s.ball.hitter==='player'&&phase==='playing';
  const reply=Math.sin(Math.min(1,s.opponent.swing/.28)*Math.PI);
  far.torso.rotation.y=charging?-.45:reply*.25;
  far.arms[1].rotation.x=charging?-.75:.25+reply*.9;far.arms[0].rotation.x=charging?-.1:.25;far.racket.rotation.x=charging?.25:-1.05-reply*.85;
  far.head.material.emissiveIntensity=charging?.8:0;
  chargeRing.visible=!!charging;chargeRing.position.set(s.opponent.x,.033,-s.opponent.z);chargeRing.scale.setScalar(reduceMotion?1:1+.08*Math.sin(s.elapsed*10));
  ball.position.set(s.ball.x,s.ball.y,-s.ball.z);ball.rotation.set(s.elapsed*1.7,s.elapsed*1.1,0);
  ballPaint.color.set(s.ball.kind==='counter'?'#6dd4ba':s.ball.kind==='heavy'?'#ff8a42':'#ffd15b');
  shadow.position.set(s.ball.x,.030,-s.ball.z);shadow.scale.setScalar(1/(1+s.ball.y*.15));shadow.material.opacity=.32/(1+s.ball.y*.35);
  const first=s.flight?.firstBounce;
  landing.visible=!!first&&s.ball.hitter==='opponent'&&s.ball.bounces===0&&['playing','serving'].includes(phase);
  if(first)landing.position.set(first.x,.036,-first.z);
  const zone=hitZone(s),incoming=s.ball.hitter==='opponent'&&phase==='playing',ready=incoming&&inHitRange({...s,phase:'playing'});
  hitArea.visible=sweetBand.visible=['playing','serving'].includes(phase);hitArea.position.set(s.player.x,.031,-(zone.near+zone.far)/2);hitArea.scale.set(2*RALLY.width,Math.abs(zone.far-zone.near),1);hitArea.material.opacity=ready?.27:.09;
  sweetBand.position.set(s.player.x,.035,-zone.sweet);sweetBand.scale.set(2*RALLY.width,.11,1);sweetBand.material.opacity=ready?.85:.3;
 }
 function resize(aspect){
  camera.aspect=aspect;camera.updateProjectionMatrix();
  const target=new THREE.Vector3(0,.4,-5),offset=new THREE.Vector3(0,11,18),bounds=[];
  for(const x of [-3.95,3.95])for(const z of [0,10])bounds.push(new THREE.Vector3(x,0,-z));
  for(const x of [-3.95,3.95])bounds.push(new THREE.Vector3(x,RALLY.netHeight,-5));
  for(const x of [-3.45,3.45])for(const z of [RALLY.playerMinZ,RALLY.aiMaxZ])for(const y of [0,2.3])bounds.push(new THREE.Vector3(x,y,-z));
  let distance=.5;
  for(let i=0;i<150;i++){
   camera.position.copy(target).addScaledVector(offset,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
   if(bounds.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.94&&Math.abs(p.y)<.94;}))break;distance*=1.025;
  }
 }
 function project(x,z,y=0){const p=new THREE.Vector3(x,y,-z).project(camera);return {x:(p.x+1)*.5,y:(1-p.y)*.5};}
 resize(.65);
 return {scene,camera,player,opponent,ball,landing,hitArea,chargeRing,playerRacket:near.head,opponentRacket:far.head,opponentArms:far.arms,update,resize,project};
}
export function createRallyRenderer(canvas){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const world=buildRallyWorld();let width=0,height=0,nextWidth=canvas.clientWidth,nextHeight=canvas.clientHeight;
 const observer=new ResizeObserver(entries=>{nextWidth=entries[0].contentRect.width;nextHeight=entries[0].contentRect.height;});observer.observe(canvas);
 return {render(s,reduceMotion=false){if(!nextWidth||!nextHeight)return;if(width!==nextWidth||height!==nextHeight){width=nextWidth;height=nextHeight;renderer.setSize(width,height,false);world.resize(width/height);}world.update(s,reduceMotion);renderer.render(world.scene,world.camera);},
  dispose(){observer.disconnect();const geometries=new Set(),materials=new Set(),textures=new Set();world.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map)textures.add(m.map);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();renderer.dispose();}};
}
