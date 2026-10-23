import test from 'node:test';
import assert from 'node:assert/strict';
import {ballHeight,HIT_HEIGHT,PLAYER_Z,KEEPER_Z} from '../dist/core.mjs';

// Height along a flight from z0 to z1 at a given forward speed (only the depth speed matters for the arc).
function apexOf(speed,z0=KEEPER_Z-.3,z1=PLAYER_Z){
  let top=0;const ball={x:0,z:z0,vx:0,vz:z1>z0?speed:-speed,z0,z1};
  for(let i=0;i<=100;i++){ball.z=z0+(z1-z0)*i/100;top=Math.max(top,ballHeight({ball})-HIT_HEIGHT);}
  return top;
}

test('弧线由固定重力决定：同一段距离，球越快越平，越慢越高',()=>{
  const serve=apexOf(4),fast=apexOf(10),soft=apexOf(3.2),burst=apexOf(12.5);
  assert.ok(Math.abs(serve-.9)<.06,`第一关发球弧顶 ${serve.toFixed(2)}`);
  assert.ok(fast<.25,`快球弧顶 ${fast.toFixed(2)}`);assert.ok(burst<fast);
  assert.ok(soft>serve,`软球弧顶 ${soft.toFixed(2)}`);assert.ok(soft<=1.5);
});

test('弧线两端都在击球高度，中途连续',()=>{
  for(const speed of [3,4,7,12.5]){
    const ball={x:0,z:9,vx:0,vz:-speed,z0:9,z1:PLAYER_Z};
    assert.ok(Math.abs(ballHeight({ball})-HIT_HEIGHT)<1e-9);ball.z=PLAYER_Z;assert.ok(Math.abs(ballHeight({ball})-HIT_HEIGHT)<1e-9);
    let prev=null;for(let z=9;z>=PLAYER_Z;z-=.05){ball.z=z;const h=ballHeight({ball});if(prev!==null)assert.ok(Math.abs(h-prev)<.05,`速度${speed} z=${z.toFixed(2)} 跳变`);prev=h;}
  }
});
