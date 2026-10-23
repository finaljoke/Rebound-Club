import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildRallyWorld} from '../dist/rally-scene.mjs';
import {createRally,startRally,stepRally,pauseRally} from '../dist/rally-core.mjs';
function playing(){const s=createRally();startRally(s);stepRally(s,1);return s;}
test('对打场景使用真实球高和角色坐标，渲染不会修改规则状态',()=>{
 const w=buildRallyWorld();assert.ok(w?.scene?.isScene);const s=playing();s.ball.x=1;s.ball.y=1.4;s.ball.z=6;
 const before=JSON.stringify(s);w.update(s,false);assert.equal(JSON.stringify(s),before);
 assert.deepEqual(w.ball.position.toArray(),[1,1.4,-6]);assert.equal(w.player.position.z,-s.player.z);assert.equal(w.opponent.position.z,-s.opponent.z);
});
test('AC11 竖屏横屏都容纳两条底线、球网两端与双方头顶',()=>{
 const w=buildRallyWorld();assert.ok(w);
 for(const aspect of [.56,.65,.76,1.45,1.9]){w.resize(aspect);
  const points=[[-3.82,0,0],[3.82,0,0],[-3.82,10,0],[3.82,10,0],[-3.82,5,.62],[3.82,5,.62]];
  for(const x of [-3.45,3.45])points.push([x,-2.1,2.3],[x,11.65,2.3],[x,-2.1,0],[x,11.65,0]);
  for(const [x,z,y] of points){const p=w.project(x,z,y);assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1,JSON.stringify({aspect,x,z,y,p}));}
 }
});
test('AC7 全蓄力期间保持引拍、蓄力环与球拍发光；出手后撤掉前兆',()=>{
 const w=buildRallyWorld();assert.ok(w);const s=playing();s.ball.hitter='player';s.opponent.heavy=true;s.opponent.chargeAt=.2;
 for(const t of [.2,.4,.7,1.1]){s.elapsed=t;w.update(s,false);assert.equal(w.chargeRing.visible,true);assert.ok(w.opponentRacket.material.emissiveIntensity>.1);assert.ok(w.opponentArms[1].rotation.x<0);}
 s.opponent.heavy=false;s.opponent.chargeAt=null;w.update(s,false);assert.equal(w.chargeRing.visible,false);assert.equal(w.opponentRacket.material.emissiveIntensity,0);
});
test('AC12 暂停保留全部姿态与提示，减少动态效果的蓄力环不脉动',()=>{
 const w=buildRallyWorld();assert.ok(w);const s=playing();s.ball.hitter='player';s.opponent.heavy=true;s.opponent.chargeAt=.2;s.elapsed=.5;w.update(s,false);
 const snap=()=>JSON.stringify({player:w.player.toJSON(),opponent:w.opponent.toJSON(),charge:w.chargeRing.toJSON(),camera:w.camera.toJSON(),ball:w.ball.toJSON()});
 const before=snap();pauseRally(s);for(let i=0;i<60;i++)w.update(s,false);assert.equal(snap(),before);
 w.update(s,true);const scale=w.chargeRing.scale.toArray();s.elapsed+=.2;w.update(s,true);assert.deepEqual(w.chargeRing.scale.toArray(),scale);
});
test('反制时玩家球拍短闪，暂停时保持，规则时间继续后熄灭',()=>{
 const w=buildRallyWorld(),s=playing();assert.ok(w.playerRacket);s.lastShot={kind:'counter',hitter:'player',at:s.elapsed};w.update(s,false);assert.ok(w.playerRacket.material.emissiveIntensity>0);
 pauseRally(s);for(let i=0;i<30;i++)w.update(s,false);assert.ok(w.playerRacket.material.emissiveIntensity>0);
 s.elapsed+=.3;w.update(s,false);assert.equal(w.playerRacket.material.emissiveIntensity,0);
});

