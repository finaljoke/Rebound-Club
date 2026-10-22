import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,pauseGame,resumeGame,useSkill,SKILLS,WEAPONS,PLAYER_Z,RALLY_STEP} from '../dist/core.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
function armed(weapon='glove',level=0){const s=play(level,weapon);s.energy=100;s.player.x=.3;s.ball={x:.3,z:sweet(s)+.1,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.hitstop=0;return s;}
const frozen=s=>JSON.stringify({b:s.ball,p:s.player,k:s.keeper,e:s.elapsed});
const D=SKILLS.burst.duration,TICKS=Math.round(D*120);

test('AC7 爆发：整段演出冻结球/双方/计时，结束时从锁定点只发球一次，速度按独立倍率',()=>{
  for(const weapon of Object.keys(WEAPONS)){
    const s=armed(weapon);const contact={x:s.ball.x,z:s.ball.z};assert.equal(useSkill(s,'burst').ok,true);assert.equal(s.phase,'skill');
    const lock=frozen(s),ev=[];
    for(let i=0;i<TICKS-1;i++){stepGame(s,1/120,1);ev.push(...s.events);assert.equal(frozen(s),lock,`${weapon} 演出中有东西在动`);}
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
  resumeGame(s);assert.equal(s.phase,'skill');stepGame(s,D-.25-.05,0);assert.equal(s.phase,'skill');stepGame(s,.06,0);assert.equal(s.phase,'playing');
  const at={};for(const dt of [1/30,1/60,1/120]){const g=armed();useSkill(g,'burst');let n=0;while(g.phase==='skill'&&n<200){stepGame(g,dt,0);n++;}at[dt]=g.elapsed;}
  const vals=Object.values(at);assert.ok(Math.max(...vals)-Math.min(...vals)<=1/30+1e-9);
});
test('AC7 演出结束后不补放期间的缓存攻击，发球后有正常收招',()=>{
  const s=armed();useSkill(s,'burst');for(let i=0;i<30;i++){assert.equal(attack(s),false);assert.equal(useSkill(s,'spin').ok,false);stepGame(s,1/120,0);}
  for(let i=30;i<TICKS+10;i++)stepGame(s,1/120,0);assert.equal(s.phase,'playing');assert.equal(s.hits,1);assert.ok(s.swing&&s.swing.hit);
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
  for(let i=0;i<TICKS+20&&s.phase==='skill';i++){stepGame(s,1/120,0);w.update(s,0,false,.3+i/120);w.shake(0);}
  assert.equal(s.phase,'playing');w.update(s,0,false,.8);w.shake(0);const after=w.camera.position.clone(),afterQ=w.camera.quaternion.clone();w.resize(1.6);w.shake(0);
  assert.ok(after.distanceTo(w.camera.position)<1e-9,'应回到新尺寸下的正常取景');assert.ok(1-Math.abs(afterQ.dot(w.camera.quaternion))<1e-12,'朝向也应恢复');
  const r=buildWorld();r.resize(.7);r.shake(0);const base=r.camera.position.clone();const t=armed();useSkill(t,'burst');
  for(let i=1;i<=TICKS+10;i++){stepGame(t,1/120,0);r.update(t,0,true,i/120);r.shake(0);assert.ok(r.camera.position.distanceTo(base)<1e-9,'减少动态效果不推镜头');}
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
test('爆发时间线：冻结后才推镜头，停留段在最近，出手后拉回；光环、冲击波、球光晕各在其时段出现，结束后全部收起',()=>{
  const w=buildWorld();w.resize(.7);const s=armed();useSkill(s,'burst');const B=SKILLS.burst,at={};
  for(let i=1;i<TICKS;i++){stepGame(s,1/120,0);w.update(s,0,false,i/120);const k=s.skill.time;
    for(const [name,time] of [['freeze',B.freeze*.5],['hold',(B.push+B.strike)/2],['strike',(B.strike+B.release)/2],['return',(B.release+D)/2]])if(at[name]===undefined&&k>=time)at[name]={k,w:w.cine.w,aura:w.burstFx.aura.visible,shock:w.burstFx.shock.visible,halo:w.burstFx.halo.visible};}
  assert.ok(B.freeze>=.1&&B.push>B.freeze&&B.strike>B.push&&B.release>B.strike&&D>B.release&&D>=1,'时间线顺序');
  assert.equal(at.freeze.w,0,'冻结段不推镜头');assert.equal(at.hold.w,1,'停留段在最近');assert.ok(at.return.w>0&&at.return.w<1,'出手后拉回');
  assert.equal(at.hold.aura,true);assert.equal(at.strike.shock,true);assert.equal(at.hold.shock,false);assert.equal(at.strike.halo,true);
  for(let i=0;i<20&&s.phase==='skill';i++){stepGame(s,1/120,0);w.update(s,0,false,1+i/120);}
  assert.equal(s.phase,'playing');w.update(s,0,false,2);for(const k of ['aura','shock','halo','sparks'])assert.equal(w.burstFx[k].visible,false,`${k} 应收起`);
});
test('爆发特写取景：最近时人物头顶、双脚和被锁定的球都在画面内（竖屏与横屏）',()=>{
  for(const aspect of [.62,.8,1.6,2.2]){const w=buildWorld();w.resize(aspect);const s=armed();s.player.x=aspect>1?-2.5:2.4;s.ball.x=s.player.x;useSkill(s,'burst');
    const hold=Math.round((SKILLS.burst.push+SKILLS.burst.release)/2*120);for(let i=1;i<=hold;i++){stepGame(s,1/120,0);w.update(s,0,false,i/120);}w.shake(0);assert.equal(w.cine.w,1);
    for(const [x,z,y,what] of [[s.player.x,PLAYER_Z,2.25,'头顶'],[s.player.x,PLAYER_Z,0,'脚'],[s.skill.x,s.skill.z,.73,'球']]){const p=w.project(x,z,y);
      assert.ok(p.x>.04&&p.x<.96&&p.y>.04&&p.y<.96,`aspect ${aspect} ${what} 出框 ${JSON.stringify(p)}`);}}
});
