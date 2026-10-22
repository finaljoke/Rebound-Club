import {LEVELS,WEAPONS,ACTIVE_PHASES,KEEPER_Z,KEEPER_REACH,FAR_WALL,createGame,startGame,stepGame,attack,pauseGame,resumeGame,inHitRange,ballHeight} from './core.mjs';
import {createInput} from './input.mjs';
import {loadProgress,saveProgress} from './storage.mjs';
import {create3DRenderer} from './scene3d.mjs';

const $=id=>document.getElementById(id);
let canvas=$('court'),ctx=null,court3D=null;
const input=createInput();
let storage;try{storage=window.localStorage;}catch{storage=null;}
const progress=loadProgress(storage);
let selected=0,weapon='glove',game=createGame(),uiPhase='',soundOn=true,audio=null;
let lastTime=0,trail=[],particles=[],viewWidth=0,viewHeight=0,shake=0;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const icons={glove:'◒',racket:'◎',sword:'⚔'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Every cue is synthesized: a low sine thump for weight layered with a short filtered noise burst for the crack.
function tone(a,b,d,type='sine',vol=.1,delay=0){
  const at=audio.currentTime+delay,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=type;osc.frequency.setValueAtTime(a,at);osc.frequency.exponentialRampToValueAtTime(b,at+d);
  gain.gain.setValueAtTime(vol,at);gain.gain.exponentialRampToValueAtTime(.001,at+d);
  osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+d);
}
function noise(d,vol,freq,delay=0){
  const at=audio.currentTime+delay,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*d),audio.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  src.buffer=buffer;filter.type='bandpass';filter.frequency.value=freq;filter.Q.value=.9;gain.gain.value=vol;
  src.connect(filter);filter.connect(gain);gain.connect(audio.destination);src.start(at);
}
const cues={
  swing:()=>noise(.09,.05,1700),
  whiff:()=>{noise(.14,.05,800);tone(240,160,.1,'sine',.04);},
  hit:()=>{tone(210,90,.12,'sine',.28);noise(.05,.22,2600);},
  perfect:()=>{tone(150,48,.24,'sine',.42);noise(.09,.32,1300);tone(880,1320,.16,'triangle',.07,.03);},
  soft:()=>{tone(320,210,.08,'sine',.12);noise(.03,.06,3200);},
  wall:()=>{tone(200,150,.05,'sine',.08);noise(.03,.05,1800);},
  save:()=>{tone(130,60,.18,'sine',.32);noise(.12,.22,650);},
  goal:()=>{[523,659,784,1046].forEach((f,i)=>tone(f,f*1.01,i===3?.4:.13,'triangle',.09,i*.09));noise(.7,.06,1400,.05);},
  miss:()=>{tone(170,60,.4,'sawtooth',.06);noise(.2,.08,400);},
  win:()=>[523,659,784,1046,1318].forEach((f,i)=>tone(f,f,i===4?.5:.14,'triangle',.08,i*.1)),
  start:()=>tone(350,700,.12,'triangle',.07)
};
function sound(kind){
  if(!soundOn||!cues[kind])return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    audio??=new Audio();if(audio.state==='suspended')audio.resume().catch(()=>{});
    cues[kind]();
  }catch{/* Audio is optional; play remains available. */}
}

function selections(){
  const busy=[...ACTIVE_PHASES,'paused'].includes(game.phase);
  $('levels').innerHTML=LEVELS.map((l,i)=>`<button class="level-button ${selected===i?'selected':''}" data-level="${i}" aria-label="第${i+1}关 ${l.name}${i>progress.unlocked?'，未解锁':''}" aria-pressed="${selected===i}" ${i>progress.unlocked||busy?'disabled':''}>${String(i+1).padStart(2,'0')}<small class="${progress.scores[i]?'completed':''}">${i>progress.unlocked?'⌑':progress.perfect[i]?'★':progress.scores[i]?'✓':'↗'}</small></button>`).join('');
  $('weapons').innerHTML=Object.entries(WEAPONS).map(([id,w])=>`<button class="weapon-button ${weapon===id?'selected':''}" data-weapon="${id}" aria-pressed="${weapon===id}" ${busy||(id!=='glove'&&progress.unlocked===0)?'disabled':''}><span class="weapon-icon">${icons[id]}</span><span class="weapon-copy"><b>${w.name}</b><small>${w.subtitle}</small></span><span class="weapon-check">${id!=='glove'&&progress.unlocked===0?'⌑':weapon===id?'●':'○'}</span></button>`).join('');
  $('stage-name').textContent=LEVELS[selected].name;
  $('level-count').textContent=`${String(selected+1).padStart(2,'0')} / 06`;
  document.querySelector('.game-top .mini-label').textContent=`COURT ${String(selected+1).padStart(2,'0')}`;
  $('level-note').textContent=`进 ${LEVELS[selected].goals} 球通关 · ${LEVELS[selected].tag}。`;
  $('weapon-note').textContent=progress.unlocked===0?'完成第一关，解锁球拍和剑。':'装备各有手感，找到你的防守节奏。';
  $('best').textContent=progress.scores[selected]??'—';
  $('save-note').innerHTML=`<span class="live-dot"></span>${progress.saved?'进度自动保存在这台设备':'进度暂未保存，仍可继续游玩'}`;
}
function ready(){game=createGame(selected,weapon);trail=[];particles=[];input.reset();uiPhase='';selections();phaseUI();hud();}
function overlay(html){$('overlay-content').innerHTML=html;$('overlay').hidden=false;}
function phaseUI(){
  if(game.phase===uiPhase)return;uiPhase=game.phase;
  if(game.phase==='ready')overlay(`<div class="overlay-symbol">✳</div><span class="eyebrow">READY TO REBOUND?</span><h3>守住自家，<br>攻破对面。</h3><p>${WEAPONS[weapon].name}已就绪。进 ${game.level.goals} 球通关，丢 3 球结束。<br>早打往左、晚打往右，正中出重炮。</p><button class="primary-button" data-action="start">开始挑战 <span>↗</span></button>`);
  else if(game.phase==='paused')overlay('<div class="overlay-symbol">Ⅱ</div><span class="eyebrow">TAKE A BREATH</span><h3>休息一下。</h3><p>球会等你。准备好，再打个漂亮。</p><button class="primary-button" data-action="resume">继续防守 →</button><button class="secondary-button" data-action="retry">重新开始本关</button>');
  else if(game.phase==='won'){
    progress.unlocked=Math.max(progress.unlocked,Math.min(5,selected+1));
    progress.scores[selected]=Math.max(progress.scores[selected]||0,game.score);
    if(game.misses===0)progress.perfect[selected]=true;
    progress.saved=saveProgress(storage,progress);
    overlay(`<div class="overlay-symbol">${game.misses===0?'★':'✓'}</div><span class="eyebrow">COURT CLEARED</span><h3>${game.misses===0?'完美防守！':'守住了！'}</h3><p>${selected===5?'六关全部完成，你就是守门王牌。':'这一球接得漂亮，下一关见。'}</p><div class="result-score">${game.score}<small>本关得分</small></div><div class="result-stats"><span><b>${game.goals}</b>进球</span><span><b>${game.bestCombo}</b>最高连击</span><span><b>${3-game.misses}</b>剩余机会</span></div><button class="primary-button" data-action="${selected===5?'retry':'next'}">${selected===5?'再挑战一次 ↻':'挑战下一关 →'}</button><button class="secondary-button" data-action="ready">选择关卡与装备</button>`);
    sound('win');input.reset();
  }else if(game.phase==='lost'){
    overlay(`<div class="overlay-symbol">↻</div><span class="eyebrow">ONE MORE TRY</span><h3>差一点，<br>再接一球。</h3><p>已进 ${game.goals} / ${game.level.goals} 球。<br>正面的球会被扑住，试试站边路打重炮。</p><div class="result-score">${game.score}<small>本关得分</small></div><button class="primary-button" data-action="retry">再来一局 ↻</button><button class="secondary-button" data-action="ready">返回准备</button>`);input.reset();
  }else $('overlay').hidden=true;
  selections();
}
function hud(){
  $('progress').textContent=`${game.goals} / ${game.level.goals}`;
  $('progress-bar').style.width=`${game.goals/game.level.goals*100}%`;
  $('hearts').innerHTML=[0,1,2].map(i=>`<span class="${i>=3-game.misses?'spent':''}">●</span>`).join(' ');
  $('hearts').setAttribute('aria-label',`剩余${3-game.misses}次机会`);
  $('score').innerHTML=`${String(game.score).padStart(4,'0')} <small>分</small>`;
  $('pause').disabled=!ACTIVE_PHASES.includes(game.phase);
  $('attack').disabled=game.phase!=='playing';
  $('attack').classList.toggle('recovering',!!game.swing);
  $('attack').querySelector('span').textContent=game.swing?'收招':'挥击';
  const status={ready:'热身准备',serving:'发球准备',playing:'对决进行中',miss:'稳住，再来',goal:'进球！',paused:'已暂停',won:'本关完成',lost:'挑战结束'};
  $('court-status').textContent=game.phase==='serving'?`发球倒数 ${Math.max(1,Math.ceil(game.countdown*2))}`:game.phase==='playing'&&game.rally>1.001?`对决进行中 · 球速 ×${game.rally.toFixed(2)}`:status[game.phase];
  $('combo').style.opacity=game.combo>1?'1':'0';$('combo').querySelector('b').textContent=game.combo;
  $('move-knob').style.transform=`translateX(${input.axis()*30}px)`;
}
function pop(text,miss=false){const el=$('hit-pop');el.textContent=text;el.className=`hit-pop${miss?' miss':''}`;void el.offsetWidth;el.classList.add('show');}
function swing(){if(attack(game))sound('swing');}
function suspend(){pauseGame(game);input.reset();phaseUI();hud();}
function fallbackRenderer(){
  court3D?.dispose();court3D=null;
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
  ctx=canvas.getContext('2d');canvas.dataset.renderer='2d';viewWidth=0;viewHeight=0;
}
try{
  court3D=create3DRenderer(canvas);canvas.dataset.renderer='3d';
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();suspend();fallbackRenderer();$('feedback').textContent='已切换兼容画面，可以继续防守。';});
}catch{fallbackRenderer();}

$('overlay').addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='start'){startGame(game);sound('start');}
  if(action==='resume')resumeGame(game);
  if(action==='retry'){ready();startGame(game);sound('start');}
  if(action==='ready')ready();
  if(action==='next'){selected=Math.min(5,selected+1);ready();startGame(game);sound('start');}
  phaseUI();hud();
});
$('levels').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b&&!b.disabled){selected=Number(b.dataset.level);ready();}});
$('weapons').addEventListener('click',e=>{const b=e.target.closest('[data-weapon]');if(b&&!b.disabled){weapon=b.dataset.weapon;ready();}});
$('pause').addEventListener('click',suspend);
$('attack').addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();swing();});
$('attack').addEventListener('click',e=>{if(e.detail===0)swing();});
const move=$('move-control');
move.addEventListener('pointerdown',e=>{e.preventDefault();input.down(e.pointerId,e.clientX);move.setPointerCapture(e.pointerId);});
move.addEventListener('pointermove',e=>input.move(e.pointerId,e.clientX));
move.addEventListener('pointerup',e=>input.up(e.pointerId));
move.addEventListener('pointercancel',()=>input.cancel());
move.addEventListener('lostpointercapture',e=>input.up(e.pointerId));
window.addEventListener('keydown',e=>{
  if($('help-dialog').open)return;
  if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)&&ACTIVE_PHASES.includes(game.phase)){e.preventDefault();input.key(e.key,true);}
  if(e.code==='Space'&&game.phase==='playing'){e.preventDefault();if(!e.repeat)swing();}
  if(e.code==='Escape'&&ACTIVE_PHASES.includes(game.phase))suspend();
});
window.addEventListener('keyup',e=>input.key(e.key,false));
window.addEventListener('blur',suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();lastTime=0;});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').innerHTML=`${soundOn?'♪':'♩'} <span>音效${soundOn?'开':'关'}</span>`;if(soundOn)sound('start');});
$('help').addEventListener('click',()=>{suspend();$('help-dialog').showModal();});
for(const b of [$('help-close'),document.querySelector('.dialog-close')])b.addEventListener('click',()=>$('help-dialog').close());

// A fixed logical canvas keeps the court and collision hints aligned at every viewport size.
function project(x,z){const scale=.55+.45*(1-z/10);return {x:225+x/4*191*scale,y:480-z*36.4,scale};}
function polygon(points,fill,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function round(x,y,w,h,r,color){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill();}
function text(value,x,y,size,color,weight='600',align='center'){ctx.font=`${weight} ${size}px Arial, "Microsoft YaHei", sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(value,x,y);}
function stage(){
  ctx.fillStyle='#ccd4bd';ctx.fillRect(0,0,450,540);
  polygon([[0,0],[450,0],[450,99],[0,99]],'#b9c5ab');
  // Quiet landscaping and bleachers frame a warm, compact neighborhood court.
  for(const [x,y,r] of [[12,45,30],[44,17,26],[420,30,40],[382,13,27]]){ellipse(x,y,r,r*.8,'#9daf91');ellipse(x-5,y-6,r*.7,r*.55,'#adbd9b');}
  round(134,44,182,35,5,'#e9e7ca');text('R E B O U N D   C L U B',225,65,9,'#62775b');
  for(let i=0;i<4;i++){const y=82+i*8;line(24,y,108,y,'#a0ad91',4);line(342,y,427,y,'#a0ad91',4);}
  polygon([[108,112],[342,112],[431,510],[19,510]],'#a9b998');
  polygon([[116,122],[334,122],[411,486],[39,486]],game.level.color);
  ctx.save();polygon([[116,122],[334,122],[411,486],[39,486]],null,'#eeeac15c',2);
  for(let i=1;i<6;i++){const z=i*1.6,p1=project(-3.75,z),p2=project(3.75,z);line(p1.x,p1.y,p2.x,p2.y,'#f0efd20b',1);}
  for(const x of [-3.6,3.6]){const a=project(x,.3),b=project(x,9.6);line(a.x,a.y,b.x,b.y,'#e9ecc18c',1.6);}
  const mid1=project(-3.6,5),mid2=project(3.6,5);line(mid1.x,mid1.y,mid2.x,mid2.y,'#eeeac15c',1.4);
  const center=project(0,5);ctx.beginPath();ctx.ellipse(center.x,center.y,52,26,0,0,Math.PI*2);ctx.strokeStyle='#eeeac15c';ctx.lineWidth=1.4;ctx.stroke();ellipse(center.x,center.y,2.5,1.5,'#eeeac1a0');
  const a=project(-2.5,1),b=project(2.5,1),c=project(2.5,2.4),d=project(-2.5,2.4);polygon([[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],null,'#eeeac15c',1.4);
  ctx.save();ctx.translate(225,354);ctx.scale(1,.65);text('REBOUND',0,0,37,'#f7f2ce10','900');ctx.restore();
  // Side rails are visual bounds, matching the ball's two collision edges.
  for(const side of [-1,1]){const near=project(side*4,0),far=project(side*4,10);line(near.x,near.y,far.x,far.y,'#72876a',5);line(near.x,near.y-18,far.x,far.y-14,'#ebecd1',3);for(let z=0;z<=10;z+=2){const p=project(side*4,z);line(p.x,p.y,p.x,p.y-17,'#cdd6b8',2);}}
  // The far wall is split around the keeper's goal mouth.
  const g=game.level.goalHalf,wl=project(-4,FAR_WALL),wr=project(4,FAR_WALL),gl=project(-g,FAR_WALL),gr=project(g,FAR_WALL);
  for(const [a,b] of [[wl,gl],[gr,wr]]){round(Math.min(a.x,b.x),a.y-14,Math.abs(b.x-a.x),18,3,'#dfebad');round(Math.min(a.x,b.x),a.y+2,Math.abs(b.x-a.x),6,2,'#1b4438');}
  polygon([[gl.x,gl.y-20],[gr.x,gr.y-20],[gr.x,gr.y+4],[gl.x,gl.y+4]],'#f1f0d32c');
  for(let x=gl.x+6;x<gr.x;x+=9)line(x,gl.y-20,x,gl.y+4,'#eeefd25a',.8);
  line(gl.x,gl.y+4,gl.x,gl.y-20,'#f8f2d7',4);line(gr.x,gr.y+4,gr.x,gr.y-20,'#f8f2d7',4);line(gl.x,gl.y-20,gr.x,gr.y-20,'#fff7df',4);
  // Fixed goal and net sit behind the defender.
  polygon([[41,471],[409,471],[423,512],[27,512]],'#f1f0d32c');
  for(let x=43;x<410;x+=18)line(x,449,x+(x-225)*.06,507,'#eeefd25a',.8);
  for(let y=450;y<=508;y+=10)line(41-(y-449)*.18,y,409+(y-449)*.18,y,'#eeefd25a',.8);
  line(41,480,41,446,'#f8f2d7',5);line(409,480,409,446,'#f8f2d7',5);line(41,446,409,446,'#fff7df',5);
  line(41,480,409,480,'#f8f2d7aa',2);text('守 住 这 里',225,508,10,'#f4f1ceaa');
  ctx.restore();
}
function player(){
  const p=project(game.player.x,game.player.z),w=WEAPONS[weapon];
  const moving=Math.abs(input.axis())>.05&&game.phase==='playing';const gait=moving?Math.sin(game.elapsed*19)*4:0;
  const sw=game.swing;const swingAmount=sw?Math.sin(Math.min(1,sw.time/(w.windup+w.active))*Math.PI):0;
  const nearby=game.phase==='playing'&&game.ball.vz<0&&game.ball.z<3.7;
  const inRange=inHitRange(game);
  if(nearby||sw){const h=project(game.player.x,game.player.z+w.reach*.5);ctx.beginPath();ctx.ellipse(h.x,h.y,42*w.width,17+w.reach*9,0,0,Math.PI*2);ctx.fillStyle=sw?'#e3efb128':inRange?'#e3efb11c':'#fff7d309';ctx.fill();ctx.strokeStyle=inRange?'#e3efb1aa':'#e3efb13b';ctx.setLineDash([5,5]);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);}
  ellipse(p.x,p.y+3,23,8,'#12372d45');
  // Sneakers, shorts, jersey, head: the full character remains visible.
  line(p.x-7,p.y-18,p.x-10,p.y-2+gait,'#ad805f',8);line(p.x+7,p.y-18,p.x+10,p.y-2-gait,'#ad805f',8);
  round(p.x-17,p.y-3+gait,13,7,3,'#f7efcf');round(p.x+4,p.y-3-gait,13,7,3,'#f7efcf');
  round(p.x-13,p.y-24,26,13,4,'#233f37');line(p.x,p.y-23,p.x,p.y-13,'#152e28',2);
  polygon([[p.x-16,p.y-47],[p.x+16,p.y-47],[p.x+13,p.y-23],[p.x-13,p.y-23]],'#f1e8c9','#d5d7b4',1);
  round(p.x-13,p.y-45,26,7,1,'#eb794f');text('01',p.x,p.y-29,11,'#375b47','900');
  const armY=p.y-39-swingAmount*12;
  line(p.x-15,p.y-42,p.x-23,p.y-30-swingAmount*12,'#bc8b65',8);
  line(p.x+15,p.y-42,p.x+23,armY+4,'#bc8b65',8);
  if(weapon==='glove'){
    ellipse(p.x-24,p.y-31-swingAmount*14,10,11,'#bd4834');ellipse(p.x-24,p.y-34-swingAmount*14,9,10,'#f1784f');
    ellipse(p.x+24,armY+2,10,11,'#bd4834');ellipse(p.x+24,armY-1,9,10,'#f1784f');
    line(p.x-30,p.y-28-swingAmount*14,p.x-18,p.y-28-swingAmount*14,'#f8cba2',3);line(p.x+18,armY+5,p.x+30,armY+5,'#f8cba2',3);
  }else if(weapon==='racket'){
    const ry=armY-16;line(p.x+23,armY+4,p.x+29,ry,'#ddba79',5);
    ctx.save();ctx.translate(p.x+32,ry-9);ctx.rotate(-.25-swingAmount*.5);ctx.beginPath();ctx.ellipse(0,0,13,20,0,0,Math.PI*2);ctx.fillStyle='#d4e9ba44';ctx.fill();ctx.strokeStyle='#eacd8d';ctx.lineWidth=4;ctx.stroke();for(let x=-6;x<=6;x+=6)line(x,-13,x,13,'#d4e9ba',.7);for(let y=-12;y<=12;y+=6)line(-9,y,9,y,'#d4e9ba',.7);ctx.restore();
  }else{
    const sx=p.x+23,sy=armY;line(sx,sy+5,sx+3,sy-10,'#b58453',5);line(sx-5,sy-8,sx+12,sy-10,'#edcc77',4);
    polygon([[sx+2,sy-10],[sx-1,sy-50-swingAmount*10],[sx+7,sy-61-swingAmount*10],[sx+10,sy-12]],'#e9f2e9','#b7cfc3',1);line(sx+5,sy-16,sx+6,sy-52-swingAmount*10,'#fff9e8',1);
  }
  ellipse(p.x,p.y-54,12,13,'#bf8f69');ellipse(p.x,p.y-58,12,9,'#30392f');round(p.x-12,p.y-57,24,6,3,'#30392f');
  if(sw&&!reduceMotion){ctx.beginPath();ctx.ellipse(p.x+6,p.y-47,38+Math.sin(sw.time*8)*6,17,-.3,Math.PI*1.05,Math.PI*1.85);ctx.strokeStyle=`rgba(245,241,192,${swingAmount*.65})`;ctx.lineWidth=4;ctx.stroke();}
}
function keeper(){
  const k=game.keeper,p=project(k.x,KEEPER_Z),s=p.scale,lean=k.diveDir*(k.dive/.35)*14;
  ellipse(p.x,p.y+2,KEEPER_REACH*48*s,5,'#12372d45');
  line(p.x-5*s,p.y-14*s,p.x-7*s,p.y,'#ad805f',6*s);line(p.x+5*s,p.y-14*s,p.x+7*s,p.y,'#ad805f',6*s);
  polygon([[p.x-12*s+lean*.4,p.y-36*s],[p.x+12*s+lean*.4,p.y-36*s],[p.x+10*s,p.y-14*s],[p.x-10*s,p.y-14*s]],'#3d6f95','#2c5574',1);
  for(const side of [-1,1]){const hx=p.x+side*(20*s)+lean,hy=p.y-40*s-(k.dive>0?8:0);line(p.x+side*11*s+lean*.4,p.y-33*s,hx,hy,'#bc8b65',5*s);ellipse(hx,hy,6*s,6*s,'#f2c14e');}
  ellipse(p.x+lean*.5,p.y-43*s,8*s,9*s,'#bf8f69');ellipse(p.x+lean*.5,p.y-47*s,8*s,6*s,'#30392f');
}
function ball(){
  if(game.phase==='miss'||game.phase==='lost')return;
  const b=game.ball,p=project(b.x,b.z),r=8.4*p.scale;
  if(!reduceMotion)for(let i=0;i<trail.length;i++){const q=project(trail[i].x,trail[i].z);ellipse(q.x,q.y-10*q.scale,r*(i/trail.length)*.65,r*(i/trail.length)*.65,`rgba(246,207,105,${i/trail.length*.27})`);}
  ellipse(p.x+3,p.y+1,r*1.15,r*.36,'#0c302d3b');
  const y=p.y-(11+(ballHeight(game)-.73)*30)*p.scale;
  if(b.vz<0&&b.z<3.4){ctx.beginPath();ctx.ellipse(p.x,p.y,r*2.1,r*.7,0,0,Math.PI*2);ctx.strokeStyle='#f6d77ab0';ctx.lineWidth=1.5;ctx.stroke();}
  ellipse(p.x,y,r+1,r+1,'#a9772b');ellipse(p.x,y-1,r,r,'#f6cc67');ellipse(p.x-2,y-3,r*.42,r*.32,'#ffe9a2');
  ctx.beginPath();ctx.ellipse(p.x,y-1,r*.5,r,0,0,Math.PI*2);ctx.strokeStyle='#ac802b';ctx.lineWidth=.9;ctx.stroke();line(p.x-r,y-1,p.x+r,y-1,'#ac802b',.9);
}
function draw(dt){
  if(court3D){court3D.render(game,input.axis(),reduceMotion,shake);return;}
  const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);
  if(rect.width!==viewWidth||rect.height!==viewHeight){viewWidth=rect.width;viewHeight=rect.height;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  ctx.setTransform(canvas.width/450,0,0,canvas.height/540,0,0);ctx.lineCap='round';ctx.lineJoin='round';
  stage();keeper();player();ball();
  for(const particle of particles){if(game.phase!=='paused'){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;}ellipse(particle.x,particle.y,Math.max(.1,particle.life*5),Math.max(.1,particle.life*5),'#fff0a3');}
  particles=particles.filter(p=>p.life>0);
  if(game.phase==='serving'){const n=Math.max(1,Math.ceil(game.countdown*2));round(190,233,70,66,16,'#fff5dbed');text(String(n),225,280,39,'#2c5f4a','900');}
}
function frame(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  stepGame(game,dt,input.axis());
  const events=game.events;game.events=[];
  const aim={left:'偏左 ←',right:'偏右 →',straight:'直线 ↑'};
  for(const e of events){
    if(['hit','perfect','soft','whiff','wall','save','goal','miss'].includes(e))sound(e);
    if(e==='hit'){pop(aim[game.lastShot]||'好球！');$('feedback').textContent='早打往左，晚打往右。';}
    if(e==='perfect'){pop('重炮！');shake=Math.max(shake,.12);$('feedback').textContent='正中甜点！门将很难追上。';}
    if(e==='soft'){pop('软球',true);$('feedback').textContent='挥早了，球是自己撞上来的。等球到圈里再出手。';}
    if(e==='whiff'){pop('挥空',true);$('feedback').textContent='挥空要多收招一会儿，别乱按。';}
    if(e==='save'){pop('被扑住！',true);shake=Math.max(shake,.05);$('feedback').textContent='门将扑住了，准备防守！';}
    if(e==='goal'){pop(game.lastShot==='perfect'?'重炮破门！':'进球！');shake=Math.max(shake,.22);$('feedback').textContent=`进球！还差 ${Math.max(0,game.level.goals-game.goals)} 球。`;}
    if(['hit','perfect','goal'].includes(e)&&!reduceMotion&&!court3D){const p=project(game.ball.x,game.ball.z);for(let i=0;i<9;i++)particles.push({x:p.x,y:p.y-12,vx:Math.cos(i*2.4)*60,vy:Math.sin(i*2.4)*60,life:.35});}
    if(e==='miss'){pop('丢球了！',true);shake=Math.max(shake,.15);$('feedback').textContent='提前看影子，移动到位再出手。';trail=[];}
  }
  if(reduceMotion){game.hitstop=0;shake=0;}
  shake*=Math.exp(-dt*9);if(shake<.005)shake=0;
  if(game.phase==='playing'&&!reduceMotion&&!court3D){trail.push({x:game.ball.x,z:game.ball.z});if(trail.length>7)trail.shift();}
  phaseUI();hud();draw(dt);requestAnimationFrame(frame);
}
ready();requestAnimationFrame(frame);
