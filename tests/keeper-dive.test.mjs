import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
const assets=await loadCharacters();
import {createGame,startGame,stepGame,KEEPER_Z} from '../dist/core.mjs';

// The keeper's save is staged like a real goalkeeper's: it springs before the ball arrives, meets it with both hands,
// stretches only as far as the ball is from it, and after a full dive lands on its side and gets back up.
// A still keeper (speed 0, no misread) faces a straight shot passing `gap` to its side; frames are rendered at 60 Hz.
function film(gap){
  const w=buildWorld(assets),s=createGame(3);s.practiceLeft=0;startGame(s);for(let i=0;i<240&&s.phase!=='playing';i++)stepGame(s,1/120,0);
  s.level={...s.level,keeper:{...s.level.keeper,speed:0,delay:0,error:0,read:0,pattern:0}};s.keeper.x=s.keeper.target=0;s.keeper.err=0;s.keeper.delay=0;
  s.ball={x:gap,z:5.5,vx:0,vz:6,z0:5.5,z1:KEEPER_Z};s.shot={x:gap,z:5.5,angle:0,kind:'straight',at:s.elapsed};s.lastShot='straight';s.swing=null;
  const cross=(KEEPER_Z-5.5)/6,v=new THREE.Vector3(),frames=[];let t=1;
  for(let i=0;i<Math.round((cross+1.6)*120);i++){
    stepGame(s,1/120,0);if(i%2)continue;w.update(s,0,false,t+=1/60);w.scene.updateMatrixWorld(true);
    let reach=0;const gloves=[];
    w.keeper.traverse(o=>{if(!o.isMesh)return;if(o.name==='glove-body')gloves.push(o.getWorldPosition(new THREE.Vector3()));
      const p=o.geometry.attributes.position;for(let j=0;j<p.count;j+=2){v.fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld);if(v.y<1.7)reach=Math.max(reach,v.x);}});
    const chest=w.keeper.getObjectByName('jersey-body').getWorldPosition(new THREE.Vector3());
    frames.push({u:(i+1)/120-cross,tilt:Math.abs(w.keeper.rotation.z),reach,gloves,chestY:chest.y,saved:s.ball.vz<0,goal:s.goals>0});
  }
  const at=u=>frames.reduce((a,f)=>Math.abs(f.u-u)<Math.abs(a.u-u)?f:a);
  return {frames,at,peak:k=>Math.max(...frames.map(f=>f[k])),standing:frames[0].reach};
}
const near=film(.15),edge=film(.5),wide=film(1.8);

test('规则结果不变：近身和边缘球扑住，贴柱球进',()=>{
  assert.ok(near.frames.at(-1).saved);assert.ok(edge.frames.at(-1).saved);assert.ok(wide.frames.at(-1).goal);
});
test('球到之前就开始起跳，更早时仍是准备姿态',()=>{
  for(const f of [edge,wide]){
    assert.ok(f.at(-.3).reach<=f.standing+.03,`提前太多 ${f.at(-.3).reach.toFixed(2)}`);
    assert.ok(f.at(-.06).reach>=f.standing+.15,`触球前应已伸出 ${f.at(-.06).reach.toFixed(2)} / 站立 ${f.standing.toFixed(2)}`);
  }
});
test('幅度按距离：近身侧步挡，边缘短扑，够不到的全力飞身但不盖住球路',()=>{
  assert.ok(near.peak('tilt')<=.45,`近身倾斜 ${near.peak('tilt').toFixed(2)}`);
  assert.ok(edge.peak('tilt')>=.45&&edge.peak('tilt')<=1.15,`边缘倾斜 ${edge.peak('tilt').toFixed(2)}`);
  assert.ok(wide.peak('tilt')>=1.1,`飞身倾斜 ${wide.peak('tilt').toFixed(2)}`);
  assert.ok(wide.peak('reach')>=1.4,`飞身伸展 ${wide.peak('reach').toFixed(2)}`);
  assert.ok(wide.peak('reach')<=1.8-.2,`飞身盖住了球路 ${wide.peak('reach').toFixed(2)}`);
});
test('触球时双手一起伸向来球一侧，手套迎到球',()=>{
  for(const [f,gap] of [[edge,.5],[wide,1.8]]){const c=f.at(0);
    assert.equal(c.gloves.length,2);for(const g of c.gloves)assert.ok(g.x>.05,`手套在另一侧 ${g.x.toFixed(2)}`);
    const lead=Math.max(...c.gloves.map(g=>g.x));
    if(gap<.55)assert.ok(Math.abs(lead-gap)<=.35,`手套 ${lead.toFixed(2)} 与球 ${gap}`);
  }
});
test('全力扑出后侧身落地，再爬起来回到准备姿态',()=>{
  assert.ok(wide.frames.some(f=>f.u>0&&f.chestY<.55),`没有落地 ${Math.min(...wide.frames.map(f=>f.chestY)).toFixed(2)}`);
  for(const f of [near,edge,wide]){const end=f.at(1.4);assert.ok(end.tilt<.05,`没起身 ${end.tilt.toFixed(2)}`);assert.ok(end.reach<=.72,`没收回 ${end.reach.toFixed(2)}`);}
});
