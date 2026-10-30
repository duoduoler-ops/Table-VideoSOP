// Only the approved design-risk interval, global 17.266667–29.400 seconds.
// This is not the complete 32-second animation.
const {stateCard,geometry,worldPoint,lerp,ease,io}=require('../scene.cjs');
const START_FRAME=1036,END_FRAME=1764,FPS=60;
function cameraMix(a,b,p){const z=a.z*Math.pow(b.z/a.z,p);return {cx:lerp(a.cx,b.cx,p),cy:lerp(a.cy,b.cy,p),z};}
function state(t){
 const open=ease(t,17.8,18.6),split=ease(t,20.4,21.1)*(1-ease(t,22.8,23.7));
 const p=stateCard('result',lerp(900,900,open),lerp(530,500,open),lerp(.9,1,open),3,{approved:1,parts:split,fix:ease(t,27.5,28.4)});
 const general={cx:960,cy:470,z:1},st={cx:700,cy:370,z:1.08},tm={cx:980,cy:775,z:2.38};
 let cam=general;
 if(t>=20.4&&t<21.1)cam=cameraMix(general,st,ease(t,20.4,21.1));
 else if(t>=21.1&&t<21.7)cam=st;
 else if(t>=21.7&&t<22.1)cam=cameraMix(st,tm,ease(t,21.7,22.1));
 else if(t>=22.1&&t<22.8)cam=tm;
 else if(t>=22.8&&t<23.7)cam=cameraMix(tm,general,ease(t,22.8,23.7));
 const noteSmall=ease(t,20.4,21.05),noteIn=ease(t,17.3,17.8);
 const s={cards:[p],cam,
  advice:{text:'把需求说具体',x:lerp(900,310,noteSmall),y:lerp(lerp(-80,110,noteIn),118,noteSmall),w:650,h:88,size:40,s:lerp(1,.67,noteSmall),opacity:noteIn},
  emptyFeedback:t>=23.7&&t<25.7?{text:'…',x:1600,y:620,w:280,h:106,size:55,opacity:ease(t,23.7,24.0)*(1-ease(t,25.55,25.7))}:null,
  purpose:ease(t,25.7,26.2)*(1-ease(t,27.15,27.5)),
  instruction:t>=26.2?{opacity:ease(t,26.2,26.55)}:null,
 };
 if(open<1)s.sleeve={x:900,y:530,s:.9,open};
 return s;
}
const events=[
 [17.3,17.8,'建议进入'],[17.8,18.6,'采用夹层打开，同一结果抽出'],[18.6,20.4,'建议阅读'],
 [20.4,21.1,'部件分离和统计近读'],[21.1,21.7,'统计阅读'],[21.7,22.1,'镜头转向计时'],[22.1,22.8,'计时与按钮阅读'],
 [22.8,23.7,'原位合回并拉开'],[23.7,25.667,'组合比较和反问'],[25.7,26.2,'任务对应计时'],[26.2,26.55,'具体批注进入'],
 [26.55,27.5,'读改法'],[27.5,28.4,'原位主次重排'],[28.4,29.4,'结果阅读']
];
module.exports={state,events,START_FRAME,END_FRAME,FPS};
