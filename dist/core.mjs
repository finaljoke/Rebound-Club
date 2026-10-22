export const LEVELS = [
  {name:'初次交锋',tag:'找到击球的节奏',target:8,speed:4.3,tilt:.14,color:'#286659'},
  {name:'左右开弓',tag:'脚步跟上球的方向',target:8,speed:4.5,tilt:.22,color:'#316988'},
  {name:'预判时刻',tag:'留意回弹板的角度',target:10,speed:4.7,tilt:.26,color:'#5c5a8b'},
  {name:'节奏大师',tag:'跟上每一次回弹',target:10,speed:4.9,tilt:.23,color:'#867045'},
  {name:'全场奔袭',tag:'左右补位，保持专注',target:12,speed:5.1,tilt:.30,color:'#8b574d'},
  {name:'守门王牌',tag:'把每次回击都打漂亮',target:15,speed:5.3,tilt:.32,color:'#285b54'}
];
// whiff: extra recovery after an empty swing, so mashing leaves gaps the ball can slip through.
export const WEAPONS = {
  glove:{name:'拳套',subtitle:'快出手 · 灵活补位',width:.9,reach:1,windup:.03,active:.12,recovery:.14,whiff:.5},
  racket:{name:'球拍',subtitle:'宽范围 · 稳稳接住',width:1.2,reach:1.1,windup:.05,active:.13,recovery:.2,whiff:.5},
  sword:{name:'剑',subtitle:'长距离 · 提前拦截',width:.95,reach:1.6,windup:.06,active:.14,recovery:.28,whiff:.55}
};
export const PLAYER_Z=1.6,MAX_AIM=.45,PERFECT_BAND=.3,RALLY_STEP=1.05,RALLY_CAP=1.6,POWER=1.35,SOFT=.8,HIT_HEIGHT=.73,ARC=.9;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sweetZ=(s,w)=>s.player.z+w.reach*.5;
function launch(b,z1){b.z0=b.z;b.z1=z1;}
function serve(s){s.ball={x:Math.sin(s.misses*1.4)*1.5,z:8.5,vx:.65*(s.misses%2?-1:1),vz:-s.level.speed};launch(s.ball,sweetZ(s,WEAPONS[s.weapon]));s.swing=null;}
export function createGame(level=0,weapon='glove'){
  const levelIndex=clamp(Math.floor(Number(level)||0),0,LEVELS.length-1);
  return {levelIndex,level:LEVELS[levelIndex],weapon:WEAPONS[weapon]?weapon:'glove',phase:'ready',
    ball:{x:0,z:8.5,vx:.65,vz:-LEVELS[levelIndex].speed,z0:8.5,z1:PLAYER_Z},player:{x:0,z:PLAYER_Z},
    hits:0,misses:0,combo:0,bestCombo:0,score:0,elapsed:0,boardAngle:0,swing:null,
    rally:1,power:false,shots:0,hitstop:0,lastShot:'',
    countdown:.8,flash:0,lastHit:'',events:[],accumulator:0,previousPhase:null};
}
export function startGame(s){if(s.phase==='ready'){serve(s);s.phase='serving';s.countdown=.8;}}
export function attack(s){
  if(s.phase!=='playing'||s.swing)return false;
  s.swing={time:0,hit:false,armed:null,whiffed:false};s.events.push('swing');return true;
}
export function pauseGame(s){if(['playing','serving','miss'].includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
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
  b.vx=Math.sin(angle)*v;b.vz=Math.cos(angle)*v;launch(b,9.8);
  sw.hit=true;s.shots++;s.power=perfect;
  s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=perfect?150:100;
  s.lastShot=soft?'soft':perfect?'perfect':angle<-.1?'left':angle>.1?'right':'straight';
  s.lastHit=perfect?'漂亮回击':'成功回击';s.flash=1;
  if(perfect)s.hitstop=.07;
  s.events.push(perfect?'perfect':soft?'soft':'hit');
}
function tick(s,dt,axis){
  s.flash=Math.max(0,s.flash-dt*2);
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return;}
  s.elapsed+=dt;
  s.boardAngle=Math.sin(s.elapsed*.65+s.levelIndex*.8)*s.level.tilt;
  if(s.phase==='serving'||s.phase==='miss'){
    s.countdown-=dt;
    if(s.countdown<=0){if(s.phase==='miss')serve(s);s.phase='playing';s.events.push('serve');}
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
  if(b.x>3.82){b.x=7.64-b.x;b.vx=-Math.abs(b.vx);s.events.push('wall');}
  if(b.x< -3.82){b.x=-7.64-b.x;b.vx=Math.abs(b.vx);s.events.push('wall');}
  if(b.z>9.8&&b.vz>0){
    b.z=19.6-b.z;
    const angle=clamp(Math.atan2(b.vx,b.vz)+s.boardAngle*2,-.76,.76);
    const speed=s.level.speed*s.rally;
    b.vx=Math.sin(angle)*speed;b.vz=-Math.cos(angle)*speed;b.z0=9.8;b.z1=sweetZ(s,w);s.power=false;s.events.push('wall');
  }
  if(s.swing&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active){
    // Whether the ball was already in range when the window opened decides clean hit vs. soft contact.
    if(sw.armed===null)sw.armed=inHitRange(s);
    if(inHitRange(s)){
      strike(s,w,sw);
      if(s.hits>=s.level.target){s.phase='won';s.events.push('win');}
      return;
    }
  }
  if(b.z<=0){
    s.misses++;s.combo=0;s.rally=1;s.power=false;s.flash=-1;s.swing=null;s.events.push('miss');
    if(s.misses>=3){s.phase='lost';s.events.push('lose');}
    else{s.phase='miss';s.countdown=1.1;}
  }
}
export function stepGame(s,dt,axis=0){
  if(!['playing','serving','miss'].includes(s.phase)||!Number.isFinite(dt)||dt<=0)return;
  s.events=[];
  axis=Number.isFinite(axis)?clamp(axis,-1,1):0;
  s.accumulator+=Math.min(dt,1);
  while(s.accumulator>=1/120&&['playing','serving','miss'].includes(s.phase)){
    tick(s,1/120,axis);s.accumulator-=1/120;
  }
}
