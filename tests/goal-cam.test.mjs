import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,goalLock,GOAL_CAM,LEVELS,KEEPER_Z,KEEPER_REACH,GOAL_Z,SIDE,SKILLS} from '../dist/core.mjs';

function playing(level=0,options){const s=createGame(level,'glove',options);startGame(s);for(let i=0;i<400&&s.phase!=='playing';i++)stepGame(s,1/60,0);return s;}
// Deterministic pseudo-random so failures reproduce.
function rng(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};}
// Place an outgoing shot and run the real rules until it resolves.
function shoot(s,{x,z,angle,speed,keeperX,curve=null,kind='straight'}){
  const b=s.ball;b.x=x;b.z=z;b.vx=Math.sin(angle)*speed;b.vz=Math.cos(angle)*speed;b.z0=z;b.z1=GOAL_Z;b.curve=curve;
  s.keeper.x=keeperX;s.keeper.target=keeperX;s.keeper.delay=0;s.keeper.err=0;s.lastShot=kind;s.shot={x,z,angle,kind,at:s.elapsed};s.swing=null;
}
function resolve(s,watch){
  for(let i=0;i<2400;i++){watch?.(s);stepGame(s,1/120,0);for(const e of s.events)if(['goal','save','wide'].includes(e))return e;}
  return 'none';
}

test('必进判定从不出错：判为必进的射门最终一定进球，落点与关键球标记一致',()=>{
  const r=rng(7);let locked=0,goals=0;
  for(let n=0;n<1500;n++){
    const level=n%LEVELS.length,s=playing(level);
    const spin=r()<.25?{k:(r()<.5?-1:1)*SKILLS.spin.curve,stopZ:2+r()*6}:null;
    shoot(s,{x:(r()*2-1)*3,z:2+r()*7,angle:(r()*2-1)*.7,speed:3+r()*9.5,keeperX:(r()*2-1)*LEVELS[level].goalHalf,curve:spin,kind:spin?'spin':'straight'});
    let first=null;
    const outcome=resolve(s,st=>{const l=goalLock(st);if(l&&!first)first={...l};});
    if(first){locked++;assert.equal(outcome,'goal',`#${n} 判为必进却是 ${outcome}`);
      assert.ok(Math.abs(first.x-s.lastGoal.x)<1e-6,`#${n} 落点`);assert.equal(first.key,s.lastGoal.key,`#${n} 关键球`);}
    if(outcome==='goal')goals++;
  }
  assert.ok(locked>150,`有效样本 ${locked}`);assert.ok(locked<=goals);
});

test('门将够得着、打偏、回球、教学和非比赛阶段都不判必进',()=>{
  const s=playing(0);shoot(s,{x:0,z:5,angle:0,speed:6,keeperX:0});assert.equal(goalLock(s),null,'正对门将');
  shoot(s,{x:3.5,z:8,angle:.5,speed:6,keeperX:-2});assert.equal(goalLock(s),null,'打偏');
  shoot(s,{x:0,z:5,angle:0,speed:6,keeperX:0});s.ball.vz=-6;assert.equal(goalLock(s),null,'来球');
  const t=playing(0,{tutorial:true});shoot(t,{x:-2,z:8,angle:0,speed:6,keeperX:2});assert.equal(goalLock(t),null,'教学');
  shoot(s,{x:-2,z:8,angle:0,speed:6,keeperX:2});s.phase='paused';assert.equal(goalLock(s),null,'暂停');
});

test('必进后剩余时间逐帧减少，球过门线时归零',()=>{
  const s=playing(0);shoot(s,{x:-2,z:6,angle:0,speed:6,keeperX:2});
  const a=goalLock(s);assert.ok(a);assert.ok(Math.abs(a.t-(GOAL_Z-6)/6)<.02,`t ${a.t}`);
  stepGame(s,.2,0);const b=goalLock(s);assert.ok(b&&Math.abs(a.t-b.t-.2)<.02);
  assert.ok(Math.abs(a.x+2)<1e-9);
});

test('关键球：制胜球、重炮、爆发、旋转、借墙；普通进球不是关键球',()=>{
  const s=playing(0);
  shoot(s,{x:-2,z:6,angle:0,speed:6,keeperX:2});assert.equal(goalLock(s).key,false,'普通');
  shoot(s,{x:-2,z:6,angle:0,speed:6,keeperX:2,kind:'perfect'});assert.equal(goalLock(s).key,true,'重炮');
  shoot(s,{x:-2,z:6,angle:0,speed:6,keeperX:2,kind:'burst'});assert.equal(goalLock(s).key,true,'爆发');
  shoot(s,{x:-2,z:6,angle:0,speed:6,keeperX:2,kind:'spin'});assert.equal(goalLock(s).key,true,'旋转');
  // Banked: still to come off the wall, or already came off it.
  shoot(s,{x:2.5,z:4,angle:.5,speed:7,keeperX:-2.4});const banked=goalLock(s);assert.ok(banked&&banked.key,'借墙（待撞墙）');
  resolve(s);assert.equal(s.lastGoal.key,true);
  const f=playing(0);f.goals=LEVELS[0].goals-1;shoot(f,{x:-2,z:6,angle:0,speed:6,keeperX:2});assert.equal(goalLock(f).key,true,'制胜球');
  assert.ok(GOAL_CAM.slow>0&&GOAL_CAM.slow<1&&GOAL_CAM.hold+GOAL_CAM.back<1.2,'特写在下一次发球前结束');
});

test('必进判定不改变比赛结果：同一局开与不开判定，逐帧状态完全一致',()=>{
  const a=playing(3),b=playing(3);
  for(const s of [a,b])shoot(s,{x:-1.5,z:4,angle:.12,speed:7,keeperX:1.8});
  for(let i=0;i<600;i++){goalLock(a);stepGame(a,1/120,0);stepGame(b,1/120,0);}
  assert.equal(JSON.stringify(a),JSON.stringify(b));
});

// ---- Presentation: drive the scene the way game.js does (real clock, slow motion from goalLock). ----
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
const assets=await loadCharacters();
function film(s,{reduceMotion=false,aspect=.46,maxSeconds=6}={}){
  const w=buildWorld(assets);w.resize(aspect);w.update(s,0,reduceMotion,0);w.shake(0);
  const base=w.camera.position.clone(),net=w.farGoal.children.find(o=>o.isLineSegments),rest=net.geometry.attributes.position.array.slice();
  const log=[];let now=0,goalAt=null,slowFrom=null,servedAt=null,outcome=null;
  for(let i=0;i<maxSeconds*60;i++){
    const lock=goalLock(s),slow=lock&&lock.key&&!reduceMotion&&lock.t<=GOAL_CAM.slowWindow;if(slow&&slowFrom===null)slowFrom=now;
    stepGame(s,(1/60)*(slow?GOAL_CAM.slow:1),0);now+=1/60;
    for(const e of s.events){if(['goal','save','wide'].includes(e)&&!outcome){outcome=e;if(e==='goal')goalAt=now;}if(e==='serve'&&outcome&&servedAt===null)servedAt=now;}
    w.update(s,0,reduceMotion,now);w.shake(0);w.scene.updateMatrixWorld(true);w.camera.updateMatrixWorld(true);
    const ndc=v=>v.clone().project(w.camera),inView=v=>{const p=ndc(v);return Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z<1;};
    // Where the ball meets the net: the goal-line crossing, a little behind the mouth.
    const impact=s.lastGoal?new THREE.Vector3(s.lastGoal.x,.7,-(GOAL_Z+.3)):null;
    const moved=net.geometry.attributes.position.array.some((v,k)=>Math.abs(v-rest[k])>1e-4);
    // Line of sight: no solid part of the keeper between the lens and the ball (seam lines are not occluders).
    const ballPos=w.ball.getWorldPosition(new THREE.Vector3()),dir=ballPos.clone().sub(w.camera.position),dist=dir.length();
    const ray=new THREE.Raycaster(w.camera.position.clone(),dir.normalize(),0,dist-.3),blocked=ray.intersectObject(w.keeper,true).some(h=>h.object.isMesh);
    log.push({now,phase:s.phase,kx:s.keeper.x,w:w.goalCam.w,camOff:w.camera.position.distanceTo(base),ballZ:-w.ball.position.z,ballY:w.ball.position.y,
      ballIn:inView(w.ball.getWorldPosition(new THREE.Vector3())),blocked,impactIn:!!impact&&inView(impact),netMoved:moved});
    if(servedAt!==null&&now>servedAt+.1)break;
    if(s.phase==='won'&&goalAt!==null&&now>goalAt+GOAL_CAM.hold+GOAL_CAM.back+.3)break;
  }
  return {log,goalAt,slowFrom,servedAt,outcome};
}

test('关键球特写：慢动作、跟球机位推近并停留，球进网、球网鼓起，下一次发球前回到正常构图',()=>{
  const s=playing(0);shoot(s,{x:-2,z:6,angle:-.05,speed:7,keeperX:2,kind:'perfect'});
  const f=film(s);assert.equal(f.outcome,'goal');
  const at=t=>f.log.find(r=>r.now>=t);
  // Slow motion: the last slowWindow of flight takes slowWindow/slow of real time.
  assert.ok(f.goalAt-f.slowFrom>=GOAL_CAM.slowWindow/GOAL_CAM.slow*.85,`慢动作 ${(f.goalAt-f.slowFrom).toFixed(2)}s`);
  const hold=at(f.goalAt+GOAL_CAM.hold*.6);
  assert.ok(hold.w>.99&&hold.camOff>2,`停留 w=${hold.w} 偏移 ${hold.camOff}`);
  assert.ok(hold.ballIn&&hold.impactIn,'停留时球和入网位置都在画面内');
  const shown=f.log.filter(r=>r.w>.5);assert.ok(shown.length>10&&shown.every(r=>!r.blocked),`特写期间门将挡住球 ${shown.filter(r=>r.blocked).length}/${shown.length} 帧`);
  assert.ok(hold.ballZ>GOAL_Z+.2&&hold.ballY>.2,`球在网里 z=${hold.ballZ} y=${hold.ballY}`);
  assert.ok(f.log.some(r=>r.netMoved),'球网鼓起');
  const served=f.log.find(r=>r.now>=f.servedAt);
  assert.ok(served.w===0&&served.camOff<1e-6,`发球时镜头已回正 w=${served.w} 偏移 ${served.camOff}`);
  assert.ok(!f.log.at(-1).netMoved,'球网复原');
});

// The keeper model reaches ~0.87 sideways at ball height while the save rule reaches 0.55, so a ball that only just
// beats it brushes past the gloves; that moment may cross the ball. Everything else may not.
test('特写镜头里门将不挡住球：球入网后的停留全程可见，门将离球 1.2 以上时进球前也可见',()=>{
  let filmed=0,wide=0;
  for(const level of [0,3,5])for(const gap of [.75,.95,1.3,1.8,2.4])for(const side of [-1,1])for(const aspect of [.46,1.9]){
    const s=playing(level),x=side*1.2;shoot(s,{x:x*.6,z:5.5,angle:side*.08,speed:7,keeperX:x-side*gap,kind:'perfect'});
    const f=film(s,{aspect});if(f.outcome!=='goal')continue;filmed++;
    const at=f.log.find(r=>r.now>=f.goalAt),passGap=Math.abs(s.lastGoal.x-at.kx),label=`关卡${level+1} 间距${gap} 方向${side} 宽高比${aspect}`;
    const hold=f.log.filter(r=>r.phase!=='playing'&&r.w>.99);
    assert.ok(hold.length>10&&hold.every(r=>!r.blocked),`${label}：停留时 ${hold.filter(r=>r.blocked).length}/${hold.length} 帧被挡`);
    if(passGap>=1.2){wide++;const pre=f.log.filter(r=>r.phase==='playing'&&r.w>.5);assert.ok(pre.every(r=>!r.blocked),`${label}：进球前 ${pre.filter(r=>r.blocked).length}/${pre.length} 帧被挡`);}
  }
  assert.ok(filmed>=16&&wide>=8,`有效样本 ${filmed}，宽间距 ${wide}`);
});

test('普通进球只有轻微推近，不放慢；减少动态效果时镜头不动但球照样进网',()=>{
  const s=playing(0);shoot(s,{x:-2,z:6,angle:-.05,speed:7,keeperX:2});
  const f=film(s);assert.equal(f.outcome,'goal');assert.equal(f.slowFrom,null,'普通进球不放慢');
  const peak=Math.max(...f.log.map(r=>r.w));assert.ok(peak>.2&&peak<=GOAL_CAM.brief+1e-9,`推近幅度 ${peak}`);
  const r=playing(0);shoot(r,{x:-2,z:6,angle:-.05,speed:7,keeperX:2,kind:'perfect'});
  const g=film(r,{reduceMotion:true});assert.equal(g.outcome,'goal');assert.equal(g.slowFrom,null);
  assert.ok(g.log.every(x=>x.w===0&&x.camOff<1e-6),'减少动态效果时镜头不动');
  assert.ok(g.log.some(x=>x.ballZ>GOAL_Z+.2),'球照样进网');
});

test('被扑住的球不触发特写；制胜球特写结束后才进入结算',()=>{
  const s=playing(0);shoot(s,{x:0,z:6,angle:0,speed:6,keeperX:0,kind:'perfect'});
  const f=film(s,{maxSeconds:3});assert.equal(f.outcome,'save');assert.ok(f.log.every(r=>r.w===0));
  const t=playing(0);t.goals=LEVELS[0].goals-1;shoot(t,{x:-2,z:6,angle:-.05,speed:7,keeperX:2});
  const g=film(t);assert.equal(t.phase,'won');
  const hold=g.log.find(r=>r.now>=g.goalAt+GOAL_CAM.hold*.6);assert.ok(hold.w>.99,'制胜球是关键球，完整特写');
  assert.ok(g.log.at(-1).w===0,'特写结束');
});
