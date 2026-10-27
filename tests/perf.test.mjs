import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld,createQualityGovernor,QUALITY_TIERS} from '../dist/scene3d.mjs';
import {mergeRigidParts} from '../dist/art.mjs';
import {createGame,startGame,stepGame,ballHeight,SIDE} from '../dist/core.mjs';

// Visible renderables approximate the colour pass; casters approximate the shadow pass.
function drawCounts(w){
  let main=0,casters=0;
  w.scene.traverseVisible(o=>{if(o.isMesh||o.isLine||o.isPoints){main++;if(o.isMesh&&o.castShadow)casters++;}});
  return {main,casters};
}
function playing(level=0){const s=createGame(level);startGame(s);for(let i=0;i<400&&s.phase!=='playing';i++)stepGame(s,1/60,0);return s;}

test('合并静态场景与球员零件后，每帧绘制数在手机预算内',()=>{
  const w=buildWorld();w.resize(.46);
  for(const s of [createGame(),playing(),playing(5)]){w.update(s,0,false,1);const c=drawCounts(w);
    assert.ok(c.main<=100,`可见物体 ${c.main}`);assert.ok(c.casters<=50,`投影物体 ${c.casters}`);}
});

test('零件合并保持外形、顶点和颜色；保留名单、透明、贴图不同或带子节点的零件保持独立',()=>{
  const root=new THREE.Group(),joint=new THREE.Group();root.add(joint);
  const red=new THREE.MeshStandardMaterial({color:'#f00',roughness:.8}),green=new THREE.MeshStandardMaterial({color:'#0f0',roughness:.8}),shiny=new THREE.MeshStandardMaterial({color:'#00f',roughness:.2});
  const texture=new THREE.DataTexture(new Uint8Array(4),1,1),textured=new THREE.MeshStandardMaterial({map:texture}),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.5});
  const add=(geo,mat,x,name='')=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,x*.5,-x);m.rotation.set(x,.3,0);m.scale.set(1,1.4,1);m.name=name;m.castShadow=true;joint.add(m);return m;};
  const plain=[add(new THREE.BoxGeometry(1,1,1),red,0),add(new THREE.SphereGeometry(.5,8,6),green,1),add(new THREE.CylinderGeometry(.2,.2,1,8).toNonIndexed(),red,2),add(new THREE.BoxGeometry(1,1,1),red,3,'cosmetic')];
  const kept=add(new THREE.BoxGeometry(1,1,1),red,4,'keep-me'),solo=add(new THREE.BoxGeometry(1,1,1),shiny,5);
  add(new THREE.BoxGeometry(1,1,1),textured,6);add(new THREE.BoxGeometry(1,1,1),textured,7);add(new THREE.BoxGeometry(1,1,1),glass,8);add(new THREE.BoxGeometry(1,1,1),glass,9);
  const parent=add(new THREE.BoxGeometry(1,1,1),red,10);parent.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),green));
  root.updateMatrixWorld(true);const box0=new THREE.Box3().setFromObject(root),verts=g=>g.attributes.position.count,v0=plain.reduce((n,m)=>n+verts(m.geometry),0);
  mergeRigidParts(root,{keep:o=>o.name==='keep-me'});root.updateMatrixWorld(true);
  const box1=new THREE.Box3().setFromObject(root);
  for(const k of ['min','max'])for(const ax of ['x','y','z'])assert.ok(Math.abs(box0[k][ax]-box1[k][ax])<1e-5,`${k}.${ax}`);
  // Plain colours with the same roughness: one vertex-coloured mesh carrying each part's own (linear) colour.
  const vc=joint.children.filter(m=>m.material.vertexColors);
  assert.equal(vc.length,1);const g=vc[0].geometry;assert.equal(verts(g),v0);assert.equal(vc[0].castShadow,true);assert.equal(vc[0].material.roughness,.8);
  assert.ok(g.attributes.normal&&g.attributes.uv&&g.index&&g.attributes.color);
  const colors=new Set();for(let i=0;i<g.attributes.color.count;i++)colors.add([g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i)].map(v=>v.toFixed(3)).join());
  assert.deepEqual([...colors].sort(),[[red.color.r,red.color.g,red.color.b],[green.color.r,green.color.g,green.color.b]].map(c=>c.map(v=>v.toFixed(3)).join()).sort());
  assert.ok(joint.children.includes(kept)&&joint.children.includes(parent)&&joint.children.includes(solo));
  assert.equal(joint.children.filter(m=>m.material===textured).length,1,'同一贴图材质的零件合并为一个');
  assert.equal(joint.children.filter(m=>m.material===glass).length,2,'透明零件不合并');
});

test('球员合并后，动画关节、按名字查找的零件和拳套仍然可用',()=>{
  const w=buildWorld();const s=playing();
  for(const name of ['jersey-body','post-left','post-right'])assert.ok(w.scene.getObjectByName(name),name);
  w.update(s,0,false,1);w.update(s,0,false,2);
  assert.ok(w.hero.getObjectByName('glove-body'));assert.ok(w.gear.glove.visible);
});

test('渲染位置在两个模拟步之间按速度外推，瞬移时直接取当前位置',()=>{
  const w=buildWorld(),s=playing();
  stepGame(s,1/120,0);stepGame(s,1.5/120,.8);
  const a=s.accumulator*120,vx=s.ball.x-s.pose.bx,vz=s.ball.z-s.pose.bz;
  assert.ok(a>.4&&a<.6,`alpha ${a}`);assert.ok(Math.abs(vz)>1e-3);
  w.update(s,.8,false,1);
  assert.ok(Math.abs(w.ball.position.x-(s.ball.x+vx*a))<1e-9);assert.ok(Math.abs(w.ball.position.z+(s.ball.z+vz*a))<1e-9);
  assert.ok(Math.abs(w.hero.position.x-(s.player.x+(s.player.x-s.pose.px)*a))<1e-9);
  assert.ok(Math.abs(w.ball.position.y-ballHeight({ball:{...s.ball,z:s.ball.z+vz*a}}))<1e-9);
  // Teleport (serve / manual placement): no smear from the old position.
  s.ball.x=-2.5;s.ball.z=6;w.update(s,0,false,2);assert.equal(w.ball.position.x,-2.5);assert.equal(w.ball.position.z,-6);
  // Never drawn through the side wall.
  s.pose.bx=SIDE-.05;s.ball.x=SIDE-.01;s.pose.bz=s.ball.z;w.update(s,0,false,3);assert.ok(w.ball.position.x<=SIDE);
});

test('画质调节：持续掉帧才逐级降低，偶发卡顿和切后台不降，最低一档为止',()=>{
  const q=createQualityGovernor();
  for(let i=0;i<120;i++)q.sample(16.7);assert.equal(q.tier,0);
  q.sample(400);q.sample(250);for(let i=0;i<5;i++)q.sample(40);for(let i=0;i<60;i++)q.sample(16.7);assert.equal(q.tier,0,'偶发卡顿不降');
  let changed=0;for(let i=0;i<120;i++)if(q.sample(30))changed++;
  assert.equal(q.tier,1);assert.equal(changed,1);
  for(let i=0;i<600;i++)q.sample(40);assert.equal(q.tier,QUALITY_TIERS.length-1);
  assert.ok(QUALITY_TIERS.every((t,i)=>i===0||t.pixelRatio<=QUALITY_TIERS[i-1].pixelRatio));
});
