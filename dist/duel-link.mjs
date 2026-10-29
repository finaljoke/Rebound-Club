// Online link (P1, Issue #5): the transport duel-net.mjs's createClient runs over between two players' pages. A WebRTC
// data channel straight between them once one opens; until then, and whenever it goes quiet, the room's relay (the
// rooms' WebSocket, server/room.mjs). Either way createClient sees one ordered channel: every frame carries its number
// and the last number heard, so a switch resends what the other side has not confirmed, and nothing arrives twice or
// out of order. The room's WebSocket also carries the WebRTC signalling, and is opened again (with the place's token)
// when it drops.

// ice: STUN only (no TURN in P1: the room relays instead). heartbeat: seconds between frames on a quiet direct channel;
// silence: a direct channel this long without a frame is left for the relay; settle: how long a direct channel must keep
// beating after that before play goes back to it; keep: the room closes after 10 minutes without a message (its
// heartbeat does not count), so one goes every minute; ping/pingLost: the room heartbeat, and how long without its
// answer the socket counts as gone; retry: seconds between tries to get the room back; batch: bytes of frames sent as
// one relay message when many go at once (the room takes 8 KB a message, and 120 at once); redial/redials: how long the
// host waits for a direct channel before both start a fresh connection, and how many times.
export const LINK={ice:[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}],heartbeat:.5,silence:2.5,settle:5,
  keep:60,ping:15,pingLost:40,retry:[1,2,4,8,15],batch:6000,redial:10,redials:5};
// Refusals and closings that end a link for good (server/room.mjs CLOSE); any other drop is tried again.
const FINAL=['not-found','full','expired','origin','rate','busy','token','too-big','too-fast','bad-message','replaced'];

// The rooms' address: the dev server's stand-in for a page it serves (port 4173, any host on the LAN), else the
// Worker. ?api=<ws url> on the page overrides both.
export const ROOMS_API='wss://rebound-api.snowiscoming.com/api/ws';
export function roomsServer(loc=globalThis.location){
  const forced=new URLSearchParams(loc?.search??'').get('api');if(forced)return forced;
  if(loc?.port==='4173')return `${loc.protocol==='https:'?'wss':'ws'}://${loc.host}/api/ws`;
  return ROOMS_API;
}

// --- The ordered stream over two paths -------------------------------------------------------------------------------
// sendOn(path, frame) puts a frame on 'direct' or 'relay' and returns false when that path cannot take it now (it stays
// unconfirmed, and goes again with the next switch or resend). deliver(kind, msg): each message once, in order; kind
// 'g' (for createClient) or 'c' (the page's own control messages). Frames: {s, a, g|c} sequenced, or {a} (heard only).
export function createStream({sendOn,deliver}){
  let seq=0,heard=0,path='relay';const unacked=[],early=new Map();
  const confirm=a=>{while(unacked.length&&unacked[0].s<=a)unacked.shift();};
  return {
    get path(){return path;},get pending(){return unacked.length;},get heard(){return heard;},
    send(kind,msg){const f={s:++seq,a:heard,[kind]:msg};unacked.push(f);sendOn(path,f);},
    receive(f){
      if(Number.isFinite(f?.a))confirm(f.a);
      if(!Number.isFinite(f?.s)||f.s<=heard)return;
      early.set(f.s,f);
      while(early.has(heard+1)){const g=early.get(++heard);early.delete(heard);deliver('g' in g?'g':'c','g' in g?g.g:g.c);}
    },
    heardFrame(){return {a:heard};},
    // Play moves to the other path, or the same one came back: everything not yet confirmed goes again, in order.
    use(p){path=p;this.resend();},
    resend(){for(const f of unacked){f.a=heard;}if(unacked.length)sendOn(path,unacked,true);}
  };
}

// --- The link ----------------------------------------------------------------------------------------------------------
// join: {create:true} | {code} | {room, token}. The room's places are 'host' and 'guest' (the page plays them as sides
// a and b). Returns the transport createClient takes ({send, onMessage, close}) plus the room and the page's controls:
// ready (resolves with {role, id, code, token} once in, rejects with the refusal), control(msg)/onControl(fn) (start,
// pause, rematch: ordered with the match), onEvent(fn) ({type:'peer', present} | {type:'mode', mode:'relay'|'direct'} |
// {type:'closed', reason} | {type:'retry'}). WebSocket / RTC are the browser's, or stand-ins for tests (RTC null: relay
// only); now(): seconds, the clock createClient uses.
export function createLink({server=roomsServer(),join,WebSocket:WS=globalThis.WebSocket,RTC=globalThis.RTCPeerConnection,now=()=>performance.now()/1000,cfg=LINK}={}){
  const on={message:null,control:null,event:null},emit=e=>on.event?.(e);
  let ws=null,info=null,peer=false,closed=false,mode='relay',tries=0,lastPong=now(),pc=null,dc=null,polite=false,makingOffer=false,ignoreOffer=false;
  let lastDirect=-Infinity,beatSince=null,fellAt=-Infinity,dialedAt=0,redials=0;
  const stream=createStream({sendOn,deliver:(kind,msg)=>kind==='g'?on.message?.(msg,now()):on.control?.(msg)});
  let settle,fail;const ready=new Promise((res,rej)=>{settle=res;fail=rej;});ready.catch(()=>{});

  function sendOn(path,frames,many=false){
    const list=many?frames:[frames];
    if(path==='direct'){if(dc?.readyState!=='open')return false;for(const f of list)dc.send(JSON.stringify(f));return true;}
    if(ws?.readyState!==1)return false;
    // Many at once (a resend) go packed, so the room's limits see a few messages, not a hundred.
    let pack=[],size=0;const flush=()=>{if(pack.length)ws.send(JSON.stringify({type:'relay',data:pack.length===1?pack[0]:pack}));pack=[];size=0;};
    for(const f of list){const n=JSON.stringify(f).length;if(size+n>cfg.batch)flush();pack.push(f);size+=n;}
    flush();return true;
  }
  const take=data=>{for(const f of Array.isArray(data)?data:[data])stream.receive(f);};
  function setMode(m){if(m===mode)return;mode=m;stream.use(m);emit({type:'mode',mode:m});}

  // The room: its WebSocket, opened again with the place's token after a drop that is not final.
  function open(){
    const p=new URLSearchParams();
    if(info){p.set('room',info.id);p.set('token',info.token);}
    else if(join.create)p.set('create','1');else if(join.code)p.set('code',join.code);else{p.set('room',join.room);if(join.token)p.set('token',join.token);}
    const socket=ws=new WS(`${server}?${p}`);lastPong=now();
    socket.onopen=()=>{tries=0;if(mode==='relay')stream.resend();};
    socket.onmessage=e=>{
      if(socket!==ws)return;if(e.data==='pong'){lastPong=now();return;}
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='joined'){const first=!info;info={role:m.role,id:m.id,code:m.code,token:m.token};polite=m.role==='guest';if(first)settle({...info});setPeer(m.peer);}
      else if(m.type==='peer')setPeer(m.present);
      else if(m.type==='signal')onSignal(m.data);
      else if(m.type==='relay')take(m.data);
      else if(m.type==='error'){if(!info)fail(Error(m.reason));}
    };
    socket.onclose=e=>{
      if(socket!==ws||closed)return;ws=null;
      if(FINAL.includes(e.reason)||!info){closed=true;stop();emit({type:'closed',reason:e.reason||'gone'});fail(Error(e.reason||'gone'));return;}
      const wait=cfg.retry[Math.min(tries++,cfg.retry.length-1)];emit({type:'retry'});timer(()=>!closed&&open(),wait);
    };
  }
  function setPeer(present){
    if(present===peer)return;peer=present;emit({type:'peer',present});
    // The room drops what it cannot hand over, so on the other player's return the unconfirmed frames go again.
    if(present){redials=0;if(mode==='relay')stream.resend();startPeer();}else{dropPeer();setMode('relay');}
  }
  const signal=data=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'signal',data}));};

  // WebRTC, by MDN's perfect negotiation (the guest gives way when offers cross). Only the host opens the data channel,
  // so a connection starts with one offer: two crossing at the start left Chrome, now and then, with a polite side that
  // gathered no address after giving way.
  function startPeer(){
    if(!RTC||pc||!peer||closed)return;
    const conn=pc=new RTC({iceServers:cfg.ice});makingOffer=false;ignoreOffer=false;dialedAt=now();
    const wire=channel=>{
      dc=channel;
      channel.onmessage=e=>{if(conn!==pc)return;const t=now();if(t-lastDirect>cfg.silence)beatSince=t;lastDirect=t;
        let f;try{f=JSON.parse(e.data);}catch{return;}stream.receive(f);
        if(mode==='relay'&&(fellAt<0||t-fellAt>=cfg.settle)&&t-beatSince>=(fellAt<0?0:cfg.settle))setMode('direct');};
      channel.onopen=()=>{if(conn===pc)channel.send(JSON.stringify(stream.heardFrame()));};
    };
    if(polite)conn.ondatachannel=e=>{if(conn===pc&&e.channel.label==='match')wire(e.channel);};
    else wire(conn.createDataChannel('match',{ordered:true}));
    conn.onicecandidate=({candidate})=>{if(candidate&&conn===pc)signal({candidate});};
    conn.onnegotiationneeded=async()=>{try{makingOffer=true;await conn.setLocalDescription();if(conn===pc)signal({description:conn.localDescription});}catch{}finally{makingOffer=false;}};
    conn.onconnectionstatechange=()=>{if(conn===pc&&conn.connectionState==='failed')conn.restartIce?.();};
  }
  // A fresh start, both sides at once: the host asks for it when no direct channel opened in time.
  function redial(){dropPeer();startPeer();}
  async function onSignal({description,candidate,redial:again}={}){
    if(again){redial();return;}
    if(!pc)startPeer();const conn=pc;if(!conn)return;
    try{
      if(description){
        const collision=description.type==='offer'&&(makingOffer||conn.signalingState!=='stable');
        ignoreOffer=!polite&&collision;if(ignoreOffer)return;
        await conn.setRemoteDescription(description);
        if(description.type==='offer'){await conn.setLocalDescription();if(conn===pc)signal({description:conn.localDescription});}
      }else if(candidate){try{await conn.addIceCandidate(candidate);}catch(e){if(!ignoreOffer)throw e;}}
    }catch{}
  }
  function dropPeer(){try{pc?.close();}catch{}pc=null;dc=null;lastDirect=-Infinity;beatSince=null;}

  // The clocks: a beat on a quiet direct channel, the room's heartbeat and its keep-alive, and the watch for silence.
  const timers=[];
  function timer(fn,s){const id=setTimeout(fn,s*1000);timers.push(id);}
  function every(fn,s){const id=setInterval(fn,s*1000);timers.push(id);}
  every(()=>{if(dc?.readyState==='open')dc.send(JSON.stringify(stream.heardFrame()));
    // The direct channel went quiet: play goes to the relay at once, and the connection tries a fresh route.
    if(mode==='direct'&&now()-lastDirect>cfg.silence){fellAt=now();setMode('relay');pc?.restartIce?.();}
    // No direct channel yet (or none again): the host starts both sides afresh, a few times.
    if(!polite&&RTC&&peer&&mode==='relay'&&dc?.readyState!=='open'&&now()-dialedAt>cfg.redial&&redials<cfg.redials){redials++;signal({redial:true});redial();}},cfg.heartbeat);
  every(()=>{if(ws?.readyState!==1)return;ws.send('ping');if(now()-lastPong>cfg.pingLost)ws.close(4900,'lost');},cfg.ping);
  every(()=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'keep'}));},cfg.keep);
  function stop(){for(const id of timers){clearTimeout(id);clearInterval(id);}dropPeer();}

  open();
  return {
    ready,get role(){return info?.role;},get room(){return info;},get peer(){return peer;},get mode(){return mode;},get pending(){return stream.pending;},
    send(msg){stream.send('g',msg);},onMessage(fn){on.message=fn;},
    control(msg){stream.send('c',msg);},onControl(fn){on.control=fn;},onEvent(fn){on.event=fn;},
    // What the direct channel runs on, for the page to show: the chosen candidate pair's types ('host' on a LAN, 'srflx'
    // through a NAT, 'relay' a TURN server) and its round trip, with the link's mode.
    async stats(){
      const out={mode,local:null,remote:null,rtt:null};if(!pc)return out;
      const r=await pc.getStats();let pair=null;
      r.forEach(x=>{if(x.type==='transport'&&x.selectedCandidatePairId)pair=r.get(x.selectedCandidatePairId);});
      if(!pair)r.forEach(x=>{if(x.type==='candidate-pair'&&x.state==='succeeded'&&(x.selected||x.nominated))pair??=x;});
      if(pair){out.local=r.get(pair.localCandidateId)?.candidateType??null;out.remote=r.get(pair.remoteCandidateId)?.candidateType??null;out.rtt=pair.currentRoundTripTime??null;}
      return out;
    },
    close(){if(closed)return;closed=true;try{ws?.readyState===1&&ws.send(JSON.stringify({type:'bye'}));ws?.close(1000,'bye');}catch{}stop();},
    // For tests: lose the room's socket as a network would (the link opens it again), or stop the direct channel dead.
    debug:{dropSocket(){ws?.close(4901,'dropped');},muteDirect(){if(dc){dc.onmessage=null;const s=dc.send.bind(dc);dc.send=()=>{};dc._send=s;}}}
  };
}
