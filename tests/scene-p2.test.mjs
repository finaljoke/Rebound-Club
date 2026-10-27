import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
const assets=await loadCharacters();

// Share of the frame the playing surface covers, and the defender's on-screen height.
const COURT=[[-4.1,-.2],[4.1,-.2],[4.1,10],[-4.1,10]];
function courtShare(w){const p=COURT.map(([x,z])=>new THREE.Vector3(x,0,-z).project(w.camera));let a=0;for(let i=0;i<4;i++){const q=p[i],r=p[(i+1)%4];a+=q.x*r.y-r.x*q.y;}return Math.abs(a)/8;}
const person=w=>{const top=w.project(0,1.6,2.15),feet=w.project(0,1.6,0);return feet.y-top.y;};
// Measured on the framing before this change (main be49857).
const BEFORE={.62:{court:.344,person:.107},.65:{court:.356,person:.112},.76:{court:.389,person:.127},1.45:{court:.342,person:.217},1.9:{court:.270,person:.238},2.2:{court:.233,person:.238}};

test('构图收紧：竖屏球场放大至少 5%，中间比例 15%，横屏 30%，人物都不变小',()=>{
  for(const [aspect,was] of Object.entries(BEFORE)){
    const w=buildWorld(assets);w.resize(Number(aspect));const c=courtShare(w),h=person(w),gain=Number(aspect)<1?1.05:Number(aspect)<1.8?1.15:1.3;
    assert.ok(c>=was.court*gain,`宽高比 ${aspect} 球场 ${c.toFixed(3)}（原 ${was.court}）`);
    assert.ok(h>=was.person*.99,`宽高比 ${aspect} 人物 ${h.toFixed(3)}（原 ${was.person}）`);
  }
});

import {createGame,startGame,stepGame,KEEPER_Z,FAR_WALL,GOAL_Z} from '../dist/core.mjs';
function playing(level=0){const s=createGame(level);startGame(s);for(let i=0;i<400&&s.phase!=='playing';i++)stepGame(s,1/60,0);return s;}
const crowdPositions=w=>{const m=new THREE.Matrix4(),v=new THREE.Vector3(),out=[];for(let i=0;i<w.crowd.count;i++){w.crowd.getMatrixAt(i,m);out.push(v.setFromMatrixPosition(m).clone().applyMatrix4(w.crowd.matrixWorld));}return out;};

test('远端看台坐满观众，竖屏画面上方不再是空地',()=>{
  const w=buildWorld(assets);w.resize(.65);w.scene.updateMatrixWorld(true);
  assert.ok(w.crowd?.isInstancedMesh&&w.crowd.count>=30,'观众用一次批量绘制');
  const seats=crowdPositions(w);assert.ok(seats.every(p=>-p.z>FAR_WALL+.8),'观众都在远端墙后面');
  const inTop=seats.map(p=>p.project(w.camera)).filter(p=>Math.abs(p.x)<=1&&p.y<=1&&p.y>.55);
  assert.ok(inTop.length>=10,`竖屏画面上方看得到的观众 ${inTop.length}`);
});

test('招牌挂在看台上：竖屏完整入画且不和门将头部活动范围重叠；横屏没有合适位置时不挂',()=>{
  // The keeper's head can be anywhere in x ±4 (goal half-width plus a dive), 1.4–2.4 high, at its line.
  for(const aspect of [.56,.62,.76,.96,1.05,1.45,1.9,2.6]){
    const w=buildWorld(assets);w.resize(aspect);w.scene.updateMatrixWorld(true);
    if(aspect<1)assert.ok(w.sign.visible,`宽高比 ${aspect}：竖屏要挂招牌`);if(!w.sign.visible)continue;
    const P=v=>v.project(w.camera),box=new THREE.Box3().setFromObject(w.sign),s=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])s.push(P(new THREE.Vector3(x,y,z)));
    const h=[[-4,1.4],[4,1.4],[-4,2.4],[4,2.4]].map(([x,y])=>P(new THREE.Vector3(x,y,-KEEPER_Z)));
    const r=pts=>({l:Math.min(...pts.map(p=>p.x)),r:Math.max(...pts.map(p=>p.x)),b:Math.min(...pts.map(p=>p.y)),t:Math.max(...pts.map(p=>p.y))}),S=r(s),H=r(h);
    assert.ok(S.l>=-.97&&S.r<=.97&&S.b>=-.97&&S.t<=.97,`宽高比 ${aspect}：招牌出画 ${JSON.stringify(S)}`);
    assert.ok(S.b>H.t||S.r<H.l||S.l>H.r,`宽高比 ${aspect}：招牌和门将头部范围重叠`);
  }
});

test('进球后观众跳起欢呼，下一次发球前回到座位；轮廓光不投影',()=>{
  const w=buildWorld(assets),s=playing();w.resize(.65);
  const b=s.ball;b.x=-2;b.z=6;b.vx=0;b.vz=7;b.z0=6;b.z1=GOAL_Z;s.keeper.x=2;s.keeper.target=2;s.keeper.delay=0;s.keeper.err=0;s.lastShot='straight';s.shot={x:-2,z:6,kind:'straight',at:0};
  w.update(s,0,false,0);const rest=crowdPositions(w).map(p=>p.y);let now=0,goalAt=null,peak=0,served=null;
  for(let i=0;i<240;i++){stepGame(s,1/60,0);now+=1/60;if(s.events.includes('goal'))goalAt=now;if(goalAt&&s.events.includes('serve'))served=now;w.update(s,0,false,now);
    const ys=crowdPositions(w).map(p=>p.y);if(goalAt)peak=Math.max(peak,...ys.map((y,k)=>y-rest[k]));if(served)break;}
  assert.ok(goalAt&&peak>.15,`欢呼跳起 ${peak.toFixed(2)}`);
  const after=crowdPositions(w).map(p=>p.y);assert.ok(after.every((y,k)=>Math.abs(y-rest[k])<.03),'发球时回到座位');
  const rim=w.scene.children.find(o=>o.isDirectionalLight&&o.name==='rim');assert.ok(rim&&!rim.castShadow&&rim.position.z<-6,'远端轮廓光');
});

import {pauseGame,resumeGame} from '../dist/core.mjs';
test('暂停时整个画面静止：观众、撞墙冲击圈、门将姿态、镜头都不随真实时间变化，恢复后接着播',()=>{
  const w=buildWorld(assets),s=playing();w.resize(.65);
  const b=s.ball;b.x=3.2;b.z=5;b.vx=3;b.vz=5;b.z0=5;b.z1=9.7;b.curve=null;let now=0,walled=false;
  for(let i=0;i<60&&!walled;i++){stepGame(s,1/60,0);now+=1/60;walled=s.events.includes('wall');w.update(s,0,false,now);w.shake(0);}
  assert.ok(walled&&w.wallFx.some(m=>m.visible),'撞墙效果进行中');
  pauseGame(s);w.update(s,0,false,now+=1/60);w.shake(0);
  // Skinned players: every bone's pose is part of the picture too.
  const bones=root=>{const out=[];root.traverse(o=>{if(o.isBone)out.push(...o.quaternion.toArray(),...o.position.toArray());});return out;};
  const snap=()=>JSON.stringify({crowd:Array.from(w.crowd.instanceMatrix.array),fx:w.wallFx.map(m=>[m.visible,m.scale.x]),keeper:w.keeper.position.toArray(),cam:w.camera.position.toArray(),heroBones:bones(w.hero),keeperBones:bones(w.keeper)});
  const frozen=snap();for(let i=0;i<60;i++){w.update(s,0,false,now+=1/60);w.shake(0);}
  assert.equal(snap(),frozen,'暂停一秒后画面不变');
  resumeGame(s);for(let i=0;i<30;i++){stepGame(s,1/60,0);w.update(s,0,false,now+=1/60);w.shake(0);}
  assert.notEqual(snap(),frozen,'恢复后接着播');
});
