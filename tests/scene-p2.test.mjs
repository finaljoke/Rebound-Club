import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {buildWorld} from '../dist/scene3d.mjs';

// Share of the frame the playing surface covers, and the defender's on-screen height.
const COURT=[[-4.1,-.2],[4.1,-.2],[4.1,10],[-4.1,10]];
function courtShare(w){const p=COURT.map(([x,z])=>new THREE.Vector3(x,0,-z).project(w.camera));let a=0;for(let i=0;i<4;i++){const q=p[i],r=p[(i+1)%4];a+=q.x*r.y-r.x*q.y;}return Math.abs(a)/8;}
const person=w=>{const top=w.project(0,1.6,2.15),feet=w.project(0,1.6,0);return feet.y-top.y;};
// Measured on the framing before this change (main be49857).
const BEFORE={.62:{court:.344,person:.107},.65:{court:.356,person:.112},.76:{court:.389,person:.127},1.45:{court:.342,person:.217},1.9:{court:.270,person:.238},2.2:{court:.233,person:.238}};

test('构图收紧：竖屏球场放大至少 5%，中间比例 15%，横屏 30%，人物都不变小',()=>{
  for(const [aspect,was] of Object.entries(BEFORE)){
    const w=buildWorld();w.resize(Number(aspect));const c=courtShare(w),h=person(w),gain=Number(aspect)<1?1.05:Number(aspect)<1.8?1.15:1.3;
    assert.ok(c>=was.court*gain,`宽高比 ${aspect} 球场 ${c.toFixed(3)}（原 ${was.court}）`);
    assert.ok(h>=was.person*.99,`宽高比 ${aspect} 人物 ${h.toFixed(3)}（原 ${was.person}）`);
  }
});
