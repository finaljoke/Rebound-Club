// Sound and haptics shared by the club (game.js) and the duel page (duel.js); moved out of game.js unchanged.
// setSound follows the page's sound switch: off silences cues and vibration alike.
import {SKILLS} from './core.mjs';

let soundOn=true,audio=null;
export function setSound(on){soundOn=!!on;}
// Every cue is synthesized: a low sine thump for weight layered with a short filtered noise burst for the crack.
// All cues share one master gain into a compressor, so stacked cues (hit + impact + goal) duck instead of clipping.
let master=null,noiseBuffer=null;
function bus(){
  if(master)return master;
  const comp=audio.createDynamicsCompressor();comp.threshold.value=-10;comp.knee.value=8;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.18;
  master=audio.createGain();master.gain.value=.9;master.connect(comp);comp.connect(audio.destination);return master;
}
function tone(a,b,d,type='sine',vol=.1,delay=0){
  const at=audio.currentTime+delay,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=type;osc.frequency.setValueAtTime(a,at);osc.frequency.exponentialRampToValueAtTime(b,at+d);
  gain.gain.setValueAtTime(vol,at);gain.gain.exponentialRampToValueAtTime(.001,at+d);
  osc.connect(gain);gain.connect(bus());osc.start(at);osc.stop(at+d);
}
// One second of white noise is generated once; each burst plays a random slice with a linear fade (same envelope as before).
function noise(d,vol,freq,delay=0){
  if(!noiseBuffer){noiseBuffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
  const at=audio.currentTime+delay,src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  src.buffer=noiseBuffer;filter.type='bandpass';filter.frequency.value=freq;filter.Q.value=.9;
  gain.gain.setValueAtTime(vol,at);gain.gain.linearRampToValueAtTime(0,at+d);
  src.connect(filter);filter.connect(gain);gain.connect(bus());src.start(at,Math.random()*Math.max(0,1-d),d);
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
  wide:()=>{tone(180,110,.12,'sine',.14);noise(.07,.1,900);},
  practice:()=>tone(440,330,.16,'triangle',.06),
  // Glove contact thump, scaled by hitFeel intensity.
  punch:i=>{tone(170,55,.14,'sine',.3*i);noise(.05,.24*i,1500);},
  impact:()=>{tone(72,36,.3,'sine',.38);tone(1320,1760,.18,'triangle',.06,.04);},
  // Skill cues: burst charge rises with quickening pulses up to the strike beat, strike lands a deep boom and crack;
  // spin adds a short whirl; a refused request blips low.
  charge:()=>{const d=SKILLS.burst.strike;tone(160,720,d,'sawtooth',.035);tone(80,150,d,'sine',.13);[.1,.3,.46,.58,.67].forEach((t,i)=>tone(110+i*30,70,.07,'sine',.14+i*.03,t));},
  strike:()=>{tone(64,26,.5,'sine',.5);noise(.3,.34,900);noise(.12,.2,4200);tone(1760,2640,.22,'triangle',.06,.02);},
  whirl:()=>{tone(520,980,.16,'triangle',.05);tone(980,560,.14,'triangle',.04,.08);},
  deny:()=>tone(240,180,.07,'square',.025),
  start:()=>tone(350,700,.12,'triangle',.07)
};
// Phones only let audio start inside a real tap, and iOS mutes Web Audio with the ringer switch unless the audio session
// is 'playback': navigator.audioSession on Safari 17+, a silent <audio> played once on older iOS. Every tap also resumes a
// context the system suspended or interrupted (lock screen, call, app switch).
const SILENT_WAV='data:audio/wav;base64,UklGRkwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
let silentPlayed=false;
function audioReady(){
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;
  if(navigator.audioSession)navigator.audioSession.type='playback';
  audio??=new Context();if(audio.state!=='running')audio.resume().catch(()=>{});
  if(!silentPlayed){silentPlayed=true;const el=new window.Audio(SILENT_WAV);el.setAttribute('playsinline','');el.play().catch(()=>{});}
  return true;
}
if(typeof document!=='undefined')for(const type of ['pointerdown','touchend','click','keydown'])document.addEventListener(type,()=>{if(soundOn)try{audioReady();}catch{}},{capture:true,passive:true});
// Haptics (Android browsers; iOS web has no vibration API): a tap on contact, a pattern on goals and conceded balls.
// They follow the sound toggle, so one switch silences both.
const HAPTICS={hit:12,soft:8,perfect:28,spin:18,burst:[25,30,60],goal:[30,50,70],save:45,miss:[70,40,70]};
export function buzz(kind){if(!soundOn||!HAPTICS[kind]||typeof navigator.vibrate!=='function')return;try{navigator.vibrate(HAPTICS[kind]);}catch{/* optional */}}
export function sound(kind,intensity=1){
  if(!soundOn||!cues[kind])return;
  try{if(audioReady())cues[kind](intensity);}catch{/* Audio is optional; play remains available. */}
}
