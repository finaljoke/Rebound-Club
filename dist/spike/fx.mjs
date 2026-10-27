// Spike (throwaway): hit flash, shock ring, sparks, confetti and the ball's ribbon trail.
import * as THREE from 'three';
import {glowTexture} from './arena.mjs';

const CONFETTI=['#ff6a2b','#ffd23a','#1ec8b4','#3a7bff','#ffffff','#ff4f7b'];

export function createFx(scene,camera){
  const glow=glowTexture('rgba(255,255,255,1)','rgba(255,220,150,.55)');
  const live=[];
  const sprite=(color,size,life,pos,grow=2.2)=>{
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
    s.position.copy(pos);s.scale.setScalar(size*.3);s.renderOrder=10;scene.add(s);
    live.push({o:s,t:0,life,update(u){s.scale.setScalar(size*(.3+grow*Math.sqrt(u)));s.material.opacity=1-u;}});
  };
  const ringGeo=new THREE.RingGeometry(.82,1,40);
  const ring=(pos,color,size,life=.32)=>{
    const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    m.position.copy(pos);m.quaternion.copy(camera.quaternion);m.renderOrder=11;scene.add(m);
    live.push({o:m,t:0,life,update(u){m.scale.setScalar(.15+size*(1-(1-u)**3));m.material.opacity=(1-u)*.9;}});
  };
  // Sparks: short streaks thrown along the hit direction.
  const sparkGeo=new THREE.BoxGeometry(.035,.035,.32);
  const sparks=(pos,dir,color,n=14,speed=7)=>{
    for(let i=0;i<n;i++){
      const m=new THREE.Mesh(sparkGeo,new THREE.MeshBasicMaterial({color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
      const v=dir.clone().normalize().multiplyScalar(speed*(.4+Math.random()*.8)).add(new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5));
      m.position.copy(pos);scene.add(m);const look=new THREE.Vector3();
      live.push({o:m,t:0,life:.28+Math.random()*.22,update(u,dt){v.y-=14*dt;m.position.addScaledVector(v,dt);m.lookAt(look.copy(m.position).add(v));m.material.opacity=1-u;m.scale.z=1+v.length()*.05;}});
    }
  };
  // Confetti: instanced paper bits with flutter.
  const N=220,confGeo=new THREE.PlaneGeometry(.09,.14);
  const conf=new THREE.InstancedMesh(confGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),N);conf.frustumCulled=false;conf.count=0;scene.add(conf);
  const bits=[],c=new THREE.Color(),mm=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),one=new THREE.Vector3(1,1,1);
  const confetti=(pos,count=160)=>{
    bits.length=0;for(let i=0;i<Math.min(N,count);i++){bits.push({p:pos.clone().add(new THREE.Vector3((Math.random()-.5)*3,Math.random()*.5,(Math.random()-.5)*.6)),
      v:new THREE.Vector3((Math.random()-.5)*6,5+Math.random()*6,2+Math.random()*4),r:new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6),w:new THREE.Vector3((Math.random()-.5)*14,(Math.random()-.5)*14,(Math.random()-.5)*14),life:2.4+Math.random()});
      conf.setColorAt(i,c.set(CONFETTI[i%CONFETTI.length]));}
    conf.count=bits.length;conf.instanceColor.needsUpdate=true;
  };
  const updateConfetti=dt=>{if(!conf.count)return;let alive=0;
    bits.forEach((b,i)=>{b.life-=dt;b.v.y-=7*dt;b.v.multiplyScalar(1-2.2*dt);b.v.y=Math.max(b.v.y,-1.6);b.p.addScaledVector(b.v,dt);b.r.addScaledVector(b.w,dt);
      if(b.p.y<.02){b.p.y=.02;b.v.set(0,0,0);b.w.set(0,0,0);}
      if(b.life>0)alive++;mm.compose(b.p,q.setFromEuler(e.set(b.r.x,b.r.y,b.r.z)),one.setScalar(b.life>0?Math.min(1,b.life*2):0));conf.setMatrixAt(i,mm);});
    conf.instanceMatrix.needsUpdate=true;if(!alive)conf.count=0;};

  // Ribbon trail behind the ball: a camera-facing strip through recent positions.
  const TN=22,trailPos=new Float32Array(TN*2*3),trailCol=new Float32Array(TN*2*4),hist=[];
  const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(trailPos,3));tg.setAttribute('color',new THREE.BufferAttribute(trailCol,4));
  const idx=[];for(let i=0;i<TN-1;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}tg.setIndex(idx);
  const trail=new THREE.Mesh(tg,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  trail.frustumCulled=false;trail.renderOrder=5;scene.add(trail);
  const trailColor=new THREE.Color(),tmp=new THREE.Vector3(),side=new THREE.Vector3(),toCam=new THREE.Vector3();
  let trailWidth=.16,trailHeat=0;
  const updateTrail=(ballPos,active)=>{
    if(active)hist.unshift(ballPos.clone());else hist.pop();if(hist.length>TN)hist.length=TN;
    for(let i=0;i<TN;i++){const p=hist[Math.min(i,hist.length-1)]||ballPos,n=hist[Math.min(i+1,hist.length-1)]||p;
      tmp.subVectors(p,n);toCam.subVectors(camera.position,p);side.crossVectors(tmp,toCam).normalize();
      const f=1-i/(TN-1),w=trailWidth*f*(i<hist.length?1:0);
      trailPos.set([p.x+side.x*w,p.y+side.y*w,p.z+side.z*w,p.x-side.x*w,p.y-side.y*w,p.z-side.z*w],i*6);
      trailColor.setHSL(.09-.06*trailHeat*(1-f),1,.55+.3*f);const a=f*f*(i<hist.length?1:0);
      trailCol.set([trailColor.r,trailColor.g,trailColor.b,a,trailColor.r,trailColor.g,trailColor.b,a],i*8);}
    tg.attributes.position.needsUpdate=tg.attributes.color.needsUpdate=true;
  };

  return {
    hit(pos,dir,strong){sprite(strong?0xffe7a8:0xffffff,strong?1.5:1,.16,pos);ring(pos,strong?0xffb02e:0xffffff,strong?2.2:1.4);sparks(pos,dir,strong?0xffc04a:0xfff3d6,strong?20:12,strong?9:6);},
    save(pos){sprite(0xbfe6ff,1.1,.2,pos,1.5);ring(pos,0x7fd0ff,1.4,.3);},
    goal(pos){sprite(0xfff0c0,3,.45,pos,1.8);ring(pos,0xffd23a,3.2,.6);confetti(pos);},
    trail:{set(width,heat){trailWidth=width;trailHeat=heat;},reset(){hist.length=0;}},
    update(dt,ballPos,trailOn){
      for(let i=live.length-1;i>=0;i--){const f=live[i];f.t+=dt;const u=Math.min(1,f.t/f.life);f.update(u,dt);if(u>=1){scene.remove(f.o);f.o.material.dispose();live.splice(i,1);}}
      updateConfetti(dt);updateTrail(ballPos,trailOn);
    },
  };
}
