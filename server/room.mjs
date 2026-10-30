// Online rooms (P1, Issue #5; arena rooms, Issue #9). Players meet by a room code or an invite link. Two of them play at
// a time: the room passes WebRTC signalling between those two and, when no direct channel opens, relays their match
// messages. An arena room (opened with v=2) holds up to 8: the two on the court, a queue waiting to play, and watchers.
// It calls each match, keeps the score from the goals in the players' feed, passes the feed on to everyone watching,
// and when a match is over turns the court over by the owner's rule. A room opened without v=2 is the P1 room: two
// places and nothing more, as the P1 page expects.
// Plain JS with no I/O: the Cloudflare Worker (server/worker.mjs) and the local stand-in (scripts/dev-rooms.mjs) keep
// the state and the sockets, call these functions, and carry out what they return: {send:place, data} (an object goes
// out as JSON, a string as is), {close:place, code, reason}, {closeCode:code} and {holdCode:code, id} (tell the code
// registry, below) and {log:{...}}. A place is one member's (p1, p2, ...). Times are seconds; state objects are plain
// JSON, so a Durable Object can store them across hibernation.

// joinWait: how long a code lets people in unless its room holds it, and how long a room nobody else joins stays open;
// emptyKeep: how long a room with nobody connected waits for a reconnect; idleKeep: how long a room with no message at
// all stays open (players on a direct channel send the room nothing, so a client in a room sends it a message every
// minute; heartbeat pings do not count, the Worker answers them without waking the room); codeKeep: how long a code
// stays taken after it stops letting anyone in (a stale invite then finds nothing rather than someone else's room);
// maxMessage: bytes of one message (a WebRTC offer is about 1 KB); rate/burst: messages a second each member may send
// on average and at once (a match sends about 35 a second); createPerMinute: rooms one address may open a minute.
// Arena rooms: maxMembers: people in one; nameLength: characters of a name, as a reader counts them; readyWait: how long
// the two called to the court have to say they are ready, once someone is queued behind them; goneWait: how long a
// player who dropped mid-match is waited for before the match counts as lost, when someone is queued to take the place;
// ownerWait: how long an owner who dropped keeps the room before the earliest-joined member present takes it over;
// awayKeep: how long a member who dropped keeps a place; codeRefresh: how often an open room tells the registry its
// code is still in use.
export const ROOM={codeLength:5,alphabet:'2345679ACDEFGHJKMNPQRSTVWXYZ',joinWait:10*60,emptyKeep:2*60,idleKeep:10*60,codeKeep:10*60,
  maxMessage:8192,rate:60,burst:120,createPerMinute:10,
  maxMembers:8,nameLength:12,readyWait:15,goneWait:30,ownerWait:30,awayKeep:10*60,codeRefresh:5*60};
// The owner's choices in an arena room: who leaves the court after a match played out (the loser, the winner, or both),
// and how matches sync (duel-net.mjs; 'blind' picks one at random and the players learn which only at the end).
export const RULES={rotation:['loser','winner','both'],sync:['catchup','fullflight','blind']};
const SIDES=['a','b'],other=s=>s==='a'?'b':'a';
// WebSocket close codes the client acts on (4000–4999 are free for applications).
export const CLOSE={expired:4000,replaced:4001,full:4002,'not-found':4003,token:4004,origin:4008,rate:4029,busy:4030,
  'too-big':1009,'too-fast':1008,'bad-message':1003};

// --- Codes -----------------------------------------------------------------------------------------------------------
// Five of 28 characters that are hard to misread (no 0/O, 1/I/L, B/8, U): about 17 million codes. Typed codes are read
// without regard to case, spaces or dashes.
export function normalizeCode(text,cfg=ROOM){
  const c=String(text??'').toUpperCase().replace(/[\s-]/g,'');
  return c.length===cfg.codeLength&&[...c].every(ch=>cfg.alphabet.includes(ch))?c:null;
}
function randomCode(random,cfg){let c='';for(let i=0;i<cfg.codeLength;i++)c+=cfg.alphabet[Math.floor(random()*cfg.alphabet.length)];return c;}

// The code registry (one for all rooms): hub = {codes:{CODE:{id, joinBy, freeAt}}, made:{address:[times]}}.
export function newHub(){return {codes:{},made:{}};}
function sweepHub(hub,t){
  for(const [c,e] of Object.entries(hub.codes))if(e.freeAt<=t)delete hub.codes[c];
  for(const [ip,times] of Object.entries(hub.made)){const recent=times.filter(x=>t-x<60);if(recent.length)hub.made[ip]=recent;else delete hub.made[ip];}
}
// A fresh code for room `id`, or {error:'rate'} when this address opened too many rooms in the last minute.
export function reserveCode(hub,{id,ip,now,random=Math.random},cfg=ROOM){
  sweepHub(hub,now);const made=hub.made[ip]??=[];
  if(made.length>=cfg.createPerMinute)return {error:'rate'};
  for(let i=0;i<50;i++){const code=randomCode(random,cfg);if(hub.codes[code])continue;
    made.push(now);hub.codes[code]={id,joinBy:now+cfg.joinWait,freeAt:now+cfg.joinWait+cfg.codeKeep};return {code};}
  return {error:'busy'};
}
// The room a typed code lets in, or null (unknown, mistyped, or no longer letting anyone in).
export function resolveCode(hub,{code,now},cfg=ROOM){const c=normalizeCode(code,cfg),e=c&&hub.codes[c];return e&&now<e.joinBy?e.id:null;}
// No one more comes in by this code (a P1 room's second player is in, or a room closed); it stays taken for codeKeep.
export function closeCode(hub,{code,now},cfg=ROOM){const e=hub.codes[code];if(e){e.joinBy=Math.min(e.joinBy,now);e.freeAt=Math.min(e.freeAt,now+cfg.codeKeep);}}
// An open arena room's code keeps letting people in: the room says so every codeRefresh. Only its own room can.
export function holdCode(hub,{code,id,now},cfg=ROOM){
  const e=hub.codes[code];if(!e||e.id!==id)return;
  e.joinBy=Math.max(e.joinBy,now+cfg.joinWait);e.freeAt=Math.max(e.freeAt,e.joinBy+cfg.codeKeep);
}

// --- Names -----------------------------------------------------------------------------------------------------------
// A name everyone in the room sees: control and text-direction characters out, spaces run together and trimmed, at most
// nameLength characters as a reader counts them (a Chinese character or an emoji is one); '' when nothing would show.
const HIDDEN=/[\p{Cc}\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;
const segmenter=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter('zh',{granularity:'grapheme'}):null;
const characters=s=>segmenter?[...segmenter.segment(s)].map(x=>x.segment):Array.from(s);
export function cleanName(text,cfg=ROOM){
  const s=String(text??'').normalize('NFC').replace(HIDDEN,'').replace(/\s+/gu,' ').trim();
  return /[^\p{Z}\p{M}\p{Cf}]/u.test(s)?characters(s).slice(0,cfg.nameLength).join('').trim():'';
}
// The name a member goes by: theirs, cleaned, or 玩家 N (the lowest N nobody else has); one someone else has gets (2),
// (3), ... after it, still within nameLength.
function nameFor(room,id,wanted,cfg){
  const taken=new Set(Object.values(room.members).filter(m=>m.id!==id).map(m=>m.name)),base=cleanName(wanted,cfg);
  if(!base){for(let n=1;;n++)if(!taken.has(`玩家 ${n}`))return `玩家 ${n}`;}
  if(!taken.has(base))return base;
  for(let k=2;;k++){const tag=`(${k})`,name=characters(base).slice(0,cfg.nameLength-tag.length).join('')+tag;if(!taken.has(name))return name;}
}

// --- A room ----------------------------------------------------------------------------------------------------------
// room = {id, code, v, created, lastActive, emptySince, closed, joined (someone besides the opener came in), next (the
// next member number), owner, members:{place:{id, token, name, order, present, awayAt, peer, watch}}, court:{a, b},
// queue:[place], rules:{rotation, sync}, pair (numbers each pairing on the court), match:{n, phase, ready:[place],
// readyBy, score:{a, b}, sync, blind}, last (the last result), heldAt, rev (counts changes, so the Worker stores the
// room at once after one), counts:{received, relayed, signal, feed}}.
// A token comes with each place, so a member who drops can take it back (and nobody else can); a member's peer and
// watch are what it was last told, so it hears only changes; `received` counts every message the room took in, to
// check what the hosting bills for them. match.phase: idle (fewer than two on the court), ready (two called, waiting
// for both to say ready), playing.
export function newRoom({id,code,now,v=1}){
  return {id,code,v:v>=2?2:1,created:now,lastActive:now,emptySince:null,closed:false,joined:false,next:1,owner:null,members:{},
    court:{a:null,b:null},queue:[],rules:{rotation:'loser',sync:'catchup'},pair:0,
    match:{n:0,phase:'idle',ready:[],readyBy:null,score:{a:0,b:0},sync:null,blind:false},last:null,heldAt:now,rev:0,
    counts:{received:0,relayed:0,signal:0,feed:0}};
}
const arena=room=>room.v>=2;
const capacity=(room,cfg)=>arena(room)?cfg.maxMembers:2;
const byOrder=room=>Object.values(room.members).sort((x,y)=>x.order-y.order);
const sideOf=(room,id)=>SIDES.find(s=>room.court[s]===id)??null;
const roleOf=(room,id)=>sideOf(room,id)?'player':room.queue.includes(id)?'queue':'watch';
const watchers=room=>byOrder(room).filter(m=>m.present&&!sideOf(room,m.id));
const queued=room=>room.queue.filter(id=>room.members[id]?.present);
const toAll=(room,data)=>byOrder(room).filter(m=>m.present).map(m=>({send:m.id,data}));

// What everyone in an arena room is sent whenever something changes, and on joining: who is in and where, the rules,
// and the match (readyIn: seconds left to say ready, or null while nobody is queued behind the two called).
function snapshot(room,now,cfg){
  const m=room.match;
  return {type:'room',id:room.id,code:room.code,owner:room.owner,max:capacity(room,cfg),
    members:byOrder(room).map(x=>({id:x.id,name:x.name,present:x.present,role:roleOf(room,x.id)})),
    court:{...room.court},queue:[...room.queue],rules:{...room.rules},
    match:{n:m.n,phase:m.phase,score:{...m.score},ready:[...m.ready],readyIn:m.readyBy===null?null:Math.max(0,Math.ceil(m.readyBy-now))},
    last:room.last};
}
// The court filled from the queue (whoever was already on it is 甲, side a; someone queued who is not connected is
// passed over, to watch), and two on it called to a match.
function fill(room,now,cfg){
  const before=`${room.court.a}|${room.court.b}`,m=room.match;
  if(!room.court.a&&room.court.b){room.court.a=room.court.b;room.court.b=null;}
  for(const s of SIDES)while(!room.court[s]&&room.queue.length){const id=room.queue.shift();if(room.members[id]?.present)room.court[s]=id;}
  const changed=before!==`${room.court.a}|${room.court.b}`,full=!!(room.court.a&&room.court.b);
  if(changed)room.pair++;
  if(!full&&m.phase==='ready'){m.phase='idle';m.ready=[];m.readyBy=null;}
  if(full&&(m.phase==='idle'||m.phase==='ready'&&changed)){if(m.phase==='idle')m.n++;m.phase='ready';m.ready=m.ready.filter(id=>sideOf(room,id));m.readyBy=null;}
  if(m.phase==='ready'&&m.readyBy===null&&queued(room).length)m.readyBy=now+cfg.readyWait;
}
// What each member is told of the player they face. A P1 room says only whether the other one is there; an arena room
// also names them, says which side this member plays (a makes the WebRTC offer) and numbers the pairing, so signalling
// meant for an earlier pairing is dropped. Members off the court hear that they face nobody.
function peers(room){
  const out=[];
  for(const x of byOrder(room)){
    const side=sideOf(room,x.id),opp=side?room.court[other(side)]:null,present=!!(opp&&room.members[opp]?.present);
    const data=arena(room)?{type:'peer',present,pair:side?room.pair:null,opponent:opp,side}:{type:'peer',present};
    const said=JSON.stringify(data);if(said===x.peer)continue;x.peer=said;if(x.present)out.push({send:x.id,data});
  }
  return out;
}
// The two on the court hear whether anyone watches: they send their full feed only then (goals always go, as the room
// keeps the score from them).
function watching(room){
  const on=watchers(room).length>0,out=[];
  for(const x of Object.values(room.members)){
    if(!sideOf(room,x.id)){x.watch=null;continue;}
    if(x.watch===on)continue;x.watch=on;if(x.present)out.push({send:x.id,data:{type:'watching',on}});
  }
  return out;
}
// After anything that changes who is where: the court filled, each player told who they face, and (arena rooms)
// everyone sent the room as it now is.
function settle(room,now,cfg){
  room.rev++;
  if(!arena(room))return peers(room);
  fill(room,now,cfg);
  return [...peers(room),...watching(room),...toAll(room,snapshot(room,now,cfg))];
}
// Both called are ready: the match starts, numbered, with the owner's sync, and who plays which side.
function start(room,random){
  const m=room.match,blind=room.rules.sync==='blind';
  m.phase='playing';m.readyBy=null;m.score={a:0,b:0};m.blind=blind;m.sync=blind?(random()<.5?'catchup':'fullflight'):room.rules.sync;
  const data={type:'start',n:m.n,sync:m.sync,blind,a:room.court.a,b:room.court.b};
  return SIDES.map(s=>({send:room.court[s],data}));
}
// A match over: everyone hears the result, then the court turns over. Played out, the owner's rule says who goes to the
// back of the queue (nobody, while nobody is queued); a player who left, or was gone too long, goes off to watch.
// Whoever stays is 甲 for the next match (fill).
function finish(room,{winner,how},cfg){
  const m=room.match,w=room.court[winner],l=room.court[other(winner)];
  room.last={n:m.n,winner:w,loser:l,score:{...m.score},how};
  m.phase='idle';m.ready=[];m.readyBy=null;
  if(how!=='score')room.court[other(winner)]=null;
  else if(queued(room).length){
    const off=room.rules.rotation==='loser'?[l]:room.rules.rotation==='winner'?[w]:[room.court.a,room.court.b];
    for(const id of off){room.court[sideOf(room,id)]=null;room.queue.push(id);}
  }
  return toAll(room,{type:'result',...room.last});
}
// A player stepping off the court: a match they are in counts as theirs lost.
function leaveCourt(room,id,cfg){
  const side=sideOf(room,id);
  if(room.match.phase==='playing')return finish(room,{winner:other(side),how:'left'},cfg);
  room.court[side]=null;return [];
}
// The earliest-joined member connected, else the earliest-joined at all.
const heir=room=>(byOrder(room).find(x=>x.present)??byOrder(room)[0])?.id??null;
// A member gone for good (said bye, or away too long): off the court and out of the queue. An arena room passes to its
// heir when the owner goes; a P1 room keeps nobody as owner, so whoever joins later is a guest, as before.
function removeMember(room,id,now,cfg){
  const acts=sideOf(room,id)?leaveCourt(room,id,cfg):[];
  room.queue=room.queue.filter(q=>q!==id);delete room.members[id];
  if(room.owner===id)room.owner=arena(room)?heir(room):null;
  if(!Object.values(room.members).some(x=>x.present))room.emptySince??=now;
  return acts;
}

// A connection asking in: create (the opener, on a room just made), or token (taking back a place), or neither (someone
// new, by code or invite). name: what to go by (arena rooms). Returns {place, token, actions} or {error}.
export function joinRoom(room,{create=false,token=null,name=null,now,newToken},cfg=ROOM){
  if(!room||room.closed)return {error:'not-found'};
  let x;const actions=[];
  if(create&&room.owner)return {error:'busy'};
  if(token){
    x=Object.values(room.members).find(m=>m.token===token);if(!x)return {error:'token'};
    // The same place taken back from a new connection: the old one, if still open, is let go.
    if(x.present)actions.push({close:x.id,code:CLOSE.replaced,reason:'replaced'});
  }else{
    if(!create&&Object.keys(room.members).length>=capacity(room,cfg))return {error:'full'};
    if(!create&&!room.joined&&now>=room.created+cfg.joinWait)return {error:'expired'};
    const id=`p${room.next}`;x=room.members[id]={id,token:newToken(),name:'',order:room.next++,present:false,awayAt:null,peer:null,watch:null};
    if(arena(room)){x.name=nameFor(room,id,name,cfg);room.queue.push(id);}else room.court[SIDES.find(s=>!room.court[s])]=id;
    if(create)room.owner=id;
    else if(!room.joined){room.joined=true;if(!arena(room))actions.push({closeCode:room.code});}
  }
  x.present=true;x.awayAt=null;room.emptySince=null;room.lastActive=now;
  const side=sideOf(room,x.id),opp=side?room.court[other(side)]:null,peer=!!(opp&&room.members[opp]?.present);
  const joined={type:'joined',role:room.owner===x.id?'host':'guest',id:room.id,code:room.code,token:x.token,peer};
  // A P1 page takes `peer` here for the first peer message; an arena page is sent its peer and watching after this.
  if(arena(room)){Object.assign(joined,{v:2,member:x.id,name:x.name});x.peer=null;x.watch=null;}
  else x.peer=JSON.stringify({type:'peer',present:peer});
  actions.push({send:x.id,data:joined});
  if(arena(room)&&now-room.heldAt>=cfg.codeRefresh){room.heldAt=now;actions.push({holdCode:room.code,id:room.id});}
  actions.push(...settle(room,now,cfg));
  return {place:x.id,token:x.token,actions};
}

// A message from `place`: the text as received and its size in bytes. 'ping' is answered 'pong' (the heartbeat; the
// Worker answers it without waking the room). signal and relay go to the player this one faces, as they are; anything
// the room cannot read, or too much or too fast, closes that connection; bye leaves the room for good. buckets:
// per-connection rate state, kept in memory only. random: for the blind sync's pick.
// From members of an arena room, also: name {name}, queue, watch (off the queue, or off the court), rules {rotation,
// sync} (the owner), ready {n} (the two called), end {n} (the owner, ending a match whose player is gone), feed {n, o,
// msgs} (the two playing: their own match messages, packed, and their clock offset).
export function roomMessage(room,{place,text,bytes,now,buckets,random=Math.random},cfg=ROOM){
  if(text==='ping')return [{send:place,data:'pong'}];
  room.counts.received++;room.lastActive=now;
  // A connection the room throws out has left it: the others hear so, then the connection closes.
  const out=reason=>{delete buckets[place];return [...leaveRoom(room,{place,now},cfg),{close:place,code:CLOSE[reason],reason}];};
  if(typeof text!=='string'||bytes>cfg.maxMessage)return out(typeof text!=='string'?'bad-message':'too-big');
  const b=buckets[place]??={level:cfg.burst,at:now};b.level=Math.min(cfg.burst,b.level+(now-b.at)*cfg.rate);b.at=now;
  if(b.level<1)return out('too-fast');
  b.level--;
  let msg;try{msg=JSON.parse(text);}catch{return out('bad-message');}
  const x=room.members[place];if(!x)return [];
  if(msg?.type==='bye')return [...removeMember(room,place,now,cfg),...settle(room,now,cfg),{close:place,code:1000,reason:'bye'}];
  if(msg?.type==='signal'||msg?.type==='relay'){
    const side=sideOf(room,place),opp=side?room.court[other(side)]:null;
    // Nobody to pass it to, or meant for an earlier pairing: dropped. Signalling starts again when the other player
    // arrives ('peer'), and a relayed match has nothing to deliver to a player who is not there.
    if(!opp||!room.members[opp]?.present||(msg.pair!==undefined&&msg.pair!==room.pair))return [];
    room.counts[msg.type==='signal'?'signal':'relayed']++;
    const data={type:msg.type,data:msg.data};if(arena(room))data.pair=room.pair;
    return [{send:opp,data}];
  }
  if(!arena(room))return [];
  const hold=now-room.heldAt>=cfg.codeRefresh?(room.heldAt=now,[{holdCode:room.code,id:room.id}]):[];
  const m=room.match,side=sideOf(room,place);let acts=[],changed=true;
  switch(msg?.type){
    case 'name':x.name=nameFor(room,place,msg.name,cfg);break;
    case 'queue':if(side||room.queue.includes(place))changed=false;else room.queue.push(place);break;
    case 'watch':if(room.queue.includes(place))room.queue.splice(room.queue.indexOf(place),1);else if(side)acts=leaveCourt(room,place,cfg);else changed=false;break;
    case 'rules':
      if(place!==room.owner){changed=false;break;}
      if(RULES.rotation.includes(msg.rotation))room.rules.rotation=msg.rotation;
      if(RULES.sync.includes(msg.sync))room.rules.sync=msg.sync;
      break;
    case 'ready':
      if(m.phase!=='ready'||msg.n!==m.n||!side||m.ready.includes(place)){changed=false;break;}
      m.ready.push(place);if(m.ready.length===2)acts=start(room,random);
      break;
    case 'end':{
      const gone=SIDES.find(s=>!room.members[room.court[s]]?.present);
      if(place!==room.owner||m.phase!=='playing'||msg.n!==m.n||!gone){changed=false;break;}
      acts=finish(room,{winner:other(gone),how:'ended'},cfg);break;
    }
    case 'feed':({acts,changed}=feed(room,place,msg,cfg));break;
    default:changed=false; // 'keep', or anything else: it only shows the member is still there
  }
  return [...hold,...acts,...(changed?settle(room,now,cfg):[])];
}
// A player's feed: their own match messages, packed, passed on to everyone watching with the sender's clock offset `o`
// (a watcher puts both players on one clock with it). The goals in it keep the room's score (only the side that let a
// goal in sends it, so each goal comes once), and a goal with a winner ends the match.
function feed(room,place,msg,cfg){
  const m=room.match,side=sideOf(room,place);
  if(m.phase!=='playing'||msg.n!==m.n||!side||!Array.isArray(msg.msgs))return {acts:[],changed:false};
  room.counts.feed++;
  const data={type:'feed',n:m.n,side,...Number.isFinite(msg.o)?{o:msg.o}:{},msgs:msg.msgs},acts=watchers(room).map(w=>({send:w.id,data}));
  let changed=false;
  for(const g of msg.msgs){
    if(g?.type!=='goal'||!SIDES.every(k=>Number.isInteger(g.score?.[k])&&g.score[k]>=0&&g.score[k]<100))continue;
    m.score={a:g.score.a,b:g.score.b};changed=true;
    if(SIDES.includes(g.winner)){acts.push(...finish(room,{winner:g.winner,how:'score'},cfg));break;}
  }
  return {acts,changed};
}
// `place`'s connection is gone (closed, failed, or thrown out); its place is kept for its token.
export function leaveRoom(room,{place,now},cfg=ROOM){
  const x=room.members[place];if(!x?.present)return [];
  x.present=false;x.awayAt=now;room.lastActive=now;
  if(!Object.values(room.members).some(m=>m.present))room.emptySince=now;
  return settle(room,now,cfg);
}

// When the room closes: no message for idleKeep, nobody else in by joinWait, or nobody connected for emptyKeep.
function closeDue(room,cfg){
  const t=[room.lastActive+cfg.idleKeep];
  if(!room.joined)t.push(room.created+cfg.joinWait);
  if(room.emptySince!==null)t.push(room.emptySince+cfg.emptyKeep);
  return Math.min(...t);
}
// An arena room's other deadlines. Each, once due, changes something, so the alarm does not ring again at once: the
// two called run out of time to be ready, a player gone mid-match is given up on (only with someone queued), an owner
// gone hands the room over, a member gone too long loses the place.
function arenaDue(room,cfg){
  if(!arena(room))return [];
  const t=[],m=room.match,list=Object.values(room.members),owner=room.members[room.owner];
  if(m.phase==='ready'&&m.readyBy!==null)t.push(m.readyBy);
  if(m.phase==='playing'&&queued(room).length)for(const s of SIDES){const x=room.members[room.court[s]];if(x&&!x.present)t.push(x.awayAt+cfg.goneWait);}
  if(owner&&!owner.present&&list.some(x=>x.present))t.push(owner.awayAt+cfg.ownerWait);
  for(const x of list)if(!x.present)t.push(x.awayAt+cfg.awayKeep);
  return t;
}
// When the room next has to look at its clock (seconds), or null once it is closed.
export function nextWake(room,cfg=ROOM){return room.closed?null:Math.min(closeDue(room,cfg),...arenaDue(room,cfg));}
// The clock check. Past a closing deadline the room closes every connection, lets its code go and reports what it
// carried; the caller then forgets it. Otherwise whatever else is due happens (arena rooms).
export function wakeRoom(room,{now},cfg=ROOM){
  const due=nextWake(room,cfg);if(due===null||now<due)return [];
  if(now>=closeDue(room,cfg)){
    room.closed=true;
    const actions=byOrder(room).filter(x=>x.present).map(x=>({close:x.id,code:CLOSE.expired,reason:'expired'}));
    for(const x of Object.values(room.members))x.present=false;
    actions.push({closeCode:room.code},{log:{room:room.code,seconds:Math.round(now-room.created),...room.counts}});
    return actions;
  }
  const m=room.match,acts=[];
  // Not ready in time, with someone queued: back of the queue (or off to watch, if not connected).
  if(m.phase==='ready'&&m.readyBy!==null&&now>=m.readyBy){
    if(queued(room).length)for(const s of SIDES){const id=room.court[s];if(m.ready.includes(id))continue;room.court[s]=null;if(room.members[id]?.present)room.queue.push(id);}
    m.readyBy=null;
  }
  if(m.phase==='playing'&&queued(room).length){
    const gone=SIDES.filter(s=>{const x=room.members[room.court[s]];return x&&!x.present&&now>=x.awayAt+cfg.goneWait;})
      .sort((p,q)=>room.members[room.court[p]].awayAt-room.members[room.court[q]].awayAt);
    if(gone.length)acts.push(...finish(room,{winner:other(gone[0]),how:'forfeit'},cfg));
  }
  const owner=room.members[room.owner];
  if(owner&&!owner.present&&now>=owner.awayAt+cfg.ownerWait){const next=byOrder(room).find(x=>x.present);if(next)room.owner=next.id;}
  for(const x of byOrder(room))if(!x.present&&now>=x.awayAt+cfg.awayKeep)acts.push(...removeMember(room,x.id,now,cfg));
  return [...acts,...settle(room,now,cfg)];
}
// Origins allowed to connect: a comma-separated list, or '*'. A browser always sends Origin with a WebSocket; a missing
// one (a script) is let through only under '*'.
export function originAllowed(origin,list){
  const allowed=String(list??'').split(',').map(s=>s.trim()).filter(Boolean);
  return allowed.includes('*')||(!!origin&&allowed.includes(origin));
}
