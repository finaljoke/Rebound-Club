// Keeper balance probe (node scripts/keeper-balance.mjs [overrides JSON]): plain shots only, per level. "无脑交替" alternates
// sides; "看空当" aims away from the keeper at box entry; the paired columns replay the same planted moment holding the
// opposite side then switching (骗门将) versus holding the real side early (老实提前按).
const C=await import('../dist/core.mjs');
const {createGame,startGame,stepGame,attack,inHitRange,WEAPONS,PLAYER_Z,SIDE,LEVELS}=C;
function interceptX(s){const b=s.ball,z=PLAYER_Z+WEAPONS[s.weapon].reach*.5;if(b.vz>=0)return 0;const raw=b.x+b.vx*(z-b.z)/b.vz,p=4*SIDE;let u=((raw+SIDE)%p+p)%p;if(u>2*SIDE)u=p-u;return u-SIDE;}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// Plays one planned shot from a planted state to its result, holding `show` until the swing and `shot` after.
function resolve(s0,shot,show,jit){const s=structuredClone(s0),w=WEAPONS[s.weapon],sweet=PLAYER_Z+w.reach*.5;
  for(let i=0;i<900;i++){let axis=s.swing?(s.swing.hit?0:shot):show;
    if(!s.swing&&s.ball.vz<0&&s.ball.z<=sweet+jit*w.reach*.5+Math.abs(s.ball.vz)*w.windup){attack(s);axis=shot;}
    stepGame(s,1/120,axis);for(const e of ['goal','save','wide','miss','practice'])if(s.events.includes(e))return e;}return 'none';}
const plans={alt:(s,st)=>{const d=st.side=-(st.side||1);return {shot:d,show:0};},smart:s=>({shot:s.keeper.x>0?-1:1,show:0})};
function run(level,name,runs=30){let goals=0,shots=0,fake=0,honest=0,pairs=0;
  for(let k=0;k<runs;k++){const r=rng(k*7919+level*31+7),s=createGame(level);s.practiceLeft=0;startGame(s);const st={side:k%2?1:-1};let plan=null,jit=-.6;
    for(let f=0;f<120*240&&!['won','lost'].includes(s.phase);f++){
      let axis=0;const w=WEAPONS[s.weapon],sweet=PLAYER_Z+w.reach*.5;
      if(s.phase==='playing'&&s.ball.vz<0){
        if(!plan&&inHitRange(s)){plan=plans[name](s,st);
          if(name==='smart'&&level>=2&&k<12){pairs++;const d=plan.shot;if(resolve(s,d,-d,jit)==='goal')fake++;if(resolve(s,d,d,jit)==='goal')honest++;}}
        if(plan&&!s.swing)axis=plan.show;else if(!plan){const dx=interceptX(s)-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;}
        if(plan&&!s.swing&&s.ball.z<=sweet+jit*w.reach*.5+Math.abs(s.ball.vz)*w.windup){attack(s);jit=-.85+r()*.4;}
        if(s.swing&&!s.swing.hit&&plan)axis=plan.shot;
      }
      if(s.ball.vz>0)plan=null;
      const g=s.goals,sh=s.shots;stepGame(s,1/120,axis);shots+=s.shots-sh;goals+=s.goals-g;
    }}
  return {rate:goals/Math.max(1,shots),fake:fake/Math.max(1,pairs),honest:honest/Math.max(1,pairs)};}
export function table(){const out=[];for(let level=0;level<6;level++){const a=run(level,'alt'),m=run(level,'smart');
  out.push(`关${level+1} 无脑交替 ${(a.rate*100).toFixed(0)}%  看空当 ${(m.rate*100).toFixed(0)}%  同局面：骗门将 ${(m.fake*100).toFixed(0)}% / 老实提前按 ${(m.honest*100).toFixed(0)}%`);}return out.join('\n');}
const set=JSON.parse(process.argv[2]||'{}');for(const [i,K] of Object.entries(set))Object.assign(LEVELS[i].keeper,K);
if(process.argv[2])console.log(process.argv[2]);console.log(table());
