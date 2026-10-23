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
test('AC8 重炮中心反制借力1.1倍并增加对手独立反制延迟；偏离窗口只能软回',()=>{
 for(const [t,kind] of [[0,'counter'],[.55,'soft']]){
  const s=live();receive(s,t,'heavy');s.ball.vz=-8;s.ball.vy=-1.2;s.ball.z=2.1+t*.6+.4;hit(s);assert.equal(s.lastShot.kind,kind);
  if(kind==='counter'){assert.ok(Math.abs(Math.hypot(s.ball.vx,s.ball.vy,s.ball.vz)-Math.hypot(8,1.5)*1.1)<.06);assert.ok(Math.abs(s.opponent.reaction-(RALLY.aiDelay+RALLY.counterDelay))<1e-8);assert.equal(s.point.counters,1);}
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
 const s=createRally({power});startRally(s);let incoming=null,receives=0,counterTried=false;
 for(let i=0;i<60000&&s.phase!=='finished';i++){
  if(s.phase==='playing'&&s.ball.hitter==='opponent'&&incoming!==s.ball){incoming=s.ball;receives++;}
  const dx=(s.flight?.contact?.x??s.ball.x)-s.player.x,axis=s.ball.hitter==='opponent'&&Math.abs(dx)>.08?Math.sign(dx):0,p=attackPreview(s,axis);
  // A flow bot can miss a return. Perfect-bot balance is measured separately,
  // without this relaxation, in rally-balance.mjs and its unfinished-match log.
  const miss=counterTried&&receives%4===0,forceSoft=!counterTried&&receives===1&&p.kind==='soft'&&p.t>.85;
  if(!miss&&(forceSoft||(p.kind==='counter'&&Math.abs(p.t)<.08)||p.kind==='power'||(p.kind==='normal'&&p.t<-.4))){if(attackRally(s)&&s.ball.kind==='heavy')counterTried=true;}
  stepRally(s,1/120,axis);
 }
 assert.equal(s.phase,'finished');assert.ok(s.records.some(r=>r.opponentHeavy>0));assert.ok(s.records.some(r=>r.counterAttempts>0));
});

test('平衡实验按逐分事实统计分组胜率、失分和横向追球距离',async()=>{
 const simulator=await import('../scripts/rally-balance.mjs').catch(()=>({}));
 assert.equal(typeof simulator.summarizePoints,'function','平衡脚本须提供可复核的逐分统计');
 const summary=simulator.summarizePoints([
  {winner:'player',loser:'opponent',reason:'double-bounce',hits:8,opponentHeavy:0,heavySkipped:1,heavyResponses:[],opponentChaseDistance:4},
  {winner:'player',loser:'opponent',reason:'double-bounce',hits:12,opponentHeavy:2,heavySkipped:0,heavyResponses:['normal','counter'],opponentChaseDistance:5},
  {winner:'opponent',loser:'player',reason:'whiff',hits:5,opponentHeavy:1,heavySkipped:0,heavyResponses:['whiff'],opponentChaseDistance:null},
  {winner:'opponent',loser:'player',reason:'out',hits:3,opponentHeavy:0,heavySkipped:0,heavyResponses:[],opponentChaseDistance:null}
 ]);
 assert.equal(summary.pointWinRate,.5);assert.equal(summary.hits.median,6.5);assert.equal(summary.hits.mean,7);
 assert.equal(summary.withoutHeavy.points,2);assert.equal(summary.withHeavy.pointWinRate,.5);
 assert.equal(summary.heavyResponses.counter.points,1);assert.equal(summary.heavyResponses.counter.pointWinRate,1);
 assert.equal(summary.heavyResponses.normal.points,1);assert.equal(summary.heavyResponses.whiff.pointWinRate,0);
 assert.equal(summary.lossReasons.player.whiff,1);assert.equal(summary.lossReasons.opponent['double-bounce'],2);
 assert.equal(summary.opponentChaseDistance.mean,4.5);assert.equal(summary.heavySkipped.total,1);
});

test('平衡机器人按预计击球时的空当选方向，不能误把正在回中的位置当作破绽',async()=>{
 const {desiredTiming}=await import('../scripts/rally-balance.mjs');assert.equal(typeof desiredTiming,'function');
 const s=live();s.opponent.x=-1.4;s.opponent.stagger=0;
 s.ball=solveShot({x:-1.4,y:1,z:9.2},{x:-2.7,z:1.65},{hitter:'opponent'});s.flight=predictFlight(s.ball);
 assert.equal(desiredTiming(s,'N',0,123,0),.5);
});

test('平衡机器人保留窗口外的时机噪声，不能把过早挥拍自动改成有效回球',async()=>{
 const simulator=await import('../scripts/rally-balance.mjs');assert.equal(typeof simulator.previewTiming,'function');
 const s=live();receive(s,1.5);assert.equal(attackPreview(s).kind,'whiff');
 assert.ok(Math.abs(simulator.previewTiming(s)-1.5)<1e-8);
});

test('平衡 AC2 边路出手后停顿完整0.3秒，再按独立回位速度移动',()=>{
 for(const x of [-2.4,2.4]){
  const s=live();s.flight=null;s.opponent.x=x;s.opponent.z=s.opponent.targetZ=8.9;
  s.opponent.intentDecided=true;s.opponent.reaction=0;
  s.ball=ball({x,z:8.3,y:1,vy:0,vz:3,bounces:1,kind:'normal'});
  stepRally(s,RALLY.dt);assert.equal(s.lastShot?.hitter,'opponent');
  const origin=s.opponent.x;stepRally(s,.3);assert.ok(Math.abs(s.opponent.x-origin)<1e-8,'边路击球后不能立即回位');
  stepRally(s,RALLY.dt);assert.ok(Math.abs(Math.abs(s.opponent.x-origin)-RALLY.aiRecoverSpeed*RALLY.dt)<1e-8);
 }
});

test('平衡 AC3 对手以独立追球速度追到两侧普通球',()=>{
 for(const x of [-2.8,2.8]){
  const s=live();s.ball=solveShot({x:0,y:1,z:1.5},{x,z:8.2},{hitter:'player',kind:'normal'});s.flight=predictFlight(s.ball);
  s.opponent.reaction=RALLY.aiDelay;s.opponent.x=0;let measured=false,hit=false;
  for(let i=0;i<600&&s.phase==='playing'&&!hit;i++){
   const before=s.opponent.x;stepRally(s,RALLY.dt);
   if(!measured&&Math.abs(s.opponent.x-before)>1e-8){measured=true;assert.ok(Math.abs(Math.abs(s.opponent.x-before)-RALLY.aiChaseSpeed*RALLY.dt)<1e-8);}
   hit=s.events.some(e=>e.type==='opponentHit');
  }
  assert.ok(measured&&hit,'应通过真实移动追到普通球');
 }
});

test('平衡 AC4 时间不足或追不到时跳过重炮，足够时仍蓄力至少0.5秒',()=>{
 for(const scenario of ['short','unreachable','enough']){
  const s=live(),short=scenario==='short';
  s.ball=solveShot({x:0,y:1,z:short?4.9:1.5},{x:scenario==='unreachable'?3.2:0,z:short?6.8:8.2},{hitter:'player',kind:'soft',flightTime:short?.3:scenario==='unreachable'?1:1.65});
  s.flight=predictFlight(s.ball);
  if(short)s.opponent.z=s.opponent.targetZ=s.flight.contact.z+.6;
  if(scenario==='unreachable')s.opponent.x=-3.45;
  s.opponent.reaction=0;let skip=null,tell=null,shot=null;
  for(let i=0;i<700&&s.phase==='playing'&&!shot;i++){
   stepRally(s,RALLY.dt);
   for(const e of s.events){if(e.type==='heavySkipped')skip=e;if(e.type==='heavyTell')tell=e;if(e.type==='opponentHit')shot=e;}
  }
  if(scenario==='enough'){assert.ok(tell&&shot);assert.equal(shot.kind,'heavy');assert.ok(shot.at-tell.at>=.5-1e-8);assert.equal(skip,null);}
  else{assert.ok(skip,scenario+' 必须记录 heavySkipped');assert.equal(tell,null);assert.equal(s.opponent.heavy,false);if(short){assert.ok(shot);assert.equal(shot.kind,'normal');}}
 }
});

test('平衡普通落点可以穿插中路，重炮仍打远离玩家的角落',()=>{
 const previous=RALLY.aiNormalCenterEvery;RALLY.aiNormalCenterEvery=2;
 try{for(const heavy of [false,true]){
  const s=live();s.flight=null;Object.assign(s.opponent,{x:0,z:8.9,targetZ:8.9,hits:1,reaction:0,heavy,intentDecided:true,chargeAt:heavy?-1:null});
  s.ball=ball({x:0,z:8.3,y:1,vz:3,bounces:1});stepRally(s,RALLY.dt);
  assert.equal(s.lastShot?.hitter,'opponent');
  if(heavy)assert.ok(Math.abs(s.ball.target.x)>2.5);else assert.ok(Math.abs(s.ball.target.x)<1e-9);
 }}finally{if(previous===undefined)delete RALLY.aiNormalCenterEvery;else RALLY.aiNormalCenterEvery=previous;}
});

test('平衡 AC7 提示档位默认挑战，教学档与每分记录保持一致',()=>{
 for(const [hint,hintMode] of [[undefined,'challenge'],['practice','practice'],['challenge','challenge'],['invalid','challenge']]){
  const s=live({hint});assert.equal(s.hintMode,hintMode);s.flight=null;s.ball=ball({z:8,y:.15,vy:-1,bounces:1});stepRally(s,.03);
  assert.equal(s.records[0].hintMode,hintMode);
 }
});

test('平衡被反制后可回出中路浅球，落点仍由真实球路到达',()=>{
 const previous={center:RALLY.aiCounterReplyCenter,depth:RALLY.aiCounterReplyDepth};
 RALLY.aiCounterReplyCenter=1;RALLY.aiCounterReplyDepth=3.4;
 try{
  const s=live();s.flight=null;Object.assign(s.opponent,{x:2.4,z:9,targetZ:9,reaction:0,intentDecided:true});
  s.ball=ball({x:2.4,z:8.4,y:1,vz:3,bounces:1,kind:'counter'});stepRally(s,RALLY.dt);
  assert.equal(s.lastShot?.hitter,'opponent');assert.ok(Math.abs(s.ball.target.x)<1e-9);assert.ok(Math.abs(s.flight.firstBounce.z-3.4)<1e-8);
 }finally{if(previous.center===undefined)delete RALLY.aiCounterReplyCenter;else RALLY.aiCounterReplyCenter=previous.center;RALLY.aiCounterReplyDepth=previous.depth;}
});

test('平衡统计不把对手重炮自身出界或下网算成玩家挥空',async()=>{
 const simulator=await import('../scripts/rally-balance.mjs');assert.equal(typeof simulator.pointFacts,'function');
 for(const reason of ['out','net','own-half']){
  const result=simulator.pointFacts({winner:'player',loser:'opponent',reason},{pendingHeavy:true,heavyResponses:[],skipped:0,chaseDistance:null});
  assert.deepEqual(result.heavyResponses,['opponent-fault']);
 }
 const missed=simulator.pointFacts({winner:'opponent',loser:'player',reason:'double-bounce'},{pendingHeavy:true,heavyResponses:[],skipped:0,chaseDistance:null});
 assert.deepEqual(missed.heavyResponses,['whiff']);
});

test('平衡空当选择逐个预演早晚真实挥拍，比较各自出手时的实际落点',async()=>{
 const simulator=await import('../scripts/rally-balance.mjs');assert.equal(typeof simulator.timingOption,'function');
 for(const x of [-2.6,-1.4,1.4,2.6]){
  const s=live();s.opponent.x=x;s.opponent.stagger=.3;
  s.ball=solveShot({x,y:1,z:9.2},{x:-Math.sign(x)*2.7,z:1.65},{hitter:'opponent'});s.flight=predictFlight(s.ball);
  const before=JSON.stringify(s),early=simulator.timingOption(s,.5),late=simulator.timingOption(s,-.5),chosen=simulator.desiredTiming(s,'N',0,123,0);
  assert.equal(JSON.stringify(s),before);assert.ok(early||late);
  assert.equal(chosen,early&&(!late||early.gap>=late.gap)?.5:-.5);
  if(early&&late)assert.notEqual(early.at,late.at,'两种出手时机不能共用同一个最高点时刻');
 }
});

