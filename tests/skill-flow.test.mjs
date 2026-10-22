import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,pauseGame,resumeGame,useSkill,SKILLS,WEAPONS,PLAYER_Z,RALLY_STEP} from '../dist/core.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
function armed(weapon='glove',level=0){const s=play(level,weapon);s.energy=100;s.player.x=.3;s.ball={x:.3,z:sweet(s)+.1,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.hitstop=0;return s;}
const frozen=s=>JSON.stringify({b:s.ball,p:s.player,k:s.keeper,e:s.elapsed});

test('AC7 爆发：0.50秒演出冻结球/双方/计时，结束时从锁定点只发球一次，速度按独立倍率',()=>{
  for(const weapon of Object.keys(WEAPONS)){
    const s=armed(weapon);const contact={x:s.ball.x,z:s.ball.z};assert.equal(useSkill(s,'burst').ok,true);assert.equal(s.phase,'skill');
    const lock=frozen(s),ev=[];
    for(let i=0;i<59;i++){stepGame(s,1/120,1);ev.push(...s.events);assert.equal(frozen(s),lock,`${weapon} 演出中有东西在动`);}
    assert.equal(s.phase,'skill');assert.ok(!ev.includes('burst'));
    for(let i=0;i<4;i++){stepGame(s,1/120,0);ev.push(...s.events);}
    assert.equal(ev.filter(e=>e==='burst').length,1);assert.equal(ev.filter(e=>e==='burstStart').length,1);assert.equal(s.phase,'playing');
    assert.equal(s.shot.x,contact.x);assert.equal(s.shot.z,contact.z);assert.equal(s.lastShot,'burst');assert.equal(s.power,false);
    const expected=Math.min(SKILLS.burst.maxSpeed,s.level.speed*RALLY_STEP*SKILLS.burst.speedScale);
    assert.ok(Math.abs(Math.hypot(s.ball.vx,s.ball.vz)-expected)<1e-9,`${weapon} 速度`);assert.equal(s.hits,1);
  }
});
test('AC7 演出中暂停不推进，恢复后从同一时点继续；外层帧率不同发球时点相同',()=>{
  const s=armed();useSkill(s,'burst');stepGame(s,.25,0);const t=s.skill.time;pauseGame(s);stepGame(s,5,0);assert.equal(s.skill.time,t);
  resumeGame(s);assert.equal(s.phase,'skill');stepGame(s,.2,0);assert.equal(s.phase,'skill');stepGame(s,.06,0);assert.equal(s.phase,'playing');
  const at={};for(const dt of [1/30,1/60,1/120]){const g=armed();useSkill(g,'burst');let n=0;while(g.phase==='skill'&&n<200){stepGame(g,dt,0);n++;}at[dt]=g.elapsed;}
  const vals=Object.values(at);assert.ok(Math.max(...vals)-Math.min(...vals)<=1/30+1e-9);
});
test('AC7 演出结束后不补放期间的缓存攻击，发球后有正常收招',()=>{
  const s=armed();useSkill(s,'burst');for(let i=0;i<30;i++){assert.equal(attack(s),false);assert.equal(useSkill(s,'spin').ok,false);stepGame(s,1/120,0);}
  for(let i=0;i<40;i++)stepGame(s,1/120,0);assert.equal(s.phase,'playing');assert.equal(s.hits,1);assert.ok(s.swing&&s.swing.hit);
});
test('AC8 演出中重试/回准备：新局不带旧演出、能量重置为50',()=>{
  const s=armed();useSkill(s,'burst');stepGame(s,.2,0);const fresh=createGame(s.levelIndex,s.weapon);assert.equal(fresh.skill,null);assert.equal(fresh.energy,50);
  startGame(fresh);stepGame(fresh,1,0);assert.equal(fresh.phase,'playing');assert.notEqual(fresh.phase,'skill');
});
test('AC13 基础教学：能量为0、技能被拒、回击不回能；教学后正式局50',()=>{
  const t=createGame(0,'glove',{tutorial:true});assert.equal(t.energy,0);startGame(t);stepGame(t,1,0);
  for(let i=0;i<600&&t.tutorial.step===0;i++){const dx=t.ball.x-t.player.x;if(t.ball.vz<0&&t.ball.z<sweet(t)+.1&&!t.swing)attack(t);stepGame(t,1/120,Math.abs(dx)>.05?Math.sign(dx):0);}
  assert.equal(t.tutorial.step,1);assert.equal(t.energy,0);assert.equal(useSkill(t,'spin').reason,'tutorial');
  assert.equal(createGame(0,'glove').energy,50);
});
