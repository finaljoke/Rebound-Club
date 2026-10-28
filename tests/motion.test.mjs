import test from 'node:test';
import assert from 'node:assert/strict';
import {ballHeight,HIT_HEIGHT,PLAYER_Z,KEEPER_Z,PACE} from '../dist/core.mjs';

// Height along a flight from z0 to z1 at a given forward speed (only the depth speed matters for the arc).
function apexOf(speed,z0=KEEPER_Z-.3,z1=PLAYER_Z){
  let top=0;const ball={x:0,z:z0,vx:0,vz:z1>z0?speed:-speed,z0,z1};
  for(let i=0;i<=100;i++){ball.z=z0+(z1-z0)*i/100;top=Math.max(top,ballHeight({ball})-HIT_HEIGHT);}
  return top;
}

test('弧线由固定重力决定：同一段距离，球越快越平，越慢越高',()=>{
  // Authored speeds (level-1 serve 4, a fast rally 10, a soft return 3.2, the burst cap 12.5) at the game's pace.
  const serve=apexOf(4*PACE),fast=apexOf(10*PACE),soft=apexOf(3.2*PACE),burst=apexOf(12.5*PACE);
  assert.ok(Math.abs(serve-.9)<.06,`第一关发球弧顶 ${serve.toFixed(2)}`);
  assert.ok(fast<.25,`快球弧顶 ${fast.toFixed(2)}`);assert.ok(burst<fast);
  assert.ok(soft>serve,`软球弧顶 ${soft.toFixed(2)}`);assert.ok(soft<=1.5);
});

test('弧线两端都在击球高度，中途连续',()=>{
  for(const speed of [3,4,7,12.5]){
    const ball={x:0,z:9,vx:0,vz:-speed,z0:9,z1:PLAYER_Z};
    assert.ok(Math.abs(ballHeight({ball})-HIT_HEIGHT)<1e-9);ball.z=PLAYER_Z;assert.ok(Math.abs(ballHeight({ball})-HIT_HEIGHT)<1e-9);
    let prev=null;for(let z=9;z>=PLAYER_Z;z-=.05){ball.z=z;const h=ballHeight({ball});if(prev!==null)assert.ok(Math.abs(h-prev)<.05,`速度${speed} z=${z.toFixed(2)} 跳变`);prev=h;}
  }
});

import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
const assets=await loadCharacters();
import {createGame,startGame,stepGame,GOAL_Z} from '../dist/core.mjs';
function playing(level=0){const s=createGame(level);startGame(s);for(let i=0;i<400&&s.phase!=='playing';i++)stepGame(s,1/60,0);return s;}
// Rotation the ball mesh made between two updates, as world axis + angle.
function turn(w,s,move){
  s.accumulator=0;w.update(s,0,false,1);const q0=w.ball.quaternion.clone();
  move(s);s.pose={px:s.player.x,kx:s.keeper.x,bx:s.ball.x,bz:s.ball.z};w.update(s,0,false,1+1/60);
  const d=w.ball.quaternion.clone().multiply(q0.clone().invert()),angle=2*Math.acos(Math.min(1,Math.abs(d.w))),sn=Math.sqrt(Math.max(1e-12,1-d.w*d.w));
  return {angle,axis:new THREE.Vector3(d.x,d.y,d.z).divideScalar(sn).multiplyScalar(Math.sign(d.w)||1)};
}

test('球按飞行方向滚动：转轴垂直于运动方向，转角等于滚过距离除以半径',()=>{
  const w=buildWorld(assets),s=playing();s.power=false;s.ball.kind=null;s.ball.curve=null;s.ball.vx=0;s.ball.vz=5;
  const r=turn(w,s,st=>{st.ball.z+=.3;});
  assert.ok(Math.abs(r.angle-.3/.26)<1e-3,`转角 ${r.angle.toFixed(3)}`);
  assert.ok(Math.abs(Math.abs(r.axis.x)-1)<1e-3&&Math.abs(r.axis.y)<1e-3,`转轴 ${r.axis.toArray().map(v=>v.toFixed(2))}`);
  const side=turn(w,s,st=>{st.ball.x+=.2;});assert.ok(Math.abs(Math.abs(side.axis.z)-1)<1e-3,'横向移动绕前后轴转');
  const still=turn(w,s,()=>{});assert.ok(still.angle<1e-9,'不动就不转');
  const jump=turn(w,s,st=>{st.ball.z+=3;});assert.ok(jump.angle<1e-9,'瞬移不转');
});

test('旋转球带侧旋：绕竖直轴的转向和拐弯方向一致',()=>{
  for(const k of [-1,1]){
    const w=buildWorld(assets),s=playing();s.ball.kind='spin';s.ball.curve={k:k*.06,stopZ:9};s.ball.vx=0;s.ball.vz=5;
    const r=turn(w,s,st=>{st.ball.z+=.3;});
    assert.ok(Math.abs(r.axis.y)>.3,`侧旋分量 ${r.axis.y.toFixed(2)}`);assert.equal(Math.sign(r.axis.y*r.angle),Math.sign(-k),`k=${k}`);
  }
});

test('拖尾随球速变亮变粗：快球明显，慢球保持原样',()=>{
  const look=speed=>{const w=buildWorld(assets),s=playing();s.power=false;s.ball.kind=null;s.ball.curve=null;s.ball.vx=0;s.ball.vz=-speed;w.update(s,0,false,1);
    return {opacity:w.trail.reduce((n,m)=>n+m.material.opacity,0),scale:Math.max(...w.trail.map(m=>m.scale.x))};};
  const slow=look(3),serve=look(4),fast=look(11);
  assert.ok(Math.abs(slow.opacity-.98)<1e-9&&slow.scale===1,'慢球与原来一致');
  assert.ok(fast.opacity>slow.opacity*2&&fast.scale>1.3,`快球 ${fast.opacity.toFixed(2)} / ${fast.scale.toFixed(2)}`);
  assert.ok(serve.opacity>slow.opacity&&serve.opacity<fast.opacity);
});

import {SIDE} from '../dist/core.mjs';
test('撞墙时在撞击点出现冲击圈并很快消失；击球改变方向不会触发',()=>{
  for(const side of [-1,1]){
    const w=buildWorld(assets),s=playing();const b=s.ball;b.x=side*3.2;b.z=5;b.vx=side*3;b.vz=5;b.z0=5;b.z1=9.7;b.curve=null;
    let now=0,at=null,hitZ=null;
    for(let i=0;i<60;i++){stepGame(s,1/60,0);now+=1/60;if(s.events.includes('wall')&&at===null){at=now;hitZ=s.ball.z;}w.update(s,0,false,now);
      if(at!==null&&now-at<.1){const fx=w.wallFx.find(m=>m.visible);assert.ok(fx,'冲击圈出现');assert.ok(Math.abs(Math.abs(fx.position.x)-SIDE)<.15&&Math.sign(fx.position.x)===side,`位置 x=${fx.position.x}`);assert.ok(Math.abs(-fx.position.z-hitZ)<.4,'在撞击处');}
      if(at!==null&&now-at>.5)assert.ok(w.wallFx.every(m=>!m.visible),'很快消失');}
    assert.ok(at!==null,'确实撞墙');
  }
  const w=buildWorld(assets),s=playing();w.update(s,0,false,0);s.ball.x=0;s.ball.vx=2;w.update(s,0,false,.02);s.ball.vx=-2;s.ball.vz=-s.ball.vz;w.update(s,0,false,.04);
  assert.ok(w.wallFx.every(m=>!m.visible),'场地中间的方向变化不触发');
});

// Sideways reach of the keeper's body at ball height (below 1.7), measured from the model.
function keeperReach(w){const v=new THREE.Vector3(),x0=w.keeper.position.x;let reach=0;w.scene.updateMatrixWorld(true);
  w.keeper.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let j=0;j<p.count;j++){(o.isSkinnedMesh?o.getVertexPosition(j,v):v.fromBufferAttribute(p,j)).applyMatrix4(o.matrixWorld);if(v.y<1.7)reach=Math.max(reach,Math.abs(v.x-x0));}});return reach;}
test('门将：手套颜色与球明显不同，站立时伸展贴近扑救范围，扑救边缘球时向来球一侧伸出',()=>{
  const w=buildWorld(assets),s=playing();s.ball.vz=-4;w.update(s,0,false,1);
  const glove=w.keeper.getObjectByName('glove-body').material.color,ball=new THREE.Color('#ffbd35');
  assert.ok(Math.hypot(glove.r-ball.r,glove.g-ball.g,glove.b-ball.b)>.5,'手套和球颜色要分得开');
  const rest=keeperReach(w);assert.ok(rest<=.72,`站立伸展 ${rest.toFixed(2)}`);
  // A save's stretch follows the ball's gap (a full-length dive is checked in keeper-dive.test.mjs).
  s.ball.x=s.keeper.x+.5;if(s.pose)s.pose.bx=s.ball.x;s.keeper.dive=.35;s.keeper.diveDir=1;w.update(s,0,false,1.1);
  assert.ok(keeperReach(w)>=rest+.25,`扑救边缘球伸展 ${keeperReach(w).toFixed(2)}`);
});
test('门将准备姿态：球飞向球门时下蹲前倾，球回到己方时恢复站立',()=>{
  const w=buildWorld(assets),s=playing();const torso=w.keeper.userData.torso;
  s.ball.vz=-4;let now=0;for(let i=0;i<30;i++)w.update(s,0,false,now+=1/60);const idle={y:w.keeper.position.y,lean:torso.rotation.x};
  s.ball.vz=6;s.ball.z=5;for(let i=0;i<30;i++)w.update(s,0,false,now+=1/60);
  assert.ok(w.keeper.position.y<idle.y-.04,`下蹲 ${w.keeper.position.y.toFixed(3)}`);assert.ok(Math.abs(torso.rotation.x-idle.lean)>.08,'前倾');
  s.ball.vz=-4;for(let i=0;i<40;i++)w.update(s,0,false,now+=1/60);assert.ok(Math.abs(w.keeper.position.y-idle.y)<.01,'恢复站立');
});
