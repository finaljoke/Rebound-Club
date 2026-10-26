import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,inHitRange,LEVELS,WEAPONS,PLAYER_Z} from '../dist/core.mjs';

// The keeper reads a direction held once the defender is planted, leans on a repeated aim pattern, and recovers
// toward the middle between shots. Mechanics are checked with the strength set by hand; tuned values per level below.
function play(level=0,keeper={}){const s=createGame(level);s.practiceLeft=0;startGame(s);stepGame(s,1,0);s.level={...s.level,keeper:{...s.level.keeper,speed:1.3,...keeper}};s.keeper.x=0;return s;}
function incoming(s,z=6){s.ball={x:0,z,vx:0,vz:-4,z0:z,z1:PLAYER_Z};s.player.x=0;s.hitstop=0;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;

test('球进框后按住的方向会被会读招的门将看到，它提前往那一侧移动',()=>{
  const reader=play(0,{read:1});incoming(reader);for(let i=0;i<2000&&!inHitRange(reader);i++)stepGame(reader,1/120,0);
  for(let i=0;i<18;i++)stepGame(reader,1/120,-1);assert.ok(reader.keeper.x<-.15,`读招门将 ${reader.keeper.x}`);
  const blind=play(0,{read:0});incoming(blind);for(let i=0;i<2000&&!inHitRange(blind);i++)stepGame(blind,1/120,0);
  for(let i=0;i<18;i++)stepGame(blind,1/120,-1);assert.equal(blind.keeper.x,0,'不读招的门将不动');
});
test('框外按方向是在移动，不算暴露瞄准',()=>{
  const s=play(0,{read:1});incoming(s,8);for(let i=0;i<30;i++)stepGame(s,1/120,-1);
  assert.equal(inHitRange(s),false);assert.equal(s.keeper.x,0);
});
test('记录最近三次瞄准方向',()=>{
  const s=play(0);for(const axis of [-1,1,0,1]){incoming(s);
    const w=WEAPONS[s.weapon];for(let i=0;i<2000&&s.ball.z>sweet(s)+.3+4*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0;i++)stepGame(s,1/120,axis);}
  assert.deepEqual(s.aims,[1,0,1]);
});
test('识破规律：左右交替时预判下一球回到上上球那侧，连续同侧时预判还打同侧',()=>{
  const lean=aims=>{const s=play(0,{pattern:1});s.aims=aims;incoming(s,8);stepGame(s,.5,0);return s.keeper.x;};
  assert.ok(lean([-1,1])<-.15,`左右交替 ${lean([-1,1])}`);
  assert.ok(lean([1,-1])>.15,`右左交替 ${lean([1,-1])}`);
  assert.ok(lean([1,1])>.15,`连续右 ${lean([1,1])}`);
  assert.equal(lean([1,0]),0,'没有规律不偏');assert.equal(lean([-1]),0,'只有一球不偏');
  const off=play(0,{pattern:0});off.aims=[-1,1];incoming(off,8);stepGame(off,.5,0);assert.equal(off.keeper.x,0);
});
test('两球之间回中速度由关卡决定',()=>{
  const back=recover=>{const s=play(0,{recover});s.keeper.x=-2;incoming(s,8);stepGame(s,1,0);return s.keeper.x;};
  assert.ok(back(1)>-.8,`快速回中 ${back(1)}`);assert.ok(back(.35)<-1.4,`原速回中 ${back(.35)}`);
});
test('前两关门将不读招、不识规律；第3关起逐关增强',()=>{
  for(const i of [0,1]){const K=LEVELS[i].keeper;assert.ok(!K.read&&!K.pattern,`关${i+1}`);}
  for(let i=2;i<6;i++){const K=LEVELS[i].keeper;assert.ok(K.read>0&&K.pattern>0,`关${i+1}`);}
  for(let i=3;i<6;i++){const a=LEVELS[i-1].keeper,b=LEVELS[i].keeper;assert.ok(b.read>=a.read&&b.pattern>=a.pattern,`关${i+1} 不应弱于上一关`);}
});
