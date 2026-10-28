// Rendering budget QA on the real page (node scripts/perf-qa.mjs, needs the local server on :4173).
// Test-browser-only interceptions read renderer.info and the game state; nothing in dist/ exposes them.
import {chromium,CHROME} from './qa-env.mjs';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
const OUT='artifacts/perf';await mkdir(OUT,{recursive:true});
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
const b=await chromium.launch({executablePath:CHROME,headless:true});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await ctx.newPage();const errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(v=>{localStorage.setItem('rebound-club-v2',v);
  window.__rects=0;const gbcr=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.id==='court')__rects++;return gbcr.call(this);};},SAVE);
await p.route('**/scene3d.mjs',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text()).replace('renderer.shadowMap.enabled=true;','globalThis.__r=renderer;renderer.shadowMap.enabled=true;')});});
await p.route('**/game.js',async r=>{const x=await r.fetch();await r.fulfill({response:x,body:(await x.text())+'\nwindow.__qa={game:()=>game,court:()=>court3D};'});});
await p.goto('http://localhost:4173/');await p.waitForTimeout(800);
const frames=n=>p.evaluate(n=>new Promise(res=>{let i=0;const f=()=>++i<n?requestAnimationFrame(f):res();requestAnimationFrame(f);}),n);
const calls=()=>p.evaluate(()=>({calls:__r.info.render.calls,triangles:__r.info.render.triangles,attrs:__r.getContext().getContextAttributes().preserveDrawingBuffer,quality:__qa.court().quality,canvas:[__r.domElement.width,__r.domElement.height],css:(r=>[r.width,r.height])(document.getElementById('court').getBoundingClientRect())}));
const R={lobby:await calls()};await p.screenshot({path:`${OUT}/lobby-390.png`});
await p.evaluate(()=>document.getElementById('start-match').click());await p.waitForTimeout(1500);
await frames(5);const r0=await p.evaluate(()=>__rects);await frames(60);R.rectsIn60Frames=await p.evaluate(r=>__rects-r,r0);
R.play=await calls();await p.screenshot({path:`${OUT}/play-390.png`});
await p.setViewportSize({width:844,height:390});await p.waitForTimeout(400);await frames(5);R.landscape=await calls();
console.log(JSON.stringify(R));
for(const k of ['lobby','play','landscape'])assert.ok(R[k].calls<=110,`${k} 绘制调用 ${R[k].calls}`);
assert.equal(R.play.attrs,false,'不保留画面缓冲');
assert.equal(R.rectsIn60Frames,0,'尺寸不变时不读取画布尺寸');
// After a resize the backing store follows the new CSS size (at the active pixel ratio).
const pr=R.landscape.canvas[0]/R.landscape.css[0];assert.ok(Math.abs(R.landscape.canvas[1]/R.landscape.css[1]-pr)<.02&&pr>=1,`横屏画布 ${R.landscape.canvas} / ${R.landscape.css}`);
assert.deepEqual(errors,[]);console.log('PASS');await b.close();
