// The online rooms' local stand-in, behind the dev server's /api/ws (scripts/serve.mjs): the same rules as the Cloudflare
// Worker (server/room.mjs), kept in memory, so online play can be built and tested on one machine with no account and no
// wrangler. The Worker keeps state and sockets in Durable Objects instead (server/worker.mjs); what each does with the
// rules' actions is the same.
import {randomBytes,randomUUID} from 'node:crypto';
import {ROOM,CLOSE,newHub,reserveCode,resolveCode,closeCode,holdCode,newRoom,joinRoom,roomMessage,leaveRoom,nextWake,wakeRoom,originAllowed} from '../server/room.mjs';

// cfg: the rules' limits (tests shorten them); now(): seconds; origins: allowed Origin list ('*' for local play);
// log(stats): what a room carried, when it closes.
export function createRooms({cfg=ROOM,now=()=>Date.now()/1000,origins='*',log=()=>{}}={}){
  const hub=newHub(),rooms=new Map();
  // entry = {room, sockets:{place:ws}, buckets, timer}: a socket counts for its place only while it is the one there.
  function run(entry,actions){
    const texts=new Map();
    for(const a of actions){
      if(a.send){let text=typeof a.data==='string'?a.data:texts.get(a.data);if(text===undefined){text=JSON.stringify(a.data);texts.set(a.data,text);}entry.sockets[a.send]?.send(text);}
      else if(a.close){const ws=entry.sockets[a.close];entry.sockets[a.close]=null;ws?.close(a.code,a.reason);}
      else if(a.closeCode)closeCode(hub,{code:a.closeCode,now:now()},cfg);
      else if(a.holdCode)holdCode(hub,{code:a.holdCode,id:a.id,now:now()},cfg);
      else if(a.log)log(a.log);
    }
  }
  function schedule(entry){
    clearTimeout(entry.timer);const due=nextWake(entry.room,cfg);
    if(due===null){rooms.delete(entry.room.id);return;}
    entry.timer=setTimeout(()=>{run(entry,wakeRoom(entry.room,{now:now()},cfg));schedule(entry);},Math.max(0,(due-now())*1000)+5);
    entry.timer.unref?.();
  }
  // A browser cannot read why an upgrade failed, so a refusal is a WebSocket that says why and closes.
  function refuse(ws,reason){ws.send(JSON.stringify({type:'error',reason}));ws.close(CLOSE[reason]??4000,reason);}
  return {
    // ws (scripts/dev-ws.mjs) on /api/ws?create=1[&v=2] | ?code=XXXXX | ?room=<id>[&token=<t>] (and &name=<name> in an
    // arena room), from `origin` at address `ip`.
    connect(ws,{params,origin,ip}){
      if(!originAllowed(origin,origins))return refuse(ws,'origin');
      let id=params.get('room'),create=false;
      if(params.has('create')){
        id=randomBytes(16).toString('hex');const r=reserveCode(hub,{id,ip,now:now()},cfg);if(r.error)return refuse(ws,r.error);
        rooms.set(id,{room:newRoom({id,code:r.code,now:now(),v:params.get('v')==='2'?2:1}),sockets:{},buckets:{},timer:null});create=true;
      }else if(params.has('code')){id=resolveCode(hub,{code:params.get('code'),now:now()},cfg);if(!id)return refuse(ws,'not-found');}
      const entry=id&&rooms.get(id);if(!entry)return refuse(ws,'not-found');
      const r=joinRoom(entry.room,{create,token:params.get('token'),name:params.get('name'),now:now(),newToken:randomUUID},cfg);
      if(r.error){if(create)rooms.delete(id);return refuse(ws,r.error);}
      const place=r.place;
      // The place taken back: the old connection goes first, then the new one takes the place and hears it joined.
      run(entry,r.actions.filter(a=>a.close===place));entry.sockets[place]=ws;delete entry.buckets[place];
      run(entry,r.actions.filter(a=>a.close!==place));schedule(entry);
      ws.onMessage((text,bytes)=>{if(entry.sockets[place]!==ws)return;
        run(entry,roomMessage(entry.room,{place,text,bytes,now:now(),buckets:entry.buckets},cfg));schedule(entry);});
      ws.onClose(()=>{if(entry.sockets[place]!==ws)return;entry.sockets[place]=null;run(entry,leaveRoom(entry.room,{place,now:now()},cfg));schedule(entry);});
    },
    // For tests: the rooms open now.
    get size(){return rooms.size;}
  };
}
