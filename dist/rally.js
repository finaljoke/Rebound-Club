import {RALLY,createRally,startRally,stepRally,attackRally,pauseRally,resumeRally,attackPreview,inHitRange} from './rally-core.mjs';
import {createInput} from './input.mjs';
import {createRallyRenderer} from './rally-scene.mjs';
const $=id=>document.getElementById(id),input=createInput(),params=new URLSearchParams(location.search),power=params.get('power')==='apex'?'apex':'contact',hint=params.get('hint')==='practice'?'practice':'challenge';
let game=createRally({power,hint}),renderer=null,lastTime=0,uiPhase='',noticeUntil=0,notice='',soundOn=true,audio=null;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const REASONS={net:'下网',out:'底线出界','own-half':'首次落在己方半场','double-bounce':'二次弹地',whiff:'挥空'};
$('power-'+power).setAttribute('aria-current','page');$('rally-rule').textContent=power==='apex'?'最高点奖励':'精准接触奖励';
$('rally-hint-mode').textContent=hint==='practice'?'教学档':'挑战档';
document.body.dataset.hint=hint;
const toggleURL=new URL(location.href);if(hint==='practice')toggleURL.searchParams.delete('hint');else toggleURL.searchParams.set('hint','practice');
$('rally-hint-toggle').href=toggleURL.href;$('rally-hint-toggle').setAttribute('aria-label',hint==='practice'?'切换为挑战档':'切换为教学档');
for(const rule of ['contact','apex']){const url=new URL(location.href);if(rule==='apex')url.searchParams.set('power','apex');else url.searchParams.delete('power');$('power-'+rule).href=url.href;}
function sound(kind){
 if(!soundOn)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});
 const [from,to,duration]=kind==='charge'?[180,650,.5]:kind==='counter'?[450,950,.18]:kind==='point'?[660,880,.22]:kind==='bounce'?[240,180,.04]:[180,80,.1];
 const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=kind==='charge'?'triangle':'sine';oscillator.frequency.setValueAtTime(from,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(to,audio.currentTime+duration);gain.gain.setValueAtTime(kind==='charge'?.055:.10,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);
 }catch{/* Optional audio. */}}
function label(text){notice=text;noticeUntil=game.elapsed+.8;}
function recordsJSON(){return JSON.stringify({powerRule:game.powerRule,hintMode:game.hintMode,score:game.score,winner:game.winner,points:game.records},null,2);}
function reset(){game=createRally({power,hint});input.reset();notice='';noticeUntil=0;lastTime=0;uiPhase='';startRally(game);sound('hit');screen();}
function screen(){
 if(uiPhase===game.phase)return;uiPhase=game.phase;document.body.dataset.phase=game.phase;
 const overlay=$('rally-overlay'),card=$('rally-card');overlay.hidden=!['ready','paused','finished'].includes(game.phase);
 if(game.phase==='ready')card.innerHTML='<div class="eyebrow">RALLY LAB · 隔网对打</div><h1>接招，再反击。</h1><p>左右移动，等球落地进框再挥拍。<br>早打向左，晚打向右。<br>看到对手蓄力，看准中心时机反制。</p><button class="rally-primary" id="rally-start">开始对打</button>';
 if(game.phase==='paused')card.innerHTML='<div class="eyebrow">PAUSED</div><h2>这一拍，等你回来。</h2><button class="rally-primary" id="rally-resume">继续对打</button><button class="rally-secondary" id="rally-retry">重新开始</button>';
 if(game.phase==='finished'){
  const points=game.records.map(r=>'<li><b>'+r.number+'</b><span>'+REASONS[r.reason]+'<small>回击 '+r.hits+' · 重炮 '+r.opponentHeavy+' · 反制 '+r.counters+'</small></span><em>'+(r.winner==='player'?'你得分':'对手得分')+'</em></li>').join('');
  card.innerHTML='<div class="eyebrow">MATCH COMPLETE</div><h2>'+(game.winner==='player'?'漂亮，拿下这场！':'再读懂他一招。')+'</h2><p>'+game.score.player+' : '+game.score.opponent+'</p><ol class="rally-point-list">'+points+'</ol><button class="rally-primary" id="rally-retry">再来一局</button><button class="rally-secondary" id="rally-copy">复制记录</button><p id="rally-copy-status" role="status"></p><textarea id="rally-json" aria-label="本局JSON记录" readonly hidden></textarea>';
  input.reset();
 }
 if(['ready','paused','finished'].includes(game.phase))queueMicrotask(()=>card.querySelector('.rally-primary')?.focus({preventScroll:true}));
}
function pause(){if(pauseRally(game)){input.reset();audio?.suspend().catch(()=>{});screen();}}
function resume(){if(resumeRally(game)){input.reset();audio?.resume().catch(()=>{});lastTime=0;screen();}}
function hit(){if(attackRally(game))sound('hit');}
document.addEventListener('click',async e=>{
 const id=e.target.closest('button')?.id;
 if(id==='rally-start'||id==='rally-retry')reset();
 if(id==='rally-resume')resume();
 if(id==='rally-copy'){
  const text=recordsJSON();try{await navigator.clipboard.writeText(text);$('rally-copy-status').textContent='本局记录已复制';}
  catch{const field=$('rally-json');field.hidden=false;field.value=text;field.select();$('rally-copy-status').textContent='请复制下面的记录';}
 }
});
for(const [id,direction] of [['rally-left',-1],['rally-right',1]]){
 const button=$(id);
 button.addEventListener('pointerdown',e=>{if(!['playing','serving'].includes(game.phase)||e.button!==0)return;e.preventDefault();input.down(e.pointerId,direction);button.setPointerCapture(e.pointerId);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>input.up(e.pointerId));
 button.addEventListener('contextmenu',e=>e.preventDefault());
}
$('rally-hit').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();hit();});
$('rally-hit').addEventListener('click',e=>{if(e.detail===0)hit();});
$('rally-pause').addEventListener('click',()=>game.phase==='paused'?resume():pause());
$('rally-sound').addEventListener('click',()=>{soundOn=!soundOn;$('rally-sound').setAttribute('aria-pressed',String(soundOn));$('rally-sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('rally-sound').textContent=soundOn?'♪':'♩';});
window.addEventListener('keydown',e=>{
 if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)&&['playing','serving'].includes(game.phase)){e.preventDefault();input.key(e.key,true);}
 if(e.code==='Space'&&game.phase==='playing'){e.preventDefault();if(!e.repeat)hit();}
 if(e.code==='Escape'){e.preventDefault();game.phase==='paused'?resume():pause();}
});
window.addEventListener('keyup',e=>input.key(e.key,false));window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();lastTime=0;});
function hud(){
 $('player-score').textContent=game.score.player;$('opponent-score').textContent=game.score.opponent;
 $('rally-pause').disabled=['ready','finished'].includes(game.phase);$('rally-hit').disabled=game.phase!=='playing';
 for(const [id,direction] of [['rally-left',-1],['rally-right',1]]){$(id).setAttribute('aria-pressed',String(input.pressed(direction)));$(id).disabled=!['playing','serving'].includes(game.phase);}
 const cue=attackPreview(game,input.axis()),charging=game.opponent.heavy&&game.opponent.chargeAt!==null&&['playing','paused'].includes(game.phase);
 const counterHint=hint==='practice'&&cue.kind==='counter';
 $('rally-tell').hidden=hint!=='practice'||!charging;$('rally-hit').classList.toggle('ready',inHitRange(game));$('rally-hit').classList.toggle('counter',counterHint);
 $('rally-hit-hint').textContent=game.swing?'收招中':counterHint?'现在反制！':inHitRange(game)?'可以挥拍':'等球落地再出手';
 $('rally-status').textContent=game.phase==='serving'?(game.point.server==='player'?'你方发球':'对手发球')+' · '+Math.max(1,Math.ceil(game.countdown)):game.phase==='playing'?'第 '+(game.records.length+1)+' 分':game.phase==='paused'?'已暂停':game.phase==='finished'?'本局结束':game.phase==='point'?'下一分准备':'准备开场';
 $('rally-notice').textContent=noticeUntil>game.elapsed?notice:'';
}
function frame(now){
 const dt=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;stepRally(game,dt,input.axis());
 const events=game.events;game.events=[];
 for(const e of events){
  if(e.type==='heavyTell')sound('charge');
  if(e.type==='counter'){sound('counter');label('反制！');$('rally-feedback').textContent='借力回击，抓住对手回位的空当。';}
  if(e.type==='playerHit'&&e.kind!=='counter'){sound('hit');label(e.kind==='power'?'重炮！':e.kind==='soft'?'软球':'好球');}
  if(e.type==='opponentHit'||e.type==='bounce')sound(e.type==='bounce'?'bounce':'hit');
  if(e.type==='whiff')label('挥空');
  if(e.type==='point'){sound('point');label((e.loser==='player'?'你方':'对手')+REASONS[e.reason]);$('rally-feedback').textContent=(e.winner==='player'?'你得分':'对手得分')+' · '+REASONS[e.reason];}
 }
 screen();hud();renderer?.render(game,reduceMotion);requestAnimationFrame(frame);
}
try{renderer=createRallyRenderer($('rally-court'));$('rally-court').dataset.renderer='3d';}
catch(error){$('rally-feedback').textContent='当前浏览器无法打开3D画面，请换用支持WebGL的浏览器。';console.error(error);}
screen();hud();requestAnimationFrame(frame);

