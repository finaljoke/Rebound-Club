import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,useSkill,predictFlight,spinPreview,SKILLS,WEAPONS,PLAYER_Z,KEEPER_Z,GOAL_Z,SIDE,LEVELS,SPIN_SHARE} from '../dist/core.mjs';

function play(level=0){const s=createGame(level,'glove');s.practiceLeft=0;startGame(s);stepGame(s,1,0);return s;}
const sweet=s=>PLAYER_Z+WEAPONS[s.weapon].reach*.5;
// A spin taken holding `axis` (-1 left, 1 right, 0 none); keeper parked far away (left) so the flight finishes.
function spun(axis,x=0,level=0){const s=play(level);s.energy=100;s.player.x=x;s.ball={x,z:sweet(s),vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.hitstop=0;
  s.level={...s.level,keeper:{...s.level.keeper,speed:0}};s.keeper.x=-9;assert.equal(useSkill(s,'spin',axis).ok,true);return s;}
// Runs the real simulation with a given outer frame interval and records where the ball crosses each line.
function fly(s,dt){const out={path:[]};let prev={x:s.ball.x,z:s.ball.z};for(let i=0;i<Math.ceil(4/dt)&&s.ball.vz>0;i++){stepGame(s,dt,0);
  const b=s.ball;out.path.push({x:b.x,z:b.z});
  for(const [k,line] of [['keeper',KEEPER_Z],['goal',GOAL_Z]])if(out[k]===undefined&&prev.z<line&&b.z>=line)out[k]=prev.x+(b.x-prev.x)*(line-prev.z)/(b.z-prev.z);
  if(out.goal===undefined&&s.goals)out.goal=prev.x+(b.x-prev.x)*(GOAL_Z-prev.z)/Math.max(1e-9,b.z-prev.z);
  prev={x:b.x,z:b.z};}return out;}

test('AC4 左旋/右旋真实弯曲：比同角度直线偏得更多，方向跟随按键，不按时拐离门将，落在门宽 90% 处',()=>{
  for(const [axis,dir] of [[-1,-1],[1,1],[0,1]]){
    const s=spun(axis);const a0=Math.atan2(s.ball.vx,s.ball.vz);
    assert.equal(Math.sign(s.ball.curve.k),dir);const r=fly(s,1/120);
    const straight=s.shot.x+Math.tan(a0)*(KEEPER_Z-s.shot.z);assert.ok((r.keeper-straight)*dir>.2,`axis=${axis} 弯曲 ${(r.keeper-straight).toFixed(3)}`);
    assert.ok(Math.abs(r.goal-dir*LEVELS[0].goalHalf*SPIN_SHARE)<=.02,`axis=${axis} 落点 ${r.goal}`);
  }
});
test('AC4 球心平滑：每一步方向变化有限、位置连续；30/60/120Hz外层帧率结果一致（≤0.02）',()=>{
  const ref=fly(spun(-1),1/120);
  for(const dt of [1/30,1/60]){const r=fly(spun(-1),dt);assert.ok(Math.abs(r.goal-ref.goal)<=.02,`dt=${dt} ${r.goal} vs ${ref.goal}`);}
  const s=spun(1);let a=Math.atan2(s.ball.vx,s.ball.vz),x=s.ball.x,z=s.ball.z;
  for(let i=0;i<400&&s.ball.vz>0;i++){stepGame(s,1/120,0);const b=s.ball;if(b.vz<=0||s.phase!=='playing')break;const na=Math.atan2(b.vx,b.vz),v=Math.hypot(b.vx,b.vz);
    assert.ok(Math.abs(na-a)<=SKILLS.spin.curve*v/120+1e-9,'方向突变');assert.ok(Math.hypot(b.x-x,b.z-z)<=v/120+1e-9,'位置跳变');a=na;x=b.x;z=b.z;}
});
test('AC4 弯曲在出球点到门将线纵向行程的70%处停止，之后沿切线直飞；出球角不超过0.65',()=>{
  const s=spun(-1);const z0=s.ball.z,stop=z0+(KEEPER_Z-z0)*SKILLS.spin.curveShare;let last=null;
  for(let i=0;i<400&&s.ball.vz>0;i++){stepGame(s,1/120,0);if(s.ball.vz<=0||s.phase!=='playing')break;const a=Math.atan2(s.ball.vx,s.ball.vz);assert.ok(Math.abs(a)<=SKILLS.spin.maxAngle+1e-9);
    if(s.ball.z>stop+.1&&s.ball.z<KEEPER_Z){if(last!==null)assert.ok(Math.abs(a-last)<1e-12,'过停止点后不应再弯');last=a;}}
});
test('AC5 预测与真实推进共用物理：侧墙、门将线、门线穿越点差≤0.02，预测不改状态',()=>{
  for(const [t,x] of [[-1,-2.6],[1,2.6],[-1,0],[1,-1]]){
    const s=spun(t,x);const snap=JSON.stringify(s);const p=predictFlight(s);assert.equal(JSON.stringify(s),snap,'预测改动了状态');
    let wall=null;const r={};let prev={x:s.ball.x,z:s.ball.z};
    for(let i=0;i<600&&s.ball.vz>0;i++){stepGame(s,1/120,0);const b=s.ball;if(s.phase!=='playing'&&!s.events.includes('goal'))break;
      if(!wall&&s.events.includes('wall'))wall={x:b.x,z:b.z};
      for(const [k,line] of [['keeper',KEEPER_Z],['goal',GOAL_Z]])if(r[k]===undefined&&prev.z<line&&b.z>=line)r[k]=prev.x+(b.x-prev.x)*(line-prev.z)/(b.z-prev.z);prev={x:b.x,z:b.z};}
    assert.ok(Math.abs(p.keeper-r.keeper)<=.02,`t=${t} 门将线 ${p.keeper} vs ${r.keeper}`);
    if(r.goal!==undefined)assert.ok(Math.abs(p.goal-r.goal)<=.02,`t=${t} 门线 ${p.goal} vs ${r.goal}`);
    if(wall){assert.ok(p.wall,'预测漏掉侧墙');assert.ok(Math.abs(p.wall.z-wall.z)<=.05&&Math.abs(Math.abs(p.wall.x)-SIDE)<1e-9);}
  }
});
test('AC6 生命周期：撞侧墙清除旋转并反射；被扑回、远端墙反弹、重新发球都清除；不额外扣能量',()=>{
  let s=spun(-1,-3.3);for(let i=0;i<400&&s.ball.curve;i++)stepGame(s,1/120,0);assert.equal(s.ball.curve,null);assert.ok(s.ball.vx>0,'左墙反射后向右');assert.equal(s.energy,50);
  s=play();s.energy=100;s.player.x=0;s.ball={x:0,z:sweet(s),vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.keeper.x=0;s.level={...s.level,keeper:{...s.level.keeper,speed:6,delay:0}};
  useSkill(s,'spin');for(let i=0;i<600&&s.ball.vz>0;i++)stepGame(s,1/120,0);assert.ok(s.ball.vz<0);assert.equal(s.ball.curve,null);assert.equal(s.ball.kind,null);
  s=spun(-1,1.5);s.level={...s.level,goalHalf:.3};for(let i=0;i<600&&s.ball.vz>0;i++)stepGame(s,1/120,0);assert.ok(s.ball.vz<0);assert.equal(s.ball.curve,null);
  s=play();assert.equal(s.ball.curve??null,null);
});
test('AC9 最高速爆发按实际穿越点判定：门内进、门外打偏、正对门将被扑，各只结算一次',()=>{
  const fire=(x,angle,keeperX)=>{const s=play(5);s.rally=1.6;s.energy=100;s.player.x=x;s.ball={x,z:sweet(s),vx:0,vz:-4,z0:6,z1:PLAYER_Z};s.keeper.x=keeperX;
    s.level={...s.level,keeper:{...s.level.keeper,speed:0}};assert.equal(useSkill(s,'burst').ok,true);const ev=[];
    // Held directions only reach marks inside the mouth, so the launched ball is turned to the angle under test at its own speed.
    for(let i=0;i<240&&s.phase==='skill';i++){stepGame(s,1/120,0);ev.push(...s.events);}const v=Math.hypot(s.ball.vx,s.ball.vz);s.ball.vx=Math.sin(angle)*v;s.ball.vz=Math.cos(angle)*v;
    for(let i=0;i<360;i++){stepGame(s,1/120,0);ev.push(...s.events);if(s.phase!=='playing'&&s.phase!=='skill')break;}return {s,ev};};
  const max=SKILLS.burst.maxSpeed;let {s,ev}=fire(0,0,-2);assert.ok(Math.abs(Math.hypot(s.ball.vx,s.ball.vz)-max)<1e-6||s.goals===1);assert.equal(ev.filter(e=>e==='goal').length,1);
  ({s,ev}=fire(1,.35,-2));assert.equal(s.goals,0);assert.ok(ev.includes('wide'));
  ({s,ev}=fire(0,0,0));assert.ok(ev.includes('save'));assert.equal(s.goals,0);assert.ok(Math.hypot(s.ball.vx,s.ball.vz)<max,'扑回后恢复普通速度');
  // Post graze: a path that crosses the goal line just outside the mouth is wide, just inside is a goal.
  const g=LEVELS[5].goalHalf,dz=GOAL_Z-sweet(play(5));
  ({s}=fire(0,Math.atan((g+.03)/dz),-2));assert.equal(s.goals,0);({s}=fire(0,Math.atan((g-.03)/dz),-2));assert.equal(s.goals,1);
});
test('旋转预览：显示真实方向与短弧线，与实际弯曲方向一致',()=>{
  for(const [axis,dir] of [[-1,'left'],[1,'right'],[0,'left']]){const s=play();s.energy=100;s.player.x=0;s.ball={x:0,z:sweet(s),vx:0,vz:-4,z0:6,z1:PLAYER_Z};
    const p=spinPreview(s,axis);assert.equal(p.dir,dir);assert.ok(p.count>=6);const lastX=p.xs[p.count-1];assert.ok(dir==='left'?lastX<0:lastX>0);
    const snap=JSON.stringify(s);spinPreview(s);assert.equal(JSON.stringify(s),snap);}
});
// Reproducible cases under real level rules (keeper speed, delay and misread untouched).
function caseState(level,x,shots){const s=createGame(level,'glove');s.practiceLeft=0;startGame(s);stepGame(s,1,0);s.energy=100;s.shots=shots;s.player.x=x;s.keeper.x=0;s.hitstop=0;return s;}
function outcome(s){for(let i=0;i<900;i++){stepGame(s,1/120,0);for(const e of ['goal','save','wide'])if(s.events.includes(e))return e;}return 'none';}
test('AC14 旋转绕位案例：同一接球点与方向，普通回击被扑，旋转绕过门将进球（第4关封角、第5关左右对称）',()=>{
  const w=WEAPONS.glove,dt=1/120,t=.6;
  for(const [level,x,axis] of [[3,-2,-1],[3,2,1],[4,-1,1],[4,1,-1]])for(let shots=0;shots<4;shots++){
    const z=PLAYER_Z+w.reach*.5+t*w.reach*.5,v=LEVELS[level].speed,ticks=Math.ceil(w.windup*120);
    const normal=caseState(level,x,shots);normal.ball={x,z:z+v*ticks*dt,vx:0,vz:-v,z0:6,z1:PLAYER_Z};attack(normal);for(let i=0;i<ticks+2&&normal.ball.vz<0;i++)stepGame(normal,dt,axis);
    assert.notEqual(normal.lastShot,'soft');assert.equal(outcome(normal),'save',`普通 关${level+1} x=${x} 方向${axis} shots=${shots}`);
    const spin=caseState(level,x,shots);spin.ball={x,z,vx:0,vz:-v,z0:6,z1:PLAYER_Z};assert.equal(useSkill(spin,'spin',axis).ok,true);assert.equal(outcome(spin),'goal',`旋转 关${level+1} x=${x} 方向${axis} shots=${shots}`);
  }
});
test('AC14 正面爆发仍会被扑：门将站在球路上时爆发被扑住',()=>{
  for(const level of [0,2,5])for(const x of [-1,0,1]){const s=caseState(level,x,0);s.keeper.x=x;s.ball={x,z:PLAYER_Z+WEAPONS.glove.reach*.5,vx:0,vz:-s.level.speed,z0:6,z1:PLAYER_Z};
    assert.equal(useSkill(s,'burst').ok,true);assert.equal(outcome(s),'save',`关${level+1} x=${x}`);}
});
