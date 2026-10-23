import test from 'node:test';
import assert from 'node:assert/strict';
import {RALLY,advanceBall,solveShot,predictFlight,createRally,startRally,stepRally,attackRally,attackPreview,pauseRally,resumeRally} from '../dist/rally-core.mjs';
const ball=(extra={})=>({x:0,y:3.14,z:7,vx:0,vy:0,vz:0,age:0,bounces:0,wallHits:0,hitter:'player',crossedNet:true,...extra});

test('三维球受真实重力影响，0.1秒自由下落0.03',()=>{
 const b=ball();advanceBall(b,.1);assert.ok(Math.abs(b.y-3.11)<1e-8);assert.ok(Math.abs(b.vy+.6)<1e-8);
});
test('AC1 每次弹地的竖直反弹为0.72、水平为0.9，后续最高点比例为0.72平方',()=>{
 const b=ball({x:-1.8,vx:1.8}),peaks=[],speeds=[];
 for(let i=0;i<2400&&peaks.length<2;i++)advanceBall(b,1/240,e=>{if(e.type==='bounce'){peaks.push(b.y+b.vy*b.vy/12-.14);speeds.push(b.vx);}});
 assert.equal(peaks.length,2);assert.ok(Math.abs(peaks[0]-1.5552)<.01);assert.ok(Math.abs(peaks[1]-.80621568)<.01);assert.ok(Math.abs(speeds[0]-1.62)<1e-8);assert.ok(Math.abs(speeds[1]-1.458)<1e-8);
});
test('侧墙连续反射保留速度和落地计数，快球一步也不会穿墙',()=>{
 const b=ball({x:3.7,vx:3});const ev=advanceBall(b,.1);assert.ok(Math.abs(b.x-3.64)<1e-7);assert.equal(b.vx,-3);assert.equal(b.bounces,0);assert.equal(ev.filter(e=>e.type==='wall').length,1);
 const fast=ball({x:0,vx:200});advanceBall(fast,.2);assert.ok(Math.abs(fast.x)<=3.82+1e-7);assert.equal(Math.abs(fast.vx),200);
});
test('球网检测使用真实穿越时刻的高度，不用步末高度',()=>{
 const b=ball({z:4.9,y:.7,vy:-1,vz:2,crossedNet:false});const e=advanceBall(b,.1).find(e=>e.type==='net');assert.ok(e);assert.ok(Math.abs(e.time-.05)<1e-8);assert.ok(Math.abs(e.y-.6425)<1e-8);
});
test('同一步过网并落地时按真实时间排序，回调可在失分时中止推进',()=>{
 const b=ball({z:4.9,y:.16,vy:-1,vz:10,crossedNet:false});const e=advanceBall(b,.1);assert.deepEqual(e.map(e=>e.type).slice(0,2),['net','bounce']);
 const stopped=ball({z:4.9,y:.3,vy:0,vz:2,crossedNet:false});advanceBall(stopped,.2,e=>e.type!=='net');assert.ok(Math.abs(stopped.z-5)<1e-8);assert.equal(stopped.bounces,0);
});

test('AC3 200个可复现目标均越网并准确落地，镜像目标实际借墙',()=>{
 let seed=319;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<200;i++){
  const hitter=i%2?'opponent':'player',origin={x:(random()*2-1)*2.8,y:.5+random(),z:hitter==='player'?1.2:8.8};
  const target={x:(random()*2-1)*3.3,z:hitter==='player'?5.6+random()*4:4.4-random()*4,bank:i%3===0?(i%2?1:-1):0};
  const b=solveShot(origin,target,{hitter,flightTime:1.05+random()});assert.ok(b);let landed=null,wall=0,crossed=false;
  for(let j=0;j<1800&&!landed;j++)advanceBall(b,1/240,e=>{if(e.type==='wall')wall++;if(e.type==='net'){crossed=true;assert.ok(e.y>=.62-1e-7);}if(e.type==='bounce'){landed=e;return false;}});
  assert.ok(crossed&&landed);assert.ok(Math.hypot(landed.x-target.x,landed.z-target.z)<=.05,JSON.stringify({i,landed,target}));if(target.bank)assert.ok(wall>=1);
 }
});
test('AC4 预测与真实推进相差不超过0.02，预测不改变输入球',()=>{
 const b=solveShot({x:2.8,y:1.1,z:1.4},{x:-1.7,z:8.5,bank:1},{hitter:'player',flightTime:1.45});const before=JSON.stringify(b),p=predictFlight(b);assert.ok(p?.firstBounce);assert.equal(JSON.stringify(b),before);
 let actual;for(let i=0;i<1500&&!actual;i++)advanceBall(b,1/240,e=>{if(e.type==='bounce'){actual=e;return false;}});
 assert.ok(Math.hypot(actual.x-p.firstBounce.x,actual.z-p.firstBounce.z)<.02);assert.ok(p.contact.y>=.2&&p.contact.y<=1.7);
});

function live(options){const s=createRally(options);assert.ok(s);startRally(s);stepRally(s,1,0);s.phase='playing';return s;}
function receive(s,t=0,kind='normal'){
 s.player.x=0;s.player.z=s.player.targetZ=1.5;s.flight=null;
 s.ball=ball({x:0,y:1,z:2.1+t*.6+.2,vx:0,vy:0,vz:-4,hitter:'opponent',bounces:1,crossedNet:true,age:.3,apexAt:.35,kind});
}
function hit(s){assert.equal(attackRally(s),true);for(let i=0;i<150&&s.swing&&!s.swing.hit;i++)stepRally(s,1/120,0);return s.lastShot;}
test('AC2 判定顺序与失分归属：下网、底线出界、己方首次落地、二次弹地',()=>{
 const cases=[
  [{z:4.99,y:.3,vz:4,vy:0,crossedNet:false},'net','player'],
  [{z:10.2,y:.15,vz:0,vy:-1},'out','player'],
  [{z:3,y:.15,vz:0,vy:-1,crossedNet:false},'own-half','player'],
  [{z:8,y:.15,vz:0,vy:-1,bounces:1},'double-bounce','opponent']
 ];
 for(const [fixture,reason,loser] of cases){const s=live();s.flight=null;s.ball=ball(fixture);stepRally(s,.03);assert.equal(s.records.length,1);assert.equal(s.records[0].reason,reason);assert.equal(s.records[0].loser,loser);}
 const s=live();s.flight=null;s.ball=ball({x:3.81,z:8,y:.15,vx:2,vy:-1});stepRally(s,.02);assert.equal(s.records.length,0);assert.equal(s.ball.bounces,1);assert.equal(s.ball.hitter,'player');
});
test('AC5 早挥向左、晚挥向右、精准接触为重炮，边缘软球；挥空失分单独记录',()=>{
 for(const [t,kind,dir] of [[.6,'normal',-1],[0,'power',0],[-.6,'normal',1],[.95,'soft',-1]]){const s=live();receive(s,t);const shot=hit(s);assert.equal(shot.kind,kind);assert.equal(Math.sign(s.ball.vx),dir);}
 const s=live();receive(s);s.ball.x=3;hit(s);for(let i=0;i<300&&!s.records.length;i++)stepRally(s,1/120,0);assert.equal(s.records[0].reason,'whiff');assert.equal(s.records[0].loser,'player');
});
test('AC6 apex配置仅在最高点前后0.08秒给重炮，仍由时机决定方向',()=>{
 for(const [apexAt,kind] of [[.35,'power'],[.6,'normal']]){const s=live({power:'apex'});receive(s,.5);s.ball.apexAt=apexAt;hit(s);assert.equal(s.lastShot.kind,kind);assert.ok(s.ball.vx<0);}
 const s=live({power:'apex'});s.ball=ball({z:8,y:.15,vy:-1,bounces:1});stepRally(s,.03);assert.equal(s.records[0].powerRule,'apex');
});
test('AC7 三种触发都能蓄力至少0.5秒后实际打出重炮',()=>{
 for(const type of ['soft','shallow','fourth']){
  const s=live();s.ball=solveShot({x:0,y:1,z:1.5},{x:0,z:type==='shallow'?6.8:8.2},{hitter:'player',kind:type==='soft'?'soft':'normal'});s.flight=predictFlight(s.ball);s.opponent.hits=type==='fourth'?3:0;
  let tell=null,shot=null;
  for(let i=0;i<700&&!shot&&s.phase==='playing';i++){stepRally(s,1/120,0);for(const e of s.events){if(e.type==='heavyTell')tell=e.at;if(e.type==='opponentHit')shot=e;}}
  assert.ok(shot&&tell!==null,`${type}: ${JSON.stringify(s.records)}`);assert.equal(shot.kind,'heavy');assert.ok(shot.at-tell>=.5-1e-8);
 }
});
test('AC8 重炮中心反制借力1.1倍并增加对手0.15秒反应；偏离窗口只能软回',()=>{
 for(const [t,kind] of [[0,'counter'],[.55,'soft']]){
  const s=live();receive(s,t,'heavy');s.ball.vz=-8;s.ball.vy=-1.2;s.ball.z=2.1+t*.6+.4;hit(s);assert.equal(s.lastShot.kind,kind);
  if(kind==='counter'){assert.ok(Math.abs(Math.hypot(s.ball.vx,s.ball.vy,s.ball.vz)-Math.hypot(8,1.5)*1.1)<.06);assert.ok(Math.abs(s.opponent.reaction-.4)<1e-8);assert.equal(s.point.counters,1);}
 }
});
test('AC9 对手被逼到10.3之后打重炮，首次落在玩家底线外，对手失分',()=>{
 const s=live();s.flight=null;s.opponent.x=0;s.opponent.z=s.opponent.targetZ=11.1;s.opponent.heavy=true;s.opponent.intentDecided=true;s.opponent.chargeAt=-1;s.opponent.reaction=0;
 s.ball=ball({x:0,z:10.5,y:.9,vy:0,vz:4,bounces:1,hitter:'player'});
 for(let i=0;i<900&&!s.records.length;i++)stepRally(s,1/120,0);
 assert.equal(s.records[0]?.reason,'out');assert.equal(s.records[0]?.loser,'opponent');
});
test('AC10 自动交替发球、抢5结束，逐分记录字段完整且不会重复结算',()=>{
 const s=live();for(let n=0;n<5;n++){s.phase='playing';s.flight=null;s.ball=ball({z:8,y:.15,vy:-1,bounces:1});stepRally(s,.03);if(n<4)for(let i=0;i<160;i++)stepRally(s,1/120);}
 assert.equal(s.phase,'finished');assert.deepEqual(s.score,{player:5,opponent:0});assert.equal(s.records.length,5);assert.deepEqual(s.records.map(r=>r.server),['player','opponent','player','opponent','player']);
 for(const r of s.records)for(const key of ['number','server','hits','reason','loser','opponentHeavy','facedHeavy','counters','powerRule'])assert.ok(key in r,key);
 const before=JSON.stringify(s);stepRally(s,1,1);assert.equal(JSON.stringify(s),before);
});
test('AC12 暂停冻结整个规则状态，恢复继续，方向输入不会污染记录',()=>{
 const s=live();pauseRally(s);const snap=JSON.stringify(s);stepRally(s,1,1);assert.equal(JSON.stringify(s),snap);resumeRally(s);stepRally(s,.1,-1);assert.ok(s.player.x<0);assert.equal(s.records.length,0);
});
test('第二次落地发生在挥击起手中时，未碰到球的尝试仍记录为挥空',()=>{
 const s=live();receive(s);s.ball.y=.15;s.ball.vy=-.4;s.ball.vz=-.5;attackRally(s);stepRally(s,.05);
 assert.equal(s.records[0]?.reason,'whiff');assert.equal(s.records[0]?.loser,'player');
});
for(const power of ['contact','apex'])test('真实回合可结束且能遇到重炮并尝试反制：'+power,()=>{
 const s=createRally({power});startRally(s);
 for(let i=0;i<60000&&s.phase!=='finished';i++){
  const dx=(s.flight?.contact?.x??s.ball.x)-s.player.x,axis=s.ball.hitter==='opponent'&&Math.abs(dx)>.08?Math.sign(dx):0,p=attackPreview(s,axis);
  if((p.kind==='counter'&&Math.abs(p.t)<.08)||p.kind==='power'||(p.kind==='normal'&&p.t<-.4))attackRally(s);stepRally(s,1/120,axis);
 }
 assert.equal(s.phase,'finished');assert.ok(s.records.some(r=>r.opponentHeavy>0));assert.ok(s.records.some(r=>r.counterAttempts>0));
});

