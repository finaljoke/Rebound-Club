import * as THREE from './vendor/three.module.min.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';

export const softBoxGeometry=(w,h,d,r=.06)=>new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.45,h*.45,d*.45));
// Bakes meshes (same parent) into one indexed geometry in the parent's space: position, normal, uv, and with
// withColor each part's own material colour (linear) as a vertex colour.
export function mergeMeshGeometry(meshes,withColor=false){
  const parts=meshes.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;});
  const total=parts.reduce((n,g)=>n+g.attributes.position.count,0),indexTotal=parts.reduce((n,g)=>n+(g.index?g.index.count:g.attributes.position.count),0);
  const position=new Float32Array(total*3),normal=new Float32Array(total*3),uv=new Float32Array(total*2),color=withColor?new Float32Array(total*3):null,index=new Uint32Array(indexTotal);
  let v=0,i=0;
  parts.forEach((g,p)=>{
    const n=g.attributes.position.count,P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv,c=meshes[p].material.color;
    for(let k=0;k<n;k++){const o=(v+k)*3;position[o]=P.getX(k);position[o+1]=P.getY(k);position[o+2]=P.getZ(k);normal[o]=N.getX(k);normal[o+1]=N.getY(k);normal[o+2]=N.getZ(k);uv[(v+k)*2]=U.getX(k);uv[(v+k)*2+1]=U.getY(k);if(color){color[o]=c.r;color[o+1]=c.g;color[o+2]=c.b;}}
    if(g.index)for(let k=0;k<g.index.count;k++)index[i++]=g.index.getX(k)+v;else for(let k=0;k<n;k++)index[i++]=v+k;
    v+=n;g.dispose();
  });
  const merged=new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.BufferAttribute(position,3));merged.setAttribute('normal',new THREE.BufferAttribute(normal,3));merged.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  if(color)merged.setAttribute('color',new THREE.BufferAttribute(color,3));
  merged.setIndex(new THREE.BufferAttribute(index,1));merged.computeBoundingSphere();merged.computeBoundingBox();
  return merged;
}
// Plain (untextured, opaque, non-emissive) standard materials differ only by colour, so parts using them share one
// vertex-coloured material per roughness/metalness; the cache lets both athletes and the scenery share it too.
// Matte roughness (0.6 and up: cloth, skin, wood, stone) is read as one 0.8 bucket; glossy parts keep their own value.
const matte=r=>r>=.6?.8:r;
const paintCache=new Map();
function plainKey(m){return m.isMeshStandardMaterial&&!m.isMeshPhysicalMaterial&&!m.map&&!m.bumpMap&&!m.normalMap&&!m.emissiveMap&&!m.roughnessMap&&!m.alphaMap&&!m.vertexColors&&!m.transparent&&m.opacity===1&&m.emissive.getHex()===0&&!m.flatShading?`${matte(m.roughness)}|${m.metalness}|${m.side}`:null;}
function paint(m){const key=plainKey(m);if(!paintCache.has(key))paintCache.set(key,new THREE.MeshStandardMaterial({vertexColors:true,roughness:matte(m.roughness),metalness:m.metalness,side:m.side}));return paintCache.get(key);}
// Draw-call budget: rigid leaf meshes under one parent become one mesh per shared material (or per plain-paint
// roughness); the merged mesh casts a shadow if any of its parts did. Parts that keep(o) protects (animated, re-materialed or looked up), transparent ones and meshes with
// children stay separate. By default every named part is protected.
export function mergeRigidParts(root,{keep=o=>!!o.name}={}){
  const nodes=[];root.traverse(n=>nodes.push(n));
  for(const node of nodes){
    const groups=new Map();
    for(const c of node.children){
      if(!c.isMesh||c.isInstancedMesh||c.isSkinnedMesh||c.children.length||keep(c)||Array.isArray(c.material)||c.material.transparent||!c.visible)continue;
      const plain=plainKey(c.material),key=`${plain===null?c.material.uuid:'paint|'+plain}|${c.renderOrder}`;
      if(!groups.has(key))groups.set(key,{plain:plain!==null,list:[]});groups.get(key).list.push(c);
    }
    for(const {plain,list} of groups.values()){
      if(list.length<2)continue;
      const m=new THREE.Mesh(mergeMeshGeometry(list,plain),plain?paint(list[0].material):list[0].material);m.castShadow=list.some(c=>c.castShadow);m.receiveShadow=list.some(c=>c.receiveShadow);m.renderOrder=list[0].renderOrder;
      for(const c of list){node.remove(c);c.geometry.dispose();}
      node.add(m);
    }
  }
  return root;
}
const mat=(color,roughness=.75)=>new THREE.MeshStandardMaterial({color,roughness});
function part(parent,geometry,material,x=0,y=0,z=0,cast=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}
function ellipsoid(parent,r,material,x,y,z,scale=[1,1,1],cast=true){const m=part(parent,new THREE.SphereGeometry(r,16,12),material,x,y,z,cast);m.scale.set(...scale);return m;}
function lines(parent,points,color){const m=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color}));parent.add(m);return m;}
function dataTexture(bytes,size){const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.flipY=true;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;}

// Small, deterministic local textures add material depth without downloaded assets.
export function makeSurfaceTexture(kind='turf'){
  const size=128,data=new Uint8Array(size*size*4);let seed=117;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=(seed>>>25)-64,thread=kind==='turf'?Math.sin((y+Math.sin(x*.7)*2)*1.8)*3:0;
    const value=Math.round(232+grain*.18+thread),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const t=dataTexture(data,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='turf'?7:5,kind==='turf'?1:5);return t;
}
export function buildGlove(color='#ed6941',side=1){
  const group=new THREE.Group(),details=new THREE.Group();group.add(details);
  const leather=mat(color,.38),cuff=mat('#fff0d6',.8),ink=mat('#ead9b5');
  const body=part(group,softBoxGeometry(.36,.39,.38,.145),leather,0,-.005,-.02);body.name='glove-body';
  ellipsoid(details,.095,leather,-side*.153,-.065,-.075,[.85,1.12,.95],false);
  part(details,softBoxGeometry(.31,.09,.29,.04),cuff,0,.17,.015,false);
  part(details,softBoxGeometry(.17,.055,.025,.012),leather,0,.17,-.14,false);
  const patch=part(details,new THREE.CircleGeometry(.044,16),ink,0,.015,-.213,false);patch.rotation.y=Math.PI;
  const seams=[];for(let i=-2;i<=2;i++){const x=i*.041;seams.push([x,-.105,-.197],[x+.009,-.084,-.203]);}
  lines(details,seams,'#f9e3c1');
  return {group,body,details,material:leather};
}

export function netGeometry(half,frontY,backY,frontZ,backZ){
  const points=[],line=(a,b)=>points.push(new THREE.Vector3(...a),new THREE.Vector3(...b));
  for(let x=-half;x<=half+.01;x+=.24){line([x,.02,backZ],[x,backY,backZ]);line([x,frontY,frontZ],[x,backY,backZ]);}
  for(let y=.02;y<=backY;y+=.18)line([-half,y,backZ],[half,y,backZ]);
  for(let t=0;t<=1.01;t+=.2){const y=frontY+(backY-frontY)*t,z=frontZ+(backZ-frontZ)*t;line([-half,y,z],[half,y,z]);for(const x of [-half,half])line([x,.02,z],[x,y,z]);}
  for(const x of [-half,half])for(let y=.02;y<=frontY;y+=.18){const t=y<=backY?1:(frontY-y)/(frontY-backY);line([x,y,frontZ],[x,y,frontZ+(backZ-frontZ)*t]);}
  return new THREE.BufferGeometry().setFromPoints(points);
}
