import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,swingPreview,crossingFrom,WEAPONS,PLAYER_Z,KEEPER_REACH,SIDE} from '../dist/core.mjs';

// Bots act only through the real inputs (move axis + swing, then the held aim) and decide from what the screen shows:
// ball, keeper and the swing preview for each aim. A seeded ±1 frame press error stands in for human timing.
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function interceptX(s){const b=s.ball,z=PLAYER_Z+WEAPONS[s.weapon].reach*.5;if(b.vz>=0)return 0;const raw=b.x+b.vx*(z-b.z)/b.vz,p=4*SIDE;let u=((raw+SIDE)%p+p)%p;if(u>2*SIDE)u=p-u;return u-SIDE;}
const lastChance=s=>s.ball.z<s.player.z+.1+Math.abs(s.ball.vz)*(WEAPONS[s.weapon].windup+.02);
const crossing=(s,p)=>crossingFrom(p.x,p.z,Math.sin(p.angle),Math.cos(p.angle),s);
// Each strategy returns the aim to hold for this swing, or null to wait. powerOnly never aims; observe picks a side
// whose line clears the keeper by a margin that a power shot may cut finer.
const strategies={
  powerOnly:s=>swingPreview(s,0).kind==='perfect'?0:null,
  observe:s=>{for(const aim of [-1,1,0]){const p=swingPreview(s,aim);
    if((p.kind==='clean'||p.kind==='perfect')&&crossing(s,p).inMouth&&Math.abs(crossing(s,p).x-s.keeper.x)>(p.kind==='perfect'?KEEPER_REACH+.35:KEEPER_REACH+.9))return aim;}return null;},
};
function goalsPerShot(level,name,runs){
  let goals=0,shots=0;
  for(let k=0;k<runs;k++){
    const r=rng(k*7919+level*31+1),s=createGame(level);s.practiceLeft=0;startGame(s);let pending=-1,aim=0;
    for(let f=0;f<60*240&&!['won','lost'].includes(s.phase);f++){
      let axis=0;if(s.phase==='playing'&&s.ball.vz<0){const dx=interceptX(s)-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;}
      if(s.swing&&!s.swing.hit)axis=aim;
      if(pending>=0){if(pending===0){attack(s);axis=aim;pending=-1;}else pending--;}
      else if(s.phase==='playing'&&!s.swing&&s.ball.vz<0){const ahead=structuredClone(s);stepGame(ahead,1/60,axis);const pick=strategies[name](ahead);
        if(pick!==null){aim=pick;pending=Math.round(1+(r()*2-1));}
        else if(['clean','perfect','soft'].includes(swingPreview(ahead,0).kind)&&lastChance(ahead)){aim=0;pending=Math.round(1+(r()*2-1));}}
      const before=s.shots;stepGame(s,1/60,axis);shots+=s.shots-before;
    }
    goals+=s.goals;
  }
  return goals/Math.max(1,shots);
}
test('封角之后，观察门将选路线的效率明显高于只打重炮（第4、6关）',()=>{
  for(const level of [3,5]){const power=goalsPerShot(level,'powerOnly',6),observe=goalsPerShot(level,'observe',6);
    assert.ok(observe>=power*1.8,`关${level+1} 只打重炮 ${power.toFixed(3)} 观察门将 ${observe.toFixed(3)}`);}
});
