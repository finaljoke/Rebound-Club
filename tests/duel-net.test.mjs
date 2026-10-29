import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoopback,createClient} from '../dist/duel-net.mjs';
import {createBot} from '../dist/duel-bot.mjs';
import {COURT,localBall} from '../dist/duel-core.mjs';

const DT=1/120,HITS=['hit','perfect','soft','spin','burst'];
// Two clients on one virtual clock over a loopback, each played by a bot from its own client's view.
// onBefore runs ahead of each step's clients, onStep after them.
function match({delayMs=150,jitterMs=30,seed=1,cap=120*600,sync,onBefore,onStep}={}){
  let T=0;const now=()=>T,loop=createLoopback({delayMs,jitterMs,seed,now});
  const clients={a:createClient({side:'a',transport:loop[0],now,sync}),b:createClient({side:'b',transport:loop[1],now,sync})};
  const bots={a:createBot({seed:seed*2+1}),b:createBot({seed:seed*2+2})},goals={a:[],b:[]};
  for(const c of Object.values(clients))c.start();
  for(let f=0;f<cap&&!(clients.a.state.phase==='won'&&clients.b.state.phase==='won');f++){
    T+=DT;loop.flush();onBefore?.(clients,loop,f);
    for(const side of ['a','b']){const c=clients[side],d=bots[side].decide(c.view(),DT);c.step(DT,{axis:d.axis,swing:d.swing,skill:d.skill});
      for(const e of c.state.events)if(e.type==='goal')goals[side].push(e.side);}
    onStep?.(clients,loop,f);
    // Read once, like the page does: a finished match no longer steps, so its last events would otherwise linger.
    for(const c of Object.values(clients))c.state.events=[];
  }
  return {clients,goals};
}

test('回环 150±30 毫秒、双方都是机器人打 20 局：两边每局比分、胜者完全一致，每个进球两边各出现一次', ()=>{
  for(let m=0;m<20;m++){
    const {clients:{a,b},goals}=match({seed:m+1});
    assert.equal(a.state.phase,'won',`第 ${m+1} 局 A 端未结束`);assert.equal(b.state.phase,'won',`第 ${m+1} 局 B 端未结束`);
    assert.deepEqual(a.state.score,b.state.score,`第 ${m+1} 局比分`);assert.equal(a.state.winner,b.state.winner);
    const total=a.state.score.a+a.state.score.b;
    assert.equal(goals.a.length,total,`第 ${m+1} 局 A 端进球事件`);assert.equal(goals.b.length,total,`第 ${m+1} 局 B 端进球事件`);
    assert.deepEqual(goals.a,goals.b,`第 ${m+1} 局进球顺序`);
  }
});

test('收到击球消息追帧后，接收方的球与发送方同一时刻的球相差不超过 0.05 米（从第 3 条起）', ()=>{
  let worst=0,checked=0;const seen={a:0,b:0};
  for(let m=0;m<4;m++)match({seed:100+m,cap:120*120,onStep:(c)=>{
    for(const side of ['a','b']){const me=c[side].state,them=c[side==='a'?'b':'a'].state;
      for(const e of me.events)if(HITS.includes(e.type)&&e.side!==side&&++seen[side]>=3){
        const d=Math.hypot(me.ball.x-them.ball.x,me.ball.z-them.ball.z);worst=Math.max(worst,d);checked++;}}
  }});
  assert.ok(checked>=50,`只比对了 ${checked} 次`);assert.ok(worst<=.05,`最大偏差 ${worst.toFixed(4)} 米`);
});

test('一条击球消息晚到 2 秒：接收方的球停在发送方的球门线上等待，收到后继续，比分不出错', ()=>{
  let armed=false,heldAt=null,crossed=false,released=false,before=null,struck=false;
  const {clients:{a,b}}=match({seed:7,delayMs:60,jitterMs:10,cap:120*400,onStep:(c,loop)=>{
    const s=c.a.state,sb=c.b.state;
    // After a few exchanges, hold back B's next strike.
    // A burst is left out: its launch ends a charge the receiver already freezes for ('skill'), not a line it holds at.
    if(!armed&&s.shots>=4&&s.ball.vz>0){armed=true;before=sb.shot;loop.delayNext(m=>m.type==='hit'&&m.side==='b'&&m.event!=='burst',2000);}
    // The watch starts once B has struck in its own copy: the bot misses now and then, and a ball it lets in (or a wide
    // ball off its end wall) is not the late strike; the held-back message is B's next strike, whenever it comes.
    if(armed&&!struck&&sb.shot!==before&&sb.shot?.side==='b'&&sb.shot.kind!=='burst')struck=true;
    if(struck&&!released){if(s.ball.z>COURT+1e-9)crossed=true;if(s.hold&&heldAt===null)heldAt=s.ball.z;if(heldAt!==null&&!s.hold)released=true;}
  }});
  assert.ok(armed,'没有触发延迟');assert.ok(heldAt!==null,'接收方没有停下等待');assert.ok(Math.abs(heldAt-COURT)<1e-6,`停在 z=${heldAt}`);
  assert.ok(!crossed,'球越过了发送方的球门线');assert.ok(released,'收到消息后没有继续');
  assert.equal(a.state.phase,'won');assert.deepEqual(a.state.score,b.state.score);
});

// AC21 stand-in report (2026-10-29): position and swing went out 30 times a second while a strike went at once, so about
// a third of returns turned on the receiver's screen before the far punch was drawn. A swing's start now goes out ahead.
test('对手的击球在本方生效时，本方画面里对手的拳已经在挥（0 / 150 / 250 毫秒）', ()=>{
  for(const delayMs of [0,150,250]){let seen=0,late=0;const last={a:null,b:null};
    match({seed:3,delayMs,jitterMs:delayMs*.2,cap:120*240,onStep:c=>{
      for(const side of ['a','b']){const st=c[side].state,shot=st.shot;if(shot===last[side])continue;last[side]=shot;
        if(!shot||shot.side===side)continue;seen++;if(!st.players[shot.side].swing)late++;}}});
    assert.ok(seen>=40,`${delayMs} 毫秒：只比对了 ${seen} 拍`);assert.equal(late,0,`${delayMs} 毫秒：${late}/${seen} 拍球先掉头、拳还没画`);}
});

// --- Full flight (createClient sync:'fullflight', Issue #3) -------------------------------------------------------
const FULL='fullflight',STRUCK=['hit','perfect','soft'];
// B's strikes as A's copy receives them: the ball, in B's view, against the point B struck it at.
const fromStrike=(s)=>{const l=localBall(s,'b');return {d:Math.hypot(l.x-s.shot.x,l.z-s.shot.z),v:Math.hypot(l.vx,l.vz)};};

test('出球放慢：回环 0/40/80/150 毫秒（抖动 20%）各打 5 局，两边每局比分、胜者一致，每个进球两边各出现一次', ()=>{
  for(const delayMs of [0,40,80,150])for(let m=0;m<5;m++){
    const {clients:{a,b},goals}=match({sync:FULL,delayMs,jitterMs:delayMs*.2,seed:200+m}),tag=`${delayMs} 毫秒第 ${m+1} 局`;
    assert.equal(a.state.phase,'won',`${tag} A 端未结束`);assert.equal(b.state.phase,'won',`${tag} B 端未结束`);
    assert.deepEqual(a.state.score,b.state.score,`${tag} 比分`);assert.equal(a.state.winner,b.state.winner);
    const total=a.state.score.a+a.state.score.b;
    assert.equal(goals.a.length,total,`${tag} A 端进球事件`);assert.equal(goals.b.length,total,`${tag} B 端进球事件`);
    assert.deepEqual(goals.a,goals.b,`${tag} 进球顺序`);
  }
});

test('出球放慢：往返延迟在上限内时，收到击球那一刻球就在对手的击球点上（不追帧）；超出上限时只追超出部分的一半', ()=>{
  for(const [delayMs,share] of [[40,0],[150,.5]]){
    let worst=0,checked=0,rtt=0;
    for(let m=0;m<3;m++)match({sync:FULL,delayMs,jitterMs:delayMs*.2,seed:300+m,cap:120*120,onStep:(c)=>{
      const s=c.a.state;for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'&&s.shots>2){
        rtt=c.a.clock.rtt;const {d,v}=fromStrike(s),flown=share*Math.max(0,rtt-.12);
        // One step of flight on top: a strike that arrives mid-step is moved by the rest of that step.
        worst=Math.max(worst,d-v*(flown+DT));checked++;}
    }});
    assert.ok(checked>=30,`${delayMs} 毫秒只比对了 ${checked} 次`);assert.ok(worst<=1e-6,`${delayMs} 毫秒（往返约 ${(rtt*1000).toFixed(0)} 毫秒）：多飞了 ${worst.toFixed(3)} 米`);
  }
});

test('出球放慢：自己打出去的球画得慢些但从不停住，最慢也有规则球速的 0.7 倍；对手回球时画出来的球已经到了它面前', ()=>{
  let frames=0,stalls=0,slowest=1,jumps=[];let was=null;
  for(let m=0;m<3;m++)match({sync:FULL,delayMs:40,jitterMs:8,seed:400+m,cap:120*120,
    onBefore:(c)=>{const s=c.a.state;was={out:c.a.outgoing,ball:{...c.a.view().ball},still:s.hitstop>0||s.hold||s.phase!=='playing'};},
    onStep:(c)=>{
      const s=c.a.state,v=c.a.view().ball;
      if(was.out&&c.a.outgoing&&!was.still&&!(s.hitstop>0||s.hold)&&s.phase==='playing'){
        const d=Math.hypot(v.x-was.ball.x,v.z-was.ball.z),step=Math.hypot(s.ball.vx,s.ball.vz)*DT;frames++;
        if(d<1e-9)stalls++;else slowest=Math.min(slowest,d/step);}
      // The drawn ball as B's return arrives, against where the return starts (A's view).
      for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'&&was.out){const l=localBall(s,'a');jumps.push(Math.hypot(l.x-was.ball.x,l.z-was.ball.z));}
    }});
  jumps.sort((x,y)=>x-y);const p90=jumps[Math.floor(jumps.length*.9)];
  assert.ok(frames>=2000,`只看了 ${frames} 帧`);assert.equal(stalls,0,`停住 ${stalls} 帧`);
  assert.ok(slowest>=.7&&slowest<1,`最慢 ${slowest.toFixed(3)} 倍`);
  assert.ok(jumps.length>=30&&p90<=.5,`回球时跳了 ${p90?.toFixed(2)} 米（第 90 百分位，${jumps.length} 次）`);
});

test('出球放慢：一条击球消息晚到 2 秒，画出来的球也停在对手的球门线前等，收到后继续，比分不出错', ()=>{
  let armed=false,held=false,crossed=false,released=false,before=null,struck=false;
  const {clients:{a,b}}=match({sync:FULL,seed:7,delayMs:60,jitterMs:10,cap:120*400,onStep:(c,loop)=>{
    const s=c.a.state,sb=c.b.state,drawn=c.a.view().ball;
    if(!armed&&s.shots>=4&&s.ball.vz>0){armed=true;before=sb.shot;loop.delayNext(m=>m.type==='hit'&&m.side==='b'&&m.event!=='burst',2000);}
    if(armed&&!struck&&sb.shot!==before&&sb.shot?.side==='b'&&sb.shot.kind!=='burst')struck=true;
    if(struck&&!released){if(drawn.z>COURT+1e-9||s.ball.z>COURT+1e-9)crossed=true;if(s.hold)held=true;if(held&&!s.hold)released=true;}
  }});
  assert.ok(armed,'没有触发延迟');assert.ok(held,'没有停下等待');assert.ok(!crossed,'球越过了对手的球门线');assert.ok(released,'收到消息后没有继续');
  assert.equal(a.state.phase,'won');assert.deepEqual(a.state.score,b.state.score);
});

test('出球放慢：对手击球的那一刻，它的出拳已经画出来（击球消息带着挥拳）', ()=>{
  let turns=0,shown=0;
  for(let m=0;m<3;m++)match({sync:FULL,delayMs:80,jitterMs:16,seed:500+m,cap:120*120,onStep:(c)=>{
    const s=c.a.state;for(const e of s.events)if(STRUCK.includes(e.type)&&e.side==='b'){turns++;if(s.players.b.swing?.hit)shown++;}
  }});
  assert.ok(turns>=30,`只看了 ${turns} 次`);assert.equal(shown,turns,`${turns-shown} 次球掉头时没有画出拳`);
});

test('出球放慢：对手放爆发蓄力时，画出来的球停在它锁住球的那一点（场景的倒计时环画在球上）', ()=>{
  let bursts=0,checked=0,worst=0,seen=null;
  for(let m=0;m<8&&bursts<3;m++)match({sync:FULL,delayMs:40,jitterMs:8,seed:600+m,cap:120*240,onStep:(c)=>{
    const s=c.a.state,k=s.phase==='skill'&&s.skill?.side==='b'?s.skill:null;if(!k)return;
    if(k!==seen){seen=k;bursts++;}
    // Past the 0.15 s ease from where the ball was drawn when the charge began.
    if(k.time>=.2){const v=c.a.view().ball;worst=Math.max(worst,Math.hypot(v.x+k.x,v.z-(COURT-k.z)));checked++;}
  }});
  assert.ok(bursts>=3&&checked>=30,`只看到 ${bursts} 次爆发、${checked} 帧`);assert.ok(worst<=1e-9,`偏离锁球点 ${worst.toFixed(3)} 米`);
});
