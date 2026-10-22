import test from 'node:test';import assert from 'node:assert/strict';
import {screenFor,createMatchStats,recordMatchEvent,matchSummary} from '../dist/ui.mjs';
test('进球或漏球倒数仍留在对局界面，只有终局显示结算',()=>{
  assert.equal(screenFor('ready'),'ready');for(const p of ['serving','playing','goal','miss'])assert.equal(screenFor(p),'match');
  assert.equal(screenFor('paused'),'paused');for(const p of ['won','lost'])assert.equal(screenFor(p),'result');
});
test('本局亮点只统计实际发生的事件，重炮被扑住不能算重炮进球',()=>{
  const stats=createMatchStats();recordMatchEvent(stats,'perfect',{lastShot:'perfect'});recordMatchEvent(stats,'save',{lastShot:'perfect'});
  assert.equal(stats.powerHits,1);assert.equal(stats.powerGoals,0);recordMatchEvent(stats,'goal',{lastShot:'left'});assert.equal(stats.powerGoals,0);
  recordMatchEvent(stats,'goal',{lastShot:'perfect'});assert.equal(stats.powerGoals,1);assert.equal(createMatchStats().powerHits,0);
});
test('结算主按钮能进入下一关，最后一关和失败都能重试',()=>{
  const s={phase:'won',levelIndex:0,goals:2,misses:0,bestCombo:4,score:2500,level:{goals:2,lesson:'练习变向'}};
  const stats=createMatchStats();const r=matchSummary(s,stats);assert.equal(r.action,'next');assert.equal(r.title,'零失球，漂亮拿下！');assert.equal(r.goals,2);
  assert.equal(matchSummary({...s,levelIndex:5},stats).action,'retry');assert.equal(matchSummary({...s,phase:'lost'},stats).action,'retry');
});
test('失败建议根据实际挥空或扑救情况选择，不编造本局表现',()=>{
  const s={phase:'lost',levelIndex:0,goals:1,misses:3,bestCombo:2,score:300,level:{goals:3,lesson:'观察门将'}};
  const stats=createMatchStats();assert.equal(matchSummary(s,stats).advice,'观察门将');
  for(let i=0;i<3;i++)recordMatchEvent(stats,'whiff',s);assert.match(matchSummary(s,stats).advice,/击球框/);
  const other=createMatchStats();for(let i=0;i<4;i++)recordMatchEvent(other,'save',s);assert.match(matchSummary(s,other).advice,/方向/);
});
test('练习保护期间丢过球，通关后不会宣称零失球',()=>{
  const s={phase:'won',levelIndex:0,goals:2,misses:0,bestCombo:2,score:2200,level:{goals:2,lesson:'接住来球'}};
  const stats=createMatchStats();recordMatchEvent(stats,'practice',s);
  assert.equal(stats.practiceConceded,1);assert.doesNotMatch(matchSummary(s,stats).title,/零失球/);
});
