// The online rooms on Cloudflare (P1, Issue #5): a Worker on its own subdomain, a Durable Object per room and one for
// the room codes. The rules are server/room.mjs; this file keeps their state and sockets, as the local stand-in does in
// memory (scripts/dev-rooms.mjs). Pages connect to wss://<this Worker>/api/ws?create=1 | ?code=XXXXX |
// ?room=<id>[&token=<t>]; the page's Origin must be in ALLOWED_ORIGINS (wrangler.jsonc). ROOM_LIMITS (JSON, for tests
// only, e.g. `wrangler dev --var ROOM_LIMITS:{"joinWait":2}`) overrides some of the rules' limits.
import {DurableObject} from 'cloudflare:workers';
import {ROOM,CLOSE,newHub,reserveCode,resolveCode,closeCode,newRoom,joinRoom,roomMessage,leaveRoom,nextWake,wakeRoom,originAllowed} from './room.mjs';

const now=()=>Date.now()/1000,OPEN=1,limits=env=>env.ROOM_LIMITS?{...ROOM,...JSON.parse(env.ROOM_LIMITS)}:ROOM;
// A browser cannot read why an upgrade failed, so a refusal is a WebSocket that says why and closes.
function refuse(reason){
  const [client,server]=Object.values(new WebSocketPair());server.accept();
  server.send(JSON.stringify({type:'error',reason}));server.close(CLOSE[reason]??4000,reason);
  return new Response(null,{status:101,webSocket:client});
}
const hubOf=env=>env.HUB.get(env.HUB.idFromName('hub'));

export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname!=='/api/ws')return new Response('Not found',{status:404});
    if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket only',{status:426});
    if(!originAllowed(req.headers.get('Origin'),env.ALLOWED_ORIGINS))return refuse('origin');
    const p=url.searchParams;let id,made=null;
    // What the room learns from the Worker rides on the URL; a client cannot set it.
    p.delete('id');p.delete('made');
    if(p.has('create')){
      // A new room is made near the player who opens it; the registry hands out its code.
      id=env.ROOMS.newUniqueId();const r=await hubOf(env).reserve(id.toString(),req.headers.get('CF-Connecting-IP')??'');
      if(r.error)return refuse(r.error);made=r.code;
    }else{
      const named=p.has('code')?await hubOf(env).resolve(p.get('code')):p.get('room');
      try{id=env.ROOMS.idFromString(named??'');}catch{return refuse('not-found');}
    }
    p.set('id',id.toString());if(made)p.set('made',made);
    return env.ROOMS.get(id).fetch(new Request(url,req));
  }
};

// The code registry: one object for all rooms, its state one stored value (only codes of the last ~20 minutes).
export class RoomHub extends DurableObject {
  async change(fn){const hub=(await this.ctx.storage.get('hub'))??newHub(),r=fn(hub);await this.ctx.storage.put('hub',hub);return r;}
  reserve(id,ip){return this.change(hub=>reserveCode(hub,{id,ip,now:now()},limits(this.env)));}
  async resolve(code){return resolveCode((await this.ctx.storage.get('hub'))??newHub(),{code,now:now()},limits(this.env));}
  close(code){return this.change(hub=>closeCode(hub,{code,now:now()},limits(this.env)));}
}

// One room. Sockets use the hibernation API, tagged with their place, so an idle room costs nothing and loses nothing:
// the room's state is stored on every join and leave, and its counters at most every 30 seconds while messages flow.
export class Room extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.room=undefined;this.buckets={};this.savedAt=0;this.alarmAt=undefined;this.cfg=limits(env);
    // The heartbeat is answered without waking the room (and is not billed as a message).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  async load(){if(this.room===undefined)this.room=(await this.ctx.storage.get('room'))??null;return this.room;}
  async save(force=false){if(!force&&now()-this.savedAt<30)return;this.savedAt=now();await this.ctx.storage.put('room',this.room);}
  open(role,except){return this.ctx.getWebSockets(role).filter(ws=>ws!==except&&ws.readyState===OPEN);}
  async run(actions,only=null){
    for(const a of actions){
      if(a.send){const text=typeof a.data==='string'?a.data:JSON.stringify(a.data);for(const ws of only&&a.send===only.role?[only.ws]:this.open(a.send))ws.send(text);}
      else if(a.close){for(const ws of this.open(a.close,only?.ws))ws.close(a.code,a.reason);}
      else if(a.closeCode)await hubOf(this.env).close(a.closeCode);
      else if(a.log)console.log(JSON.stringify({event:'room-closed',...a.log}));
    }
  }
  // An alarm at the room's next deadline; a later deadline (more messages) is checked when the alarm rings.
  async schedule(){
    const due=nextWake(this.room,this.cfg);if(due===null)return;
    if(this.alarmAt===undefined)this.alarmAt=((await this.ctx.storage.getAlarm())??null)/1000||null;
    if(this.alarmAt===null||due<this.alarmAt-1){this.alarmAt=due;await this.ctx.storage.setAlarm(due*1000);}
  }
  async fetch(req){
    const p=new URL(req.url).searchParams,made=p.get('made');let room=await this.load();
    if(made&&!room)room=this.room=newRoom({id:p.get('id'),code:made,now:now()});
    const r=joinRoom(room,{create:!!made,token:p.get('token'),now:now(),newToken:()=>crypto.randomUUID()},this.cfg);
    if(r.error)return refuse(r.error);
    const [client,server]=Object.values(new WebSocketPair());
    // The place taken back: the old connection goes, then the new one is tagged with the place and hears it joined.
    this.ctx.acceptWebSocket(server,[r.role]);delete this.buckets[r.role];
    await this.run(r.actions,{role:r.role,ws:server});await this.save(true);await this.schedule();
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    const room=await this.load();if(!room)return ws.close(CLOSE['not-found'],'not-found');
    const role=this.ctx.getTags(ws)[0],text=typeof message==='string'?message:null;
    const bytes=text===null?message.byteLength:new TextEncoder().encode(text).length;
    await this.run(roomMessage(room,{role,text,bytes,now:now(),buckets:this.buckets},this.cfg));await this.save();
  }
  // A connection gone: it counts as leaving only if no other connection now holds its place (taken back elsewhere).
  async webSocketClose(ws,code,reason){
    // The closing handshake answered, or the client waits for it (about 10 s); 1005 and 1006 cannot be sent back.
    try{ws.close(code===1005||code===1006?1000:code,reason);}catch{}
    const room=await this.load(),role=this.ctx.getTags(ws)[0];if(!room||this.open(role,ws).length)return;
    await this.run(leaveRoom(room,{role,now:now()}));await this.save(true);await this.schedule();
  }
  async webSocketError(ws){await this.webSocketClose(ws,1011,'error');}
  async alarm(){
    this.alarmAt=null;const room=await this.load();if(!room)return;
    await this.run(wakeRoom(room,{now:now()},this.cfg));
    if(room.closed){this.room=null;await this.ctx.storage.deleteAll();return;}
    await this.save(true);await this.schedule();
  }
}
