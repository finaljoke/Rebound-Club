// Result share card: a 1080×1350 PNG drawn locally (no network, no third-party service) from the match summary.
// The card is rendered as soon as the result screen opens, so the tap can hand a ready file to the share sheet
// (Safari only allows sharing directly inside the tap).
const W=1080,H=1350,FONT='"PingFang SC","Microsoft YaHei","Noto Sans SC",Arial,sans-serif';

export function shareText(d){return `我在《反弹守卫》第 ${d.level} 关${d.won?'拿下了':'打进了'} ${d.goals}/${d.target} 球，得分 ${d.score}。来挑战我！`;}

export function renderShareCard(d){
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const text=(s,x,y,size,color,weight=700,align='left')=>{g.font=`${weight} ${size}px ${FONT}`;g.fillStyle=color;g.textAlign=align;g.fillText(s,x,y);};
  const round=(x,y,w,h,r,fill)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();};
  g.fillStyle='#f4f1e8';g.fillRect(0,0,W,H);
  // Brand row: the same ball mark as the page icon.
  round(72,72,96,96,28,'#ed6843');g.strokeStyle='#fff5da';g.lineWidth=5;g.beginPath();g.arc(120,120,26,0,Math.PI*2);g.moveTo(94,120);g.lineTo(146,120);
  g.moveTo(120,94);g.bezierCurveTo(101,109,101,131,120,146);g.moveTo(120,94);g.bezierCurveTo(139,109,139,131,120,146);g.stroke();
  text('反弹守卫',192,128,56,'#22463a',900);text('REBOUND CLUB',194,160,22,'#6f7f69',700);
  // Court panel with stripes and markings.
  g.save();g.beginPath();g.roundRect(72,220,W-144,800,44);g.clip();
  for(let i=0;i<10;i++){g.fillStyle=i%2?'#286659':'#2c6c5e';g.fillRect(72,220+i*80,W-144,80);}
  g.strokeStyle='#e0e6c3aa';g.lineWidth=5;g.strokeRect(132,280,W-264,680);g.beginPath();g.moveTo(132,620);g.lineTo(W-132,620);g.stroke();
  g.beginPath();g.arc(W/2,620,110,0,Math.PI*2);g.stroke();g.restore();
  text(`第 ${String(d.level).padStart(2,'0')} 关 · ${d.levelName}`,W/2,340,34,'#e4efd2',700,'center');
  text(d.title,W/2,440,64,'#fff9e3',900,'center');
  text(String(d.goals),W/2-30,690,230,'#ffffff',900,'right');text(`/ ${d.target} 球`,W/2-10,690,64,'#e4efd2',800,'left');
  if(d.highlight){g.font=`800 36px ${FONT}`;const w=g.measureText(d.highlight).width+80;round(W/2-w/2,770,w,72,36,d.won?'#ed6843':'#5a7a6c');text(d.highlight,W/2,818,36,'#fff9e3',800,'center');}
  // Stats.
  [[d.bestCombo,'最高连击'],[d.powerHits,'重炮击球'],[d.score,'本局得分']].forEach(([v,label],i)=>{const x=72+(W-144)/6*(1+i*2);text(String(v),x,1130,72,'#22463a',900,'center');text(label,x,1180,30,'#6f7f69',700,'center');});
  text('移动、挥击，守住自家球门 —— 来挑战我',W/2,1280,30,'#8b977f',700,'center');
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('share card')),'image/png'));
}

// Hands the ready card to the system share sheet when it accepts files, otherwise saves it as a download.
export async function shareCard(blob,d){
  const file=new File([blob],`rebound-club-level${d.level}.png`,{type:'image/png'});
  if(typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:'反弹守卫 · 战绩',text:shareText(d)});return 'shared';}
    catch(e){if(e?.name==='AbortError')return 'cancelled';}
  }
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);return 'saved';
}
