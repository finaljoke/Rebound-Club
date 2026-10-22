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
function decalTexture(kind,number='01',color='#284b3c'){
  const size=128,data=new Uint8Array(size*size*4),ink=new THREE.Color(color);const rgb=[Math.round(ink.r*255),Math.round(ink.g*255),Math.round(ink.b*255)];
  // Values are already sRGB bytes, rather than linear-space material values.
  const c=new THREE.Color(color).getHex();rgb[0]=(c>>16)&255;rgb[1]=(c>>8)&255;rgb[2]=c&255;
  const dot=(x,y,rx,ry,col=rgb)=>{for(let yy=Math.max(0,Math.floor(y-ry));yy<Math.min(size,y+ry);yy++)for(let xx=Math.max(0,Math.floor(x-rx));xx<Math.min(size,x+rx);xx++)if(((xx-x)/rx)**2+((yy-y)/ry)**2<=1){const i=(yy*size+xx)*4;data[i]=col[0];data[i+1]=col[1];data[i+2]=col[2];data[i+3]=255;}};
  if(kind==='face'){
    dot(40,55,5,8);dot(88,55,5,8);dot(38,52,1.7,2.2,[255,248,226]);dot(86,52,1.7,2.2,[255,248,226]);
    dot(40,36,10,2);dot(88,36,10,2);
    for(let x=50;x<79;x++)dot(x,84-((x-64)/14)**2*6,1.8,1.8);
  }else{
    const glyphs={'0':['01110','11011','11011','11011','11011','11011','01110'],'1':['00110','01110','00110','00110','00110','00110','01111']};
    const chars=number.split(''),cell=9,total=chars.length*6*cell-9,start=(size-total)/2;
    chars.forEach((ch,n)=>{const glyph=glyphs[ch]||glyphs['1'];glyph.forEach((row,y)=>row.split('').forEach((on,x)=>{if(on==='1')for(let yy=0;yy<cell;yy++)for(let xx=0;xx<cell;xx++){const i=((32+y*cell+yy)*size+Math.round(start+n*6*cell+x*cell+xx))*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;}}));});
  }
  return dataTexture(data,size);
}

export function buildAthlete({jersey='#f6e9ce',accent='#ed774b',number='01',goalie=false}={}){
  const group=new THREE.Group();group.scale.setScalar(1.16);
  const torso=new THREE.Group();group.add(torso);
  const skin=mat('#bd8b68',.85),cloth=mat(jersey,.82),trim=mat(accent,.72),dark=mat(goalie?'#243f52':'#25483c'),cream=mat('#fff1d8');
  const body=part(torso,new THREE.CylinderGeometry(.325,.275,.64,20),cloth,0,.99,0);body.name='jersey-body';
  const neck=part(torso,new THREE.CylinderGeometry(.115,.12,.13,12),skin,0,1.32,0);neck.name='neck';
  const collar=part(torso,new THREE.TorusGeometry(.123,.026,6,20),trim,0,1.3,0,false);collar.rotation.x=Math.PI/2;
  part(torso,softBoxGeometry(.64,.085,.44,.03),trim,0,1.19,0,false);
  const waist=part(group,softBoxGeometry(.57,.26,.4,.06),dark,0,.58,0);waist.name='shorts';
  part(group,softBoxGeometry(.57,.036,.41,.01),cream,0,.705,0,false);
  const head=ellipsoid(torso,.29,skin,0,1.56,-.012,[1,1.08,.97]);head.name='head';
  const hairMat=mat(goalie?'#3f352d':'#2d3e31',.92);
  ellipsoid(torso,.299,hairMat,0,1.695,.027,[1,.65,1]);
  const quiff=part(torso,softBoxGeometry(.41,.14,.25,.06),hairMat,-.055,1.77,-.13);quiff.rotation.z=-.16;quiff.name='hair-quiff';
  ellipsoid(torso,.075,skin,-.285,1.52,0,[.7,1,.7],false);ellipsoid(torso,.075,skin,.285,1.52,0,[.7,1,.7],false);
  const face=part(torso,new THREE.PlaneGeometry(.42,.32),new THREE.MeshBasicMaterial({map:decalTexture('face'),transparent:true,depthWrite:false}),0,1.53,-.297,false);face.rotation.y=Math.PI;face.name='face';
  ellipsoid(torso,.039,skin,0,1.49,-.307,[.8,.9,1.15],false);
  const ink=goalie?'#f8e9b7':'#2b5140';
  const numberPlate=part(torso,new THREE.PlaneGeometry(.35,.3),new THREE.MeshBasicMaterial({map:decalTexture('number',number,ink),transparent:true,depthWrite:false}),0,1.015,.318,false);numberPlate.name='jersey-number';
  const chest=part(torso,new THREE.CircleGeometry(.055,12),trim,-.12,1.095,-.3,false);chest.rotation.y=Math.PI;
  const seamPoints=[];for(const side of [-1,1]){seamPoints.push([side*.225,.74,.20],[side*.25,1.12,.20]);}
  lines(torso,seamPoints,goalie?'#82a9ba':'#d5cbb2');
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.18,.48,0);group.add(leg);legs.push(leg);
    part(leg,new THREE.CapsuleGeometry(.105,.19,4,10),skin,0,-.15,0);
    part(leg,new THREE.CylinderGeometry(.108,.105,.17,12),cream,0,-.245,0);
    part(leg,new THREE.CylinderGeometry(.11,.11,.03,12),trim,0,-.185,0,false);
    const sole=part(leg,softBoxGeometry(.25,.055,.41,.022),dark,0,-.412,-.06);sole.name='shoe-sole';
    const shoe=part(leg,softBoxGeometry(.24,.135,.36,.05),cream,0,-.335,-.08);shoe.name='shoe';
    part(leg,softBoxGeometry(.15,.065,.06,.018),trim,0,-.32,.07,false);
    lines(leg,[[-.065,-.263,-.1],[.065,-.263,-.1],[-.055,-.263,-.15],[.055,-.263,-.15]],'#b1b7a0');
    const arm=new THREE.Group();arm.position.set(side*.36,1.21,0);torso.add(arm);arms.push(arm);
    const sleeve=ellipsoid(arm,.135,cloth,0,-.045,0,[1,1.08,1]);sleeve.name='shoulder-sleeve';
    part(arm,new THREE.CapsuleGeometry(.098,.2,4,10),skin,side*.025,-.245,0);
    part(arm,new THREE.CylinderGeometry(.115,.115,.055,12),trim,0,-.12,0,false);
    part(arm,new THREE.CylinderGeometry(.108,.108,.07,12),cream,side*.02,-.365,0,false);
  }
  return {group,torso,legs,arms,skin};
}

export function buildGlove(color='#ed6941',side=1){
  const group=new THREE.Group(),details=new THREE.Group();group.add(details);
  const leather=mat(color,.42),cuff=mat('#fff0d6',.8),ink=mat('#ead9b5');
  const body=part(group,softBoxGeometry(.34,.37,.35,.12),leather,0,-.005,-.018);body.name='glove-body';
  ellipsoid(details,.09,leather,-side*.145,-.07,-.075,[.85,1.15,.95],false);
  part(details,new THREE.CylinderGeometry(.145,.145,.09,14),cuff,0,.18,.015,false);
  const patch=part(details,new THREE.CircleGeometry(.047,12),ink,0,-.005,-.197,false);patch.rotation.y=Math.PI;
  const seams=[];for(let i=-2;i<=2;i++){const x=i*.046;seams.push([x,-.13,-.173],[x+.012,-.105,-.181]);}
  lines(details,seams,'#f9caa5');
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
