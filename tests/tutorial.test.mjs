import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,swingPreview,LEVELS,WEAPONS,PLAYER_Z,KEEPER_Z} from '../dist/core.mjs';
import {loadProgress,saveProgress,needsTutorial} from '../dist/storage.mjs';

const levelsBefore=JSON.stringify(LEVELS);
function tutorial(){const s=createGame(0,'glove',{tutorial:true});startGame(s);stepGame(s,1,0);return s;}
function run(s,secs,axis=0){const ev=[];for(let i=0;i<secs*120;i++){stepGame(s,1/120,axis);ev.push(...s.events);}return ev;}
// Moves under the ball and swings when the real preview says the press would connect cleanly.
function returnBall(s,want=k=>k==='clean'||k==='perfect'){const ev=[];for(let i=0;i<600&&s.phase==='playing'&&s.ball.vz<0;i++){
  const dx=s.ball.x-s.player.x,axis=Math.abs(dx)>.05?Math.sign(dx):0;if(!s.swing&&want(swingPreview(s).kind))attack(s);stepGame(s,1/120,axis);ev.push(...s.events);}return ev;}
function waitServe(s){const ev=[];for(let i=0;i<400&&!(s.phase==='playing'&&s.ball.vz<0);i++){stepGame(s,1/120,0);ev.push(...s.events);}return ev;}

test('第一步：慢速直球正对人物，打回去才进入第二步；漏球不扣机会也不耗练习',()=>{
  const s=tutorial();assert.equal(s.tutorial.step,0);assert.ok(Math.abs(s.ball.vz)<LEVELS[0].speed);assert.ok(Math.abs(s.ball.x-s.player.x)<.01);assert.equal(s.ball.vx,0);
  const practice=s.practiceLeft;run(s,4);assert.equal(s.misses,0);assert.equal(s.practiceLeft,practice);assert.equal(s.tutorial.step,0);
  waitServe(s);const ev=returnBall(s);assert.ok(ev.includes('tutorialStep'));assert.equal(s.tutorial.step,1);
});
test('第二步：球从侧边来，需要移动后击球；第三步门将站在一侧不动',()=>{
  const s=tutorial();waitServe(s);returnBall(s);const ev=waitServe(s);
  assert.equal(s.tutorial.step,1);assert.ok(Math.abs(s.ball.x-s.player.x)>1.5,'侧边来球应远离人物');
  returnBall(s);assert.equal(s.tutorial.step,2);waitServe(s);
  const kx=s.keeper.x;assert.ok(Math.abs(kx)>1);run(s,.5);assert.equal(s.keeper.x,kx);
});
test('第三步：朝空门方向进球即完成教学；被扑住会重来，不计入进球和失误',()=>{
  const s=tutorial();for(let i=0;i<2;i++){waitServe(s);returnBall(s);}waitServe(s);assert.equal(s.tutorial.step,2);
  // Aim straight at the keeper first (a soft contact always flies dead straight): it saves, the step repeats.
  s.player.x=s.keeper.x;s.ball.x=s.keeper.x;s.ball.vx=0;let ev=returnBall(s,k=>k==='soft');ev.push(...run(s,3));
  assert.ok(ev.includes('save'));assert.equal(s.tutorial.step,2);assert.equal(s.goals,0);assert.equal(s.misses,0);
  waitServe(s);const open=-Math.sign(s.keeper.x)*1.2;s.player.x=open;s.ball.x=open;s.ball.vx=0;ev=returnBall(s,k=>k==='soft');ev.push(...run(s,3));
  assert.ok(ev.includes('tutorialDone'));assert.equal(s.tutorial.done,true);assert.equal(s.phase,'tutorial-done');
});
test('教学的特殊球速、发球和门将状态不会泄漏到普通关卡',()=>{
  const s=tutorial();for(let i=0;i<2;i++){waitServe(s);returnBall(s);}
  assert.equal(JSON.stringify(LEVELS),levelsBefore);
  const n=createGame(0,'glove');assert.equal(n.tutorial,null);startGame(n);stepGame(n,1,0);
  assert.ok(Math.abs(Math.hypot(n.ball.vx,n.ball.vz)-Math.hypot(.65,LEVELS[0].speed))<1e-9);
  assert.equal(n.practiceLeft,LEVELS[0].practice);assert.equal(createGame(1,'glove',{tutorial:true}).tutorial,null,'只有第一关有教学');
});
test('教学完成状态可保存；老玩家（已有进度）不再被要求教学',()=>{
  let raw=null;const mem={getItem(){return raw;},setItem(k,v){raw=v;}};
  const fresh=loadProgress(mem);assert.equal(needsTutorial(fresh),true);
  fresh.tutorialDone=true;saveProgress(mem,fresh);assert.equal(loadProgress(mem).tutorialDone,true);assert.equal(needsTutorial(loadProgress(mem)),false);
  raw=JSON.stringify({unlocked:2,scores:{0:1800}});assert.equal(needsTutorial(loadProgress(mem)),false);
  raw=JSON.stringify({unlocked:0,scores:{},tutorialDone:'yes'});assert.equal(loadProgress(mem).tutorialDone,false);
});
