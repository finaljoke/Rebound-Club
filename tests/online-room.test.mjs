import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM,CLOSE,normalizeCode,newHub,reserveCode,resolveCode,closeCode,newRoom,joinRoom,roomMessage,leaveRoom,nextWake,wakeRoom,originAllowed} from '../server/room.mjs';

// The online rooms' rules (server/room.mjs) on a hand-moved clock (seconds).
let tokens=0;const newToken=()=>`token-${++tokens}`;
const seeded=(seed=1)=>{let a=seed;return()=>{a=a*16807%2147483647;return a/2147483647;};};
const sends=(actions,role)=>actions.filter(a=>a.send===role).map(a=>a.data);
// A room with its host in, and (guest:true) its guest too.
function opened({guest=false,now=0}={}){
  const room=newRoom({id:'room-1',code:'2NCC6',now}),host=joinRoom(room,{create:true,now,newToken});
  const g=guest?joinRoom(room,{now,newToken}):null;return {room,host,guest:g};
}
const msg=(room,role,data,now=1,buckets={})=>{const text=typeof data==='string'?data:JSON.stringify(data);return roomMessage(room,{role,text,bytes:Buffer.byteLength(text),now,buckets});};

test('房间码：5 位，28 个不易看错的字符；输入不分大小写，可以带空格和短横', ()=>{
  assert.equal(ROOM.alphabet.length,28);assert.equal(new Set(ROOM.alphabet).size,28);
  for(const ch of '0O1IL8BU')assert.ok(!ROOM.alphabet.includes(ch),`不该有 ${ch}`);
  assert.equal(normalizeCode(' 2nc-c6 '),'2NCC6');
  for(const bad of ['2NCC','2NCC66','2NCC0','2NCCO',null])assert.equal(normalizeCode(bad),null,String(bad));
  const hub=newHub(),random=seeded(7),codes=new Set();
  for(let i=0;i<300;i++){const r=reserveCode(hub,{id:`r${i}`,ip:`ip${i}`,now:0,random});assert.ok(r.code,JSON.stringify(r));codes.add(r.code);assert.equal(normalizeCode(r.code),r.code);}
  assert.equal(codes.size,300,'房间码不重复');
});

test('房间码只在 10 分钟内、对方进房前有效；停用后再空 10 分钟才会给别的房间', ()=>{
  const hub=newHub(),same=()=>0,{code}=reserveCode(hub,{id:'a',ip:'x',now:0,random:same});
  assert.equal(resolveCode(hub,{code:code.toLowerCase(),now:599}),'a');assert.equal(resolveCode(hub,{code,now:600}),null,'10 分钟后不再放人进来');
  assert.equal(reserveCode(hub,{id:'b',ip:'y',now:1,random:same}).error,'busy','同一个码还被占着');
  closeCode(hub,{code,now:10});assert.equal(resolveCode(hub,{code,now:11}),null,'对方进房后停用');
  assert.equal(reserveCode(hub,{id:'b',ip:'y',now:609,random:same}).error,'busy','停用后 10 分钟内还占着');
  assert.equal(reserveCode(hub,{id:'b',ip:'y',now:611,random:same}).code,code);
});

test('同一个地址每分钟最多开 10 个房间，别的地址不受影响，一分钟后恢复', ()=>{
  const hub=newHub(),random=seeded(3);
  for(let i=0;i<10;i++)assert.ok(reserveCode(hub,{id:`r${i}`,ip:'1.2.3.4',now:i,random}).code);
  assert.equal(reserveCode(hub,{id:'r10',ip:'1.2.3.4',now:20,random}).error,'rate');
  assert.ok(reserveCode(hub,{id:'r11',ip:'5.6.7.8',now:20,random}).code);
  assert.ok(reserveCode(hub,{id:'r12',ip:'1.2.3.4',now:61,random}).code);
});

test('进房：房主开房，访客凭码或链接进来，两边都知道对方在；第三个人进不来；凭令牌能把位置拿回来', ()=>{
  const {room,host}=opened();
  assert.equal(host.role,'host');assert.deepEqual(sends(host.actions,'host'),[{type:'joined',role:'host',id:'room-1',code:'2NCC6',token:host.token,peer:false}]);
  const guest=joinRoom(room,{now:5,newToken});
  assert.equal(guest.role,'guest');assert.deepEqual(guest.actions.filter(a=>a.closeCode),[{closeCode:'2NCC6'}],'访客进房后房间码停用');
  assert.equal(sends(guest.actions,'guest')[0].peer,true);assert.deepEqual(sends(guest.actions,'host'),[{type:'peer',present:true}]);
  assert.equal(joinRoom(room,{now:6,newToken}).error,'full');
  assert.equal(joinRoom(room,{token:'nope',now:6,newToken}).error,'token');
  assert.equal(joinRoom(room,{create:true,now:6,newToken}).error,'busy');
  assert.equal(joinRoom(null,{now:6,newToken}).error,'not-found');
  // The host comes back on a new connection while the old one is still open: the old one is let go.
  const back=joinRoom(room,{token:host.token,now:7,newToken});
  assert.equal(back.role,'host');assert.equal(back.token,host.token);
  assert.deepEqual(back.actions[0],{close:'host',code:CLOSE.replaced,reason:'replaced'});
  assert.equal(sends(back.actions,'host')[0].peer,true);
});

test('没人进房：10 分钟后访客进不来，房间关掉房主的连接，并报告它转了多少消息', ()=>{
  const {room}=opened();
  assert.equal(nextWake(room),ROOM.joinWait);
  assert.equal(joinRoom(room,{now:ROOM.joinWait,newToken}).error,'expired');
  assert.deepEqual(wakeRoom(room,{now:ROOM.joinWait-1}),[],'还没到时间');
  const acts=wakeRoom(room,{now:ROOM.joinWait});
  assert.deepEqual(acts.filter(a=>a.close),[{close:'host',code:CLOSE.expired,reason:'expired'}]);
  assert.deepEqual(acts.find(a=>a.log).log,{room:'2NCC6',seconds:ROOM.joinWait,received:0,relayed:0,signal:0});
  assert.equal(nextWake(room),null);assert.equal(joinRoom(room,{token:'x',now:1,newToken}).error,'not-found');
});

test('消息：信令和中转原样交给对方并计数；心跳只回 pong；对方不在时丢掉', ()=>{
  const {room}=opened({guest:true});
  assert.deepEqual(msg(room,'host',{type:'signal',data:{sdp:'offer'}}),[{send:'guest',data:{type:'signal',data:{sdp:'offer'}}}]);
  assert.deepEqual(msg(room,'guest',{type:'relay',data:[1,2]}),[{send:'host',data:{type:'relay',data:[1,2]}}]);
  assert.deepEqual(msg(room,'guest','ping'),[{send:'guest',data:'pong'}]);
  assert.deepEqual(msg(room,'host',{type:'keep'}),[],'其他类型只算活动，不转发');
  leaveRoom(room,{role:'guest',now:2});
  assert.deepEqual(msg(room,'host',{type:'relay',data:3},3),[]);
  assert.deepEqual(room.counts,{received:4,relayed:1,signal:1},'心跳不计数');
});

test('消息太大、太快、读不懂：断开这条连接，对方得知它离开', ()=>{
  for(const [why,run] of [
    ['too-big',room=>msg(room,'guest','{"type":"relay","data":"'+'x'.repeat(ROOM.maxMessage)+'"}')],
    ['bad-message',room=>msg(room,'guest','{nope')],
    ['too-fast',room=>{const buckets={};let acts=[];for(let i=0;i<=ROOM.burst&&!acts.some(a=>a.close);i++)acts=msg(room,'guest',{type:'relay',data:i},1,buckets);return acts;}]
  ]){
    const {room}=opened({guest:true}),acts=run(room);
    assert.deepEqual(acts.filter(a=>a.close),[{close:'guest',code:CLOSE[why],reason:why}],why);
    assert.deepEqual(sends(acts,'host'),[{type:'peer',present:false}],why);assert.equal(room.present.guest,false,why);
  }
  // At the average rate a match sends at (and at the limit), nothing is cut off.
  const {room}=opened({guest:true}),buckets={};
  for(let i=0;i<ROOM.rate*10;i++)assert.ok(!msg(room,'guest',{type:'relay',data:i},1+i/ROOM.rate,buckets).some(a=>a.close),`第 ${i} 条`);
});

test('离开：对方得知；两人都断开后房间等 2 分钟重连，没有消息 10 分钟后关闭', ()=>{
  const {room,guest}=opened({guest:true});
  assert.deepEqual(leaveRoom(room,{role:'guest',now:10}),[{send:'host',data:{type:'peer',present:false}}]);
  assert.deepEqual(leaveRoom(room,{role:'guest',now:11}),[],'已经离开的不再通知');
  leaveRoom(room,{role:'host',now:20});assert.equal(nextWake(room),20+ROOM.emptyKeep);
  // Back in time: the room is kept for the token's owner.
  assert.equal(joinRoom(room,{token:guest.token,now:30,newToken}).role,'guest');assert.equal(room.emptySince,null);
  assert.equal(nextWake(room),30+ROOM.idleKeep,'对方进过房以后，只看多久没消息');
  msg(room,'guest',{type:'keep'},100);assert.equal(nextWake(room),100+ROOM.idleKeep);
  assert.deepEqual(wakeRoom(room,{now:100+ROOM.idleKeep}).filter(a=>a.close),[{close:'guest',code:CLOSE.expired,reason:'expired'}]);
});

test('来源白名单：列表里的才放行；* 全放行；没有来源只在 * 时放行', ()=>{
  const list='https://reboundclub.example, http://localhost:4173';
  assert.ok(originAllowed('https://reboundclub.example',list));assert.ok(originAllowed('http://localhost:4173',list));
  assert.ok(!originAllowed('https://evil.example',list));assert.ok(!originAllowed(undefined,list));assert.ok(!originAllowed('x',''));
  assert.ok(originAllowed(undefined,'*'));assert.ok(originAllowed('https://any.example','*'));
});
