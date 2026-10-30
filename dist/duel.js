// Duel page (P0, on one device). Against the duel bot: two copies of the match joined by a loopback that can simulate
// network latency (duel-net.mjs), the bot playing the far copy from its own view, this page showing the near one. The
// copies sync the way chosen (duel-net.mjs `sync`); a blind run picks one at random and names it only on the result
// screen, so the two can be compared without knowing which is which. Two players on one keyboard: one copy decided for
// both. With friends online: a room (duel-link.mjs) holds up to 8; the two on the court each run their own copy for
// their own player, as the far copy does against the bot, the room calls each match once both are ready, and pauses
// are shared. Everyone else watches the match replayed a second behind (duel-net.mjs createWatcher). The court is the
// club's 3D scene in duel mode (duel-view.mjs).
import {SKILLS} from './core.mjs';
import {DUEL,DUEL_ACTIVE,createDuel,startDuel,stepDuel,duelAttack,duelSkill,duelSkillStatus,duelSwingPreview,pauseDuel,resumeDuel} from './duel-core.mjs';
import {viewFor} from './duel-view.mjs';
import {createLoopback,createClient,createWatcher} from './duel-net.mjs';
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
// The side this page's player plays: A against the bot and on one keyboard, the side the room gives it online.
// Watching, both sides are shown with their names, as on one keyboard, from the side being watched from.
const me=()=>match?.me??'a',foe=()=>me()==='a'?'b':'a';
const watching=()=>match?.mode==='watch',shared=()=>mode==='local'||watching();
const names=()=>mode==='local'?{a:'近端',b:'远端'}:watching()?match.names:{[me()]:'我',[foe()]:match?.foeName||'对手'};
const SYNC_NAMES={catchup:'追帧',fullflight:'出球放慢'};
const axisB=()=>(keysB.has('ArrowLeft')?1:0)-(keysB.has('ArrowRight')?1:0);
const stateOf=()=>match?match.state:idle;
const viewOf=()=>match?.mode==='ai'?match.a.view():match?.mode==='online'?match.client.view():watching()?match.watcher.view(match.view):viewFor(stateOf(),'a');

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
  if(!match||watching()||(mode!=='local'&&side!==me()))return;const s=match.state;
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
    if(match.resumeAt&&performance.now()/1000>=match.resumeAt){match.resumeAt=null;match.pausedBy=null;match.client.resume();note('resume');uiPhase='';}
    // Over: what is left of the feed goes (its last goal tells the room who won).
    if(match.state.phase==='won'&&!match.fed){match.fed=true;room?.link.feedStop();}
  // A watched match the room ended before its last goal (onResult) stops there: what is left of its replay stays unplayed.
  }else if(match.mode==='watch'){if(match.state.phase!=='won')match.watcher.step();}
  else{
    const s=match.state,axes={a:input.axis(),b:axisB()};
    for(const side of ['a','b']){const q=p[side];if(q.skill)duelSkill(s,side,q.skill,axes[side]);else if(q.swing)duelAttack(s,side);q.swing=false;q.skill=null;}
    stepDuel(s,dt,{a:{axis:axes.a},b:{axis:axes.b}});
  }
}
function suspend(){
  if(!match||watching()||!DUEL_ACTIVE.includes(match.state.phase))return;
  if(match.mode==='online'){room?.link.control({type:'pause',n:match.n});match.client.pause();note('pause');match.pausedBy='me';uiPhase='';}
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
  const s=stateOf(),n=names(),both=shared(),my=watching()?match.view:me();
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
function screenFor(phase){if(watching())return phase==='won'?'result':phase==='paused'?'paused':'match';return phase==='ready'?'ready':phase==='paused'?'paused':phase==='won'?'result':'match';}
function phaseUI(){
  const s=stateOf(),phase=s.phase;if(phase===uiPhase)return;uiPhase=phase;
  const previous=document.body.dataset.screen,screen=screenFor(phase);document.body.dataset.screen=screen;
  document.body.toggleAttribute('data-watch',watching());$('watch-bar').hidden=!watching();
  $('stage-name').textContent=watching()?`观战 · ${match.names.a} 对 ${match.names.b}`:`先进 ${DUEL.goals} 球获胜`;
  updateStart();
  if(phase==='paused'&&match?.mode==='online')overlay(onlinePause());
  else if(phase==='paused'&&watching())overlay(`<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>场上暂停了</h3><p>等他们继续。</p><div class='pause-actions'><button class='secondary-button' data-action='setup'>返回房间</button></div>`);
  else if(phase==='paused')overlay(`<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>喘口气，再上。</h3><p>比分和球都会保留。</p><button class='primary-button' data-action='resume'>继续对战 ${icon('arrow')}</button><div class='pause-actions'><button class='secondary-button' data-action='retry'>重新开始</button><button class='secondary-button' data-action='setup'>返回设置</button></div>`);
  else if(phase==='won'){
    const n=names(),win=s.winner,both=shared(),lost=!both&&win!==me(),title=both?`${n[win]}获胜`:lost?'对手赢了':'你赢了',[l,r]=both?['a','b']:[me(),foe()];
    const syncLine=mode==='local'||watching()?'':`<div class='result-subtitle' id='result-sync'>${match.blind?'盲测揭晓：这局用的是':'同步方式：'}「${SYNC_NAMES[match.sync]}」${mode==='ai'?` · 往返 ${latency*2} 毫秒`:''}</div>`;
    const why=match.how&&match.how!=='score'?`<div class='result-subtitle' id='result-why'>${esc(whyLine(match.how,win,both,n))}</div>`:'';
    const next=mode==='online'?nextInRoom():null;
    const go=next?next.button:`<button class='primary-button' data-action='retry'>再来一局 ${icon('retry')}</button>`;
    const links=mode==='online'?`${next?.back??''}<button class='secondary-button' data-action='leave'>离开房间</button>`:`<button class='secondary-button' data-action='setup'>返回设置</button><a class='secondary-button' href='./index.html'>返回单机</a>`;
    overlay(`<div class='overlay-symbol ${lost?'loss':''}'>${icon(lost?'retry':'trophy')}</div><span class='eyebrow'>双人对战 · 先进 ${DUEL.goals} 球</span><h3>${esc(title)}</h3><div class='result-score'>${s.score[l]}<small> : ${s.score[r]}</small></div><div class='result-subtitle'>${esc(n[l])} ${s.score[l]} : ${s.score[r]} ${esc(n[r])}</div>${why}${syncLine}${next?.line??''}${go}<div class='result-links'>${links}</div>`);
    input.reset();keysB.clear();
  }else $('overlay').hidden=true;
  if(previous!==screen)queueMicrotask(()=>{if(screen==='paused'||screen==='result')$('overlay-content').querySelector('.primary-button')?.focus({preventScroll:true});else if(screen==='match')$('court').focus({preventScroll:true});});
}
function setupUI(){
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-checked',String(b.dataset.mode===mode));
  for(const b of document.querySelectorAll('[data-latency]'))b.setAttribute('aria-checked',String(Number(b.dataset.latency)===latency));
  // Online, the room's owner chooses how matches sync and who leaves the court after one; the others see the choice.
  const rules=mode==='online'?room?.snap?.rules:null;
  for(const b of document.querySelectorAll('[data-sync]'))b.setAttribute('aria-checked',String(b.dataset.sync===(rules?.sync??sync)));
  for(const b of document.querySelectorAll('[data-rotation]'))b.setAttribute('aria-checked',String(b.dataset.rotation===rules?.rotation));
  // The bot's network and sync choices are folded into 测试选项; online, the owner's sync choice is in the room's settings.
  $('mode-local').hidden=coarse;$('test-options').hidden=mode!=='ai';$('online-group').hidden=mode!=='online';
  const keys=coarse?'按住左右箭头移动，点挥击回球；能量够时可放旋转、爆发。':'移动 <b>A / D</b> 或 <b>← / →</b> · 挥击 <b>空格</b> · 旋转 <b>J</b> · 爆发 <b>K</b> · 暂停 <b>Esc</b>';
  $('duel-keys').hidden=mode==='online';
  $('duel-keys').innerHTML=mode==='local'?'<b>近端</b> A / D 移动 · 空格挥击 · Q 旋转 · E 爆发<br><b>远端</b> ← / → 移动 · ↑ 挥击 · , 旋转 · . 爆发<br>两人都按屏幕方向移动和瞄准。':keys;
  $('test-note').innerHTML='网络模拟：按往返 ping 计，同一地区朋友之间约 40–80，160 算差的网络。同步方式：「追帧」是现在的做法；「出球放慢」让飞向你的球完整飞完，延迟藏在你打出去的球上；「盲测」每局随机选一种，结束时揭晓。';
  $('room-keys').innerHTML=`${keys}<br>场上两人对打，两人都点「准备」就开局；其他人在候场排队等上场，或者在看台观战。一局打完按房主定的规则换人。暂停时场上两人一起停。`;
  $('spin-key').textContent=mode==='local'?'50 · Q':'50 · J';$('burst-key').textContent=mode==='local'?'100 · E':'100 · K';
  roomUI();
}
function hud(){
  const s=stateOf(),n=names(),both=shared(),my=mode==='local'?'a':watching()?match.view:me(),[l,r]=both?['a','b']:[my,foe()],self=s.players[my],active=DUEL_ACTIVE.includes(s.phase)&&!watching(),playing=s.phase==='playing'&&!watching();
  $('score-label').textContent=`${n[l]} : ${n[r]}`;
  // Watching, the score's slot for the match length names the two instead (the label above it is hidden on a phone).
  const vs=watching()?`${n.a} : ${n.b}`:`先进 ${DUEL.goals} 球`;if($('hearts').textContent!==vs)$('hearts').textContent=vs;$('progress').textContent=`${s.score[l]} : ${s.score[r]}`;$('progress-bar').style.width=`${s.score[l]/DUEL.goals*100}%`;
  $('pause').disabled=!active;$('attack').disabled=!playing;
  $('attack').classList.toggle('recovering',!!self.swing);$('attack').querySelector('span').textContent=self.swing?'收招':'挥击';
  const axis=input.axis(),word=axis<0?'往左 ←':axis>0?'往右 →':'直线 ↑',cue=playing&&!self.swing?duelSwingPreview(s,my,axis):{kind:'none'};
  $('attack').classList.toggle('ready-cue',['clean','perfect'].includes(cue.kind));
  $('attack-hint').textContent=self.swing?'收招中':cue.kind==='perfect'?`重炮时机 · ${word}`:cue.kind==='clean'?`现在挥击 · ${word}`:'看准再出手';
  const by=s.lastGoal?.by,goalWord=!both?(by===my?'进球！':'丢球，稳住'):`${n[by]||''}进球！`;
  const status={ready:watching()?'等下一次发球':'热身准备',serving:'发球准备',playing:'对决进行中',goal:goalWord,skill:'爆发蓄力',paused:'已暂停',won:'对战结束'};
  $('court-status').textContent=s.phase==='serving'?`发球倒数 ${Math.max(1,Math.ceil(s.countdown*2))}`:s.phase==='playing'&&s.rally>1.001?`对决进行中 · 球速 ×${s.rally.toFixed(2)}`:status[s.phase]||'';
  $('energy-fill').style.width=`${self.energy}%`;$('energy-value').textContent=self.energy;$('energy').setAttribute('aria-valuenow',self.energy);
  // A full bar keeps the burst button lit with its flame (styles.css .charged) until it is spent, as in the club.
  const charged=self.energy>=SKILLS.burst.cost;$('skill-burst').classList.toggle('charged',charged);$('energy').classList.toggle('charged',charged);
  for(const kind of ['spin','burst']){const st=duelSkillStatus(s,my,kind),b=$(`skill-${kind}`),label=SKILL_STATE[st.ok?'ok':st.reason];
    b.classList.toggle('ready',st.ok);b.classList.toggle('low',st.reason==='energy');$(`${kind}-state`).textContent=label;
    b.setAttribute('aria-label',`${kind==='spin'?'旋转回击，消耗50能量':'爆发回击，消耗100能量'}，${label}`);}
  const v=viewOf(),pv=playing&&v.ball.vz<0&&duelSkillStatus(s,my,'spin').reason!=='energy'?v.hints.spinPreview(v,axis):null;
  if(mode==='online')onlineStatus();$('spin-dir').textContent=pv?(pv.dir==='left'?' ↺':' ↻'):'';
  for(const [id,direction] of [['move-left',-1],['move-right',1]]){const b=$(id),on=input.pressed(direction);b.disabled=!active;b.classList.toggle('pressed',on);b.setAttribute('aria-pressed',String(on));}
  // Online: how the two pages are joined, in the footer (written only when it changes).
  const net=match?.mode==='online'&&room?`${room.link.mode==='direct'?'直连':'中转'} · ping ${Math.round((match.client.clock.rtt??0)*1000)}`:watching()?'观战中 · 晚 1 秒':'测试版';
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
  const el=e.target.closest('[data-action],[data-mode],[data-latency],[data-sync],[data-rotation]');if(!el)return;
  if(el.dataset.mode&&!match){if(el.dataset.mode!=='online')leaveRoom();mode=el.dataset.mode;setupUI();return;}
  if(el.dataset.latency!==undefined&&!match){latency=Number(el.dataset.latency);setupUI();return;}
  if(el.dataset.sync&&!match){if(mode==='online'){if(isOwner())room.link.command({type:'rules',sync:el.dataset.sync});return;}sync=el.dataset.sync;setupUI();return;}
  if(el.dataset.rotation){if(isOwner())room.link.command({type:'rules',rotation:el.dataset.rotation});return;}
  const action=el.dataset.action;
  if(action==='start'){if(mode==='online')roomAct($('start-match').dataset.go);else if(court&&!match){goFullscreen();newMatch();}}
  if(action==='resume')resume();
  if(action==='retry'){if(mode==='online')readyUp();else newMatch();}
  if(action==='setup')backToRoom();
  if(action==='host')openRoom({create:true,v:2,name:typedName()});
  if(action==='join'){const code=$('join-code').value.trim();if(code)openRoom({code,name:typedName()});else $('join-code').focus();}
  if(action==='invite')invite();
  // Leaving takes a second tap within 3 s: the button says so in the meantime (the room keeps no place for a mis-tap).
  if(action==='leave'){const t=performance.now();
    if(t-leaveArmed<3000){leaveArmed=0;leaveRoom();say('已离开房间。');}
    else{leaveArmed=t;el.dataset.label??=el.textContent;el.textContent='再点一次离开';el.classList.add('confirm');
      setTimeout(()=>{el.textContent=el.dataset.label;el.classList.remove('confirm');},3000);}}
  if(action==='copy-code')copyCode();
  if(action==='rename-open'){const row=$('room-rename'),box=$('rename-input');row.hidden=!row.hidden;if(!row.hidden){box.value=nameOf(myId());box.focus();box.select();}}
  if(action==='ready')readyUp();
  if(action==='queue')room?.link.command({type:'queue'});
  if(action==='unqueue')room?.link.command({type:'watch'});
  if(action==='watch-match'&&room){room.skipWatch=null;arenaSync();}
  if(action==='rename')rename();
  if(action==='end-match'&&match?.mode==='online')room?.link.command({type:'end',n:match.n});
  if(action==='swap-view'&&watching())match.view=match.view==='a'?'b':'a';
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
  const active=!!match&&!watching()&&DUEL_ACTIVE.includes(match.state.phase);if(!active)return;
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
$('join-code').addEventListener('keydown',e=>{if(e.key==='Enter'){const code=e.target.value.trim();if(code)openRoom({code,name:typedName()});}});
// The code box is one input drawn as five: each shows a character of the code as the room reads it (no case, spaces or dashes).
$('join-code').addEventListener('input',()=>{const v=$('join-code').value.toUpperCase().replace(/[\s-]/g,'').slice(0,5);
  $('code-boxes').querySelectorAll('span').forEach((b,i)=>{b.textContent=v[i]??'';b.classList.toggle('next',i===Math.min(v.length,4));});});
$('rename-input').addEventListener('keydown',e=>{if(e.key==='Enter')rename();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();lastTime=0;});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;setSound(soundOn);$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').innerHTML=`${soundOn?'♪':'♩'} <span>音效${soundOn?'开':'关'}</span>`;if(soundOn)sound('start');else if(navigator.audioSession)navigator.audioSession.type='auto';});

// --- Online (duel-link.mjs, arena rooms) -----------------------------------------------------------------------------
// A room (server/room.mjs) holds up to 8. The two on the court play: the room calls each match once both say ready
// (numbered, so nothing from an earlier one reaches a later one), keeps the score from their feed and, the match over,
// turns the court over by the owner's rule. Either player can pause both, and play goes on after the same short hold as
// the club's resume. Everyone off the court watches the match being played, replayed a second behind, from 甲's side or,
// at a tap, 乙's.
const RESUME_HOLD=.8,TOKENS='rebound-room-tokens',NAME='rebound-duel-name';
// When a 离开 button was first tapped (the second tap within 3 s leaves).
let leaveArmed=0;
const ROOM_SAYS={'not-found':'房间不存在或已关闭。',full:'房间已满（最多 8 人）。',expired:'房间已过期。',origin:'这个页面连不上房间。',rate:'开房太频繁，请稍后再试。',
  busy:'房间正忙，请重试。',token:'房间认不出这台设备，请重新加入。',replaced:'这个位置在别的页面打开了。',gone:'和房间的连接断了。',bye:'已离开房间。'};
const ROTATIONS={loser:'输的下',winner:'赢的下',both:'两个都下'},HOW={forfeit:'掉线判负',ended:'房主结束了这一局',left:'有人中途下场'};
// Why a match ended before its last goal (the room's result `how`), as its result screen says it: a player calls the
// other 对方 and itself 你; watching, both are named.
const WHY={left:'离开了对局',forfeit:'掉线太久',ended:'掉线后房主结束了比赛'};
function whyLine(how,win,both,n){const lose=win==='a'?'b':'a';return !WHY[how]?'':both?`${n[lose]}${WHY[how]}，判${n[win]}赢。`:win===me()?`对方${WHY[how]}，判你赢。`:`你${WHY[how]}，这一局判负。`;}
// Each place's token is kept for the tab, so a reload takes the same place back; the name, for the next room on this device.
const tokens=()=>{try{return JSON.parse(sessionStorage.getItem(TOKENS)||'{}');}catch{return {};}};
function keepToken(id,token){try{sessionStorage.setItem(TOKENS,JSON.stringify({...tokens(),[id]:token}));}catch{}}
const savedName=()=>{try{return localStorage.getItem(NAME)||'';}catch{return '';}};
function keepName(name){try{localStorage.setItem(NAME,name);}catch{}}
const typedName=()=>{const v=$('online-name').value.trim();keepName(v);return v||null;};
function pageUrl(id){const q=new URLSearchParams(location.search);if(id)q.set('room',id);else q.delete('room');const t=q.toString();return `${location.pathname}${t?`?${t}`:''}`;}
// Names are other people's: written as text, or escaped where a screen is built as HTML.
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const myId=()=>room?.info?.member??null;
const nameOf=id=>room?.snap?.members.find(m=>m.id===id)?.name??'';
const courtSide=()=>{const c=room?.snap?.court,id=myId();return !c||!id?null:c.a===id?'a':c.b===id?'b':null;};
const isOwner=()=>!!room?.snap&&room.snap.owner===myId();
// This player's pauses and resumes go into the feed too, on its match clock, for whoever watches.
const note=type=>{if(match?.mode==='online')room?.link.feedPush({type,t:performance.now()/1000});};
// Seconds left for the two called to say ready (null while nobody is queued behind them).
const readyLeft=()=>{const m=room?.snap?.match;return m?.phase!=='ready'||m.readyIn==null?null:Math.max(0,Math.ceil(m.readyIn-(performance.now()/1000-room.snapAt)));};
$('online-name').value=savedName();

function openRoom(join){
  // rejoin: this page taking its place back by token (it was loaded again), looked at on the first snapshot (giveUp);
  // notice: what the room's line says first, until the next match.
  leaveRoom();const link=createLink({join}),r=room={link,info:null,snap:null,snapAt:0,peer:false,n:0,retrying:false,early:[],skipWatch:null,rejoin:!!join.token,notice:''};
  // A match's messages from a player who heard the room call it first wait for this page to start it.
  link.onMessage((w,at)=>{if(match?.mode==='online'&&w.n===match.n)match.onGame?.(w.m,at);else if(w.n>r.n&&r.early.length<600)r.early.push({w,at});});
  link.onControl(onControl);
  link.onEvent(e=>{
    if(room!==r)return;
    // A snapshot comes on every join, so it also means the room is back after a drop (off the court no peer message says so).
    if(e.type==='room'){r.snap=e;r.snapAt=performance.now()/1000;r.retrying=false;if(r.rejoin&&r.info){r.rejoin=false;giveUp();}arenaSync();if(match?.state.phase==='won')uiPhase='';setupUI();}
    if(e.type==='start')startArena(e);
    if(e.type==='result')onResult(e);
    if(e.type==='feed'&&watching()&&e.n===match.n)match.watcher.push({side:e.side,msgs:e.msgs,o:e.o,at:performance.now()/1000});
    if(e.type==='peer'){r.peer=e.present;r.retrying=false;
      if(match?.mode==='online'){
        // The other player gone mid-match (a pause it made included): play waits for it; back, either can go on.
        if(!e.present){if(DUEL_ACTIVE.includes(match.state.phase)){match.client.pause();note('pause');}if(match.state.phase==='paused'){match.pausedBy='gone';match.resumeAt=null;}}
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
  if(match?.mode==='online'||watching()){match=null;input.reset();uiPhase='';}
  history.replaceState(null,'',pageUrl(null));roomUI();
}
// The room calls a match this page plays: its own copy, sending its messages to the other player and into the feed.
function startArena({n,sync:used,blind,a,b}){
  const id=myId(),side=a===id?'a':b===id?'b':null;if(!room||!side)return;
  room.n=n;room.notice='';input.reset();
  const now=()=>performance.now()/1000;
  const m={mode:'online',me:side,n,sync:used,blind,foeName:nameOf(side==='a'?b:a),pending:{[side]:{swing:false,skill:null}},onGame:null,pausedBy:null,resumeAt:null,fed:false};
  const transport={send:msg=>{room?.link.send({n,m:msg});room?.link.feedPush(msg);},onMessage:fn=>{m.onGame=fn;},close(){}};
  m.client=createClient({side,transport,now,sync:used});m.state=m.client.state;match=m;
  room.link.feedStart(n,()=>m.client.synced?m.client.clock.offset:null);
  const early=room.early.filter(x=>x.w.n===n);room.early=room.early.filter(x=>x.w.n>n);for(const x of early)m.onGame?.(x.w.m,x.at);
  m.client.start();sound('start');uiPhase='';phaseUI();
}
// Off the court, a match being played is watched (on coming in, too), unless this page left it for the room's panel; a
// match this page played or watched, once over, gives way to the next one.
function arenaSync(){
  const mm=room?.snap?.match;if(!mm||!court||mm.phase!=='playing'||courtSide()||room.skipWatch===mm.n)return;
  if(!match||match.n!==mm.n&&(watching()||match.mode==='online'&&match.state.phase==='won'))startWatch();
}
function startWatch(){
  const s=room.snap,mm=s.match,w=createWatcher({now:()=>performance.now()/1000,score:mm.score});input.reset();room.notice='';
  match={mode:'watch',n:mm.n,view:'a',names:{a:nameOf(s.court.a)||'甲方',b:nameOf(s.court.b)||'乙方'},ids:{...s.court},watcher:w,state:w.state};
  uiPhase='';phaseUI();
}
// A match over, as the room has it. One this page plays or watches that the room ended before its last goal (a player
// left, or was gone too long) ends here as well, and its result screen says why; anyone not watching it hears who won.
function onResult(e){
  if(match?.mode==='online'&&match.n===e.n){
    const s=match.state;match.how=e.how;if(s.phase!=='won'){s.phase='won';s.winner=e.winner===myId()?match.me:foe();uiPhase='';}
    if(!match.fed){match.fed=true;room?.link.feedStop();}
    return;
  }
  // Watching it: the replay, a second behind, ends on the room's score (one played out ends on its own last goal).
  if(watching()&&match.n===e.n){if(e.how!=='score'){const s=match.state;match.how=e.how;s.score={...e.score};s.winner=e.winner===match.ids.a?'a':'b';s.phase='won';uiPhase='';}return;}
  say(`第 ${e.n} 局：${nameOf(e.winner)||'有人'}获胜（${e.score.a} : ${e.score.b}）${e.how==='score'?'':` · ${HOW[e.how]}`}`);
}
// Back in the room after this page was loaded again mid-match (a reload, or the phone's system dropping a page left in
// the background): it has no copy of the match to go on with, so it gives the match up at once, as stepping off the
// court does, and queues for the next one (with nobody queued, that is straight back on the court). Only on the first
// snapshot: later on, being on the court in a match with none here also happens to a winner back on the room's panel
// before the loser's last goal has reached the room.
function giveUp(){
  const mm=room.snap.match;if(!courtSide()||mm.phase!=='playing')return;
  room.link.command({type:'watch'});room.link.command({type:'queue'});room.notice='你离开了对局，这一局判负。';
}
// Back to the room's panel. From a match this page plays that is not over: stepping off the court, which loses it.
// From watching: until the next match.
function backToRoom(){
  if(match?.mode==='online'){if(match.state.phase!=='won')room?.link.command({type:'watch'});if(!match.fed){match.fed=true;room?.link.feedStop();}}
  if(watching()&&room)room.skipWatch=match.n;
  match=null;input.reset();keysB.clear();
  if(mode==='online')arenaSync();
}
function readyUp(){
  const m=room?.snap?.match;if(!m||m.phase!=='ready'||!courtSide()||m.ready.includes(myId()))return;
  room.link.command({type:'ready',n:m.n});if(match?.state.phase==='won')match=null;input.reset();uiPhase='';
}
// The panel's main button (roomGo says which it is now).
function roomAct(go){
  if(go==='ready'&&court){goFullscreen();readyUp();}
  else if(go==='watch-match'&&court&&room){room.skipWatch=null;arenaSync();}
  else if(go==='invite')invite();
  else if(go==='queue')room?.link.command({type:'queue'});
}
function rename(){const v=$('rename-input').value.trim();keepName(v);$('online-name').value=v;room?.link.command({type:'name',name:v});$('room-rename').hidden=true;}
async function copyCode(){
  const code=room?.info?.code,chip=document.querySelector('.room-code');if(!code)return;
  try{await navigator.clipboard.writeText(code);chip.classList.add('copied');setTimeout(()=>chip.classList.remove('copied'),1500);}catch{say(`房间码：${code}`);}
}
const holdResume=()=>{match.resumeAt=performance.now()/1000+RESUME_HOLD;uiPhase='';};
function onControl(c){
  const same=match?.mode==='online'&&match.n===c.n;
  if(c.type==='pause'&&same&&DUEL_ACTIVE.includes(match.state.phase)){match.client.pause();note('pause');match.pausedBy='peer';uiPhase='';input.reset();}
  else if(c.type==='resume'&&same&&match.state.phase==='paused'&&!match.resumeAt)holdResume();
}
function onlinePause(){
  const why=match.resumeAt?['马上继续……','两边一起开始。']:match.pausedBy==='peer'?['对方暂停了','任何一方都可以继续。']:match.pausedBy==='gone'?['对方断开了','正在等对方回来……']:
    match.pausedBy==='back'?['对方回来了','准备好就继续。']:['喘口气，再上。','对方的画面也停了。'];
  const go=!match.resumeAt&&match.pausedBy!=='gone'?`<button class='primary-button' data-action='resume'>继续对战 ${icon('arrow')}</button>`:'';
  const gone=match.pausedBy==='gone'?'<br>有人排队时，30 秒后判对方输；没人排队时，房主可以结束这一局。':'';
  const end=match.pausedBy==='gone'&&isOwner()?`<button class='secondary-button' data-action='end-match'>结束这一局</button>`:'';
  return `<div class='overlay-symbol'>${icon('shield')}</div><span class='eyebrow'>暂停</span><h3>${why[0]}</h3><p>${why[1]}${gone}</p>${go}<div class='pause-actions'>${end}<button class='secondary-button' data-action='setup'>下场（判输）</button><button class='secondary-button' data-action='leave'>离开房间</button></div>`;
}
// After a match this page played or watched: ready for the next one if it is on the court, else where it stands.
function nextInRoom(){
  const s=room?.snap,back=`<button class='primary-button' data-action='setup'>返回房间 ${icon('arrow')}</button>`;if(!s)return {button:back};
  const mm=s.match,side=courtSide(),vs=s.court.a&&s.court.b?`<div class='result-subtitle'>下一局：${esc(nameOf(s.court.a))} 对 ${esc(nameOf(s.court.b))}</div>`:'';
  if(side&&mm.phase==='ready')return {line:vs,back:`<button class='secondary-button' data-action='unqueue'>下场观战</button>`,
    button:mm.ready.includes(myId())?`<button class='primary-button' disabled>已准备，等对方</button>`:`<button class='primary-button' data-action='ready'>准备下一局 ${icon('arrow')}</button>`};
  const pos=s.queue.indexOf(myId());
  return {line:vs+(pos>=0?`<div class='result-subtitle'>你排在第 ${pos+1} 位</div>`:''),button:back};
}
async function invite(){
  if(!room?.info)return;const url=new URL(pageUrl(room.info.id),location.href).href,text=`房间码 ${room.info.code}，来《反弹守卫》和我对战！`;
  try{if(navigator.share){await navigator.share({title:'反弹守卫 · 好友联机',text,url});return;}}catch(e){if(e?.name==='AbortError')return;}
  try{await navigator.clipboard.writeText(url);say('邀请链接已复制，发给朋友就行。');}catch{say(`把这个链接发给朋友：${url}`);}
}
// The room's panel (body[data-room], from the moment a room is opened): the court, the queue and the stands, whose names
// are other people's and so always written as text; this player's own name is a button that opens the rename box.
// Avatars are each member's initial (the number, for a 玩家 N) on a colour kept by its place in the room.
const AVATAR=['#ff9a5a','#4fe0cf','#ffd23a','#ff8fb1','#8fb6ff','#b79bff','#7ee08a','#ffb38a'];
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
function avatar(m,cls){
  const e=node('span',cls,/^玩家 (\d+)$/.exec(m.name)?.[1]??Array.from(m.name||'?')[0]);e.setAttribute('aria-hidden','true');
  e.style.setProperty('--c',AVATAR[((parseInt(String(m.id).replace(/\D/g,''),10)||1)-1)%AVATAR.length]);return e;
}
function nameButton(m,cls){
  if(m.id!==myId())return node('span',cls,m.name);
  const b=node('button',cls,m.name);b.type='button';b.dataset.action='rename-open';b.setAttribute('aria-label',`${m.name}（我），点一下改名`);return b;
}
function roomUI(){
  const s=room?.snap;document.body.toggleAttribute('data-room',!!room);
  $('online-lobby').hidden=!!room;$('online-room').hidden=!room;$('room-code').textContent=room?.info?.code??'-----';$('room-arena').hidden=!s;
  if(s)roomPanel(s);
  onlineStatus();
}
function roomPanel(s){
  const mine=myId(),mm=s.match,byId=id=>s.members.find(m=>m.id===id),ready=id=>mm.phase==='ready'&&mm.ready.includes(id);
  $('room-count').textContent=`${s.members.length}/${s.max}`;
  // The court: 守擂 (side a, who stays on) on the left, 攻擂 on the right; an empty side waits for someone to come in.
  const arena=$('room-arena');arena.classList.toggle('waiting',!(s.court.a&&s.court.b));
  $('arena-cap').textContent=s.court.a&&s.court.b?`第 ${mm.n} 局 · 先进 ${DUEL.goals} 球`:'等人进来';
  for(const side of ['a','b']){
    const el=arena.querySelector(`[data-side="${side}"]`),m=byId(s.court[side]);el.textContent='';
    if(!m){el.className='slot empty';el.append(node('span','slot-av','+'),node('b','slot-name','空位'),node('span','slot-state','等朋友进来'));continue;}
    el.className=`slot${m.id===mine?' me':''}${m.present?'':' away'}`;
    const av=avatar(m,'slot-av');if(m.id===s.owner)av.append(node('i','crown','房主'));
    const state=!m.present?'掉线':ready(m.id)?'✓ 已准备':mm.phase==='ready'?'还没准备':mm.phase==='playing'?'对局中':'';
    el.append(av,nameButton(m,'slot-name'),node('span','slot-tag',`${m.id===mine?'你 · ':''}${side==='a'?'守擂':'攻擂'}`),node('span',`slot-state${ready(m.id)?' ok':''}`,state));
  }
  // Alone in it, the code is what is needed: big, with how a friend gets in.
  $('room-code-card').hidden=s.members.length>1;$('room-code-big').textContent=s.code;
  // The queue, in order (the first one is next on), and the stands.
  const queue=s.queue.map(byId).filter(Boolean),stands=s.members.filter(m=>m.role==='watch');
  $('room-queue').hidden=!queue.length;$('queue-count').textContent=queue.length;$('room-stands').hidden=!stands.length;$('stands-count').textContent=stands.length;
  const ql=$('queue-list'),sl=$('stands-list');ql.textContent='';sl.textContent='';
  queue.forEach((m,i)=>{
    const li=node('li',`${m.id===mine?'me':''}${m.present?'':' away'}`,'');li.append(node('span','q-num',String(i+1)),avatar(m,'mini-av'),nameButton(m,'q-name'));
    if(!m.present)li.append(node('span','q-tag away','掉线'));else if(i===0)li.append(node('span','q-tag','下一个'));
    if(m.id===mine)li.append(node('span','q-tag you','你'));ql.append(li);
  });
  for(const m of stands){const li=node('li',`${m.id===mine?'me':''}${m.present?'':' away'}`,'');li.append(avatar(m,'mini-av'),nameButton(m,'q-name'));sl.append(li);}
  // The rules: the owner changes them in the folded settings; the others see one line.
  const owner=isOwner(),line=owner?$('rules-line'):node('span','','');
  line.replaceChildren(node('span','','规则 '),node('b','',ROTATIONS[s.rules.rotation]),node('span','',` · ${SYNC_NAMES[s.rules.sync]??'盲测'}`));
  $('room-settings').hidden=!owner;$('room-rules').hidden=owner;if(!owner)$('room-rules').replaceChildren(line,node('small','','房主定'));
}
// The room's line, the main button and the court's ring, kept up to date every frame (they count down the seconds left
// to say ready).
function onlineStatus(){setText($('online-status'),(room?.notice??'')+statusText());updateStart();readyRing();}
// READY_WAIT: the seconds the two called have to say ready once someone is queued (server/room.mjs ROOM.readyWait).
const READY_WAIT=15,RING=119.4;
function readyRing(){
  const left=readyLeft(),ring=$('ready-ring');ring.hidden=left===null;if(left===null)return;
  setText($('ready-left'),String(left));$('ring-left').style.strokeDashoffset=String(RING*(1-left/READY_WAIT));
}
function statusText(){
  if(!room)return '';if(room.retrying)return '连接中断，正在重连……';if(!room.info)return '正在连接房间……';
  const s=room.snap;if(!s)return room.info.v===2?'正在进房……':'这个房间是旧版页面开的，请房主刷新页面后重新开房。';
  const mm=s.match,side=courtSide(),vs=`${nameOf(s.court.a)} 对 ${nameOf(s.court.b)}`,left=readyLeft(),via=room.link.mode==='direct'?'直连':'中转';
  if(side){
    const opp=nameOf(s.court[side==='a'?'b':'a']);
    if(mm.phase==='idle')return '等对手进房……把房间码或邀请链接发给朋友。';
    if(mm.phase==='ready')return mm.ready.includes(myId())?`已准备（${via}），等${opp}准备${left!==null?` · 还剩 ${left} 秒`:''}`
      :`轮到你上场，对手是${opp}（${via}）。点「准备」开打${left!==null?`，还剩 ${left} 秒`:''}`;
    return `对局中：${vs}`;
  }
  const pos=s.queue.indexOf(myId()),where=pos>=0?`排队中，第 ${pos+1} 位`:'观战中';
  return mm.phase==='playing'?`${where} · 场上：${vs}`:mm.phase==='ready'?`${where} · 下一局：${vs}`:`${where} · 等人上场`;
}
// What this player can do in the room now: the main button (go, its action) or, with nothing to do but wait, what it
// waits for (wait, note); and the one smaller choice under it (sub).
function roomGo(){
  const s=room?.snap,mm=s?.match,side=courtSide(),me=myId();
  if(!room?.info)return {wait:'正在连接房间……'};if(!mm)return {wait:'正在进房……'};
  const pos=s.queue.indexOf(me),off={action:'unqueue',text:'下场观战'},toStands={action:'unqueue',text:'去看台'};
  if(side){
    if(mm.phase==='idle')return {go:'invite',text:'邀请好友',ok:true,sub:{action:'copy-code',text:'复制房间码'}};
    if(mm.phase!=='ready')return {wait:'对局中'};
    if(mm.ready.includes(me))return {wait:`已准备，等${nameOf(s.court[side==='a'?'b':'a'])}`,sub:off};
    return {go:'ready',text:'准备',ok:!!court&&(!match||match.state.phase==='won'),sub:off};
  }
  if(mm.phase==='playing')return {go:'watch-match',text:'观看比赛',ok:!!court&&!watching(),sub:pos>=0?toStands:{action:'queue',text:'排队上场'}};
  if(pos>=0)return {wait:`候场第 ${pos+1} 位`,note:pos?`前面还有 ${pos} 人`:'下一个就是你',sub:toStands};
  return {go:'queue',text:'排队上场',ok:true};
}
function updateStart(){
  const b=$('start-match'),state=mode==='online'&&room?roomGo():null;let text='开始对战',ok=!match&&!!court;
  // Online before a room the lobby's own buttons open or join one; in one, the main button, or what it waits for.
  b.hidden=mode==='online'&&!state?.go;$('room-wait').hidden=!state?.wait;$('room-sub').hidden=!state?.sub;
  if(state?.wait){setText($('room-wait-text'),state.wait);setText($('room-wait-note'),state.note??'');}
  if(state?.sub){const sub=$('room-sub');sub.dataset.action=state.sub.action;setText(sub,state.sub.text);}
  if(state?.go){text=state.text;ok=state.ok;b.dataset.go=state.go;}
  b.disabled=!ok;const label=b.firstChild;if(label?.nodeType===3&&label.textContent!==`${text} `)label.textContent=`${text} `;
}
// An invite link (?room=<id>) opens the page in the room, taking back this tab's place if it had one.
{const id=new URLSearchParams(location.search).get('room');if(id){mode='online';openRoom({room:id,token:tokens()[id]??null,name:savedName()});}}

setupUI();phaseUI();hud();requestAnimationFrame(frame);
