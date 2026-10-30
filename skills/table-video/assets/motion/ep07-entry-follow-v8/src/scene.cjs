'use strict';
// EP07 v08: explicit entrances and purposeful, compact camera moves.
// Source relations: EP05 D06 cardFlight/camS1 + task handoff; EP05 D04 pageXform/
// original-location rewrite; relay-v4 Hermite camera and preparation during comparison.
const {C,esc,iconMarkup,videoBody}=require('./mg-primitives.cjs');
const {cameraAt,CAMERA_EVENTS}=require('./camera.cjs');
const CONFIG={width:1920,height:1080,fps:60,duration:13.2};
const clamp=x=>Math.max(0,Math.min(1,x)),lerp=(a,b,q)=>a+(b-a)*q;
const processEase=q=>{q=clamp(q);return q<.5?4*q*q*q:1-Math.pow(-2*q+2,3)/2};
function bez(x1,y1,x2,y2){return x=>{x=clamp(x);if(x===0||x===1)return x;let lo=0,hi=1,s=x;for(let i=0;i<40;i++){s=(lo+hi)/2;const cx=3*x1*s*(1-s)**2+3*x2*s*s*(1-s)+s*s*s;if(cx<x)lo=s;else hi=s;}return 3*y1*s*(1-s)**2+3*y2*s*s*(1-s)+s*s*s;};}
const revealEase=bez(.16,1,.3,1),travelEase=bez(.22,.72,.22,1),slideEase=bez(.3,0,.25,1),dropEase=bez(.4,0,.6,.94);
const cameraEase=q=>.5-.5*Math.cos(Math.PI*clamp(q));
const p=(t,a,b)=>processEase((t-a)/(b-a));
const reveal=(t,a,b)=>revealEase(clamp((t-a)/(b-a)));
const move=(t,a,b)=>slideEase(clamp((t-a)/(b-a)));
const carry=(t,a,b)=>travelEase(clamp((t-a)/(b-a)));
const action=(id,objectId,start,end,extra={})=>({id,objectId,start,end,kind:'transfer',...extra});
const ACTIONS=[
 action('first-land','history-a-file',0,.42),action('reveal-repeat','history-1-rename',.28,.90,{kind:'camera'}),
 action('second-pass','second-working-file',1.10,2.75),action('extract-lift','operation-carrier',3.08,3.34),action('extract-copy','operation-carrier',3.34,4.08),
 action('follow-extract','operation-carrier',3.34,4.08,{kind:'camera'}),action('unbind-literal','detached-literal',4.35,5.05),
 action('open-input','generic-input',4.50,5.15,{kind:'process',channels:['height']}),action('connect-operations','recipe-link-0',5.49,5.69,{kind:'process',channels:['width']}),action('connect-operations-2','recipe-link-1',5.57,5.77,{kind:'process',channels:['width']}),
 action('script-lift','operation-carrier',6.05,6.32),action('receive-script','operation-carrier',6.32,7.10),action('prepare-c','working-file',6.82,7.56),
 action('run-c','working-file',7.56,9.12),
 action('backup-to-ai','backup-action',9.12,9.80),
 // Portable timing: ACTIONS/CHECKPOINTS/RELAYS here and camera.cjs CAMERA_EVENTS.
 // The 9.72–10.10 path reveal/notch deformation is implemented in frameAt below;
 // it is not opacity motion and this bbox-action list does not measure its pixels.
 action('append-backup','backup-action',10.12,10.88),action('close-backup-link','backup-connected-link',10.88,11.04,{channels:['width']}),
 action('send-copy','backup-copy',11.08,12.12),
];
const actionMap=Object.fromEntries(ACTIONS.map(a=>[a.id,a]));
const ap=(t,id)=>{const a=actionMap[id];const f=a.kind==='reveal'?revealEase:a.kind==='camera'?cameraEase:a.kind==='process'?processEase:a.id==='first-land'?dropEase:slideEase;return f(clamp((t-a.start)/(a.end-a.start)))};
// Cubic Hermite with explicit derivatives: internal observation points are traversed,
// only declared reading endpoints stop. No previous-frame cache or accumulated state.
function hermite(knots,t){
 if(t<=knots[0].t)return [...knots[0].v];if(t>=knots.at(-1).t)return [...knots.at(-1).v];
 const i=knots.findIndex((k,j)=>j&&t<=k.t),a=knots[i-1],b=knots[i],dt=b.t-a.t,q=(t-a.t)/dt;
 const h00=2*q*q*q-3*q*q+1,h10=q*q*q-2*q*q+q,h01=-2*q*q*q+3*q*q,h11=q*q*q-q*q;
 return a.v.map((v,j)=>h00*v+h10*dt*a.d[j]+h01*b.v[j]+h11*dt*b.d[j]);
}
const CAM=CAMERA_EVENTS;
const CARRIER=[
 {t:3.08,v:[385,490,1]}, {t:3.34,v:[385,450,1]}, {t:4.08,v:[1825,375,1]},
 {t:6.05,v:[1825,375,1]}, {t:6.32,v:[1825,351,1]}, {t:7.10,v:[2150,900,1]},
];
function carrierAt(t){
 if(t<3.08)return [385,490,1];
 if(t<3.34){const q=p(t,3.08,3.34);return [385,490-40*q,1];}
 if(t<4.08){const q=move(t,3.34,4.08);return [lerp(385,1825,q),lerp(450,375,q)-85*Math.sin(Math.PI*q),1];}
 if(t<6.05)return [1825,375,1];
 if(t<6.32)return [1825,375-24*p(t,6.05,6.32),1];
 const q=move(t,6.32,7.10);return [lerp(1825,2150,q),lerp(351,900,q),1];
}
const RELAYS=[
 ['first-to-next','first-land','second-pass','第一结果保持；拉开时下一份进入，受所选同一原声窗口约束。'],
 ['compare-to-ai','extract-copy','unbind-literal','同一条操作记录到AI，4.08完成取景；4.35在稳定近景中开始解绑，保留短暂辨认窗口。'],
 ['script-to-input','receive-script','prepare-c','原操作保持身份，接收区先准备C，脚本完整后才执行。'],
 ['reuse-to-backup','run-c','backup-to-ai','归档原件成立后，既有待备份卡接管。'],
 ['append-to-copy','append-backup','send-copy','新增端口必须先闭合；保留原件，产生副本。'],
].map(([id,fromAction,toAction,reason])=>({id,fromAction,toAction,reason}));
const CHECKPOINTS=[
 {id:'repeat-readable',time:2.9,objectIds:['history-1-rename','history-2-rename'],role:'hold',exception:'比较两次同一操作；提取于3.08启动'},
 {id:'extract-pass',time:3.75,objectIds:['operation-carrier'],role:'pass'},
 {id:'general-input-read',time:5.65,objectIds:['generic-input','recipe-rename'],role:'hold',exception:'辨认具体输入已变通用，连接随后接力'},
 {id:'script-pass',time:6.85,objectIds:['operation-carrier'],role:'pass'},
 {id:'c-pass',time:8.25,objectIds:['working-file'],role:'pass'},
 {id:'backup-pass',time:10.50,objectIds:['backup-action'],role:'pass'},
 {id:'copy-pass',time:11.60,objectIds:['backup-copy'],role:'pass'},
 {id:'final-comparison',time:12.6,objectIds:['working-file','backup-copy'],role:'hold',exception:'12.56拉全景完成，原件和副本、新旧步骤共同比较，至13.2结束'},
];
const txt=(x,y,s,size=28,color=C.ink,weight=500,anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${esc(s)}</text>`;
const rect=(w,h,fill=C.surface,stroke=C.line,r=16)=>`<rect width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>`;
// Production uses sharp/librsvg: normalized pathLength + round dash caps painted
// the whole path at every progress. Draw an actual path prefix instead.
const lineCache=new Map();
function linePrefix(d,q){
 if(typeof d!=='string'||!Number.isFinite(q))throw Error('Invalid revealed path or progress');
 // Fail closed on unsupported SVG syntax; matching only known tokens would
 // silently drop Q/A/Z or lowercase commands and draw a different path.
 const unsupported=d.replace(/[MLHVC]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+/g,'');
 if(unsupported)throw Error('Unsupported revealed path syntax: '+unsupported);
 if(q<=0)return '';if(q>=1)return d;
 let data=lineCache.get(d);
 if(!data){
  const tokens=d.match(/[MLHVC]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  const pts=[];let i=0,x=0,y=0,cmd='';
  while(i<tokens.length){
   if(/^[MLHVC]$/.test(tokens[i]))cmd=tokens[i++];
   const num=()=>{const n=Number(tokens[i++]);if(!Number.isFinite(n))throw Error('Invalid line path: '+d);return n;};
   if(cmd==='M'||cmd==='L'){x=num();y=num();pts.push({x,y,move:cmd==='M'});if(cmd==='M')cmd='L';}
   else if(cmd==='H'){x=num();pts.push({x,y});}
   else if(cmd==='V'){y=num();pts.push({x,y});}
   else if(cmd==='C'){
    const x0=x,y0=y,x1=num(),y1=num(),x2=num(),y2=num(),x3=num(),y3=num();
    for(let k=1;k<=96;k++){const t=k/96,u=1-t;pts.push({x:u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,y:u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3});}
    x=x3;y=y3;
   }else throw Error('Unsupported revealed path: '+d);
  }
  let length=0;const segments=[];
  for(let k=1;k<pts.length;k++){if(pts[k].move)continue;const a=pts[k-1],b=pts[k],len=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,len});length+=len;}
  data={segments,length};lineCache.set(d,data);
 }
 let remain=data.length*q,out='',last;
 const point=p=>p.x.toFixed(4)+' '+p.y.toFixed(4);
 for(const s of data.segments){
  if(!last||last!==s.a)out+='M'+point(s.a);
  const take=Math.min(remain,s.len),v=s.len?take/s.len:0,b={x:lerp(s.a.x,s.b.x,v),y:lerp(s.a.y,s.b.y,v)};
  out+='L'+point(b);remain-=take;last=s.b;if(remain<=1e-8)break;
 }
 return out;
}
const line=(d,color=C.system,sw=3,dash='',reveal=1)=>{const path=linePrefix(d,reveal);return path?`<path d="${path}" fill="none" stroke="${color}" stroke-width="${sw}"${dash?` stroke-dasharray="${dash}"`:''}/>`:'';};
function frameAt(t){
 t=Math.max(0,Math.min(CONFIG.duration,t));const pieces=[],objects=[];
 const put=(id,x,y,w,h,body,{opacity=1,scale=1,scaleY=1,z=5,kind='graphic'}={})=>{if(opacity<=0||scale<=0||scaleY<=0)return;pieces.push({id,x,y,w,h,body,opacity,scale,scaleY,z});objects.push({id,x,y,w:w*scale,h:h*scale*scaleY,opacity,scale,scaleY,kind});};
 const file=(id,x,y,name,variant,opts={})=>put(id,x,y,100,210,videoBody({w:100,h:115,variant})+txt(50,196,name,27,C.ink,500,'middle'),{kind:'file',z:11,...opts});
 const node=(id,x,y,type,label,rule='',opts={})=>put(id,x,y,200,170,rect(200,170)+iconMarkup(type,100,53,1.05,opts.accent||C.system)+txt(100,111,label,32,C.ink,600,'middle')+(rule?txt(100,150,rule,25,C.muted,400,'middle'):''),{kind:'step',z:8,...opts});
 const folder=(id,x,y,label,opts={})=>{put(id+'-back',x,y,150,140,`<path d="M0 48V24Q0 17 9 17H45L58 34H141Q150 34 150 43V140H0Z" fill="#F9F6EE" stroke="${C.system}" stroke-width="2.6"/>`,{z:9,...opts});put(id+'-front',x,y,150,244,`<path d="M0 86H150V140Q150 148 140 148H10Q0 148 0 138Z" fill="#F9F6EE" stroke="${C.system}" stroke-width="2.6"/>${line('M50 117H100')}${txt(75,238,label,27,C.muted,400,'middle')}`,{z:12,...opts});};
 const pill=(id,x,y,w,s,opts={})=>put(id,x,y,w,65,rect(w,65,C.surface,opts.accent||C.system,12)+txt(w/2,43,s,29,opts.accent||C.system,500,'middle'),{z:10,kind:'parameter',...opts});
 // Two completed runs remain independent historical evidence, never snapshots of main.
 const headingQ=p(t,1.12,1.45)*(1-p(t,2.95,3.20));
 if(headingQ>0)put('history-heading',140,150,1200*headingQ,65,'<defs><clipPath id="history-title-mask"><rect width="'+1200*headingQ+'" height="65"/></clipPath></defs><g clip-path="url(#history-title-mask)">'+txt(0,52,'重复的步骤，只搭一次',48,C.ink,600)+'</g>');
 for(let row=0;row<2;row++){
  const y=350+row*300,labelQ=row?reveal(t,.82,1.12):1;
  if(labelQ>0)put(`history-label-${row}`,140,y-48,220*labelQ,50,'<defs><clipPath id="row-label-'+row+'"><rect width="'+220*labelQ+'" height="50"/></clipPath></defs><g clip-path="url(#row-label-'+row+')">'+txt(0,32,`第 ${row+1} 次`,30,C.system)+'</g>');
  if(!row)file('history-input-0',150,y+18,'素材A.mov','A');
  else if(t>=.8){const entry=move(t,.8,1.10);file('history-input-1',lerp(-850,150,entry),y+18,'素材B.mov','B');}
  ['rename','transcode','archive'].forEach((type,j)=>{
   const start=.54+j*.09,q=row?move(t,start,start+.48):1;
   // The second row is an actual copy peeling from the first; it is never born in a new empty slot.
   if(!row||t>=start)node(`history-${row+1}-${type}`,420+240*j,row?lerp(350,y,q):y,type,['命名','转码','归档'][j]);
   const linkQ=row?p(t,.94+j*.10,1.14+j*.10):1;
   if(j<2&&linkQ>0)put(`history-link-${row}-${j}`,620+240*j,y+82,40*linkQ,5,line('M0 0H40',C.line,3,'',linkQ),{z:1});
  });
  const folderQ=row?move(t,.82,1.20):1;
  if(!row||t>=.82)folder(`history-folder-${row}`,1200,row?lerp(385,y+35,folderQ):y+35,'已归档');
  if(row===0)file('history-a-file',1225,lerp(270,370,ap(t,'first-land')),'01.mp4','A');
  else if(t>=2.75)file('second-working-file',1225,670,'02.mp4','B');
 }
 const historyReceive=move(t,6.32,7.10),hbX=lerp(1540,3300,historyReceive),hbY=lerp(385,720,historyReceive)-400*Math.sin(Math.PI*historyReceive);
 folder('first-backup',hbX,hbY,t<6.14?'备份':'第1次备份');file('first-backup-file',hbX+25,hbY-15,'01.mp4','A');
 if(t>=1.1&&t<2.75){const q=ap(t,'second-pass');file('second-working-file',lerp(150,1225,q),668-112*Math.sin(Math.PI*q)+2*q,q<.34?'素材B.mov':q<.68?'02.mov':'02.mp4','B');}
 const compare=p(t,2.48,2.78)*(1-p(t,3.12,3.65));put('repetition-region',400,332,720,510,`<rect width="720" height="510" rx="22" fill="${C.status}" fill-opacity=".36" stroke="${C.action}" stroke-width="3" stroke-dasharray="10 10"/>`,{opacity:compare,z:2});
 // AI receiver is one object. It receives the original strip and later folds to a compact
 // editing station before the next card arrives, following v4 receiving-first principle.
 const aiPack=move(t,6.32,7.10),aiOpen=p(t,2.80,3.34),ax=lerp(1720,2520,aiPack),ay=lerp(190,660,aiPack),aw=lerp(1080,500,aiPack),ah=lerp(680,265,aiPack);
 if(aiOpen>0)put('ai-workbench',ax,ay,aw,ah*aiOpen,'<defs><clipPath id="ai-unfold"><rect width="'+aw+'" height="'+ah*aiOpen+'"/></clipPath></defs><g clip-path="url(#ai-unfold)">'+rect(aw,ah,C.card,C.system,22)+txt(35,58,'AI',40,C.system,600)+line(`M0 86H${aw}`,C.line,2)+'</g>',{z:2});
 if(t>=3.08){
  const [sx,sy]=carrierAt(t),born=1,wrap=p(t,3.08,3.34),opening=p(t,4.50,5.15),align=p(t,4.82,5.40),ports=p(t,5.10,5.48),fold=p(t,5.58,6.18),layout=p(t,5.72,6.22);
  const front=t<6.05?30:4;
  const height=lerp(420,395,layout),corner=42*fold;
  const base='<path d="M0 16Q0 0 16 0H'+(800-corner)+'L800 '+corner+'V'+(height-16)+'Q800 '+height+' 784 '+height+'H16Q0 '+height+' 0 '+(height-16)+'Z" fill="'+C.surface+'" stroke="'+C.system+'" stroke-width="2.6"/>';
  if(wrap>0)put('operation-carrier',sx,sy,800,height*wrap,'<defs><clipPath id="carrier-wrap"><rect y="'+height*(1-wrap)+'" width="800" height="'+height*wrap+'"/></clipPath></defs><g clip-path="url(#carrier-wrap)">'+base+'</g>',{z:front});
  // One material seat: the filled chip leaves it; its opening expands physically.
  const slotW=lerp(405,360,opening),slotH=lerp(65,130,opening),lip=28*opening;
  const aperture=90*opening;
  const slotBody='<path d="M'+lip+' 0H'+(slotW-16)+'Q'+slotW+' 0 '+slotW+' 16V'+(slotH-16)+'Q'+slotW+' '+slotH+' '+(slotW-16)+' '+slotH+'H'+lip+'" fill="'+C.canvas+'" stroke="'+C.system+'" stroke-width="3"/>'+line('M0 0V'+(slotH/2-aperture/2)+'H'+lip+'M0 '+slotH+'V'+(slotH/2+aperture/2)+'H'+lip,C.system,3);
  if(wrap>0)put('generic-input',sx+35,sy+22,slotW*wrap,slotH,'<defs><clipPath id="seat-wrap"><rect width="'+slotW*wrap+'" height="'+slotH+'"/></clipPath></defs><g clip-path="url(#seat-wrap)">'+slotBody+'</g>',{z:front+2,kind:'input-seat'});
  const historyRetreat=300*move(t,6.32,7.10);
  // Keep the original input in the history; peel a thumbnail reference from that exact source.
  if(t>=3.34){const refMove=move(t,3.34,4.20);put('source-history-input',lerp(150,1640,refMove)-historyRetreat,lerp(668,690,refMove)+75*Math.sin(Math.PI*refMove),100,115,videoBody({w:100,h:115,variant:'B'}),{z:14});}
  const chipQ=move(t,4.35,5.05),chipX=t<4.35?sx+35:lerp(1860,1540,chipQ)-historyRetreat,chipY=t<4.35?sy+22:lerp(397,825,chipQ)-110*Math.sin(Math.PI*chipQ);
  if(wrap>0)put('detached-literal',chipX,chipY,405*wrap,65,'<defs><clipPath id="chip-wrap"><rect width="'+405*wrap+'" height="65"/></clipPath></defs><g clip-path="url(#chip-wrap)">'+rect(405,65,C.surface,chipQ?C.muted:C.system,12)+txt(202.5,43,'输入：素材B.mov',29,chipQ?C.muted:C.system,500,'middle')+'</g>',{z:front+5,kind:'parameter'});
  const labelWidth=320*opening;
  put('input-seat-label',sx+35+lerp(25,135,opening),sy+42,200,42,'<defs><clipPath id="input-label-mask"><rect width="'+labelWidth+'" height="45"/></clipPath></defs><g clip-path="url(#input-label-mask)">'+txt(0,31,'输入素材',29,C.system)+'</g>',{z:front+4,opacity:born});
  const lift=p(t,3.08,3.34),ys=[160,lerp(160,183,lift),lerp(160,148,lift)],xs=[35,lerp(275,300,lift),lerp(515,565,lift)];
  ['rename','transcode','archive'].forEach((type,j)=>{
    const nx=sx+lerp(xs[j],35+236*j,align),ny=sy+lerp(ys[j],195,align);
    const left=12*ports,right=48*ports;
    const outline='<path d="M16 0H184Q200 0 200 16V70H'+(200+right)+'V110H200V154Q200 170 184 170H16Q0 170 0 154V110H'+left+'V70H0V16Q0 0 16 0Z" fill="'+C.surface+'" stroke="'+C.system+'" stroke-width="2.6"/>';
    const ruleQ=p(t,4.90,5.45);let rule='';
    if(j===0)rule='<defs><clipPath id="rename-rule-mask"><rect x="14" y="126" width="172" height="36"/></clipPath></defs><g clip-path="url(#rename-rule-mask)">'+txt(100,151-36*ruleQ,'02.mov',25,C.muted,400,'middle')+txt(100,187-36*ruleQ,'按编号命名',25,C.muted,400,'middle')+'</g>';
    else rule=txt(100,150,j===1?'转成 MP4':'原归档位置',25,C.muted,400,'middle');
    const ruleMask='<defs><clipPath id="rule-enter-'+j+'"><rect x="10" y="123" width="'+180*wrap+'" height="42"/></clipPath></defs><g clip-path="url(#rule-enter-'+j+')">'+rule+'</g>';
    put('recipe-'+type,nx,ny,200+right,170,outline+iconMarkup(type,100,53,1.05)+txt(100,111,['命名','转码','归档'][j],32,C.ink,600,'middle')+ruleMask,{z:front+3,opacity:born,kind:'step'});
    if(j<2){const q=p(t,5.49+j*.08,5.69+j*.08);put('recipe-link-'+j,nx+200,ny+90,48*q,5,line('M0 0H48',C.system,3,'',q),{opacity:born,z:front+4});}
  });
  // Upper and lower paper flaps really swing around their hinges. The same strip
  // remains inside; icon windows are foreground cut-outs, not a replaced result.
  if(t>=5.58){
   const top=t<5.76?lerp(0,-90,p(t,5.58,5.76)):lerp(-90,18,p(t,5.76,6.06));
   const bottom=t<5.90?lerp(height,height+90,p(t,5.72,5.90)):lerp(height+90,height-18,p(t,5.90,6.20));
   put('script-upper-fold',sx,sy,800,Math.abs(top),'<path d="M0 0H800L'+(800-52*fold)+' '+top+'H'+(20*fold)+'Z" fill="'+(top<0?C.canvas:C.card)+'" stroke="'+C.system+'" stroke-width="2.6"/>',{z:front+1});
   put('script-lower-fold',sx,sy,800,Math.max(height,bottom),'<path d="M0 '+height+'H800L780 '+bottom+'H20Z" fill="'+C.card+'" stroke="'+C.system+'" stroke-width="2.6"/>',{z:front+1});
   put('script-corner',sx+758,sy,42,42,'<path d="M0 0V42H42Z" fill="'+C.canvas+'" stroke="'+C.system+'" stroke-width="2.6"/>',{z:front+2,scale:fold});
   put('script-label',sx+500,sy+26,260,45,'<defs><clipPath id="script-name-mask"><rect width="'+(260*fold)+'" height="45"/></clipPath></defs><g clip-path="url(#script-name-mask)">'+txt(0,33,'流程脚本',30,C.system,600)+'</g>',{z:front+2});
  }
 }
 // Final receiver exists before script arrives. Its growth only admits the real new step.
 const ready=p(t,6.45,7.08),extend=p(t,10.12,10.88),panelW=lerp(900,1250,extend);
 if(ready>0)put('fixed-flow-panel',2090,895,panelW,700*ready,'<defs><clipPath id="receiver-unfold"><rect width="'+panelW+'" height="'+700*ready+'"/></clipPath></defs><g clip-path="url(#receiver-unfold)">'+rect(panelW,700,C.card,C.line,24)+'</g>',{z:1});
 const fixedTitle=p(t,6.66,7.06);
 if(fixedTitle>0)put('fixed-flow-heading',2130,825,500*fixedTitle,65,'<defs><clipPath id="fixed-title-reveal"><rect width="'+500*fixedTitle+'" height="65"/></clipPath></defs><g clip-path="url(#fixed-title-reveal)">'+txt(0,48,'固定流程',42,C.ink,600)+'</g>',{z:2});
 const cReady=ap(t,'prepare-c');
 const CP=[{t:7.56,v:[2030,932,1],d:[0,0,0]},{t:7.9,v:[2225,932,.82],d:[480,240,-.9]},{t:8.15,v:[2250,1110,.58],d:[520,100,0]},{t:8.50,v:[2486,1110,.58],d:[760,0,0]},{t:8.80,v:[2722,1110,.58],d:[450,180,.6]},{t:9.12,v:[2785,1300,1],d:[0,0,0]}];
 const fp=t<7.56?[lerp(1350,2030,cReady),lerp(1110,932,cReady),1]:hermite(CP,t),fx=fp[0],fy=fp[1],fscl=fp[2];
 const filename=t<8.2?'素材C.mov':t<8.62?'03.mov':'03.mp4';
 if(t>=6.82){
  const labelOn=1-p(t,7.78,7.92)+p(t,8.91,9.12);
  const body=videoBody({w:100,h:115,variant:'C'})+txt(50,17,t<8.62?'MOV':'MP4',11,C.system,600,'middle')+'<g opacity="'+labelOn+'">'+txt(50,196,filename,27,C.ink,500,'middle')+'</g>';
  put('working-file',fx,fy,100,210,body,{scale:fscl,z:11,kind:'file'});
 }
 const archiveOpen=p(t,6.72,7.12),backupOpen=p(t,6.85,7.25);
 folder('archive-final',2760,1315+140*(1-archiveOpen),'归档原件',{scaleY:archiveOpen});folder('backup-final',3150,1315+140*(1-backupOpen),'备份副本',{scaleY:backupOpen});
 // The same physical input seat feeds the first operation, then each joined port.
 const routeIn=p(t,6.86,7.30),routeOut=p(t,7.00,7.36);
 if(routeIn>0)put('execution-route',2169,1052,56,133,line('M56 0V28H0V133H28',C.system,3,'',routeIn),{z:6});
 if(routeOut>0)put('execution-output-route',2885,1185,20,167,line('M20 0V167H0',C.system,3,'',routeOut),{z:6});
 const ba=ap(t,'backup-to-ai'),bb=ap(t,'append-backup'),backupEnter=move(t,6.86,7.24);let bx=lerp(3920,3100,backupEnter),by=1040;
 if(t>=9.12&&t<10.12){bx=lerp(3100,2700,ba);by=lerp(1040,745,ba)-75*Math.sin(Math.PI*ba);}
 if(t>=10.12){bx=lerp(2700,3100,bb);by=lerp(745,1095,bb)-65*Math.sin(Math.PI*bb);}
 const backupPort=p(t,9.72,10.10),notch=12*backupPort;
 const backupBody='<path d="M16 0H184Q200 0 200 16V154Q200 170 184 170H16Q0 170 0 154V110H'+notch+'V70H0V16Q0 0 16 0Z" fill="'+C.surface+'" stroke="'+C.action+'" stroke-width="2.6"/>';
 const roll=p(t,9.72,10.10),blabel='<defs><clipPath id="backup-rule-mask"><rect x="10" y="125" width="180" height="38"/></clipPath></defs><g clip-path="url(#backup-rule-mask)">'+txt(100,151-38*roll,'待备份',25,C.muted,400,'middle')+txt(100,189-38*roll,'归档文件输入',25,C.muted,400,'middle')+'</g>';
 if(t>=6.86)put('backup-action',bx,by,200,170,backupBody+iconMarkup('backup',100,53,1.05,C.action)+txt(100,111,'备份',32,C.ink,600,'middle')+blabel,{z:8,kind:'step'});
 if(t>=9.72&&t<10.45)put('backup-input-binding',0,0,3200,1352,line('M2885 1352C3200 1340 3150 830 2712 835',C.action,3,'',p(t,9.72,10.10)),{opacity:1-p(t,10.26,10.45),z:6});
 const linked=p(t,10.88,11.04);put('backup-connected-link',2905,1185,207*linked,8,line('M0 0H207',C.action,4,'',linked),{opacity:linked>0?1:0,z:7});
 const dataRoute=p(t,11.04,11.32);
 if(dataRoute>0)put('backup-data-route',2860,1370,300*dataRoute,6,line('M0 0H300',C.action,3,'',dataRoute),{z:3});
 if(t>=11.08){const q=ap(t,'send-copy');file('backup-copy',lerp(2785,3175,q),1300-95*Math.sin(Math.PI*q),'03.mp4','C');}
 const copyProgress=ap(t,'send-copy');
 const cam=cameraAt(t,{carrier:carrierAt(t),copy:[lerp(2785,3175,copyProgress),1300-95*Math.sin(Math.PI*copyProgress)]}),camera={cx:cam[0],cy:cam[1],z:cam[2],x:cam[0]-960/cam[2],y:cam[1]-540/cam[2],w:1920/cam[2],h:1080/cam[2]};
 pieces.sort((a,b)=>a.z-b.z);
 const defs=`<defs><radialGradient id="paper"><stop offset="0" stop-color="#FFFFFD"/><stop offset="1" stop-color="${C.canvas}"/></radialGradient></defs>`;
 const groups=pieces.map(o=>`<g id="${o.id}" transform="translate(${o.x} ${o.y}) scale(${o.scale} ${o.scale*o.scaleY})" opacity="${o.opacity}">${o.body}</g>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${defs}<rect width="1920" height="1080" fill="url(#paper)"/><g font-family="Segoe UI, Microsoft YaHei, sans-serif" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(960 540) scale(${camera.z}) translate(${-camera.cx} ${-camera.cy})">${groups}</g>${txt(1840,1030,'流程示意',24,C.muted,400,'end')}</g></svg>`;
 return {svg,objects,camera,events:{scriptReady:t>=7.5,backupConnected:t>=11.04,backupCopyExists:t>=11.08}};
}
module.exports={CONFIG,frameAt,ACTIONS,CHECKPOINTS,RELAYS,CAM,CARRIER,hermite,cameraAt,carrierAt,linePrefix};
