import {createRequire} from 'node:module';import {mkdir} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:840}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await mkdir('artifacts',{recursive:true});
  await page.route('**/game.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.goto('http://localhost:4173');
  const result=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.min.js'),A=await import('/art.mjs');
    document.body.innerHTML=`<div style="width:1200px;height:840px;background:#f4f1e8;position:relative;font-family:Arial,'Microsoft YaHei',sans-serif"><div style="position:absolute;left:55px;top:38px;z-index:2;color:#244b3a"><div style="font-size:11px;letter-spacing:3px;color:#8c9b79">REBOUND CLUB · CHARACTER STUDY</div><h1 style="font-size:30px;margin:12px 0">精致的潮玩运动场</h1><p style="font-size:12px;color:#8a9879">实际3D素材 · 正面、背面与守门员</p></div><canvas id="art-view" style="width:1200px;height:840px"></canvas><div style="position:absolute;bottom:85px;left:60px;right:60px;display:flex;justify-content:space-around;color:#58704a;font-size:13px"><span>01 / 球员 · 橙白</span><span>02 / 球衣与装备细节</span><span>03 / 守门员 · 蓝黄</span></div></div>`;
    const canvas=document.getElementById('art-view'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,840,false);renderer.setPixelRatio(1);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    const scene=new T.Scene();scene.background=new T.Color('#f4f1e8');scene.add(new T.HemisphereLight('#fff3da','#80927c',2));
    const sun=new T.DirectionalLight('#fff1d7',2.5);sun.position.set(-3,8,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.02;scene.add(sun);
    const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#f4f1e8',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
    const athletes=[];
    for(let i=0;i<3;i++){
      const goalie=i===2,a=A.buildAthlete({jersey:goalie?'#356f91':'#f6e9ce',accent:goalie?'#edc25e':'#ed774b',number:goalie?'1':'01',goalie});
      a.group.position.set((i-1)*1.95,0,0);a.group.rotation.y=i===1?.25:Math.PI+(i===0?.2:-.2);scene.add(a.group);athletes.push(a.group);
      for(let side=0;side<2;side++){const glove=A.buildGlove(goalie?'#edc25e':'#ed6941',side?1:-1);glove.group.position.set(side?.02:-.015,-.44,-.015);a.arms[side].add(glove.group);a.arms[side].rotation.x=.32;}
      const stand=new T.Mesh(new T.CylinderGeometry(.68,.72,.15,48),new T.MeshStandardMaterial({color:i===2?'#ccd6bd':'#dbe2ca',roughness:.9}));stand.position.set((i-1)*1.95,-.045,0);stand.receiveShadow=true;scene.add(stand);
    }
    const camera=new T.PerspectiveCamera(31,1200/840,.1,100);camera.position.set(0,3.5,9.6);camera.lookAt(0,1.05,0);renderer.render(scene,camera);
    window.artPreview={scene,camera,renderer,athletes};
    return {preview:'actual 3D assets',webgl:!!renderer.getContext()};
  });
  await page.screenshot({path:'artifacts/character-material-sheet.png'});
  await page.evaluate(async()=>{
    const {buildWorld}=await import('/scene3d.mjs'),C=await import('/core.mjs'),{scene,camera,renderer,athletes}=window.artPreview;
    for(const a of athletes)scene.remove(a);
    document.querySelector('h1').textContent='潮玩运动员 · 出手姿态';document.querySelector('p').textContent='实际游戏模型 · 挥击中段 · 固定肩部与手腕转动';
    document.querySelectorAll('span').forEach((e,i)=>e.textContent=['01 / 拳套出击','02 / 球拍挥击','03 / 运动剑挥击'][i]);
    for(const [i,weapon] of ['glove','racket','sword'].entries()){
      const w=buildWorld(),s=C.createGame(0,weapon);C.startGame(s);C.stepGame(s,1,0);s.swing={time:(C.WEAPONS[weapon].windup+C.WEAPONS[weapon].active)*.5};
      w.update(s,0,true);w.hero.position.set((i-1)*1.95,0,0);w.hero.rotation.y=Math.PI+.65;scene.add(w.hero);
    }
    renderer.render(scene,camera);
  });
  await page.screenshot({path:'artifacts/character-strike-sheet.png'});
  if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify({...result,strikePreview:true,errors}));
}finally{await browser.close();}
