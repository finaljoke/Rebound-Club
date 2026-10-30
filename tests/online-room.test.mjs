import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM,CLOSE,normalizeCode,newHub,reserveCode,resolveCode,closeCode,holdCode,cleanName,newRoom,joinRoom,roomMessage,leaveRoom,nextWake,wakeRoom,originAllowed} from '../server/room.mjs';

// The online rooms' rules (server/room.mjs) on a hand-moved clock (seconds).
let tokens=0;const newToken=()=>`token-${++tokens}`;
const seeded=(seed=1)=>{let a=seed;return()=>{a=a*16807%2147483647;return a/2147483647;};};
const sends=(actions,place)=>actions.filter(a=>a.send===place).map(a=>a.data);
const heard=(actions,place,type)=>sends(actions,place).filter(d=>d.type===type);
const lastSnap=actions=>actions.filter(a=>a.data?.type==='room').at(-1)?.data;
// A P1 room (two places) with its host in, and (guest:true) its guest too.
function opened({guest=false,now=0}={}){
  const room=newRoom({id:'room-1',code:'2NCC6',now}),host=joinRoom(room,{create:true,now,newToken});
  const g=guest?joinRoom(room,{now,newToken}):null;return {room,host,guest:g};
}
const msg=(room,place,data,now=1,buckets={},random)=>{const text=typeof data==='string'?data:JSON.stringify(data);return roomMessage(room,{place,text,bytes:Buffer.byteLength(text),now,buckets,random});};
// An arena room (v=2) with `names.length` members in, the first one its opener.
function arena(names=['阿甲','阿乙','阿丙'],now=0){
  const room=newRoom({id:'room-9',code:'ARENA',now,v:2});
  const joins=names.map((name,i)=>joinRoom(room,{create:i===0,name,now,newToken}));
  return {room,joins};
}
// The two called say ready: the match starts.
const play=(room,now=1)=>{const n=room.match.n;msg(room,room.court.a,{type:'ready',n},now);return msg(room,room.court.b,{type:'ready',n},now);};
const goal=(room,place,score,winner=null,now=2)=>msg(room,place,{type:'feed',n:room.match.n,msgs:[{type:'pos',x:0},{type:'goal',side:'a',score,winner}]},now);

// --- P1 rooms --------------------------------------------------------------------------------------------------------

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

test('P1 房间：房主开房，访客凭码或链接进来，两边都知道对方在；第三个人进不来；凭令牌能把位置拿回来', ()=>{
  const {room,host}=opened();
  assert.equal(host.place,'p1');assert.deepEqual(sends(host.actions,'p1'),[{type:'joined',role:'host',id:'room-1',code:'2NCC6',token:host.token,peer:false}]);
  const guest=joinRoom(room,{now:5,newToken});
  assert.equal(guest.place,'p2');assert.equal(sends(guest.actions,'p2')[0].role,'guest');
  assert.deepEqual(guest.actions.filter(a=>a.closeCode),[{closeCode:'2NCC6'}],'访客进房后房间码停用');
  assert.equal(sends(guest.actions,'p2')[0].peer,true);assert.deepEqual(sends(guest.actions,'p1'),[{type:'peer',present:true}]);
  assert.equal(joinRoom(room,{now:6,newToken}).error,'full');
  assert.equal(joinRoom(room,{token:'nope',now:6,newToken}).error,'token');
  assert.equal(joinRoom(room,{create:true,now:6,newToken}).error,'busy');
  assert.equal(joinRoom(null,{now:6,newToken}).error,'not-found');
  // The host comes back on a new connection while the old one is still open: the old one is let go.
  const back=joinRoom(room,{token:host.token,now:7,newToken});
  assert.equal(back.place,'p1');assert.equal(back.token,host.token);
  assert.deepEqual(back.actions[0],{close:'p1',code:CLOSE.replaced,reason:'replaced'});
  assert.equal(sends(back.actions,'p1')[0].peer,true);assert.equal(sends(back.actions,'p2').length,0,'对方没变，不再通知');
});

test('P1 房间：不发擂台房的消息，擂台房的请求一律不理', ()=>{
  const {room}=opened({guest:true});
  for(const m of [{type:'ready',n:1},{type:'name',name:'X'},{type:'queue'},{type:'watch'},{type:'rules',rotation:'winner'},{type:'feed',n:1,msgs:[]}])
    assert.deepEqual(msg(room,'p1',m),[],m.type);
  assert.equal(room.match.phase,'idle');
});

test('没人进房：10 分钟后访客进不来，房间关掉房主的连接、放掉房间码，并报告它转了多少消息', ()=>{
  const {room}=opened();
  assert.equal(nextWake(room),ROOM.joinWait);
  assert.equal(joinRoom(room,{now:ROOM.joinWait,newToken}).error,'expired');
  assert.deepEqual(wakeRoom(room,{now:ROOM.joinWait-1}),[],'还没到时间');
  const acts=wakeRoom(room,{now:ROOM.joinWait});
  assert.deepEqual(acts.filter(a=>a.close),[{close:'p1',code:CLOSE.expired,reason:'expired'}]);
  assert.deepEqual(acts.filter(a=>a.closeCode),[{closeCode:'2NCC6'}]);
  assert.deepEqual(acts.find(a=>a.log).log,{room:'2NCC6',seconds:ROOM.joinWait,received:0,relayed:0,signal:0,feed:0});
  assert.equal(nextWake(room),null);assert.equal(joinRoom(room,{token:'x',now:1,newToken}).error,'not-found');
});

test('消息：信令和中转原样交给对方并计数；心跳只回 pong；对方不在时丢掉', ()=>{
  const {room}=opened({guest:true});
  assert.deepEqual(msg(room,'p1',{type:'signal',data:{sdp:'offer'}}),[{send:'p2',data:{type:'signal',data:{sdp:'offer'}}}]);
  assert.deepEqual(msg(room,'p2',{type:'relay',data:[1,2]}),[{send:'p1',data:{type:'relay',data:[1,2]}}]);
  assert.deepEqual(msg(room,'p2','ping'),[{send:'p2',data:'pong'}]);
  assert.deepEqual(msg(room,'p1',{type:'keep'}),[],'其他类型只算活动，不转发');
  leaveRoom(room,{place:'p2',now:2});
  assert.deepEqual(msg(room,'p1',{type:'relay',data:3},3),[]);
  assert.deepEqual(room.counts,{received:4,relayed:1,signal:1,feed:0},'心跳不计数');
});

test('消息太大、太快、读不懂：断开这条连接，对方得知它离开', ()=>{
  for(const [why,run] of [
    ['too-big',room=>msg(room,'p2','{"type":"relay","data":"'+'x'.repeat(ROOM.maxMessage)+'"}')],
    ['bad-message',room=>msg(room,'p2','{nope')],
    ['too-fast',room=>{const buckets={};let acts=[];for(let i=0;i<=ROOM.burst&&!acts.some(a=>a.close);i++)acts=msg(room,'p2',{type:'relay',data:i},1,buckets);return acts;}]
  ]){
    const {room}=opened({guest:true}),acts=run(room);
    assert.deepEqual(acts.filter(a=>a.close),[{close:'p2',code:CLOSE[why],reason:why}],why);
    assert.deepEqual(sends(acts,'p1'),[{type:'peer',present:false}],why);assert.equal(room.members.p2.present,false,why);
  }
  // At the average rate a match sends at (and at the limit), nothing is cut off.
  const {room}=opened({guest:true}),buckets={};
  for(let i=0;i<ROOM.rate*10;i++)assert.ok(!msg(room,'p2',{type:'relay',data:i},1+i/ROOM.rate,buckets).some(a=>a.close),`第 ${i} 条`);
});

test('离开：对方得知；两人都断开后房间等 2 分钟重连，没有消息 10 分钟后关闭；说了 bye 的位置就没了', ()=>{
  const {room,guest}=opened({guest:true});
  assert.deepEqual(leaveRoom(room,{place:'p2',now:10}),[{send:'p1',data:{type:'peer',present:false}}]);
  assert.deepEqual(leaveRoom(room,{place:'p2',now:11}),[],'已经离开的不再通知');
  leaveRoom(room,{place:'p1',now:20});assert.equal(nextWake(room),20+ROOM.emptyKeep);
  // Back in time: the room is kept for the token's owner.
  assert.equal(joinRoom(room,{token:guest.token,now:30,newToken}).place,'p2');assert.equal(room.emptySince,null);
  assert.equal(nextWake(room),30+ROOM.idleKeep,'对方进过房以后，只看多久没消息');
  msg(room,'p2',{type:'keep'},100);assert.equal(nextWake(room),100+ROOM.idleKeep);
  assert.deepEqual(wakeRoom(room,{now:100+ROOM.idleKeep}).filter(a=>a.close),[{close:'p2',code:CLOSE.expired,reason:'expired'}]);
  // bye: the place is given up (its token no longer works), and the other player hears it is gone.
  const two=opened({guest:true}),bye=msg(two.room,'p2',{type:'bye'},5);
  assert.deepEqual(bye.filter(a=>a.close),[{close:'p2',code:1000,reason:'bye'}]);assert.deepEqual(sends(bye,'p1'),[{type:'peer',present:false}]);
  assert.ok(!two.room.members.p2);assert.equal(joinRoom(two.room,{token:two.guest.token,now:6,newToken}).error,'token');
});

test('来源白名单：列表里的才放行；* 全放行；没有来源只在 * 时放行', ()=>{
  const list='https://reboundclub.example, http://localhost:4173';
  assert.ok(originAllowed('https://reboundclub.example',list));assert.ok(originAllowed('http://localhost:4173',list));
  assert.ok(!originAllowed('https://evil.example',list));assert.ok(!originAllowed(undefined,list));assert.ok(!originAllowed('x',''));
  assert.ok(originAllowed(undefined,'*'));assert.ok(originAllowed('https://any.example','*'));
});

// --- Arena rooms -----------------------------------------------------------------------------------------------------

test('擂台房：前两人上场、第三人起排队，最多 8 人；每次变化都给所有人发快照，场上两人知道对手和自己站哪边', ()=>{
  const {room,joins:[a,b,c]}=arena();
  const joined=sends(a.actions,'p1')[0];
  assert.deepEqual({role:joined.role,v:joined.v,member:joined.member,name:joined.name},{role:'host',v:2,member:'p1',name:'阿甲'});
  assert.deepEqual(heard(a.actions,'p1','peer'),[{type:'peer',present:false,pair:1,opponent:null,side:'a'}]);
  assert.deepEqual(heard(b.actions,'p1','peer'),[{type:'peer',present:true,pair:2,opponent:'p2',side:'a'}]);
  assert.deepEqual(heard(b.actions,'p2','peer'),[{type:'peer',present:true,pair:2,opponent:'p1',side:'b'}]);
  assert.equal(sends(b.actions,'p2')[0].role,'guest');
  const s=lastSnap(c.actions);
  assert.deepEqual(s.members,[{id:'p1',name:'阿甲',present:true,role:'player'},{id:'p2',name:'阿乙',present:true,role:'player'},{id:'p3',name:'阿丙',present:true,role:'queue'}]);
  assert.deepEqual([s.owner,s.max,s.court,s.queue,s.rules],['p1',8,{a:'p1',b:'p2'},['p3'],{rotation:'loser',sync:'catchup'}]);
  assert.deepEqual(s.match,{n:1,phase:'ready',score:{a:0,b:0},ready:[],readyIn:ROOM.readyWait});
  for(const p of ['p1','p2','p3'])assert.equal(heard(c.actions,p,'room').length,1,`${p} 收到快照`);
  assert.deepEqual(heard(c.actions,'p3','peer'),[{type:'peer',present:false,pair:null,opponent:null,side:null}]);
  // Watched now: both players hear it, once.
  assert.deepEqual(heard(c.actions,'p1','watching'),[{type:'watching',on:true}]);assert.deepEqual(heard(c.actions,'p2','watching'),[{type:'watching',on:true}]);
  for(let i=4;i<=8;i++)assert.ok(joinRoom(room,{now:1,newToken}).place,`第 ${i} 人`);
  assert.equal(joinRoom(room,{now:1,newToken}).error,'full');
  assert.deepEqual([room.members.p4.name,room.members.p8.name],['玩家 1','玩家 5'],'没给名字的叫「玩家 N」');
});

test('擂台房：房间码在房间开着时一直能进，关房时放掉；只有房间自己能续它的码', ()=>{
  const hub=newHub(),{code}=reserveCode(hub,{id:'room-9',ip:'x',now:0,random:()=>0});
  holdCode(hub,{code,id:'someone-else',now:500});assert.equal(resolveCode(hub,{code,now:ROOM.joinWait}),null,'别的房间续不了');
  holdCode(hub,{code,id:'room-9',now:500});assert.equal(resolveCode(hub,{code,now:1000}),'room-9');
  const {room}=arena(['阿甲']);room.code=code;
  assert.deepEqual(joinRoom(room,{now:ROOM.codeRefresh-1,newToken}).actions.filter(a=>a.holdCode||a.closeCode),[],'第二人进房，码不停用');
  assert.deepEqual(msg(room,'p1',{type:'keep'},ROOM.codeRefresh).filter(a=>a.holdCode),[{holdCode:code,id:'room-9'}]);
  assert.deepEqual(msg(room,'p1',{type:'keep'},ROOM.codeRefresh+1).filter(a=>a.holdCode),[],'续过以后要隔一阵');
  const shut=ROOM.codeRefresh+1+ROOM.idleKeep,close=wakeRoom(room,{now:shut});assert.deepEqual(close.filter(a=>a.closeCode),[{closeCode:code}]);
  closeCode(hub,{code,now:shut});assert.equal(resolveCode(hub,{code,now:shut+1}),null);
});

test('名字：去掉控制和换方向的字符，最长 12 个字（一个表情算一个），看不见的算没起名；重名加 (2)，可以改名', ()=>{
  const z=String.fromCodePoint,family=z(0x1F468,0x200D,0x1F469,0x200D,0x1F467);
  assert.equal(cleanName(`  小${z(0x200B)}明 ${z(0x202E)}  `),'小明');
  assert.equal(cleanName('一二三四五六七八九十甲乙丙'),'一二三四五六七八九十甲乙');
  assert.equal(cleanName(family.repeat(13)),family.repeat(12),'一家人的表情算一个字');
  assert.equal(cleanName(`a${z(0x0007)}b`),'ab');
  for(const blank of ['','   ',z(0x200D),z(0x3000),null])assert.equal(cleanName(blank),'',JSON.stringify(blank));
  const {room}=arena(['Bob','Bob','',''].concat(['十二个字的名字一二三四五','十二个字的名字一二三四五']));
  assert.deepEqual(Object.values(room.members).map(m=>m.name),['Bob','Bob(2)','玩家 1','玩家 2','十二个字的名字一二三四五','十二个字的名字一二(2)']);
  assert.equal(lastSnap(msg(room,'p3',{type:'name',name:'阿丙'})).members[2].name,'阿丙');
  msg(room,'p4',{type:'name',name:''});assert.equal(room.members.p4.name,'玩家 1','改成空的，用回最小的「玩家 N」');
  msg(room,'p1',{type:'name',name:'阿丙'});assert.equal(room.members.p1.name,'阿丙(2)');
});

test('开局：两人都准备好才开始，房间发编号、同步方式和谁站哪边；局编号不对、不在场上的都不算；规则只有房主能改', ()=>{
  const {room}=arena();
  assert.deepEqual(msg(room,'p1',{type:'ready',n:2}),[],'编号不对');
  assert.deepEqual(msg(room,'p3',{type:'ready',n:1}),[],'排队的人不算');
  assert.deepEqual(lastSnap(msg(room,'p1',{type:'ready',n:1})).match.ready,['p1']);
  assert.deepEqual(msg(room,'p1',{type:'ready',n:1}),[],'说过了');
  const acts=msg(room,'p2',{type:'ready',n:1});
  for(const p of ['p1','p2'])assert.deepEqual(heard(acts,p,'start'),[{type:'start',n:1,sync:'catchup',blind:false,a:'p1',b:'p2'}]);
  assert.equal(heard(acts,'p3','start').length,0);assert.equal(lastSnap(acts).match.phase,'playing');
  assert.deepEqual(msg(room,'p2',{type:'rules',rotation:'winner',sync:'fullflight'}),[],'不是房主');
  const r=lastSnap(msg(room,'p1',{type:'rules',rotation:'both',sync:'blind'})).rules;assert.deepEqual(r,{rotation:'both',sync:'blind'});
  msg(room,'p1',{type:'rules',rotation:'everyone',sync:'teleport'});assert.deepEqual(room.rules,{rotation:'both',sync:'blind'},'不认识的值不改');
  // Blind: the room picks a sync at random and says it is blind.
  const two=arena(['A','B']).room;msg(two,'p1',{type:'rules',sync:'blind'});msg(two,'p1',{type:'ready',n:1});
  const s=heard(msg(two,'p2',{type:'ready',n:1},1,{},()=>0.9),'p1','start')[0];assert.deepEqual([s.sync,s.blind],['fullflight',true]);
});

test('记分：房间用转发的进球消息记分；观战流只转给候补和观众；有了胜者，所有人收到结果', ()=>{
  const {room}=arena();play(room);
  const one=goal(room,'p2',{a:1,b:0});
  assert.deepEqual(heard(one,'p3','feed'),[{type:'feed',n:1,side:'b',msgs:[{type:'pos',x:0},{type:'goal',side:'a',score:{a:1,b:0},winner:null}]}]);
  assert.equal(heard(one,'p1','feed').length,0,'不转给场上的人');assert.deepEqual(lastSnap(one).match.score,{a:1,b:0});
  assert.deepEqual(msg(room,'p1',{type:'feed',n:1,o:-2.5,msgs:[{type:'pos',x:1}]}),[{send:'p3',data:{type:'feed',n:1,side:'a',o:-2.5,msgs:[{type:'pos',x:1}]}}],'没有进球：只转发，带上时钟差');
  assert.deepEqual(msg(room,'p1',{type:'feed',n:9,msgs:[]}),[],'局编号不对');
  assert.deepEqual(msg(room,'p3',{type:'feed',n:1,msgs:[]}),[],'不在场上');
  goal(room,'p2',{a:1,b:'x'});assert.deepEqual(room.match.score,{a:1,b:0},'比分不像样就不认');
  const end=goal(room,'p2',{a:5,b:2},'a');
  for(const p of ['p1','p2','p3'])assert.deepEqual(heard(end,p,'result'),[{type:'result',n:1,winner:'p1',loser:'p2',score:{a:5,b:2},how:'score'}]);
  assert.deepEqual(lastSnap(end).last,{n:1,winner:'p1',loser:'p2',score:{a:5,b:2},how:'score'});
  assert.equal(room.counts.feed,4);
});

test('轮换：输的下、赢的下、两个都下；留在场上的人当甲方；没人排队时两人接着打', ()=>{
  const turn=(rotation,winner)=>{const {room}=arena(['A','B','C']);msg(room,'p1',{type:'rules',rotation});play(room);goal(room,'p1',{a:0,b:0},winner);return room;};
  let r=turn('loser','b');assert.deepEqual([r.court,r.queue],[{a:'p2',b:'p3'},['p1']],'输的下，赢的乙方改当甲方');
  assert.deepEqual([r.match.n,r.match.phase,r.match.readyBy],[2,'ready',2+ROOM.readyWait]);
  r=turn('winner','b');assert.deepEqual([r.court,r.queue],[{a:'p1',b:'p3'},['p2']],'赢的下');
  r=turn('both','a');assert.deepEqual([r.court,r.queue],[{a:'p3',b:'p1'},['p2']],'两个都下，排在队首的先上');
  const {room}=arena(['A','B']);play(room);const acts=goal(room,'p1',{a:5,b:0},'a');
  assert.deepEqual([room.court,room.queue,room.match.n,room.match.phase,room.match.readyBy],[{a:'p1',b:'p2'},[],2,'ready',null],'没人排队：都留下，也不催');
  assert.ok(!heard(acts,'p1','peer').length,'对手没变，不再通知');
});

test('准备超时：有人排队时，15 秒没准备的回队尾，准备好的留下；没人排队就一直等', ()=>{
  const {room}=arena(['A','B']);
  assert.equal(room.match.readyBy,null);assert.equal(nextWake(room),ROOM.idleKeep,'没人排队，不设时限');
  joinRoom(room,{name:'C',now:5,newToken});assert.equal(room.match.readyBy,5+ROOM.readyWait,'有人排队了才开始计时');
  msg(room,'p1',{type:'ready',n:1},6);assert.equal(nextWake(room),5+ROOM.readyWait);
  const acts=wakeRoom(room,{now:5+ROOM.readyWait});
  assert.deepEqual([room.court,room.queue,room.match.ready,room.match.n],[{a:'p1',b:'p3'},['p2'],['p1'],1]);
  assert.deepEqual(heard(acts,'p1','peer'),[{type:'peer',present:true,pair:3,opponent:'p3',side:'a'}],'甲方得知换了对手');
  assert.equal(room.match.readyBy,5+2*ROOM.readyWait,'新上来的人也有 15 秒');
  // The one queued goes to watch: nobody is queued at the deadline, so nobody is moved.
  msg(room,'p2',{type:'watch'},10);wakeRoom(room,{now:5+2*ROOM.readyWait});
  assert.deepEqual([room.court,room.queue,room.match.readyBy],[{a:'p1',b:'p3'},[],null]);
});

test('掉线：比赛中掉线 30 秒、有人排队就判负，候补上场；没人排队时房主可以结束这一局', ()=>{
  let {room}=arena();play(room);
  assert.deepEqual(heard(leaveRoom(room,{place:'p2',now:10}),'p1','peer'),[{type:'peer',present:false,pair:2,opponent:'p2',side:'a'}]);
  assert.equal(nextWake(room),10+ROOM.goneWait);
  const acts=wakeRoom(room,{now:10+ROOM.goneWait});
  assert.deepEqual(heard(acts,'p3','result'),[{type:'result',n:1,winner:'p1',loser:'p2',score:{a:0,b:0},how:'forfeit'}]);
  assert.deepEqual([room.court,room.queue],[{a:'p1',b:'p3'},[]],'掉线的人不进队列，回来后去观战');
  // Nobody queued: no deadline for the one gone; the owner ends the match.
  ({room}=arena(['A','B']));play(room);leaveRoom(room,{place:'p2',now:10});
  assert.equal(nextWake(room),10+ROOM.awayKeep,'没人排队，只等它回来');
  joinRoom(room,{name:'C',now:11,newToken});msg(room,'p3',{type:'watch'},12);
  assert.deepEqual(msg(room,'p3',{type:'end',n:1},13),[],'不是房主');
  const ended=msg(room,'p1',{type:'end',n:1},14);
  assert.equal(heard(ended,'p3','result')[0].how,'ended');assert.deepEqual([room.court,room.match.phase],[{a:'p1',b:null},'idle']);
  ({room}=arena(['A','B']));play(room);assert.deepEqual(msg(room,'p1',{type:'end',n:1}),[],'两人都在，不能结束');
});

test('离开和交接：比赛中离开判负；房主掉线 30 秒交给最早进房的在线成员；走开 10 分钟的人被移出房间', ()=>{
  let {room}=arena();play(room);
  const left=msg(room,'p2',{type:'bye'},5);
  assert.equal(heard(left,'p1','result')[0].how,'left');assert.ok(!room.members.p2);assert.deepEqual(room.court,{a:'p1',b:'p3'});
  ({room}=arena(['A','B','C','D']));leaveRoom(room,{place:'p1',now:10});leaveRoom(room,{place:'p2',now:10});
  // Two queued: the two called had 15 s to be ready, and are gone; they go off to watch, not to the queue.
  assert.equal(nextWake(room),ROOM.readyWait);wakeRoom(room,{now:ROOM.readyWait});
  assert.deepEqual([room.court,room.queue],[{a:'p3',b:'p4'},[]]);
  assert.equal(nextWake(room),10+ROOM.ownerWait);
  assert.equal(lastSnap(wakeRoom(room,{now:10+ROOM.ownerWait})).owner,'p3','交给最早进房、还在线的人');
  assert.equal(sends(joinRoom(room,{token:room.members.p1.token,now:50,newToken}).actions,'p1')[0].role,'guest','原房主回来不再是房主');
  const gone=wakeRoom(room,{now:10+ROOM.awayKeep});assert.ok(!room.members.p2,'p2 走开太久');
  assert.deepEqual(lastSnap(gone).members.map(m=>m.id),['p1','p3','p4']);
  ({room}=arena(['A','B']));msg(room,'p1',{type:'bye'});assert.equal(room.owner,'p2','房主说 bye，马上交接');
});

test('信令和中转只在场上两人之间，带着这一对的编号；编号对不上、不在场上的都丢掉；没人看了，场上两人得知', ()=>{
  const {room}=arena();
  assert.deepEqual(msg(room,'p1',{type:'signal',pair:2,data:{sdp:1}}),[{send:'p2',data:{type:'signal',data:{sdp:1},pair:2}}]);
  assert.deepEqual(msg(room,'p2',{type:'relay',pair:2,data:[7]}),[{send:'p1',data:{type:'relay',data:[7],pair:2}}]);
  assert.deepEqual(msg(room,'p1',{type:'signal',pair:1,data:{sdp:'old'}}),[],'上一对的信令');
  assert.deepEqual(msg(room,'p3',{type:'signal',pair:2,data:{}}),[],'不在场上');
  const bye=msg(room,'p3',{type:'bye'});
  assert.deepEqual(heard(bye,'p1','watching'),[{type:'watching',on:false}]);assert.deepEqual(heard(bye,'p2','watching'),[{type:'watching',on:false}]);
});
