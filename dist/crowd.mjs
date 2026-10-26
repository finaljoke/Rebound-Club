import * as THREE from './vendor/three.module.min.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {mergeMeshGeometry} from './art.mjs';

// Small background figures use low-segment rounded parts, merged once per batch.
// All models face +z, towards the court. No textures or shadow passes are needed.
const round=(w,h,d,r=.035)=>new RoundedBoxGeometry(w,h,d,1,Math.min(r,w*.45,h*.45,d*.45));
const ball=(r=.1)=>new THREE.SphereGeometry(r,10,7);
const smallBall=r=>new THREE.SphereGeometry(r,6,4);
const block=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
function combined(parts,colored=false){
  const meshes=parts.map(([geometry,color,x=0,y=0,z=0,scale=null])=>{
    const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color}));m.position.set(x,y,z);if(scale)m.scale.set(...scale);return m;
  });
  const g=mergeMeshGeometry(meshes,colored);
  for(const m of meshes){m.geometry.dispose();m.material.dispose();}
  return g;
}
function bodyGeometry(){
  const parts=[
    [round(.32,.34,.23,.075),'#ffffff',0,.45,0],
    [block(.23,.11,.22),'#414a43',0,.245,.025],
    [block(.22,.035,.018),'#e5d8bb',0,.54,.121],
    [block(.07,.045,.014),'#e5d8bb',-.08,.43,.122]
  ];
  for(const side of [-1,1])parts.push(
    [block(.10,.105,.22),'#414a43',side*.085,.23,.10],
    [block(.085,.17,.09),'#465048',side*.095,.12,.18],
    [block(.12,.07,.18),'#e8ddc6',side*.095,.035,.22]
  );
  return combined(parts,true);
}
function headGeometry(){
  return combined([
    [ball(.165),'#fff',0,.76,0,[1,1.03,.93]],
    [smallBall(.038),'#fff',-.163,.755,0,[.8,1,.8]],[smallBall(.038),'#fff',.163,.755,0,[.8,1,.8]],
    [smallBall(.024),'#fff',0,.742,.152,[.8,.9,1]]
  ]);
}
function faceGeometry(){
  return combined([
    [new THREE.CircleGeometry(.014,8),'#fff',-.059,.778,.146],
    [new THREE.CircleGeometry(.014,8),'#fff',.059,.778,.146],
    [block(.045,.008,.008),'#fff',0,.712,.151]
  ]);
}
function hairGeometry(kind){
  const cap=new THREE.SphereGeometry(.174,12,7,0,Math.PI*2,0,1.2);
  if(kind===0)return combined([[cap,'#fff',0,.76,0],[round(.21,.075,.16,.033),'#fff',-.025,.91,.055]]);
  if(kind===1)return combined([[cap,'#fff',0,.76,0],[new THREE.SphereGeometry(.178,12,8,Math.PI*.75,Math.PI*1.5,1.05,Math.PI*.68-1.05),'#fff',0,.755,-.009,[1,1.08,1]]]);
  return combined([[cap,'#fff',0,.773,0],[block(.28,.025,.17),'#fff',0,.84,.13]]);
}

export function buildSpectatorCrowd(seats){
  const group=new THREE.Group();group.name='spectators';
  const plain=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85});
  const cloth=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,vertexColors:true});
  const ink=new THREE.MeshStandardMaterial({color:'#273c32',roughness:.9});
  const batches=[];
  function batch(name,geometry,count,material=plain){
    const m=new THREE.InstancedMesh(geometry,material,count);m.name=name;m.castShadow=false;m.receiveShadow=false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(m);batches.push(m);return m;
  }
  const styles=seats.map((seat,i)=>({kind:i%3,index:0,scale:.94+.10*(.5+.5*Math.sin(seat.phase)),yaw:-Math.atan2(seat.x,8)*.22+(i%3-1)*.05}));
  const counts=[0,0,0];for(const style of styles)style.index=counts[style.kind]++;
  const body=batch('spectator-bodies',bodyGeometry(),seats.length,cloth);
  const heads=batch('spectator-heads',headGeometry(),seats.length);
  const faces=batch('spectator-faces',faceGeometry(),seats.length,ink);
  const hair=counts.map((count,kind)=>batch('spectator-hair-'+kind,hairGeometry(kind),count));
  const arms=batch('spectator-arms',new THREE.CapsuleGeometry(.06,.08,2,6).translate(0,-.06,0),seats.length*2);
  const hands=batch('spectator-hands',combined([[new THREE.CylinderGeometry(.043,.038,.12,6),'#fff',0,.075,0],[smallBall(.055),'#fff',0,0,0,[.8,1,.8]]]),seats.length*2);
  const shirts=['#658b9a','#ce8669','#ded6ba','#aaac74','#7d9982','#ad8076'];
  const skins=['#bd8b68','#93674d','#d9b391','#b78560'];
  const hairs=['#3d392e','#514236','#72604a','#38463a'],tint=new THREE.Color();
  seats.forEach((seat,i)=>{
    const shirt=shirts[(i*3+Math.floor(i/7))%shirts.length],skin=skins[(i*7)%skins.length],style=styles[i];
    body.setColorAt(i,tint.set(shirt));heads.setColorAt(i,tint.set(skin));
    hair[style.kind].setColorAt(style.index,tint.set(style.kind===2?shirts[(i+2)%shirts.length]:hairs[i%hairs.length]));
    for(let side=0;side<2;side++){arms.setColorAt(i*2+side,tint.set(shirt));hands.setColorAt(i*2+side,tint.set(skin));}
  });
  // Reused transforms: update has no geometry, material, array or Object3D allocation.
  const rig=new THREE.Object3D(),limb=new THREE.Object3D(),armAt=new THREE.Matrix4(),handAt=new THREE.Matrix4(),palmOffset=new THREE.Matrix4().makeTranslation(0,-.23,0);
  // Pitch forward before bringing the hands together, so clapping stays in front of the shirt.
  limb.rotation.order='ZYX';
  function update(now,goalAt=-1,reduceMotion=false){
    const since=goalAt>=0?now-goalAt:9;
    for(let i=0;i<seats.length;i++){
      const seat=seats[i],style=styles[i],t=since-(i%4)*.025;
      const joy=!reduceMotion&&t>=0&&t<1?Math.sin(Math.min(1,t/.15)*Math.PI/2)*(1-Math.max(0,(t-.55)/.45)):0;
      const bob=reduceMotion?0:.006*Math.sin(now*2+seat.phase),hop=joy*seat.lift*Math.abs(Math.sin(t*9+seat.phase));
      rig.position.set(seat.x,seat.y+bob+hop,seat.z);rig.rotation.set(0,style.yaw,0);rig.scale.setScalar(style.scale);rig.updateMatrix();
      body.setMatrixAt(i,rig.matrix);heads.setMatrixAt(i,rig.matrix);faces.setMatrixAt(i,rig.matrix);hair[style.kind].setMatrixAt(style.index,rig.matrix);
      const clap=.5+.5*Math.sin(t*18+seat.phase);
      for(let j=0;j<2;j++){
        const side=j?1:-1,clapping=style.kind===1;
        const raised=clapping?-side*(.65+clap*.45):side*(2.25+.22*Math.sin(t*13+seat.phase))*(style.kind===2&&j===0?.35:1);
        limb.position.set(side*.19,.55,0);limb.rotation.set(-.6,0,side*.12+(raised-side*.12)*joy);limb.updateMatrix();
        armAt.multiplyMatrices(rig.matrix,limb.matrix);arms.setMatrixAt(i*2+j,armAt);
        handAt.multiplyMatrices(armAt,palmOffset);hands.setMatrixAt(i*2+j,handAt);
      }
    }
    for(const m of batches)m.instanceMatrix.needsUpdate=true;
  }
  update(0,-1,true);
  // Cheering stays inside this padded bound; no per-frame frustum-bound rebuild is needed.
  for(const m of batches){m.computeBoundingSphere();m.boundingSphere.radius+=.55;}
  return {group,body,update};
}

