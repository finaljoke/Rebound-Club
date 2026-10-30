// Duel page (P0, on one device). Against the duel bot: two copies of the match joined by a loopback that can simulate
// network latency (duel-net.mjs), the bot playing the far copy from its own view, this page showing the near one. The
// copies sync the way chosen (duel-net.mjs `sync`); a blind run picks one at random and names it only on the result
// screen, so the two can be compared without knowing which is which. Two players on one keyboard: one copy decided for
// both. With a friend online: a room (duel-link.mjs) joins two pages, each running its own copy for its own player,
// as the far copy does against the bot; the host starts each match, pauses are shared. The court is the club's 3D scene
// in duel mode (duel-view.mjs).
import {SKILLS} from './core.mjs';
import {DUEL,DUEL_ACTIVE,createDuel,startDuel,stepDuel,duelAttack,duelSkill,duelSkillStatus,duelSwingPreview,pauseDuel,resumeDuel} from './duel-core.mjs';
import {viewFor} from './duel-view.mjs';
import {createLoopback,createClient} from './duel-net.mjs';
import {createLink} from './duel-link.mjs';
import {createBot} from './duel-bot.mjs';
import {createInput} from './input.mjs';
import {create3DRenderer} from './scene3d.mjs';
import {sound,buzz,setSound} from './sfx.mjs';
import {icon,hitFeel,whiffHint,SKILL_STATE} from './ui.mjs';

const $=id=>document.getElementById(id);
const coarse=matchMedia('(pointer:coarse)').matches,reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Captions float over the court for a few seconds after each change, as in the club.
let captionTimer=0;
new MutationObserver(()=>{const box=$('feedback').parentElement;box.classList.add('show');clearTimeout(captionTimer);captionTimer=setTimeout(()=>box.classList.remove('show'),4200);})
  .observe($('feedback'),{childList:true,characterData:true,subtree:true});
function goFullscreen(){const d=document.documentElement;if(coarse&&document.fullscreenEnabled&&!document.fullscreenElement&&d.requestFullscreen)d.requestFullscreen({navigationUI:'hide'}).catch(()=>{});}

// Player A: on-screen buttons and A/D (plus the arrows against the bot). Player B on the same keyboard: the arrows, in
// screen directions; B faces the other way, so its own left is the screen's right.
const input=createInput(),keysB=new Set();
// latency: each message's one-way delay (ms); the buttons show the round trip, as a game's ping does.
let mode='ai',latency=0,sync='catchup',soundOn=true,match=null,room=null,uiPhase='',lastTime=0,shake=0,court=null;
const idle=createDuel();
// The side this page's player plays: A against the bot and on one keyboard, the room's place online (host A, guest B).
const me=()=>match?.me??'a',foe=()=>me()==='a'?'b':'a';
const names=()=>mode==='local'?{a:'近端',b:'远端'}:{[me()]:'我',[foe()]:'对手'};
const SYNC_NAMES={catchup:'追帧',fullflight:'出球放慢'};
const axisB=()=>(keysB.has('ArrowLeft')?1:0)-(keysB.has('ArrowRight')?1:0);
const stateOf=()=>match?match.state:idle;
const viewOf=()=>match?.mode==='ai'?match.a.view():match?.mode==='online'?match.client.view():viewFor(stateOf(),'a');

function newMatch(){
  input.reset();keysB.clear();
  if(mode==='ai'){
    const now=()=>performance.now()/1000,seed=(Math.random()*2**31)>>>0,loop=createLoopback({delayMs:latency,jitterMs:latency*.2,seed,now});
    const used=sync==='blind'?(Math.random()<.5?'catchup':'fullflight'):sync;
    const a=createClient({side:'a',transport:loop[0],now,sync:used}),b=createClient({side:'b',transport:loop[1],now,sync:used});
    match={mode,sync:used,blind:sync==='blind',loop,a,b,bot:createBot({seed:seed+1}),state:a.state,pending:{a:{swing:false,skill:null}}};a.start();b.start();
  }else{const s=createDuel();match={mode,state:s,pending:{a:{swing:false,skill:null},b:{swing:false,skill:null}}};startDuel(s);}
  sound('start');
}
// A press is queued for the next step, so it goes through the same path (and network stamp) as everything else.
function press(side,kind){
  if(!match||(mode!=='local'&&side!==me()))return;const s=match.state;
  if(kind==='swing'){if(s.phase==='playing')match.pending[side].swing=true;return;}
  if(!DUEL_ACTIVE.includes(s.phase))return;
  const st=duelSkillStatus(s,side,kind);if(!st.ok){sound('deny');pop(SKILL_STATE[st.reason]||'现在不行',true);return;}
  match.pending[side].skill=kind;
}
function stepMatch(dt){
  const p=match.pending;
  if(match.mode==='ai'){
    const {loop,a,b,bot}=match;loop.flush();
    a.step(dt,{axis:input.axis(),swing:p.a.swing,skill:p.a.skill});p.a.swing=false;p.a.skill=null;
    b.step(dt,bot.decide(b.view(),dt));b.state.events=[];
  }else if(match.mode==='online'){
    const q=p[match.me];match.client.step(dt,{axis:input.axis(),swing:q.swing,skill:q.skill});q.swing=false;q.skill=null;
    if(match.resumeAt&&performance.now()/1000>=match.resumeAt){match.resumeAt=null;match.pausedBy=null;match.client.resume();uiPhase='';}
  }else{
    const s=match.state,axes={a:input.axis(),b:axisB()};
    for(const side of ['a','b']){const q=p[side];if(q.skill)duelSkill(s,side,q.skill,axes[side]);else if(q.swing)duelAttack(s,side);q.swing=false;q.skill=null;}
    stepDuel(s,dt,{a:{axis:axes.a},b:{axis:axes.b}});
  }
}
function suspend(){
  if(!match||!DUEL_ACTIVE.includes(match.state.phase))return;
  if(match.mode==='online'){room?.link.control({type:'pause',n:match.n});match.client.pause();match.pausedBy='me';uiPhase='';}
  else if(match.mode==='ai'){match.a.pause();match.b.pause();}else pauseDuel(match.state);
  input.reset();keysB.clear();
}
function resume(){
  if(!match)return;
  if(match.mode==='online'){if(match.state.phase!=='paused'||match.resumeAt||!room?.peer)return;room.link.control({type:'resume',n:match.n});holdResume();return;}
  if(match.mode==='ai'){match.a.resume();match.b.resume();}else resumeDuel(match.state);
}

function pop(text,miss=false){const el=$('hit-pop');el.textContent=text;el.className=`hit-pop${miss?' miss':''}`;void el.offsetWidth;el.classList.add('show');}
function verdict(text,kind){const el=$('result-pop');el.textContent=text;el.className=`result-pop ${kind}`;void el.offsetWidth;el.classList.add('show');}
const say=text=>{$('feedback').textContent=text;};
const AIM={left:'往左 ←',right:'往右 →',straight:'直线 ↑'};
function events(){
  const s=stateOf(),n=names(),both=mode==='local',my=me();
  for(const e of s.events){const mine=e.side===my,shown=mine||both,who=n[e.side];
    if(e.type==='swing'&&shown)sound('swing');
    if(['hit','perfect','soft','spin','burst'].includes(e.type)){
      const f=hitFeel('glove',e.type);sound(f.sound,mine?f.intensity:f.intensity*.7);if(e.type==='perfect'||e.type==='burst')sound('impact');
      if(shown){buzz(e.type);const shot=s.players[e.side].lastShot;
        pop((both?`${who} · `:'')+(e.type==='perfect'?'重炮！':e.type==='soft'?'软球':e.type==='spin'?'旋转':e.type==='burst'?'爆发！':AIM[shot]||'好球！'),e.type==='soft');}
      if(e.type==='perfect'||e.type==='burst')shake=Math.max(shake,.06);
    }
    if(e.type==='whiff'&&shown){sound('whiff');pop((both?`${who} · `:'')+whiffHint(s.players[e.side].whiff),true);}
    if(e.type==='wall')sound('wall');
    if(e.type==='wide'){sound('wide');verdict(`${n[e.side]}打偏了 · 球弹回来`,'info');}
    if(e.type==='burstStart'){sound('charge');say(`${who}蓄力爆发……`);}
    if(e.type==='burstStrike')sound('strike');
    if(e.type==='goal'){
      const scored=both||mine;shake=Math.max(shake,scored?.1:.08);
      if(!both){verdict(mine?'进球！':'丢球！',mine?'good':'bad');sound(mine?'goal':'miss');buzz(mine?'goal':'miss');}
      else{verdict(`${who}进球！`,'good');sound('goal');}
      const [l,r]=both?['a','b']:[my,foe()];say(`${n[l]} ${s.score[l]} : ${s.score[r]} ${n[r]} · 先进 ${DUEL.goals} 球获胜`);
    }
    if(e.type==='win')sound(both||mine?'win':'miss');
    if((e.type==='energy50'||e.type==='energy100')&&mine){const el=$('energy');el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');}
  }
  s.events=[];
}

function overlay(html){$('overlay-content').innerHTML=html;$('overlay').hidden=false;}
function screenFor(phase){return phase==='ready'?'ready':phase==='paused'?'paused':phase==='won'?'result':'match';}
function phaseUI(){
  const s=stateOf(),phase=s.phase;if(phase===uiPhase)return;uiPhase=phase;
  const previous=document.body.dataset.screen,screen=screenFor(phase);document.body.dataset.screen=screen;
  updateStart();
  if(phase==='paused'&&match?.mode==='online')overlay(onlinePause());
  else if(phase==='paused')overlay(`<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>喘口气，再上。</h3><p>比分和球都会保留。</p><button class='primary-button' data-action='resume'>继续对战 ${icon('arrow')}</button><div class='pause-actions'><button class='secondary-button' data-action='retry'>重新开始</button><button class='secondary-button' data-action='setup'>返回设置</button></div>`);
  else if(phase==='won'){
    const n=names(),win=s.winner,both=mode==='local',lost=!both&&win!==me(),title=both?`${n[win]}获胜`:lost?'对手赢了':'你赢了',[l,r]=both?['a','b']:[me(),foe()];
    const syncLine=mode==='local'?'':`<div class='result-subtitle' id='result-sync'>${match.blind?'盲测揭晓：这局用的是':'同步方式：'}「${SYNC_NAMES[match.sync]}」${mode==='ai'?` · 往返 ${latency*2} 毫秒`:''}</div>`;
    const links=mode==='online'?`<button class='secondary-button' data-action='setup'>返回房间</button><button class='secondary-button' data-action='leave'>离开房间</button>`:`<button class='secondary-button' data-action='setup'>返回设置</button><a class='secondary-button' href='./index.html'>返回单机</a>`;
    overlay(`<div class='overlay-symbol ${lost?'loss':''}'>${icon(lost?'retry':'trophy')}</div><span class='eyebrow'>双人对战 · 先进 ${DUEL.goals} 球</span><h3>${title}</h3><div class='result-score'>${s.score[l]}<small> : ${s.score[r]}</small></div><div class='result-subtitle'>${n[l]} ${s.score[l]} : ${s.score[r]} ${n[r]}</div>${syncLine}<button class='primary-button' data-action='retry'>再来一局 ${icon('retry')}</button><div class='result-links'>${links}</div>`);
    input.reset();keysB.clear();
  }else $('overlay').hidden=true;
  if(previous!==screen)queueMicrotask(()=>{if(screen==='paused'||screen==='result')$('overlay-content').querySelector('.primary-button')?.focus({preventScroll:true});else if(screen==='match')$('court').focus({preventScroll:true});});
}
function setupUI(){
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-checked',String(b.dataset.mode===mode));
  for(const b of document.querySelectorAll('[data-latency]'))b.setAttribute('aria-checked',String(Number(b.dataset.latency)===latency));
  for(const b of document.querySelectorAll('[data-sync]'))b.setAttribute('aria-checked',String(b.dataset.sync===sync));
  $('mode-local').hidden=coarse;$('latency-group').hidden=mode!=='ai';$('online-group').hidden=mode!=='online';
  // Online, the host chooses how the match syncs (the guest plays what the start says).
  $('sync-group').hidden=!(mode==='ai'||mode==='online'&&room?.info?.role!=='guest');
  $('duel-keys').innerHTML=mode==='online'?`${coarse?'按住左右箭头移动，点挥击回球；能量够时可放旋转、爆发。':'移动 <b>A / D</b> 或 <b>← / →</b> · 挥击 <b>空格</b> · 旋转 <b>J</b> · 爆发 <b>K</b> · 暂停 <b>Esc</b>'}<br>好友联机：一人创建房间，把房间码或邀请链接发给对方；对方进房后，由房主开始。暂停时两边一起停。`
    :coarse?'按住左右箭头移动，点挥击回球；能量够时可放旋转、爆发。':mode==='ai'
    ?'移动 <b>A / D</b> 或 <b>← / →</b> · 挥击 <b>空格</b> · 旋转 <b>J</b> · 爆发 <b>K</b> · 暂停 <b>Esc</b><br>网络模拟：按往返 ping 计，同一地区朋友之间约 40–80，160 算差的网络。同步方式：「追帧」是现在的做法；「出球放慢」让飞向你的球完整飞完，延迟藏在你打出去的球上；「盲测」每局随机选一种，结束时揭晓。'
    :'<b>近端</b> A / D 移动 · 空格挥击 · Q 旋转 · E 爆发<br><b>远端</b> ← / → 移动 · ↑ 挥击 · , 旋转 · . 爆发<br>两人都按屏幕方向移动和瞄准。';
  $('spin-key').textContent=mode==='local'?'50 · Q':'50 · J';$('burst-key').textContent=mode==='local'?'100 · E':'100 · K';
  roomUI();
}
function hud(){
  const s=stateOf(),n=names(),my=mode==='local'?'a':me(),[l,r]=mode==='local'?['a','b']:[my,foe()],self=s.players[my],active=DUEL_ACTIVE.includes(s.phase),playing=s.phase==='playing';
  $('score-label').textContent=`${n[l]} : ${n[r]}`;$('progress').textContent=`${s.score[l]} : ${s.score[r]}`;$('progress-bar').style.width=`${s.score[l]/DUEL.goals*100}%`;
  $('pause').disabled=!active;$('attack').disabled=!playing;
  $('attack').classList.toggle('recovering',!!self.swing);$('attack').querySelector('span').textContent=self.swing?'收招':'挥击';
  const axis=input.axis(),word=axis<0?'往左 ←':axis>0?'往右 →':'直线 ↑',cue=playing&&!self.swing?duelSwingPreview(s,my,axis):{kind:'none'};
  $('attack').classList.toggle('ready-cue',['clean','perfect'].includes(cue.kind));
  $('attack-hint').textContent=self.swing?'收招中':cue.kind==='perfect'?`重炮时机 · ${word}`:cue.kind==='clean'?`现在挥击 · ${word}`:'看准再出手';
  const by=s.lastGoal?.by,goalWord=mode!=='local'?(by===my?'进球！':'丢球，稳住'):`${n[by]||''}进球！`;
  const status={ready:'热身准备',serving:'发球准备',playing:'对决进行中',goal:goalWord,skill:'爆发蓄力',paused:'已暂停',won:'对战结束'};
  $('court-status').textContent=s.phase==='serving'?`发球倒数 ${Math.max(1,Math.ceil(s.countdown*2))}`:playing&&s.rally>1.001?`对决进行中 · 球速 ×${s.rally.toFixed(2)}`:status[s.phase]||'';
  $('energy-fill').style.width=`${self.energy}%`;$('energy-value').textContent=self.energy;$('energy').setAttribute('aria-valuenow',self.energy);
  // A full bar keeps the burst button lit with its flame (styles.css .charged) until it is spent, as in the club.
  const charged=self.energy>=SKILLS.burst.cost;$('skill-burst').classList.toggle('charged',charged);$('energy').classList.toggle('charged',charged);
  for(const kind of ['spin','burst']){const st=duelSkillStatus(s,my,kind),b=$(`skill-${kind}`),label=SKILL_STATE[st.ok?'ok':st.reason];
    b.classList.toggle('ready',st.ok);b.classList.toggle('low',st.reason==='energy');$(`${kind}-state`).textContent=label;
    b.setAttribute('aria-label',`${kind==='spin'?'旋转回击，消耗50能量':'爆发回击，消耗100能量'}，${label}`);}
  const v=viewOf(),pv=playing&&v.ball.vz<0&&duelSkillStatus(s,my,'spin').reason!=='energy'?v.hints.spinPreview(v,axis):null;$('spin-dir').textContent=pv?(pv.dir==='left'?' ↺':' ↻'):'';
  for(const [id,direction] of [['move-left',-1],['move-right',1]]){const b=$(id),on=input.pressed(direction);b.disabled=!active;b.classList.toggle('pressed',on);b.setAttribute('aria-pressed',String(on));}
  // Online: how the two pages are joined, in the footer (written only when it changes).
  const net=match?.mode==='online'&&room?`${room.link.mode==='direct'?'直连':'中转'} · ping ${Math.round((match.client.clock.rtt??0)*1000)}`:'测试版';
  if($('score').dataset.net!==net){$('score').dataset.net=net;$('score').innerHTML=`对战 <small>${net}</small>`;}
}
function frame(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  if(match&&dt>0)stepMatch(dt);
  events();
  shake*=Math.exp(-dt*9);if(shake<.005||reduceMotion)shake=0;
  phaseUI();hud();court?.render(viewOf(),input.axis(),reduceMotion,shake);requestAnimationFrame(frame);
}

// The court. A duel needs the 3D scene; without WebGL2 (or if the characters fail to load) the page says so.
const booted=()=>{document.body.dataset.booted='1';};
function unsupported(){court=null;$('start-match').disabled=true;say('对战需要 3D 画面，当前设备不支持。');
  overlay(`<div class='duel-unsupported'><h3>对战需要 3D 画面</h3><p>当前设备或浏览器不支持 WebGL2，暂时无法进行对战。</p><a class='primary-button' href='./index.html'>返回单机</a></div>`);booted();}
try{
  const r=create3DRenderer($('court'),undefined,{duel:true});$('court').dataset.renderer='3d';
  r.ready.then(()=>{court=r;uiPhase='';booted();},()=>{r.dispose();unsupported();});
}catch{unsupported();}

document.querySelector('.app').addEventListener('click',e=>{
  const el=e.target.closest('[data-action],[data-mode],[data-latency],[data-sync]');if(!el)return;
  if(el.dataset.mode&&!match){if(el.dataset.mode!=='online')leaveRoom();mode=el.dataset.mode;setupUI();return;}
  if(el.dataset.latency!==undefined&&!match){latency=Number(el.dataset.latency);setupUI();return;}
  if(el.dataset.sync&&!match){sync=el.dataset.sync;setupUI();return;}
  const action=el.dataset.action;
  if(action==='start'&&!match&&court){goFullscreen();if(mode==='online')hostStart();else newMatch();}
  if(action==='resume')resume();
  if(action==='retry'){if(mode==='online')rematch();else newMatch();}
  if(action==='setup'){if(match?.mode==='online')room?.link.control({type:'end',n:match.n});match=null;input.reset();keysB.clear();}
  if(action==='host')openRoom({create:true});
  if(action==='join'){const code=$('join-code').value.trim();if(code)openRoom({code});else $('join-code').focus();}
  if(action==='invite')invite();
  if(action==='leave'){leaveRoom();say('已离开房间。');}
  uiPhase='';phaseUI();hud();
});
$('pause').addEventListener('click',suspend);
$('attack').addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();press(me(),'swing');});
$('attack').addEventListener('click',e=>{if(e.detail===0)press(me(),'swing');});
for(const [id,kind] of [['skill-spin','spin'],['skill-burst','burst']]){
  $(id).addEventListener('pointerdown',e=>{if(!e.isPrimary&&e.pointerType==='mouse')return;e.preventDefault();press(me(),kind);});
  $(id).addEventListener('click',e=>{if(e.detail===0)press(me(),kind);});
}
for(const [id,direction] of [['move-left',-1],['move-right',1]]){
  const button=$(id);
  button.addEventListener('pointerdown',e=>{if(e.button!==0||!match||!DUEL_ACTIVE.includes(match.state.phase))return;e.preventDefault();input.down(e.pointerId,direction);button.setPointerCapture(e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>input.up(e.pointerId));
  button.addEventListener('contextmenu',e=>e.preventDefault());
}
// As in the club (game.js): a long press anywhere (iOS, WeChat) must not open the text menu.
for(const type of ['contextmenu','selectstart'])document.addEventListener(type,e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  const active=!!match&&DUEL_ACTIVE.includes(match.state.phase);if(!active)return;
  if(e.code==='Escape'){suspend();return;}
  const once=fn=>{e.preventDefault();if(!e.repeat)fn();};
  if(mode==='local'){
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();keysB.add(e.key);}
    else if(e.key==='ArrowUp')once(()=>press('b','swing'));
    else if(e.code==='Comma')once(()=>press('b','spin'));
    else if(e.code==='Period')once(()=>press('b','burst'));
    else if(['a','A','d','D'].includes(e.key)){e.preventDefault();input.key(e.key,true);}
    else if(e.code==='Space')once(()=>press('a','swing'));
    else if(e.code==='KeyQ')once(()=>press('a','spin'));
    else if(e.code==='KeyE')once(()=>press('a','burst'));
  }else{
    if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)){e.preventDefault();input.key(e.key,true);}
    else if(e.code==='Space')once(()=>press(me(),'swing'));
    else if(e.code==='KeyJ')once(()=>press(me(),'spin'));
    else if(e.code==='KeyK')once(()=>press(me(),'burst'));
  }
});
window.addEventListener('keyup',e=>{input.key(e.key,false);keysB.delete(e.key);});
// A window losing focus pauses a local match; online it would stop the other player too, so only a hidden page does.
window.addEventListener('blur',()=>{if(match?.mode!=='online')suspend();});
$('join-code').addEventListener('keydown',e=>{if(e.key==='Enter'){const code=e.target.value.trim();if(code)openRoom({code});}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();lastTime=0;});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;setSound(soundOn);$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').innerHTML=`${soundOn?'♪':'♩'} <span>音效${soundOn?'开':'关'}</span>`;if(soundOn)sound('start');else if(navigator.audioSession)navigator.audioSession.type='auto';});

// --- Online (duel-link.mjs) ------------------------------------------------------------------------------------------
// A room joins two pages; the host starts each match (numbered, so nothing from an earlier one reaches a later one) and
// says how it syncs; either player can pause both, and play goes on after the same short hold as the club's resume.
const RESUME_HOLD=.8,TOKENS='rebound-room-tokens';
const ROOM_SAYS={'not-found':'房间不存在或已关闭。',full:'房间已满。',expired:'房间已过期。',origin:'这个页面连不上房间。',rate:'开房太频繁，请稍后再试。',
  busy:'房间正忙，请重试。',token:'房间认不出这台设备，请重新加入。',replaced:'这个位置在别的页面打开了。',gone:'和房间的连接断了。'};
// Each place's token is kept for the tab, so a reload takes the same place back.
const tokens=()=>{try{return JSON.parse(sessionStorage.getItem(TOKENS)||'{}');}catch{return {};}};
function keepToken(id,token){try{sessionStorage.setItem(TOKENS,JSON.stringify({...tokens(),[id]:token}));}catch{}}
function pageUrl(id){const q=new URLSearchParams(location.search);if(id)q.set('room',id);else q.delete('room');const t=q.toString();return `${location.pathname}${t?`?${t}`:''}`;}
function openRoom(join){
  leaveRoom();const link=createLink({join}),r=room={link,info:null,peer:false,n:0,retrying:false};
  link.onMessage((w,at)=>{if(match?.mode==='online'&&w.n===match.n)match.onGame?.(w.m,at);});
  link.onControl(onControl);
  link.onEvent(e=>{
    if(room!==r)return;
    if(e.type==='peer'){r.peer=e.present;r.retrying=false;
      if(match?.mode==='online'){
        // The other player gone mid-match (a pause it made included): play waits for it; back, either can go on.
        if(!e.present){if(DUEL_ACTIVE.includes(match.state.phase))match.client.pause();if(match.state.phase==='paused'){match.pausedBy='gone';match.resumeAt=null;}}
        else if(match.pausedBy==='gone')match.pausedBy='back';
        uiPhase='';
      }}
    if(e.type==='retry')r.retrying=true;
    if(e.type==='closed'){leaveRoom();say(ROOM_SAYS[e.reason]||'房间已关闭。');}
    roomUI();
  });
  link.ready.then(info=>{if(room!==r)return;r.info=info;keepToken(info.id,info.token);history.replaceState(null,'',pageUrl(info.id));setupUI();},()=>{});
  roomUI();
}
function leaveRoom(){
  if(!room)return;room.link.close();room=null;
  if(match?.mode==='online'){match=null;input.reset();uiPhase='';}
  history.replaceState(null,'',pageUrl(null));roomUI();
}
function startOnline({n,sync:used,blind}){
  if(!room?.info)return;room.n=n;input.reset();
  const side=room.info.role==='host'?'a':'b',now=()=>performance.now()/1000;
  const m={mode:'online',me:side,n,sync:used,blind,pending:{[side]:{swing:false,skill:null}},onGame:null,pausedBy:null,resumeAt:null};
  const transport={send:msg=>room?.link.send({n,m:msg}),onMessage:fn=>{m.onGame=fn;},close(){}};
  m.client=createClient({side,transport,now,sync:used});m.state=m.client.state;match=m;m.client.start();
  sound('start');uiPhase='';phaseUI();
}
function hostStart(){
  if(!room?.peer||room.info?.role!=='host'||!court)return;
  const blind=sync==='blind',used=blind?(Math.random()<.5?'catchup':'fullflight'):sync,start={type:'start',n:room.n+1,sync:used,blind};
  room.link.control(start);startOnline(start);
}
// Another match: the host starts it; the guest asks the host's page to.
function rematch(){if(room?.info?.role==='host')hostStart();else if(room?.peer){room.link.control({type:'rematch'});say('已请房主再来一局……');}}
const holdResume=()=>{match.resumeAt=performance.now()/1000+RESUME_HOLD;uiPhase='';};
function onControl(c){
  const same=match?.mode==='online'&&match.n===c.n;
  if(c.type==='start'&&room?.info?.role==='guest')startOnline(c);
  else if(c.type==='pause'&&same&&DUEL_ACTIVE.includes(match.state.phase)){match.client.pause();match.pausedBy='peer';uiPhase='';input.reset();}
  else if(c.type==='resume'&&same&&match.state.phase==='paused'&&!match.resumeAt)holdResume();
  else if(c.type==='end'&&same){match=null;input.reset();uiPhase='';say('对方回到了房间。');}
  else if(c.type==='rematch'&&room?.info?.role==='host')hostStart();
}
function onlinePause(){
  const why=match.resumeAt?['马上继续……','两边一起开始。']:match.pausedBy==='peer'?['对方暂停了','任何一方都可以继续。']:match.pausedBy==='gone'?['对方断开了','正在等对方回来……']:
    match.pausedBy==='back'?['对方回来了','准备好就继续。']:['喘口气，再上。','对方的画面也停了。'];
  const go=!match.resumeAt&&match.pausedBy!=='gone'?`<button class='primary-button' data-action='resume'>继续对战 ${icon('arrow')}</button>`:'';
  return `<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>${why[0]}</h3><p>${why[1]}</p>${go}<div class='pause-actions'><button class='secondary-button' data-action='setup'>返回房间</button><button class='secondary-button' data-action='leave'>离开房间</button></div>`;
}
async function invite(){
  if(!room?.info)return;const url=new URL(pageUrl(room.info.id),location.href).href,text=`房间码 ${room.info.code}，来《反弹守卫》和我对战！`;
  try{if(navigator.share){await navigator.share({title:'反弹守卫 · 好友联机',text,url});return;}}catch(e){if(e?.name==='AbortError')return;}
  try{await navigator.clipboard.writeText(url);say('邀请链接已复制，发给朋友就行。');}catch{say(`把这个链接发给朋友：${url}`);}
}
function roomUI(){
  const inRoom=!!room?.info;$('online-lobby').hidden=!!room;$('online-room').hidden=!inRoom;$('room-code').textContent=room?.info?.code??'-----';
  const host=room?.info?.role==='host',via=room?.link.mode==='direct'?'直连':'中转';
  $('online-status').textContent=!room?'':room.retrying?'连接中断，正在重连……':!inRoom?'正在连接房间……':!room.peer?(host?'把房间码或邀请链接发给朋友，等对方加入……':'对方暂时不在房间里，等对方回来……')
    :host?`对方已进房（${via}），可以开始了。`:`已进房（${via}），等房主开始。`;
  updateStart();
}
function updateStart(){
  const b=$('start-match');let text='开始对战',ok=!match&&!!court;
  if(mode==='online'){if(!room?.info){ok=false;text='先创建或加入房间';}else if(room.info.role!=='host'){ok=false;text='等房主开始';}else if(!room.peer){ok=false;text='等对方加入';}}
  b.disabled=!ok;const label=b.firstChild;if(label?.nodeType===3&&label.textContent!==`${text} `)label.textContent=`${text} `;
}
// An invite link (?room=<id>) opens the page in the room, taking back this tab's place if it had one.
{const id=new URLSearchParams(location.search).get('room');if(id){mode='online';openRoom({room:id,token:tokens()[id]??null});}}

setupUI();phaseUI();hud();requestAnimationFrame(frame);
