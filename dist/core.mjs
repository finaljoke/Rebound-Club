// goalHalf: half width of the far goal mouth. keeper: reaction delay (s), lateral speed, aim error amplitude.
// practice: misses forgiven at the start of a level. Levels 1-3 keep ball speed and goal width fixed so
// each one teaches a single thing through the keeper alone; later levels change one variable at a time.
export const LEVELS = [
  {name:'初次交锋',tag:'接住来球，打进第一球',lesson:'等球的影子进入亮框再挥击。门将很慢，别直接打到它身上就能进。',goals:2,practice:3,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.7,speed:.35,error:.6},color:'#286659'},
  {name:'左右开弓',tag:'早打往左，晚打往右',lesson:'门将守住了正中。提早挥打向左，晚一点挥打向右，看准它站哪边。',goals:3,practice:2,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.55,speed:.6,error:.5},color:'#316988'},
  {name:'预判时刻',tag:'甜点重炮与借墙',lesson:'普通变向会被追上。在橙色甜点出手打重炮，或斜打侧墙绕过门将。',goals:3,practice:1,shade:0,speed:4,goalHalf:2.6,keeper:{delay:.45,speed:1.3,error:.45},color:'#5c5a8b'},
  {name:'封角对决',tag:'门将会提前封住你这一侧',lesson:'门将会往你接球的一侧靠。边路直线会撞上它，改打对角或借墙。',goals:4,practice:0,shade:.5,speed:4,goalHalf:2.6,keeper:{delay:.45,speed:1.3,error:.45},color:'#867045'},
  {name:'节奏大师',tag:'球更快了，稳住节奏',lesson:'只有球速变快。提前看影子移动到位，再选路线。',goals:4,practice:0,shade:.5,speed:4.7,goalHalf:2.6,keeper:{delay:.45,speed:1.3,error:.45},color:'#8b574d'},
  {name:'守门王牌',tag:'球门变窄，综合运用',lesson:'球门更窄、门将更强。变向、重炮、借墙都要用上。',goals:5,practice:0,shade:.6,speed:4.7,goalHalf:2.2,keeper:{delay:.4,speed:1.4,error:.4},color:'#285b54'}
];
// whiff: extra recovery after an empty swing, so mashing leaves gaps the ball can slip through.
export const WEAPONS = {
  glove:{name:'拳套',subtitle:'快出手 · 灵活补位',width:.9,reach:1,windup:.03,active:.12,recovery:.14,whiff:.5},
  racket:{name:'球拍',subtitle:'宽范围 · 稳稳接住',width:1.2,reach:1.1,windup:.05,active:.13,recovery:.2,whiff:.5},
  sword:{name:'剑',subtitle:'长距离 · 提前拦截',width:.95,reach:1.6,windup:.06,active:.14,recovery:.28,whiff:.55}
};
export const PLAYER_Z=1.6,MAX_AIM=.45,PERFECT_BAND=.3,RALLY_STEP=1.05,RALLY_CAP=1.6,POWER=1.35,SOFT=.8,HIT_HEIGHT=.73,ARC=.9;
export const KEEPER_Z=9.3,FAR_WALL=9.8,GOAL_Z=9.7,SIDE=3.82,KEEPER_REACH=.55;
export const ACTIVE_PHASES=['playing','serving','miss','goal','skill'];
// Active skills, all first-round playtest values in one place. Energy lives only in the match state.
export const SKILLS={max:100,start:50,gainHit:12,gainPerfect:25,
  spin:{cost:50,angle:.22,curve:.035,maxAngle:.65,curveShare:.7},
  burst:{cost:100,widthScale:1.15,frontExtra:.15,speedScale:1.65,maxSpeed:12.5,duration:.5}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sweetZ=(s,w)=>s.player.z+w.reach*.5;
// Folds a straight-line x back between the side walls, as repeated bounces would.
export function foldX(raw){const period=4*SIDE;let u=((raw+SIDE)%period+period)%period;if(u>2*SIDE)u=period-u;return u-SIDE;}
function launch(b,z1){b.z0=b.z;b.z1=z1;}
// One fixed step of ball flight, shared by the simulation and every prediction. A spinning ball turns its
// heading by curvature × distance until its stop depth; any side-wall bounce reflects it and ends the spin.
// Returns -1/1 when a side wall was hit this step, else 0.
export function advanceBall(b,dt){
  const c=b.curve;
  if(c){const v=Math.hypot(b.vx,b.vz),a=clamp(Math.atan2(b.vx,b.vz)+c.k*v*dt,-SKILLS.spin.maxAngle,SKILLS.spin.maxAngle);b.vx=Math.sin(a)*v;b.vz=Math.cos(a)*v;}
  b.x+=b.vx*dt;b.z+=b.vz*dt;
  if(c&&b.z>=c.stopZ)b.curve=null;
  let wall=0;
  if(b.x>SIDE){b.x=2*SIDE-b.x;b.vx=-Math.abs(b.vx);wall=1;}
  if(b.x< -SIDE){b.x=-2*SIDE-b.x;b.vx=Math.abs(b.vx);wall=-1;}
  if(wall)b.curve=null;
  return wall;
}
// The keeper puts every new ball into play, alternating sides.
// First-visit tutorial for level 1. Its slow serves, fixed keeper and forgiving outcomes live only on
// s.tutorial; a finished or skipped tutorial is replaced by a fresh createGame(), so nothing carries over.
function tutorialServe(s){
  const t=s.tutorial,z=KEEPER_Z-.3;s.swing=null;t.shotStep=-1;
  if(t.step===0)s.ball={x:s.player.x,z,vx:0,vz:-2.6};
  else if(t.step===1)s.ball={x:s.player.x>0?-2.3:2.3,z,vx:0,vz:-2.8};
  else{t.keeperX=(t.attempt%2?1:-1)*1.5;s.keeper.x=s.keeper.target=t.keeperX;s.ball={x:0,z,vx:0,vz:-3};}
  launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));
}
// Ends a tutorial rally without touching lives, practice or the goal count.
function tutorialReset(s,event){s.events.push(event);s.swing=null;s.power=false;s.rally=1;s.phase='miss';s.countdown=1;}
function serve(s){
  if(s.tutorial){tutorialServe(s);return;}
  const z=KEEPER_Z-.3,dir=(s.misses+s.goals)%2?-1:1;
  s.ball={x:clamp(s.keeper.x,-1.5,1.5),z,vx:.65*dir,vz:-s.level.speed};launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));s.swing=null;
}
export function createGame(level=0,weapon='glove',options={}){
  const levelIndex=clamp(Math.floor(Number(level)||0),0,LEVELS.length-1);
  return {levelIndex,level:LEVELS[levelIndex],weapon:WEAPONS[weapon]?weapon:'glove',phase:'ready',
    ball:{x:0,z:KEEPER_Z-.3,vx:.65,vz:-LEVELS[levelIndex].speed,z0:KEEPER_Z-.3,z1:PLAYER_Z},player:{x:0,z:PLAYER_Z},
    keeper:{x:0,target:0,delay:0,err:0,dive:0,diveDir:0},practiceLeft:LEVELS[levelIndex].practice||0,shot:null,
    goals:0,hits:0,misses:0,combo:0,bestCombo:0,score:0,elapsed:0,boardAngle:0,swing:null,
    rally:1,power:false,shots:0,hitstop:0,lastShot:'',
    energy:options.tutorial&&levelIndex===0?0:SKILLS.start,skill:null,skillSeq:0,queued:[],
    whiff:null,tutorial:options.tutorial&&levelIndex===0?{step:0,attempt:0,shotStep:0,keeperX:0,done:false}:null,
    countdown:.8,flash:0,lastHit:'',events:[],accumulator:0,previousPhase:null};
}
export function startGame(s){if(s.phase==='ready'){serve(s);s.phase='serving';s.countdown=.8;}}
export function attack(s){
  if(s.phase!=='playing'||s.swing)return false;
  s.swing={time:0,hit:false,armed:null,whiffed:false};s.events.push('swing');return true;
}
export function pauseGame(s){if(ACTIVE_PHASES.includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
export function resumeGame(s){if(s.phase==='paused'){s.phase=s.previousPhase||'playing';s.previousPhase=null;}}
// The exact rectangle a swing can connect in, and the band inside it that yields a power shot.
export function hitZone(s){
  const w=WEAPONS[s.weapon],sweet=sweetZ(s,w),band=PERFECT_BAND*w.reach*.5;
  return {left:s.player.x-w.width,right:s.player.x+w.width,near:s.player.z-.12,far:s.player.z+w.reach,sweetNear:sweet-band,sweetFar:sweet+band};
}
export function inHitRange(s){
  const b=s.ball,r=hitZone(s);
  return s.phase==='playing'&&b.vz<0&&b.x>=r.left&&b.x<=r.right&&b.z>=r.near&&b.z<=r.far;
}
// What pressing swing right now would produce if the player stood still: runs the real rules on a copy.
export function swingPreview(s){
  if(s.phase!=='playing'||s.swing||s.ball.vz>=0)return {kind:'none'};
  const c=structuredClone(s);c.events=[];c.hitstop=0;attack(c);
  for(let i=0;i<240&&c.swing&&!c.swing.hit&&c.phase==='playing'&&c.ball.vz<0;i++)tick(c,1/120,0);
  if(!c.swing?.hit)return {kind:'whiff'};
  return {kind:c.lastShot==='soft'?'soft':c.lastShot==='perfect'?'perfect':'clean',angle:Math.atan2(c.ball.vx,c.ball.vz),x:c.ball.x,z:c.ball.z};
}
// Where an outgoing ball will cross the goal line, folding in side-wall bounces (which the keeper ignores).
export function crossingFrom(x,z,vx,vz,s){
  const raw=x+vx/vz*(GOAL_Z-z),at=foldX(raw);
  return {x:at,viaWall:Math.abs(raw)>SIDE,inMouth:Math.abs(at)<=s.level.goalHalf,blocked:Math.abs(at-s.keeper.x)<=KEEPER_REACH};
}
export function predictCrossing(s){const b=s.ball;return b.vz>0?crossingFrom(b.x,b.z,b.vx,b.vz,s):null;}
// Visual height only: each leg of flight is a parabola that starts and ends at hitting height.
export function ballHeight(s){
  const b=s.ball,span=(b.z1??PLAYER_Z)-(b.z0??b.z);
  const u=Math.abs(span)<1e-6?1:clamp((b.z-b.z0)/span,0,1);
  return HIT_HEIGHT+ARC*4*u*(1-u);
}
function strike(s,w,sw){
  const b=s.ball,t=clamp((b.z-sweetZ(s,w))/(w.reach*.5),-1,1);
  const soft=!sw.armed,perfect=!soft&&Math.abs(t)<=PERFECT_BAND;
  // Early contact (ball still in front of the sweet spot) pulls left; late contact pushes right.
  const angle=soft?0:-t*MAX_AIM;
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);
  const v=s.level.speed*s.rally*(perfect?POWER:soft?SOFT:1);
  b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;launch(b,KEEPER_Z);
  sw.hit=true;s.shots++;s.power=perfect;
  // The keeper reacts late and misjudges by a deterministic amount that varies shot to shot.
  s.keeper.delay=s.level.keeper.delay;s.keeper.err=s.level.keeper.error*Math.sin(s.shots*2.3+s.levelIndex);
  s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=perfect?150:100;
  s.lastShot=soft?'soft':perfect?'perfect':angle<-.1?'left':angle>.1?'right':'straight';
  s.shot={x:b.x,z:b.z,angle,kind:s.lastShot,at:s.elapsed};
  s.lastHit=perfect?'漂亮回击':'成功回击';s.flash=1;
  if(perfect)s.hitstop=.07;
  s.events.push(perfect?'perfect':soft?'soft':'hit');
  b.kind=perfect?'perfect':null;b.curve=null;
  if(!s.tutorial)addEnergy(s,soft?0:perfect?SKILLS.gainPerfect:SKILLS.gainHit,s.events);
  const tu=s.tutorial;if(tu){tu.shotStep=tu.step;if(tu.step<2){tu.step++;s.events.push('tutorialStep');}}
}
// --- Active skills -------------------------------------------------------------------------------
function addEnergy(s,n,events){
  if(n<=0)return;const before=s.energy;s.energy=Math.min(SKILLS.max,before+n);events.push('energy');
  if(before<SKILLS.spin.cost&&s.energy>=SKILLS.spin.cost)events.push('energy50');
  if(before<SKILLS.max&&s.energy>=SKILLS.max)events.push('energy100');
}
const timingT=(s,w)=>clamp((s.ball.z-sweetZ(s,w))/(w.reach*.5),-1,1);
const inRect=(b,r)=>b.x>=r.left&&b.x<=r.right&&b.z>=r.near&&b.z<=r.far;
// Burst is a little more forgiving than the gear's own zone: wider and a touch further out, never further back.
export function burstZone(s){
  const w=WEAPONS[s.weapon],r=hitZone(s),half=w.width*SKILLS.burst.widthScale;
  return {...r,left:s.player.x-half,right:s.player.x+half,far:r.far+SKILLS.burst.frontExtra};
}
// Read-only: whether a skill would be accepted right now, and if not, the reason to show the player.
export function skillStatus(s,kind){
  const cfg=SKILLS[kind];
  if(!cfg||kind==='max')return {ok:false,reason:'state'};
  if(s.tutorial)return {ok:false,reason:'tutorial'};
  if(s.phase!=='playing')return {ok:false,reason:'state'};
  if(s.swing||s.skill)return {ok:false,reason:'busy'};
  if(s.energy<cfg.cost)return {ok:false,reason:'energy'};
  if(!(s.ball.vz<0&&inRect(s.ball,kind==='burst'?burstZone(s):hitZone(s))))return {ok:false,reason:'window'};
  return {ok:true};
}
// Shared bookkeeping for a skill contact: counted once, scored as a plain contact, never as a perfect.
function registerContact(s,b,angle,kind,id,events){
  s.shots++;s.power=false;s.flash=1;
  s.keeper.delay=s.level.keeper.delay;s.keeper.err=s.level.keeper.error*Math.sin(s.shots*2.3+s.levelIndex);
  s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=100;
  s.lastShot=kind;s.shot={x:b.x,z:b.z,angle,kind,at:s.elapsed,id};events.push(kind);
}
// The first accepted action takes the lock: it spends energy exactly once. Spin strikes immediately;
// burst freezes the rally and strikes when its own clock reaches the duration (see tick).
export function useSkill(s,kind){
  const status=skillStatus(s,kind);if(!status.ok)return status;
  s.energy-=SKILLS[kind].cost;
  const w=WEAPONS[s.weapon],t=timingT(s,w),id=++s.skillSeq,b=s.ball;
  if(kind==='spin'){
    const cfg=SKILLS.spin,dir=t<0?1:-1,angle=-t*cfg.angle;
    s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);const v=s.level.speed*s.rally;
    b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;launch(b,KEEPER_Z);
    b.kind='spin';b.curve={k:dir*cfg.curve,stopZ:b.z+(KEEPER_Z-b.z)*cfg.curveShare};
    registerContact(s,b,angle,'spin',id,s.queued);
    s.swing={time:w.windup,hit:true,armed:true,whiffed:false,skill:'spin'};
  }else{
    s.skill={kind:'burst',id,time:0,x:b.x,z:b.z,angle:-t*MAX_AIM};s.phase='skill';s.swing=null;s.queued.push('burstStart');
  }
  return {ok:true,id};
}
function launchBurst(s){
  const k=s.skill,b=s.ball,w=WEAPONS[s.weapon],cfg=SKILLS.burst;
  s.rally=Math.min(RALLY_CAP,s.rally*RALLY_STEP);const v=Math.min(cfg.maxSpeed,s.level.speed*s.rally*cfg.speedScale);
  b.x=k.x;b.z=k.z;b.vx=Math.sin(k.angle)*v;b.vz=Math.cos(k.angle)*v;launch(b,KEEPER_Z);b.kind='burst';b.curve=null;
  registerContact(s,b,k.angle,'burst',k.id,s.events);
  s.skill=null;s.phase='playing';s.swing={time:w.windup+w.active,hit:true,armed:true,whiffed:false,skill:'burst'};
}
// Pure prediction of the current outgoing flight, using advanceBall on a copy. Point buffers are reused.
const FLIGHT_X=new Float32Array(48),FLIGHT_Z=new Float32Array(48),SPIN_X=new Float32Array(16),SPIN_Z=new Float32Array(16);
export function predictFlight(s){
  const r=s.ball;if(!(r.vz>0))return null;
  const b={x:r.x,z:r.z,vx:r.vx,vz:r.vz,curve:r.curve?{...r.curve}:null},out={keeper:null,goal:null,wall:null,xs:FLIGHT_X,zs:FLIGHT_Z,count:0};
  const every=Math.max(1,Math.ceil((GOAL_Z-b.z)/b.vz*120/(FLIGHT_X.length-2)));
  FLIGHT_X[0]=b.x;FLIGHT_Z[0]=b.z;out.count=1;
  for(let i=0;i<2400&&b.vz>0;i++){
    const px=b.x,pz=b.z,wall=advanceBall(b,1/120),at=line=>wall?b.x:px+(b.x-px)*(line-pz)/(b.z-pz);
    if(wall&&!out.wall)out.wall={x:wall*SIDE,z:b.z};
    if(out.keeper===null&&pz<KEEPER_Z&&b.z>=KEEPER_Z)out.keeper=at(KEEPER_Z);
    if(pz<GOAL_Z&&b.z>=GOAL_Z){out.goal=at(GOAL_Z);FLIGHT_X[out.count]=out.goal;FLIGHT_Z[out.count]=GOAL_Z;out.count++;break;}
    if(i%every===every-1&&out.count<FLIGHT_X.length-1){FLIGHT_X[out.count]=b.x;FLIGHT_Z[out.count]=b.z;out.count++;}
  }
  return out;
}
// Short arc a spin taken right now would follow (same step function), for the pre-swing hint.
export function spinPreview(s,length=2.6){
  const r=s.ball;if(!(r.vz<0))return null;
  const w=WEAPONS[s.weapon],cfg=SKILLS.spin,t=timingT(s,w),dir=t<0?1:-1,angle=-t*cfg.angle,v=s.level.speed*Math.min(RALLY_CAP,s.rally*RALLY_STEP);
  const b={x:r.x,z:r.z,vx:Math.sin(angle)*v,vz:Math.cos(angle)*v,curve:{k:dir*cfg.curve,stopZ:r.z+(KEEPER_Z-r.z)*cfg.curveShare}};
  SPIN_X[0]=b.x;SPIN_Z[0]=b.z;let count=1;const end=r.z+length,step=length/(SPIN_X.length-1);
  for(let i=0;i<1200&&count<SPIN_X.length&&b.z<end;i++){advanceBall(b,1/120);if(b.z>=SPIN_Z[count-1]+step){SPIN_X[count]=b.x;SPIN_Z[count]=b.z;count++;}}
  return {dir:dir<0?'left':'right',angle,xs:SPIN_X,zs:SPIN_Z,count};
}
function moveKeeper(s,dt){
  const k=s.keeper,K=s.level.keeper,b=s.ball,g=s.level.goalHalf;
  k.dive=Math.max(0,k.dive-dt);
  if(s.tutorial?.step===2&&s.tutorial.shotStep!==1){k.x=k.target=s.tutorial.keeperX;return;}
  let target=0,speed=K.speed*.35;
  if(s.phase==='playing'&&b.vz>0&&b.z>=KEEPER_Z){
    // Beaten: a last lunge straight at the ball, no misread left to apply.
    target=clamp(b.x,-g,g);speed=K.speed;
  }else if(s.phase==='playing'&&b.vz>0){
    if(k.delay>0){k.delay-=dt;return;}
    // Straight-line read only: shots banked off a side wall fool the keeper.
    // The misread fades over the last 0.6s, so slow balls get corrected and fast ones don't.
    const remaining=(KEEPER_Z-b.z)/b.vz;
    target=clamp(b.x+b.vx*remaining+k.err*Math.min(1,remaining/.6),-g,g);speed=K.speed;
  }else if(s.phase==='playing'&&b.vz<0&&s.level.shade){
    // Narrowing the angle: while the defender receives, the keeper shades toward that side,
    // so a straight shot from the flank runs into it and crossing or banked shots pay off.
    target=clamp(foldX(b.x+b.vx*(sweetZ(s,WEAPONS[s.weapon])-b.z)/b.vz)*s.level.shade,-g,g);speed=K.speed*.5;
  }
  k.target=target;k.x+=clamp(target-k.x,-speed*dt,speed*dt);
}
// Only names a cause the recorded window positions support; anything mixed stays 'unclear'.
function whiffReason(s,w,sw){
  const r=hitZone(s),f=sw.first,l=sw.last,lateral=o=>Math.abs(o.dx)<=w.width;
  if(!f||(!f.inc&&!l.inc))return {reason:'none'};
  if(sw.side)return {reason:'reach',side:sw.side};
  if(l.inc&&l.z>r.far&&lateral(l))return {reason:'early'};
  if(f.inc&&f.z<r.near&&lateral(f))return {reason:'late'};
  return {reason:'unclear'};
}
// The keeper gets one chance as the ball crosses its line; the goal itself is the drawn mouth further back.
function farEnd(s,prevZ,prevX,wall){
  const b=s.ball,k=s.keeper,g=s.level.goalHalf;
  // Fast balls cover ~0.1 per step, so lines are judged where the path actually crossed them.
  const at=line=>wall?b.x:prevX+(b.x-prevX)*(line-prevZ)/(b.z-prevZ);
  const keeperX=prevZ<KEEPER_Z&&b.z>=KEEPER_Z?at(KEEPER_Z):null,goalX=prevZ<GOAL_Z&&b.z>=GOAL_Z?at(GOAL_Z):null;
  if(s.tutorial&&keeperX!==null&&Math.abs(keeperX-k.x)<=KEEPER_REACH){k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.tutorial.attempt++;tutorialReset(s,'save');return;}
  if(s.tutorial&&goalX!==null&&Math.abs(goalX)<=g){
    if(s.tutorial.shotStep===2){s.tutorial.done=true;s.swing=null;s.phase='tutorial-done';s.events.push('goal','tutorialDone');}
    else tutorialReset(s,'goal');
    return;
  }
  if(s.tutorial&&b.z>FAR_WALL){s.tutorial.attempt+=s.tutorial.shotStep===2?1:0;tutorialReset(s,'wide');return;}
  if(keeperX!==null&&Math.abs(keeperX-k.x)<=KEEPER_REACH){
    // Saves come back at varied angles, so the defender still has to move. Returns are never skill shots.
    b.x=keeperX;const angle=clamp((b.x-k.x)/KEEPER_REACH*.3+.35*Math.sin(s.shots*1.9+s.levelIndex),-.6,.6),v=s.level.speed*s.rally;
    b.curve=null;b.kind=null;b.z=KEEPER_Z;b.vx=Math.sin(angle)*v;b.vz=-Math.cos(angle)*v;launch(b,sweetZ(s,WEAPONS[s.weapon]));
    k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.power=false;s.events.push('save');
    return;
  }
  if(goalX!==null&&Math.abs(goalX)<=g){
    s.goals++;s.score+=1000+(s.power?500:0);s.hitstop=.12;s.rally=1;s.power=false;s.swing=null;s.events.push('goal');
    if(s.goals>=s.level.goals){s.phase='won';s.events.push('win');}
    else{s.phase='goal';s.countdown=1.2;}
    return;
  }
  if(b.z>FAR_WALL){
    b.z=2*FAR_WALL-b.z;
    const angle=clamp(Math.atan2(b.vx,b.vz)+s.boardAngle,-.76,.76),speed=s.level.speed*s.rally;
    b.vx=Math.sin(angle)*speed;b.vz=-Math.cos(angle)*speed;launch(b,sweetZ(s,WEAPONS[s.weapon]));b.curve=null;b.kind=null;s.power=false;s.events.push('wide');
  }
}
function tick(s,dt,axis){
  s.flash=Math.max(0,s.flash-dt*2);
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return;}
  // Burst cinematic: its own clock runs while the ball, both players and match time stay frozen.
  if(s.phase==='skill'){s.skill.time+=dt;if(s.skill.time>=SKILLS.burst.duration-1e-9)launchBurst(s);return;}
  s.elapsed+=dt;
  // Small deterministic deflection off the far wall outside the goal mouth.
  s.boardAngle=Math.sin(s.elapsed*.65+s.levelIndex*.8)*.15;
  moveKeeper(s,dt);
  if(s.phase!=='playing'){
    s.countdown-=dt;
    if(s.countdown<=0){if(s.phase!=='serving')serve(s);s.phase='playing';s.events.push('serve');}
    return;
  }
  s.player.x=clamp(s.player.x+axis*6.2*dt,-3.45,3.45);
  const w=WEAPONS[s.weapon],sw=s.swing;
  if(sw){
    sw.time+=dt;
    if(!sw.hit&&!sw.whiffed&&sw.time>w.windup+w.active){sw.whiffed=true;s.whiff=whiffReason(s,w,sw);s.events.push('whiff');}
    if(sw.time>w.windup+w.active+w.recovery+(sw.whiffed?w.whiff:0))s.swing=null;
  }
  const b=s.ball,prevZ=b.z,prevX=b.x;
  const wall=advanceBall(b,dt);if(wall)s.events.push('wall');
  if(sw&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // What the ball was doing while the window was open, so a whiff can be explained honestly.
    const r=hitZone(s),dx=b.x-s.player.x,inc=b.vz<0;sw.first??={z:b.z,dx,inc};sw.last={z:b.z,dx,inc};
    if(inc&&b.z>=r.near&&b.z<=r.far&&Math.abs(dx)>w.width)sw.side=Math.sign(dx);
  }
  if(b.vz>0){farEnd(s,prevZ,prevX,wall);return;}
  if(s.swing&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // Whether the ball was already in range when the window opened decides clean hit vs. soft contact.
    if(sw.armed===null)sw.armed=inHitRange(s);
    if(inHitRange(s)){strike(s,w,sw);return;}
  }
  if(b.z<=0&&s.tutorial){tutorialReset(s,'tutorialRetry');return;}
  if(b.z<=0){
    s.combo=0;s.rally=1;s.power=false;s.flash=-1;s.swing=null;
    // Practice balls keep the real feel but don't cost a life.
    if(s.practiceLeft>0){s.practiceLeft--;s.events.push('practice');}
    else{s.misses++;s.events.push('miss');}
    if(s.misses>=3){s.phase='lost';s.events.push('lose');}
    else{s.phase='miss';s.countdown=1.1;}
  }
}
export function stepGame(s,dt,axis=0){
  if(!ACTIVE_PHASES.includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
  // Events raised by commands between frames (skill acceptance) are delivered with this step's events.
  s.events=s.queued?.length?s.queued.splice(0):[];
  axis=Number.isFinite(axis)?clamp(axis,-1,1):0;
  s.accumulator+=Math.min(dt,1);
  while(s.accumulator>=1/120&&ACTIVE_PHASES.includes(s.phase)){
    tick(s,1/120,axis);s.accumulator-=1/120;
  }
}
