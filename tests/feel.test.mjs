import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,WEAPONS,PLAYER_Z} from '../dist/core.mjs';
import {hitFeel,whiffHint} from '../dist/ui.mjs';

function play(weapon='glove'){const s=createGame(0,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function swingAndCollect(s){attack(s);const ev=[];for(let i=0;i<120&&s.swing;i++){stepGame(s,1/120,0);ev.push(...s.events);}return ev;}

test('挥空原因来自真实位置：太早、太晚、够不着、没有来球',()=>{
  const w=WEAPONS.glove;
  let s=play();s.ball={x:0,z:6,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;swingAndCollect(s);assert.equal(s.whiff.reason,'early');
  s=play();s.ball={x:0,z:PLAYER_Z-.3,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;swingAndCollect(s);assert.equal(s.whiff.reason,'late');
  s=play();s.ball={x:2,z:PLAYER_Z+w.reach*.6,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;swingAndCollect(s);assert.equal(s.whiff.reason,'reach');assert.equal(s.whiff.side,1);
  s=play();s.ball={x:-2,z:PLAYER_Z+w.reach*.6,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;swingAndCollect(s);assert.equal(s.whiff.side,-1);
  s=play();s.ball={x:0,z:5,vx:0,vz:4,z0:2,z1:9.3};swingAndCollect(s);assert.equal(s.whiff.reason,'none');
});
test('位置和时机都不对时给出中性提示，不编造单一原因',()=>{
  const s=play();s.ball={x:3,z:7,vx:0,vz:-4,z0:7,z1:PLAYER_Z};s.player.x=0;swingAndCollect(s);assert.equal(s.whiff.reason,'unclear');
  assert.equal(whiffHint({reason:'unclear'}),'挥空');assert.match(whiffHint({reason:'early'}),/早/);assert.match(whiffHint({reason:'late'}),/晚/);
  assert.match(whiffHint({reason:'reach',side:1}),/右/);assert.match(whiffHint({reason:'reach',side:-1}),/左/);assert.ok(whiffHint({reason:'none'}).length<=8);
});
test('一次击球只产生一个击球事件，挥空也只报一次',()=>{
  for(const id of Object.keys(WEAPONS)){const s=play(id);s.ball={x:0,z:PLAYER_Z+WEAPONS[id].reach*.5+.1,vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.player.x=0;
    const ev=swingAndCollect(s);assert.equal(ev.filter(e=>['hit','perfect','soft'].includes(e)).length,1,id);
    const t=play(id);t.ball={x:0,z:7,vx:0,vz:-4,z0:7,z1:PLAYER_Z};assert.equal(swingAndCollect(t).filter(e=>e==='whiff').length,1,id);}
});
test('装备手感互不相同，完美击球强度明显高于普通击球',()=>{
  const shapes=new Set(),sounds=new Set();
  for(const id of Object.keys(WEAPONS)){const n=hitFeel(id,'hit'),p=hitFeel(id,'perfect'),soft=hitFeel(id,'soft');
    shapes.add(n.flash);sounds.add(n.sound);
    assert.ok(p.intensity>=n.intensity*1.6,`${id} 完美 ${p.intensity} 普通 ${n.intensity}`);assert.ok(soft.intensity<n.intensity);
    assert.ok(p.life<=.3&&n.life<=.3,'特效短促');assert.ok(p.motion>n.motion);}
  assert.equal(shapes.size,3);assert.equal(sounds.size,3);
});
