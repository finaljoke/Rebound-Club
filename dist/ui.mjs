export function screenFor(phase){return phase==='ready'?'ready':phase==='paused'?'paused':['won','lost'].includes(phase)?'result':'match';}
export function createMatchStats(){return {powerHits:0,powerGoals:0,saves:0,whiffs:0,practiceConceded:0};}
export function recordMatchEvent(stats,event,state){
  if(event==='perfect')stats.powerHits++;
  if(event==='goal'&&state.lastShot==='perfect')stats.powerGoals++;
  if(event==='save')stats.saves++;
  if(event==='whiff')stats.whiffs++;
  if(event==='practice')stats.practiceConceded++;
}
export function matchSummary(s,stats){
  const won=s.phase==='won';let advice=s.level.lesson;
  if(!won&&stats.whiffs>=3)advice='下局先等击球框亮起，再出手。把第一球接稳。';
  else if(!won&&stats.saves>=3)advice='试试换个方向，或借侧墙绕过门将的封堵。';
  const highlight=stats.powerGoals>0?`重炮破门 ${stats.powerGoals} 次`:s.bestCombo>=3?`连续回击 ${s.bestCombo} 次`:s.goals>0?`攻破球门 ${s.goals} 次`:'下一球，稳稳接住。';
  return {won,title:won?(s.misses===0&&stats.practiceConceded===0?'零失球，漂亮拿下！':'好球，这局拿下！'):'差一点，再来一球。',
    action:won&&s.levelIndex<5?'next':'retry',actionLabel:won&&s.levelIndex<5?'挑战下一关':'再来一局',
    advice,highlight,goals:s.goals,target:s.level.goals,misses:s.misses,bestCombo:s.bestCombo,score:s.score,powerHits:stats.powerHits};
}
const paths={
  glove:'M13 28c-8-2-9-12-4-15 2-1 5 0 7 3V9c0-4 6-4 6 0V6c0-4 6-4 6 0v2c0-4 6-4 6 0v3c1-4 7-3 7 1v10c0 6-5 10-11 10H17zM17 32v5h14v-5',
  racket:'M27 25 14 38m6-8-4-4M38 5c7 5 5 15-1 20s-14 5-18 0-3-13 3-18 11-6 16-2ZM23 9l13 13m-17-5 12 11M30 5 18 21m19-11L23 27',
  sword:'m12 34 23-25 6-3-2 7-25 23M8 28l14 12M8 39l5-5M5 42l3-3',
  arrow:'M8 20h30m-11-11 11 11-11 11',
  trophy:'M15 6h18v12c0 7-4 11-9 11s-9-4-9-11V6Zm0 3H8v7c0 5 4 7 8 7m17-14h7v7c0 5-4 7-8 7M24 29v9m-8 0h16',
  shield:'M24 5 9 11v11c0 8 7 13 15 18 8-5 15-10 15-18V11L24 5Z',
  lock:'M15 20v-6a9 9 0 0 1 18 0v6M12 20h24v20H12V20Zm12 8v5',
  check:'m12 24 8 8 17-18',retry:'M12 12a16 16 0 1 1-4 19M12 4v12H1',
  home:'m6 22 18-16 18 16M12 18v22h9V28h7v12h9V18',spark:'m24 3 5 15 15 5-15 5-5 15-5-15-15-5 15-5 5-15Z'
};
export function icon(name){return `<svg viewBox="0 0 48 44" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.glove}"/></svg>`;}
// Per-gear contact feel: glove = punchy burst, racket = springy rings, sword = a slash arc.
const gearFeel={glove:{flash:'burst',color:'#ff6a2b',sound:'punch',motion:1},racket:{flash:'ring',color:'#ffd23f',sound:'string',motion:.8},sword:{flash:'slash',color:'#bff4ff',sound:'blade',motion:.9}};
export function hitFeel(weapon,kind){
  const g=gearFeel[weapon]||gearFeel.glove,k={soft:[.45,.16,.6],hit:[1,.22,1],perfect:[1.9,.28,1.5]}[kind]||[1,.18,1];
  return {...g,intensity:k[0],life:k[1],motion:g.motion*k[2]};
}
export function whiffHint(w){
  if(!w)return '挥空';
  return {early:'太早了 · 等球进框',late:'太晚了 · 球已过身',reach:w.side>0?'够不着 · 球在右边':'够不着 · 球在左边',none:'没有来球'}[w.reason]||'挥空';
}
// One short line per tutorial step; shown only while that step is active.
export const TUTORIAL_TIPS=['球来了：等它进框，按挥击打回去','球从侧边来：先移到影子上，再挥击','看门将站哪边，朝空的一侧打进去'];
