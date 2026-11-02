import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,hitZone,saveCause,WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {timingWord,SAVE_WHY} from '../dist/ui.mjs';

function play(level=0){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const half=WEAPONS.glove.reach*.5,sweet=PLAYER_Z+half;
// Opens the active window when the ball is at timing t (share of the half box in front of the sweet spot).
function swingAt(s,t,axis=0){const z=sweet+t*half,w=WEAPONS.glove;for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,axis);}

test('每一拍记下离甜点差多少毫秒：甜点内为 0，早为正、晚为负，和实际触球位置一致',()=>{
  let s=play();incoming(s);swingAt(s,0);assert.equal(s.lastShot,'perfect');assert.equal(s.shot.timing,0);
  for(const t of [.9,-.9]){s=play();incoming(s);const r=hitZone(s),v=Math.abs(s.ball.vz);swingAt(s,t,1);
    const want=t>0?(s.shot.z-r.sweetFar)/v*1000:(s.shot.z-r.sweetNear)/v*1000;
    assert.ok(Math.sign(s.shot.timing)===Math.sign(t),`t=${t} timing=${s.shot.timing}`);assert.ok(Math.abs(s.shot.timing-want)<=1,`t=${t} ${s.shot.timing} vs ${want.toFixed(1)}`);}
  assert.equal(timingWord(32),'早 32 毫秒');assert.equal(timingWord(-18),'晚 18 毫秒');assert.equal(timingWord(0),'');
});
test('被扑原因：压边押中这一侧、出击封住平射、守线守住高球和中路，其余按正打在身上、追上了',()=>{
  const at=(stance,zone,cross,kx=0)=>{const s=play(3);s.shot={zone,read:{stance:stance&&{kind:stance[0],side:stance[1]},kx,cross}};return saveCause(s);};
  assert.equal(at(['lean',1],'mid',1.6),'lean');assert.equal(at(['lean',1],'low',-1.6,-1.2),'body','打了另一边，只是正对着它');
  assert.equal(at(['rush',0],'mid',.8),'rush');assert.equal(at(['rush',0],'low',.8),'rush');assert.equal(at(['rush',0],'top',.8,0),'chase','吊高被扑不怪出击');
  assert.equal(at(['set',0],'top',1.4),'set');assert.equal(at(['set',0],'mid',1.4),'set');assert.equal(at(['set',0],'low',1.4,0),'chase','打低平被扑不怪守线');
  assert.equal(at(null,'mid',.3,.2),'body');assert.equal(at(null,'mid',1.8,-1.5),'chase');
  const s=play(3);s.shot={zone:'mid'};assert.equal(saveCause(s),'chase','没有射门信息（技能球）按追上了算');
  for(const k of ['lean','rush','set','body','chase'])assert.equal(SAVE_WHY[k].length,2);
});
test('实战里：用错射法被扑，原因说的正是那个姿态；用对了就不会怪到姿态头上',()=>{
  // Level 4 uses all three stances; each is forced on the keeper and met with every window, aimed away from it.
  const causes={};
  for(const kind of ['lean','rush','set'])for(const window of ['early','sweet','late'])for(let k=0;k<10;k++){
    const s=play(3);s.shots=k;s.keeper.stance={kind,side:k%2?1:-1};s.keeper.x=0;incoming(s,(k%5-2)*.6,8);
    const w=WEAPONS.glove,r=hitZone(s),v=Math.abs(s.ball.vz),z=window==='early'?r.far-v*.035:window==='late'?r.sweetNear-v*.035:(r.sweetNear+r.sweetFar)/2;
    const away=kind==='lean'?-s.keeper.stance.side:(s.player.x>0?-1:1);
    for(let i=0;i<2000&&s.ball.z>z+v*w.windup;i++)stepGame(s,1/120,0);attack(s);
    for(let i=0;i<900&&!s.events.includes('goal')&&!s.events.includes('save');i++)stepGame(s,1/120,s.swing&&!s.swing.hit?away:0);
    if(s.events.includes('save')){const key=kind+'/'+window;(causes[key]??=[]).push(s.saveCause);
      // A lean is blamed only for a ball that went its way (an early aimed contact banks off the far wall onto the lean's side).
      // (The keeper picks its next stance on the save, so the one this shot met is read from the shot.)
      const r=s.shot.read;if(kind==='lean')assert.equal(s.saveCause==='lean',Math.sign(Math.round(r.cross*10))===r.stance.side,`${key} ${s.saveCause}`);}}
  const answer={rush:'early',set:'late'};
  for(const [key,list] of Object.entries(causes)){const [kind,window]=key.split('/');
    if(kind!=='lean'&&window!==answer[kind])assert.ok(list.every(c=>c===kind),`${key}: ${list}`);
    if(kind!=='lean'&&window===answer[kind])assert.ok(!list.includes(kind),`${key}: ${list}`);}
  assert.ok((causes['rush/sweet']?.length??0)>=5&&(causes['set/early']?.length??0)>=5,JSON.stringify(Object.fromEntries(Object.entries(causes).map(([k,v])=>[k,v.length]))));
});
