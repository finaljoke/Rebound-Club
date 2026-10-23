// Renders the app icons (dist/icons/*.png) from the same mark as the page favicon. Re-run after changing the mark:
// node scripts/make-icons.mjs   (uses this machine's Playwright + Chrome)
import {createRequire} from 'node:module';import {mkdir} from 'node:fs/promises';
const require=createRequire('C:/Users/HUFAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/qa.cjs');
const {chromium}=require('playwright');
const OUT=new URL('../dist/icons/',import.meta.url);await mkdir(OUT,{recursive:true});
// The ball mark on its own, so each icon can choose its background shape and safe-zone padding.
const ball=`<circle cx='32' cy='32' r='17' fill='none' stroke='#fff5da' stroke-width='3'/><path d='M15 32h34M32 15c-12 10-12 24 0 34m0-34c12 10 12 24 0 34' fill='none' stroke='#fff5da' stroke-width='3'/>`;
const icons=[
  // name, size, background (rounded = like the favicon), mark scale (maskable keeps the mark inside the 80% safe zone)
  ['icon-192.png',192,`<rect width='64' height='64' rx='18' fill='#ed6843'/>`,1],
  ['icon-512.png',512,`<rect width='64' height='64' rx='18' fill='#ed6843'/>`,1],
  ['maskable-512.png',512,`<rect width='64' height='64' fill='#ed6843'/>`,.7],
  ['apple-touch-icon.png',180,`<rect width='64' height='64' fill='#ed6843'/>`,.82],
];
const b=await chromium.launch({executablePath:'C:/Users/HUFAN/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
for(const [name,size,bg,scale] of icons){
  const p=await b.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='${size}' height='${size}'>${bg}<g transform='translate(32 32) scale(${scale}) translate(-32 -32)'>${ball}</g></svg>`;
  await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await p.locator('svg').screenshot({path:new URL(name,OUT).pathname.replace(/^\/([A-Za-z]:)/,'$1'),omitBackground:true});await p.close();
}
await b.close();console.log('icons written');
