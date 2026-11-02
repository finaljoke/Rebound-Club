import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,stepGame,attack,swingPreview,hitZone,WEAPONS,PLAYER_Z,SIDE} from '../dist/core.mjs';

// Bots act only through the real inputs (move axis + swing, then the held aim) and decide from what the screen shows:
// ball, keeper, the keeper's stance and the swing preview (which window a press now would land in). A seeded ±1 frame
// press error stands in for human timing.
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function interceptX(s){const b=s.ball,z=PLAYER_Z+WEAPONS[s.weapon].reach*.5;if(b.vz>=0)return 0;const raw=b.x+b.vx*(z-b.z)/b.vz,p=4*SIDE;let u=((raw+SIDE)%p+p)%p;if(u>2*SIDE)u=p-u;return u-SIDE;}
const lastChance=s=>s.ball.z<s.player.z+.1+Math.abs(s.ball.vz)*(WEAPONS[s.weapon].windup+.02);
// Which window a press now would land in: early (lob), sweet (power) or late (low); null when it would not connect.
function windowNow(s){const p=swingPreview(s,0);if(p.kind==='perfect')return 'sweet';if(p.kind!=='clean')return null;
  const r=hitZone(s);return p.z>r.sweetFar?'early':'late';}
// The side away from the keeper: the far side of a lean, else away from where it stands.
const away=s=>s.keeper.stance?.kind==='lean'?-s.keeper.stance.side:s.keeper.x>0?-1:1;
// Each strategy returns the aim to hold for this swing, or null to wait. The one-shot bots always use one window aimed
// away from the keeper; reader looks at the stance first: power past a lean, a lob over a rush, low under a set keeper.
const one=want=>s=>windowNow(s)===want?away(s):null;
const strategies={
  powerOnly:one('sweet'),lobOnly:one('early'),lowOnly:one('late'),
  reader:s=>{const want={lean:'sweet',rush:'early',set:'late'}[s.keeper.stance?.kind]??'sweet';return windowNow(s)===want?away(s):null;},
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
test('看门将选射法的玩家明显比只会一种射法的玩家进得多，任何单一射法都打不穿（第3~6关）',()=>{
  for(const level of [2,3,4,5]){const rate={};for(const name of Object.keys(strategies))rate[name]=goalsPerShot(level,name,6);
    const single=Math.max(rate.powerOnly,rate.lobOnly,rate.lowOnly),tag=`关${level+1} ${JSON.stringify(Object.fromEntries(Object.entries(rate).map(([k,v])=>[k,+v.toFixed(2)])))}`;
    assert.ok(single<=.7,`单一射法太强 ${tag}`);assert.ok(rate.reader>=single+.2,`看门将没有明显更好 ${tag}`);}
});
