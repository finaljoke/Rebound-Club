// The server end of a WebSocket (RFC 6455) for the dev server's online-room stand-in (scripts/serve.mjs, dev-rooms.mjs):
// text messages, fragments, ping/pong and the closing handshake; enough for browsers and Node's own WebSocket client.
// For local play only: the rooms' real home is the Cloudflare Worker (server/worker.mjs).
import {createHash} from 'node:crypto';

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// Answers an HTTP upgrade on `socket` and returns {send(text), close(code, reason), onMessage(fn(text, bytes)),
// onClose(fn(code, reason)), open}, or null after refusing a request that is not a WebSocket one. maxBytes: the largest
// message taken (a larger one closes with 1009, before it is read in full).
export function acceptWebSocket(req,socket,head,{maxBytes=1<<16}={}){
  const key=req.headers['sec-websocket-key'];
  if(String(req.headers.upgrade).toLowerCase()!=='websocket'||!key){socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return null;}
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(key+GUID).digest('base64')}\r\n\r\n`);
  socket.setNoDelay(true);
  let buf=head?.length?Buffer.from(head):Buffer.alloc(0),parts=[],partBytes=0,partOp=0,sentClose=false,done=false,onMessage=null,onClose=null;
  const frame=(op,payload)=>{
    const n=payload.length,h=Buffer.alloc(n<126?2:n<65536?4:10);h[0]=0x80|op;
    if(n<126)h[1]=n;else if(n<65536){h[1]=126;h.writeUInt16BE(n,2);}else{h[1]=127;h.writeBigUInt64BE(BigInt(n),2);}
    socket.write(Buffer.concat([h,payload]));
  };
  const finish=(code,reason)=>{if(done)return;done=true;onClose?.(code,reason);};
  const ws={
    get open(){return !sentClose&&!done;},
    send(text){if(ws.open)frame(1,Buffer.from(String(text)));},
    // Our close frame, then the TCP end: the client reads the code and reason before the connection goes.
    close(code=1000,reason=''){
      if(sentClose||done)return;sentClose=true;const r=Buffer.from(String(reason)).subarray(0,123),p=Buffer.alloc(2+r.length);
      p.writeUInt16BE(code,0);r.copy(p,2);frame(8,p);socket.end();finish(code,String(reason));
    },
    onMessage(fn){onMessage=fn;},onClose(fn){onClose=fn;}
  };
  socket.on('data',d=>{buf=buf.length?Buffer.concat([buf,d]):d;read();});
  socket.on('close',()=>finish(1006,''));socket.on('error',()=>{});
  function read(){
    while(!done&&buf.length>=2){
      const fin=buf[0]&0x80,op=buf[0]&0x0f,masked=buf[1]&0x80;let n=buf[1]&0x7f,at=2;
      if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);at=4;}
      else if(n===127){if(buf.length<10)return;n=Number(buf.readBigUInt64BE(2));at=10;}
      // A client must mask what it sends; and nothing larger than maxBytes is taken, in one frame or in fragments.
      if(!masked){ws.close(1002,'unmasked');return;}
      if(n>maxBytes||(op===0&&partBytes+n>maxBytes)){ws.close(1009,'too-big');return;}
      if(buf.length<at+4+n)return;
      const mask=buf.subarray(at,at+4),data=Buffer.from(buf.subarray(at+4,at+4+n));for(let i=0;i<n;i++)data[i]^=mask[i&3];
      buf=buf.subarray(at+4+n);
      if(op===8){const code=data.length>=2?data.readUInt16BE(0):1005;
        if(!sentClose){sentClose=true;const p=Buffer.alloc(2);p.writeUInt16BE(code===1005?1000:code,0);frame(8,p);socket.end();}
        finish(code,data.subarray(2).toString());return;}
      if(op===9){frame(10,data);continue;}
      if(op===10)continue;
      if(op===1||op===2){partOp=op;parts=[data];partBytes=n;}else if(op===0){parts.push(data);partBytes+=n;}else{ws.close(1002,'bad-frame');return;}
      if(!fin)continue;
      const all=Buffer.concat(parts);parts=[];partBytes=0;
      if(partOp!==1){ws.close(1003,'text-only');return;}
      onMessage?.(all.toString('utf8'),all.length);
    }
  }
  return ws;
}
