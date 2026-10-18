'use strict';
// EP07 v08: camera observes an object handoff, never an independent slow pan.
// Adapted relations: EP05 D06 camS1 (derive camera from subject + screen anchor),
// EP05 D07 mixCam (log scale, inverse-scale position for substantial reframing).
// The exact positions/timing below belong only to this 13.2 s EP07 trial.
const clamp=x=>Math.max(0,Math.min(1,x));
const lerp=(a,b,q)=>a+(b-a)*q;
const io=q=>{q=clamp(q);return q<.5?4*q*q*q:1-Math.pow(-2*q+2,3)/2};
function bez(x1,y1,x2,y2){return x=>{x=clamp(x);if(x===0||x===1)return x;let lo=0,hi=1,s=x;for(let i=0;i<40;i++){s=(lo+hi)/2;const cx=3*x1*s*(1-s)**2+3*x2*s*s*(1-s)+s*s*s;if(cx<x)lo=s;else hi=s;}return 3*y1*s*(1-s)**2+3*y2*s*s*(1-s)+s*s*s;};}
const slide=bez(.3,0,.25,1);
const progress=(t,a,b,e=slide)=>e(clamp((t-a)/(b-a)));
const FIRST=[1280,460,1.65],COMPARE=[915,600,1.02],EDIT=[2180,555,1.32],WIDE=[2700,1135,1.02];
function mixCam(a,b,q){
 const z=a[2]*Math.pow(b[2]/a[2],q);
 const w=Math.abs(Math.log(b[2]/a[2]))>.3?(1/a[2]-1/z)/(1/a[2]-1/b[2]):q;
 return [lerp(a[0],b[0],w),lerp(a[1],b[1],w),z];
}
function fallbackCarrier(t){
 if(t<3.08)return [385,490,1];
 if(t<3.34)return [385,lerp(490,450,progress(t,3.08,3.34,io)),1];
 if(t<4.08){const q=progress(t,3.34,4.08);return [lerp(385,1825,q),lerp(450,375,q)-85*Math.sin(Math.PI*q),1];}
 if(t<6.05)return [1825,375,1];
 if(t<6.32)return [1825,lerp(375,351,progress(t,6.05,6.32,io)),1];
 const q=progress(t,6.32,7.10);return [lerp(1825,2150,q),lerp(351,900,q),1];
}
function fallbackCopy(t){const q=progress(t,11.08,12.12);return [lerp(2785,3175,q),1300-95*Math.sin(Math.PI*q)];}
// Derive camera from the SAME final subject position and its intended screen point.
// Relative screen motion remains small while the surrounding space reveals the receiver.
function followCarrier(t,xy,start,end,from,to,startXY,endXY,h){
 const q=progress(t,start,end),z=from[2]*Math.pow(to[2]/from[2],q);
 const screen=(pos,cam)=>[960+(pos[0]+400-cam[0])*cam[2],540+(pos[1]+h/2-cam[1])*cam[2]];
 const s0=screen(startXY,from),s1=screen(endXY,to);
 const sx=lerp(s0[0],s1[0],q),sy=lerp(s0[1],s1[1],q);
 return [xy[0]+400-(sx-960)/z,xy[1]+h/2-(sy-540)/z,z];
}
function cameraAt(t,anchors={}){
 t=Math.max(0,Math.min(13.2,t));
 if(t<.28)return [...FIRST];
 if(t<.90)return mixCam(FIRST,COMPARE,progress(t,.28,.90));
 if(t<3.34)return [...COMPARE];
 if(t<4.08)return followCarrier(t,anchors.carrier||fallbackCarrier(t),3.34,4.08,COMPARE,EDIT,[385,450],[1825,375],420);
 if(t<6.32)return [...EDIT];
 if(t<7.10)return followCarrier(t,anchors.carrier||fallbackCarrier(t),6.32,7.10,EDIT,WIDE,[1825,351],[2150,900],395);
 if(t<10.76)return [...WIDE];
 if(t>=12.56)return [...WIDE];
 // The original is still visible at the left throughout the copy-follow, with
 // the destination at the right. Screen target is deliberately right of center.
 const copy=anchors.copy||fallbackCopy(t),z=1.42;
 const tracked=[copy[0]+50-(1100-960)/z,copy[1]+100-(580-540)/z,z];
 const close=mixCam(WIDE,tracked,progress(t,10.76,11.20));
 // Start the pullback during the copy's final arrival: no settle/restart seam.
 return t<12.00?close:mixCam(close,WIDE,progress(t,12.00,12.56));
}
const CAMERA_EVENTS=[
 {id:'reveal-repeat-v08',start:.28,end:.90,target:'first archive to two complete rows',mode:'reframe',curve:'cubic-bezier(.3,0,.25,1)',purpose:'reveal repeated operations and preserve both materials/results'},
 {id:'follow-extract-v08',start:3.34,end:4.08,target:'operation-carrier',mode:'subject-bound',curve:'same final carrier progress',purpose:'follow the extracted record into the AI receiver; reveal source and receiver relationship'},
 {id:'follow-script-v08',start:6.32,end:7.10,target:'operation-carrier',mode:'subject-bound',curve:'same final carrier progress',purpose:'follow the same script to its fixed-flow receiver and expose C and both destinations'},
 {id:'follow-copy-v08',start:10.76,end:12.12,target:'backup-copy; archive original; backup destination',mode:'follow with focus',curve:'focus .44s then same copy position',purpose:'see copy depart while the original remains; keep the destination ahead of the copy'},
 {id:'reveal-accumulation-v08',start:12.00,end:12.56,target:'four-step chain and two destinations',mode:'pullback',curve:'cubic-bezier(.3,0,.25,1)',purpose:'handoff from arriving copy to a stable original/copy and old/new-step comparison'},
];
module.exports={cameraAt,CAMERA_EVENTS,fallbackCarrier,fallbackCopy};
