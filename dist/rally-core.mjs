// Pure, deterministic wall-tennis rules. Rendering never decides collisions.
export const RALLY={
 side:3.82,netZ:5,netHeight:.62,gravity:6,radius:.14,bounceY:.72,bounceXZ:.9,dt:1/120,
 targetScore:5,serveDelay:.8,pointDelay:1.2,playerSpeed:6.2,depthSpeed:3.8,aiChaseSpeed:2.8,aiRecoverSpeed:.3,aiWideX:1.8,aiStagger:.3,aiDelay:.25,
 width:1.08,aiWidth:.40,reach:1.2,near:.12,minHeight:.2,maxHeight:1.7,windup:.05,active:.13,recovery:.2,whiff:.5,
 perfect:.3,counterWindow:.18,apexWindow:.08,counterScale:1.1,counterMax:12.5,counterDelay:.4,tell:.5,tellMargin:.1,
 normalTime:1.65,powerTime:1.32,softTime:1.85,heavyTime:1.0,heavyMinSpeed:8,
 normalDepth:8.1,powerDepth:7.7,softDepth:6.8,counterDepth:9.2,aimInner:3.2,aimEdge:3.4,
 heavyRamp:.2,heavyRampCap:1.5,heavyWiden:.2,
 aiNormalCenterEvery:0,aiNormalDepth:1.65,aiCounterReplyDepth:1.65,aiCounterReplyCenter:0,
 aiNormalWideEvery:0,aiNormalWideX:3.4,
 playerMinZ:-2.1,playerMaxZ:3.3,aiMinZ:6.7,aiMaxZ:11.65
};
const EPS=1e-9,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),other=p=>p==='player'?'opponent':'player';
export function foldX(x){const period=4*RALLY.side;let q=((x+RALLY.side)%period+period)%period;return q>2*RALLY.side?period-q-RALLY.side:q-RALLY.side;}
export function advanceBall(b,dt,onEvent){
 const events=[];if(!Number.isFinite(dt)||dt<=0)return events;
 b.age??=0;b.bounces??=0;b.wallHits??=0;let left=dt,spent=0;
 for(let guard=0;guard<64&&left>EPS;guard++){
  const wall=Math.abs(b.vx)>EPS?Math.max(0,((b.vx>0?RALLY.side:-RALLY.side)-b.x)/b.vx):Infinity;
  const nt=Math.abs(b.vz)>EPS?(RALLY.netZ-b.z)/b.vz:Infinity,net=nt>EPS?nt:Infinity;
  const h=Math.max(0,b.y-RALLY.radius),disc=b.vy*b.vy+2*RALLY.gravity*h;
  const ground=Math.max(0,(b.vy+Math.sqrt(disc))/RALLY.gravity);
  const time=Math.min(left,wall,net,ground);
  b.x+=b.vx*time;b.y+=b.vy*time-.5*RALLY.gravity*time*time;b.z+=b.vz*time;b.vy-=RALLY.gravity*time;b.age+=time;spent+=time;left-=time;
  let collision=false;
  function notify(type){const e={type,time:spent,x:b.x,y:b.y,z:b.z,age:b.age,bounces:b.bounces};events.push(e);return onEvent?.(e)!==false;}
  if(Math.abs(net-time)<=EPS){collision=true;b.z=RALLY.netZ;b.crossedNet=true;if(!notify('net'))break;}
  if(Math.abs(wall-time)<=EPS){collision=true;b.x=clamp(b.x,-RALLY.side,RALLY.side);b.vx=-b.vx;b.wallHits++;if(!notify('wall'))break;}
  if(Math.abs(ground-time)<=EPS){
   collision=true;b.y=RALLY.radius;b.vy=-b.vy*RALLY.bounceY;b.vx*=RALLY.bounceXZ;b.vz*=RALLY.bounceXZ;b.bounces++;
   b.lastBounceAt=b.age;b.apexAt=b.age+b.vy/RALLY.gravity;
   if(b.bounces===1)b.firstBounce={x:b.x,y:b.y,z:b.z,age:b.age};
   if(!notify('bounce'))break;
   if(b.vy<.001){b.vy=0;break;}
  }
  if(!collision)break;
 }
 return events;
}
export function solveShot(origin,target,options={}){
 const rawX=target.bank?2*RALLY.side*Math.sign(target.bank)-target.x:target.x;
 const dx=rawX-origin.x,dz=target.z-origin.z,dy=RALLY.radius-origin.y;
 if(![origin.x,origin.y,origin.z,rawX,target.z].every(Number.isFinite))throw new TypeError('Non-finite shot');
 const clear=t=>{const u=(RALLY.netZ-origin.z)/dz;if(!(u>0&&u<1))return true;const q=u*t,vy=dy/t+.5*RALLY.gravity*t;return origin.y+vy*q-.5*RALLY.gravity*q*q>=RALLY.netHeight+.045;};
 let time=Math.max(.15,options.flightTime??RALLY.normalTime);
 if(options.speed){
  const v=options.speed,a=.25*RALLY.gravity**2,c=dx*dx+dz*dz+dy*dy,b=RALLY.gravity*dy-v*v,disc=b*b-4*a*c;
  if(disc<0)throw new RangeError('Requested speed cannot reach this target');
  const roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)].filter(t=>t>0).map(Math.sqrt);
  time=roots.find(clear);if(!time)throw new RangeError('Requested speed cannot clear the net');
 }else{for(let i=0;i<100&&!clear(time);i++)time*=1.06;}
 return {x:origin.x,y:origin.y,z:origin.z,vx:dx/time,vy:dy/time+.5*RALLY.gravity*time,vz:dz/time,
  age:0,bounces:0,wallHits:0,crossedNet:false,hitter:options.hitter??'player',kind:options.kind??'normal',
  target:{x:foldX(rawX),z:target.z},flightTime:time};
}
export function predictFlight(ball,{seconds=8,dt=1/120}={}){
 if(!ball)return {points:[],firstBounce:null,contact:null};
 const b=structuredClone(ball),points=[{x:b.x,y:b.y,z:b.z}],initial=b.bounces??0;let firstBounce=null,contact=null,apex=null,net=null,wallHits=0;
 for(let i=0;i<seconds/dt&&b.bounces<2;i++){
  advanceBall(b,dt,e=>{
   if(e.type==='wall')wallHits++;
   if(e.type==='net')net={...e};
   if(e.type==='bounce'&&b.bounces===1&&initial===0){
    firstBounce={...e};const c=structuredClone(b),after=b.vy/RALLY.gravity*.5;advanceBall(c,after);contact={x:c.x,y:c.y,z:c.z,age:c.age};advanceBall(c,after);apex={x:c.x,y:c.y,z:c.z,age:c.age};
   }
  });
  if(i%4===0||b.bounces>=2)points.push({x:b.x,y:b.y,z:b.z});
 }
 return {points,firstBounce,contact,apex,net,wallHits};
}
function emit(s,type,details={}){s.events.push({type,at:s.elapsed,...details});}
function actor(z){return {x:0,z,targetZ:z,swing:0};}
export function createRally({power='contact',hint='challenge',heavyEnabled=true}={}){
 return {phase:'ready',previousPhase:null,powerRule:power==='apex'?'apex':'contact',hintMode:hint==='practice'?'practice':'challenge',heavyEnabled:heavyEnabled!==false,score:{player:0,opponent:0},
  player:actor(1.1),opponent:{...actor(8.9),reaction:0,stagger:0,heavy:false,chargeAt:null,intentDecided:false,hits:0},
  ball:{x:0,y:.95,z:1.7,vx:0,vy:0,vz:0,age:0,bounces:0,hitter:'player',crossedNet:false,kind:'serve'},
  flight:null,swing:null,whiffed:false,elapsed:0,accumulator:0,countdown:0,events:[],queued:[],records:[],point:null,lastShot:null,winner:null};
}
function newPoint(s){
 const server=s.records.length%2?'opponent':'player';s.phase='serving';s.countdown=RALLY.serveDelay;
 s.player.x=0;s.player.z=s.player.targetZ=1.1;Object.assign(s.opponent,{x:0,z:8.9,targetZ:8.9,reaction:0,stagger:0,heavy:false,chargeAt:null,intentDecided:false,hits:0,swing:0});
 s.swing=null;s.whiffed=false;s.lastShot=null;s.flight=null;
 s.point={server,hits:0,opponentHeavy:0,facedHeavy:0,counters:0,counterAttempts:0,heavyChain:0,heavyPeak:0};
 s.ball={x:0,y:.95,z:server==='player'?1.7:8.3,vx:0,vy:0,vz:0,age:0,bounces:0,hitter:server,crossedNet:false,kind:'serve'};
}
export function startRally(s){if(s.phase!=='ready')return false;newPoint(s);return true;}
export function pauseRally(s){if(['playing','serving','point'].includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';return true;}return false;}
export function resumeRally(s){if(s.phase!=='paused')return false;s.phase=s.previousPhase??'playing';s.previousPhase=null;return true;}
export function attackRally(s){
 if(s.phase!=='playing'||s.swing)return false;
 s.swing={time:0,hit:false,whiffed:false};s.queued.push({type:'swing',at:s.elapsed});
 if(s.ball.hitter==='opponent'&&s.ball.kind==='heavy')s.point.counterAttempts++;
 return true;
}
export function hitZone(s,side='player'){
 const p=side==='player'?s.player:s.opponent,dir=side==='player'?1:-1,width=side==='player'?RALLY.width:RALLY.aiWidth;
 return {left:p.x-width,right:p.x+width,near:p.z-dir*RALLY.near,far:p.z+dir*RALLY.reach,sweet:p.z+dir*RALLY.reach*.5,minHeight:RALLY.minHeight,maxHeight:RALLY.maxHeight};
}
export function inHitRange(s,side='player',b=s.ball,p=null){
 if(s.phase!=='playing'||b.hitter===side||b.bounces!==1||b.y<RALLY.minHeight||b.y>RALLY.maxHeight)return false;
 const zone=p?{left:p.x-RALLY.width,right:p.x+RALLY.width,near:p.z-RALLY.near,far:p.z+RALLY.reach}:hitZone(s,side);
 return b.x>=zone.left&&b.x<=zone.right&&b.z>=Math.min(zone.near,zone.far)&&b.z<=Math.max(zone.near,zone.far);
}
function shotKind(s,b,t){
 if(b.kind==='heavy')return Math.abs(t)<=RALLY.counterWindow?'counter':'soft';
 if(Math.abs(t)>.85)return 'soft';
 return (s.powerRule==='apex'?Math.abs(b.age-b.apexAt)<=RALLY.apexWindow:Math.abs(t)<=RALLY.perfect)?'power':'normal';
}
function timing(b,p){const t=(b.z-p.z-RALLY.reach*.5)/(RALLY.reach*.5);return Math.abs(t)<1e-9?0:clamp(t,-1,1);}
export function attackPreview(s,axis=0){
 if(s.phase!=='playing'||s.swing||s.ball.hitter==='player')return {kind:'none',t:0};
 const b=structuredClone(s.ball);advanceBall(b,RALLY.windup);
 const p={x:clamp(s.player.x+axis*RALLY.playerSpeed*RALLY.windup,-3.45,3.45),z:s.player.z+clamp(s.player.targetZ-s.player.z,-RALLY.depthSpeed*RALLY.windup,RALLY.depthSpeed*RALLY.windup)};
 if(!inHitRange(s,'player',b,p))return {kind:'whiff',t:0};
 const t=timing(b,p);
 return {kind:shotKind(s,b,t),t,x:b.x,y:b.y,z:b.z};
}
function launched(s,b,kind,hitter){
 s.ball=b;s.ball.kind=kind;s.ball.hitter=hitter;s.flight=predictFlight(b);s.whiffed=false;
 s.point.hits++;s.lastShot={kind,hitter,at:s.elapsed,x:b.x,y:b.y,z:b.z};
 if(hitter==='player'){
  if(kind==='counter')s.point.heavyChain=0;
  s.opponent.intentDecided=false;s.opponent.heavy=false;s.opponent.chargeAt=null;
  s.opponent.reaction=RALLY.aiDelay+(kind==='counter'?RALLY.counterDelay:0);
 }else{
  s.opponent.heavy=false;s.opponent.chargeAt=null;s.opponent.intentDecided=false;s.opponent.swing=.28;
  s.opponent.stagger=Math.abs(b.x)>RALLY.aiWideX?RALLY.aiStagger:0;
  if(kind==='heavy'){s.point.opponentHeavy++;s.point.facedHeavy++;s.point.heavyChain++;s.point.heavyPeak=Math.max(s.point.heavyPeak,s.point.heavyChain);}
 }
 emit(s,hitter==='player'?'playerHit':'opponentHit',{kind,...(kind==='heavy'?{level:b.heavyLevel,multiplier:b.heavyMultiplier,baseSpeed:b.heavyBaseSpeed}:{})});if(kind==='counter')emit(s,'counter');
}
function finishPoint(s,reason,loser){
 if(s.phase!=='playing')return;
 const winner=other(loser);s.score[winner]++;
 const record={number:s.records.length+1,server:s.point.server,hits:s.point.hits,reason,loser,winner,
  opponentHeavy:s.point.opponentHeavy,facedHeavy:s.point.facedHeavy,counters:s.point.counters,counterAttempts:s.point.counterAttempts,heavyPeak:s.point.heavyPeak,powerRule:s.powerRule,hintMode:s.hintMode};
 s.records.push(record);s.swing=null;s.opponent.chargeAt=null;s.opponent.heavy=false;s.countdown=RALLY.pointDelay;
 s.point.heavyChain=0;
 if(s.score[winner]>=RALLY.targetScore){s.phase='finished';s.winner=winner;emit(s,'finished',{winner});}else s.phase='point';
 emit(s,'point',{reason,loser,winner});
}
function decideOpponent(s){
 const a=s.opponent;if(a.intentDecided||s.ball.hitter!=='player')return;
 a.intentDecided=true;if(!s.heavyEnabled)return;
 const wantsHeavy=s.ball.kind==='soft'||(s.flight?.firstBounce?.z??s.ball.target?.z??9)<7.2||(a.hits+1)%4===0;
 if(!wantsHeavy)return;
 const contact=s.flight?.contact,remaining=contact?contact.age-s.ball.age:0,chaseTime=Math.max(0,remaining-a.reaction);
 const distance=contact?Math.abs(contact.x-a.x):Infinity;
 const depth=contact?Math.abs(clamp(contact.z+RALLY.reach*.5,RALLY.aiMinZ,RALLY.aiMaxZ)-a.z):Infinity;
 const enoughTime=remaining+EPS>=RALLY.tell+RALLY.tellMargin;
 const reachable=distance<=RALLY.aiChaseSpeed*chaseTime+RALLY.aiWidth+EPS&&depth<=RALLY.depthSpeed*chaseTime+EPS;
 if(!enoughTime||!reachable){emit(s,'heavySkipped',{reason:enoughTime?'unreachable':'time',remaining,chaseDistance:distance});return;}
 a.heavy=true;a.chargeAt=s.elapsed;emit(s,'heavyTell');
}
function flightEvent(s,e){
 const b=s.ball;
 if(e.type==='net'){
  if(e.y<RALLY.netHeight){finishPoint(s,'net',b.hitter);return false;}
  if(b.hitter==='player')decideOpponent(s);
 }
 if(e.type==='bounce'){
  if(b.bounces===1){
   const own=!b.crossedNet||(b.hitter==='player'?e.z<RALLY.netZ:e.z>RALLY.netZ);
   if(own){finishPoint(s,'own-half',b.hitter);return false;}
   if(b.hitter==='player'?e.z>10:e.z<0){finishPoint(s,'out',b.hitter);return false;}
  }else if(b.bounces>=2){
   const missed=other(b.hitter)==='player'&&(s.whiffed||(s.swing&&!s.swing.hit));
   finishPoint(s,missed?'whiff':'double-bounce',other(b.hitter));return false;
  }
  emit(s,'bounce',{x:e.x,z:e.z});
 }
 if(e.type==='wall')emit(s,'wall',{x:e.x,z:e.z});
 return true;
}
export function playerAim(t){
 if(Math.abs(t)<EPS)return {x:0,bank:0};
 const u=clamp(Math.abs(t),0,1),side=-Math.sign(t),bank=u+EPS>=.7;
 const x=side*(bank?RALLY.aimInner+(RALLY.aimEdge-RALLY.aimInner)*clamp((u-.7)/.3,0,1):RALLY.aimInner*Math.sin(u/.7*Math.PI*.5));
 return {x,bank:bank?side:0};
}
function playerStrike(s){
 const b=s.ball,t=timing(b,s.player),kind=shotKind(s,b,t);
 const target={...playerAim(t),z:kind==='soft'?RALLY.softDepth:kind==='counter'?RALLY.counterDepth:kind==='power'?RALLY.powerDepth:RALLY.normalDepth};
 const incoming=Math.hypot(b.vx,b.vy,b.vz),options={hitter:'player',kind,flightTime:kind==='soft'?RALLY.softTime:kind==='power'?RALLY.powerTime:RALLY.normalTime};
 if(kind==='counter')options.speed=Math.min(RALLY.counterMax,incoming*RALLY.counterScale);
 const next=solveShot(b,target,options);s.swing.hit=true;if(kind==='counter')s.point.counters++;
 launched(s,next,kind,'player');
}
function opponentStrike(s){
 const a=s.opponent,b=s.ball,kind=a.heavy?'heavy':'normal',out=a.heavy&&b.z>10.3;
 const center=kind==='normal'&&((b.kind==='counter'&&RALLY.aiCounterReplyCenter>0)||(RALLY.aiNormalCenterEvery>0&&(a.hits+1)%RALLY.aiNormalCenterEvery===0));
 const wide=kind==='normal'&&RALLY.aiNormalWideEvery>0&&(a.hits+1)%RALLY.aiNormalWideEvery===0,corner=wide?RALLY.aiNormalWideX:2.8;
 const target={x:center?0:clamp((s.player.x>=0?-corner:corner)+.12*Math.sin((a.hits+1)*2.3),-3.4,3.4),z:out?-.7:kind==='heavy'?1.65:b.kind==='counter'?RALLY.aiCounterReplyDepth:RALLY.aiNormalDepth};
 const distance=Math.hypot(target.x-b.x,target.z-b.z);
 const time=kind==='heavy'?Math.min(RALLY.heavyTime,distance/RALLY.heavyMinSpeed):RALLY.normalTime;
 let next=solveShot(b,target,{hitter:'opponent',kind,flightTime:time});
 if(kind==='heavy'){
  const level=s.point.heavyChain+1,multiplier=Math.min(RALLY.heavyRampCap,1+RALLY.heavyRamp*(level-1));
  const baseSpeed=Math.hypot(next.vx,next.vy,next.vz),wide={...target,x:clamp(target.x+Math.sign(target.x)*RALLY.heavyWiden*(level-1),-3.4,3.4)};
  if(level>1)next=solveShot(b,wide,{hitter:'opponent',kind,speed:baseSpeed*multiplier});
  Object.assign(next,{heavyLevel:level,heavyMultiplier:multiplier,heavyBaseSpeed:baseSpeed});
 }
 a.hits++;launched(s,next,kind,'opponent');
}
function moveActors(s,dt,axis){
 const p=s.player,a=s.opponent;
 p.x=clamp(p.x+axis*RALLY.playerSpeed*dt,-3.45,3.45);
 if(s.ball.hitter==='opponent'&&s.flight?.contact){const c=s.ball.kind==='heavy'?s.flight.contact:s.flight.apex??s.flight.contact;p.targetZ=clamp(c.z-RALLY.reach*.5,RALLY.playerMinZ,RALLY.playerMaxZ);}
 p.z+=clamp(p.targetZ-p.z,-RALLY.depthSpeed*dt,RALLY.depthSpeed*dt);
 a.swing=Math.max(0,a.swing-dt);
 if(s.ball.hitter==='player'){
  a.reaction=Math.max(0,a.reaction-dt);
  if(a.reaction<=EPS){
   const c=s.flight?.contact;if(c)a.targetZ=clamp(c.z+RALLY.reach*.5,RALLY.aiMinZ,RALLY.aiMaxZ);
   const x=c?.x??a.x;a.x+=clamp(x-a.x,-RALLY.aiChaseSpeed*dt,RALLY.aiChaseSpeed*dt);
   a.z+=clamp(a.targetZ-a.z,-RALLY.depthSpeed*dt,RALLY.depthSpeed*dt);
  }
 }else{
  const frozen=Math.min(dt,a.stagger);a.stagger=Math.max(0,a.stagger-frozen);const moving=dt-frozen;
  a.x+=clamp(-a.x,-RALLY.aiRecoverSpeed*moving,RALLY.aiRecoverSpeed*moving);
  // Preserve the prototype's depth recovery; only lateral speeds are balanced here.
  a.z+=clamp(8.9-a.z,-RALLY.depthSpeed*.45*moving,RALLY.depthSpeed*.45*moving);
 }
}
function tick(s,dt,axis){
 s.elapsed+=dt;
 if(s.phase==='serving'){
  s.countdown-=dt;if(s.countdown<=EPS){
   s.phase='playing';const server=s.point.server,origin=s.ball,target={x:(s.records.length%2?1:-1)*1.2,z:server==='player'?8.1:1.9};
   launched(s,solveShot(origin,target,{hitter:server,kind:'serve',flightTime:1.65}),'serve',server);emit(s,'serve',{server});
  }return;
 }
 if(s.phase==='point'){s.countdown-=dt;if(s.countdown<=EPS)newPoint(s);return;}
 moveActors(s,dt,axis);
 const sw=s.swing;if(sw)sw.time+=dt;
 advanceBall(s.ball,dt,e=>flightEvent(s,e));if(s.phase!=='playing')return;
 if(sw&&!sw.hit&&sw.time+EPS>=RALLY.windup&&sw.time<=RALLY.windup+RALLY.active+EPS&&inHitRange(s))playerStrike(s);
 if(sw&&!sw.hit&&!sw.whiffed&&sw.time>RALLY.windup+RALLY.active){sw.whiffed=true;s.whiffed=true;emit(s,'whiff');}
 if(sw&&sw.time>RALLY.windup+RALLY.active+(sw.whiffed?RALLY.whiff:RALLY.recovery))s.swing=null;
 const a=s.opponent;
 if(s.ball.hitter==='player'&&s.ball.crossedNet&&!a.intentDecided)decideOpponent(s);
 if(s.ball.hitter==='player'&&inHitRange(s,'opponent')&&s.ball.z>=a.z-RALLY.reach*.5&&(!a.heavy||s.elapsed-a.chargeAt>=RALLY.tell-EPS))opponentStrike(s);
}
export function stepRally(s,dt,axis=0){
 if(!['playing','serving','point'].includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
 s.events=s.queued.splice(0);s.accumulator+=Math.min(dt,1);axis=Number.isFinite(axis)?clamp(axis,-1,1):0;
 while(s.accumulator+EPS>=RALLY.dt&&['playing','serving','point'].includes(s.phase)){tick(s,RALLY.dt,axis);s.accumulator=Math.max(0,s.accumulator-RALLY.dt);}
}
