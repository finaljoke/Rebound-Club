import assert from 'node:assert/strict';
import * as THREE from '../../dist/vendor/three.module.min.js';
import {createGame,startGame,stepGame} from '../../dist/core.mjs';

// The defender at either end of its run, with the camera's sideways follow, stays fully on screen.
export function heroInFrame(w,aspect){const s=createGame();startGame(s);stepGame(s,1,0);
  for(const x of [-3.45,3.45]){s.player.x=x;w.update(s,0,true,1);w.shake(0);w.scene.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(w.hero,true);
    for(const X of [b.min.x,b.max.x])for(const Y of [b.min.y,b.max.y])for(const Z of [b.min.z,b.max.z]){const p=new THREE.Vector3(X,Y,Z).project(w.camera);assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,JSON.stringify({aspect,x,p}));}}}
