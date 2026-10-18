// v3: one extraction -> cumulative comparison -> unresolved reassembly.
// Pure state for global [1036,1540); original state outside, including both joins.
const old=require('./original/full-timeline.cjs');
const {stateCard,ease,lerp}=require('./scene.cjs');
const FPS=60,START_FRAME=1036,END_FRAME=1540,FRAMES=504;
const general={cx:960,cy:470,z:1};
const B=(a,b,c,d,q)=>Math.pow(1-q,3)*a+3*Math.pow(1-q,2)*q*b+3*(1-q)*q*q*c+q*q*q*d;
// Explicit per-second Hermite derivatives: pass intermediate views, stop at comparison.
const cameraKnots=[
 {t:19.1,cx:960,cy:470,z:1,v:[0,0,0]},
 {t:19.65,cx:850,cy:520,z:1.36,v:[110,60,.09]},
 {t:20.2,cx:1000,cy:550,z:1.45,v:[110,-45,-.12]},
 {t:20.85,cx:1020,cy:500,z:1.30,v:[-65,-70,-.08]},
 {t:21.25,cx:1000,cy:470,z:1.28,v:[0,0,0]},
 {t:22,cx:1000,cy:470,z:1.28,v:[0,0,0]},
 {t:22.65,cx:1060,cy:510,z:1.20,v:[-55,-5,-.03]},
 {t:23.45,cx:1000,cy:495,z:1.12,v:[-90,-35,-.10]},
 {t:24.05,cx:975,cy:478,z:1.04,v:[-45,-20,-.03]},
 {t:24.6,cx:960,cy:470,z:1,v:[0,0,0]},
];
function cameraAt(t){
 if(t<=cameraKnots[0].t||t>=cameraKnots.at(-1).t)return {...general};
 const i=cameraKnots.findIndex((k,j)=>j&&t<=k.t),a=cameraKnots[i-1],b=cameraKnots[i],dt=b.t-a.t,q=(t-a.t)/dt;
 const h00=2*q*q*q-3*q*q+1,h10=q*q*q-2*q*q+q,h01=-2*q*q*q+3*q*q,h11=q*q*q-q*q;
 const out={};['cx','cy','z'].forEach((key,j)=>{const av=key==='z'?Math.log(a[key]):a[key],bv=key==='z'?Math.log(b[key]):b[key];const v=h00*av+h10*dt*a.v[j]+h01*bv+h11*dt*b.v[j];out[key]=key==='z'?Math.exp(v):v;});return out;
}
function state(t){
 if(t<=START_FRAME/FPS||t>=24.6)return old.state(t);
 const s=old.state(t),pull=ease(t,18.65,19.25),sleeveOpen=ease(t,18.7,19.2);
 const receive=ease(t,22,22.65),statsOut=ease(t,19.05,19.65),makeRoom=ease(t,20.1,20.75);
 const timerOut=ease(t,19.8,20.95),buttonOut=ease(t,19.7,20.1),buttonFollow=ease(t,20.5,21.05);
 const statsHome=ease(t,22.65,23.45),timerHome=ease(t,23.15,24.15),timerDown=ease(t,22.7,23.2),buttonHome=ease(t,23.55,24.15),buttonDown=ease(t,23.85,24.35);
 // The sheet returns beneath still-readable candidates; their world positions
 // stay put until their own return. All remain parts of this same sheet.
 const receiveOffset=100*receive;
 const sx=(-140*statsOut-110*makeRoom+receiveOffset)*(1-statsHome);
 const sy=-30+(-40*statsOut-30*makeRoom)*(1-statsHome);
 const tx=lerp(B(-150,200,380,380,timerOut)+receiveOffset,-150,timerHome);
 const ty=lerp(B(220,220,220,0,timerOut),220,timerDown);
 // Continuous outward arc, then return; no collision threshold or hard release.
 const bx=lerp(230+260*buttonOut-110*buttonFollow+receiveOffset,230,buttonHome);
 const by=lerp(220+70*buttonOut-135*buttonFollow+165*ease(t,22.45,22.9),220,buttonDown);
 const parts=Math.max(statsOut*(1-statsHome),timerOut*(1-timerHome),buttonOut*(1-buttonDown));
 const p=stateCard('result',900+100*pull-receiveOffset,530-30*pull,.9+.1*pull,3,{
  approved:1,fix:0,parts,r:pull===0||pull===1?0:-3.2*Math.sin(Math.PI*pull),
  inspection:{stats:{x:sx,y:sy},timer:{x:tx,y:ty},button:{x:bx,y:by}},
 });
 const park=ease(t,19.2,19.75),enter=ease(t,17.3,17.8),noteHome=ease(t,23.8,24.6);
 s.cards=[p];s.cam=cameraAt(t);
 s.advice={...s.advice,x:lerp(900,lerp(1300,310,noteHome),park),y:lerp(lerp(-80,110,enter),lerp(280,118,noteHome),park),s:lerp(1,.67,park),opacity:enter};
 if(sleeveOpen<1)s.sleeve={x:900,y:530,s:.9,open:sleeveOpen};else delete s.sleeve;
 const feedback=ease(t,22.5,22.85)*(1-ease(t,25.55,25.7)),feedbackHome=ease(t,22.85,24.6);
 if(feedback>0)s.emptyFeedback={id:'empty-feedback',text:'…',x:lerp(p.x+780,1600,feedbackHome),y:lerp(p.y+120,620,feedbackHome),w:280,h:106,size:55,opacity:feedback};else delete s.emptyFeedback;
 return s;
}
const events=[
 [17.3,17.8,'原建议落定；完整文字从17.800开始可读'],
 [17.8,18.65,'保留建议阅读与未抽取结果的观察'],
 [18.65,19.25,'建议引发同一结果抽纸；后0.200秒统计块已开始脱出'],
 [18.7,19.2,'夹层随抽纸打开'],
 [19.05,19.65,'统计块先从同一纸面脱出并留下'],
 [19.2,19.75,'已读建议让出检查范围'],
 [19.7,21.05,'按钮先向外让出计时通路，随后跟到计时下方，只作为跟随部件'],
 [19.8,20.95,'计时沿连续弧线进入统计仍在的比较范围'],
 [20.1,20.75,'统计进一步让出共同检查空间，仍作为上一候选可辨'],
 [19.1,21.25,'镜头靠近统计、经过计时接管、拉开共同观察；内部节点不停车'],
 [21.25,22,'两个候选共同稳定观察；没有得出具体原因'],
 [22,22.65,'纸面先回接收位置；候选保持世界位置，镜头打开归位空间'],
 [22.5,22.85,'省略号在共同候选仍可辨且收回已开始时接入'],
 [22.65,23.45,'统计合回同一原槽；计时候选仍留下'],
 [22.7,24.15,'计时先下落离开统计回收通路，再合回原槽，和统计/反馈重叠'],
 [22.45,24.35,'按钮先为合回让出通路，再跟随回原位，非第三候选'],
 [22,24.6,'相机穿过回收中间构图，最终回原版整体取景'],
 [23.8,24.6,'建议和未决反馈一同回到原版整体布局'],
 [24.6,25.55,'反问附近全场停稳；字幕按原SRT'],
 [25.55,25.7,'原版省略号退场，保持原片接点'],
];
const joins=[18.65,19.05,19.25,19.65,19.7,19.8,20.1,20.75,20.8,20.95,21.25,22,22.5,22.65,22.85,22.45,22.7,22.9,23.15,23.2,23.45,23.55,23.8,23.85,24.15,24.35,24.6,25.55,...cameraKnots.map(k=>k.t)];
module.exports={state,events,cameraKnots,cameraAt,joins,FPS,START_FRAME,END_FRAME,FRAMES};
