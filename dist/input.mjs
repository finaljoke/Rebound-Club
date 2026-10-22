export function createInput(){
  const keys=new Set(),pointers=new Map();
  function reset(){keys.clear();pointers.clear();}
  function pressed(direction){
    if(direction<0?(keys.has('arrowleft')||keys.has('a')):(keys.has('arrowright')||keys.has('d')))return true;
    for(const value of pointers.values())if(value===direction)return true;
    return false;
  }
  return {
    key(key,down){if(down)keys.add(key.toLowerCase());else keys.delete(key.toLowerCase());},
    down(id,direction){if(direction===-1||direction===1)pointers.set(id,direction);},
    up(id){pointers.delete(id);},
    cancel:reset,reset,pressed,
    axis(){return Number(pressed(1))-Number(pressed(-1));}
  };
}
