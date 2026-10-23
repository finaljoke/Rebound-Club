import * as THREE from './vendor/three.module.min.js';
import {buildAthlete,buildGlove,makeSurfaceTexture,softBoxGeometry,netGeometry,mergeRigidParts,mergeMeshGeometry} from './art.mjs';
import {LEVELS,WEAPONS,SKILLS,ballHeight,hitZone,burstZone,swingPreview,skillStatus,spinPreview,predictFlight,goalLock,GOAL_CAM,KEEPER_Z,KEEPER_REACH,GOAL_Z,FAR_WALL,SIDE,PLAYER_Z} from './core.mjs';
import {hitFeel} from './ui.mjs';

// Rendering uses (x,height,-physicsDepth); the game simulation remains unchanged.
export function buildWorld(){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d7dfc5');
  const camera=new THREE.PerspectiveCamera(34,.85,.1,100);
  camera.position.set(2.8,18.5,9.8);camera.lookAt(0,.15,-4.6);
  const mats=new Map();
  const material=(color,roughness=.8)=>{const key=color+roughness;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness}));return mats.get(key);};
  const mesh=(geometry,color,parent=scene,x=0,y=0,z=0,shadow=true)=>{const m=new THREE.Mesh(geometry,typeof color==='string'?material(color):color);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
  const box=(sx,sy,sz,color,parent,x,y,z)=>mesh(new THREE.BoxGeometry(sx,sy,sz),color,parent,x,y,z);
  const softBox=(sx,sy,sz,color,parent,x,y,z,r=.06)=>mesh(softBoxGeometry(sx,sy,sz,r),color,parent,x,y,z);
  const sphere=(r,color,parent,x,y,z,sx=1,sy=1,sz=1)=>{const m=mesh(new THREE.SphereGeometry(r,20,14),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m;};
  const rod=(a,b,r,color,parent=scene)=>{const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),delta=v2.clone().sub(v1);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),color,parent);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;};
  // Court markings sit just above the stripe tops (y .030) so they never depth-fight with them, whatever the draw order.
  const floorLine=(x,z,width,depth,color='#e0e6c3')=>box(width,.016,depth,color,scene,x,.027,z);
  const hemisphere=new THREE.HemisphereLight('#fff3d7','#516a5a',2.0);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#fff0cc',3.1);sun.position.set(-7,15,5);sun.target.position.set(0,0,-4);scene.add(sun.target);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-10;sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
  const fill=new THREE.DirectionalLight('#dce9ee',.75);fill.position.set(7,8,-10);scene.add(fill);
  const ground=mesh(new THREE.PlaneGeometry(200,200),'#d7dfc5',scene,0,-.65,-4,false);ground.rotation.x=-Math.PI/2;ground.name='ground';
  const platform=softBox(10.3,.55,13.6,'#b5bda5',scene,0,-.3,-4.6,.13);platform.name='platform';
  const stone=makeSurfaceTexture('stone');
  softBox(10.45,.13,13.75,new THREE.MeshStandardMaterial({color:'#e5dfc5',map:stone,roughness:.95}),scene,0,-.08,-4.6,.04);
  const turf=makeSurfaceTexture('turf'),turfMaterials=new Map();
  function fieldMaterial(color){if(!turfMaterials.has(color))turfMaterials.set(color,new THREE.MeshStandardMaterial({color,map:turf,bumpMap:turf,bumpScale:.012,roughness:.94}));return turfMaterials.get(color);}
  const court=box(8.25,.06,10.2,fieldMaterial('#286659'),scene,0,-.015,-4.9);court.name='court';
  // Ten stripes, two tints: one mesh per tint, re-tinted per level (stripes[0] even rows, stripes[1] odd rows).
  const stripes=[0,1].map(parity=>{const rows=[];for(let i=parity;i<10;i+=2)rows.push(new THREE.Mesh(new THREE.BoxGeometry(8,.016,.97)).translateZ(-.45-i).translateY(.022));
    const m=new THREE.Mesh(mergeMeshGeometry(rows),fieldMaterial(parity?'#286659':'#2c6c5e'));rows.forEach(r=>r.geometry.dispose());m.name=`stripes-${parity}`;m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;});
  const paving=[];for(let z=-10.4;z<2;z+=1.45)for(const side of [-1,1])paving.push(new THREE.Vector3(side*4.35,-.008,z),new THREE.Vector3(side*5.07,-.008,z));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(paving),new THREE.LineBasicMaterial({color:'#c9c6ac',transparent:true,opacity:.5})));
  for(const x of [-3.75,3.75])floorLine(x,-4.9,.035,9.6);
  for(const z of [-.25,-4.9,-9.55])floorLine(0,z,7.5,.035);
  floorLine(-2.4,-1.25,.035,2);floorLine(2.4,-1.25,.035,2);floorLine(0,-2.25,4.8,.035);
  const centerRing=mesh(new THREE.RingGeometry(.95,.98,48),'#e0e6c3',scene,0,.036,-4.9,false);centerRing.rotation.x=-Math.PI/2;
  const centerDot=mesh(new THREE.CircleGeometry(.045,12),'#e0e6c3',scene,0,.038,-4.9,false);centerDot.rotation.x=-Math.PI/2;
  // Rails have real front/back faces; the lower beams don't hide the incoming ball.
  for(const x of [-4.2,4.2]){
    box(.18,.27,10.6,'#a6b599',scene,x,.15,-4.9);
    rod([x,.65,.4],[x,.65,-10.2],.045,'#ece9d5');
    for(let z=.3;z>=-10.3;z-=1.8)rod([x,.05,z],[x,.68,z],.045,'#eee9cf');
  }
  // The far wall is split around the goal mouth; both are rebuilt whenever the level's goal width changes.
  const farGoal=new THREE.Group();farGoal.position.set(0,0,-FAR_WALL);scene.add(farGoal);
  const farNet=new THREE.LineBasicMaterial({color:'#eee5cc',transparent:true,opacity:.4});
  let farNetLines=null,netRest=null,netDirty=false;
  function buildFarGoal(g){
    for(const child of [...farGoal.children]){farGoal.remove(child);if(child!==sign)child.geometry?.dispose();}
    const edge=SIDE+.4,span=edge-g;
    for(const side of [-1,1]){
      box(span,.32,.65,'#244d40',farGoal,side*(g+span/2),.17,-.3);
      box(span,.95,.32,'#cfdda8',farGoal,side*(g+span/2),.82,-.42);
      const post=rod([side*g,.02,.1],[side*g,1.25,.1],.07,'#fff2db',farGoal);post.name=side<0?'post-left':'post-right';post.position.x=side*g;
      rod([side*g,1.25,.1],[side*g,.9,-.75],.045,'#fff2db',farGoal);
      sphere(.078,'#e6ddc5',farGoal,side*g,1.25,.1,1,1,1).castShadow=false;
    }
    rod([-g,1.25,.1],[g,1.25,.1],.07,'#fff7e3',farGoal);
    rod([-g,.9,-.75],[g,.9,-.75],.045,'#e9e8c9',farGoal);
    farNetLines=new THREE.LineSegments(netGeometry(g,1.25,.9,.1,-.75),farNet);netRest=farNetLines.geometry.attributes.position.array.slice();netDirty=false;farGoal.add(farNetLines);
    if(sign){sign.position.set(0,1.62,-.5);farGoal.add(sign);}
    mergeRigidParts(farGoal);
  }
  function label(value,width,height,color='#2c5745',background=null){
    if(typeof document==='undefined')return null;
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
    if(background){ctx.fillStyle=background;ctx.fillRect(0,0,512,128);}ctx.fillStyle=color;ctx.font='bold 52px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,256,66);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:!background,depthWrite:false}));
  }
  const sign=label('REBOUND CLUB',2.9,.45);
  // A low transparent goal leaves the defender and the interception area visible.
  // The camera sits behind it, so it is drawn see-through: its crossbar and net never hide the defender or the ball.
  const goal=new THREE.Group();scene.add(goal);
  const ghost=(color,opacity)=>new THREE.MeshStandardMaterial({color,roughness:.7,transparent:true,opacity,depthWrite:false});
  const post=ghost('#fff2db',.42),bar=ghost('#fff7e3',.32),back=ghost('#e9e8c9',.28);
  for(const x of [-4,4]){
    rod([x,.02,.05],[x,1.04,.05],.065,post,goal);
    rod([x,1.04,.05],[x,.75,1.04],.045,back,goal);
    rod([x,.02,1.04],[x,.75,1.04],.045,back,goal);
  }
  rod([-4,1.04,.05],[4,1.04,.05],.065,bar,goal);
  rod([-4,.75,1.04],[4,.75,1.04],.045,back,goal);
  const netMat=new THREE.LineBasicMaterial({color:'#eee5cc',transparent:true,opacity:.16});
  goal.add(new THREE.LineSegments(netGeometry(4,1.04,.75,.05,1.04),netMat));
  for(const side of [-1,1]){const joint=sphere(.075,ghost('#e6ddc5',.4),goal,side*4,1.04,.05);joint.castShadow=false;const foot=softBox(.18,.05,.19,ghost('#7d8b72',.45),goal,side*4,.015,.05,.015);foot.castShadow=false;}
  goal.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  // Small bleachers, planted corners, and front steps establish scale and depth.
  for(const side of [-1,1]){
    for(let i=-1;i<=1;i++)softBox(.19,.095,3.1,'#d2b78a',scene,side*4.75+i*.21,.44,-7.6,.035);
    for(const z of [-6.45,-8.75]){softBox(.61,.39,.09,'#677c65',scene,side*4.75,.2,z,.025);rod([side*5.04,.2,z],[side*5.04,.91,z],.035,'#677c65');}
    softBox(.075,.22,3.1,'#d8bf97',scene,side*5.04,.8,-7.6,.025);
    for(const z of [-10.6,-3.4]){
      mesh(new THREE.CylinderGeometry(.45,.38,.34,18),'#d3bba0',scene,side*4.65,.13,z);
      const rim=mesh(new THREE.TorusGeometry(.44,.025,6,22),'#efe1c7',scene,side*4.65,.3,z,false);rim.rotation.x=Math.PI/2;
      sphere(.52,'#819d68',scene,side*4.65,.68,z,1,.9,1);
      sphere(.36,'#9ab47b',scene,side*4.83,.91,z+.1);
    }
  }
  for(let i=0;i<2;i++)box(2.4,.14, .55,'#c8ccb5',scene,2.0,-.43-i*.12,2.3+i*.45);
  // Everything above is static scenery: bake it into one mesh per material before any animated or pooled object exists.
  mergeRigidParts(scene);
  const courtText=label('REBOUND',4.4,.85,'#a7c5a2');if(courtText){courtText.rotation.x=-Math.PI/2;courtText.position.set(0,.04,-3.35);courtText.material.opacity=.22;scene.add(courtText);}
  // Shared articulated collectible athletes; visual parts stay under their joints.
  const player=buildAthlete({jersey:'#f6e9ce',accent:'#ed774b',number:'01'}),hero=player.group,torso=player.torso,legs=player.legs,arms=player.arms;
  const skin=player.skin;scene.add(hero);hero.position.set(0,0,-1.6);
  const goalie=buildAthlete({jersey:'#356f91',accent:'#edc25e',number:'1',goalie:true}),keeper=goalie.group;
  scene.add(keeper);keeper.rotation.y=Math.PI;keeper.position.set(0,0,-KEEPER_Z);
  for(let i=0;i<goalie.arms.length;i++){const g=buildGlove('#edc25e',i===0?-1:1);g.group.position.set(0,-.44,-.015);goalie.arms[i].add(g.group);}
  const leftHand=buildGlove('#ed6941',-1);leftHand.group.position.set(-.015,-.44,-.015);arms[0].add(leftHand.group);
  const leftGlove=leftHand.body;
  const gear={glove:new THREE.Group(),racket:new THREE.Group(),sword:new THREE.Group()};
  for(const g of Object.values(gear)){g.position.set(.02,-.43,-.025);arms[1].add(g);}
  gear.glove.add(buildGlove('#ed6941').group);
  rod([0,-.06,0],[0,.45,0],.045,'#c99d60',gear.racket);
  const racket=mesh(new THREE.TorusGeometry(.3,.035,8,36),'#edb85f',gear.racket,0,.65,0);racket.scale.set(1,1.3,1);racket.name='racket-head';
  for(let y=.02;y<.24;y+=.055)mesh(new THREE.CylinderGeometry(.048,.048,.022,10),'#345c4a',gear.racket,0,y,0,false);
  for(let p=-.2;p<=.201;p+=.1){rod([p,.43,-.005],[p,.87,-.005],.006,'#e9e4c4',gear.racket);rod([-.24,.65+p,-.005],[.24,.65+p,-.005],.006,'#e9e4c4',gear.racket);}
  rod([0,-.09,0],[0,.2,0],.055,'#345c4a',gear.sword);softBox(.38,.06,.12,'#e9c56f',gear.sword,0,.22,0,.025);
  for(let y=-.05;y<.16;y+=.06)mesh(new THREE.CylinderGeometry(.058,.058,.014,10),'#d5ba78',gear.sword,0,y,0,false);
  const blade=box(.105,.9,.045,material('#d8e6df',.25),gear.sword,0,.68,0);blade.rotation.z=-.03;blade.name='sword-blade';
  box(.025,.82,.054,'#f5f1d7',gear.sword,-.007,.68,0).castShadow=false;
  const tip=mesh(new THREE.ConeGeometry(.073,.23,4),material('#d8e6df',.25),gear.sword,0,1.24,0);tip.rotation.y=Math.PI/4;
  const lookedUp=new Set(['jersey-body','jersey-number','shoulder-sleeve','glove-body','racket-head','sword-blade']);
  for(const athlete of [hero,keeper])mergeRigidParts(athlete,{keep:o=>lookedUp.has(o.name)});
  const ball=new THREE.Group();scene.add(ball);
  // A power shot swells and burns orange-red for its whole flight, trail included.
  const ballMat=material('#ffbd35',.33),powerMat=new THREE.MeshStandardMaterial({color:'#ff5a24',roughness:.3,emissive:'#ff3d10',emissiveIntensity:.45});
  const ballBody=mesh(new THREE.SphereGeometry(.26,24,18),ballMat,ball);
  for(const axis of [0,1,2]){const seam=mesh(new THREE.TorusGeometry(.26,.009,5,40),'#7c5b2d',ball,0,0,0,false);if(axis===0)seam.rotation.x=Math.PI/2;if(axis===1)seam.rotation.y=Math.PI/2;}
  // Ground hints. Every shape is sized from the same numbers the rules use (hitZone, swingPreview, crossingFrom).
  const flat=(geometry,color,opacity,y)=>{const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false}));m.rotation.x=-Math.PI/2;m.position.y=y;m.renderOrder=5;scene.add(m);return m;};
  const unit=new THREE.PlaneGeometry(1,1);
  const zone={fill:flat(unit,'#e5efac',.1,.043),band:flat(unit,'#ff6a2b',.2,.046),edges:[0,1,2,3].map(()=>flat(unit,'#f6f8dc',.4,.048))};
  // Aim arrow: shaft plus head, pointing along local -z (towards the far goal).
  const aim=new THREE.Group();scene.add(aim);const aimMat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.85,depthWrite:false});
  const shaft=new THREE.Mesh(unit,aimMat);shaft.rotation.x=-Math.PI/2;shaft.scale.set(.09,1.7,1);shaft.position.set(0,.06,-1.05);aim.add(shaft);
  const headShape=new THREE.Shape();headShape.moveTo(-.22,0);headShape.lineTo(.22,0);headShape.lineTo(0,.42);headShape.lineTo(-.22,0);
  const head=new THREE.Mesh(new THREE.ShapeGeometry(headShape),aimMat);head.rotation.x=-Math.PI/2;head.position.set(0,.06,-1.9);aim.add(head);aim.visible=false;
  // Outgoing shot: dotted route to the goal line (folding off side walls) and a verdict ring at the end.
  const routeMat=new THREE.MeshBasicMaterial({color:'#fff6d8',transparent:true,opacity:.75,depthWrite:false});
  const dotGeo=new THREE.CircleGeometry(.06,10),spinMat=new THREE.MeshBasicMaterial({color:'#37d6c0',transparent:true,opacity:.9,depthWrite:false,depthTest:false});
  const route=Array.from({length:48},()=>{const d=new THREE.Mesh(dotGeo,routeMat);d.rotation.x=-Math.PI/2;d.visible=false;scene.add(d);return d;});
  // Spin hint: the short arc a spin taken now would follow, from the same physics step as the real flight.
  const spinArc=Array.from({length:16},()=>{const d=new THREE.Mesh(dotGeo,spinMat);d.rotation.x=-Math.PI/2;d.scale.setScalar(1.25);d.renderOrder=6;d.visible=false;scene.add(d);return d;});
  const target=flat(new THREE.RingGeometry(.3,.42,32),'#7ee08a',.9,.05);target.visible=false;
  // What the keeper covers: drawn at its feet at the true save reach.
  const reachBar=flat(unit,'#9cc8ea',.28,.05);reachBar.scale.set(KEEPER_REACH*2,.38,1);
  // Burst's slightly wider catch frame, shown only while it is affordable, so the extra margin is never hidden.
  const burstEdges=[0,1,2,3].map(()=>flat(unit,'#ff9a3c',.6,.049));
  // Burst cinematic pieces: a charge ring at the defender's feet and a warm key light; both built once.
  const chargeRing=flat(new THREE.RingGeometry(.55,.66,40),'#ff8a3c',0,.055);chargeRing.visible=false;
  const keyLight=new THREE.PointLight('#ffd7a0',0,6,1.6);scene.add(keyLight);
  const cine={w:0,dim:0,side:1,theta:0,r:1},focus=new THREE.Vector3(),closePos=new THREE.Vector3(),lookAt=new THREE.Vector3();
  // Burst show, all built once: rising aura hoops and sparks round the defender, a glow on the striking hand,
  // a halo on the locked ball, a ground shockwave, and screen layers carried by the camera (vignette, speed
  // lines, a cut-in banner, a short flash). Everything is driven by the core's skill clock and hidden after.
  const glow=(color,extra={})=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,...extra});
  const aura=new THREE.Group();aura.visible=false;scene.add(aura);
  const hoops=[0,1,2].map(()=>{const m=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,6,44),glow('#ffb347'));m.rotation.x=Math.PI/2;aura.add(m);return m;});
  const sparks=new THREE.Group();sparks.visible=false;scene.add(sparks);
  const sparkGeo=new THREE.CircleGeometry(.06,4),sparkMat=glow('#ffd36b');
  const sparkList=Array.from({length:22},(_,i)=>{const m=new THREE.Mesh(sparkGeo,sparkMat);m.userData={a:i*2.39996,r:.42+(i*37%10)/22,o:i*.137%1};sparks.add(m);return m;});
  const handGlow=new THREE.Mesh(new THREE.SphereGeometry(.27,16,12),glow('#ff9a3c'));handGlow.position.set(.02,-.43,-.025);handGlow.visible=false;arms[1].add(handGlow);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.36,.46,36),glow('#fff1b0',{depthTest:false}));halo.renderOrder=7;halo.visible=false;scene.add(halo);
  const shock=new THREE.Mesh(new THREE.RingGeometry(.8,.98,56),glow('#ffb347'));shock.rotation.x=-Math.PI/2;shock.visible=false;scene.add(shock);
  function screenTexture(draw,w=512,h=512){if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return tx;}
  const screenLayer=(map,color,order)=>{const m=new THREE.Mesh(unit,glow(color,{map,depthTest:false}));m.renderOrder=order;m.frustumCulled=false;m.visible=false;return m;};
  const hud=new THREE.Group();hud.position.z=-.5;camera.add(hud);scene.add(camera);
  const vignette=screenLayer(screenTexture((g,w,h)=>{const r=g.createRadialGradient(w/2,h/2,w*.22,w/2,h/2,w*.72);r.addColorStop(0,'rgba(13,42,34,0)');r.addColorStop(1,'rgba(13,42,34,0.92)');g.fillStyle=r;g.fillRect(0,0,w,h);}),'#ffffff',20);
  const lines=screenLayer(screenTexture((g,w,h)=>{g.translate(w/2,h/2);for(let i=0;i<56;i++){const a=i/56*Math.PI*2+(i%3)*.03,l=w*(.18+(i*7%5)*.03);g.rotate(Math.PI*2/56);g.fillStyle=i%2?'rgba(255,240,205,0.85)':'rgba(255,190,120,0.7)';g.beginPath();g.moveTo(w*.36,-1.5-(i%3));g.lineTo(w*.36+l,0);g.lineTo(w*.36,1.5+(i%3));g.fill();}}),'#ffffff',21);
  const banner=screenLayer(screenTexture((g,w,h)=>{g.fillStyle='#ee6943';g.beginPath();g.moveTo(w*.06,h*.12);g.lineTo(w,h*.12);g.lineTo(w*.94,h*.88);g.lineTo(0,h*.88);g.fill();
    g.fillStyle='#bf4f2f';g.fillRect(0,h*.82,w,h*.06);g.fillStyle='#fff3d7';g.font=`900 ${h*.52}px "PingFang SC","Microsoft YaHei",Arial`;g.textBaseline='middle';g.fillText('爆发',w*.14,h*.5);
    g.font=`800 ${h*.2}px Arial`;g.fillStyle='#ffe2b8';g.fillText('B U R S T',w*.47,h*.5);g.fillStyle='#fff3d7';for(let i=0;i<3;i++){const x=w*(.8+i*.045);g.beginPath();g.moveTo(x,h*.3);g.lineTo(x+h*.12,h*.5);g.lineTo(x,h*.7);g.lineTo(x+h*.05,h*.5);g.fill();}},1024,256),'#ffffff',22);
  const flash=screenLayer(null,'#fff6dc',23);hud.add(vignette,lines,banner,flash);
  const burstFx={aura,sparks,hand:handGlow,halo,shock,vignette,lines,banner,flash};let kick=0,lastReduce=false;
  const tint={whiff:['#f4f6df',.55,.1,.28],none:['#f4f6df',.5,.08,.25],soft:['#f3df8a',.85,.14,.28],clean:['#ffffff',1,.3,.45],perfect:['#ffffff',1,.22,.92]};
  const ballMarker=mesh(new THREE.RingGeometry(.25,.28,32),new THREE.MeshBasicMaterial({color:'#f6d97b',transparent:true,opacity:.6,depthWrite:false}),scene,0,.04,-4,false);ballMarker.rotation.x=-Math.PI/2;
  // A ground shadow under the airborne ball makes its depth and landing point readable.
  const ballShadow=mesh(new THREE.CircleGeometry(.22,24),new THREE.MeshBasicMaterial({color:'#12372d',transparent:true,opacity:.3,depthWrite:false}),scene,0,.038,-4,false);ballShadow.rotation.x=-Math.PI/2;
  const trail=Array.from({length:7},(_,i)=>{const m=mesh(new THREE.SphereGeometry(.07+i*.012,8,6),new THREE.MeshBasicMaterial({color:'#ffda7d',transparent:true,opacity:(i+1)*.035,depthWrite:false}),scene,0,.68,-5,false);m.visible=false;return m;});
  // Contact flashes, built once and reused: glove = burst with spikes, racket = springy double ring, sword = slash arc.
  // They face the camera, are hollow so the ball stays visible, and live for a fraction of a second.
  const fx=new THREE.Group();fx.visible=false;scene.add(fx);
  // Drawn over the defender (the camera sits behind them) but hollow, so the ball itself stays visible.
  const fxMat=()=>new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,depthTest:false});
  const fxParts={burst:new THREE.Group(),ring:new THREE.Group(),slash:new THREE.Group()};
  for(const g of Object.values(fxParts))fx.add(g);
  const fxLayer=o=>{o.renderOrder=7;};
  fxParts.burst.add(new THREE.Mesh(new THREE.RingGeometry(.2,.27,28),fxMat()),new THREE.Mesh(new THREE.CircleGeometry(.11,16),fxMat()));
  for(let i=0;i<8;i++){const spike=new THREE.Mesh(new THREE.PlaneGeometry(.045,.2),fxMat());const a=i/8*Math.PI*2;spike.position.set(Math.cos(a)*.42,Math.sin(a)*.42,0);spike.rotation.z=a-Math.PI/2;fxParts.burst.add(spike);}
  fxParts.ring.add(new THREE.Mesh(new THREE.RingGeometry(.22,.26,32),fxMat()),new THREE.Mesh(new THREE.RingGeometry(.36,.385,32),fxMat()));
  fxParts.slash.add(new THREE.Mesh(new THREE.RingGeometry(.34,.43,28,1,-.2,Math.PI*.85),fxMat()),new THREE.Mesh(new THREE.RingGeometry(.47,.5,28,1,0,Math.PI*.7),fxMat()));
  fx.traverse(fxLayer);
  let fxShot=null,fxStart=-1,fxFeel=null,clock=0;
  // Side-wall impact: a ring on the wall face at the contact point, growing and fading in 0.35 s (two pooled, built once).
  const wallFx=[0,1].map(()=>{const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:'#fff4d2',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const outer=new THREE.Mesh(new THREE.RingGeometry(.2,.26,28),mat),inner=new THREE.Mesh(new THREE.RingGeometry(.08,.12,20),mat);outer.rotation.y=inner.rotation.y=Math.PI/2;g.add(outer,inner);
    g.visible=false;g.userData={start:-9,power:1,mat};scene.add(g);return g;});
  const wallSeen={state:null,vx:0,vz:0};let wallNext=0;
  function wallImpacts(s,now){
    const b=s.ball,seen=wallSeen;
    // A side-wall bounce flips only the sideways velocity, right at a wall; hits and saves also turn the ball back.
    if(seen.state===s&&s.phase==='playing'&&seen.vx!==0&&Math.sign(b.vx)!==Math.sign(seen.vx)&&Math.sign(b.vz)===Math.sign(seen.vz)&&Math.abs(b.x)>SIDE-.6){
      const fx=wallFx[wallNext];wallNext=(wallNext+1)%wallFx.length;
      fx.position.set(Math.sign(seen.vx)*(SIDE+.02),ball.position.y,ball.position.z);fx.userData.start=now;fx.userData.power=Math.min(1,Math.hypot(b.vx,b.vz)/10);
    }
    seen.state=s;seen.vx=b.vx;seen.vz=b.vz;
    for(const fx of wallFx){const u=(now-fx.userData.start)/.35;fx.visible=u>=0&&u<1;if(fx.visible){fx.scale.setScalar(.6+u*(1.2+1.2*fx.userData.power));fx.userData.mat.opacity=.85*(1-u);}}
  }
  // Ring buffer for the ball trail: positions are copied into fixed vectors, never allocated per frame.
  const history=Array.from({length:trail.length},()=>new THREE.Vector3());let historyCount=0,historyHead=0;
  let lastBall=null,lastLevel=-1,lastSwing=null,punchLeft=false;
  // Render pose: the sim runs in fixed 1/120 s steps, the screen at 60/90/120/144 Hz. Positions are carried forward by
  // the unspent part of the next step at the last step's velocity (no added latency); a jump (serve, reset) snaps.
  // Rolling: the ball turns about the axis across its travel by distance / radius, and spin shots add sidespin about the
  // vertical the way they bend. A jump (serve, reset) is not rolled. Driven by the drawn motion, so pauses stop it.
  const rolledFrom=new THREE.Vector3(),spinAxis=new THREE.Vector3(),spinTurn=new THREE.Quaternion();let rollReady=false,rollState=null;
  function rollBall(size){
    const dx=ball.position.x-rolledFrom.x,dz=ball.position.z-rolledFrom.z,dist=Math.hypot(dx,dz),c=rollState?.ball.curve;
    if(rollReady&&dist>1e-9&&dist<.5){
      const turn=dist/(.26*size),side=c&&rollState.ball.kind==='spin'?-Math.sign(c.k)*turn*.9:0;
      spinAxis.set(dz/dist*turn,side,-dx/dist*turn);const angle=spinAxis.length();
      ball.quaternion.premultiply(spinTurn.setFromAxisAngle(spinAxis.divideScalar(angle),angle));
    }
    rolledFrom.copy(ball.position);rollReady=true;
  }
  const posed={px:0,kx:0,bx:0,bz:0},heightProbe={ball:{z:0,z0:0,z1:0,vz:0}};
  function renderPose(s){
    const p=s.pose,a=p?s.accumulator*120:0,on=a>1e-6;
    const carry=(cur,prev)=>on&&Math.abs(cur-prev)<.5?cur+(cur-prev)*a:cur;
    posed.px=p?carry(s.player.x,p.px):s.player.x;posed.kx=p?carry(s.keeper.x,p.kx):s.keeper.x;
    const jump=!p||Math.abs(s.ball.x-p.bx)>=.5||Math.abs(s.ball.z-p.bz)>=.5;
    posed.bx=jump?s.ball.x:Math.max(-SIDE,Math.min(SIDE,carry(s.ball.x,p.bx)));posed.bz=jump?s.ball.z:carry(s.ball.z,p.bz);
    heightProbe.ball.z=posed.bz;heightProbe.ball.z0=s.ball.z0;heightProbe.ball.z1=s.ball.z1;heightProbe.ball.vz=s.ball.vz;
    return posed;
  }
  // Goal camera. When a goal becomes certain (goalLock) the camera blends toward a low chase shot behind the ball,
  // looking at where it will meet the net; key goals get the full shot and a hold, others a brief push (GOAL_CAM).
  // After the line the ball carries on into the net, which bulges and settles; the beaten keeper dives at it.
  // All of it runs on the render clock, so it keeps playing while the match sits in 'goal' or 'won'.
  const goalCam={w:0,on:false,key:false,start:0,goalAt:-1,x:0,dirX:0,dirZ:1,h:.73,goals:0,state:null,dive:0,diveDir:1,side:1},chasePos=new THREE.Vector3(),chaseAim=new THREE.Vector3();
  // Keeper dive pose (0 standing, 1 full stretch), shared by saves and the beaten keeper's reaction.
  function poseKeeper(dive,dir){keeper.rotation.z=dir*dive*.85;goalie.arms[0].rotation.z=-.45-dive*1.1;goalie.arms[1].rotation.z=.45+dive*1.1;goalie.arms.forEach(a=>a.rotation.x=.5);}
  // How far the keeper's body reaches sideways at ball height (below 1.7) for each dive amount, measured once from the
  // model. A beaten keeper never stretches nearer the ball's path than standing still would put it.
  const keeperReach=(()=>{const out=[],v=new THREE.Vector3(),x0=keeper.position.x;
    for(let i=0;i<=10;i++){poseKeeper(i/10,1);keeper.updateMatrixWorld(true);let reach=0;
      keeper.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let j=0;j<p.count;j+=3){v.fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld);if(v.y<1.7)reach=Math.max(reach,v.x-x0);}});out.push(reach);}
    poseKeeper(0,1);keeper.updateMatrixWorld(true);return out;})();
  function beatenDive(gap){const room=Math.max(keeperReach[0],gap-.3);let d=0;while(d<10&&keeperReach[d+1]<=room)d++;return d/10;}
  // Chosen by a search over near/far misses, both sides and portrait/landscape: fewest frames with the keeper or the
  // goal frame in front of the ball, ball near frame centre (dolly-in made the posts block it more often).
  const GC_POSE={back:2.6,side:2.4,height:2.4,dolly:0,center:false,dive:beatenDive};
  const restAt=new THREE.Vector3(),netLean=g=>Math.max(-1,Math.min(1,g.dirX/Math.max(.2,g.dirZ)))*.5;
  // Where the ball ends up inside the net (netShot's limit: .62 deep, resting low).
  function netRest3(g){return restAt.set(g.x+netLean(g)*.62,.3,-(GOAL_Z+.62));}
  function trackGoal(s,now,reduceMotion,pose,sm){
    const g=goalCam;
    if(g.state!==s||s.goals<g.goals||s.phase==='ready'){Object.assign(g,{on:false,goalAt:-1,w:0,dive:0,state:s,goals:s.goals});}
    if(g.goalAt>=0&&s.phase==='playing'){g.on=false;g.goalAt=-1;}
    const lock=s.phase==='playing'?goalLock(s):null;
    // The lens sits on the far side of the ball from the keeper, so a keeper lunging at it never fills the frame.
    const away=x=>GC_POSE.center?(x>0?-1:1):Math.sign(x-pose.kx)||(x>0?1:-1);
    if(lock&&lock.t<=GOAL_CAM.camStart&&!g.on){g.on=true;g.key=lock.key;g.start=now;g.goalAt=-1;g.x=lock.x;g.side=away(lock.x);}
    if(s.goals>g.goals){
      const L=s.lastGoal,v=Math.hypot(L.vx,L.vz)||1;g.goals=s.goals;
      if(!g.on){g.on=true;g.key=L.key;g.start=now;g.side=away(L.x);}
      g.goalAt=now;g.x=L.x;g.dirX=L.vx/v;g.dirZ=L.vz/v;g.h=ballHeight(s);
    }
    if(g.on&&g.goalAt<0&&!lock)g.on=false;
    let w=0;
    if(g.on){
      const pre=g.goalAt<0,t=pre?0:now-g.goalAt,blend=sm((now-g.start)/(g.key?.35:.25));
      const hold=g.key?GOAL_CAM.hold:.25,back=g.key?GOAL_CAM.back:.35,peak=g.key?1:GOAL_CAM.brief;
      w=peak*(pre||t<hold?blend:t<hold+back?blend*sm(1-(t-hold)/back):0);
      if(!pre&&t>=hold+back)g.on=false;
    }
    g.w=reduceMotion?0:w;
    // A beaten keeper reaches as far as the gap allows: a near miss is a stretch, only a wide one is a full dive, so no
    // part of it ever sweeps across the ball's path.
    const gap=Math.abs(g.x-pose.kx);
    g.dive=g.on||g.goalAt>=0?GC_POSE.dive(gap)*sm((now-g.start)/.25):0;g.diveDir=Math.sign(g.x-pose.kx)||1;
    if(g.w>0){
      // Behind the ball along its flight (frozen at the line once it scores), raised and offset away from the keeper;
      // after the line the aim settles on where the ball comes to rest in the net and the lens dollies in on it.
      const pre=g.goalAt<0,bx=pre?pose.bx:g.x,bz=pre?pose.bz:GOAL_Z,dx=pre?s.ball.vx:g.dirX,dz=pre?s.ball.vz:g.dirZ,l=Math.hypot(dx,dz)||1;
      const settle=pre?0:sm((now-g.goalAt)/GOAL_CAM.hold),back=GC_POSE.back-GC_POSE.dolly*settle;
      chasePos.set(bx-dx/l*back+g.side*GC_POSE.side,GC_POSE.height,-(bz-dz/l*back));const rest=netRest3(g);chaseAim.set(g.x*.92,.72,-(GOAL_Z+.3)).lerp(rest,settle);
    }
  }
  // Ball into the net after the line: it decelerates to the back, drops, and the net bulges around it, then settles.
  function netShot(s,now,reduceMotion,sm){
    const g=goalCam,t=now-g.goalAt,ta=g.key&&!reduceMotion?(t<.4?t*.4:.16+(t-.4)):t;
    const depth=.62*(1-Math.exp(-ta*9)),lat=netLean(g);
    ball.position.set(g.x+lat*depth,g.h+(.3-g.h)*sm(ta/.5),-(GOAL_Z+depth));
    if(!farNetLines)return;
    const a=farNetLines.geometry.attributes.position,arr=a.array;
    if(ta>1.2){restoreNet();return;}
    const env=ta<.1?ta/.1:Math.exp(-(ta-.1)*5)*Math.cos((ta-.1)*16);
    for(let i=0;i<arr.length;i+=3){const x=netRest[i],y=netRest[i+1],z=netRest[i+2],f=Math.max(0,(.1-z)/.85);arr[i+2]=z-.3*f*env*Math.exp(-((x-g.x)**2+(y-g.h)**2)/.3);}
    a.needsUpdate=true;netDirty=true;
  }
  function restoreNet(){if(!netDirty||!farNetLines)return;const a=farNetLines.geometry.attributes.position;a.array.set(netRest);a.needsUpdate=true;netDirty=false;}
  function update(s,axis=0,reduceMotion=false,time){
    clock=time??clock+1/60;const now=clock;
    if(s.shot!==fxShot){fxShot=s.shot;if(s.shot&&s.elapsed-s.shot.at<.15){fxStart=now;fxFeel=hitFeel(s.weapon,['perfect','soft','spin','burst'].includes(s.shot.kind)?s.shot.kind:'hit');fx.position.set(s.shot.x,.73,-s.shot.z);for(const [key,g] of Object.entries(fxParts)){g.visible=key===fxFeel.flash;g.traverse(o=>o.material?.color.set(fxFeel.color));}fx.userData.flash=fxFeel.flash;fx.userData.peak=fxFeel.intensity;}}
    const fxAge=fxFeel?now-fxStart:9,fxU=fxFeel?fxAge/fxFeel.life:1,strong=fxFeel&&fxAge<.28?fxFeel.motion:1;
    if(lastLevel!==s.levelIndex){court.material=fieldMaterial(s.level.color);stripes.forEach((stripe,i)=>{const tint=new THREE.Color(s.level.color).offsetHSL(0,0,i%2?.025:0);stripe.material=fieldMaterial('#'+tint.getHexString());});buildFarGoal(s.level.goalHalf);lastLevel=s.levelIndex;}
    const pose=renderPose(s);rollState=s;
    hero.position.set(pose.px,0,-s.player.z);
    hero.rotation.z=s.phase==='playing'?-axis*.075:0;
    const moving=s.phase==='playing'&&Math.abs(axis)>.05;
    const stride=moving?Math.sin(s.elapsed*16):0;
    legs.forEach((leg,i)=>leg.rotation.x=moving?Math.sin(s.elapsed*16+i*Math.PI)*.48:0);
    const sw=s.swing,w=WEAPONS[s.weapon];
    const punch=sw?Math.sin(Math.min(1,sw.time/(w.windup+w.active))*Math.PI):0;
    if(sw!==lastSwing){lastSwing=sw;punchLeft=!!sw&&s.weapon==='glove'&&s.ball.x<s.player.x-.08;}
    for(let i=0;i<arms.length;i++){
      const active=(i===0)===punchLeft,extension=active?punch:0;
      // Rotate about the attached shoulder; translating this root separates its sleeve.
      arms[i].rotation.x=.32+extension*(s.weapon==='glove'?.65:.1)*Math.min(1.5,strong)+(i===0?stride:-stride)*.18;
    }
    // Tools pivot at the wrist so their striking surface sweeps towards the low ball.
    // Burst: wind up from 0.08s, strike at 0.28–0.38s, settle by 0.50s — all from the core's skill clock.
    const B=SKILLS.burst,D=B.duration,sk=s.skill?.kind==='burst'?s.skill:null,kt=sk?Math.min(D,sk.time):0,kp=kt/D,sm=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
    trackGoal(s,now,reduceMotion,pose,sm);
    const wind=sk?(kt<B.strike?sm((kt-B.freeze)/(B.strike-B.freeze)):Math.max(0,1-sm((kt-B.strike)/.05))):0,blow=sk?(kt<B.strike?0:kt<B.release?sm((kt-B.strike)/(B.release-B.strike)):1-sm((kt-B.release)/(D-B.release))):0;
    lastReduce=reduceMotion;
    if(sk){arms[1].rotation.x=.32-wind*.85+blow*1.6;arms[0].rotation.x=.32-wind*.35+blow*.45;torso.rotation.y=-wind*.45+blow*.35;torso.rotation.x=blow*.12-wind*.05;}
    for(const tool of [gear.racket,gear.sword])tool.rotation.x=-1.15-punch-blow;
    // Racket strings spring back after contact; the sword's blade carries through in a flat slash.
    gear.racket.rotation.z=fxU<1&&s.weapon==='racket'?Math.sin(fxAge*34)*.16*(1-fxU)*strong:0;
    gear.sword.rotation.y=s.weapon==='sword'?-punch*.35*strong:0;
    torso.rotation.y=punch*(punchLeft?.28:-.28);
    torso.rotation.x=punch*.06*strong;torso.position.y=punch*-.035+(moving?Math.abs(stride)*.018:0);
    for(const [key,g] of Object.entries(gear))g.visible=key===s.weapon;
    leftGlove.material=s.weapon==='glove'?leftHand.material:skin;leftHand.details.visible=s.weapon==='glove';leftGlove.scale.setScalar(s.weapon==='glove'?1:.74);
    const k=s.keeper,dive=Math.max(k.dive/.35,goalCam.dive),diveDir=k.dive>0?k.diveDir:goalCam.diveDir;
    keeper.position.set(pose.kx,0,-KEEPER_Z);poseKeeper(dive,diveDir);
    const shuffling=Math.abs(k.target-k.x)>.05&&s.phase==='playing';
    goalie.legs.forEach((leg,i)=>leg.rotation.x=shuffling?Math.sin(s.elapsed*14+i*Math.PI)*.35:0);
    const height=ballHeight(heightProbe);
    ball.position.set(pose.bx,height,-pose.bz);
    if(goalCam.goalAt>=0&&(s.phase==='goal'||s.phase==='won'))netShot(s,now,reduceMotion,sm);else restoreNet();
    const powered=(s.power||s.ball.kind==='burst')&&s.ball.vz>0,spinning=s.ball.kind==='spin'&&s.ball.vz>0,size=powered?1.25:1,squash=!reduceMotion&&fxFeel&&fxAge<.09?(1-fxAge/.09)*Math.min(1,fxFeel.intensity*.6):0;
    ball.scale.set(size*(1+.28*squash),size*(1-.24*squash),size*(1+.28*squash));ballBody.material=powered?powerMat:ballMat;
    const burstTrail=s.ball.kind==='burst'&&s.ball.vz>0;
    // Speed reads in the trail: from 3 up to 10 it grows brighter and thicker (the gaps already widen with speed).
    const quick=Math.max(0,Math.min(1,(Math.hypot(s.ball.vx,s.ball.vz)-3)/7));
    trail.forEach((m,i)=>{m.material.color.set(powered?'#ff6a2b':spinning?'#37d6c0':'#ffda7d');m.material.opacity=(i+1)*(burstTrail?.09:.035*(1+1.4*quick));m.scale.setScalar(burstTrail?1.9:1+.6*quick);});rollBall(size);wallImpacts(s,now);
    ball.visible=!['miss','lost'].includes(s.phase);
    const r=hitZone(s),incoming=s.phase==='playing'&&s.ball.vz<0,p=incoming&&!s.swing?swingPreview(s):{kind:'none'};
    const [edgeColor,edgeOpacity,fillOpacity,bandOpacity]=tint[p.kind]||tint.none,dim=s.swing?.45:incoming?1:.5;
    const place=(m,l,rgt,n,f)=>{m.position.x=(l+rgt)/2;m.position.z=-(n+f)/2;m.scale.x=rgt-l;m.scale.y=f-n;};
    place(zone.fill,r.left,r.right,r.near,r.far);place(zone.band,r.left,r.right,r.sweetNear,r.sweetFar);
    const e=.06;place(zone.edges[0],r.left,r.right,r.near,r.near+e);place(zone.edges[1],r.left,r.right,r.far-e,r.far);
    place(zone.edges[2],r.left,r.left+e,r.near,r.far);place(zone.edges[3],r.right-e,r.right,r.near,r.far);
    zone.fill.material.opacity=fillOpacity*dim;zone.band.material.opacity=bandOpacity*dim;
    for(const edge of zone.edges){edge.material.color.set(edgeColor);edge.material.opacity=edgeOpacity*dim;}
    const showHints=['playing','serving','miss','goal','paused'].includes(s.phase);
    for(const m of [zone.fill,zone.band,...zone.edges])m.visible=showHints;
    // Before the swing: where pressing now would send the ball. Just after it: where it actually went.
    const recent=s.shot&&s.elapsed-s.shot.at<.6&&s.ball.vz>0;
    const arrow=p.kind==='clean'||p.kind==='perfect'?{x:p.x,z:p.z,angle:p.angle,kind:p.kind}:recent?s.shot:null;
    aim.visible=!!arrow&&showHints;
    if(arrow){aim.position.set(arrow.x,0,-arrow.z);aim.rotation.y=-arrow.angle;aimMat.color.set(arrow.kind==='perfect'?'#ff7a3d':arrow.kind==='soft'?'#d7d2b8':'#ffffff');aimMat.opacity=recent&&!(p.kind==='clean'||p.kind==='perfect')?.55:.85;}
    const outgoing=s.shot&&s.ball.vz>0&&(s.phase==='playing'||s.phase==='goal'||s.phase==='won');
    // The route and its end ring are ground hints for the normal view; the goal close-up hides them.
    const fl=outgoing&&goalCam.w<.3?predictFlight(s):null;
    if(fl){
      // Red/green only says whether the keeper covers that line right now; it is not a promise of a goal.
      route.forEach((d,i)=>{const on=i+1<fl.count&&fl.zs[i+1]>s.ball.z;d.visible=on;if(on)d.position.set(fl.xs[i+1],.052,-fl.zs[i+1]);});
      const gx=fl.goal??fl.xs[fl.count-1];routeMat.color.set(s.ball.kind==='spin'?'#9df0e2':'#fff6d8');
      target.position.set(gx,.05,-GOAL_Z);target.material.color.set(Math.abs(gx)>s.level.goalHalf?'#c9c9b8':Math.abs(gx-s.keeper.x)<=KEEPER_REACH?'#ff5a4a':'#5fe07a');target.visible=true;
    }else{route.forEach(d=>d.visible=false);target.visible=false;}
    const sp=incoming&&skillStatus(s,'spin').ok?spinPreview(s):null;
    spinArc.forEach((d,i)=>{const on=!!sp&&i<sp.count;d.visible=on&&showHints;if(on)d.position.set(sp.xs[i],.055,-sp.zs[i]);});
    const showBurst=incoming&&!s.swing&&!s.tutorial&&s.energy>=SKILLS.burst.cost;
    if(showBurst){const bz=burstZone(s),be=.045;place(burstEdges[0],bz.left,bz.right,bz.near,bz.near+be);place(burstEdges[1],bz.left,bz.right,bz.far-be,bz.far);place(burstEdges[2],bz.left,bz.left+be,bz.near,bz.far);place(burstEdges[3],bz.right-be,bz.right,bz.near,bz.far);}
    burstEdges.forEach(m=>m.visible=showBurst&&showHints);
    // Cinematic weights: dim and key light for the whole lock, camera push only without reduced motion.
    cine.dim=sk?(kt<B.freeze?kt/B.freeze:kt<B.release?1:Math.max(0,1-(kt-B.release)/(D-B.release))):0;
    cine.w=sk&&!reduceMotion?(kt<B.freeze?0:kt<B.push?sm((kt-B.freeze)/(B.push-B.freeze)):kt<B.release?1:sm(1-(kt-B.release)/(D-B.release))):0;
    // The push-in sweeps ~50° round the defender, then the hold keeps easing closer until the strike.
    cine.theta=sk&&kt<B.push?(1-sm((kt-B.freeze)/(B.push-B.freeze)))*.9:0;cine.r=1-.04*sm((kt-B.push)/(B.strike-B.push));
    if(sk){focus.set((s.player.x+sk.x)/2,1.02,-(s.player.z+sk.z)/2);cine.side=s.player.x>0?-1:1;}
    hemisphere.intensity=2*(1-.42*cine.dim);sun.intensity=3.1*(1-.3*cine.dim);
    keyLight.intensity=cine.dim*5;keyLight.position.set(s.player.x+cine.side*.8,2.3,-s.player.z+.9);
    chargeRing.visible=!!sk;if(sk){chargeRing.position.set(s.player.x,.055,-s.player.z);chargeRing.scale.setScalar(.7+.7*kp);chargeRing.material.opacity=.85*(1-kp*.5);}
    // Aura: hoops rise and fade on a loop, sparks stream upward; static when motion is reduced.
    const auraOn=!!sk&&kt>=B.freeze&&kt<B.release+.05,auraW=sk?sm((kt-B.freeze)/.1)*(1-sm((kt-B.release)/.05)):0;
    aura.visible=sparks.visible=auraOn;handGlow.visible=!!sk&&kt>=B.freeze&&kt<B.release+.1;
    if(auraOn){aura.position.set(s.player.x,0,-s.player.z);
      hoops.forEach((m,i)=>{const ph=reduceMotion?i/3:(kt*1.4+i/3)%1;m.position.y=.12+ph*2.1;m.scale.setScalar(1+.25*ph);m.material.opacity=(1-ph)*.85*auraW;});
      sparkMat.opacity=.9*auraW;sparkList.forEach(m=>{const u=m.userData,ph=reduceMotion?u.o:(kt*1.8+u.o)%1;m.position.set(s.player.x+Math.cos(u.a)*u.r,ph*2.3,-s.player.z+Math.sin(u.a)*u.r);m.quaternion.copy(camera.quaternion);m.scale.set(1-ph*.5,(1-ph*.5)*1.8,1);});}
    if(handGlow.visible){handGlow.material.opacity=Math.min(.85,.6*wind+.9*blow);handGlow.scale.setScalar(1+(reduceMotion?0:.22*Math.sin(kt*28))*wind+.5*blow);}
    // The locked ball charges from the hold onward and trembles after the strike, still at its frozen spot.
    halo.visible=!!sk&&kt>=B.push;if(halo.visible){halo.position.copy(ball.position);halo.quaternion.copy(camera.quaternion);halo.material.opacity=.4+.5*sm((kt-B.push)/.2);halo.scale.setScalar(1+(reduceMotion?0:.12*Math.sin(kt*22))+.5*blow);
      if(!reduceMotion&&kt>=B.strike)ball.position.x+=Math.sin(kt*95)*.025;}
    shock.visible=!!sk&&kt>=B.strike&&kt<B.strike+.3;if(shock.visible){const u=(kt-B.strike)/.3;shock.position.set(s.player.x,.06,-s.player.z);shock.scale.setScalar(reduceMotion?2:1+4.5*u);shock.material.opacity=(1-u)*.9;}
    // Screen layers: vignette for the whole lock, speed lines while pushing/holding, the cut-in banner, a short flash.
    vignette.visible=!!sk;vignette.material.opacity=.95*cine.dim;
    lines.visible=!!sk&&!reduceMotion&&kt>=B.freeze&&kt<B.release;if(lines.visible){lines.material.opacity=.4*sm((kt-B.freeze)/.15)*(1-sm((kt-B.strike)/.1));lines.rotation.z=kt*.5;}
    banner.visible=!!sk&&kt>=.02&&kt<D-.1;if(banner.visible){const inn=sm((kt-.02)/.12),out=sm((kt-B.release+.05)/.15),span=hudSize.w*1.25;
      banner.position.x=reduceMotion?0:(1-inn)*-span+out*span;banner.material.opacity=reduceMotion?Math.min(inn,1-out):1;}
    const opening=kt<.07,striking=kt>=B.strike&&kt<B.strike+.12;
    flash.visible=!!sk&&!reduceMotion&&(opening||striking);if(flash.visible)flash.material.opacity=opening?.4*(1-kt/.07):.5*(1-(kt-B.strike)/.12);
    // A short kick when the burst actually leaves (camera shake, skipped with reduced motion).
    kick=!reduceMotion&&fxShot?.kind==='burst'&&fxAge<.3?(1-fxAge/.3)*.18:0;
    reachBar.position.set(s.keeper.x,.05,-KEEPER_Z);reachBar.visible=showHints||s.phase==='ready';
    reachBar.material.color.set(s.keeper.dive>0?'#ff5a4a':'#9cc8ea');reachBar.material.opacity=s.keeper.dive>0?.6:.28;
    ballMarker.position.set(pose.bx,.035,-pose.bz);ballMarker.visible=ball.visible&&s.phase==='playing';
    ballShadow.position.set(ball.position.x,.038,ball.position.z);ballShadow.scale.setScalar(1.25-(ball.position.y-.73)*.35);ballShadow.visible=ball.visible;
    if(s.phase!=='playing'&&s.phase!=='paused'){historyCount=0;lastBall=null;}
    else if(s.phase==='playing'&&!reduceMotion&&s.ball!==lastBall){lastBall=s.ball;}
    if(s.phase==='playing'&&!reduceMotion){history[historyHead].copy(ball.position);historyHead=(historyHead+1)%history.length;historyCount=Math.min(history.length,historyCount+1);}
    trail.forEach((m,i)=>{m.visible=!reduceMotion&&ball.visible&&historyCount>i;m.position.copy(i<historyCount?history[(historyHead-historyCount+i+history.length)%history.length]:ball.position);});
    // Contact flash: a short pop centred on the contact point, oldest first to fade.
    fx.visible=!!fxFeel&&fxU<1&&s.phase!=='ready';
    if(fx.visible){
      fx.quaternion.copy(camera.quaternion);const ease=1-(1-fxU)**3,peak=fxFeel.intensity,alpha=(1-fxU)**1.4*Math.min(1,.55+.25*peak);
      let scale=(reduceMotion?.9:.55+.75*ease)*(.7+.3*peak);
      if(fxFeel.flash==='ring'&&!reduceMotion)scale*=1+.18*Math.sin(fxU*18)*(1-fxU);
      fx.scale.setScalar(scale);fxParts.slash.rotation.z=reduceMotion?0:-.9+1.3*ease;
      fx.traverse(o=>{if(o.material)o.material.opacity=alpha;});
    }
  }
  function resize(aspect){
    camera.aspect=aspect;camera.updateProjectionMatrix();
    // Lower than a top-down view so the ball's arc and both goals read at once.
    // Portrait screens look down more steeply so the long court fills the frame; framing is the tightest
    // distance that still keeps both goals, the rails and the defender's whole zone in view.
    // Portrait looks down at ~37°, wide screens at ~30°, blended by aspect. The behind-the-defender view
    // shows bodies and swings instead of head-tops; the frame is the tightest one that still keeps both
    // goals, the side walls at the defender's depth and both players' heads in view. Only resize moves it.
    const wide=Math.min(1,Math.max(0,(aspect-.9)/.7));
    camera.fov=baseFov=39+3*wide;camera.updateProjectionMatrix();
    const target=aim0.set(0,.4+.1*wide,-4.4+.5*wide);
    const offset=new THREE.Vector3(0,10,6.6).lerp(new THREE.Vector3(0,7.6,8.3),wide).sub(target);
    const boundary=[];
    for(const x of [-4.35,4.35])boundary.push(new THREE.Vector3(x,0,-10.65),new THREE.Vector3(x,1.3,-9.7));
    for(const x of [-3.95,3.95])boundary.push(new THREE.Vector3(x,0,1.15),new THREE.Vector3(x,1.15,0));
    for(const x of [-SIDE-.1,SIDE+.1])boundary.push(new THREE.Vector3(x,0,-PLAYER_Z));
    boundary.push(new THREE.Vector3(0,2.3,-PLAYER_Z),new THREE.Vector3(0,2.3,-KEEPER_Z));
    const fits=()=>{camera.position.copy(target).addScaledVector(offset,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      return boundary.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.97&&Math.abs(p.y)<.97;});};
    let distance=.3;while(!fits()&&distance<4)distance*=1.02;
    base.copy(camera.position);baseQuat.copy(camera.quaternion);
    // Screen layers sit 0.5 in front of the lens, sized to the new frustum.
    hudSize.h=2*.5*Math.tan(camera.fov*Math.PI/360);hudSize.w=hudSize.h*aspect;
    for(const m of [vignette,lines,flash])m.scale.set(hudSize.w*1.02,hudSize.h*1.02,1);lines.scale.setScalar(Math.max(hudSize.w,hudSize.h)*1.25);
    banner.scale.set(hudSize.w*.82,hudSize.w*.82/4,1);banner.position.y=hudSize.h*.36;
  }
  // Camera shake is a pure render offset around the framed position.
  let baseFov=39;
  const base=new THREE.Vector3(),jolt=new THREE.Vector3(),baseQuat=new THREE.Quaternion(),aim0=new THREE.Vector3(),hudSize={w:1,h:1};
  // Camera = the framed shot, blended toward a side close-up during a burst, plus any shake. The normal frame
  // always comes from the latest resize, so a close-up never restores an old screen shape.
  function shake(amount=0){camera.position.copy(base);camera.quaternion.copy(baseQuat);
    if(cine.w>0){const a=cine.side*cine.theta,ox=cine.side*3.4*cine.r,oz=2.4*cine.r,ca=Math.cos(a),sa=Math.sin(a);closePos.set(focus.x+ox*ca+oz*sa,focus.y+1.2*cine.r,focus.z-ox*sa+oz*ca);camera.position.lerp(closePos,cine.w);lookAt.copy(aim0).lerp(focus,cine.w);camera.lookAt(lookAt);}
    else if(goalCam.w>0){camera.position.lerp(chasePos,goalCam.w);lookAt.copy(aim0).lerp(chaseAim,goalCam.w);camera.lookAt(lookAt);}
    // The goal shot opens the lens a little for a closer, more dynamic frame; exactly the framed lens otherwise.
    const fov=baseFov+(52-baseFov)*goalCam.w;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
   if(amount>0)camera.position.add(jolt.set(Math.random()-.5,(Math.random()-.5)*.6,Math.random()-.5).multiplyScalar(amount));}
  function project(x,z,height=.73){camera.updateMatrixWorld(true);const p=new THREE.Vector3(x,height,-z).project(camera);return {x:(p.x+1)*.5,y:(1-p.y)*.5};}
  buildFarGoal(LEVELS[0].goalHalf);resize(.85);
  return {scene,camera,sun,hero,keeper,farGoal,nearGoal:goal,ball,platform,gear,zone,aim,target,reachBar,fx,spinArc,burstEdges,chargeRing,burstFx,trail,wallFx,cine,goalCam,goalCamPose:GC_POSE,update,project,resize,shake};
}

// Adaptive quality: sustained slow frames step the renderer down one tier at a time. It never steps back up within a
// session, so it cannot oscillate; single spikes and tab-switch gaps (>100 ms) are ignored.
export const QUALITY_TIERS=[{pixelRatio:1.6,shadowMap:1024},{pixelRatio:1.25,shadowMap:1024},{pixelRatio:1,shadowMap:512}];
export function createQualityGovernor({slowMs=22,holdMs=2000}={}){
  let ema=16.7,slow=0;
  return {tier:0,sample(ms){
    if(!(ms>0)||ms>100)return false;
    ema=ema*.9+ms*.1;if(ema<=slowMs){slow=0;return false;}
    slow+=ms;if(slow<holdMs||this.tier>=QUALITY_TIERS.length-1)return false;
    this.tier++;slow=0;ema=16.7;return true;
  }};
}
export function create3DRenderer(canvas){
  // No preserveDrawingBuffer: tiled mobile GPUs would otherwise copy the whole frame every time.
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false});
  if(!context)throw new Error('WebGL2 is unavailable');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const world=buildWorld(),governor=createQualityGovernor();let width=0,height=0,size=null,last=0;
  function applyQuality(){
    const q=QUALITY_TIERS[governor.tier];renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,q.pixelRatio));
    const shadow=world.sun.shadow;if(shadow.mapSize.x!==q.shadowMap){shadow.mapSize.set(q.shadowMap,q.shadowMap);shadow.map?.dispose();shadow.map=null;}
    width=0;
  }
  applyQuality();
  // The canvas size is read only when it changes (ResizeObserver), not every frame, so rendering never forces layout.
  const measure=()=>{const r=canvas.getBoundingClientRect();size=[r.width,r.height];};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(canvas);
  return {
    get quality(){return governor.tier;},
    render(state,axis,reduceMotion,shake=0){
      if(!observer||!size)measure();const [w,h]=size;if(!w||!h)return;
      const now=performance.now();if(last&&governor.sample(now-last))applyQuality();last=now;
      if(w!==width||h!==height){width=w;height=h;renderer.setSize(width,height,false);world.resize(width/height);}
      world.update(state,axis,reduceMotion,now/1000);world.shake(reduceMotion?0:shake);renderer.render(world.scene,world.camera);
    },
    dispose(){observer?.disconnect();world.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});renderer.dispose();}
  };
}
