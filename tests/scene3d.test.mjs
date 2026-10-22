import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {createGame,startGame,stepGame,ballHeight,hitZone,swingPreview,LEVELS,KEEPER_Z,KEEPER_REACH,WEAPONS,PLAYER_Z} from '../dist/core.mjs';

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
test('球拍和剑替换持有装备',()=>{
  const w=buildWorld();const s=createGame(0,'racket');startGame(s);stepGame(s,1,0);w.update(s,0,true);
  assert.equal(w.gear.racket.visible,true);assert.equal(w.gear.glove.visible,false);
  s.weapon='sword';w.update(s,0,true);assert.equal(w.gear.sword.visible,true);assert.equal(w.gear.racket.visible,false);
});
test('竖屏手机比例下两个球门和整片防守区完整可见，球场占满画面宽度',()=>{
  const w=buildWorld();
  for(const aspect of [.62,.76,.85,.96]){w.resize(aspect);
    for(const [x,z,y] of [[-4.3,10.6,0],[4.3,10.6,0],[-3.9,-1.1,0],[3.9,-1.1,0],[-4.2,9.7,1.3],[4.2,9.7,1.3],[-4,0,1.1],[4,0,1.1]]){const p=w.project(x,z,y);assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1,JSON.stringify({aspect,x,z,y,p}));}
    const near=w.project(-4.2,0,0),nearR=w.project(4.2,0,0);assert.ok(nearR.x-near.x>.8,`aspect ${aspect} 近端宽度占比 ${(nearR.x-near.x).toFixed(2)}`);}
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
function incomingAt(z,weapon='glove'){const s=createGame(0,weapon);startGame(s);stepGame(s,1,0);s.ball={x:0,z,vx:0,vz:-4,z0:z,z1:PLAYER_Z};s.player.x=0;return s;}
test('击球区与甜点带的位置和尺寸与真实判定一致',()=>{
  const w=buildWorld();for(const id of Object.keys(WEAPONS)){const s=incomingAt(2.4,id);s.player.x=.8;w.update(s,0,true);const r=hitZone(s);
    assert.ok(Math.abs(w.zone.fill.position.x-(r.left+r.right)/2)<1e-9);assert.ok(Math.abs(w.zone.fill.scale.x-(r.right-r.left))<1e-9);
    assert.ok(Math.abs(-w.zone.fill.position.z-(r.near+r.far)/2)<1e-9);assert.ok(Math.abs(w.zone.fill.scale.y-(r.far-r.near))<1e-9);
    assert.ok(Math.abs(-w.zone.band.position.z-(r.sweetNear+r.sweetFar)/2)<1e-9);assert.ok(Math.abs(w.zone.band.scale.y-(r.sweetFar-r.sweetNear))<1e-9);}
});
test('提示亮度跟随挥击预判：重炮时甜点带高亮，挥空时变暗；方向箭头只在能打到时出现',()=>{
  const w=buildWorld();const kinds={};
  for(let z=4;z>1;z-=.01){const s=incomingAt(z);const p=swingPreview(s);if(kinds[p.kind])continue;w.update(s,0,true);kinds[p.kind]={band:w.zone.band.material.opacity,arrow:w.aim.visible};}
  assert.ok(kinds.perfect&&kinds.whiff&&kinds.clean,JSON.stringify(Object.keys(kinds)));
  assert.ok(kinds.perfect.band>=.8);assert.ok(kinds.whiff.band<.35);assert.ok(kinds.perfect.band>kinds.clean.band);
  assert.equal(kinds.perfect.arrow,true);assert.equal(kinds.clean.arrow,true);assert.equal(kinds.whiff.arrow,false);
});
test('射门后显示路线终点：被门将封住为红色，门前空着为绿色',()=>{
  const w=buildWorld(),s=createGame(0);startGame(s);stepGame(s,1,0);
  s.ball={x:0,z:3,vx:0,vz:5,z0:2,z1:KEEPER_Z};s.shot={x:0,z:2,angle:0,kind:'perfect',at:s.elapsed};s.keeper.x=0;w.update(s,0,true);
  assert.equal(w.target.visible,true);const blocked=w.target.material.color.getHexString();
  s.keeper.x=-2;w.update(s,0,true);const open=w.target.material.color.getHexString();
  assert.notEqual(blocked,open);assert.ok(parseInt(blocked.slice(0,2),16)>parseInt(blocked.slice(2,4),16),'封住应偏红');assert.ok(parseInt(open.slice(2,4),16)>parseInt(open.slice(0,2),16),'空门应偏绿');
});
