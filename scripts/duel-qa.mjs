// Duel page QA (node scripts/duel-qa.mjs, needs the local server on :4173). Nothing in dist/ exposes state: the test
// browser appends a read-only hook to duel.js (window.__qa) and hands the renderer to renderer.info.
// 1. Portrait 390×844 and landscape 844×390, against the bot: lobby, match and first-point screenshots in
//    artifacts/duel/, the point played with key presses only; draw calls at the moments perf-qa measures (lobby, 1.5 s
//    into the match, the other orientation) stay within 110.
// 2. Simulated latency 250 ms one way (labelled ping 500): a point is still scored, with no errors.
// 3. Two players on one keyboard: the match starts and both players' keys are taken.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const OUT='artifacts/duel';await mkdir(OUT,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],results={};
async function open(viewport){
  const p=await (await b.newContext({viewport,deviceScaleFactor:2})).newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.route('**/scene3d.mjs',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text()).replace('renderer.shadowMap.enabled=true;','globalThis.__r=renderer;renderer.shadowMap.enabled=true;')});});
  await p.route('**/duel.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={match:()=>match};'});});
  await p.goto('http://localhost:4173/duel.html');await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:30000});return p;
}
const calls=p=>p.evaluate(()=>__r.info.render.calls);
const score=p=>p.evaluate(()=>{const s=__qa.match().state;return s.score.a+s.score.b;});
// Meets each ball and aims away from the opponent until the score moves (either way), keys only.
async function playPoint(p,limit=60000){
  const t0=Date.now();
  while(Date.now()-t0<limit){
    const g=await p.evaluate(()=>{const v=__qa.match().a.view(),s=__qa.match().state;return {bz:v.ball.z,bx:v.ball.x,px:v.player.x,vz:v.ball.vz,ox:v.keeper.x,phase:s.phase,score:s.score.a+s.score.b};});
    if(g.score>0)return true;
    const dx=g.bx-g.px;if(g.vz<0&&Math.abs(dx)>.25){const k=dx>0?'ArrowRight':'ArrowLeft';await p.keyboard.down(k);await p.waitForTimeout(40);await p.keyboard.up(k);}
    if(g.vz<0&&g.bz<2.6&&g.bz>1.7){const k=g.ox>0?'ArrowLeft':'ArrowRight';await p.keyboard.down(k);await p.keyboard.press('Space');await p.waitForTimeout(90);await p.keyboard.up(k);}
    await p.waitForTimeout(15);
  }
  return false;
}
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const p=await open(viewport),tag=`${viewport.width}x${viewport.height}`,draws={};
  assert.equal(await p.evaluate(()=>document.getElementById('court').dataset.renderer),'3d');
  await p.waitForTimeout(600);draws.lobby=await calls(p);await p.screenshot({path:`${OUT}/lobby-${tag}.png`});
  await p.getByRole('button',{name:'开始对战'}).click();await p.waitForTimeout(1500);draws.match=await calls(p);
  await p.waitForFunction(()=>__qa.match().state.phase==='playing',null,{timeout:20000});await p.screenshot({path:`${OUT}/match-${tag}.png`});
  // Peak over a stretch of play, for the report (perf-qa does not measure it).
  let peak=0;for(let i=0;i<20;i++){peak=Math.max(peak,await calls(p));await p.waitForTimeout(50);}draws.peakInPlay=peak;
  assert.ok(await playPoint(p),`${tag} 比分应变化`);await p.waitForTimeout(250);await p.screenshot({path:`${OUT}/point-${tag}.png`});
  await p.setViewportSize(viewport.width>viewport.height?{width:390,height:844}:{width:844,height:390});await p.waitForTimeout(400);draws.otherOrientation=await calls(p);
  for(const k of ['lobby','match','otherOrientation'])assert.ok(draws[k]<=110,`${tag} ${k} 绘制调用 ${draws[k]}`);
  results[tag]={draws,score:await p.evaluate(()=>__qa.match().state.score)};await p.context().close();
}
{const p=await open({width:390,height:844});
  await p.locator('[data-latency="250"]').click();assert.equal(await p.locator('[data-latency="250"]').getAttribute('aria-checked'),'true');assert.equal((await p.locator('[data-latency="250"]').textContent()).trim(),'500','按钮标的是往返 ping');
  await p.getByRole('button',{name:'开始对战'}).click();await p.waitForFunction(()=>__qa.match().state.phase==='playing',null,{timeout:20000});
  assert.ok(await playPoint(p),'250 毫秒下比分应变化');
  const st=await p.evaluate(()=>{const m=__qa.match();return {a:m.a.state.score,b:m.b.state.score,rtt:m.a.clock.rtt};});
  await p.screenshot({path:`${OUT}/latency250-390x844.png`});results.latency250=st;await p.context().close();}
{const p=await open({width:1280,height:800});
  await p.getByRole('radio',{name:'本机双人'}).click();assert.equal(await p.locator('#latency-group').isHidden(),true,'本机双人不显示网络模拟');
  await p.getByRole('button',{name:'开始对战'}).click();await p.waitForFunction(()=>__qa.match().state.phase==='playing',null,{timeout:20000});
  const x0=await p.evaluate(()=>__qa.match().state.players.b.x);
  await p.keyboard.down('ArrowLeft');await p.waitForTimeout(250);await p.keyboard.up('ArrowLeft');
  const x1=await p.evaluate(()=>__qa.match().state.players.b.x);
  // B's ← is the screen's left: in A's coordinates (the screen's) its x goes down.
  assert.ok(x1<x0-.3,`远端按 ← 应往屏幕左边走：${x0.toFixed(2)} → ${x1.toFixed(2)}`);
  await p.keyboard.press('ArrowUp');await p.waitForTimeout(30);const swung=await p.evaluate(()=>!!__qa.match().state.players.b.swing);
  assert.ok(swung,'远端按 ↑ 挥击');await p.screenshot({path:`${OUT}/hotseat-1280x800.png`});results.hotseat={x0,x1,swung};await p.context().close();}
assert.deepEqual(errors,[]);console.log(JSON.stringify(results));console.log('PASS');await b.close();
