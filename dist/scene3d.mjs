import * as THREE from './vendor/three.module.min.js';
import {LEVELS,WEAPONS,inHitRange,ballHeight,KEEPER_Z,FAR_WALL,SIDE} from './core.mjs';

// Rendering uses (x,height,-physicsDepth); the game simulation remains unchanged.
export function buildWorld(){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d7dfc5');
  const camera=new THREE.PerspectiveCamera(34,.85,.1,100);
  camera.position.set(2.8,18.5,9.8);camera.lookAt(0,.15,-4.6);
  const mats=new Map();
  const material=(color,roughness=.8)=>{const key=color+roughness;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness}));return mats.get(key);};
  const mesh=(geometry,color,parent=scene,x=0,y=0,z=0,shadow=true)=>{const m=new THREE.Mesh(geometry,typeof color==='string'?material(color):color);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;};
  const box=(sx,sy,sz,color,parent,x,y,z)=>mesh(new THREE.BoxGeometry(sx,sy,sz),color,parent,x,y,z);
  const sphere=(r,color,parent,x,y,z,sx=1,sy=1,sz=1)=>{const m=mesh(new THREE.SphereGeometry(r,20,14),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m;};
  const rod=(a,b,r,color,parent=scene)=>{const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),delta=v2.clone().sub(v1);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),color,parent);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;};
  const floorLine=(x,z,width,depth,color='#e0e6c3')=>box(width,.016,depth,color,scene,x,.022,z);
  const hemisphere=new THREE.HemisphereLight('#fff3d7','#516a5a',2.0);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#fff0cc',3.1);sun.position.set(-7,15,5);sun.target.position.set(0,0,-4);scene.add(sun.target);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-10;sun.shadow.camera.near=1;sun.shadow.camera.far=40;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;
  const fill=new THREE.DirectionalLight('#dce9ee',.75);fill.position.set(7,8,-10);scene.add(fill);
  const ground=mesh(new THREE.PlaneGeometry(200,200),'#d7dfc5',scene,0,-.65,-4,false);ground.rotation.x=-Math.PI/2;
  const platform=box(10.3,.55,13.6,'#b5bda5',scene,0,-.3,-4.6);
  box(10.45,.13,13.75,'#e5dfc5',scene,0,-.08,-4.6);
  const court=box(8.25,.06,10.2,'#286659',scene,0,-.015,-4.9);
  const stripes=[];for(let i=0;i<10;i++)stripes.push(floorLine(0,-.45-i,8,.97,i%2?'#286659':'#2c6c5e'));
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
  const farNet=new THREE.LineBasicMaterial({color:'#e4e3c7',transparent:true,opacity:.5});
  function buildFarGoal(g){
    for(const child of [...farGoal.children]){farGoal.remove(child);child.geometry?.dispose();}
    const edge=SIDE+.4,span=edge-g;
    for(const side of [-1,1]){
      box(span,.32,.65,'#244d40',farGoal,side*(g+span/2),.17,-.3);
      box(span,.95,.32,'#cfdda8',farGoal,side*(g+span/2),.82,-.42);
      const post=rod([side*g,.02,.1],[side*g,1.25,.1],.07,'#fff2db',farGoal);post.name=side<0?'post-left':'post-right';post.position.x=side*g;
      rod([side*g,1.25,.1],[side*g,.9,-.75],.045,'#fff2db',farGoal);
    }
    rod([-g,1.25,.1],[g,1.25,.1],.07,'#fff7e3',farGoal);
    rod([-g,.9,-.75],[g,.9,-.75],.045,'#e9e8c9',farGoal);
    const points=[];
    for(let x=-g;x<=g+.01;x+=.24)points.push(new THREE.Vector3(x,.02,-.75),new THREE.Vector3(x,.9,-.75));
    for(let y=.02;y<=.91;y+=.16)points.push(new THREE.Vector3(-g,y,-.75),new THREE.Vector3(g,y,-.75));
    farGoal.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),farNet));
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
  const netMat=new THREE.LineBasicMaterial({color:'#e4e3c7',transparent:true,opacity:.42});
  const netPoints=[];
  for(let x=-4;x<=4.01;x+=.24)netPoints.push(new THREE.Vector3(x,.02,1.04),new THREE.Vector3(x,.75,1.04));
  for(let y=.02;y<=.76;y+=.16)netPoints.push(new THREE.Vector3(-4,y,1.04),new THREE.Vector3(4,y,1.04));
  goal.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(netPoints),netMat));
  // Small bleachers, planted corners, and front steps establish scale and depth.
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const x=side*(4.65+i*.18);box(.4,.15,3.2,'#d8caa3',scene,x,.17+i*.18,-7.6);
      box(.09,.36+i*.18,.14,'#738566',scene,x,.07+i*.09,-6.4);box(.09,.36+i*.18,.14,'#738566',scene,x,.07+i*.09,-8.8);
    }
    for(const z of [-10.6,-3.4]){
      box(.92,.33,.92,'#d3bba0',scene,side*4.65,.13,z);
      sphere(.52,'#819d68',scene,side*4.65,.68,z,1,.9,1);
      sphere(.36,'#9ab47b',scene,side*4.83,.91,z+.1);
    }
  }
  for(let i=0;i<2;i++)box(2.4,.14, .55,'#c8ccb5',scene,2.0,-.43-i*.12,2.3+i*.45);
  const courtText=label('REBOUND',4.4,.85,'#a7c5a2');if(courtText){courtText.rotation.x=-Math.PI/2;courtText.position.set(0,.04,-3.35);courtText.material.opacity=.22;scene.add(courtText);}
  // Rounded, articulated full-body character shared by the defender and the keeper.
  const skin=material('#b98460'),shorts=material('#263f38');
  function person(jerseyColor,trim,numberText){
    const group=new THREE.Group();group.scale.setScalar(1.16);scene.add(group);
    const torso=new THREE.Group();group.add(torso);
    mesh(new THREE.CylinderGeometry(.31,.28,.64,10),material(jerseyColor),torso,0,.97,0);
    box(.63,.1,.45,trim,torso,0,1.17,0);
    box(.58,.29,.4,shorts,group,0,.57,0);
    sphere(.29,'#bb865f',torso,0,1.53,-.015,1,1.12,.95);
    sphere(.295,'#303d31',torso,0,1.66,.025,1,.7,1);
    sphere(.075,'#bb865f',torso,-.285,1.5,0);sphere(.075,'#bb865f',torso,.285,1.5,0);
    const number=label(numberText,.35,.25,'#31513f');if(number){number.position.set(0,1.0,.306);torso.add(number);}
    const legs=[];
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*.18,.48,0);group.add(leg);legs.push(leg);
      mesh(new THREE.CapsuleGeometry(.105,.19,4,10),skin,leg,0,-.15,0);
      const shoe=sphere(.14,'#f4e8ce',leg,0,-.37,-.06,1, .5,1.65);
      box(.24,.05,.39,'#c1cbb2',leg,0,-.415,-.05);shoe.castShadow=true;
    }
    const arms=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.36,1.2,0);torso.add(arm);arms.push(arm);
      sphere(.13,material(jerseyColor),arm,0,-.03,0);
      mesh(new THREE.CapsuleGeometry(.1,.22,4,10),skin,arm,side*.02,-.22,0);
    }
    return {group,torso,legs,arms};
  }
  const player=person('#f6e9ce','#ed774b','01'),hero=player.group,torso=player.torso,legs=player.legs,arms=player.arms;
  hero.position.set(0,0,-1.6);
  // The keeper faces the defender, wears big gloves on both hands and dives sideways on a save.
  const goalie=person('#3d6f95','#f2c14e','1'),keeper=goalie.group;
  keeper.rotation.y=Math.PI;keeper.position.set(0,0,-KEEPER_Z);
  for(const arm of goalie.arms)sphere(.2,material('#f2c14e',.45),arm,0,-.44,-.015,1,1.05,1.1);
  const leftGlove=sphere(.19,material('#ed6941',.4),arms[0],-.015,-.44,-.015,1,1.05,1.1);
  const gear={glove:new THREE.Group(),racket:new THREE.Group(),sword:new THREE.Group()};
  for(const g of Object.values(gear)){g.position.set(.02,-.43,-.025);arms[1].add(g);}
  sphere(.19,material('#ed6941',.4),gear.glove,0,0,0,1,1.05,1.1);
  const wrist=mesh(new THREE.CylinderGeometry(.14,.14,.11,12),'#fff0d2',gear.glove,0,.14,0);wrist.rotation.x=.3;
  rod([0,-.06,0],[0,.45,0],.045,'#c99d60',gear.racket);
  const racket=mesh(new THREE.TorusGeometry(.3,.035,8,36),'#edb85f',gear.racket,0,.65,0);racket.scale.set(1,1.3,1);
  for(let p=-.2;p<=.201;p+=.1){rod([p,.43,-.005],[p,.87,-.005],.006,'#e9e4c4',gear.racket);rod([-.24,.65+p,-.005],[.24,.65+p,-.005],.006,'#e9e4c4',gear.racket);}
  rod([0,-.09,0],[0,.2,0],.055,'#976a47',gear.sword);box(.38,.06,.12,'#e9c56f',gear.sword,0,.22,0);
  const blade=box(.105,.9,.045,material('#d8e6df',.25),gear.sword,0,.68,0);blade.rotation.z=-.03;
  const tip=mesh(new THREE.ConeGeometry(.073,.23,4),material('#d8e6df',.25),gear.sword,0,1.24,0);tip.rotation.y=Math.PI/4;
  const ball=new THREE.Group();scene.add(ball);
  mesh(new THREE.SphereGeometry(.225,24,18),material('#ffbd35',.33),ball);
  for(const axis of [0,1,2]){const seam=mesh(new THREE.TorusGeometry(.225,.008,5,40),'#7c5b2d',ball,0,0,0,false);if(axis===0)seam.rotation.x=Math.PI/2;if(axis===1)seam.rotation.y=Math.PI/2;}
  const range=mesh(new THREE.RingGeometry(.8,.84,48),new THREE.MeshBasicMaterial({color:'#e5efac',transparent:true,opacity:.1,depthWrite:false}),scene,0,.045,-2.3,false);range.rotation.x=-Math.PI/2;
  const ballMarker=mesh(new THREE.RingGeometry(.25,.28,32),new THREE.MeshBasicMaterial({color:'#f6d97b',transparent:true,opacity:.6,depthWrite:false}),scene,0,.04,-4,false);ballMarker.rotation.x=-Math.PI/2;
  // A ground shadow under the airborne ball makes its depth and landing point readable.
  const ballShadow=mesh(new THREE.CircleGeometry(.22,24),new THREE.MeshBasicMaterial({color:'#12372d',transparent:true,opacity:.3,depthWrite:false}),scene,0,.038,-4,false);ballShadow.rotation.x=-Math.PI/2;
  const trail=Array.from({length:7},(_,i)=>{const m=mesh(new THREE.SphereGeometry(.07+i*.012,8,6),new THREE.MeshBasicMaterial({color:'#ffda7d',transparent:true,opacity:(i+1)*.035,depthWrite:false}),scene,0,.68,-5,false);m.visible=false;return m;});
  let lastBall=null,history=[],lastLevel=-1;
  function update(s,axis=0,reduceMotion=false){
    if(lastLevel!==s.levelIndex){court.material=material(s.level.color);stripes.forEach((stripe,i)=>{const tint=new THREE.Color(s.level.color).offsetHSL(0,0,i%2?.025:0);stripe.material=material('#'+tint.getHexString());});buildFarGoal(s.level.goalHalf);lastLevel=s.levelIndex;}
    hero.position.set(s.player.x,0,-s.player.z);
    hero.rotation.z=s.phase==='playing'?-axis*.065:0;
    const moving=s.phase==='playing'&&Math.abs(axis)>.05;
    legs.forEach((leg,i)=>leg.rotation.x=moving?Math.sin(s.elapsed*16+i*Math.PI)*.48:0);
    const sw=s.swing,w=WEAPONS[s.weapon];
    const punch=sw?Math.sin(Math.min(1,sw.time/(w.windup+w.active))*Math.PI):0;
    arms[1].rotation.x=.22+punch*1.9;arms[0].rotation.x=.28+punch*.5;torso.rotation.y=punch*-.24;
    for(const [key,g] of Object.entries(gear))g.visible=key===s.weapon;
    leftGlove.material=s.weapon==='glove'?material('#ed6941',.4):skin;
    const k=s.keeper,dive=k.dive/.35;
    keeper.position.set(k.x,0,-KEEPER_Z);keeper.rotation.z=k.diveDir*dive*.85;
    goalie.arms[0].rotation.z=-.45-dive*1.1;goalie.arms[1].rotation.z=.45+dive*1.1;goalie.arms.forEach(a=>a.rotation.x=.5);
    const shuffling=Math.abs(k.target-k.x)>.05&&s.phase==='playing';
    goalie.legs.forEach((leg,i)=>leg.rotation.x=shuffling?Math.sin(s.elapsed*14+i*Math.PI)*.35:0);
    const height=ballHeight(s);
    ball.position.set(s.ball.x,height,-s.ball.z);ball.rotation.set(s.elapsed*2,s.elapsed*1.7,s.elapsed*.7);
    ball.visible=!['miss','lost'].includes(s.phase);
    range.position.set(s.player.x,.045,-(s.player.z+w.reach*.5));range.scale.set(w.width,w.reach*.5,1);
    range.material.opacity=inHitRange(s)?.46:.1;
    range.visible=s.phase==='playing'&&s.ball.vz<0&&s.ball.z<3.7;
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
    const target=new THREE.Vector3(0,.2,-4.9),offset=new THREE.Vector3(1.3,12.8,9.6).sub(target);
    const boundary=[];
    for(const x of [-5.2,5.2])for(const z of [-11.4,2.3])boundary.push(new THREE.Vector3(x,0,z));
    for(const x of [-4.3,4.3])boundary.push(new THREE.Vector3(x,1.95,-10.1),new THREE.Vector3(x,1.1,.1));
    let distance=1;
    for(let attempt=0;attempt<30;attempt++){
      camera.position.copy(target).addScaledVector(offset,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      if(boundary.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.95&&Math.abs(p.y)<.95;}))break;
      distance*=1.035;
    }
    base.copy(camera.position);
  }
  // Camera shake is a pure render offset around the framed position.
  const base=new THREE.Vector3();
  function shake(amount=0){camera.position.copy(base);if(amount>0)camera.position.add(new THREE.Vector3(Math.random()-.5,(Math.random()-.5)*.6,Math.random()-.5).multiplyScalar(amount));}
  function project(x,z,height=.73){camera.updateMatrixWorld(true);const p=new THREE.Vector3(x,height,-z).project(camera);return {x:(p.x+1)*.5,y:(1-p.y)*.5};}
  buildFarGoal(LEVELS[0].goalHalf);resize(.85);
  return {scene,camera,hero,keeper,farGoal,ball,platform,gear,range,update,project,resize,shake};
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
