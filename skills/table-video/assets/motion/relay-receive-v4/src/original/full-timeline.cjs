// Complete 32-second opening, built on the adopted editable design states.
// Original voice timing is fixed; later interval reuses the current-run pilot.
const {stateCard,lerp,ease,io,travel}=require('../scene.cjs');
const pilot=require('./pilot.cjs');
const FPS=60,START_FRAME=0,END_FRAME=1920;
const standard={cx:960,cy:470,z:1},focused={cx:1040,cy:470,z:1.08},comparison={cx:960,cy:470,z:.96};
const AI={x:1680,y:430,s:1};
const names=['高级一点','自然一点','好看一点'];
const mix=(a,b,p)=>Object.fromEntries(Object.keys(a).map(k=>[k,lerp(a[k],b[k],p)]));
const camera=(a,b,p)=>({...mix(a,b,p),z:a.z*Math.pow(b.z/a.z,p)});
const main=()=>stateCard('result',860,490,1,0);
const parkedReply={x:1535,y:160,s:.55};
const first=()=>stateCard('result',920,520,.85,1);
const second=()=>stateCard('result',1050,490,.8,2);
const third=()=>stateCard('result',1280,490,.7,3);
const hist1=()=>stateCard('history-1',410,550,.48,1,{r:-4});
const hist1small=()=>stateCard('history-1',310,500,.32,1,{r:-5});
const hist2small=()=>stateCard('history-2',670,550,.46,2,{r:-2});
const compare=()=>[stateCard('history-1',420,455,.46,1),stateCard('history-2',960,510,.46,2),stateCard('result',1500,565,.46,3)];
const selected=()=>[stateCard('history-1',130,560,.25,1,{r:-7}),stateCard('history-2',280,590,.28,2,{r:-4}),stateCard('result',900,500,.9,3)];
function cardMix(a,b,p){const out={...b};for(const k of ['x','y','s','r','opacity'])out[k]=lerp(a[k]??(k==='opacity'?1:0),b[k]??(k==='opacity'?1:0),p);return out;}
function resultOut(v,t,a,b,target){const p=ease(t,a,b,travel);return {...cardMix(stateCard('result',1680,450,.18,v,{r:3}),target,p),styleFrom:v-1,styleMix:ease(t,a+.05,b)};}
function labels(cards,opacity=1){return cards.map(p=>({x:p.x,y:p.y-330*p.s-66,text:names[p.version-1],opacity}));}
function request(t,v,a,b){const p=ease(t,a,b),u=1-p;return {id:'request-'+v,text:names[v-1],x:u*u*600+2*u*p*1140+p*p*1680,y:u*u*310+2*u*p*250+p*p*430,w:340,h:90,size:40,opacity:ease(t,a,a+.06),s:lerp(1,.7,p),fill:'#FFFDE5',stroke:'#E8D744'};}
const rounds=[{v:1,request:[7.78,8.16],out:[8.18,8.53]},{v:2,request:[8.73,9.08],out:[9.10,9.52]},{v:3,request:[9.66,10.03],out:[10.05,10.50]}];
function state(t){
 if(t>=17.266666666666666&&t<29.4)return pilot.state(t);
 if(t>=29.4){const s=pilot.state(29.4),p=ease(t,29.4,30),r=ease(t,29.4,29.78);s.cards[0]={...s.cards[0],x:lerp(900,960,p),y:lerp(500,570,p),s:lerp(1,.88,p),approved:1-r};s.advice={...s.advice,opacity:1-r};s.instruction={opacity:1-r,retract:r};s.channel=true;s.channelOpacity=ease(t,29.48,29.98);return s;}
 if(t<5.467){const reveal=ease(t,1.8,2.4),send=ease(t,3.7,4.2);return {cards:[main()],cam:camera({cx:1130,cy:220,z:2.25},standard,reveal),ai:AI,reply:{...mix({x:1130,y:220,s:1},{x:1500,y:230,s:.7},reveal),...mix(mix({x:1130,y:220,s:1},{x:1500,y:230,s:.7},reveal),{x:1470,y:415,s:.6},send)}};}
 if(t<7.78){const p=ease(t,5.467,6.2),park=ease(t,5.467,5.95);return {cards:p<1?[{...cardMix(main(),stateCard('result',1680,450,.18,0),p),r:-6*Math.sin(Math.PI*p)}]:[],cam:standard,ai:{...AI,pulse:p*(1-ease(t,6.35,6.75))},reply:mix({x:1470,y:415,s:.6},parkedReply,park),requestPanel:{x:260,y:230,text:'…',opacity:ease(t,5.55,5.95)}};}
 if(t<10.7){
  let cards=[];
  if(t>=8.18&&t<9.1)cards=[resultOut(1,t,8.18,8.53,first())];
  else if(t>=9.1&&t<10.05){const p=ease(t,9.1,9.52);cards=[cardMix({...first(),id:'history-1'},hist1(),p),resultOut(2,t,9.1,9.52,second())];}
  else if(t>=10.05){const p=ease(t,10.05,10.5);cards=[cardMix(hist1(),hist1small(),p),cardMix({...second(),id:'history-2'},hist2small(),p),resultOut(3,t,10.05,10.5,third())];}
  const active=rounds.find(r=>t>=r.request[0]&&t<r.request[1]);
  let pulse=0;for(const r of rounds){if(t>=r.request[0]&&t<r.out[1])pulse=ease(t,r.request[0],r.request[1])*(1-ease(t,r.out[0],r.out[1]));}
  const aiRetreat=ease(t,10.05,10.5);
  return {cards,cam:camera(standard,focused,ease(t,8.18,8.53)),ai:{...AI,pulse,s:lerp(1,.6,aiRetreat),opacity:lerp(1,.5,aiRetreat)},reply:parkedReply,requestPanel:t<8.05?{x:260,y:230,text:'…',opacity:1-ease(t,7.78,8.05)}:null,requests:active?[request(t,active.v,...active.request)]:[],versionLabels:labels(cards).map((l,i)=>({...l,opacity:ease(t,rounds[cards[i].version-1].out[0]+.12,rounds[cards[i].version-1].out[1])}))};
 }
 if(t<13.3){const p=ease(t,10.7,11.4),src=[hist1small(),hist2small(),third()],cards=src.map((c,i)=>cardMix(c,compare()[i],p));return {cards,cam:camera(focused,comparison,p),ai:{...AI,s:.6,opacity:.5*(1-ease(t,10.7,11.05))},reply:mix(parkedReply,{x:1740,y:190,s:.5},p),versionLabels:labels(cards)};}
 if(t<14.6){const p=ease(t,13.3,14.1),cards=compare().map((c,i)=>cardMix(c,selected()[i],p)),replyP=ease(t,13.85,14.25);cards[2].approved=ease(t,14.2,14.5);return {cards,cam:camera(comparison,standard,p),ai:{...AI,opacity:ease(t,13.3,13.62)},reply:{...mix({x:1740,y:190,s:.5},{x:1680,y:430,s:.4},replyP),opacity:1-ease(t,14.35,14.6)},versionLabels:labels(cards,1-ease(t,13.3,13.65))};}
 const p=ease(t,14.6,15.3),cards=selected();cards[2]={...cards[2],y:lerp(500,530,p),approved:1};
 for(let i=0;i<2;i++){cards[i].x-=420*p;cards[i].opacity=1-p;}
 return {cards:p===1?[cards[2]]:cards,cam:standard,sleeve:{x:900,y:530,s:.9,open:1-p},ai:{...AI,opacity:1-p}};
}
const events=[
 [0,1.8,'批准近读'],[1.8,2.4,'镜头拉开并露出界面'],[2.4,3.7,'看清任务与主次'],[3.7,4.2,'回复靠近发送口，收住'],[4.2,5.467,'犹豫停顿'],
 [5.467,6.2,'整份结果进入修改口'],[6.2,7.78,'没有具体修改对象'],
 ...rounds.flatMap(r=>[[...r.request,'请求进入：'+names[r.v-1]],[...r.out,'新结果出来、实际样式变化、历史退让：'+r.v]]),
 [10.7,11.4,'镜头拉开、三版展开'],[11.4,13.3,'共同问题比较'],[13.3,14.6,'历史退让、结果前移、批准发送'],[14.6,15.3,'进入采用夹层'],[15.3,17.266667,'妥协结果保持'],
 ...pilot.events,[29.4,30,'收线、界面让位、频道名出现'],[30,32,'欢迎及无字幕尾部保持']
];
module.exports={state,events,rounds,START_FRAME,END_FRAME,FPS};
