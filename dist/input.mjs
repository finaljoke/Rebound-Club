export function createInput(){
  const keys=new Set();let pointer=null,origin=0,drag=0;
  function reset(){keys.clear();pointer=null;drag=0;}
  return {
    key(key,down){if(down)keys.add(key.toLowerCase());else keys.delete(key.toLowerCase());},
    down(id,x){if(pointer===null){pointer=id;origin=x;drag=0;}},
    move(id,x){if(id===pointer)drag=Math.max(-1,Math.min(1,(x-origin)/48));},
    up(id){if(id===pointer){pointer=null;drag=0;}},
    cancel:reset,reset,
    axis(){const keyboard=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a'));return keyboard|| (Math.abs(drag)<.08?0:drag);}
  };
}
