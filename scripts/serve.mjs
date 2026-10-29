// Dev server (npm start): the game's files from dist/ on :4173, and /api/ws, the online rooms' local stand-in
// (dev-rooms.mjs), so a page served here can play online against another tab or a device on the same network.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acceptWebSocket} from './dev-ws.mjs';
import {createRooms} from './dev-rooms.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
// rooms: createRooms options (tests shorten its clock).
export function createDevServer({rooms:options}={}){
  const rooms=createRooms(options);
  const server=http.createServer(async(req,res)=>{
    try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root)){res.writeHead(403).end();return;}const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}
    catch{res.writeHead(404).end('Not found');}
  });
  server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/ws'){socket.destroy();return;}
    const ws=acceptWebSocket(req,socket,head);if(ws)rooms.connect(ws,{params:url.searchParams,origin:req.headers.origin,ip:req.socket.remoteAddress});
  });
  server.rooms=rooms;return server;
}
const direct=process.argv[1]&&path.resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase();
if(direct)createDevServer({rooms:{log:stats=>console.log('room closed',JSON.stringify(stats))}}).listen(4173,'0.0.0.0',()=>console.log('Local: http://localhost:4173'));
