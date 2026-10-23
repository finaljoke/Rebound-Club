import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const smoke=process.argv.includes('--smoke'),results=[],errors=[];
await mkdir('artifacts/rally',{recursive:true});
try{
 for(const [width,height,power] of [[390,844,'contact'],[844,390,'apex'],[1440,900,'contact']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/rally.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nwindow.__rallyQA={state:()=>game,preview:axis=>attackPreview(game,axis),range:()=>inHitRange(game)};'});});
  const response=await page.goto('http://localhost:4173/rally.html'+(power==='apex'?'?power=apex':''));assert.equal(response.status(),200);
  await page.getByRole('button',{name:'开始对打',exact:true}).waitFor();assert.equal(await page.locator('#rally-court').getAttribute('data-renderer'),'3d');
  await page.screenshot({path:'artifacts/rally/ready-'+width+'.png'});
  await page.getByRole('button',{name:'开始对打',exact:true}).click();await page.waitForFunction(()=>window.__rallyQA.state().phase==='playing');
  const fit=await page.evaluate(()=>{
   const boxes=['rally-left','rally-right','rally-hit','rally-pause'].map(id=>{const b=document.getElementById(id),r=b.getBoundingClientRect(),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id,w:r.width,h:r.height,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:p===b||b.contains(p)};});
   return {overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight+1,boxes};
  });assert.equal(fit.overflow,false,JSON.stringify({width,height,fit}));assert.ok(fit.boxes.every(b=>b.visible&&b.hit),JSON.stringify(fit));
  await page.screenshot({path:'artifacts/rally/play-'+width+'.png'});
  await page.getByRole('button',{name:'暂停对打'}).click();
  const paused=await page.evaluate(()=>JSON.stringify(window.__rallyQA.state()));await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>JSON.stringify(window.__rallyQA.state())),paused);
  await page.getByRole('button',{name:'继续对打'}).click();
  if(smoke){results.push({width,height,power,fit});await context.close();continue;}
  let held=null,frames=0,tells=0,heavySeen=false;const began=Date.now();
  async function hold(key){if(key===held)return;if(held)await page.keyboard.up(held);held=key;if(key)await page.keyboard.down(key);}
  while(Date.now()-began<180000){
   const s=await page.evaluate(()=>{
    const g=window.__rallyQA.state(),incoming=g.ball.hitter==='opponent';
    const target=g.flight?.contact?.x??g.ball.x,dx=target-g.player.x,axis=incoming&&Math.abs(dx)>.08?Math.sign(dx):0;
    return {phase:g.phase,axis,cue:window.__rallyQA.preview(axis),incoming,heavy:g.ball.kind==='heavy',range:window.__rallyQA.range(),swing:!!g.swing,charging:g.opponent.heavy,points:g.records.length};
   });
   if(s.charging)tells++;
   if(s.phase==='finished')break;
   await hold(s.phase==='playing'?(s.axis<0?'ArrowLeft':s.axis>0?'ArrowRight':null):null);
   if(s.phase==='playing'&&s.incoming&&!s.swing){
    if(s.heavy)heavySeen=true;
    const p=s.cue,forceSoft=!heavySeen&&p.kind==='soft'&&p.t>.85;
    const counter=p.kind==='counter'&&Math.abs(p.t)<.10;
    const emergency=s.heavy&&s.range&&p.kind==='soft'&&p.t<-.2;
    if(forceSoft||counter||p.kind==='power'||(!s.heavy&&p.kind==='normal'&&p.t<-.4)||emergency)await page.keyboard.press('Space');
   }
   if(++frames%500===0)console.log(JSON.stringify({progress:{width,height,seconds:Math.round((Date.now()-began)/1000),points:s.points}}));
   await page.waitForTimeout(4);
  }
  await hold(null);const state=await page.evaluate(()=>window.__rallyQA.state());
  assert.equal(state.phase,'finished','Match timeout '+JSON.stringify({width,height,score:state.score,point:state.point}));
  assert.equal(state.powerRule,power);assert.ok(state.records.some(r=>r.opponentHeavy>0),'Need an opponent heavy shot');assert.ok(state.records.some(r=>r.counterAttempts>0),'Need a counter attempt');
  await page.getByRole('button',{name:'复制记录',exact:true}).click();
  const data=await page.evaluate(async()=>{try{return await navigator.clipboard.readText();}catch{return document.getElementById('rally-json').value;}});
  const record=JSON.parse(data);assert.equal(record.points.length,state.score.player+state.score.opponent);assert.equal(record.powerRule,power);
  await page.screenshot({path:'artifacts/rally/result-'+width+'.png'});
  await writeFile('artifacts/rally/records-'+width+'.json',JSON.stringify(record,null,2));
  const result={width,height,power,score:state.score,points:record.points.length,heavy:record.points.reduce((n,p)=>n+p.opponentHeavy,0),attempts:record.points.reduce((n,p)=>n+p.counterAttempts,0),counters:record.points.reduce((n,p)=>n+p.counters,0),tells,seconds:Math.round((Date.now()-began)/1000)};
  results.push(result);console.log(JSON.stringify({completed:result}));
  await page.getByRole('button',{name:'再来一局',exact:true}).click();assert.equal(await page.evaluate(()=>window.__rallyQA.state().records.length),0);await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/rally/qa.json',JSON.stringify({smoke,results,errors},null,2));console.log(JSON.stringify({smoke,results,errors,PASS:true},null,2));
}finally{await browser.close();}

