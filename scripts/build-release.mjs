// Builds a self-contained static release for third-party hosting: release/<name>/site is the web root.
// .mjs files are renamed to .js (and relative imports rewritten) so any static server sends a JavaScript MIME
// type; dist/ itself is not modified. Usage: node scripts/build-release.mjs   then zip release/<name>.
import {readdir,readFile,writeFile,mkdir,rm,copyFile,stat} from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const commit=execSync('git rev-parse --short HEAD',{cwd:root}).toString().trim();
const dirty=execSync('git status --porcelain dist',{cwd:root}).toString().trim()!=='';
const date=new Date().toISOString().slice(0,10);
const name=`rebound-club-${date}-${commit}${dirty?'-dirty':''}`;
const out=path.join(root,'release',name),site=path.join(out,'site');
await rm(out,{recursive:true,force:true});await mkdir(site,{recursive:true});

async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}
const rewrite=text=>text.replace(/(['"])(\.{1,2}\/[^'"]+?)\.mjs\1/g,'$1$2.js$1');
const files=[];
for await(const src of walk(path.join(root,'dist'))){
  if(path.basename(src).startsWith('rally'))continue; // Local-only prototype, never shipped.
  const rel=path.relative(path.join(root,'dist'),src).replace(/\\/g,'/'),target=rel.replace(/\.mjs$/,'.js'),dest=path.join(site,target);
  await mkdir(path.dirname(dest),{recursive:true});
  if(/\.(m?js|html|css)$/.test(rel))await writeFile(dest,rewrite(await readFile(src,'utf8')));else await copyFile(src,dest);
  files.push(target);
}
// Guard: nothing may still point at an .mjs file, and every relative import must resolve inside the package.
for(const f of files.filter(f=>/\.(js|html)$/.test(f))){
  const text=await readFile(path.join(site,f),'utf8');
  if(/['"]\.{1,2}\/[^'"]+\.mjs['"]/.test(text))throw Error(`${f} still references .mjs`);
  for(const m of text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){const target=path.join(path.dirname(path.join(site,f)),m[1]);await stat(target).catch(()=>{throw Error(`${f}: missing ${m[1]}`);});}
}
// Offline cache: sw.js lists every file of this release (version.json excluded: it is always fetched fresh).
const cached=['./',...files.filter(f=>f!=='version.json')];
await writeFile(path.join(site,'sw.js'),(await readFile(path.join(root,'scripts','release','sw.js'),'utf8')).replace('__VERSION__',name).replace('__FILES__',JSON.stringify(cached)));
files.push('sw.js');
const sums=[];for(const f of files.sort()){sums.push(`${createHash('sha256').update(await readFile(path.join(site,f))).digest('hex')}  ${f}`);}
await writeFile(path.join(site,'version.json'),JSON.stringify({name,commit,dirty,builtAt:new Date().toISOString()},null,2)+'\n');
await writeFile(path.join(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');
await copyFile(path.join(root,'scripts','release','DEPLOY.md'),path.join(out,'DEPLOY.md'));
await copyFile(path.join(root,'scripts','release','nginx.conf.example'),path.join(out,'nginx.conf.example'));
console.log(JSON.stringify({name,out,files:files.length,dirty}));
