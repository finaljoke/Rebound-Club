export const LEVELS = [
  {name:'初次交锋',tag:'找到击球的节奏',target:8,speed:4.3,tilt:.14,color:'#286659'},
  {name:'左右开弓',tag:'脚步跟上球的方向',target:8,speed:4.5,tilt:.22,color:'#316988'},
  {name:'预判时刻',tag:'留意回弹板的角度',target:10,speed:4.7,tilt:.26,color:'#5c5a8b'},
  {name:'节奏大师',tag:'跟上每一次回弹',target:10,speed:4.9,tilt:.23,color:'#867045'},
  {name:'全场奔袭',tag:'左右补位，保持专注',target:12,speed:5.1,tilt:.30,color:'#8b574d'},
  {name:'守门王牌',tag:'把每次回击都打漂亮',target:15,speed:5.3,tilt:.32,color:'#285b54'}
];
export const WEAPONS = {
  glove:{name:'拳套',subtitle:'快出手 · 灵活补位',width:.9,reach:1.15,windup:.035,active:.23,recovery:.16},
  racket:{name:'球拍',subtitle:'宽范围 · 稳稳接住',width:1.25,reach:1.25,windup:.05,active:.25,recovery:.23},
  sword:{name:'剑',subtitle:'长距离 · 提前拦截',width:1,reach:1.8,windup:.06,active:.27,recovery:.30}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function serve(s){s.ball={x:Math.sin(s.misses*1.4)*1.5,z:8.5,vx:.65*(s.misses%2?-1:1),vz:-s.level.speed};s.swing=null;}
export function createGame(level=0,weapon='glove'){
  const levelIndex=clamp(Math.floor(Number(level)||0),0,LEVELS.length-1);
  return {levelIndex,level:LEVELS[levelIndex],weapon:WEAPONS[weapon]?weapon:'glove',phase:'ready',
    ball:{x:0,z:8.5,vx:.65,vz:-LEVELS[levelIndex].speed},player:{x:0,z:1.6},
    hits:0,misses:0,combo:0,bestCombo:0,score:0,elapsed:0,boardAngle:0,swing:null,
    countdown:.8,flash:0,lastHit:'',events:[],accumulator:0,previousPhase:null};
}
export function startGame(s){if(s.phase==='ready'){serve(s);s.phase='serving';s.countdown=.8;}}
export function attack(s){
  if(s.phase!=='playing'||s.swing)return false;
  s.swing={time:0,hit:false};s.events.push('swing');return true;
}
export function pauseGame(s){if(['playing','serving','miss'].includes(s.phase)){s.previousPhase=s.phase;s.phase='paused';}}
export function resumeGame(s){if(s.phase==='paused'){s.phase=s.previousPhase||'playing';s.previousPhase=null;}}
export function inHitRange(s){
  const w=WEAPONS[s.weapon],b=s.ball;
  return s.phase==='playing'&&b.vz<0&&b.z>=s.player.z-.12&&
    b.z<=s.player.z+w.reach&&Math.abs(b.x-s.player.x)<=w.width;
}
function tick(s,dt,axis){
  s.flash=Math.max(0,s.flash-dt*2);
  s.elapsed+=dt;
  s.boardAngle=Math.sin(s.elapsed*.65+s.levelIndex*.8)*s.level.tilt;
  if(s.phase==='serving'||s.phase==='miss'){
    s.countdown-=dt;
    if(s.countdown<=0){if(s.phase==='miss')serve(s);s.phase='playing';s.events.push('serve');}
    return;
  }
  s.player.x=clamp(s.player.x+axis*6.2*dt,-3.45,3.45);
  const w=WEAPONS[s.weapon];
  if(s.swing){s.swing.time+=dt;if(s.swing.time>w.windup+w.active+w.recovery)s.swing=null;}
  const b=s.ball;
  b.x+=b.vx*dt;b.z+=b.vz*dt;
  if(b.x>3.82){b.x=7.64-b.x;b.vx=-Math.abs(b.vx);s.events.push('wall');}
  if(b.x< -3.82){b.x=-7.64-b.x;b.vx=Math.abs(b.vx);s.events.push('wall');}
  if(b.z>9.8&&b.vz>0){
    b.z=19.6-b.z;
    const angle=clamp(Math.atan2(b.vx,b.vz)+s.boardAngle*2,-.76,.76);
    const speed=s.level.speed*(s.levelIndex===3?1+.08*Math.sin(s.hits):1);
    b.vx=Math.sin(angle)*speed;b.vz=-Math.cos(angle)*speed;s.events.push('wall');
  }
  const sw=s.swing;
  if(sw&&!sw.hit&&sw.time>=w.windup&&sw.time<=w.windup+w.active&&inHitRange(s)){
    sw.hit=true;
    const timing=(sw.time-w.windup)/w.active;
    const perfect=timing>=.3&&timing<=.7;
    s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=perfect?150:100;
    s.lastHit=perfect?'漂亮回击':'成功回击';s.flash=1;s.events.push(perfect?'perfect':'hit');
    const angle=clamp((b.x-s.player.x)/w.width*.42,-.48,.48);
    b.vx=Math.sin(angle)*s.level.speed;b.vz=Math.cos(angle)*s.level.speed;
    if(s.hits>=s.level.target){s.phase='won';s.events.push('win');}
    return;
  }
  if(b.z<=0){
    s.misses++;s.combo=0;s.flash=-1;s.swing=null;s.events.push('miss');
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
