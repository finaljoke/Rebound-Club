// Spike (throwaway): night arena for the cartoon-sports art direction. Same court geometry as the game
// (render x, height, -depth), everything else is look only.
import * as THREE from 'three';
import {mergeGeometries} from '../vendor/utils/BufferGeometryUtils.js';

export const COURT={side:3.82,near:.6,far:-9.8,playerZ:-1.6,keeperZ:-9.3,goalZ:-9.7,goalHalf:2.6,goalH:1.5,netZ:-10.45};
const TEAM=['#ff6a2b','#ffb02e','#1ec8b4','#3a7bff','#f4f1ea','#ff4f7b'];
const SKIN=['#f2c5a0','#d99a6c','#a8693f','#7a4a2c','#f7d7b9'];

function canvasTexture(w,h,draw,{repeat=false}={}){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
  if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function glowTexture(inner='rgba(255,255,255,1)',mid='rgba(255,240,200,.35)'){
  return canvasTexture(128,128,(g,w)=>{const r=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);r.addColorStop(0,inner);r.addColorStop(.25,mid);r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,w);});
}

function turfTexture(){
  const W=COURT.side*2,L=COURT.near-COURT.far,px=96;
  return canvasTexture(Math.round(W*px),Math.round(L*px),(g,w,h)=>{
    const stripes=10;for(let i=0;i<stripes;i++){g.fillStyle=i%2?'#2fb05e':'#27a052';g.fillRect(0,i*h/stripes,w,h/stripes+1);}
    // Soft speckle so the stripes are not flat plastic.
    for(let i=0;i<9000;i++){g.fillStyle=Math.random()<.5?'rgba(255,255,255,.05)':'rgba(0,40,10,.07)';g.fillRect(Math.random()*w,Math.random()*h,2,3);}
    const X=x=>(x+COURT.side)*px,Z=z=>(COURT.near-z)*px;g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=7;
    g.strokeRect(X(-COURT.side+.12),Z(COURT.near-.08),X(COURT.side-.12)-X(-COURT.side+.12),Z(COURT.far+.1)-Z(COURT.near-.08));
    const mid=(COURT.near+COURT.far)/2;g.beginPath();g.moveTo(X(-COURT.side),Z(mid));g.lineTo(X(COURT.side),Z(mid));g.stroke();
    g.beginPath();g.arc(X(0),Z(mid),1.1*px,0,Math.PI*2);g.stroke();
    g.strokeRect(X(-2.2),Z(COURT.far+.1),X(2.2)-X(-2.2),1.7*px);g.strokeRect(X(-2.2),Z(COURT.near-.08)-1.7*px,X(2.2)-X(-2.2),1.7*px);
    g.fillStyle='#fff';g.beginPath();g.arc(X(0),Z(mid),.1*px,0,Math.PI*2);g.fill();
  });
}

function ledTexture(){
  const t=canvasTexture(2048,128,(g,w,h)=>{
    const blocks=[['REBOUND CLUB','#ff6a2b'],['反弹守卫','#1ec8b4'],['NIGHT CUP','#ffb02e'],['反弹守卫','#3a7bff']];
    const bw=w/blocks.length;blocks.forEach(([text,col],i)=>{g.fillStyle='#0b1022';g.fillRect(i*bw,0,bw,h);g.fillStyle=col;g.fillRect(i*bw+6,10,bw-12,h-20);
      g.fillStyle='#0b1022';g.font='900 64px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,i*bw+bw/2,h/2+3);});
  },{repeat:true});t.repeat.set(1,1);return t;
}

function sky(){
  const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{},
    vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 p;void main(){float y=p.y;vec3 top=vec3(.02,.03,.09),hor=vec3(.17,.10,.32),low=vec3(.03,.04,.10);vec3 c=y>0.?mix(hor,top,smoothstep(0.,.55,y)):mix(hor,low,smoothstep(0.,.2,-y));gl_FragColor=vec4(c,1.);}'});
  const s=new THREE.Mesh(new THREE.SphereGeometry(80,32,16),m);
  const n=260,pos=new Float32Array(n*3);for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,y=.25+Math.random()*.75,r=Math.sqrt(1-y*y);pos.set([Math.cos(a)*r*75,y*75,Math.sin(a)*r*75],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const stars=new THREE.Points(g,new THREE.PointsMaterial({color:0xdfe6ff,size:.35,sizeAttenuation:true,fog:false,transparent:true,opacity:.8}));
  const grp=new THREE.Group();grp.add(s,stars);return grp;
}

function goal(z,dir){
  const g=new THREE.Group(),post=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.25,roughness:.35});
  const {goalHalf:h,goalH:H}=COURT,r=.075;
  const cyl=(len)=>new THREE.CylinderGeometry(r,r,len,12);
  for(const x of [-h,h]){const p=new THREE.Mesh(cyl(H),post);p.position.set(x,H/2,z);p.castShadow=true;g.add(p);}
  const bar=new THREE.Mesh(cyl(h*2+r*2),post);bar.rotation.z=Math.PI/2;bar.position.set(0,H,z);bar.castShadow=true;g.add(bar);
  return g;
}

// Back net as a grid whose points can bulge where the ball lands.
function net(z,dir){
  const {goalHalf:h,goalH:H}=COURT,depth=.75*dir,nx=26,ny=8;
  const back=[],segs=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)back.push([-h+2*h*i/nx,H*j/ny*.92,z+depth]);
  const idx=(i,j)=>j*(nx+1)+i;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){if(i<nx)segs.push(idx(i,j),idx(i+1,j));if(j<ny)segs.push(idx(i,j),idx(i,j+1));}
  // Roof and side panels are static lines.
  const stat=[];
  for(let i=0;i<=nx;i++){const x=-h+2*h*i/nx;stat.push(x,H,z,x,H*.92,z+depth);}
  for(const x of [-h,h])for(let j=0;j<=ny;j++){const y=H*j/ny;stat.push(x,y,z,x,y*.92,z+depth);}
  const base=new Float32Array(back.flat()),pos=base.slice();
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(segs);
  const mat=new THREE.LineBasicMaterial({color:0xe8f0ff,transparent:true,opacity:.55});
  const lines=new THREE.LineSegments(geo,mat);
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(stat,3));
  const side=new THREE.LineSegments(sg,mat);
  const grp=new THREE.Group();grp.add(lines,side);
  let hit=null;
  grp.userData.bulge=(x,y,power=1)=>{hit={x,y,t:0,power};};
  grp.userData.update=dt=>{if(!hit)return;hit.t+=dt;const k=Math.exp(-hit.t*3.2)*Math.sin(Math.min(hit.t*9,Math.PI*.5+hit.t*7))*hit.power;
    for(let n=0;n<pos.length;n+=3){const dx=base[n]-hit.x,dy=base[n+1]-hit.y,f=Math.exp(-(dx*dx+dy*dy)/.5);pos[n+2]=base[n+2]+dir*.55*f*k;}
    geo.attributes.position.needsUpdate=true;if(hit.t>2.5){hit=null;pos.set(base);geo.attributes.position.needsUpdate=true;}};
  return grp;
}

function crowd(){
  const seats=[];
  const addRow=(x0,x1,z,y,rotY,step=.62)=>{for(let x=x0;x<=x1;x+=step)if(Math.random()<.86)seats.push({x:x+(Math.random()-.5)*.12,y,z:z+(Math.random()-.5)*.1,rotY});};
  // Behind the far goal: five rising tiers.
  for(let t=0;t<5;t++)addRow(-7.5,7.5,COURT.far-2.2-t*.95,.35+t*.55,0);
  for(const s of [-1,1])for(let t=0;t<4;t++){const x=s*(COURT.side+2.1+t*.95);for(let z=COURT.far-1.2;z<=.2;z+=.62)if(Math.random()<.8)seats.push({x:x+(Math.random()-.5)*.1,y:.35+t*.55,z,rotY:-s*Math.PI/2});}
  const n=seats.length;
  const bodyG=new THREE.CapsuleGeometry(.17,.28,4,8);bodyG.translate(0,.3,0);
  const headG=new THREE.SphereGeometry(.14,10,8);headG.translate(0,.72,0);
  const armG=mergeGeometries([new THREE.CapsuleGeometry(.05,.3,3,6).translate(-.22,.62,0),new THREE.CapsuleGeometry(.05,.3,3,6).translate(.22,.62,0)]);
  const mk=(g,c)=>{const m=new THREE.InstancedMesh(g,new THREE.MeshToonMaterial({color:0xffffff}),n);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;return m;};
  const bodies=mk(bodyG),heads=mk(headG),arms=mk(armG);
  const col=new THREE.Color();
  seats.forEach((s,i)=>{s.phase=Math.random()*10;s.freq=1.5+Math.random()*1.5;s.team=TEAM[(Math.random()*TEAM.length)|0];
    bodies.setColorAt(i,col.set(s.team));arms.setColorAt(i,col.set(s.team).multiplyScalar(.85));heads.setColorAt(i,col.set(SKIN[(Math.random()*SKIN.length)|0]));});
  const grp=new THREE.Group();grp.add(bodies,arms,heads);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(1,1,1),e=new THREE.Euler();
  let cheer=0;
  grp.userData.cheer=()=>{cheer=2.6;};
  grp.userData.update=(dt,t)=>{cheer=Math.max(0,cheer-dt);const c=Math.min(1,cheer);
    seats.forEach((s,i)=>{const bob=Math.max(0,Math.sin(t*s.freq+s.phase))*.05+c*Math.max(0,Math.sin(t*9+s.phase))*.35;
      p.set(s.x,s.y+bob,s.z);q.setFromEuler(e.set(0,s.rotY,Math.sin(t*s.freq*.7+s.phase)*.06));m.compose(p,q,sc);bodies.setMatrixAt(i,m);heads.setMatrixAt(i,m);
      // Arms go up when cheering.
      sc.set(1,1-1.6*c*(.6+.4*Math.sin(s.phase)),1);m.compose(p,q,sc);arms.setMatrixAt(i,m);sc.set(1,1,1);});
    bodies.instanceMatrix.needsUpdate=heads.instanceMatrix.needsUpdate=arms.instanceMatrix.needsUpdate=true;};
  return grp;
}

function stands(){
  const mat=new THREE.MeshStandardMaterial({color:0x1b2347,roughness:.85});
  const trim=new THREE.MeshStandardMaterial({color:0x2c3a72,roughness:.6});
  const g=[];const t=[];
  for(let i=0;i<5;i++){g.push(new THREE.BoxGeometry(17,.55*(i+1),.95).translate(0,.55*(i+1)/2,COURT.far-2.2-i*.95));t.push(new THREE.BoxGeometry(17,.06,.08).translate(0,.55*(i+1),COURT.far-2.2-i*.95+.45));}
  for(const s of [-1,1])for(let i=0;i<4;i++){g.push(new THREE.BoxGeometry(.95,.55*(i+1),13).translate(s*(COURT.side+2.1+i*.95),.55*(i+1)/2,-5));t.push(new THREE.BoxGeometry(.08,.06,13).translate(s*(COURT.side+2.1+i*.95-.45),.55*(i+1),-5));}
  const grp=new THREE.Group();const a=new THREE.Mesh(mergeGeometries(g),mat);a.receiveShadow=true;grp.add(a,new THREE.Mesh(mergeGeometries(t),trim));return grp;
}

function floodlights(){
  const grp=new THREE.Group(),glow=glowTexture('rgba(255,255,255,1)','rgba(255,236,190,.45)');
  const poleM=new THREE.MeshStandardMaterial({color:0x2a3150,roughness:.6}),panelM=new THREE.MeshBasicMaterial({color:0xfffbe6});
  const coneTex=canvasTexture(4,128,(g,w,h)=>{const l=g.createLinearGradient(0,0,0,h);l.addColorStop(0,'rgba(255,245,215,.0)');l.addColorStop(.15,'rgba(255,245,215,.5)');l.addColorStop(1,'rgba(255,245,215,0)');g.fillStyle=l;g.fillRect(0,0,w,h);});
  for(const [x,z] of [[-10,4],[10,4],[-10,-14],[10,-14]]){
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.18,.28,12,8),poleM);pole.position.set(x,6,z);grp.add(pole);
    const head=new THREE.Group();head.position.set(x,12.4,z);head.lookAt(0,0,-5);grp.add(head);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.5,.25),poleM);head.add(frame);
    for(let i=0;i<3;i++)for(let j=0;j<2;j++){const p=new THREE.Mesh(new THREE.PlaneGeometry(.7,.55),panelM);p.position.set(-.85+i*.85,-.35+j*.7,.14);head.add(p);}
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xfff1d0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));s.scale.setScalar(9);s.position.set(0,0,.6);head.add(s);
    const len=16,cone=new THREE.Mesh(new THREE.CylinderGeometry(1.2,4.5,len,24,1,true),new THREE.MeshBasicMaterial({map:coneTex,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));
    cone.rotation.x=Math.PI/2;cone.position.z=len/2;head.add(cone);
  }
  return grp;
}

export function buildArena(scene){
  scene.background=new THREE.Color(0x070b1d);scene.fog=new THREE.Fog(0x0d1233,24,60);
  scene.add(sky());
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:0x151b33,roughness:.95}));apron.rotation.x=-Math.PI/2;apron.position.set(0,-.02,-5);apron.receiveShadow=true;scene.add(apron);
  const L=COURT.near-COURT.far+.6;
  const court=new THREE.Mesh(new THREE.PlaneGeometry(COURT.side*2+.4,L),new THREE.MeshStandardMaterial({map:turfTexture(),roughness:.92}));
  court.rotation.x=-Math.PI/2;court.position.set(0,0,(COURT.near+COURT.far)/2);court.receiveShadow=true;scene.add(court);
  // A brighter pool of light on the court keeps the eye in the middle; edges fall off to the dark arena.
  const pool=new THREE.Mesh(new THREE.CircleGeometry(7.5,48),new THREE.MeshBasicMaterial({map:glowTexture('rgba(255,250,230,.22)','rgba(255,240,210,.10)'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  pool.rotation.x=-Math.PI/2;pool.position.set(0,.01,-4.6);pool.scale.set(.75,1.15,1);scene.add(pool);

  // Side walls with scrolling LED boards facing the court; one more behind the far goal.
  const led=ledTexture();const ledMats=[];
  const wallM=new THREE.MeshStandardMaterial({color:0x1a2142,roughness:.35,metalness:.2});
  const board=(w,x,z,rotY,rep)=>{const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotY;
    const body=new THREE.Mesh(new THREE.BoxGeometry(w,.62,.18),wallM);body.position.y=.31;body.castShadow=true;body.receiveShadow=true;g.add(body);
    const t=led.clone();t.repeat.set(rep,1);t.needsUpdate=true;const m=new THREE.MeshBasicMaterial({map:t,toneMapped:false});ledMats.push(m);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(w-.1,.46),m);face.position.set(0,.33,.1);g.add(face);scene.add(g);};
  board(L-.4,-COURT.side-.12,(COURT.near+COURT.far)/2,Math.PI/2,2.4);
  board(L-.4,COURT.side+.12,(COURT.near+COURT.far)/2,-Math.PI/2,2.4);
  board(14,0,COURT.far-1.15,0,2);
  scene.add(stands(),floodlights());
  const fans=crowd();scene.add(fans);
  scene.add(goal(COURT.goalZ,-1),goal(COURT.near+.35,1));
  const farNet=net(COURT.goalZ,-1);scene.add(farNet);

  scene.add(new THREE.HemisphereLight(0x8ea6ff,0x241a3a,1.1));
  const key=new THREE.DirectionalLight(0xfff0d8,2.8);key.position.set(5,14,3);key.target.position.set(0,0,-5);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-7,right:7,top:9,bottom:-9,near:2,far:40});key.shadow.bias=-.0004;key.shadow.normalBias=.03;
  scene.add(key,key.target);
  // Cool rim from behind the keeper outlines the near player's back; warm fill from the camera side.
  const rim=new THREE.DirectionalLight(0x7fb6ff,1.3);rim.position.set(-3,6,-18);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xffc2a8,.45);fill.position.set(-6,5,9);scene.add(fill);

  return {net:farNet,crowd:fans,update(dt,t){for(const m of ledMats)m.map.offset.x=(m.map.offset.x+dt*.05)%1;farNet.userData.update(dt);fans.userData.update(dt,t);}};
}
