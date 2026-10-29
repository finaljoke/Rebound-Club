import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevServer} from '../scripts/serve.mjs';
import {ROOM,CLOSE} from '../server/room.mjs';

// The dev server's online-room stand-in (scripts/serve.mjs → dev-rooms.mjs → server/room.mjs) over real WebSockets, with
// Node's own client, on a free port.
async function serve(cfg={}){
  const logs=[],server=createDevServer({rooms:{cfg:{...ROOM,...cfg},log:s=>logs.push(s),origins:'http://localhost:4173'}});
  // Upgraded sockets leave the HTTP server's books: they are ended here, so a failed test still lets the server close.
  const sockets=new Set();server.on('upgrade',(req,socket)=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {url:`ws://127.0.0.1:${server.address().port}/api/ws`,http:`http://127.0.0.1:${server.address().port}`,server,logs,
    close:()=>new Promise(r=>{for(const sk of sockets)sk.destroy();server.closeAllConnections?.();server.close(r);})};
}
// A client that queues what it hears: next(type) waits for the next message of that type (a string for raw text).
function client(base,query,origin='http://localhost:4173'){
  const ws=new WebSocket(`${base}?${query}`,{headers:{Origin:origin}}),got=[],waiters=[];
  const closed=new Promise(r=>ws.addEventListener('close',e=>r({code:e.code,reason:e.reason})));
  ws.addEventListener('message',e=>{const m=e.data==='pong'?'pong':JSON.parse(e.data);got.push(m);for(const w of [...waiters])w();});
  const next=(type,ms=2000)=>new Promise((res,rej)=>{
    const look=()=>{const i=got.findIndex(m=>m===type||m.type===type);if(i<0)return false;res(got.splice(i,1)[0]);const w=waiters.indexOf(look);if(w>=0)waiters.splice(w,1);return true;};
    if(look())return;waiters.push(look);setTimeout(()=>rej(Error(`${query}: 没等到 ${type}，收到 ${JSON.stringify(got)}`)),ms);
  });
  return {ws,next,closed,send:m=>ws.send(typeof m==='string'?m:JSON.stringify(m)),close:()=>ws.close()};
}

test('本地替身：静态文件照常；凭房间码进房（小写、带短横也行），信令双向、中转 100 条按序到达', async()=>{
  const s=await serve();
  try{
    assert.equal((await fetch(`${s.http}/duel.html`)).status,200);
    const host=client(s.url,'create=1'),joined=await host.next('joined');
    assert.equal(joined.role,'host');assert.equal(joined.peer,false);assert.match(joined.code,/^[2-9A-Z]{5}$/);
    const typed=`${joined.code.slice(0,2).toLowerCase()}-${joined.code.slice(2)}`,guest=client(s.url,`code=${typed}`);
    assert.equal((await guest.next('joined')).peer,true);assert.deepEqual(await host.next('peer'),{type:'peer',present:true});
    host.send({type:'signal',data:{sdp:'offer'}});assert.deepEqual(await guest.next('signal'),{type:'signal',data:{sdp:'offer'}});
    guest.send({type:'signal',data:{sdp:'answer'}});assert.deepEqual((await host.next('signal')).data,{sdp:'answer'});
    // 100 at once: within the burst a connection may send (ROOM.burst), as a match's 35 a second always is.
    for(let i=0;i<100;i++)host.send({type:'relay',data:{i}});
    for(let i=0;i<100;i++)assert.equal((await guest.next('relay')).data.i,i);
    host.send('ping');assert.equal(await host.next('pong'),'pong');
    // The code stopped letting anyone in once the guest was in; the invite (room id) says the room is full.
    const late=client(s.url,`code=${joined.code}`);assert.equal((await late.next('error')).reason,'not-found');assert.equal((await late.closed).code,CLOSE['not-found']);
    const third=client(s.url,`room=${joined.id}`);assert.equal((await third.next('error')).reason,'full');assert.equal((await third.closed).code,CLOSE.full);
    host.close();guest.close();await Promise.all([host.closed,guest.closed]);
  }finally{await s.close();}
});

test('本地替身：断线后凭令牌回来，对方先得知离开、再得知回来；旧连接还开着时被顶掉', async()=>{
  const s=await serve();
  try{
    const host=client(s.url,'create=1'),{id}=await host.next('joined'),guest=client(s.url,`room=${id}`),g=await guest.next('joined');
    await host.next('peer');guest.close();await guest.closed;
    assert.deepEqual(await host.next('peer'),{type:'peer',present:false});
    const back=client(s.url,`room=${id}&token=${g.token}`);const again=await back.next('joined');
    assert.equal(again.role,'guest');assert.equal(again.peer,true);assert.deepEqual(await host.next('peer'),{type:'peer',present:true});
    const twin=client(s.url,`room=${id}&token=${g.token}`);await twin.next('joined');
    assert.deepEqual(await back.closed,{code:CLOSE.replaced,reason:'replaced'});
    twin.send({type:'relay',data:'still here'});assert.equal((await host.next('relay')).data,'still here');
    host.close();twin.close();await Promise.all([host.closed,twin.closed]);
  }finally{await s.close();}
});

test('本地替身：消息太大被断开、对方得知；来源不在白名单、开房太多都会被拒，并说明原因', async()=>{
  const s=await serve({createPerMinute:2});
  try{
    const host=client(s.url,'create=1'),{id}=await host.next('joined'),guest=client(s.url,`room=${id}`);await guest.next('joined');await host.next('peer');
    guest.send({type:'relay',data:'x'.repeat(ROOM.maxMessage)});
    assert.deepEqual(await guest.closed,{code:CLOSE['too-big'],reason:'too-big'});assert.deepEqual(await host.next('peer'),{type:'peer',present:false});
    const evil=client(s.url,'create=1','https://evil.example');assert.equal((await evil.next('error')).reason,'origin');assert.equal((await evil.closed).code,CLOSE.origin);
    const second=client(s.url,'create=1');await second.next('joined');
    const third=client(s.url,'create=1');assert.equal((await third.next('error')).reason,'rate');assert.equal((await third.closed).code,CLOSE.rate);
    host.close();second.close();await Promise.all([host.closed,second.closed]);
  }finally{await s.close();}
});

test('本地替身：没人进房，到时间后房主被告知过期，房间清掉并报告它转了多少消息', async()=>{
  const s=await serve({joinWait:.3});
  try{
    const host=client(s.url,'create=1'),{code}=await host.next('joined');host.send({type:'keep'});
    assert.deepEqual(await host.closed,{code:CLOSE.expired,reason:'expired'});
    assert.equal(s.server.rooms.size,0,'房间已清掉');
    assert.equal(s.logs.length,1);assert.equal(s.logs[0].room,code);assert.equal(s.logs[0].received,1);
  }finally{await s.close();}
});
