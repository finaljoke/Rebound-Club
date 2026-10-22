import test from 'node:test';import assert from 'node:assert/strict';
import {createInput} from '../dist/input.mjs';
test('方向按钮按下即持续移动，无需拖动；松开立即停止',()=>{const i=createInput();i.down(1,-1);assert.equal(i.axis(),-1);assert.equal(i.axis(),-1);i.up(1);assert.equal(i.axis(),0);i.down(2,1);assert.equal(i.axis(),1);i.up(2);assert.equal(i.axis(),0);});
test('挥击或技能触点的释放不能结束方向按钮的移动',()=>{const i=createInput();i.down(1,1);i.up(2);assert.equal(i.axis(),1);i.up(1);assert.equal(i.axis(),0);});
test('同时按住左右按钮相互抵消，松开一侧恢复另一侧',()=>{const i=createInput();i.down(1,-1);i.down(2,1);assert.equal(i.axis(),0);i.up(1);assert.equal(i.axis(),1);i.up(2);assert.equal(i.axis(),0);});
test('暂停或失焦重置所有触点及按键，旧触点释放不影响新操作',()=>{const i=createInput();i.key('ArrowRight',true);i.down(1,-1);i.cancel();assert.equal(i.axis(),0);i.down(2,1);i.up(1);assert.equal(i.axis(),1);i.reset();assert.equal(i.axis(),0);});
test('键盘与触摸方向合并，释放触点后保留真实按住的键盘方向',()=>{const i=createInput();i.key('d',true);i.down(1,-1);assert.equal(i.axis(),0);i.up(1);assert.equal(i.axis(),1);i.key('d',false);assert.equal(i.axis(),0);});
test('左右键同时按住互相抵消，释放后恢复剩余方向',()=>{const i=createInput();i.key('ArrowLeft',true);i.key('ArrowRight',true);assert.equal(i.axis(),0);i.key('ArrowLeft',false);assert.equal(i.axis(),1);i.key('ArrowRight',false);assert.equal(i.axis(),0);});
