// goalHalf: half width of the far goal mouth. keeper: reaction delay (s), lateral speed, aim error amplitude.
export const LEVELS = [
  {name:'初次交锋',tag:'找到击球的节奏',goals:3,speed:4.3,goalHalf:2.4,keeper:{delay:.55,speed:.6,error:.6},color:'#286659'},
  {name:'左右开弓',tag:'早打往左，晚打往右',goals:3,speed:4.6,goalHalf:2.3,keeper:{delay:.5,speed:.7,error:.55},color:'#316988'},
  {name:'预判时刻',tag:'站到边路再起重炮',goals:4,speed:4.9,goalHalf:2.2,keeper:{delay:.46,speed:.8,error:.5},color:'#5c5a8b'},
  {name:'节奏大师',tag:'越打越快，稳住节奏',goals:4,speed:5.2,goalHalf:2.1,keeper:{delay:.42,speed:.9,error:.45},color:'#867045'},
  {name:'全场奔袭',tag:'借侧墙绕过门将',goals:5,speed:5.5,goalHalf:2,keeper:{delay:.38,speed:1,error:.4},color:'#8b574d'},
  {name:'守门王牌',tag:'每一脚都要有想法',goals:5,speed:5.8,goalHalf:1.9,keeper:{delay:.34,speed:1.1,error:.35},color:'#285b54'}
];
// whiff: extra recovery after an empty swing, so mashing leaves gaps the ball can slip through.
export const WEAPONS = {
  glove:{name:'拳套',subtitle:'快出手 · 灵活补位',width:.9,reach:1,windup:.03,active:.12,recovery:.14,whiff:.5},
  racket:{name:'球拍',subtitle:'宽范围 · 稳稳接住',width:1.2,reach:1.1,windup:.05,active:.13,recovery:.2,whiff:.5},
  sword:{name:'剑',subtitle:'长距离 · 提前拦截',width:.95,reach:1.6,windup:.06,active:.14,recovery:.28,whiff:.55}
};
export const PLAYER_Z=1.6,MAX_AIM=.45,PERFECT_BAND=.3,RALLY_STEP=1.05,RALLY_CAP=1.6,POWER=1.35,SOFT=.8,HIT_HEIGHT=.73,ARC=.9;
export const KEEPER_Z=9.3,FAR_WALL=9.8,SIDE=3.82,KEEPER_REACH=.55;
export const ACTIVE_PHASES=['playing','serving','miss','goal'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sweetZ=(s,w)=>s.player.z+w.reach*.5;
function launch(b,z1){b.z0=b.z;b.z1=z1;}
// The keeper puts every new ball into play, alternating sides.
function serve(s){
  const z=KEEPER_Z-.3,dir=(s.misses+s.goals)%2?-1:1;
  s.ball={x:clamp(s.keeper.x,-1.5,1.5),z,vx:.65*dir,vz:-s.level.speed};launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));s.swing=null;
}
export function createGame(level=0,weapon='glove'){
  const levelIndex=clamp(Math.floor(Number(level)||0),0,LEVELS.length-1);
  return {levelIndex,level:LEVELS[levelIndex],weapon:WEAPONS[weapon]?weapon:'glove',phase:'ready',
    ball:{x:0,z:KEEPER_Z-.3,vx:.65,vz:-LEVELS[levelIndex].speed,z0:KEEPER_Z-.3,z1:PLAYER_Z},player:{x:0,z:PLAYER_Z},
    keeper:{x:0,target:0,delay:0,err:0,dive:0,diveDir:0},
    goals:0,hits:0,misses:0,combo:0,bestCombo:0,score:0,elapsed:0,boardAngle:0,swing:null,
    rally:1,power:false,shots:0,hitstop:0,lastShot:'',
    countdown:.8,flash:0,lastHit:'',events:[],accumulator:0,previousPhase:null};
}
export function startGame(s){if(s.phase==='ready'){serve(s);s.phase='serving';s.countdown=.8;}}
export function attack(s){
  if(s.phase!=='playing'||s.swing)return false;
  s.swing={time:0,hit:false,armed:null,whiffed:false};s.events.push('swing');return true;
}
export function pauseGame(s){if(ACTIVE_PHASES.includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
export function resumeGame(s){if(s.phase==='paused'){s.phase=s.previousPhase||'playing';s.previousPhase=null;}}
export function inHitRange(s){
  const w=WEAPONS[s.weapon],b=s.ball;
  return s.phase==='playing'&&b.vz<0&&b.z>=s.player.z-.12&&
    b.z<=s.player.z+w.reach&&Math.abs(b.x-s.player.x)<=w.width;
}
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
  s.lastHit=perfect?'漂亮回击':'成功回击';s.flash=1;
  if(perfect)s.hitstop=.07;
  s.events.push(perfect?'perfect':soft?'soft':'hit');
}
function moveKeeper(s,dt){
  const k=s.keeper,K=s.level.keeper,b=s.ball,g=s.level.goalHalf;
  k.dive=Math.max(0,k.dive-dt);
  let target=0,speed=K.speed*.35;
  if(s.phase==='playing'&&b.vz>0){
    if(k.delay>0){k.delay-=dt;return;}
    // Straight-line read only: shots banked off a side wall fool the keeper.
    // The misread fades over the last 0.6s, so slow balls get corrected and fast ones don't.
    const remaining=(KEEPER_Z-b.z)/b.vz;
    target=clamp(b.x+b.vx*remaining+k.err*Math.min(1,remaining/.6),-g,g);speed=K.speed;
  }
  k.target=target;k.x+=clamp(target-k.x,-speed*dt,speed*dt);
}
function farEnd(s){
  const b=s.ball,k=s.keeper,g=s.level.goalHalf;
  if(b.z>=KEEPER_Z&&Math.abs(b.x)<=g){
    if(Math.abs(b.x-k.x)<=KEEPER_REACH){
      // Saves come back at varied angles, so the defender still has to move.
      const angle=clamp((b.x-k.x)/KEEPER_REACH*.3+.35*Math.sin(s.shots*1.9+s.levelIndex),-.6,.6),v=s.level.speed*s.rally;
      b.z=KEEPER_Z;b.vx=Math.sin(angle)*v;b.vz=-Math.cos(angle)*v;launch(b,sweetZ(s,WEAPONS[s.weapon]));
      k.dive=.35;k.diveDir=Math.sign(b.x-k.x)||1;s.power=false;s.events.push('save');
      return;
    }
    s.goals++;s.score+=1000+(s.power?500:0);s.hitstop=.12;s.rally=1;s.power=false;s.swing=null;s.events.push('goal');
    if(s.goals>=s.level.goals){s.phase='won';s.events.push('win');}
    else{s.phase='goal';s.countdown=1.2;}
    return;
  }
  if(b.z>FAR_WALL){
    b.z=2*FAR_WALL-b.z;
    const angle=clamp(Math.atan2(b.vx,b.vz)+s.boardAngle,-.76,.76),speed=s.level.speed*s.rally;
    b.vx=Math.sin(angle)*speed;b.vz=-Math.cos(angle)*speed;launch(b,sweetZ(s,WEAPONS[s.weapon]));s.power=false;s.events.push('wall');
  }
}
function tick(s,dt,axis){
  s.flash=Math.max(0,s.flash-dt*2);
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return;}
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
    if(!sw.hit&&!sw.whiffed&&sw.time>w.windup+w.active){sw.whiffed=true;s.events.push('whiff');}
    if(sw.time>w.windup+w.active+w.recovery+(sw.whiffed?w.whiff:0))s.swing=null;
  }
  const b=s.ball;
  b.x+=b.vx*dt;b.z+=b.vz*dt;
  if(b.x>SIDE){b.x=2*SIDE-b.x;b.vx=-Math.abs(b.vx);s.events.push('wall');}
  if(b.x< -SIDE){b.x=-2*SIDE-b.x;b.vx=Math.abs(b.vx);s.events.push('wall');}
  if(b.vz>0){farEnd(s);return;}
  if(s.swing&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // Whether the ball was already in range when the window opened decides clean hit vs. soft contact.
    if(sw.armed===null)sw.armed=inHitRange(s);
    if(inHitRange(s)){strike(s,w,sw);return;}
  }
  if(b.z<=0){
    s.misses++;s.combo=0;s.rally=1;s.power=false;s.flash=-1;s.swing=null;s.events.push('miss');
    if(s.misses>=3){s.phase='lost';s.events.push('lose');}
    else{s.phase='miss';s.countdown=1.1;}
  }
}
export function stepGame(s,dt,axis=0){
  if(!ACTIVE_PHASES.includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
  s.events=[];
  axis=Number.isFinite(axis)?clamp(axis,-1,1):0;
  s.accumulator+=Math.min(dt,1);
  while(s.accumulator>=1/120&&ACTIVE_PHASES.includes(s.phase)){
    tick(s,1/120,axis);s.accumulator-=1/120;
  }
}
