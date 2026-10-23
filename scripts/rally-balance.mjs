// Reproducible controller experiment. No browser, rule overrides or invented points.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import * as liveCore from '../dist/rally-core.mjs';
const core=process.argv.includes('--baseline')?await import('data:text/javascript;base64,'+Buffer.from(execFileSync('git',['show','0040c3a:dist/rally-core.mjs'])).toString('base64')):liveCore;
const {RALLY,createRally,startRally,stepRally,attackRally,advanceBall}=core;

export const EXPERIMENT={controller:'real-rule-branches-v1',seed:0x20261023,matches:200,sigmas:[.12,.25,.40],strategies:['N','C','S'],reaction:.18,maxSteps:60000};
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function distribution(values){
 const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
 return {count:n,mean:mean(values),median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null};
}
function rate(points){return {points:points.length,wins:points.filter(p=>p.winner==='player').length,pointWinRate:points.length?points.filter(p=>p.winner==='player').length/points.length:null};}
export function summarizePoints(points){
 const reasons=['net','out','own-half','double-bounce','whiff'],lossReasons={};
 for(const loser of ['player','opponent'])lossReasons[loser]=Object.fromEntries(reasons.map(r=>[r,points.filter(p=>p.loser===loser&&p.reason===r).length]));
 return {...rate(points),hits:distribution(points.map(p=>p.hits)),
  withoutHeavy:{...rate(points.filter(p=>!p.opponentHeavy)),hits:distribution(points.filter(p=>!p.opponentHeavy).map(p=>p.hits))},
  withHeavy:rate(points.filter(p=>p.opponentHeavy>0)),
  heavy:{total:points.reduce((n,p)=>n+p.opponentHeavy,0),perPoint:mean(points.map(p=>p.opponentHeavy))},
  heavySkipped:{total:points.reduce((n,p)=>n+(p.heavySkipped??0),0),perPoint:mean(points.map(p=>p.heavySkipped??0))},
  heavyResponses:Object.fromEntries(['normal','counter','whiff','opponent-fault'].map(kind=>[kind,rate(points.filter(p=>p.heavyResponses.includes(kind)))])),
  lossReasons,opponentChaseDistance:distribution(points.map(p=>p.opponentChaseDistance).filter(Number.isFinite))};
}
export function normalNoise(seed){
 let value=seed>>>0;const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return (value+.5)/4294967296;};
 return Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
}
export function desiredTiming(s,strategy,sigma,seed,shot){
 if(s.ball.kind==='heavy'&&strategy!=='N')return sigma*normalNoise(seed+Math.imul(shot+1,0x9e3779b1));
 const early=strategy==='S'?null:timingOption(s,.5),late=strategy==='S'?null:timingOption(s,-.5);
 const side=strategy==='S'||(early&&(!late||early.gap>=late.gap))||(!early&&!late)?1:-1;
 return side*.5+sigma*normalNoise(seed+Math.imul(shot+1,0x9e3779b1));
}
export function timingOption(s,target){
 // Compare two independent, noise-free branches using the real rules. Each
 // branch has its own ball x, player depth and opponent recovery at the hit.
 const q=structuredClone(s),readyAt=q.elapsed+EXPERIMENT.reaction;let attempted=false;
 for(let i=0;i<1200&&q.phase==='playing'&&q.ball.hitter==='opponent';i++){
  let axis=0;
  if(q.elapsed>=readyAt){const dx=(q.flight?.contact?.x??q.ball.x)-q.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;if(!attempted&&!q.swing&&previewTiming(q)<=target)attempted=attackRally(q);}
  stepRally(q,RALLY.dt,axis);
  if(q.events.some(e=>e.type==='playerHit'))return {target,x:q.ball.target.x,opponentX:q.opponent.x,gap:Math.abs(q.ball.target.x-q.opponent.x),at:q.elapsed};
 }
 return null;
}
export function previewTiming(s){
 const b=structuredClone(s.ball);advanceBall(b,RALLY.windup);
 const distance=s.player.targetZ-s.player.z,movement=Math.sign(distance)*Math.min(Math.abs(distance),RALLY.depthSpeed*RALLY.windup);
 return (b.z-s.player.z-movement-RALLY.reach*.5)/(RALLY.reach*.5);
}
export function pointFacts(record,{pendingHeavy,heavyResponses,skipped,chaseDistance}){
 const responses=[...heavyResponses];
 if(pendingHeavy)responses.push(record.loser==='player'?'whiff':'opponent-fault');
 return {...record,heavySkipped:skipped,heavyResponses:[...new Set(responses)],
  opponentChaseDistance:record.loser==='opponent'&&record.reason==='double-bounce'?chaseDistance:null};
}
export function simulateMatch({strategy,sigma,seed,maxSteps=EXPERIMENT.maxSteps,trace=false}={}){
 const s=createRally(),points=[],shots=[];startRally(s);
 let incoming=null,goal=0,readyAt=0,attempted=false,shot=0,pointNumber=0;
 let heavyResponses=[],pendingHeavy=false,skipped=0,chaseDistance=null;
 for(let tick=0;tick<maxSteps&&s.phase!=='finished';tick++){
  if(s.records.length!==pointNumber){pointNumber=s.records.length;incoming=null;heavyResponses=[];pendingHeavy=false;skipped=0;chaseDistance=null;shot=0;}
  if(s.phase==='playing'&&s.ball.hitter==='opponent'&&s.ball!==incoming){
   incoming=s.ball;readyAt=s.elapsed+EXPERIMENT.reaction;attempted=false;
   goal=desiredTiming(s,strategy,sigma,seed+Math.imul(pointNumber+1,0x85ebca6b),shot++);
   pendingHeavy=s.ball.kind==='heavy';
  }
  let axis=0;
  if(s.phase==='playing'&&s.ball.hitter==='opponent'&&s.elapsed>=readyAt){
   const dx=(s.flight?.contact?.x??s.ball.x)-s.player.x;axis=Math.abs(dx)>.08?Math.sign(dx):0;
   const timing=previewTiming(s);
   // Timing descends from +1 (early/left) to -1 (late/right). An out-of-window
   // noisy target is not clamped into a guaranteed return or retried.
   if(!attempted&&!s.swing&&timing<=goal){attempted=attackRally(s);}
  }
  const before=s.records.length;stepRally(s,RALLY.dt,axis);
  for(const e of s.events){
   if(trace&&(e.type==='playerHit'||e.type==='opponentHit'))shots.push({point:s.records.length+1,at:e.at,hitter:s.ball.hitter,kind:e.kind,goal,playerX:s.player.x,opponentX:s.opponent.x,origin:s.lastShot,target:s.ball.target,contact:s.flight?.contact});
   if(e.type==='heavySkipped')skipped++;
   if(e.type==='playerHit'){
    if(pendingHeavy){heavyResponses.push(e.kind==='counter'?'counter':'normal');pendingHeavy=false;}
    chaseDistance=Math.abs((s.flight?.contact?.x??s.ball.x)-s.opponent.x);
   }
  }
  if(s.records.length>before){
   points.push(pointFacts(s.records.at(-1),{pendingHeavy,heavyResponses,skipped,chaseDistance}));
  }
 }
 return {finished:s.phase==='finished',score:s.score,elapsed:s.elapsed,points,...(trace?{shots}:{})};
}
export function evaluateTargets(groups){
 const find=(strategy,sigma)=>groups.find(g=>g.strategy===strategy&&g.sigma===sigma);
 const n=find('N',.25),c=find('C',.25),side=find('S',.25),skilled=find('C',.12),novice=find('N',.40);
 const pressure=n.withoutHeavy.pointWinRate!==null&&n.withHeavy.pointWinRate!==null?n.withoutHeavy.pointWinRate-n.withHeavy.pointWinRate:null;
 const reading=c.pointWinRate-n.pointWinRate,movement=c.pointWinRate-side.pointWinRate;
 return [
  {goal:'普通球能来回',observed:n.withoutHeavy.hits.median,required:'>= 6',pass:n.withoutHeavy.hits.median!==null&&n.withoutHeavy.hits.median>=6},
  {goal:'强攻会施压',observed:pressure,required:'>= 0.15',pass:pressure!==null&&pressure>=.15},
  {goal:'读招能获益',observed:{advantage:reading,counterPointWinRate:c.heavyResponses.counter.pointWinRate},required:'advantage >= 0.10; counterPointWinRate >= 0.70',pass:reading>=.10&&c.heavyResponses.counter.pointWinRate!==null&&c.heavyResponses.counter.pointWinRate>=.70},
  {goal:'调动能得分',observed:movement,required:'>= 0.10',pass:movement>=.10},
  {goal:'不是一边倒',observed:{skilledCounter:skilled.pointWinRate,noviceNormal:novice.pointWinRate},required:'skilledCounter <= 0.85; noviceNormal >= 0.20',pass:skilled.pointWinRate<=.85&&novice.pointWinRate>=.20}
 ];
}
export function runBalance({matches=EXPERIMENT.matches,progress=false}={}){
 const groups=[];
 for(const sigma of EXPERIMENT.sigmas)for(const strategy of EXPERIMENT.strategies){
  const points=[],unfinished=[];let elapsed=0;
  for(let match=0;match<matches;match++){
   const result=simulateMatch({strategy,sigma,seed:(EXPERIMENT.seed+Math.imul(match+1,0x27d4eb2d))>>>0});
   points.push(...result.points.map(p=>({...p,match:match+1})));elapsed+=result.elapsed;
   if(!result.finished)unfinished.push({match:match+1,score:result.score,seconds:result.elapsed});
  }
  groups.push({strategy,sigma,matches,completed:matches-unfinished.length,unfinished,simulatedSeconds:elapsed,...summarizePoints(points),pointRecords:points});
  if(progress)console.log(JSON.stringify({group:strategy,sigma,matches,completed:matches-unfinished.length,points:points.length}));
 }
 const targets=evaluateTargets(groups);
 return {experiment:{...EXPERIMENT,matches},ratePopulation:'Completed points, including completed points in unfinished matches; do not accept a balance result unless allCompleted is true.',parameters:{...RALLY},groups,targets,allCompleted:groups.every(g=>g.completed===matches),allTargetsMet:targets.every(t=>t.pass)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const argument=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 const matches=Number(argument('--matches')??EXPERIMENT.matches),output=argument('--output')??'artifacts/rally/balance.json';
 if(!Number.isInteger(matches)||matches<1)throw Error('matches must be a positive integer');
 if(argument('--params')){
  const parameters=JSON.parse(await readFile(argument('--params'),'utf8'));
  const allowed=['aiChaseSpeed','aiRecoverSpeed','aiWideX','aiStagger','tellMargin','counterDelay','aiNormalCenterEvery','aiNormalDepth','aiCounterReplyDepth','aiCounterReplyCenter'];
  for(const [key,value] of Object.entries(parameters)){if(!allowed.includes(key)||!Number.isFinite(value)||value<0)throw Error('Unsupported balance parameter '+key);RALLY[key]=value;}
 }
 const report=runBalance({matches,progress:true});await mkdir('artifacts/rally',{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.table(report.groups.map(g=>({strategy:g.strategy,sigma:g.sigma,completed:g.completed,points:g.points,win:g.pointWinRate,medianHits:g.hits.median,meanHits:g.hits.mean,noHeavyMedian:g.withoutHeavy.hits.median,noHeavyWin:g.withoutHeavy.pointWinRate,heavyWin:g.withHeavy.pointWinRate,counterWin:g.heavyResponses.counter.pointWinRate,heavyPerPoint:g.heavy.perPoint,skipped:g.heavySkipped.total})));
 console.log(JSON.stringify({targets:report.targets,allCompleted:report.allCompleted,allTargetsMet:report.allTargetsMet}));
 if(!report.allCompleted||!report.allTargetsMet)process.exitCode=1;
}
