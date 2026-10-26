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
    // Printed toy features: clear at match scale, with a small eye glint in close-up.
    dot(39,55,6.5,8.5);dot(89,55,6.5,8.5);dot(37,52,2,2.6,[255,248,226]);dot(87,52,2,2.6,[255,248,226]);
    for(let x=29;x<=49;x++)dot(x,35+(x-29)*.16,1.5,1.8);
    for(let x=79;x<=99;x++)dot(x,38-(x-79)*.16,1.5,1.8);
    for(let x=52;x<78;x++)dot(x,83-((x-64)/14)**2*5,1.7,1.7);
  }else{
    // Smooth athletic numerals, rasterised locally with 2x2 coverage instead of block glyphs.
    const chars=number.slice(0,2).split(''),start=(size-(chars.length*43-9))/2;
    const rounded=(x,y,w,h,r)=>Math.hypot(Math.max(Math.abs(x-w/2)-(w/2-r),0),Math.max(Math.abs(y-h/2)-(h/2-r),0))<=r&&x>=0&&x<=w&&y>=0&&y<=h;
    const inside=(ch,x,y)=>ch==='0'?rounded(x,y,34,64,10)&&!rounded(x-10,y-10,14,44,4):((x>=17&&x<=28&&y>=0&&y<=64)||(x>=6&&x<=28&&y>=0&&y<=17&&y>=17-(x-6)*.78)||(x>=8&&x<=34&&y>=54&&y<=64));
    for(let y=29;y<95;y++)for(let x=0;x<size;x++){
      let coverage=0;for(const sy of [.25,.75])for(const sx of [.25,.75])if(chars.some((ch,n)=>inside(ch,x+sx-start-n*43,y+sy-30)))coverage++;
      if(coverage){const i=(y*size+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=Math.round(coverage/4*255);}
    }
  }
  return dataTexture(data,size);
}

// Slightly squared cheeks and a tapered jaw retain a soft, moulded-toy silhouette.
const softPower=(v,p=.9)=>Math.sign(v)*Math.abs(v)**p;
function headShape(){
  const g=new THREE.SphereGeometry(1,28,20),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);p.setXYZ(i,softPower(p.getX(i))*.33*(1-.1*Math.max(-y,0)),softPower(y)*.31,softPower(p.getZ(i))*.295);}
  g.computeVertexNormals();return g;
}
function headBandShape(){
  const g=new THREE.CylinderGeometry(1,1,.075,40,1,true),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),qy=softPower((y+.125)/.31,1/.9),r=Math.sqrt(1-qy*qy);p.setXYZ(i,softPower(p.getX(i)*r)*.342,y,softPower(p.getZ(i)*r)*.306);}
  g.computeVertexNormals();return g;
}
function faceShape(){
  const g=new THREE.PlaneGeometry(.45,.33,12,10);g.rotateY(Math.PI);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),qy=softPower((y-.04)/.31,1/.9),qx=softPower(p.getX(i)/(.33*(1-.1*Math.max(-qy,0))),1/.9);p.setZ(i,softPower(-Math.sqrt(Math.max(.01,1-qx*qx-qy*qy)))*.295-.004);}
  g.computeVertexNormals();return g;
}

export function buildAthlete({jersey='#f6e9ce',accent='#ed774b',number='01',goalie=false}={}){
  const group=new THREE.Group();group.scale.setScalar(1.16);
  const torso=new THREE.Group();group.add(torso);
  const skin=mat('#bd8b68',.85),cloth=mat(jersey,.82),trim=mat(accent,.72),dark=mat(goalie?'#243f52':'#25483c'),cream=mat('#fff1d8');
  const jerseyShape=softBoxGeometry(.67,.65,.46,.15),p=jerseyShape.attributes.position;
  for(let i=0;i<p.count;i++){const t=THREE.MathUtils.clamp((p.getY(i)+.325)/.65,0,1);p.setX(i,p.getX(i)*(.86+.14*t));p.setZ(i,p.getZ(i)*(.94+.06*t));}
  jerseyShape.computeVertexNormals();
  const body=part(torso,jerseyShape,cloth,0,.99,0);body.name='jersey-body';
  const neck=part(torso,new THREE.CylinderGeometry(.115,.12,.13,12),skin,0,1.32,0);neck.name='neck';
  const collar=part(torso,new THREE.TorusGeometry(.123,.026,6,20),trim,0,1.3,0,false);collar.rotation.x=Math.PI/2;
  for(const z of [-.231,.231])part(torso,softBoxGeometry(.40,.055,.012,.005),trim,0,1.13,z,false);
  for(const side of [-1,1])part(torso,softBoxGeometry(.035,.35,.30,.014),trim,side*.293,.89,0,false);
  const waist=part(group,softBoxGeometry(.59,.26,.42,.075),dark,0,.58,0);waist.name='shorts';
  part(group,softBoxGeometry(.58,.035,.425,.015),cream,0,.705,0,false);
  const head=part(torso,headShape(),skin,0,1.565,-.012);head.name='head';
  const hairMat=mat(goalie?'#3f352d':'#2d3e31',.92);
  ellipsoid(torso,.335,hairMat,0,1.745,.01,[1.02,.55,.93]);
  const quiff=ellipsoid(torso,.21,hairMat,-.055,1.855,-.13,[1.45,.43,.85]);quiff.rotation.z=-.12;quiff.name='hair-quiff';
  const swept=ellipsoid(torso,.15,hairMat,.19,1.83,-.12,[.9,.45,1]);swept.rotation.z=.2;
  part(torso,headBandShape(),goalie?cream:trim,0,1.69,-.012,false);
  for(const side of [-1,1])ellipsoid(torso,.075,skin,side*.329,1.54,-.005,[.65,.95,.6],false);
  const face=part(torso,faceShape(),new THREE.MeshBasicMaterial({map:decalTexture('face'),transparent:true,depthWrite:false}),0,1.525,-.012,false);face.name='face';
  ellipsoid(torso,.038,skin,0,1.485,-.323,[.9,.85,.85],false);
  const ink=goalie?'#f8e9b7':'#2b5140';
  const numberPlate=part(torso,new THREE.PlaneGeometry(.40,.37),new THREE.MeshBasicMaterial({map:decalTexture('number',number,ink),transparent:true,depthWrite:false}),0,.965,.229,false);numberPlate.name='jersey-number';
  const chest=part(torso,new THREE.CircleGeometry(.055,16),trim,-.13,1.06,-.232,false);chest.rotation.y=Math.PI;
  const crest=part(torso,new THREE.CircleGeometry(.028,12),cream,-.13,1.06,-.233,false);crest.rotation.y=Math.PI;
  const seamPoints=[];for(const side of [-1,1]){seamPoints.push([side*.25,.76,.22],[side*.26,1.08,.23]);}
  lines(torso,seamPoints,goalie?'#82a9ba':'#d5cbb2');
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.18,.48,0);group.add(leg);legs.push(leg);
    part(leg,new THREE.CapsuleGeometry(.105,.19,4,10),skin,0,-.15,0);
    part(leg,new THREE.CylinderGeometry(.108,.105,.17,12),cream,0,-.245,0);
    part(leg,new THREE.CylinderGeometry(.11,.11,.03,12),trim,0,-.185,0,false);
    const sole=part(leg,softBoxGeometry(.28,.07,.43,.03),dark,0,-.408,-.06);sole.name='shoe-sole';
    part(leg,softBoxGeometry(.276,.028,.42,.013),cream,0,-.376,-.06,false);
    const shoe=part(leg,softBoxGeometry(.26,.15,.38,.065),cream,0,-.32,-.07);shoe.name='shoe';
    part(leg,softBoxGeometry(.16,.075,.055,.023),trim,0,-.28,.105,false);
    const tongue=part(leg,softBoxGeometry(.135,.045,.16,.02),trim,0,-.245,-.09,false);tongue.rotation.x=-.25;
    for(const side of [-1,1]){const stripe=part(leg,softBoxGeometry(.012,.045,.14,.005),trim,side*.13,-.32,-.08,false);stripe.rotation.x=-.3;}
    lines(leg,[[-.05,-.215,-.06],[.05,-.215,-.06],[-.05,-.225,-.10],[.05,-.225,-.10],[-.045,-.235,-.14],[.045,-.235,-.14]],'#fff7df');
    const arm=new THREE.Group();arm.position.set(side*.36,1.21,0);torso.add(arm);arms.push(arm);
    const sleeve=part(arm,softBoxGeometry(.255,.24,.31,.095),cloth,0,-.045,0);sleeve.name='shoulder-sleeve';
    part(arm,new THREE.CapsuleGeometry(.098,.2,4,10),skin,side*.025,-.245,0);
    part(arm,softBoxGeometry(.25,.045,.29,.02),trim,0,-.14,0,false);
    part(arm,new THREE.CylinderGeometry(.108,.108,.07,12),cream,side*.02,-.365,0,false);
  }
  return {group,torso,legs,arms,skin};
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
