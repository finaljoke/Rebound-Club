// TURN for the online link (dist/duel-link.mjs): when two players' direct channel cannot open, WebRTC relays it through
// a TURN server (coturn, run with use-auth-secret) near the players instead of play falling back to the rooms' own relay.
// The rooms hand each connection time-limited credentials in its joined message: username "<expiry, unix seconds>:<tag>",
// password base64(HMAC-SHA1(secret, username)). The secret stays with the rooms (the Worker's TURN_SECRET, the dev
// server's TURN_SECRET); a page only ever holds credentials that lapse. A fresh tag per connection keeps coturn's
// per-user quota per player. WebCrypto, so the Worker and Node run the same code.
// ttl: seconds the credentials last; a session longer than that loses its relay when coturn next refreshes it.
export const TURN={ttl:12*3600};

const randomTag=()=>[...crypto.getRandomValues(new Uint8Array(4))].map(b=>b.toString(16).padStart(2,'0')).join('');
// urls: comma-separated TURN URLs; secret: coturn's static-auth-secret; now: seconds. Null when either is missing.
export async function turnServer({urls,secret,now,ttl=TURN.ttl,tag=randomTag()}){
  const list=String(urls??'').split(',').map(u=>u.trim()).filter(Boolean);if(!list.length||!secret)return null;
  const username=`${Math.floor(now)+ttl}:${tag}`,text=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',text.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,text.encode(username)));
  return {urls:list,username,credential:btoa(String.fromCharCode(...mac))};
}
