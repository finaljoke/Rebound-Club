// Spike (throwaway): a scripted rally loop to judge the cartoon-sports look and motion. Rules here are a
// stand-in for presentation only; the real game's rules stay in core.mjs.
import * as THREE from 'three';
import {buildArena,COURT} from './arena.mjs';
import {Actor,toonMaterial,outlineMaterial,addOutline} from './actors.mjs';
import {createFx} from './fx.mjs';

const $=id=>document.getElementById(id);
const canvas=$('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,1,.1,200);
const arena=buildArena(scene),fx=createFx(scene,camera);

// ---- Ball ----
const R=.19;
const ballTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle='#fff7e8';g.fillRect(0,0,256,128);
  g.lineWidth=14;for(const [col,off] of [['#ff6a2b',0],['#1d2a5c',64],['#ff6a2b',128],['#1d2a5c',192]]){g.strokeStyle=col;g.beginPath();for(let x=0;x<=256;x+=4){const y=64+Math.sin((x+off)/256*Math.PI*2)*38;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
const ball=new THREE.Group(),ballSpin=new THREE.Group(),ballMesh=new THREE.Mesh(new THREE.SphereGeometry(R,32,24),toonMaterial({map:ballTex,emissive:0x2a1a08},0xfff1c0));
ballMesh.castShadow=true;ballSpin.add(ballMesh);ball.add(ballSpin);addOutline(ballMesh,outlineMaterial(.018));scene.add(ball);
const blob=new THREE.Mesh(new THREE.CircleGeometry(R*1.1,24),new THREE.MeshBasicMaterial({color:0x000814,transparent:true,opacity:.45,depthWrite:false}));blob.rotation.x=-Math.PI/2;scene.add(blob);

const B={pos:new THREE.Vector3(0,1,COURT.keeperZ),vel:new THREE.Vector3(),flight:null,held:null,free:false};
function launch(kind,to,dur,apex,onArrive){B.flight={kind,from:B.pos.clone(),to:to.clone(),dur,apex,t:0,onArrive,arrived:false};B.held=null;B.free=false;fx.trail.reset();}
const prev=new THREE.Vector3();
function updateBall(dt){
  prev.copy(B.pos);
  if(B.held)B.held(B.pos);
  else if(B.flight){const f=B.flight;f.t+=dt;const u=f.t/f.dur;B.pos.lerpVectors(f.from,f.to,u);B.pos.y+=4*f.apex*u*(1-u);
    if(u>=1&&!f.arrived){f.arrived=true;f.onArrive?.();}}
  else if(B.free){B.vel.y-=14*dt;B.pos.addScaledVector(B.vel,dt);if(B.pos.y<R){B.pos.y=R;B.vel.y=Math.abs(B.vel.y)*.55;B.vel.x*=.8;B.vel.z*=.8;}}
  if(dt>0&&!B.held){const v=prev.distanceTo(B.pos)/dt;if(B.flight)B.vel.subVectors(B.pos,prev).divideScalar(dt);
    ballSpin.rotation.x-=v*dt/R*Math.sign(B.vel.z||1);}
  ball.position.copy(B.pos);
  // Stretch along the motion; impacts set a brief squash instead.
  const speed=B.vel.length();squash+=(0-squash)*Math.min(1,dt*18);const st=Math.min(.35,speed*.025)*(B.held?0:1)+squash;
  if(speed>.5&&!B.held)ball.lookAt(look.copy(B.pos).add(B.vel));ball.scale.set(1-st*.45,1-st*.45,1+st);
  blob.position.set(B.pos.x,.012,B.pos.z);const h=Math.max(0,B.pos.y-R);blob.scale.setScalar(1+h*.6);blob.material.opacity=.5/(1+h*1.5);
}
let squash=0;const look=new THREE.Vector3();

// ---- Characters ----
const hero=await Actor.load('./spike/models/Rogue.glb',{facing:-1,height:1.95,rim:0x6a9cff,glove:{size:.17,color:0xff5a1f,cuff:0xfff3e0},
  // Rogue greens become the club's orange; the brown hair goes near-black so it never reads as a bald head.
  rule:(h,s,l)=>h>110&&h<210&&s>.2?[18,.95,Math.min(.62,l*1.05+.08)]:h<40&&s>.25&&l<.5?[228,.35,l*.45]:null,number:'01'});
const keeper=await Actor.load('./spike/models/Barbarian.glb',{facing:1,height:2.05,rim:0xffb37a,glove:{size:.19,color:0xf4f6ff,cuff:0x1ec8b4},
  rule:(h,s,l)=>h>14&&h<48&&s>.18&&s<.62&&l<.42?[205,.75,l*1.15+.06]:null});
scene.add(hero.root,keeper.root);
const PUNCHES=['Unarmed_Melee_Attack_Punch_A','Unarmed_Melee_Attack_Punch_B'].map(name=>({name,...hero.measureReach(name)}));
const THROW=keeper.measureReach('Throw');
hero.setLoco('Unarmed_Idle','Running_Strafe_Left','Running_Strafe_Right');hero.maxSpeed=5.4;
keeper.setLoco('Unarmed_Idle','Running_Strafe_Left','Running_Strafe_Right');keeper.maxSpeed=3.6;
hero.root.position.set(0,0,COURT.playerZ);keeper.root.position.set(0,0,COURT.keeperZ);
const heroToWorld=(c,heroX)=>new THREE.Vector3(heroX-c.x,c.y,COURT.playerZ-c.z);

// ---- Rally director ----
const SCRIPT=[{out:'goal',how:'short'},{out:'save',how:'dive'},{out:'goal',how:'wrong'},{out:'save',how:'stand'},{out:'goal',how:'short'},{out:'miss'}];
let mode='auto',slow=1,round=0,state='boot',hitstop=0,timers=[];
const after=(s,fn)=>timers.push({t:s,fn});
const ctl={left:false,right:false,hit:false};
const H={x:0,vx:0,target:0,swing:null,punch:PUNCHES[0]};
const K={x:0,vx:0,target:0,dive:null,plan:null};

function say(text,kind){const el=$('call');el.textContent=text;el.className='call '+kind;void el.offsetWidth;el.classList.add('show');}

function serve(){
  state='serve';const step=SCRIPT[round%SCRIPT.length];H.step=mode==='auto'?step:null;focus.on=0;
  B.held=out=>keeper.hand('r',out);B.flight=null;B.free=false;K.dive=null;K.target=0;keeper.roll=keeper.lift=0;
  H.punch=PUNCHES[round%2];
  let tx;do tx=(Math.random()*2-1)*2.3;while(Math.abs(tx-H.x)<1.3);H.ballX=tx;
  const speed=1.3;keeper.play('Throw',{speed,end:THROW.t+.45,fadeIn:.12});
  after(THROW.t/speed,()=>{
    const c=H.punch,dest=heroToWorld(c,tx+c.x);
    launch('in',dest,1.12,1.05,null);state='incoming';H.target=tx+c.x;
    // The scripted miss arrives a step late and swings at air.
    if(H.step?.out==='miss')H.target-=Math.sign(tx-H.x)*1.5;
  });
}

function startSwing(){
  if(H.swing)return;const c=H.punch,SP=1.4,from=Math.max(0,c.t-.15);
  hero.play(c.name,{speed:SP,from,end:c.t+.5,fadeIn:.04,fadeOut:.22});
  H.swing={e:0,contact:(c.t-from)/SP,done:false};
}
function resolveContact(){
  const f=B.flight,hand=hero.hand(H.punch.side,new THREE.Vector3());
  const ok=f&&f.kind==='in'&&Math.abs(B.pos.z-hand.z)<.75&&Math.hypot(B.pos.x-hand.x,B.pos.y-hand.y)<.8;
  if(!ok)return;
  const strong=mode==='auto'?round%3===0:Math.abs(f.t-f.dur)<.05;
  hitstop=strong?.12:.075;squash=-.35;hero.squash(.05);camKick=strong?.5:.3;shake=strong?.12:.06;
  let aim;
  if(H.step){const s=H.step;
    if(s.out==='save')aim=THREE.MathUtils.clamp(K.x+(Math.random()<.5?-1:1)*(s.how==='stand'?.35:1.55),-2.1,2.1);
    else aim=K.x>0?-2.1:2.1;}
  else aim=ctl.left?-2.1:ctl.right?2.1:THREE.MathUtils.clamp(B.pos.x*.5,-1.6,1.6);
  const to=new THREE.Vector3(aim,.62,COURT.goalZ),dur=B.pos.distanceTo(to)/(strong?15:11.5);
  fx.hit(B.pos.clone(),to.clone().sub(B.pos),strong);fx.trail.set(strong?.2:.15,strong?1:.4);
  launch('shot',to,dur,strong?.12:.3,()=>arrive(aim));
  state='shot';planKeeper(aim,dur);focus.on=1;focus.pt.set(aim*.55,.9,COURT.goalZ+1.4);
  if(strong)say('重炮！','hit');
}

function planKeeper(aim,dur){
  const react=.16,diveT=.42,dx=aim-K.x,dir=Math.sign(dx)||1;
  let out,how;
  if(H.step&&H.step.out!=='miss'){out=H.step.out;how=H.step.how;}
  else{const reach=3.2*Math.max(0,dur-react-diveT)+1.7;out=Math.abs(dx)<=reach?'save':'goal';how=out==='save'?(Math.abs(dx)<.5?'stand':'dive'):'short';}
  K.plan={out,how,aim};
  if(how==='stand'){after(react,()=>{K.target=aim;});return;}
  const diveDir=how==='wrong'?-dir:dir;
  // A real save shuffles most of the way and then leaves the ground so the hands meet the ball on arrival;
  // a beaten keeper barely moves first and the dive ends short (or goes the wrong way).
  after(react,()=>{K.target=how==='dive'?aim-dir*Math.min(1.7,Math.abs(dx)):how==='short'?K.x+dir*.25:K.x;});
  after(Math.max(react,dur-diveT+.02),()=>{
    const left=Math.abs(aim-K.x),D=how==='dive'?Math.min(1.9,left):how==='short'?Math.max(.5,left-.95):1.4;
    K.dive={dir:diveDir,t:0,air:diveT,x0:K.x,D};
    keeper.play(diveDir>0?'Dodge_Left':'Dodge_Right',{speed:.85,fadeIn:.05,hold:true});
  });
}

function arrive(aim){
  if(K.plan.out==='save'){
    const between=out=>{keeper.hand('l',out);const r=keeper.hand('r',new THREE.Vector3());return out.lerp(r,.5).add(new THREE.Vector3(0,0,.12));};
    B.held=between;B.flight=null;fx.save(B.pos.clone());keeper.squash(.04);squash=-.3;shake=.05;
    say(K.plan.how==='stand'?'扑住了':'飞身扑救！','save');
    if(K.plan.how==='stand'){keeper.play('Block',{speed:1.2,end:.7});}
    after(1.9,serve);state='after';
  }else{
    const p=B.pos.clone(),to=new THREE.Vector3(aim,p.y,COURT.netZ+.18);
    launch('net',to,.11,0,()=>{arena.net.userData.bulge(aim,p.y,1);B.flight=null;B.free=true;B.vel.set(0,-1,.6);
      fx.goal(new THREE.Vector3(aim,1,COURT.goalZ));arena.crowd.userData.cheer();shake=.16;camKick=.6;});
    say('进球！','goal');hero.play('Cheer',{speed:1.1,fadeIn:.15});
    after(2.6,serve);state='after';
  }
  round++;
}

function miss(){
  state='after';B.flight=null;B.free=true;say('漏球','miss');hero.play('Hit_A',{speed:1,fadeIn:.06});round++;after(1.8,serve);
}

// ---- Camera: same framing rules as the game (keeper fully visible over the striker's head) ----
const base=new THREE.Vector3(),aim0=new THREE.Vector3();let camKick=0,shake=0,camX=0;
// Broadcast-style push: after a shot the camera travels part of the way toward the goal so the keeper's
// dive and the net are readable, then eases back before the next serve.
const focus={on:0,w:0,pt:new THREE.Vector3()};
function frame(){
  const w=innerWidth,h=innerHeight,aspect=w/h;renderer.setSize(w,h,false);camera.aspect=aspect;
  const wide=Math.min(1,Math.max(0,(aspect-.9)/.7)),tall=aspect<1;camera.fov=tall?46:33;camera.updateProjectionMatrix();
  aim0.set(0,tall?.8:.4*(1-wide),tall?-5.5:-3.6);const pitch=(tall?39:43-(43-28)*wide)*Math.PI/180;
  const offset=new THREE.Vector3(0,Math.sin(pitch),Math.cos(pitch)).multiplyScalar(12),pts=[];
  for(const x of [-4.35,4.35])pts.push(new THREE.Vector3(x,0,-10.65),new THREE.Vector3(x,1.3,-9.7));
  for(const x of tall?[-1.6,1.6]:[-3.95,3.95])pts.push(new THREE.Vector3(x,0,tall?.9:1.15),new THREE.Vector3(x,1.15,0));
  pts.push(new THREE.Vector3(0,2.3,COURT.playerZ),new THREE.Vector3(0,2.3,COURT.keeperZ));
  const head=new THREE.Vector3(0,2.2,COURT.playerZ-.45),feet=new THREE.Vector3(0,0,COURT.keeperZ+.45),ny=v=>v.clone().project(camera).y;
  const fits=d=>{camera.position.copy(aim0).addScaledVector(offset,d);camera.lookAt(aim0);camera.updateMatrixWorld(true);
    return pts.every(v=>{const p=v.clone().project(camera);return Math.abs(p.x)<.97&&Math.abs(p.y)<.97;})&&ny(feet)>ny(head)+.03;};
  let d=.3;while(!fits(d)&&d<4)d*=1.02;base.copy(camera.position);
}
addEventListener('resize',frame);frame();
const fwd=new THREE.Vector3(),lookAt=new THREE.Vector3();
function updateCamera(dt){
  // QA hook for close-ups: window.spikeCam={pos:[x,y,z],at:[x,y,z]}.
  if(window.spikeCam){camera.position.set(...spikeCam.pos);camera.lookAt(...spikeCam.at);return;}
  camX+=(H.x*.14-camX)*Math.min(1,dt*3);camKick*=Math.exp(-dt*7);shake*=Math.exp(-dt*9);
  focus.w+=(focus.on-focus.w)*Math.min(1,dt*(focus.on?2.4:1.8));const e=focus.w*focus.w*(3-2*focus.w);
  camera.position.copy(base);camera.position.x+=camX;camera.position.lerp(focus.pt,e*.4);
  lookAt.copy(aim0);lookAt.x+=camX*.7;lookAt.lerp(focus.pt,e*.85);camera.lookAt(lookAt);
  camera.getWorldDirection(fwd);camera.position.addScaledVector(fwd,camKick);
  if(shake>.001)camera.position.add(new THREE.Vector3((Math.random()-.5)*shake,(Math.random()-.5)*shake,(Math.random()-.5)*shake));
}

// ---- Input ----
const setMode=m=>{mode=m;$('mode').textContent=m==='auto'?'自动演示':'手动操作';$('mode').classList.toggle('on',m==='manual');};
const manual=()=>{if(mode!=='manual')setMode('manual');};
const keymap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'hit',KeyJ:'hit'};
addEventListener('keydown',e=>{const k=keymap[e.code];if(e.code==='KeyS'){toggleSlow();return;}if(!k)return;e.preventDefault();manual();if(k==='hit'){if(!e.repeat)startSwing();}else ctl[k]=true;});
addEventListener('keyup',e=>{const k=keymap[e.code];if(k&&k!=='hit')ctl[k]=false;});
for(const b of document.querySelectorAll('[data-k]')){const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{e.preventDefault();manual();b.setPointerCapture(e.pointerId);if(k==='hit')startSwing();else ctl[k]=true;});
  for(const ev of ['pointerup','pointercancel'])b.addEventListener(ev,()=>{if(k!=='hit')ctl[k]=false;});}
$('mode').onclick=()=>setMode(mode==='auto'?'manual':'auto');
const toggleSlow=()=>{slow=slow===1?.3:1;$('slow').classList.toggle('on',slow<1);$('slow').textContent=slow<1?'慢动作 0.3×':'慢动作';};
$('slow').onclick=toggleSlow;

// ---- Loop ----
const clock=new THREE.Clock();let time=0;
function tick(){
  const raw=Math.min(.05,clock.getDelta()),dt0=raw*slow;let dt=dt0;
  if(hitstop>0){hitstop-=raw;dt=0;}
  time+=dt0;
  for(let i=timers.length-1;i>=0;i--){timers[i].t-=dt;if(timers[i].t<=0){const f=timers[i].fn;timers.splice(i,1);f();}}
  // Striker: bot walks to where its punching hand meets the ball; the player steers by hand.
  if(mode==='auto'){
    const want=state==='incoming'?H.target:state==='shot'||state==='after'?H.x*.98:H.x;const dx=want-H.x;
    const desired=Math.abs(dx)<.05?0:Math.sign(dx)*Math.min(hero.maxSpeed,Math.abs(dx)*7);H.vx+=THREE.MathUtils.clamp(desired-H.vx,-45*dt,45*dt);
    if(state==='incoming'&&B.flight&&!H.swing&&B.flight.dur-B.flight.t<=.15/1.4)startSwing();
  }else{const dir=(ctl.right?1:0)-(ctl.left?1:0);H.vx+=THREE.MathUtils.clamp(dir*hero.maxSpeed-H.vx,-50*dt,50*dt);}
  if(H.swing){H.vx*=Math.max(0,1-dt*12);}
  H.x=THREE.MathUtils.clamp(H.x+H.vx*dt,-COURT.side+.5,COURT.side-.5);hero.vx=H.vx;hero.root.position.x=H.x;
  if(H.swing){H.swing.e+=dt;if(!H.swing.done&&H.swing.e>=H.swing.contact){H.swing.done=true;resolveContact();}if(H.swing.e>H.swing.contact+.32)H.swing=null;}
  if(state==='incoming'&&B.flight&&B.flight.kind==='in'&&B.flight.t>B.flight.dur*1.12)miss();
  // Keeper: shuffles to its target; a dive is a scripted arc on top of the dodge clip.
  if(K.dive){const d=K.dive;d.t+=dt;const u=Math.min(1,d.t/d.air),ease=1-(1-u)**2;
    K.x=d.x0+d.dir*d.D*ease;K.vx=0;
    const landT=d.t-d.air,lie=.3-keeper.hipH;
    if(landT<0){keeper.roll=-d.dir*1.45*Math.min(1,u*1.6);keeper.lift=Math.sin(Math.PI*u)*.5+lie*u*u;}
    else if(landT<.55){keeper.roll=-d.dir*1.45;keeper.lift=lie;if(!d.thud){d.thud=true;keeper.squash(.08);shake=Math.max(shake,.05);}}
    else{const r=Math.min(1,(landT-.55)/.45),s=r*r*(3-2*r);keeper.roll=-d.dir*1.45*(1-s);keeper.lift=lie*(1-s);if(!d.up){d.up=true;keeper.release(.3);}
      if(r>=1){K.dive=null;keeper.roll=keeper.lift=0;}}
  }else{
    if(state==='incoming')K.target=THREE.MathUtils.clamp(B.pos.x*.3,-1,1);
    const dx=K.target-K.x,desired=Math.abs(dx)<.04?0:Math.sign(dx)*Math.min(keeper.maxSpeed,Math.abs(dx)*6);
    K.vx+=THREE.MathUtils.clamp(desired-K.vx,-30*dt,30*dt);K.x+=K.vx*dt;
  }
  keeper.vx=K.vx;keeper.root.position.x=K.x;
  hero.look=keeper.look=B.pos;
  hero.update(dt);keeper.update(dt);
  updateBall(dt);
  arena.update(dt,time);
  fx.update(raw*slow,B.pos,!!B.flight||(B.free&&B.vel.length()>3));
  updateCamera(raw);
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}
$('loading').hidden=true;
after(.6,serve);tick();
window.spike={hero,keeper,scene,camera,renderer,B,K,H,PUNCHES,THROW,setSlow:v=>{slow=v;},get state(){return state;}};
