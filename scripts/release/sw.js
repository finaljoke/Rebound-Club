// Offline cache for 反弹守卫, written into site/ by scripts/build-release.mjs (do not edit the copy in site/).
// One cache per release holds the whole site, so a page never mixes files from two versions: a new release downloads
// its complete set in the background, takes over, and the next visit runs it. version.json always goes to the network.
const VERSION='__VERSION__',CACHE=VERSION,FILES=__FILES__;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('rebound-club-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||url.pathname.endsWith('/version.json'))return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE),nav=req.mode==='navigate';
    return (await cache.match(nav?'./':req,{ignoreSearch:nav}))||fetch(req);
  })());
});
