// Online link QA in a real browser (node scripts/online-qa.mjs, needs the local server on :4173, whose /api/ws is the
// rooms' stand-in). Two pages, each in its own browser context, meet in a room through dist/duel-link.mjs:
// 1. The host opens a room and the guest joins by its code; both reach a direct WebRTC channel (its candidate types and
//    the time it took are reported).
// 2. 200 messages each way arrive in order, once.
// 3. The host's direct channel goes dead: both fall back to the room's relay (times reported), and the 150 messages each
//    side sent across the fall arrive in order, once.
// 4. Duels over fresh links, catch-up and full flight: a bot plays in each page (createClient) until the first goal, and
//    both pages end with the same score. No page errors throughout.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const b=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],results={};
async function open(){
  const p=await (await b.newContext()).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://localhost:4173/duel.html');
  await p.evaluate(async()=>{
    window.L=await import('./duel-link.mjs');window.N=await import('./duel-net.mjs');window.B=await import('./duel-bot.mjs');
    // A link that keeps what it hears and when its mode changed.
    window.connect=async join=>{window.got=[];window.modes=[];window.link=L.createLink({join});
      link.onMessage(m=>got.push(m));link.onEvent(e=>{if(e.type==='mode')modes.push({mode:e.mode,at:performance.now()});});return link.ready;};
  });
  return p;
}
const both=fn=>Promise.all([host,guest].map(fn));
const host=await open(),guest=await open();
async function meet(){
  const {code}=await host.evaluate(()=>connect({create:true}));await guest.evaluate(code=>connect({code}),code);
  const t0=Date.now();await both(p=>p.waitForFunction(()=>link.mode==='direct',null,{timeout:20000}));return (Date.now()-t0)/1000;
}

// 1–2. Direct, and in order.
const seconds=await meet();
results.direct={seconds,host:await host.evaluate(()=>link.stats()),guest:await guest.evaluate(()=>link.stats())};
await both(p=>p.evaluate(()=>{for(let i=0;i<200;i++)link.send({i});}));
await both(p=>p.waitForFunction(()=>got.length>=200,null,{timeout:10000}));
for(const p of [host,guest])assert.deepEqual(await p.evaluate(()=>got.map(m=>m.i)),[...Array(200).keys()],'直连按序');

// 3. The fall: the host's channel stops dead while both keep sending, 30 a second for 5 s.
await both(p=>p.evaluate(()=>{got.length=0;}));
const mutedAt=await host.evaluate(()=>{link.debug.muteDirect();return performance.now();});
await both(p=>p.evaluate(()=>new Promise(r=>{let i=0;const id=setInterval(()=>{link.send({k:i++});if(i===150){clearInterval(id);r();}},33);})));
await both(p=>p.waitForFunction(()=>link.mode==='relay'&&got.length>=150,null,{timeout:10000}));
for(const p of [host,guest])assert.deepEqual(await p.evaluate(()=>got.map(m=>m.k)),[...Array(150).keys()],'切换前后按序、不缺不重');
const fell=async p=>p.evaluate(t=>{const m=modes.findLast(x=>x.mode==='relay');return m?+(((m.at-t)/1000).toFixed(2)):null;},mutedAt);
results.fall={hostToRelay:await fell(host),guestToRelay:await fell(guest)};
assert.ok(results.fall.hostToRelay<=4&&results.fall.guestToRelay<=4,JSON.stringify(results.fall));
await both(p=>p.evaluate(()=>link.close()));

// 4. Duels: one bot per page, playing its own copy, until the first goal.
for(const sync of ['catchup','fullflight']){
  await meet();
  await both(p=>p.evaluate(sync=>{
    const side=link.role==='host'?'a':'b',now=()=>performance.now()/1000,bot=B.createBot({seed:side==='a'?5:6});
    window.c=N.createClient({side,transport:link,now,sync});let last=now();c.start();window.stop=false;
    const tick=()=>{const t=now(),dt=Math.min(.05,t-last);last=t;const d=bot.decide(c.view(),dt);c.step(dt,{axis:d.axis,swing:d.swing,skill:d.skill});c.state.events=[];
      if(!stop)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  },sync));
  await both(p=>p.waitForFunction(()=>c.state.score.a+c.state.score.b>0,null,{timeout:60000}));
  await new Promise(r=>setTimeout(r,500));
  const scores=await Promise.all([host,guest].map(p=>p.evaluate(()=>{stop=true;return {...c.state.score};})));
  assert.deepEqual(scores[0],scores[1],`${sync} 两边比分`);
  results[sync]={score:scores[0],mode:await host.evaluate(()=>link.mode),rtt:await host.evaluate(()=>c.clock.rtt)};
  await both(p=>p.evaluate(()=>link.close()));
}
assert.deepEqual(errors,[]);
console.log(JSON.stringify(results,null,1));console.log('PASS');
await b.close();
