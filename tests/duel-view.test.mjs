import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';
import {loadCharacters} from './helpers/characters.mjs';
import {WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,mirrorBall,OPP_Z,DUEL,SIDES} from '../dist/duel-core.mjs';
import {viewFor} from '../dist/duel-view.mjs';
import {createBot} from '../dist/duel-bot.mjs';
const assets=await loadCharacters();

function inPlay(){const s=createDuel();startDuel(s);for(let i=0;i<200&&s.phase!=='playing';i++)stepDuel(s,1/60);return s;}

test('对战画面：两边视角都是自己在近端、对手在远端对应位置；对手出拳几乎没有前摇；没有门将扑救范围条', ()=>{
  for(const side of ['a','b']){
    const w=buildWorld(assets,{duel:true}),opp=side==='a'?'b':'a',s=inPlay();
    s.players[side].x=side==='a'?.9:-.9;s.players[opp].x=side==='a'?-1.4:1.4;
    const v=viewFor(s,side);w.update(v,0,true,1);
    let body=null;w.hero.traverse(o=>{if(o.name==='jersey-body')body=o;});assert.ok(body,'近端是主角模型');
    assert.ok(Math.abs(w.hero.position.x-.9)<1e-9,`${side}: 自己在本地 x=0.9`);
    assert.ok(Math.abs(w.keeper.position.x+1.4)<1e-9&&Math.abs(w.keeper.position.z+OPP_Z)<1e-9,`${side}: 对手在本地 x=-1.4、远端站位`);
    assert.equal(w.reachBar.visible,false);
    // The opponent swings at a ball on the screen's right of it (its own left glove).
    const l={x:v.keeper.x+.6,z:OPP_Z-.6,vx:0,vz:4,curve:null,kind:null,z0:2,z1:OPP_Z};Object.assign(s.ball,side==='a'?l:mirrorBall(l));
    s.players[opp].swing={time:0};w.update(viewFor(s,side),0,true,1);
    s.players[opp].swing.time=WEAPONS.glove.windup;w.update(viewFor(s,side),0,true,1);
    const c=w.oppPunch.left,now=w.actors.goalie.handForward(c.side);
    assert.ok(now>=c.forward*.8,`${side}: 对手手前伸 ${now.toFixed(3)} / 最大 ${c.forward.toFixed(3)}`);
  }
});

test('对战画面：近端球门与远端同宽', ()=>{
  const w=buildWorld(assets,{duel:true}),box=new THREE.Box3().setFromObject(w.nearGoal);
  assert.ok(box.max.x<DUEL.goalHalf+.2&&box.max.x>DUEL.goalHalf,`近端球门半宽 ${box.max.x.toFixed(2)}`);
  const single=new THREE.Box3().setFromObject(buildWorld(assets).nearGoal);assert.ok(single.max.x>3.9,'单机近端球门不变');
});

const draws=w=>{let main=0,casters=0;w.scene.traverseVisible(o=>{if(o.isMesh||o.isLine||o.isPoints){main++;if(o.isMesh&&o.castShadow)casters++;}});return {main,casters};};
test('对战连续渲染 300 帧（有击中、进球）：不新建物体、几何体、材质', ()=>{
  const w=buildWorld(assets,{duel:true});w.resize(.46);const s=createDuel(),bots={a:createBot({seed:3}),b:createBot({seed:4})};startDuel(s);
  const count=()=>{let objects=0;const g=new Set(),m=new Set();w.scene.traverse(o=>{objects++;if(o.geometry)g.add(o.geometry.uuid);if(o.material)m.add(o.material.uuid);});return [objects,g.size,m.size];};
  w.update(viewFor(s,'a'),0,false,0);const before=count();const seen=new Set();
  for(let f=1;f<=300;f++){
    const ins={};for(const side of SIDES){const d=bots[side].decide(viewFor(s,side),1/60);ins[side]={axis:d.axis};if(d.skill)duelSkill(s,side,d.skill,d.axis);else if(d.swing)duelAttack(s,side);}
    // A goal inside the window: A is pulled far off a fast ball coming at it.
    if(f===150){s.players.a.x=3.4;Object.assign(s.ball,{x:-1,z:2.5,vx:0,vz:-9,curve:null,kind:null});}
    stepDuel(s,1/60,ins);for(const e of s.events)seen.add(e.type);
    w.update(viewFor(s,'a'),ins.a.axis,false,f/60);w.shake(.03);
  }
  assert.ok(seen.has('hit')||seen.has('perfect'),'期间有击中');assert.ok(seen.has('goal'),'期间有进球');
  assert.deepEqual(count(),before);
});

// Measured at the moments perf.test.mjs measures the single-player court (lobby, just after the serve), same limits.
test('对战绘制数：准备状态与发球后，可见物体 ≤100、投影物体 ≤50（与 perf.test 的统计时机和阈值相同）', ()=>{
  const w=buildWorld(assets,{duel:true});w.resize(.46);
  for(const s of [createDuel(),inPlay()])for(const side of SIDES){w.update(viewFor(s,side),0,false,1);const c=draws(w);
    assert.ok(c.main<=100,`${side} 可见物体 ${c.main}`);assert.ok(c.casters<=50,`${side} 投影物体 ${c.casters}`);}
});
