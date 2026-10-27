import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildGlove,makeSurfaceTexture} from '../dist/art.mjs';
test('草地纹理确定性生成、可重复且有细微变化，不依赖远程图片',()=>{
  const a=makeSurfaceTexture('turf'),b=makeSurfaceTexture('turf');assert.ok(a?.isDataTexture);
  assert.deepEqual(a.image.data,b.image.data);const pixels=a.image.data;let min=255,max=0;for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}
  assert.ok(max>min&&max-min<60);assert.equal(a.wrapS,THREE.RepeatWrapping);assert.equal(a.generateMipmaps,true);
});
test('拳套由独立本体和装饰组成，换成徒手时装饰可以完整隐藏',()=>{
  const g=buildGlove('#ed6941');assert.ok(g?.group?.isGroup);assert.ok(g.body?.isMesh);assert.ok(g.details?.isGroup);
  assert.ok(g.details.children.length>0);g.details.visible=false;assert.equal(g.body.visible,true);
  const box=new THREE.Box3().setFromObject(g.group),size=box.getSize(new THREE.Vector3());assert.ok(size.x>.25&&size.y>.25&&size.z>.25);
});
