import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,ballHeight,WEAPONS,LEVELS,PLAYER_Z,PERFECT_BAND,RALLY_CAP,POWER,SOFT,RALLY_STEP} from '../dist/core.mjs';

function play(level=0,weapon='glove'){const s=createGame(level,weapon);startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=4){const v=s.level.speed*s.rally;s.ball={x,z,vx:0,vz:-v,z0:z,z1:PLAYER_Z};s.player.x=x;s.hitstop=0;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
// Opens the active window when the ball is at depth `z`, then lets the swing resolve.
function swingAt(s,z){const w=WEAPONS[s.weapon];for(let i=0;i<2000&&s.ball.z>z+Math.abs(s.ball.vz)*w.windup;i++)stepGame(s,1/120,0);attack(s);for(let i=0;i<30&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,0);}
const speed=b=>Math.hypot(b.vx,b.vz);

test('早挥往左、晚挥往右、正中直线',()=>{
  const half=WEAPONS.glove.reach*.5;
  let s=play();incoming(s);swingAt(s,sweet(s)+half*.8);assert.ok(s.ball.vz>0);assert.ok(s.ball.vx<-.5,`早挥 vx=${s.ball.vx}`);assert.equal(s.lastShot,'left');
  s=play();incoming(s);swingAt(s,sweet(s)-half*.8);assert.ok(s.ball.vz>0);assert.ok(s.ball.vx>.5,`晚挥 vx=${s.ball.vx}`);assert.equal(s.lastShot,'right');
  s=play();incoming(s);swingAt(s,sweet(s));assert.ok(s.ball.vz>0);assert.ok(Math.abs(s.ball.vx)<.25,`正中 vx=${s.ball.vx}`);
});
test('完美只看球与甜点的距离，并打出重炮',()=>{
  const half=WEAPONS.glove.reach*.5;
  let s=play();incoming(s);swingAt(s,sweet(s)+half*PERFECT_BAND*.6);
  assert.equal(s.lastShot,'perfect');assert.equal(s.power,true);assert.equal(s.score,150);
  assert.ok(Math.abs(speed(s.ball)-LEVELS[0].speed*RALLY_STEP*POWER)<1e-6);
  s=play();incoming(s);swingAt(s,sweet(s)+half*.6);
  assert.notEqual(s.lastShot,'perfect');assert.equal(s.power,false);assert.equal(s.score,100);
});
test('提前挥拍等球撞上来是软球：直线、减速、不判完美',()=>{
  const s=play(),w=WEAPONS.glove;incoming(s,0,4);const front=PLAYER_Z+w.reach,v=Math.abs(s.ball.vz);
  for(let i=0;i<2000&&s.ball.z>front+v*(w.windup+w.active*.5);i++)stepGame(s,1/120,0);
  attack(s);for(let i=0;i<60&&s.ball.vz<0&&!s.misses;i++)stepGame(s,1/120,0);
  assert.equal(s.lastShot,'soft');assert.equal(s.ball.vx,0);assert.ok(s.ball.vz>0);
  assert.ok(Math.abs(speed(s.ball)-LEVELS[0].speed*RALLY_STEP*SOFT)<1e-6);
});
test('回合球速每击递增并封顶，漏球后重置',()=>{
  const s=play();s.level={...s.level,target:Infinity};for(let i=0;i<20;i++){incoming(s);swingAt(s,sweet(s)+.3);}
  assert.equal(s.rally,RALLY_CAP);
  incoming(s);for(let i=0;i<240&&!s.misses;i++)stepGame(s,1/120,0);assert.equal(s.misses,1);assert.equal(s.rally,1);
});
test('站在球路上无脑连按至少漏掉三成',()=>{
  for(const id of Object.keys(WEAPONS)){
    const w=WEAPONS[id],cycle=w.windup+w.active+w.recovery+w.whiff;let hits=0;const n=40;
    for(let k=0;k<n;k++){
      const s=play(0,id);incoming(s,0,3.5+k/n*cycle*LEVELS[0].speed);
      for(let i=0;i<600&&s.ball.vz<0&&!s.misses;i++){attack(s);stepGame(s,1/120,0);}
      if(s.ball.vz>0)hits++;
    }
    assert.ok(hits/n<=.7,`${id} 连按命中率 ${hits/n}`);
  }
});
test('完美击球触发顿帧，期间模拟冻结',()=>{
  const s=play();incoming(s);swingAt(s,sweet(s));assert.ok(s.hitstop>0);
  const z=s.ball.z;stepGame(s,.03,1);assert.equal(s.ball.z,z);stepGame(s,.2,0);assert.ok(s.ball.z>z);
});
test('球每一程走抛物线：两端回到击球高度，中段更高',()=>{
  const s=play();s.ball={x:0,z:8,vx:0,vz:-4,z0:8,z1:2};assert.ok(Math.abs(ballHeight(s)-.73)<1e-9);
  s.ball.z=5;assert.ok(ballHeight(s)>1);s.ball.z=2;assert.ok(Math.abs(ballHeight(s)-.73)<1e-9);s.ball.z=1;assert.ok(Math.abs(ballHeight(s)-.73)<1e-9);
});
