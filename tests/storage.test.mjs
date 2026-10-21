import test from 'node:test';import assert from 'node:assert/strict';
import {loadProgress,saveProgress} from '../dist/storage.mjs';
function memory(raw=null){return {getItem(){return raw;},setItem(k,v){raw=v;}};}
test('保存后重新读取通过进度、分数与完美评价',()=>{const s=memory();assert.equal(saveProgress(s,{unlocked:2,scores:{0:1200},perfect:{0:true}}),true);const p=loadProgress(s);assert.equal(p.unlocked,2);assert.equal(p.scores[0],1200);assert.equal(p.perfect[0],true);});
test('拒绝访问和损坏数据都能回到可玩默认状态',()=>{for(const s of [null,memory('{broken'),{getItem(){throw Error('denied');}}]){assert.equal(loadProgress(s).unlocked,0);}assert.equal(saveProgress({setItem(){throw Error('full');}},{}),false);});
test('外来非法进度不会解锁越界关卡或污染最高分',()=>{const p=loadProgress(memory(JSON.stringify({unlocked:900,scores:{0:-20,1:'oops'},perfect:{0:'yes'}})));assert.equal(p.unlocked,5);assert.equal(p.scores[0],undefined);assert.equal(p.scores[1],undefined);assert.equal(p.perfect[0],undefined);});
