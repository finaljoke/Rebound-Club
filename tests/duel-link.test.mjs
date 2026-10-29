import test from 'node:test';
import assert from 'node:assert/strict';
import {createStream,createLink,roomsServer,ROOMS_API} from '../dist/duel-link.mjs';
import {createClient} from '../dist/duel-net.mjs';
import {createBot} from '../dist/duel-bot.mjs';
import {createDevServer} from '../scripts/serve.mjs';

// The online link (dist/duel-link.mjs): its ordered stream on two hand-driven paths, then whole links through the dev
// server's room stand-in, relay only (Node has no WebRTC; the direct channel is checked in a browser by online-qa).

// Two streams joined by two paths each way; a path holds frames until flushed, can be cut (it then refuses frames), and
// can lose what it holds (a channel that died with frames on it).
function pair(){
  const paths={},got={a:[],b:[]};
  const make=(me,to)=>createStream({deliver:(kind,msg)=>got[me].push(kind+msg),
    sendOn:(path,frames,many)=>{const q=paths[`${me}${path}`];if(q.cut)return false;for(const f of many?frames:[frames])q.held.push(JSON.parse(JSON.stringify(f)));return true;}});
  for(const k of ['adirect','arelay','bdirect','brelay'])paths[k]={held:[],cut:false};
  const s={a:make('a','b'),b:make('b','a')};
  const flush=(from,path)=>{const q=paths[`${from}${path}`],to=from==='a'?'b':'a';for(const f of q.held.splice(0))s[to].receive(f);};
  return {s,got,paths,flush};
}

test('有序流：按序交付、只交付一次；换通道时把对方没确认的重发，丢在半路的也补上', ()=>{
  const {s,got,paths,flush}=pair();
  for(let i=1;i<=5;i++)s.a.send('g',i);s.a.send('c','start');flush('a','relay');
  assert.deepEqual(got.b,['g1','g2','g3','g4','g5','cstart']);
  // B confirms only up to 3 (its later frames are still on the way), then A moves to the direct path.
  s.b.send('g','x');paths.brelay.held[0].a=3;flush('b','relay');assert.equal(s.a.pending,3);
  for(let i=6;i<=8;i++)s.a.send('g',i);
  paths.arelay.held.length=0;                 // 6–8 die on the relay
  s.a.use('direct');assert.equal(paths.adirect.held.length,6,'4–8 再发一遍（含已到的 4、5）');
  flush('a','direct');
  assert.deepEqual(got.b,['g1','g2','g3','g4','g5','cstart','g6','g7','g8'],'不重复、不缺');
  s.b.send('g','y');flush('b','relay');assert.equal(s.a.pending,0,'确认后清掉');
  assert.deepEqual(got.a,['gx','gy']);
});

test('有序流：后面的先到会先收着，等前面的到了一起按序交付；通道不收时留着，下次重发再走', ()=>{
  const {s,got,paths,flush}=pair();
  s.a.send('g',1);s.a.send('g',2);s.a.send('g',3);
  const [f1,f2,f3]=paths.arelay.held.splice(0);
  s.b.receive(f3);s.b.receive(f2);assert.deepEqual(got.b,[]);
  s.b.receive(f1);assert.deepEqual(got.b,['g1','g2','g3']);
  paths.arelay.cut=true;s.a.send('g',4);assert.equal(paths.arelay.held.length,0);
  paths.arelay.cut=false;s.a.resend();flush('a','relay');assert.deepEqual(got.b,['g1','g2','g3','g4']);
});

test('房间地址：开发服务器的页面连本机替身，其他连线上 Worker；?api= 可以指定', ()=>{
  assert.equal(roomsServer({port:'4173',protocol:'http:',host:'192.168.1.5:4173',search:''}),'ws://192.168.1.5:4173/api/ws');
  assert.equal(roomsServer({port:'',protocol:'https:',host:'reboundclub.example',search:''}),ROOMS_API);
  assert.equal(roomsServer({port:'',protocol:'https:',host:'x',search:'?api=ws://127.0.0.1:8787/api/ws'}),'ws://127.0.0.1:8787/api/ws');
});

// --- Whole links on the room stand-in ---------------------------------------------------------------------------------
async function serve(){
  const server=createDevServer(),sockets=new Set();server.on('upgrade',(r,sk)=>{sockets.add(sk);sk.on('close',()=>sockets.delete(sk));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {url:`ws://127.0.0.1:${server.address().port}/api/ws`,close:()=>new Promise(r=>{for(const sk of sockets)sk.destroy();server.close(r);})};
}
const until=async(check,ms=4000,what='')=>{const t0=Date.now();while(!check()){if(Date.now()-t0>ms)throw Error(`等太久：${what}`);await new Promise(r=>setTimeout(r,10));}};
function watch(link){const seen={msgs:[],controls:[],events:[]};link.onMessage(m=>seen.msgs.push(m));link.onControl(c=>seen.controls.push(c));link.onEvent(e=>seen.events.push(e));return seen;}

test('中转：凭码进房，双向按序收发，控制消息和对局消息保持先后；关掉一边，另一边得知', async()=>{
  const s=await serve();
  try{
    const host=createLink({server:s.url,join:{create:true},RTC:null}),hs=watch(host),me=await host.ready;
    assert.equal(me.role,'host');assert.match(me.code,/^[2-9A-Z]{5}$/);
    const guest=createLink({server:s.url,join:{code:me.code.toLowerCase()},RTC:null}),gs=watch(guest);
    assert.equal((await guest.ready).role,'guest');await until(()=>host.peer&&guest.peer,4000,'双方到齐');
    assert.equal(host.mode,'relay');
    for(let i=0;i<60;i++){host.send({i});if(i===30)host.control({type:'start'});}
    for(let i=0;i<40;i++)guest.send({j:i});
    await until(()=>gs.msgs.length===60&&hs.msgs.length===40,4000,'消息到齐');
    assert.deepEqual(gs.msgs.map(m=>m.i),[...Array(60).keys()]);assert.deepEqual(hs.msgs.map(m=>m.j),[...Array(40).keys()]);
    assert.deepEqual(gs.controls,[{type:'start'}]);
    guest.close();await until(()=>!host.peer,4000,'房主得知对方离开');
    assert.deepEqual(hs.events.filter(e=>e.type==='peer').map(e=>e.present),[true,false]);
    host.close();
  }finally{await s.close();}
});

test('中转：连接断了自动凭令牌回来，断线期间双方发的消息一条不少、不重复、按序到', async()=>{
  const s=await serve();
  try{
    const host=createLink({server:s.url,join:{create:true},RTC:null}),hs=watch(host),{code}=await host.ready;
    const guest=createLink({server:s.url,join:{code},RTC:null}),gs=watch(guest);await guest.ready;await until(()=>host.peer&&guest.peer);
    for(let i=0;i<20;i++)host.send({i});await until(()=>gs.msgs.length===20);
    guest.debug.dropSocket();
    // While the guest is away: the host's frames are dropped by the room, the guest's cannot go out.
    for(let i=20;i<50;i++)host.send({i});for(let j=0;j<10;j++)guest.send({j});
    await until(()=>gs.events.some(e=>e.type==='retry'),4000,'访客重连');
    await until(()=>gs.msgs.length===50&&hs.msgs.length===10,8000,'补发到齐');
    assert.deepEqual(gs.msgs.map(m=>m.i),[...Array(50).keys()]);assert.deepEqual(hs.msgs.map(m=>m.j),[...Array(10).keys()]);
    assert.equal(guest.room.role,'guest');host.close();guest.close();
  }finally{await s.close();}
});

test('房间码不对：ready 报出原因，连接结束', async()=>{
  const s=await serve();
  try{
    const link=createLink({server:s.url,join:{code:'ZZZZZ'},RTC:null}),seen=watch(link);
    await assert.rejects(link.ready,/not-found/);await until(()=>seen.events.some(e=>e.type==='closed'));
    assert.equal(seen.events.find(e=>e.type==='closed').reason,'not-found');
  }finally{await s.close();}
});

test('中转上跑真实的对战同步：两个 AI 隔着连接打，第一个进球两边比分一致', async()=>{
  const s=await serve();
  try{
    const host=createLink({server:s.url,join:{create:true},RTC:null}),{code}=await host.ready;
    const guest=createLink({server:s.url,join:{code},RTC:null});await guest.ready;await until(()=>host.peer&&guest.peer);
    const now=()=>performance.now()/1000,a=createClient({side:'a',transport:host,now}),b=createClient({side:'b',transport:guest,now});
    const bots={a:createBot({seed:11}),b:createBot({seed:12})};a.start();b.start();
    const goal=c=>c.state.score.a+c.state.score.b;
    await new Promise((res,rej)=>{let last=now();const t0=Date.now();
      const id=setInterval(()=>{const t=now(),dt=Math.min(.05,t-last);last=t;
        for(const [c,bot] of [[a,bots.a],[b,bots.b]]){const d=bot.decide(c.view(),dt);c.step(dt,{axis:d.axis,swing:d.swing,skill:d.skill});c.state.events=[];}
        if(goal(a)>0&&goal(b)>0){clearInterval(id);res();}else if(Date.now()-t0>45000){clearInterval(id);rej(Error('45 秒内没有进球'));}},1000/60);});
    await until(()=>goal(a)===goal(b),2000,'两边比分对上');assert.deepEqual(a.state.score,b.state.score);
    host.close();guest.close();
  }finally{await s.close();}
});
