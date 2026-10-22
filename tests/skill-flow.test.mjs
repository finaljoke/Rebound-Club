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

// --- Scene: reads the core's skill clock; never drives it.
import {buildWorld} from '../dist/scene3d.mjs';
test('AC8/AC12 爆发镜头：演出中推近，结束时精确回到正常取景；中途改尺寸按新尺寸恢复；减少动态效果不推镜头',()=>{
  const w=buildWorld();w.resize(.7);const s=armed();w.update(s,0,false,0);w.shake(0);const normal=w.camera.position.clone(),nq=w.camera.quaternion.clone();
  useSkill(s,'burst');let maxPush=0;
  for(let i=1;i<=30;i++){stepGame(s,1/120,0);w.update(s,0,false,i/120);w.shake(0);maxPush=Math.max(maxPush,w.camera.position.distanceTo(normal));}
  assert.ok(maxPush>1,`特写推近 ${maxPush.toFixed(2)}`);assert.equal(w.chargeRing.visible,true);
  w.resize(1.6);w.update(s,0,false,.3);w.shake(0);
  for(let i=0;i<40&&s.phase==='skill';i++){stepGame(s,1/120,0);w.update(s,0,false,.3+i/120);w.shake(0);}
  assert.equal(s.phase,'playing');w.update(s,0,false,.8);w.shake(0);const after=w.camera.position.clone(),afterQ=w.camera.quaternion.clone();w.resize(1.6);w.shake(0);
  assert.ok(after.distanceTo(w.camera.position)<1e-9,'应回到新尺寸下的正常取景');assert.ok(1-Math.abs(afterQ.dot(w.camera.quaternion))<1e-12,'朝向也应恢复');
  const r=buildWorld();r.resize(.7);r.shake(0);const base=r.camera.position.clone();const t=armed();useSkill(t,'burst');
  for(let i=1;i<=70;i++){stepGame(t,1/120,0);r.update(t,0,true,i/120);r.shake(0);assert.ok(r.camera.position.distanceTo(base)<1e-9,'减少动态效果不推镜头');}
  assert.equal(r.chargeRing.visible,false,'演出结束蓄力环消失');assert.ok(nq);
});
test('旋转弧线预览只在可释放时显示；爆发边界只在能量足够时显示',()=>{
  const w=buildWorld(),s=armed();s.energy=40;w.update(s,0,true,0);assert.ok(w.spinArc.every(d=>!d.visible));assert.ok(w.burstEdges.every(d=>!d.visible));
  s.energy=60;w.update(s,0,true,0);assert.ok(w.spinArc.some(d=>d.visible));assert.ok(w.burstEdges.every(d=>!d.visible));
  s.energy=100;w.update(s,0,true,0);assert.ok(w.burstEdges.every(d=>d.visible));
});
test('AC15 反复释放技能与重开对局，场景资源计数不增长',()=>{
  const w=buildWorld();const count=()=>{let n=0;const g=new Set(),m=new Set();w.scene.traverse(o=>{n++;if(o.geometry)g.add(o.geometry.uuid);if(o.material)m.add(o.material.uuid);});return [n,g.size,m.size];};
  let s=armed();w.update(s,0,false,0);const before=count();let clock=0;
  for(let round=0;round<20;round++){s=armed();useSkill(s,round%2?'spin':'burst');for(let i=0;i<120;i++){stepGame(s,1/120,0);clock+=1/120;w.update(s,i%3-1,false,clock);w.shake(.02);}}
  assert.deepEqual(count(),before);
});
