import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {createGame,startGame,stepGame,ballHeight,LEVELS,KEEPER_Z} from '../dist/core.mjs';

test('球场、人物与球均为有厚度的3D对象，主要对象投射和接收阴影',()=>{
  const w=buildWorld();assert.ok(w?.scene?.isScene);
  for(const object of [w.hero,w.ball,w.platform]){w.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());assert.ok(size.x>.15&&size.y>.15&&size.z>.15);}
  assert.ok(w.scene.children.some(x=>x.isDirectionalLight&&x.castShadow));
  assert.equal(w.platform.receiveShadow,true);assert.equal(w.ball.children[0].castShadow,true);
  assert.ok(w.camera.isPerspectiveCamera);
});
test('3D人物和球与原有碰撞坐标保持一致，暂停时不会增加位移',()=>{
  const w=buildWorld();assert.ok(w);const s=createGame();startGame(s);stepGame(s,1,0);s.player.x=2;s.ball.x=-1.5;s.ball.z=4;
  const before=JSON.stringify(s);w.update(s,.7,false);assert.equal(JSON.stringify(s),before);
  assert.equal(w.hero.position.x,2);assert.equal(w.hero.position.z,-1.6);assert.equal(w.ball.position.x,-1.5);assert.equal(w.ball.position.z,-4);
  assert.equal(w.ball.position.y,ballHeight(s));
  const pose=w.hero.toJSON();w.update(s,.7,false);assert.deepEqual(w.hero.toJSON(),pose);
});
test('球拍和剑替换持有装备，球越过人物后命中提示不亮起',()=>{
  const w=buildWorld();assert.ok(w);const s=createGame(0,'racket');startGame(s);stepGame(s,1,0);s.ball={x:0,z:1.4,vx:0,vz:-4};w.update(s,0,true);
  assert.equal(w.gear.racket.visible,true);assert.equal(w.gear.glove.visible,false);assert.equal(w.range.material.opacity,.1);
  s.weapon='sword';s.ball.z=2;w.update(s,0,true);assert.equal(w.gear.sword.visible,true);assert.equal(w.gear.racket.visible,false);assert.ok(w.range.material.opacity>.1);
});
test('常见手机比例下球场边界和球门完整进入镜头',()=>{
  const w=buildWorld();assert.equal(typeof w.resize,'function');
  for(const aspect of [.76,.85,.96]){w.resize(aspect);for(const [x,z,y] of [[-5.2,-11.4,0],[5.2,-11.4,0],[-5.2,2.3,0],[5.2,2.3,0],[-4.2,-9.8,1.9],[4.2,-9.8,1.9]]){const p=w.project(x,-z,y);assert.ok(p.x>=.015&&p.x<=.985&&p.y>=.015&&p.y<=.985,JSON.stringify({aspect,x,z,p}));}}
});
test('守门员与远端球门是有体积的3D对象，守门员位置与状态一致',()=>{
  const w=buildWorld();w.scene.updateMatrixWorld(true);
  for(const object of [w.keeper,w.farGoal]){const size=new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());assert.ok(size.x>.15&&size.y>.15&&size.z>.15);}
  const s=createGame();startGame(s);stepGame(s,1,0);s.keeper.x=1.2;w.update(s,0,true);
  assert.equal(w.keeper.position.x,1.2);assert.equal(w.keeper.position.z,-KEEPER_Z);
});
test('远端门宽随关卡即时更新',()=>{
  const w=buildWorld();
  for(const level of [0,5,2]){const s=createGame(level);w.update(s,0,true);
    assert.ok(Math.abs(w.farGoal.getObjectByName('post-right').position.x-LEVELS[level].goalHalf)<1e-9);
    assert.ok(Math.abs(w.farGoal.getObjectByName('post-left').position.x+LEVELS[level].goalHalf)<1e-9);}
});
test('重炮在飞行中有专属外观',()=>{
  const w=buildWorld(),s=createGame();startGame(s);stepGame(s,1,0);s.ball={x:0,z:5,vx:0,vz:6,z0:2,z1:9.3};
  s.power=false;w.update(s,0,true);const normal=w.ball.scale.x,color=w.ball.children[0].material.color.getHex();
  s.power=true;w.update(s,0,true);assert.ok(w.ball.scale.x>normal);assert.notEqual(w.ball.children[0].material.color.getHex(),color);
});
