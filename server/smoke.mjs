// Smoke check of a running rooms server: the Worker under `wrangler dev` or deployed, or the dev server's stand-in.
// node server/smoke.mjs [ws://localhost:8787/api/ws] [--origin=http://localhost:4173] [--any-origin]
// Opens a room, joins it by its code, trades signalling both ways and relays 100 messages in order, answers the
// heartbeat, turns a third player away, takes a place back by its token, and refuses a stranger's Origin and a message
// that is too large, each with its reason. --any-origin: the server lets every Origin in (the dev server's stand-in does,
// for pages opened at a LAN address), so a stranger's room opens instead. Needs Node 22 or later (built-in WebSocket).
// Two slower checks of what only a Durable Object does, run when asked:
// --hibernate: a full room left 15 s with nothing but heartbeats (the object sleeps after 10) still knows both players
//   and still relays; --expiry=<s>: on a server started with `--var ROOM_LIMITS:{"joinWait":<s>}`, a room nobody joins
//   closes as expired after <s> seconds, and its link then finds nothing.
import assert from 'node:assert/strict';
import {CLOSE,ROOM} from './room.mjs';

const args=process.argv.slice(2),flag=name=>args.find(a=>a.startsWith(`--${name}`));
const base=args.find(a=>!a.startsWith('--'))||'ws://localhost:8787/api/ws',origin=flag('origin=')?.split('=')[1]||'http://localhost:4173';
function client(query,from=origin){
  const ws=new WebSocket(`${base}?${query}`,{headers:{Origin:from}}),got=[],waiters=[];
  const closed=new Promise(r=>ws.addEventListener('close',e=>r({code:e.code,reason:e.reason})));
  ws.addEventListener('message',e=>{got.push(e.data==='pong'?'pong':JSON.parse(e.data));for(const w of [...waiters])w();});
  const next=(type,ms=5000)=>new Promise((res,rej)=>{
    const look=()=>{const i=got.findIndex(m=>m===type||m.type===type);if(i<0)return false;res(got.splice(i,1)[0]);const w=waiters.indexOf(look);if(w>=0)waiters.splice(w,1);return true;};
    if(look())return;waiters.push(look);setTimeout(()=>rej(Error(`${query}: no ${type} (got ${JSON.stringify(got)})`)),ms);
  });
  return {next,closed,send:m=>ws.send(typeof m==='string'?m:JSON.stringify(m)),close:()=>ws.close()};
}
const step=(name,t0)=>console.log(`ok  ${name} (${Date.now()-t0} ms)`);

let t=Date.now();
const host=client('create=1'),made=await host.next('joined');
assert.equal(made.role,'host');assert.match(made.code,/^[2-9A-Z]{5}$/);step(`open a room, code ${made.code}`,t);
t=Date.now();const guest=client(`code=${made.code.toLowerCase()}`),g=await guest.next('joined');
assert.equal(g.peer,true);assert.deepEqual(await host.next('peer'),{type:'peer',present:true});step('join by code',t);
t=Date.now();host.send({type:'signal',data:{sdp:'offer'}});assert.deepEqual((await guest.next('signal')).data,{sdp:'offer'});
guest.send({type:'signal',data:{sdp:'answer'}});assert.deepEqual((await host.next('signal')).data,{sdp:'answer'});step('signalling both ways',t);
t=Date.now();for(let i=0;i<100;i++)host.send({type:'relay',data:i});for(let i=0;i<100;i++)assert.equal((await guest.next('relay')).data,i);step('relay 100 in order',t);
t=Date.now();guest.send('ping');assert.equal(await guest.next('pong'),'pong');step('heartbeat',t);
t=Date.now();const third=client(`room=${made.id}`);assert.equal((await third.next('error')).reason,'full');assert.equal((await third.closed).code,CLOSE.full);step('third player turned away',t);
t=Date.now();guest.close();await guest.closed;assert.deepEqual(await host.next('peer'),{type:'peer',present:false});
const back=client(`room=${made.id}&token=${g.token}`);assert.equal((await back.next('joined')).role,'guest');assert.deepEqual(await host.next('peer'),{type:'peer',present:true});step('place taken back by token',t);
t=Date.now();const stranger=client('create=1','https://stranger.example');
if(flag('any-origin')){assert.equal((await stranger.next('joined')).role,'host');stranger.close();await stranger.closed;step('stranger origin let in (--any-origin)',t);}
else{assert.equal((await stranger.next('error')).reason,'origin');assert.equal((await stranger.closed).code,CLOSE.origin);step('stranger origin refused',t);}
t=Date.now();back.send({type:'relay',data:'x'.repeat(ROOM.maxMessage)});assert.deepEqual(await back.closed,{code:CLOSE['too-big'],reason:'too-big'});
assert.deepEqual(await host.next('peer'),{type:'peer',present:false});step('too-large message cut off',t);
host.close();await host.closed;
if(flag('hibernate')){
  t=Date.now();const a=client('create=1'),ra=await a.next('joined'),b=client(`room=${ra.id}`);await b.next('joined');await a.next('peer');
  for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,1000));a.send('ping');await a.next('pong');}
  b.send({type:'relay',data:'awake'});assert.equal((await a.next('relay')).data,'awake');
  const c=client(`room=${ra.id}`);assert.equal((await c.next('error')).reason,'full','still knows both places');
  a.close();b.close();await Promise.all([a.closed,b.closed]);step('relays after 15 s of heartbeats only',t);
}
const expiry=flag('expiry=');
if(expiry){
  const s=Number(expiry.split('=')[1]);t=Date.now();const a=client('create=1'),ra=await a.next('joined');
  assert.deepEqual(await a.closed,{code:CLOSE.expired,reason:'expired'});
  const late=client(`room=${ra.id}`);assert.equal((await late.next('error')).reason,'not-found');step(`room nobody joined expired after ${((Date.now()-t)/1000).toFixed(1)} s (limit ${s} s)`,t);
}
console.log('PASS');
