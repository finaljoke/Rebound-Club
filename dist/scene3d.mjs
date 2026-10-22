import * as THREE from './vendor/three.module.min.js';
import {buildAthlete,buildGlove,makeSurfaceTexture,softBoxGeometry,netGeometry} from './art.mjs';
import {LEVELS,WEAPONS,ballHeight,hitZone,swingPreview,crossingFrom,foldX,KEEPER_Z,KEEPER_REACH,GOAL_Z,FAR_WALL,SIDE} from './core.mjs';

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
  const floorLine=(x,z,width,depth,color='#e0e6c3')=>box(width,.016,depth,color,scene,x,.022,z);
  const hemisphere=new THREE.HemisphereLight('#fff3d7','#516a5a',2.0);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#fff0cc',3.1);sun.position.set(-7,15,5);sun.target.position.set(0,0,-4);scene.add(sun.target);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-10;sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
  const fill=new THREE.DirectionalLight('#dce9ee',.75);fill.position.set(7,8,-10);scene.add(fill);
  const ground=mesh(new THREE.PlaneGeometry(200,200),'#d7dfc5',scene,0,-.65,-4,false);ground.rotation.x=-Math.PI/2;
  const platform=softBox(10.3,.55,13.6,'#b5bda5',scene,0,-.3,-4.6,.13);
  const stone=makeSurfaceTexture('stone');
  softBox(10.45,.13,13.75,new THREE.MeshStandardMaterial({color:'#e5dfc5',map:stone,roughness:.95}),scene,0,-.08,-4.6,.04);
  const turf=makeSurfaceTexture('turf'),turfMaterials=new Map();
  function fieldMaterial(color){if(!turfMaterials.has(color))turfMaterials.set(color,new THREE.MeshStandardMaterial({color,map:turf,bumpMap:turf,bumpScale:.012,roughness:.94}));return turfMaterials.get(color);}
  const court=box(8.25,.06,10.2,fieldMaterial('#286659'),scene,0,-.015,-4.9);
  const stripes=[];for(let i=0;i<10;i++)stripes.push(box(8,.016,.97,fieldMaterial(i%2?'#286659':'#2c6c5e'),scene,0,.022,-.45-i));
  const paving=[];for(let z=-10.4;z<2;z+=1.45)for(const side of [-1,1])paving.push(new THREE.Vector3(side*4.35,-.008,z),new THREE.Vector3(side*5.07,-.008,z));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(paving),new THREE.LineBasicMaterial({color:'#c9c6ac',transparent:true,opacity:.5})));
  for(const x of [-3.75,3.75])floorLine(x,-4.9,.035,9.6);
  for(const z of [-.25,-4.9,-9.55])floorLine(0,z,7.5,.035);
  floorLine(-2.4,-1.25,.035,2);floorLine(2.4,-1.25,.035,2);floorLine(0,-2.25,4.8,.035);
  const centerRing=mesh(new THREE.RingGeometry(.95,.98,48),'#e0e6c3',scene,0,.03,-4.9,false);centerRing.rotation.x=-Math.PI/2;
  const centerDot=mesh(new THREE.CircleGeometry(.045,12),'#e0e6c3',scene,0,.035,-4.9,false);centerDot.rotation.x=-Math.PI/2;
  // Rails have real front/back faces; the lower beams don't hide the incoming ball.
  for(const x of [-4.2,4.2]){
    box(.18,.27,10.6,'#a6b599',scene,x,.15,-4.9);
    rod([x,.65,.4],[x,.65,-10.2],.045,'#ece9d5');
    for(let z=.3;z>=-10.3;z-=1.8)rod([x,.05,z],[x,.68,z],.045,'#eee9cf');
  }
  // The far wall is split around the goal mouth; both are rebuilt whenever the level's goal width changes.
  const farGoal=new THREE.Group();farGoal.position.set(0,0,-FAR_WALL);scene.add(farGoal);
  const farNet=new THREE.LineBasicMaterial({color:'#eee5cc',transparent:true,opacity:.4});
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
    farGoal.add(new THREE.LineSegments(netGeometry(g,1.25,.9,.1,-.75),farNet));
    if(sign){sign.position.set(0,1.62,-.5);farGoal.add(sign);}
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
  const goal=new THREE.Group();scene.add(goal);
  for(const x of [-4,4]){
    rod([x,.02,.05],[x,1.04,.05],.065,'#fff2db',goal);
    rod([x,1.04,.05],[x,.75,1.04],.045,'#fff2db',goal);
    rod([x,.02,1.04],[x,.75,1.04],.045,'#fff2db',goal);
  }
  rod([-4,1.04,.05],[4,1.04,.05],.065,'#fff7e3',goal);
  rod([-4,.75,1.04],[4,.75,1.04],.045,'#e9e8c9',goal);
  const netMat=new THREE.LineBasicMaterial({color:'#eee5cc',transparent:true,opacity:.32});
  goal.add(new THREE.LineSegments(netGeometry(4,1.04,.75,.05,1.04),netMat));
  for(const side of [-1,1]){const joint=sphere(.075,'#e6ddc5',goal,side*4,1.04,.05);joint.castShadow=false;const foot=softBox(.18,.05,.19,'#7d8b72',goal,side*4,.015,.05,.015);foot.castShadow=false;}
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
  const racket=mesh(new THREE.TorusGeometry(.3,.035,8,36),'#edb85f',gear.racket,0,.65,0);racket.scale.set(1,1.3,1);
  for(let y=.02;y<.24;y+=.055)mesh(new THREE.CylinderGeometry(.048,.048,.022,10),'#345c4a',gear.racket,0,y,0,false);
  for(let p=-.2;p<=.201;p+=.1){rod([p,.43,-.005],[p,.87,-.005],.006,'#e9e4c4',gear.racket);rod([-.24,.65+p,-.005],[.24,.65+p,-.005],.006,'#e9e4c4',gear.racket);}
  rod([0,-.09,0],[0,.2,0],.055,'#345c4a',gear.sword);softBox(.38,.06,.12,'#e9c56f',gear.sword,0,.22,0,.025);
  for(let y=-.05;y<.16;y+=.06)mesh(new THREE.CylinderGeometry(.058,.058,.014,10),'#d5ba78',gear.sword,0,y,0,false);
  const blade=box(.105,.9,.045,material('#d8e6df',.25),gear.sword,0,.68,0);blade.rotation.z=-.03;
  box(.025,.82,.054,'#f5f1d7',gear.sword,-.007,.68,0).castShadow=false;
  const tip=mesh(new THREE.ConeGeometry(.073,.23,4),material('#d8e6df',.25),gear.sword,0,1.24,0);tip.rotation.y=Math.PI/4;
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
  const route=Array.from({length:22},()=>{const d=new THREE.Mesh(new THREE.CircleGeometry(.06,10),routeMat);d.rotation.x=-Math.PI/2;d.visible=false;scene.add(d);return d;});
  const target=flat(new THREE.RingGeometry(.3,.42,32),'#7ee08a',.9,.05);target.visible=false;
  // What the keeper covers: drawn at its feet at the true save reach.
  const reachBar=flat(unit,'#9cc8ea',.28,.05);reachBar.scale.set(KEEPER_REACH*2,.38,1);
  const tint={whiff:['#f4f6df',.55,.1,.28],none:['#f4f6df',.5,.08,.25],soft:['#f3df8a',.85,.14,.28],clean:['#ffffff',1,.3,.45],perfect:['#ffffff',1,.22,.92]};
  const ballMarker=mesh(new THREE.RingGeometry(.25,.28,32),new THREE.MeshBasicMaterial({color:'#f6d97b',transparent:true,opacity:.6,depthWrite:false}),scene,0,.04,-4,false);ballMarker.rotation.x=-Math.PI/2;
  // A ground shadow under the airborne ball makes its depth and landing point readable.
  const ballShadow=mesh(new THREE.CircleGeometry(.22,24),new THREE.MeshBasicMaterial({color:'#12372d',transparent:true,opacity:.3,depthWrite:false}),scene,0,.038,-4,false);ballShadow.rotation.x=-Math.PI/2;
  const trail=Array.from({length:7},(_,i)=>{const m=mesh(new THREE.SphereGeometry(.07+i*.012,8,6),new THREE.MeshBasicMaterial({color:'#ffda7d',transparent:true,opacity:(i+1)*.035,depthWrite:false}),scene,0,.68,-5,false);m.visible=false;return m;});
  let lastBall=null,history=[],lastLevel=-1,lastSwing=null,punchLeft=false;
  function update(s,axis=0,reduceMotion=false){
    if(lastLevel!==s.levelIndex){court.material=fieldMaterial(s.level.color);stripes.forEach((stripe,i)=>{const tint=new THREE.Color(s.level.color).offsetHSL(0,0,i%2?.025:0);stripe.material=fieldMaterial('#'+tint.getHexString());});buildFarGoal(s.level.goalHalf);lastLevel=s.levelIndex;}
    hero.position.set(s.player.x,0,-s.player.z);
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
      arms[i].rotation.x=.32+extension*(s.weapon==='glove'?.65:.1)+(i===0?stride:-stride)*.18;
    }
    // Tools pivot at the wrist so their striking surface sweeps towards the low ball.
    for(const tool of [gear.racket,gear.sword])tool.rotation.x=-1.15-punch;
    torso.rotation.y=punch*(punchLeft?.28:-.28);
    torso.rotation.x=punch*.06;torso.position.y=punch*-.035+(moving?Math.abs(stride)*.018:0);
    for(const [key,g] of Object.entries(gear))g.visible=key===s.weapon;
    leftGlove.material=s.weapon==='glove'?leftHand.material:skin;leftHand.details.visible=s.weapon==='glove';leftGlove.scale.setScalar(s.weapon==='glove'?1:.74);
    const k=s.keeper,dive=k.dive/.35;
    keeper.position.set(k.x,0,-KEEPER_Z);keeper.rotation.z=k.diveDir*dive*.85;
    goalie.arms[0].rotation.z=-.45-dive*1.1;goalie.arms[1].rotation.z=.45+dive*1.1;goalie.arms.forEach(a=>a.rotation.x=.5);
    const shuffling=Math.abs(k.target-k.x)>.05&&s.phase==='playing';
    goalie.legs.forEach((leg,i)=>leg.rotation.x=shuffling?Math.sin(s.elapsed*14+i*Math.PI)*.35:0);
    const height=ballHeight(s);
    ball.position.set(s.ball.x,height,-s.ball.z);
    const powered=s.power&&s.ball.vz>0;ball.scale.setScalar(powered?1.25:1);ballBody.material=powered?powerMat:ballMat;
    trail.forEach(m=>m.material.color.set(powered?'#ff6a2b':'#ffda7d'));ball.rotation.set(s.elapsed*2,s.elapsed*1.7,s.elapsed*.7);
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
    if(outgoing){
      const c=crossingFrom(s.shot.x,s.shot.z,Math.sin(s.shot.angle),Math.cos(s.shot.angle),s),slope=Math.tan(s.shot.angle);
      route.forEach((d,i)=>{const zz=s.shot.z+(GOAL_Z-s.shot.z)*(i+1)/(route.length+1);d.position.set(foldX(s.shot.x+slope*(zz-s.shot.z)),.052,-zz);d.visible=zz>s.ball.z;});
      target.position.set(c.x,.05,-GOAL_Z);target.material.color.set(!c.inMouth?'#c9c9b8':c.blocked?'#ff5a4a':'#5fe07a');target.visible=true;
    }else{route.forEach(d=>d.visible=false);target.visible=false;}
    reachBar.position.set(s.keeper.x,.05,-KEEPER_Z);reachBar.visible=showHints||s.phase==='ready';
    reachBar.material.color.set(s.keeper.dive>0?'#ff5a4a':'#9cc8ea');reachBar.material.opacity=s.keeper.dive>0?.6:.28;
    ballMarker.position.set(s.ball.x,.035,-s.ball.z);ballMarker.visible=ball.visible&&s.phase==='playing';
    ballShadow.position.set(s.ball.x,.038,-s.ball.z);ballShadow.scale.setScalar(1.25-(height-.73)*.35);ballShadow.visible=ball.visible;
    if(s.phase!=='playing'&&s.phase!=='paused'){history=[];lastBall=null;}
    else if(s.phase==='playing'&&!reduceMotion&&s.ball!==lastBall){lastBall=s.ball;}
    if(s.phase==='playing'&&!reduceMotion){history.push(ball.position.clone());if(history.length>trail.length)history.shift();}
    trail.forEach((m,i)=>{m.visible=!reduceMotion&&ball.visible&&history.length>i;m.position.copy(history[i]||ball.position);});
  }
  function resize(aspect){
    camera.aspect=aspect;camera.updateProjectionMatrix();
    // Lower than a top-down view so the ball's arc and both goals read at once.
    // Portrait screens look down more steeply so the long court fills the frame; framing is the tightest
    // distance that still keeps both goals, the rails and the defender's whole zone in view.
    const portrait=aspect<1,target=new THREE.Vector3(0,.2,portrait?-4.75:-4.9);
    const tall=Math.min(1,Math.max(0,(.95-aspect)/.3));
    const offset=(portrait?new THREE.Vector3(.5,15,6.2).lerp(new THREE.Vector3(.3,16,3.4),tall):new THREE.Vector3(1.3,12.8,9.6)).sub(target);
    const boundary=[];
    // Far end keeps the whole back wall; the near end is framed by the goal posts, which still contain
    // every position the ball can reach (side walls at ±SIDE).
    for(const x of [-4.35,4.35])boundary.push(new THREE.Vector3(x,0,-10.65),new THREE.Vector3(x,1.3,-9.7));
    for(const x of [-4.05,4.05])boundary.push(new THREE.Vector3(x,0,1.15),new THREE.Vector3(x,1.15,0));
    const fits=()=>{camera.position.copy(target).addScaledVector(offset,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      return boundary.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.97&&Math.abs(p.y)<.97;});};
    let distance=.3;while(!fits()&&distance<4)distance*=1.02;
    base.copy(camera.position);
  }
  // Camera shake is a pure render offset around the framed position.
  const base=new THREE.Vector3();
  function shake(amount=0){camera.position.copy(base);if(amount>0)camera.position.add(new THREE.Vector3(Math.random()-.5,(Math.random()-.5)*.6,Math.random()-.5).multiplyScalar(amount));}
  function project(x,z,height=.73){camera.updateMatrixWorld(true);const p=new THREE.Vector3(x,height,-z).project(camera);return {x:(p.x+1)*.5,y:(1-p.y)*.5};}
  buildFarGoal(LEVELS[0].goalHalf);resize(.85);
  return {scene,camera,hero,keeper,farGoal,ball,platform,gear,zone,aim,target,reachBar,update,project,resize,shake};
}

export function create3DRenderer(canvas){
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.6));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const world=buildWorld();let width=0,height=0;
  return {
    render(state,axis,reduceMotion,shake=0){
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      if(rect.width!==width||rect.height!==height){width=rect.width;height=rect.height;renderer.setSize(width,height,false);world.resize(width/height);}
      world.update(state,axis,reduceMotion);world.shake(reduceMotion?0:shake);renderer.render(world.scene,world.camera);
    },
    dispose(){world.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});renderer.dispose();}
  };
}
