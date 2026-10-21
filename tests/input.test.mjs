import test from 'node:test';import assert from 'node:assert/strict';
import {createInput} from '../dist/input.mjs';
test('第二触点不能夺取或结束正在进行的移动',()=>{const i=createInput();i.down(1,100);i.move(1,148);assert.equal(i.axis(),1);i.down(2,20);i.move(2,-200);i.up(2);assert.equal(i.axis(),1);i.up(1);assert.equal(i.axis(),0);});
test('触点取消清空移动与按键',()=>{const i=createInput();i.key('ArrowRight',true);assert.equal(i.axis(),1);i.cancel();assert.equal(i.axis(),0);i.down(1,0);i.move(1,-60);assert.equal(i.axis(),-1);i.reset();assert.equal(i.axis(),0);});
test('左右键同时按住互相抵消，释放后恢复剩余方向',()=>{const i=createInput();i.key('ArrowLeft',true);i.key('ArrowRight',true);assert.equal(i.axis(),0);i.key('ArrowLeft',false);assert.equal(i.axis(),1);i.key('ArrowRight',false);assert.equal(i.axis(),0);});
