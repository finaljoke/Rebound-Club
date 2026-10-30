// Online link QA in a real browser (node scripts/online-qa.mjs, needs the local server on :4173, whose /api/ws is the
// rooms' stand-in). Two pages, each in its own browser context, meet in a room through dist/duel-link.mjs:
// 1. The host opens a room and the guest joins by its code; both reach a direct WebRTC channel (its candidate types and
//    the time it took are reported).
// 2. 200 messages each way arrive in order, once.
// 3. The host's direct channel goes dead: both fall back to the room's relay (times reported), and the 150 messages each
//    side sent across the fall arrive in order, once.
// 4. Duels over fresh links, catch-up and full flight: a bot plays in each page (createClient) until the first goal, and
//    both pages end with the same score.
// 5. The duel page's 好友联机: the host (phone, portrait) opens a room, the guest (desktop) types its code in lower case;
//    only the host can start; the host's Esc pauses both (the guest sees why) and the guest's 继续 resumes both after the
//    hold; a goal leaves both pages on the same score, the footer telling direct and ping; a third page on the invite
//    link hears the room is full; the guest leaving shows on the host's page. No page errors throughout.
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
// 5. The page itself.
async function page(viewport){
  const p=await (await b.newContext({viewport})).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.route('**/duel.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={match:()=>match,room:()=>room};'});});
  return p;
}
const H=await page({width:390,height:844}),G=await page({width:1280,height:800});
for(const p of [H,G]){await p.goto('http://localhost:4173/duel.html');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});await p.getByRole('radio',{name:'好友联机'}).click();}
await H.getByRole('button',{name:'创建房间',exact:true}).click();
await H.waitForFunction(()=>/^[2-9A-Z]{5}$/.test(document.getElementById('room-code').textContent),null,{timeout:10000});
const roomCode=await H.locator('#room-code').textContent();
assert.match(await H.locator('#online-status').textContent(),/把房间码/);
await G.fill('#join-code',roomCode.toLowerCase());await G.getByRole('button',{name:'加入',exact:true}).click();
await G.waitForFunction(()=>/等房主开始/.test(document.getElementById('online-status').textContent),null,{timeout:10000});
await H.waitForFunction(()=>/可以开始了/.test(document.getElementById('online-status').textContent),null,{timeout:10000});
assert.equal(await G.locator('#start-match').isDisabled(),true,'访客不能开始');assert.equal(await G.locator('#sync-group').isHidden(),true,'访客不选同步方式');
assert.equal(await H.locator('#start-match').isDisabled(),false,'房主可以开始');
await H.screenshot({path:'artifacts/duel/online-room-390x844.png',fullPage:true});await G.screenshot({path:'artifacts/duel/online-guest-1280x800.png'});
await H.locator('#start-match').click();
for(const p of [H,G])await p.waitForFunction(()=>__qa.match()?.state.phase==='playing',null,{timeout:15000});
assert.deepEqual([await H.evaluate(()=>__qa.match().me),await G.evaluate(()=>__qa.match().me)],['a','b']);
await H.keyboard.press('Escape');
await G.waitForFunction(()=>__qa.match().state.phase==='paused'&&/对方暂停了/.test(document.getElementById('overlay-content').textContent),null,{timeout:5000});
const t0=Date.now();await G.getByRole('button',{name:'继续对战'}).click();
for(const p of [H,G])await p.waitForFunction(()=>__qa.match().state.phase!=='paused',null,{timeout:5000});
const held=(Date.now()-t0)/1000;assert.ok(held>=.7,`继续前先等 ${held} 秒`);
for(const p of [H,G])await p.waitForFunction(()=>{const s=__qa.match().state;return s.score.a+s.score.b>0;},null,{timeout:30000});
await H.waitForTimeout(400);
const ui={code:roomCode,held,scores:[await H.evaluate(()=>__qa.match().state.score),await G.evaluate(()=>__qa.match().state.score)],footer:await G.locator('#score').textContent()};
assert.deepEqual(ui.scores[0],ui.scores[1],'两边比分');assert.match(ui.footer,/直连 · ping \d+/);
const third=await page({width:390,height:844});await third.goto(H.url());
await third.waitForFunction(()=>/房间已满/.test(document.getElementById('feedback').textContent),null,{timeout:10000});
await G.keyboard.press('Escape');await G.getByRole('button',{name:'离开房间'}).first().click();
await H.waitForFunction(()=>/对方断开了/.test(document.getElementById('overlay-content').textContent),null,{timeout:8000});
await H.screenshot({path:'artifacts/duel/online-host-390x844.png'});
results.page=ui;
assert.deepEqual(errors,[]);
console.log(JSON.stringify(results,null,1));console.log('PASS');
await b.close();
