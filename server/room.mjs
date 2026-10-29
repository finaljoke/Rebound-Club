// Online rooms (P1, Issue #5). Two players meet by a room code or an invite link, trade WebRTC signalling through the
// room and, when no direct channel opens, have the room relay their match messages. Plain JS with no I/O: the Cloudflare
// Worker (server/worker.mjs) and the local stand-in (scripts/serve.mjs) keep the state and the sockets, call these
// functions, and carry out what they return: {send:role, data} (an object goes out as JSON, a string as is),
// {close:role, code, reason}, {closeCode:code} (tell the code registry, closeCode below) and {log:{...}}. Times are seconds; state objects are plain JSON, so a Durable Object can
// store them across hibernation.

// joinWait: how long a code lets the second player in; emptyKeep: how long a room with nobody connected waits for a
// reconnect; idleKeep: how long a room with no message at all stays open (players on a direct channel send the room
// nothing, so a client in a room sends it a message every minute; heartbeat pings do not count, the Worker answers them
// without waking the room); codeKeep: how long a code stays taken after it
// stops letting anyone in (a stale invite then finds nothing rather than someone else's room); maxMessage: bytes of one
// message (a WebRTC offer is about 1 KB); rate/burst: messages a second each player may send on average and at once
// (a match sends about 35 a second); createPerMinute: rooms one address may open a minute.
export const ROOM={codeLength:5,alphabet:'2345679ACDEFGHJKMNPQRSTVWXYZ',joinWait:10*60,emptyKeep:2*60,idleKeep:10*60,codeKeep:10*60,
  maxMessage:8192,rate:60,burst:120,createPerMinute:10};
export const ROLES=['host','guest'];
const other=role=>role==='host'?'guest':'host';
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
// The second player is in: the code stops letting anyone in, and stays taken for codeKeep.
export function closeCode(hub,{code,now},cfg=ROOM){const e=hub.codes[code];if(e){e.joinBy=Math.min(e.joinBy,now);e.freeAt=Math.min(e.freeAt,now+cfg.codeKeep);}}

// --- A room ----------------------------------------------------------------------------------------------------------
// room = {id, code, created, tokens:{host, guest}, present:{host, guest}, guestJoined, lastActive, emptySince, closed,
// counts:{received, relayed, signal}}. A token comes with each place, so a player who drops can take it back (and nobody
// else can); `received` counts every message the room took in, to check what the hosting bills for them.
export function newRoom({id,code,now}){
  return {id,code,created:now,tokens:{host:null,guest:null},present:{host:false,guest:false},guestJoined:false,lastActive:now,emptySince:null,
    closed:false,counts:{received:0,relayed:0,signal:0}};
}
// A connection asking in: create (the host, on a room just made), or token (taking back a place), or neither (the guest,
// by code or invite). Returns {role, token, actions} or {error}.
export function joinRoom(room,{create=false,token=null,now,newToken},cfg=ROOM){
  if(!room||room.closed)return {error:'not-found'};
  let role;
  if(create){if(room.tokens.host)return {error:'busy'};role='host';}
  else if(token){role=ROLES.find(r=>room.tokens[r]&&room.tokens[r]===token);if(!role)return {error:'token'};}
  else if(room.tokens.guest)return {error:'full'};
  else if(now>=room.created+cfg.joinWait)return {error:'expired'};
  else role='guest';
  const actions=[];
  // The same place taken back from a new connection: the old one, if still open, is let go.
  if(room.present[role])actions.push({close:role,code:CLOSE.replaced,reason:'replaced'});
  if(!room.tokens[role])room.tokens[role]=newToken();
  if(role==='guest'&&!room.guestJoined){room.guestJoined=true;actions.push({closeCode:room.code});}
  room.present[role]=true;room.emptySince=null;room.lastActive=now;
  const peer=room.present[other(role)];
  actions.push({send:role,data:{type:'joined',role,id:room.id,code:room.code,token:room.tokens[role],peer}});
  if(peer)actions.push({send:other(role),data:{type:'peer',present:true}});
  return {role,token:room.tokens[role],actions};
}
// A message from `role`: the text as received and its size in bytes. 'ping' is answered 'pong' (the heartbeat; the
// Worker answers it without waking the room). signal and relay go to the other player, as they are; anything the room
// cannot read, or too much or too fast, closes that connection. buckets: per-connection rate state, kept in memory only.
export function roomMessage(room,{role,text,bytes,now,buckets},cfg=ROOM){
  if(text==='ping')return [{send:role,data:'pong'}];
  room.counts.received++;room.lastActive=now;
  // A connection the room throws out has left it: the other player hears so, then the connection closes.
  const out=reason=>{delete buckets[role];return [...leaveRoom(room,{role,now}),{close:role,code:CLOSE[reason],reason}];};
  if(typeof text!=='string'||bytes>cfg.maxMessage)return out(typeof text!=='string'?'bad-message':'too-big');
  const b=buckets[role]??={level:cfg.burst,at:now};b.level=Math.min(cfg.burst,b.level+(now-b.at)*cfg.rate);b.at=now;
  if(b.level<1)return out('too-fast');
  b.level--;
  let msg;try{msg=JSON.parse(text);}catch{return out('bad-message');}
  if(msg?.type==='bye')return leaveRoom(room,{role,now});
  if(msg?.type!=='signal'&&msg?.type!=='relay')return [];
  // Nobody to pass it to: dropped. Signalling starts again when the other player arrives ('peer'), and a relayed match
  // has nothing to deliver to a player who is not there.
  if(!room.present[other(role)])return [];
  room.counts[msg.type==='signal'?'signal':'relayed']++;
  return [{send:other(role),data:{type:msg.type,data:msg.data}}];
}
// `role`'s connection is gone (closed, failed, or said bye).
export function leaveRoom(room,{role,now}){
  if(!room.present[role])return [];
  room.present[role]=false;room.lastActive=now;
  if(!room.present[other(role)])room.emptySince=now;
  return room.present[other(role)]?[{send:other(role),data:{type:'peer',present:false}}]:[];
}
// When the room next has to look at its clock (seconds), or null once it is closed.
export function nextWake(room,cfg=ROOM){
  if(room.closed)return null;
  const t=[room.lastActive+cfg.idleKeep];
  if(!room.guestJoined)t.push(room.created+cfg.joinWait);
  if(room.emptySince!==null)t.push(room.emptySince+cfg.emptyKeep);
  return Math.min(...t);
}
// The clock check: past any of its deadlines the room closes both connections and reports what it carried; the caller
// then forgets it.
export function wakeRoom(room,{now},cfg=ROOM){
  const due=nextWake(room,cfg);if(due===null||now<due)return [];
  room.closed=true;
  const actions=ROLES.filter(r=>room.present[r]).map(r=>({close:r,code:CLOSE.expired,reason:'expired'}));
  for(const r of ROLES)room.present[r]=false;
  actions.push({log:{room:room.code,seconds:Math.round(now-room.created),...room.counts}});
  return actions;
}
// Origins allowed to connect: a comma-separated list, or '*'. A browser always sends Origin with a WebSocket; a missing
// one (a script) is let through only under '*'.
export function originAllowed(origin,list){
  const allowed=String(list??'').split(',').map(s=>s.trim()).filter(Boolean);
  return allowed.includes('*')||(!!origin&&allowed.includes(origin));
}
