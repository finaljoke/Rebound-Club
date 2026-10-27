// Spike (throwaway): skinned placeholder characters with toon shading, ink outline, blended locomotion,
// one-shot clips and procedural layers (look-at, lean, squash) on top of the authored animation.
import * as THREE from 'three';
import {GLTFLoader} from '../vendor/loaders/GLTFLoader.js';

const loader=new GLTFLoader();
const toonRamp=(()=>{const t=new THREE.DataTexture(new Uint8Array([110,190,255]),3,1,THREE.RedFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;})();

function rgb2hsl(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx===mn)return [0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);
  const h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;return [h*60,s,l];}
// Palette swaps on the shared colour atlas: rule(h,s,l) returns a new [h,s,l] or nothing.
function recolor(tex,rule){
  const img=tex.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height),px=d.data,col=new THREE.Color();
  for(let i=0;i<px.length;i+=4){const [h,s,l]=rgb2hsl(px[i]/255,px[i+1]/255,px[i+2]/255),o=rule(h,s,l);if(!o)continue;
    col.setHSL(((o[0]%360)+360)%360/360,Math.min(1,o[1]),Math.min(1,o[2]));px[i]=col.r*255;px[i+1]=col.g*255;px[i+2]=col.b*255;}
  g.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);
  Object.assign(t,{flipY:tex.flipY,colorSpace:THREE.SRGBColorSpace,wrapS:tex.wrapS,wrapT:tex.wrapT,magFilter:tex.magFilter,minFilter:tex.minFilter});return t;
}

export function toonMaterial(opts,rim){
  const m=new THREE.MeshToonMaterial({gradientMap:toonRamp,...opts});
  m.onBeforeCompile=s=>{s.uniforms.uRim={value:new THREE.Color(rim)};
    s.fragmentShader='uniform vec3 uRim;\n'+s.fragmentShader.replace('#include <opaque_fragment>',
      'float rimF=pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),3.);outgoingLight+=uRim*rimF*.45;\n#include <opaque_fragment>');};
  return m;
}

// Inverted-hull outline. Hard-edged low-poly parts need averaged normals or the hull splits at corners.
function smoothNormals(geo){
  if(geo.attributes.outlineNormal)return;
  const p=geo.attributes.position,n=geo.attributes.normal,acc=new Map(),keys=[];
  for(let i=0;i<p.count;i++){const k=`${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;keys.push(k);
    const a=acc.get(k)||[0,0,0];a[0]+=n.getX(i);a[1]+=n.getY(i);a[2]+=n.getZ(i);acc.set(k,a);}
  const out=new Float32Array(p.count*3);keys.forEach((k,i)=>{const a=acc.get(k),l=Math.hypot(...a)||1;out.set([a[0]/l,a[1]/l,a[2]/l],i*3);});
  geo.setAttribute('outlineNormal',new THREE.BufferAttribute(out,3));
}
export function outlineMaterial(width,color=0x0d1022){
  const m=new THREE.MeshBasicMaterial({color,side:THREE.BackSide});
  m.onBeforeCompile=s=>{s.uniforms.uW={value:width};
    s.vertexShader='uniform float uW;\nattribute vec3 outlineNormal;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normalize(outlineNormal)*uW;');};
  return m;
}
export function addOutline(mesh,mat){
  smoothNormals(mesh.geometry);
  const o=mesh.isSkinnedMesh?new THREE.SkinnedMesh(mesh.geometry,mat):new THREE.Mesh(mesh.geometry,mat);
  if(mesh.isSkinnedMesh)o.bind(mesh.skeleton,mesh.bindMatrix);
  o.position.copy(mesh.position);o.quaternion.copy(mesh.quaternion);o.scale.copy(mesh.scale);o.frustumCulled=false;mesh.parent.add(o);return o;
}

const v1=new THREE.Vector3(),v2=new THREE.Vector3(),q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),q3=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);

export class Actor{
  // facing: +1 looks toward +z (keeper), -1 toward -z (striker).
  static async load(url,{facing=1,height=2,rule=null,rim=0x5f8cff,outline=.024,glove=null,number=null,keep=()=>false}={}){
    const gltf=await loader.loadAsync(url);return new Actor(gltf,{facing,height,rule,rim,outline,glove,number,keep});
  }
  constructor(gltf,{facing,height,rule,rim,outline,glove,number,keep}){
    this.model=gltf.scene;this.clips=new Map(gltf.animations.map(c=>[c.name,c]));this.bones={};const skinned=[];
    this.model.traverse(o=>{if(o.isBone)this.bones[o.name]=o;else if(o.isMesh){if(o.isSkinnedMesh)skinned.push(o);else if(!keep(o.name))o.visible=false;}});
    const top=Math.max(...skinned.map(m=>(m.geometry.computeBoundingBox(),m.geometry.boundingBox.max.y)));
    this.scale=height/top;this.model.scale.setScalar(this.scale);
    const head=skinned.find(m=>/head/i.test(m.name)),hb=head?.geometry.boundingBox;
    this.headR=hb?Math.max(hb.max.x-hb.min.x,hb.max.z-hb.min.z)/2*this.scale:.45;this.handR=glove?glove.size*1.1:.1;
    let map=skinned[0].material.map;if(rule)map=recolor(map,rule);
    const mat=toonMaterial({map},rim),ink=outlineMaterial(outline/this.scale);
    for(const m of skinned){m.material=mat;m.castShadow=true;m.frustumCulled=false;addOutline(m,ink);}
    if(glove)for(const side of ['l','r']){const hand=this.bones['hand'+side],r=glove.size/this.scale;
      const g=new THREE.Mesh(new THREE.SphereGeometry(r,18,14),toonMaterial({color:glove.color},rim));g.scale.set(1,1.12,1.05);g.position.set(0,r*.55,0);g.castShadow=true;
      const cuff=new THREE.Mesh(new THREE.CylinderGeometry(r*.62,r*.7,r*.55,16),toonMaterial({color:glove.cuff},rim));cuff.position.y=-r*.75;g.add(cuff);
      hand.add(g);addOutline(g,ink);addOutline(cuff,ink);}
    // Back number, placed in the bind pose and then parented to the chest so it follows the torso.
    if(number){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
      g.font='italic 900 92px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=14;g.strokeStyle='#0d1022';g.strokeText(number,64,70);g.fillStyle='#fff7ea';g.fillText(number,64,70);
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
      const body=skinned.find(m=>/body/i.test(m.geometry.name+m.name))||skinned[0],bb=body.geometry.boundingBox;
      const tag=new THREE.Mesh(new THREE.PlaneGeometry(.44,.44),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}));
      tag.position.set(0,(bb.min.y+bb.max.y)*.5,bb.min.z-.01);tag.rotation.y=Math.PI;this.model.add(tag);this.model.updateMatrixWorld(true);this.bones.chest.attach(tag);}
    this.root=new THREE.Group();this.root.rotation.y=facing>0?0:Math.PI;this.facing=facing;
    this.pivot=new THREE.Group();this.root.add(this.pivot);this.pivot.add(this.model);
    this.mixer=new THREE.AnimationMixer(this.model);
    this.hipH=this.bones.hips.getWorldPosition(v1).y;this.pivot.position.y=this.hipH;this.model.position.y=-this.hipH;
    this.vx=0;this.lean=0;this.sq=0;this.sqV=0;this.roll=0;this.lift=0;this.look=null;this.shot=null;this.loco=null;this.maxSpeed=5;
  }
  action(name){return this.mixer.clipAction(this.clips.get(name));}
  // Finds when a hand is furthest forward in a clip: the contact (or release) frame, measured, not guessed.
  measureReach(name){
    this.mixer.stopAllAction();const a=this.action(name);a.reset().play();let best={z:-1e9};
    const dur=this.clips.get(name).duration;
    for(let t=0;t<=dur;t+=1/120){this.mixer.setTime(t);this.root.updateMatrixWorld(true);
      for(const side of ['l','r']){this.bones['hand'+side].getWorldPosition(v1);this.root.worldToLocal(v1);if(v1.z>best.z)best={t,side,x:v1.x,y:v1.y,z:v1.z};}}
    a.stop();this.mixer.setTime(0);return best;
  }
  setLoco(idle,left,right){
    this.loco={idle:this.action(idle),left:this.action(left),right:this.action(right)};
    for(const a of Object.values(this.loco)){a.reset().play();a.setEffectiveWeight(0);}
  }
  // One-shot clip layered over locomotion; from/end trim the clip, hold keeps the last pose.
  play(name,{speed=1,from=0,end=null,fadeIn=.08,fadeOut=.18,hold=false,onEnd=null}={}){
    if(this.shot&&this.shot.action!==this.action(name))this.shot.action.stop();
    const a=this.action(name);a.reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.time=from;a.timeScale=speed;a.play();
    const stop=end??this.clips.get(name).duration;
    this.shot={name,action:a,e:0,len:(stop-from)/speed,fadeIn,fadeOut,hold,onEnd};return a;
  }
  release(fadeOut=.2){if(this.shot){this.shot.hold=false;this.shot.len=this.shot.e+fadeOut;this.shot.fadeOut=fadeOut;}}
  squash(k){this.sqV-=k;}
  update(dt){
    let w=0;const s=this.shot;
    if(s){s.e+=dt;w=Math.min(1,s.e/s.fadeIn);
      if(!s.hold){if(s.e>s.len-s.fadeOut)w=Math.min(w,Math.max(0,(s.len-s.e)/s.fadeOut));
        if(s.e>=s.len){s.action.stop();this.shot=null;w=0;s.onEnd?.();}}
      if(this.shot)s.action.setEffectiveWeight(w);}
    if(this.loco){const local=this.vx*this.facing,m=Math.min(1,Math.abs(local)/this.maxSpeed);
      this.loco.idle.setEffectiveWeight((1-w)*(1-m));this.loco.left.setEffectiveWeight((1-w)*m*(local>0?1:0));this.loco.right.setEffectiveWeight((1-w)*m*(local<0?1:0));
      this.loco.left.timeScale=this.loco.right.timeScale=.7+m*.7;}
    // Some clips have no key on chest/head, so the mixer would leave last frame's look-at in place and it
    // would accumulate; restore the pure clip pose first.
    const turned=[this.bones.chest,this.bones.head];
    if(this.pose)turned.forEach((b,i)=>b.quaternion.copy(this.pose[i]));
    this.mixer.update(dt);
    this.pose=turned.map((b,i)=>(this.pose?.[i]||new THREE.Quaternion()).copy(b.quaternion));
    // Procedural layers on top of the clip pose.
    const local=this.vx*this.facing;this.lean+=(-local/this.maxSpeed*.16-this.lean)*Math.min(1,dt*10);
    this.sqV+=(-this.sq*260-this.sqV*16)*dt;this.sq+=this.sqV*dt;
    this.pivot.rotation.set(0,0,this.lean+this.roll);this.pivot.position.y=this.hipH+this.lift;
    this.pivot.scale.set(1+this.sq*.5,1-this.sq,1+this.sq*.5);
    if(this.look){this.root.updateMatrixWorld(true);this.turnToward(this.bones.chest,.25);this.turnToward(this.bones.head,.55);}
    this.keepAboveGround();
  }
  // Big chibi heads and gloves reach below the floor when the body is rolled onto its side; lift the whole
  // body by the deepest point instead of trusting a fixed lying height.
  keepAboveGround(){
    this.root.updateMatrixWorld(true);let low=Infinity;
    low=Math.min(low,this.bones.head.getWorldPosition(v1).y-this.headR*.85);
    for(const s of ['l','r'])low=Math.min(low,this.bones['hand'+s].getWorldPosition(v1).y-this.handR);
    low=Math.min(low,this.bones.hips.getWorldPosition(v1).y-.18);
    if(low<0){this.pivot.position.y-=low;this.root.updateMatrixWorld(true);}
  }
  // Rotates a bone about world-up toward the look target, by a fraction of the remaining yaw.
  turnToward(bone,amount){
    bone.getWorldPosition(v1);v2.copy(this.look).sub(v1);v2.y=0;if(v2.lengthSq()<1e-4)return;
    const fwd=v1.set(0,0,1).applyQuaternion(this.root.quaternion);let yaw=Math.atan2(fwd.x*v2.z-fwd.z*v2.x,fwd.x*v2.x+fwd.z*v2.z)*-1;
    yaw=THREE.MathUtils.clamp(yaw,-1.1,1.1)*amount;
    bone.parent.getWorldQuaternion(q1);q2.copy(q1).multiply(bone.quaternion);q3.setFromAxisAngle(up,yaw).multiply(q2);
    bone.quaternion.copy(q1.invert().multiply(q3));bone.updateMatrixWorld(true);
  }
  hand(side,out){return this.bones['hand'+side].getWorldPosition(out);}
}
