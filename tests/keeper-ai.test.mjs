import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,hitZone,LEVELS,STANCES,ANSWER,STANCE_RUN,RUSH_Z,KEEPER_Z,PLAYER_Z,WEAPONS} from '../dist/core.mjs';

// Keeper stances (core.mjs STANCES): before each shot the keeper sets itself one way, plainly enough to read, and each
// way has one answer: the far side of a lean, a lob over a rush, a low shot under a set keeper.
function play(level){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=6){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
// Swings so the contact lands in the middle of one window: 'early' (lob), 'sweet' (power) or 'late' (low), aiming `axis`.
function strikeIn(s,window,axis){
  const w=WEAPONS[s.weapon],r=hitZone(s),v=Math.abs(s.ball.vz);
  const z=window==='early'?r.far-v*.035:window==='late'?r.sweetNear-v*.035:(r.sweetNear+r.sweetFar)/2;
  for(let i=0;i<2000&&s.ball.z>z+v*w.windup;i++)stepGame(s,1/120,0);attack(s);
  for(let i=0;i<30&&s.ball.vz<0;i++)stepGame(s,1/120,axis);
}
function resolve(s){for(let i=0;i<900;i++){stepGame(s,1/120,0);for(const e of ['goal','save','wide'])if(s.events.includes(e))return e;}return 'none';}
// Plays a whole level with a scripted defender (tracks the ball, swings on time) and lists the stances it met.
function stancesMet(level,pick=()=>['sweet',1]){
  const s=createGame(level);s.misses=-99;s.level={...s.level,goals:999};startGame(s);const seen=[];let planted=false;
  for(let f=0;f<120*240&&!['won','lost'].includes(s.phase)&&seen.length<60;f++){let axis=0;
    if(s.phase==='playing'&&s.ball.vz<0){
      if(!planted&&s.ball.z<hitZone(s).far+1){planted=true;seen.push(s.keeper.stance?.kind);}
      const dx=s.ball.x-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;
      const [window,side]=pick(s);const r=hitZone(s),v=Math.abs(s.ball.vz),z=window==='early'?r.far-v*.035:window==='late'?r.sweetNear-v*.035:(r.sweetNear+r.sweetFar)/2;
      if(!s.swing&&s.ball.z<=z+v*.03)attack(s);if(s.swing&&!s.swing.hit)axis=side;}
    if(s.ball.vz>0)planted=false;stepGame(s,1/120,axis);}
  return seen;
}

test('每关用的姿态：第1、2关只压边，第3关加出击，第4关起三种都有；教学里不摆姿态',()=>{
  const want=[['lean'],['lean'],['lean','rush'],['lean','rush','set'],['lean','rush','set'],['lean','rush','set']];
  for(let level=0;level<6;level++){assert.deepEqual(Object.keys(LEVELS[level].stances).sort(),[...want[level]].sort());
    const seen=new Set(stancesMet(level));for(const k of seen)assert.ok(want[level].includes(k),`关${level+1} 出现了 ${k}`);
    if(level>=2)assert.ok(seen.size>=2,`关${level+1} 只见到 ${[...seen]}`);}
  const t=createGame(0,'glove',{tutorial:true});startGame(t);stepGame(t,1,0);assert.equal(t.keeper.stance,null);
});
test('压边：门将站到那一侧，后面的关卡偏得更少；押在你最近常打的那一侧',()=>{
  for(let level=0;level<6;level++){const s=play(level);s.keeper.stance={kind:'lean',side:1};incoming(s,0,8);
    for(let i=0;i<90;i++)stepGame(s,1/120,0);
    assert.ok(Math.abs(s.keeper.x-s.level.goalHalf*s.level.lean)<.02,`关${level+1} 门将 x=${s.keeper.x.toFixed(2)}`);}
  for(let level=1;level<6;level++)assert.ok(LEVELS[level].lean<LEVELS[level-1].lean,'压边幅度逐关变小');
  // Always shooting right: once it can tell, a lean goes right.
  const s=createGame(0);s.misses=-99;startGame(s);let leans=0,right=0;
  for(let f=0;f<120*200&&s.phase!=='won'&&leans<20;f++){let axis=0;
    if(s.phase==='playing'&&s.ball.vz<0){const dx=s.ball.x-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;
      if(s.events.includes('stance')&&s.aims.length>=2){leans++;if(s.keeper.stance.side===1)right++;}
      if(!s.swing&&s.ball.z<=PLAYER_Z+.5+Math.abs(s.ball.vz)*.03)attack(s);if(s.swing&&!s.swing.hit)axis=1;}
    s.level={...s.level,goals:99};stepGame(s,1/120,axis);}
  assert.ok(leans>=5&&right===leans,`押右 ${right}/${leans}`);
});
test('出击和守线：出击走到门线前，守线站在门线正中、反应更快',()=>{
  const s=play(3);s.keeper.stance={kind:'rush',side:0};incoming(s,0,8);for(let i=0;i<120;i++)stepGame(s,1/120,0);
  assert.ok(Math.abs(s.keeper.z-RUSH_Z)<1e-6&&Math.abs(s.keeper.x)<.05,`出击 z=${s.keeper.z} x=${s.keeper.x}`);
  const t=play(3);t.keeper.x=1;t.keeper.stance={kind:'set',side:0};incoming(t,0,8);for(let i=0;i<120;i++)stepGame(t,1/120,0);
  assert.ok(Math.abs(t.keeper.z-KEEPER_Z)<1e-6&&Math.abs(t.keeper.x)<1e-6,`守线 z=${t.keeper.z} x=${t.keeper.x}`);
  assert.ok(STANCES.set.delay<STANCES.lean.delay&&STANCES.set.delay<STANCES.rush.delay);
  // It shows the stance the moment the ball heads its way and is in place well before the defender can strike
  // (shooters need ~0.4 s to read a keeper: Morya 2003).
  for(const level of [0,4]){const v=LEVELS[level].speed;assert.ok((KEEPER_Z-RUSH_Z)/STANCE_RUN<(KEEPER_Z-.3-PLAYER_Z)/v-.4,`关${level+1} 来得及亮完`);}
});
test('克制关系：同一局面，压边打另一边、出击吊高、守线打低平都能进，换成别的射法多被扑住',()=>{
  // Each stance meets each shot from many planted moments on level 4 (lean, rush and set all in use there).
  const tally={};
  for(const kind of ['lean','rush','set'])for(let k=0;k<12;k++){
    for(const window of ['early','sweet','late']){
      const s=play(3);s.shots=k;s.keeper.stance={kind,side:k%2?1:-1};s.keeper.x=0;s.keeper.z=KEEPER_Z;incoming(s,(k%5-2)*.6,8);
      const away=kind==='lean'?-s.keeper.stance.side:(s.player.x>0?-1:1);strikeIn(s,window,away);
      const key=kind+'/'+window;tally[key]??={g:0,n:0};tally[key].n++;if(resolve(s)==='goal')tally[key].g++;}}
  const rate=key=>tally[key].g/tally[key].n,best={lean:'sweet',rush:'early',set:'late'};
  for(const kind of ['lean','rush','set']){
    assert.ok(rate(kind+'/'+best[kind])>=.8,`${kind} 用 ${best[kind]} 应该能进：${JSON.stringify(tally)}`);
    for(const window of ['early','sweet','late'])if(window!==best[kind]&&!(kind==='lean'&&window==='late'))
      assert.ok(rate(kind+'/'+window)<=.4,`${kind} 用 ${window} 应该多被扑：${JSON.stringify(tally)}`);}
  assert.equal(ANSWER.rush,'top');assert.equal(ANSWER.set,'low');
});
test('第5关起门将会针对习惯：总用同一种出手，它更常摆出克这种出手的姿态',()=>{
  const share=(level,window)=>{const seen=stancesMet(level,()=>[window,1]).slice(4);return k=>seen.filter(x=>x===k).length/seen.length;};
  for(const level of [4,5]){
    const lobs=share(level,'early'),lows=share(level,'late');
    assert.ok(lobs('set')>.45,`关${level+1} 一直吊高时守线占 ${lobs('set').toFixed(2)}`);
    assert.ok(lows('rush')>.45,`关${level+1} 一直打低平时出击占 ${lows('rush').toFixed(2)}`);}
  // Level 3 does not adapt: the same habit leaves the mix as it was.
  const plain=share(2,'early');assert.ok(plain('rush')>.25&&plain('lean')>.25);
});
test('同一种姿态很少连着出现三次以上',()=>{
  for(const level of [3,5]){const seen=stancesMet(level);let run=1,longest=1;
    for(let i=1;i<seen.length;i++){run=seen[i]===seen[i-1]?run+1:1;longest=Math.max(longest,run);}
    assert.ok(longest<=4,`关${level+1} 连续 ${longest} 次`);}
});
