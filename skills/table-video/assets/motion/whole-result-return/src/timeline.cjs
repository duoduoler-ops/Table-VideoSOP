// SPDX-License-Identifier: MIT
const {E,clamp,lerp,bump}=require('../motion-math.cjs');
// Example-local constants, not defaults for a new project. Retiming requires redesign against its adopted audio.
const FPS=60,FRAMES=708,DURATION=FRAMES/FPS;
const P=(t,a,b,e=E.io)=>e(clamp((t-a)/(b-a)));
const sine=t=>(1-Math.cos(Math.PI*t))/2;
// Exact geometric camera interpolation from the adopted D07 mixCam; new targets below.
function mixCam(a,b,p){const z=a.z*Math.pow(b.z/a.z,p);const big=Math.abs(Math.log(b.z/a.z))>.3;const w=big?(1/a.z-1/z)/(1/a.z-1/b.z):p;return {cx:lerp(a.cx,b.cx,w),cy:lerp(a.cy,b.cy,w),z};}
const CAM=[
 [0,{cx:1600,cy:1130,z:1.42}], [.20,{cx:1600,cy:1130,z:1.42}],
 [.82,{cx:1600,cy:980,z:1.62}], [1.10,{cx:1600,cy:980,z:1.62}],
 [2.15,{cx:1010,cy:420,z:1.04}], [2.65,{cx:1010,cy:420,z:1.04}],
 [3.65,{cx:1160,cy:800,z:.68}], [6.35,{cx:1160,cy:800,z:.68}],
 [7.20,{cx:1300,cy:1080,z:.88}], [11.8,{cx:1300,cy:1080,z:.88}]
];
function camera(t){
 if(t>=1.10&&t<=2.15){const p=P(t,1.10,2.15,E.io),r=result(t);return {cx:r.x+lerp(-14,-220,p),cy:r.y+lerp(-190,-25,p),z:1.62*Math.pow(1.04/1.62,p)};}
 for(let i=1;i<CAM.length;i++){const [b,vb]=CAM[i],[a,va]=CAM[i-1];if(t<=b)return mixCam(va,vb,sine(clamp((t-a)/(b-a))));}return CAM.at(-1)[1];}
function arc(a,b,p,height){return {x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p)-4*height*p*(1-p)};}
function cubic(a,b,c,d,p){const q=1-p;return {x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};}
const OUTS=[{version:1,start:176/60,end:228/60,x:700,y:1170,r:-4},{version:2,start:295/60,end:343/60,x:1190,y:1170,r:0},{version:3,start:340/60,end:388/60,x:1680,y:1170,r:4}];
const SENDS=[{start:138/60,end:173/60},{start:258/60,end:291/60},{start:303/60,end:336/60}].map((s,i)=>({...s,id:'request-'+i,index:i}));
function result(t){
 const p=P(t,1.10,2.15,E.io),pre=P(t,.98,1.10,E.io);
 const q=t<1.1?{x:1600+14*pre,y:1170}:cubic({x:1614,y:1170},{x:1614,y:900},{x:1230,y:650},{x:1230,y:445},p);
 return {id:'result-original',version:0,...q,s:lerp(1,.16,p),r:-5*pre*(1-p),show:t<2.23};
}
function outputs(t){return OUTS.filter(o=>t>=o.start).map(o=>{
 const p=P(t,o.start,o.end,E.travel),q=cubic({x:1230,y:445},{x:1230,y:700},{x:o.x,y:o.y-250},{x:o.x,y:o.y},p);
 // Full sheet transfer, then short contact deformation and trailing corner response.
 const hit=bump(t,o.end,o.end+.05,o.end+.20),recover=bump(t,o.end+.20,o.end+.26,o.end+.36);
 return {...o,id:'version-'+o.version,...q,s:lerp(.16,1,p),r:lerp(-14,o.r,p),sx:1+.04*hit-.012*recover,sy:1-.04*hit+.012*recover,
  tail:18*bump(t,o.end+.10,o.end+.22,o.end+.40)-6*bump(t,o.end+.40,o.end+.48,o.end+.61),
  history:t>=(OUTS.find(x=>x.version===o.version+1)?.start??Infinity)};
 });}
function requests(t){return SENDS.filter(o=>t>=o.start&&t<o.end+.10).map(o=>{
 const p=P(t,o.start,o.end,E.io),q=cubic({x:730,y:350},{x:830,y:300},{x:1050,y:370},{x:1250,y:370},p);
 return {id:o.id,...q,s:lerp(1,.44,p),r:lerp(-6,0,p)};
});}
function pointer(t,expectY){
 if(t<1.1){const p=P(t,.10,.42,E.travel),q=P(t,.57,.88,E.travel);return {x:lerp(1795,1690,p)-46*q,y:lerp(1030,975,p)+56*q,scale:1,opacity:1-P(t,.98,1.10,E.reveal),press:0};}
 if(t<7.65)return {x:750,y:390,opacity:0,scale:1,press:0};
 const p=P(t,7.65,8.30,E.travel),release=P(t,550/60,9.48,E.travel);
 return {x:lerp(2230,2035,p)+50*release,y:lerp(760,expectY,p)+65*release,opacity:P(t,7.65,7.78,E.reveal)*(1-P(t,10.30,10.50,E.reveal)),scale:1,press:bump(t,8.30,8.38,8.48)};
}
function state(seconds){const t=clamp(seconds,0,DURATION),expectY=lerp(740,910,P(t,8.366667,9.166667,E.io));
 const pulse=Math.max(...SENDS.map(s=>bump(t,s.end+.05,s.end+.12,s.end+.30)),0);
 const acceptP=P(t,9.766667,10.35,E.travel),a=arc({x:2085,y:975},{x:2070,y:1145},acceptP,55);
 return {t,camera:camera(t),original:result(t),outputs:outputs(t),requests:requests(t),pulse,expectY,pointer:pointer(t,expectY),
  words:t>=4.20,wordIndex:t<4.88?0:t<5.53?1:2,requestHold:1-P(t,6.35,6.65,E.reveal),
  accept:{...a,s:lerp(.68,1,acceptP),show:t>=9.766667},
  focus: t<1.1?'问题近看':t<2.23?'整份退回':t<4.2?'请求与第一版出稿':t<6.47?'模糊请求继续产生版本':t<8.366667?'三版与期待共同可比':t<9.766667?'用户降低期待':'接受未改变的结果'};
}
const events=[
 ['original','return-start',1.10],['original','arrive-AI',2.15],
 ...SENDS.flatMap((x,i)=>[['request-'+i,'start',x.start],['request-'+i,'received',x.end]]),
 ...OUTS.flatMap(x=>[['version-'+x.version,'exit-start',x.start],['version-'+x.version,'land',x.end],['version-'+x.version,'body-settled',x.end+.36],['version-'+x.version,'corner-settled',x.end+.61]]),
 ['expectation','drag-start',8.366667],['expectation','arrive',9.166667],['accept','start',9.766667],['accept','settled',10.35],
 ...CAM.map(([time],i)=>['camera','key-'+i,time])
].map(([actor,event,time])=>({actor,event,localSeconds:Math.round(time*60)/60,localFrame:Math.round(time*60)}));
module.exports={FPS,FRAMES,DURATION,OUTS,SENDS,CAM,state,events,camera,P,E,arc,mixCam};
