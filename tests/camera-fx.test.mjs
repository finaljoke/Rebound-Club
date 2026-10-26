import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {createGame,startGame,stepGame,PLAYER_Z,KEEPER_Z,SIDE} from '../dist/core.mjs';

const heightShare=(w,z)=>{const top=w.project(0,z,2.15),feet=w.project(0,z,0);return feet.y-top.y;};
test('竖屏与横屏：俯角更低、人物更大，同时两端球门、防守区和左右边界都在画面内',()=>{
  const w=buildWorld();
  for(const aspect of [.62,.87,1.45,2.2]){w.resize(aspect);
    // Portrait may crop the near corners behind the defender (user-approved for depth), never the near goal mouth.
    const near=aspect<1?[[-1.6,0,1.1],[1.6,0,1.1]]:[[-4,0,1.1],[4,0,1.1]];
    for(const [x,z,y] of [[-4.3,10.6,0],[4.3,10.6,0],[-4.2,9.7,1.3],[4.2,9.7,1.3],[-SIDE,PLAYER_Z,0],[SIDE,PLAYER_Z,0],...near,[0,PLAYER_Z,2.2],[0,KEEPER_Z,2.2]]){
      const p=w.project(x,z,y);assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1,JSON.stringify({aspect,x,z,y,p}));}
    const pitch=Math.atan2(w.camera.position.y,Math.hypot(w.camera.position.x,w.camera.position.z+4.3))*180/Math.PI;
    assert.ok(pitch<48,`aspect ${aspect} 俯角 ${pitch.toFixed(0)}°`);
    assert.ok(heightShare(w,PLAYER_Z)>(aspect<1?.1:.18),`aspect ${aspect} 人物高度占比 ${heightShare(w,PLAYER_Z).toFixed(3)}`);
    // Portrait reads depth through size: the keeper is drawn clearly smaller than the defender.
    if(aspect<1)assert.ok(heightShare(w,KEEPER_Z)<heightShare(w,PLAYER_Z)*.92,`aspect ${aspect} 门将/主角 ${(heightShare(w,KEEPER_Z)/heightShare(w,PLAYER_Z)).toFixed(2)}`);}
});
test('镜头只随画面尺寸变化，对局中移动、击球不推拉镜头',()=>{
  const w=buildWorld(),s=createGame();startGame(s);stepGame(s,1,0);w.resize(.7);const pos=w.camera.position.clone();
  for(let i=0;i<60;i++){s.player.x=Math.sin(i)*3;s.ball.z=8-i*.1;w.update(s,1,true,i/60);w.shake(0);}
  assert.ok(w.camera.position.distanceTo(pos)<1e-9);
});
test('近端球门横梁与球网淡化，不挡住人物和来球',()=>{
  const w=buildWorld();const near=w.nearGoal;assert.ok(near);
  near.traverse(o=>{if(o.material){assert.equal(o.material.transparent,true);assert.ok(o.material.opacity<=.45,`${o.type} ${o.material.opacity}`);}});
});
function strikeState(weapon,kind){const s=createGame(0,weapon);startGame(s);stepGame(s,1,0);s.ball={x:0,z:2.2,vx:0,vz:5,z0:2,z1:9.3};s.shot={x:0,z:2.1,angle:0,kind,at:s.elapsed};return s;}
test('击中特效按装备区分，完美击球更大，短时间后自动消失',()=>{
  const kinds={};
  for(const weapon of ['glove','racket','sword']){const w=buildWorld();
    let s=strikeState(weapon,'right');w.update(s,0,false,0);w.update(s,0,false,.04);assert.equal(w.fx.visible,true);kinds[weapon]=w.fx.userData.flash;const normal=w.fx.userData.peak;
    w.update(s,0,false,.6);assert.equal(w.fx.visible,false,'特效应在寿命结束后隐藏');
    s=strikeState(weapon,'perfect');w.update(s,0,false,1);w.update(s,0,false,1.04);assert.ok(w.fx.userData.peak>normal*1.5,`${weapon} 完美 ${w.fx.userData.peak} 普通 ${normal}`);}
  assert.equal(new Set(Object.values(kinds)).size,3);
});
test('连续渲染更新不新建物体、几何体或材质',()=>{
  const w=buildWorld(),s=strikeState('glove','perfect');const count=()=>{let objects=0;const g=new Set(),m=new Set();w.scene.traverse(o=>{objects++;if(o.geometry)g.add(o.geometry.uuid);if(o.material)m.add(o.material.uuid);});return [objects,g.size,m.size];};
  w.update(s,0,false,0);const before=count();
  for(let i=1;i<300;i++){s.ball.z+=.02;s.elapsed+=1/60;if(i%40===0)s.shot={...s.shot,at:s.elapsed,kind:i%80?'perfect':'right'};w.update(s,i%2,false,i/60);w.shake(.05);}
  assert.deepEqual(count(),before);
});
