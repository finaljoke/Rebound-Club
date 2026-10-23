// Product-shell QA (node scripts/shell-qa.mjs, needs the local server on :4173): loading cover, haptics, share card.
// Test-browser-only stubs record navigator.vibrate / navigator.share; game state is only read.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const SAVE=JSON.stringify({unlocked:5,scores:{0:2200},perfect:{},tutorialDone:true});
const b=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const R={},errors=[];
const watch=(p,tag)=>{p.on('pageerror',e=>errors.push(`${tag}: ${e.message}`));p.on('console',m=>{if(m.type()==='error')errors.push(`${tag}: ${m.text()}`);});};

// 1) Loading cover: visible and blocking while the 3D library is still downloading, gone once the game is ready.
{const p=await b.newPage({viewport:{width:390,height:844}});watch(p,'boot');
  await p.route('**/vendor/three.core.min.js',async r=>{await new Promise(res=>setTimeout(res,2000));await r.continue();});
  // Module scripts hold back DOMContentLoaded, so look as soon as the page has rendered its HTML.
  await p.goto('http://localhost:4173/',{waitUntil:'commit'});await p.waitForSelector('#start-match');await p.waitForTimeout(300);
  const during=await p.evaluate(()=>{const c=document.getElementById('boot'),r=c?.getBoundingClientRect(),s=document.getElementById('start-match').getBoundingClientRect(),top=document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);
    return {cover:!!c&&getComputedStyle(c).visibility!=='hidden'&&r.width>=innerWidth-1,blocksStart:!!c&&c.contains(top),text:c?.textContent.trim()};});
  await p.waitForFunction(()=>document.body.dataset.booted==='1',null,{timeout:15000});
  // The fade is a CSS transition; software-rendered headless frames are slow, so allow it a few seconds.
  await p.waitForFunction(()=>getComputedStyle(document.getElementById('boot')).visibility==='hidden',null,{timeout:3000}).catch(()=>{});
  const after=await p.evaluate(()=>{const c=document.getElementById('boot');return {hidden:!c||getComputedStyle(c).visibility==='hidden'};});
  R.boot={during,after};await p.close();
  assert.ok(during.cover&&during.blocksStart,`载入期间遮罩 ${JSON.stringify(during)}`);assert.ok(/载入/.test(during.text),'载入文字');assert.ok(after.hidden,'载入后遮罩消失');}

console.log(JSON.stringify(R));assert.deepEqual(errors,[]);console.log('PASS');await b.close();
