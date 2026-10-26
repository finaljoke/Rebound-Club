import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {createGame,startGame,stepGame,pauseGame,resumeGame,GOAL_Z} from '../dist/core.mjs';

function play(){const s=createGame();startGame(s);stepGame(s,1,0);return s;}
function crowdParts(w){const group=w.scene.getObjectByName('spectators');assert.ok(group?.isGroup,'观众的身体、头和欢呼手臂需组成同一个批量绘制角色');const parts=[];group.traverse(o=>{if(o.isInstancedMesh)parts.push(o);});return parts;}
function snapshot(w){return crowdParts(w).map(o=>Array.from(o.instanceMatrix.array));}
function score(s){s.ball={x:-2,z:6,vx:0,vz:7,z0:6,z1:GOAL_Z};s.keeper.x=s.keeper.target=2;s.keeper.delay=0;s.keeper.err=0;s.lastShot='straight';s.shot={x:-2,z:6,kind:'straight',at:s.elapsed};}

test('观众新部件在进球时跟随身体、手臂改变姿态，暂停后全部冻结',()=>{
  const w=buildWorld(),s=play();score(s);w.update(s,0,false,0);
  const parts=crowdParts(w),heads=parts.find(p=>p.name==='spectator-heads'),arms=parts.find(p=>p.name==='spectator-arms');assert.ok(heads&&arms);
  const restArms=Array.from(arms.instanceMatrix.array);let now=0,scored=false;
  for(let i=0;i<180;i++){stepGame(s,1/60,0);now+=1/60;if(s.events.includes('goal'))scored=true;w.update(s,0,false,now);if(scored)break;}
  assert.ok(scored);for(let i=0;i<18;i++){stepGame(s,1/60,0);w.update(s,0,false,now+=1/60);}
  assert.notDeepEqual(Array.from(arms.instanceMatrix.array),restArms);
  const bodyAt=new THREE.Matrix4(),headAt=new THREE.Matrix4();for(let i=0;i<w.crowd.count;i++){w.crowd.getMatrixAt(i,bodyAt);heads.getMatrixAt(i,headAt);assert.deepEqual(headAt.elements,bodyAt.elements,'头部不能落后于跳起的身体');}
  pauseGame(s);w.update(s,0,false,now+=1/60);const frozen=snapshot(w);
  for(let i=0;i<60;i++)w.update(s,0,false,now+=1/60);
  assert.deepEqual(snapshot(w),frozen);
  resumeGame(s);for(let i=0;i<12;i++){stepGame(s,1/60,0);w.update(s,0,false,now+=1/60);}
  assert.notDeepEqual(snapshot(w),frozen);
});

test('减少动态效果时新增观众部件不晃动或挥手，连续更新不增加渲染资源',()=>{
  const w=buildWorld(),s=play();score(s);w.update(s,0,true,0);const still=snapshot(w);
  const resources=()=>{const ids=[];w.scene.traverse(o=>ids.push([o.uuid,o.geometry?.uuid,o.material?.uuid]));return ids;},before=resources();
  for(let i=1;i<150;i++){stepGame(s,1/120,0);w.update(s,0,true,i/120);}
  assert.deepEqual(snapshot(w),still);assert.deepEqual(resources(),before);
  for(const p of crowdParts(w))assert.equal(p.castShadow,false,'背景观众不投影');
});
