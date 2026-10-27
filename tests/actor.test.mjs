import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
import {createGame,startGame,stepGame,WEAPONS,KEEPER_Z,PLAYER_Z} from '../dist/core.mjs';
const assets=await loadCharacters();

function playing(level=0){const s=createGame(level);s.practiceLeft=0;startGame(s);for(let i=0;i<400&&s.phase!=='playing';i++)stepGame(s,1/120,0);return s;}

test('两名球员都是一个蒙皮身体（加描边），带背号和两只拳套',()=>{
  const w=buildWorld(assets);
  for(const root of [w.hero,w.keeper]){
    const bodies=[],names=[];root.traverse(o=>{if(o.isSkinnedMesh&&o.name==='jersey-body')bodies.push(o);if(o.name)names.push(o.name);});
    assert.equal(bodies.length,1,`${root.name} 身体`);
    assert.ok(names.includes('jersey-number'),`${root.name} 背号`);
    assert.equal(root.getObjectByName('jersey-number').parent,root.userData.chest,`${root.name} 背号跟着胸口走`);
    assert.equal(names.filter(n=>n==='glove-body').length,2,`${root.name} 拳套`);
  }
});

test('出拳几乎没有前摇：起手 0.03 秒结束时，出拳的手已伸出该动作最大前伸的 80% 以上',()=>{
  const w=buildWorld(assets),striker=w.actors.striker,glove=WEAPONS.glove;
  for(const [ballX,side] of [[.6,'R'],[-.6,'L']]){
    const s=playing();s.player.x=0;s.ball={x:ballX,z:PLAYER_Z+.6,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.swing={time:0};
    w.update(s,0,true,1);s.swing={time:glove.windup};w.update(s,0,true,1);
    const peak=w.punch[side==='L'?'left':'right'].forward,now=striker.handForward(side);
    assert.ok(now>=peak*.8,`${side} 手前伸 ${now.toFixed(3)} / 最大 ${peak.toFixed(3)}`);
  }
});

test('全力飞扑从起跳到起身，头、拳套和胯部都不低于地面',()=>{
  const w=buildWorld(assets),s=createGame(3);s.practiceLeft=0;startGame(s);for(let i=0;i<240&&s.phase!=='playing';i++)stepGame(s,1/120,0);
  s.level={...s.level,keeper:{...s.level.keeper,speed:0,delay:0,error:0,read:0,pattern:0}};s.keeper.x=s.keeper.target=0;s.keeper.err=0;s.keeper.delay=0;
  s.ball={x:1.8,z:5.5,vx:0,vz:6,z0:5.5,z1:KEEPER_Z};s.shot={x:1.8,z:5.5,angle:0,kind:'straight',at:s.elapsed};s.swing=null;
  const goalie=w.actors.goalie,hip=new THREE.Vector3();let t=1,lowest=Infinity,tilt=0;
  for(let i=0;i<300;i++){stepGame(s,1/120,0);if(i%2)continue;w.update(s,0,false,t+=1/60);
    lowest=Math.min(lowest,goalie.lowestPoint(),goalie.bones.hips.getWorldPosition(hip).y);tilt=Math.max(tilt,Math.abs(w.keeper.rotation.z));}
  assert.ok(tilt>1.1,`应有全力飞身 ${tilt.toFixed(2)}`);
  assert.ok(lowest>=-1e-6,`最低点 ${lowest.toFixed(3)}`);
});

test('同一状态渲染两次姿态相同；减少动态效果时击中不做挤压回弹',()=>{
  const w=buildWorld(assets),s=playing();s.ball={x:0,z:2.2,vx:0,vz:5,z0:2,z1:9.3};s.shot={x:0,z:2.1,angle:0,kind:'perfect',at:s.elapsed};
  const quats=()=>{const q=[];w.hero.traverse(o=>{if(o.isBone)q.push(...o.quaternion.toArray());});return q;};
  w.update(s,0,false,0);w.update(s,0,false,.03);const squash=w.actors.striker.root.children[0].children[0].scale.y;
  assert.ok(squash<1,'击中瞬间有挤压');
  const a=quats();w.update(s,0,false,.03);assert.deepEqual(quats(),a,'同一状态同一时刻姿态不变');
  const r=buildWorld(assets);r.update(s,0,true,0);r.update(s,0,true,.03);
  assert.equal(r.actors.striker.root.children[0].children[0].scale.y,1,'减少动态效果时不挤压');
});
