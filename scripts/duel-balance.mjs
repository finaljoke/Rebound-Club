// Duel balance probe (node scripts/duel-balance.mjs [matches] [seed]): two bots (duel-bot.mjs) play whole matches in one
// copy of the duel, both decided locally, through their inputs only. Prints one JSON object; the same arguments always
// print the same bytes. The numbers are for looking at, not pass/fail lines.
import {createDuel,startDuel,stepDuel,duelAttack,duelSkill,SIDES} from '../dist/duel-core.mjs';
import {viewFor} from '../dist/duel-view.mjs';
import {createBot} from '../dist/duel-bot.mjs';
const matches=Number(process.argv[2]||200),seed=Number(process.argv[3]||1),DT=1/60,CAP=60*60*15;
const kinds={},totals={matches,finished:0,timeouts:0,points:0,hits:0,wide:0,whiff:0,wall:0,aWins:0,pointSeconds:0,longestPoint:0,matchSeconds:0};
const perPointHits=[];
for(let m=0;m<matches;m++){
  const s=createDuel(),bots={a:createBot({seed:seed*1000+m*2+1}),b:createBot({seed:seed*1000+m*2+2})};startDuel(s);
  let pointHits=0,pointStart=null,f=0;
  for(;f<CAP&&s.phase!=='won';f++){
    const ins={};
    for(const side of SIDES){const d=bots[side].decide(viewFor(s,side),DT);ins[side]={axis:d.axis};
      if(d.skill)duelSkill(s,side,d.skill,d.axis);else if(d.swing)duelAttack(s,side);}
    stepDuel(s,DT,ins);
    for(const e of s.events){
      if(e.type==='serve'){pointHits=0;pointStart=s.elapsed;}
      if(['hit','perfect','soft','spin','burst'].includes(e.type)){pointHits++;totals.hits++;const k=e.type==='hit'?s.players[e.side].lastShot:e.type;kinds[k]=(kinds[k]||0)+1;}
      if(e.type==='wide')totals.wide++;if(e.type==='whiff')totals.whiff++;if(e.type==='wall')totals.wall++;
      if(e.type==='goal'){totals.points++;perPointHits.push(pointHits);const d=s.elapsed-(pointStart??s.elapsed);totals.pointSeconds+=d;totals.longestPoint=Math.max(totals.longestPoint,d);}
    }
  }
  if(s.phase==='won'){totals.finished++;if(s.winner==='a')totals.aWins++;}else totals.timeouts++;
  totals.matchSeconds+=s.elapsed;
}
perPointHits.sort((a,b)=>a-b);const q=p=>perPointHits.length?perPointHits[Math.min(perPointHits.length-1,Math.floor(p*perPointHits.length))]:null;
const r3=x=>Math.round(x*1000)/1000;
console.log(JSON.stringify({matches,seed,finished:totals.finished,timeouts:totals.timeouts,aWinRate:r3(totals.aWins/Math.max(1,totals.finished)),
  hitsPerMatch:r3(totals.hits/matches),hitsPerPoint:r3(totals.hits/Math.max(1,totals.points)),hitsPerPointMedian:q(.5),hitsPerPointP90:q(.9),
  secondsPerPoint:r3(totals.pointSeconds/Math.max(1,totals.points)),longestPointSeconds:r3(totals.longestPoint),secondsPerMatch:r3(totals.matchSeconds/matches),
  wide:totals.wide,whiffs:totals.whiff,wallBounces:totals.wall,
  shotShare:Object.fromEntries(Object.keys(kinds).sort().map(k=>[k,r3(kinds[k]/Math.max(1,totals.hits))]))},null,1));
