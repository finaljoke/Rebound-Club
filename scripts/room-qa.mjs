// Arena room panel QA in a real browser (node scripts/room-qa.mjs, needs the local server on :4173, whose /api/ws is the
// rooms' stand-in). One page opens a room on the duel page; members 2–8 come in as plain WebSockets (no page each), so
// the panel can be looked at with 1, 2, 4 and 8 in the room, and with this player on the court, in the stands and
// queued. At every size (lobby-qa's list, plus 1280×800): no sideways scroll; the room code and the main button (or
// what it waits for) are on screen with nothing over them; the panel's top is on screen; a portrait court keeps at
// least 160px (120px before a room). Before a room the lobby's create and join controls are checked the same way, and leaving takes a second
// tap. Screenshots in artifacts/room/.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const SIZES=[{width:1756,height:860},{width:1440,height:1000},{width:1280,height:800},{width:1280,height:720},{width:768,height:1024},{width:390,height:844},{width:360,height:640},{width:320,height:568},{width:844,height:390}];
const SHOTS=['390x844','844x390','1280x800'],errors=[],results=[],bots=[];await mkdir('artifacts/room',{recursive:true});
// A member with no page: in by code under a name, it answers nothing and keeps the room's latest snapshot.
const bot=(code,name)=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(`ws://localhost:4173/api/ws?code=${code}&name=${encodeURIComponent(name)}`);bots.push(ws);
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='joined'){ws.id=m.member;resolve(ws);}};ws.onerror=reject;
});
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
// Where an element is, and whether a tap on its middle reaches it.
const place=(p,selector)=>p.evaluate(s=>{const el=[...document.querySelectorAll(s)].find(e=>!e.hidden&&e.getClientRects().length);if(!el)return null;
  const r=el.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),hit:el===h||el.contains(h)};},selector);
async function fits(p,label,targets,court=160){
  for(const viewport of SIZES){
    await p.setViewportSize(viewport);await frames(p);
    const f={overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),panel:await place(p,'.duel-menu'),
      court:await p.evaluate(()=>Math.round(document.getElementById('court').getBoundingClientRect().height)),portrait:viewport.height>viewport.width};
    for(const s of targets)f[s]=await place(p,s);
    const tag=JSON.stringify({label,viewport,f});
    assert.equal(f.overflow,false,tag);assert.ok(f.panel&&f.panel.top>=0,tag);if(f.portrait)assert.ok(f.court>=court,tag);
    for(const s of targets)assert.ok(f[s]&&f[s].hit&&f[s].top>=0&&f[s].left>=0&&f[s].bottom<=viewport.height&&f[s].right<=viewport.width,`${s} ${tag}`);
    results.push({label,viewport,court:f.court});
    const size=`${viewport.width}x${viewport.height}`;if(SHOTS.includes(size))await p.screenshot({path:`artifacts/room/${label}-${size}.png`});
  }
  await p.setViewportSize({width:390,height:844});await frames(p);
}
const ROOM=['.room-code','#start-match, #room-wait'];
const status=p=>p.locator('#online-status').textContent();
try{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://localhost:4173/duel.html');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});
  await p.getByRole('radio',{name:'好友联机'}).click();
  // Before a room: the two ways in, and the code typed into one box drawn as five.
  assert.equal(await p.locator('#start-match').isHidden(),true,'进房前没有不能点的大按钮');
  await p.fill('#join-code','ab-c');assert.deepEqual(await p.locator('#code-boxes span').allTextContents(),['A','B','C','','']);await p.fill('#join-code','');
  await fits(p,'0-lobby',['.online-host','#code-boxes','.online-join'],120);
  await p.fill('#online-name','阿杰');await p.getByRole('button',{name:'创建房间',exact:true}).click();
  await p.waitForFunction(()=>/^[2-9A-Z]{5}$/.test(document.getElementById('room-code').textContent),null,{timeout:10000});
  const code=await p.locator('#room-code').textContent();
  // 1: alone, the main button invites and the code is shown big.
  await p.waitForFunction(()=>document.getElementById('start-match').dataset.go==='invite',null,{timeout:10000});
  assert.equal(await p.locator('#room-code-card').isVisible(),true);assert.equal(await p.locator('#room-code-big').textContent(),code);
  assert.equal(await p.locator('#room-arena .slot.empty').count(),1,'右边是空位');
  await fits(p,'1-alone',ROOM);
  // 2: someone on the court with this player; nobody queued, so no clock.
  const b1=await bot(code,'小美');await p.waitForFunction(()=>document.getElementById('start-match').dataset.go==='ready',null,{timeout:10000});
  assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#room-arena .slot')].map(s=>[s.querySelector('.slot-name').textContent,s.querySelector('.slot-tag').textContent])),[['阿杰','你 · 守擂'],['小美','攻擂']]);
  assert.equal(await p.locator('#room-arena [data-side="a"] .crown').count(),1,'房主的牌子');assert.equal(await p.locator('#ready-ring').isHidden(),true);
  await fits(p,'2-court',ROOM);
  // This player says ready (so the clock started by the queue below cannot send it off), then 4 and 8 in the room.
  await p.locator('#start-match').click();await p.waitForFunction(()=>/^已准备，等/.test(document.getElementById('room-wait-text').textContent),null,{timeout:5000});
  for(const n of ['大熊','玩家五'])await bot(code,n);
  await p.waitForFunction(()=>document.querySelectorAll('#queue-list li').length===2,null,{timeout:5000});
  assert.equal(await p.locator('#ready-ring').isVisible(),true,'有人候场就开始倒计时');assert.equal(await p.locator('#queue-list li').first().locator('.q-tag').textContent(),'下一个');
  await fits(p,'4-court',ROOM);
  for(const n of ['六号','七号','八号的名字很长很长'])await bot(code,n);
  await p.waitForFunction(()=>document.querySelectorAll('#queue-list li').length===5,null,{timeout:5000});
  await bot(code,'玩家');await p.waitForFunction(()=>document.querySelectorAll('#queue-list li').length===6,null,{timeout:5000});
  assert.equal(await p.locator('#room-count').textContent(),'8/8');
  await fits(p,'8-court',ROOM);
  // Off the court to the stands (the main button then queues), and into the queue (it waits, the smaller one goes back).
  await p.locator('#room-sub').click();await p.waitForFunction(()=>!!document.querySelector('#stands-list li.me'),null,{timeout:5000});
  assert.equal(await p.locator('#start-match').getAttribute('data-go'),'queue');
  await fits(p,'8-stands',ROOM);
  await p.locator('#start-match').click();await p.waitForFunction(()=>!!document.querySelector('#queue-list li.me')&&!document.getElementById('room-wait').hidden,null,{timeout:5000});
  assert.match(await p.locator('#room-wait-text').textContent(),/^候场第 \d 位$/);assert.equal(await p.locator('#room-sub').textContent(),'去看台');
  await fits(p,'8-queue',ROOM);
  // The owner's settings are folded: open, the rotation and the sync choices are there.
  await p.locator('#room-settings summary').click();for(const id of ['#rotation-group','#room-sync-group'])assert.equal(await p.locator(id).isVisible(),true,id);
  await p.locator('#room-settings summary').click();
  // Tapping one's own name opens the rename box.
  await p.locator('#queue-list li.me .q-name').click();assert.equal(await p.locator('#rename-input').isVisible(),true);
  await p.fill('#rename-input','阿杰二号');await p.getByRole('button',{name:'改名',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#queue-list li.me .q-name')?.textContent==='阿杰二号',null,{timeout:5000});
  // Leaving takes a second tap.
  await p.locator('.room-leave').click();assert.equal(await p.locator('.room-leave').textContent(),'再点一次离开');assert.equal(await p.locator('#online-room').isVisible(),true);
  await p.locator('.room-leave').click();await p.waitForFunction(()=>!document.getElementById('online-lobby').hidden,null,{timeout:5000});
  assert.equal(await status(p),'');assert.equal(b1.readyState,1);
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/room/qa.json',JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({sizes:SIZES.length,checks:results.length,courts:results.filter(r=>r.viewport.height>r.viewport.width).map(r=>`${r.label} ${r.viewport.width}x${r.viewport.height}:${r.court}`)},null,1));console.log('PASS');
}finally{for(const ws of bots)ws.close();await browser.close();}
