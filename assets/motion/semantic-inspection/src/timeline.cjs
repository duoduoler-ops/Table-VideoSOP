// Controlled motion reinforcement. Same V3, original audio, curves and final hold.
const {clamp,lerp,E,bump}=require('./motion-math.cjs');
const FPS=60,FRAMES=504,DURATION=8.4;
const P=(t,a,b,e=E.io)=>e(clamp((t-a)/(b-a)));
function mixCam(a,b,p){const z=a.z*Math.pow(b.z/a.z,p),big=Math.abs(Math.log(b.z/a.z))>.3,w=big?(1/a.z-1/z)/(1/a.z-1/b.z):p;return {cx:lerp(a.cx,b.cx,w),cy:lerp(a.cy,b.cy,w),z};}
const A={cx:1100,cy:535,z:1.1},B={cx:870,cy:520,z:1.32},W={cx:850,cy:520,z:1.3},C={cx:1370,cy:530,z:.98};
function camera(t){if(t<1.4)return {...A};if(t<1.9)return mixCam(A,B,P(t,1.4,1.9));if(t<5.1)return {...B};if(t<5.45)return mixCam(B,W,P(t,5.1,5.45));if(t<5.6666666667)return {...W};if(t<6.85)return mixCam(W,C,P(t,5.6666666667,6.85));return {...C};}
function cubic(a,b,c,d,p){const q=1-p;return{x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};}
const SMALL={x:-62,y:-155,w:108,h:100},MEDIUM={x:-178,y:-215,w:356,h:330},WHOLE={x:-214,y:-274,w:428,h:548};
const mixRect=(a,b,p)=>Object.fromEntries(['x','y','w','h'].map(k=>[k,lerp(a[k],b[k],p)]));
const mixPose=(a,b,p)=>({x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p),s:a.s*Math.pow(b.s/a.s,p),r:lerp(a.r,b.r,p)});
const POSES={start:{x:850,y:535,s:1,r:4},taken:{x:935,y:540,s:1.12,r:0},inspect:{x:790,y:545,s:1.1,r:-6},local:{x:825,y:529,s:1.1,r:-3},wider:{x:925,y:510,s:1.02,r:2}};
function inspectionPose(t){const p=POSES;if(t<1.7)return p.start;if(t<2.2)return mixPose(p.start,p.taken,P(t,1.7,2.2,E.travel));if(t<3.1333333333)return p.taken;if(t<3.55)return mixPose(p.taken,p.inspect,P(t,3.1333333333,3.55,E.travel));if(t<4.0666666667)return p.inspect;if(t<4.4)return mixPose(p.inspect,p.local,P(t,4.0666666667,4.4,E.travel));if(t<4.55)return p.local;if(t<5.0166666667)return mixPose(p.local,p.wider,P(t,4.55,5.0166666667));if(t<5.1)return p.wider;if(t<5.45)return mixPose(p.wider,p.start,P(t,5.1,5.45));return p.start;}
const captions=[[0,1.4,'这个时候总有人跳出来说'],[1.4,3.133,'你得把需求说具体'],[3.133,4.033,'道理我都懂'],[4.067,5.667,'可很多时候 我连问题出在哪'],[5.667,7.233,'该用什么词说都不知道'],[7.233,8.4,'怎么具体？']];
function selection(t){if(t<4.0666666667)return null;if(t<4.4)return {...SMALL,w:108*P(t,4.0666666667,4.4,E.travel),h:100*P(t,4.0666666667,4.4,E.travel)};if(t<4.55)return {...SMALL};if(t<5.0166666667)return mixRect(SMALL,MEDIUM,P(t,4.55,5.0166666667));if(t<5.1)return {...MEDIUM};if(t<5.45)return mixRect(MEDIUM,WHOLE,P(t,5.1,5.45));return {...WHOLE};}
function state(seconds){const t=clamp(seconds,0,DURATION),attach=P(t,5.85,6.65,E.travel),q=cubic({x:850,y:535},{x:900,y:440},{x:985,y:485},{x:1000,y:570},attach),r=selection(t),a=P(t,.15,.8,E.travel),refocus=P(t,5.6666666667,6.35);
 const pose=t<5.85?inspectionPose(t):{...q,s:Math.pow(.73,attach),r:lerp(4,0,attach)};
 const paper={id:'version-3',version:3,...pose};
 let cursor=null;if(t>=3.1333333333&&t<6.1){const cp=P(t,3.1333333333,4.0666666667,E.travel);cursor=r?{x:r.x+r.w,y:r.y+r.h,opacity:1-P(t,5.85,6.1,E.reveal)}:{x:lerp(242,SMALL.x,cp),y:lerp(85,SMALL.y,cp),opacity:P(t,3.1333333333,3.3,E.reveal)};}
 const text=t<6.4?'':t<6.55?'不':t<6.7?'不对':t<6.85?'不对劲':t<7.0?'不对劲…':'不对劲……';
 return{t,paper,camera:camera(t),selection:r,selectionOpacity:1-P(t,6.65,6.9,E.reveal),cursor,
 advice:{x:lerp(1750,1430,a),y:lerp(310,190,refocus),r:-5*(1-a)+1.5*bump(t,.8,.8666666667,1.0833333333),opacity:(1-P(t,1.4,1.8,E.reveal))+P(t,6.55,6.85,E.reveal)},
 feedback:P(t,5.6666666667,6.1,E.reveal),feedbackText:text,caption:captions.find(([b,e])=>t>=b&&t<e)?.[2]||''};
}
const raw=[['version-3','same-unmodified-result-established',0],['advice','approach-start',.15],['advice','arrive',.8],['advice','settled',1.0833333333],['camera','approach-result-start',1.4],['version-3','take-nearer-start',1.7],['camera','inspection-view-settled',1.9],['version-3','take-nearer-settled',2.2],['version-3','local-inspection-reposition-start',3.1333333333],['cursor','search-approach-start',3.1333333333],['version-3','local-inspection-reposition-settled',3.55],['selection','local-drag-start',4.0666666667],['version-3','local-drag-response-start',4.0666666667],['selection','local-range-visible',4.4],['version-3','local-drag-response-settled',4.4],['selection','expand-beyond-local-start',4.55],['version-3','wider-range-response-start',4.55],['selection','covers-book-and-title',5.0166666667],['version-3','wider-range-response-settled',5.0166666667],['selection','expand-to-whole-start',5.1],['version-3','return-to-whole-start',5.1],['selection','whole-result-only',5.45],['version-3','return-to-whole-settled',5.45],['feedback-box','reveal-start',5.6666666667],['camera','follow-whole-result-start',5.6666666667],['version-3','transfer-start',5.85],['feedback-text','vague-description-start',6.4],['version-3','attachment-arrive',6.65],['camera','feedback-context-settled',6.85],['selection','released-after-whole-attachment',6.9],['feedback-text','vague-description-complete',7],['all','question-hold-start',7.2333333333],['all','last-frame',503/60]];
const events=raw.map(([actor,event,t])=>{const f=Math.round(t*FPS);return{actor,event,localFrame:f,localSeconds:f/FPS,localTime:`00:${(f/FPS).toFixed(3).padStart(6,'0')}`,fps:FPS,F0:0,basis:'actual state event; not verified word onset'};});
module.exports={FPS,FRAMES,DURATION,state,events,captions,mixCam,selection,SMALL,MEDIUM,WHOLE};
