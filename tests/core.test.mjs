import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,pauseGame,resumeGame,LEVELS,WEAPONS} from '../dist/core.mjs';
import * as core from '../dist/core.mjs';

function play(level=0,weapon='glove') {const s=createGame(level,weapon);s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
function incoming(s,x=0,z=2.3) {s.ball={x,z,vx:0,vz:-4};s.player.x=x;}

test('挥中来球反弹向前且同一挥击只计一次',()=>{const s=play();incoming(s);assert.equal(attack(s),true);stepGame(s,.12,0);assert.equal(s.hits,1);assert.ok(s.ball.vz>0);stepGame(s,.05,0);assert.equal(s.hits,1);});
test('人物身体不会自动挡球',()=>{const s=play();incoming(s);stepGame(s,.9,0);assert.equal(s.hits,0);assert.equal(s.misses,1);});
test('挥空与收招期间点击不增加进度',()=>{const s=play();s.ball.z=8;attack(s);assert.equal(attack(s),false);stepGame(s,.5,0);assert.equal(s.hits,0);});
test('漏球只扣一次且保留回击数',()=>{const s=play();s.hits=3;s.combo=2;s.ball.z=.01;stepGame(s,.03,0);assert.equal(s.misses,1);assert.equal(s.hits,3);assert.equal(s.combo,0);stepGame(s,.2,0);assert.equal(s.misses,1);});
test('第三次漏球失败并停止模拟',()=>{const s=play();s.misses=2;s.ball.z=.01;stepGame(s,.05,0);assert.equal(s.phase,'lost');const snapshot=JSON.stringify(s);stepGame(s,10,1);assert.equal(JSON.stringify(s),snapshot);});
test('暂停冻结球与挥击并可恢复',()=>{const s=play();attack(s);pauseGame(s);const snapshot=JSON.stringify(s);stepGame(s,3,1);assert.equal(JSON.stringify(s),snapshot);resumeGame(s);assert.equal(s.phase,'playing');stepGame(s,.3,1);assert.ok(s.player.x>0);});
test('侧墙与门口外的远端墙只改变方向不计回击',()=>{const s=play();s.ball={x:3.79,z:5,vx:2,vz:2};stepGame(s,.05,0);assert.ok(s.ball.vx<0);s.ball={x:3.3,z:9.8,vx:0,vz:4};stepGame(s,.1,0);assert.ok(s.ball.vz<0);assert.equal(s.hits,0);assert.equal(s.goals,0);assert.ok(Math.abs(s.ball.vz)>1);});
test('移动边界与无效时间不会破坏状态',()=>{const s=play();stepGame(s,1,1);assert.ok(s.player.x<=3.45);const x=s.player.x;stepGame(s,NaN,-1);assert.equal(s.player.x,x);});
test('一击只有一球且离开人物的球不能再次击中',()=>{const s=play();s.ball={x:0,z:2.3,vx:0,vz:4};attack(s);stepGame(s,.12,0);assert.equal(s.hits,0);assert.equal(Array.isArray(s.ball),false);});
test('可击打提示在球越过人物后失效，与实际命中范围一致',()=>{const s=play();incoming(s,0,1.4);assert.equal(core.inHitRange?.(s),false);s.ball.z=1.5;assert.equal(core.inHitRange(s),true);s.ball.vz=4;assert.equal(core.inHitRange(s),false);});
// A scripted player that tracks the ball and times early/late swings away from the keeper.
function skilled(s){const w=WEAPONS[s.weapon],b=s.ball,dx=b.x-s.player.x;const axis=b.vz<0&&Math.abs(dx)>.05?Math.sign(dx):0;if(b.vz<0&&Math.abs(dx)<w.width*.7){const t=s.keeper.x>0?.6:-.6,at=s.player.z+w.reach*.5+t*w.reach*.5+Math.abs(b.vz)*w.windup;if(b.z<=at)attack(s);}return axis;}
test('六关各装备：会走位、会掐时机的玩家都能通关',()=>{assert.equal(LEVELS.length,6);assert.equal(Object.keys(WEAPONS).length,3);for(let level=0;level<6;level++){for(const weapon of ['glove','racket','sword']){const s=play(level,weapon);for(let tick=0;tick<60000&&!['won','lost'].includes(s.phase);tick++)stepGame(s,1/120,skilled(s));assert.equal(s.phase,'won',`关${level+1}/${weapon} 进${s.goals} 丢${s.misses}`);}}});
