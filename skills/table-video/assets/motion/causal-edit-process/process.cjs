// SPDX-License-Identifier: MIT
// One production model for an editable field, its requirement and an optional pointer.
// The negative modes are regression examples, never production recommendations.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CausalEditProcess=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const width=1280,height=720,fps=30,duration=8.4;
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const ease=x=>(x=clamp(x))<.5?4*x*x*x:1-(-2*x+2)**3/2;
 const P=(t,a,b)=>ease((t-a)/(b-a)),mix=(a,b,p)=>a+(b-a)*p;
 function frontLoaded(x){x=clamp(x);let lo=0,hi=1,s=x;for(let i=0;i<28;i++){s=(lo+hi)/2;const v=3*.22*s*(1-s)**2+3*.22*s*s*(1-s)+s**3;if(v<x)lo=s;else hi=s;}return 3*.72*s*(1-s)**2+3*s*s*(1-s)+s**3;}
 const DEFAULT=Object.freeze({title:'导入一条活动记录',fields:[{id:'date',label:'日期',value:'2026/10/29'},{id:'quantity',label:'数量',value:'12'},{id:'city',label:'城市',value:'杭州'}],requirement:{targetId:'date',label:'日期',operation:'date-separators',separator:'-'}});
 function contentOf(options){
  const input=options.content??DEFAULT,c=JSON.parse(JSON.stringify(input));
  if(typeof c.title!=='string'||!Array.isArray(c.fields)||c.fields.length!==3||c.fields.some(f=>!f||typeof f.id!=='string'||!f.id||typeof f.label!=='string'||typeof f.value!=='string')||new Set(c.fields.map(f=>f.id)).size!==3)throw Error('Expected title and three uniquely identified content fields');
  const r=c.requirement;if(!r||!c.fields.some(f=>f.id===r.targetId)||r.operation!=='date-separators'||!['-','.'].includes(r.separator))throw Error('Requirement must address an existing field and supported separator');
  const target=c.fields.find(f=>f.id===r.targetId);
  if(!/^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}$/.test(target.value))throw Error('Target must contain the illustrated year/month/day value');
  return c;
 }
 function applyRequirement(field,requirement){return field.id===requirement.targetId?field.value.split(/[/.\-]/).join(requirement.separator):field.value;}
 function eventWindows(mode){return {
  requirement:[1.15,1.75],
  approach:mode==='premature'?[.05,.55]:mode==='flash'?[1.85,2.3]:[1.85,2.7],
  select:mode==='premature'?[.3,.65]:[2.7,2.95],
  edit:mode==='premature'?[.55,1.05]:[3.12,4.22],
  release:mode==='flash'?[3.55,3.95]:[3.2,3.75],
  copy:[4.6,5.55],exit:[5.9,7.2]
 };}
 function stateAt(seconds,options={}){
  if(!Number.isFinite(seconds))throw Error('Time must be finite');
  const mode=options.mode??'good';if(!['good','premature','wrong-target','flash'].includes(mode))throw Error('Unknown demonstration mode');
  const t=clamp(seconds,0,duration),content=contentOf(options),w=eventWindows(mode),r=content.requirement;
  const correctIndex=content.fields.findIndex(f=>f.id===r.targetId),editedIndex=mode==='wrong-target'?(correctIndex+1)%content.fields.length:correctIndex;
  const edit=P(t,...w.edit),selected=P(t,...w.select),copy=P(t,...w.copy),rowY=240+80*editedIndex;
  const rows=content.fields.map((f,i)=>{
   const expected=applyRequirement(f,r),after=i===editedIndex?(mode==='wrong-target'?(f.value==='12'?'24':f.value+'*'):expected):f.value;
   return {...f,expected,after,edit:i===editedIndex?edit:0,x:260,y:240+80*i,width:300,height:50};
  });
  const target=rows[correctIndex],cursorTarget={x:548,y:rowY+43},park={x:595,y:320};
  const start=mode==='flash'?{x:1320,y:670}:{x:570,y:500};
  const cp=mode==='flash'?frontLoaded((t-w.approach[0])/(w.approach[1]-w.approach[0])):P(t,...w.approach);
  let cursor={x:mix(start.x,cursorTarget.x,cp),y:mix(start.y,cursorTarget.y,cp),drawn:options.pointer!==false&&(mode!=='flash'||t>=w.approach[0]),layer:1000,pressed:P(t,2.85,2.94)*(1-P(t,3.03,3.12))};
  if(t>=w.release[0]){const q=mode==='flash'?frontLoaded((t-w.release[0])/(w.release[1]-w.release[0])):P(t,...w.release),to=mode==='flash'?{x:1165,y:642}:park;cursor={...cursor,x:mix(cursorTarget.x,to.x,q),y:mix(cursorTarget.y,to.y,q)};}
  if(mode==='flash'){cursor.layer=5;if(t>=w.release[1])cursor.drawn=false;}
  else if(t>=w.exit[0]){const q=P(t,...w.exit);cursor={...cursor,x:mix(park.x,620,q),y:mix(park.y,760,q),drawn:options.pointer!==false&&t<w.exit[1]};}
  const resultValue=target.edit===1?target.after:target.value;
  return {kind:'causal-field-edit',mode,t,width,height,fps,duration,content,windows:w,
   requirement:{...r,progress:P(t,...w.requirement),value:target.expected},rows,
   selection:{targetId:rows[editedIndex].id,x:256,y:rowY-4,width:308*selected,height:58,progress:selected},
   cursor,copy:{id:'result-date',x:mix(260,900,copy),y:target.y,width:300,height:50,progress:copy,drawn:t>=w.copy[0],value:resultValue},
   result:{value:resultValue,complete:copy===1,matchesRequirement:copy===1&&resultValue===target.expected},
   phase:t<1.15?'查看原始记录':t<1.85?'读取具体要求':t<3.12?'定位对应字段':t<4.6?'原处修改字段':t<5.55?'将修改结果送入预览':'保留结果供核对'};
 }
 function actions(options={}){
  const s=stateAt(0,options),w=s.windows,edited=s.rows.find((r,i)=>i===(s.mode==='wrong-target'?(s.rows.findIndex(r=>r.id===s.requirement.targetId)+1)%3:s.rows.findIndex(r=>r.id===s.requirement.targetId)));
  return [
   {id:'requirement-reveal',objectId:'requirement',start:w.requirement[0],end:w.requirement[1],kind:'reveal'},
   {id:'cursor-approach',objectId:'cursor',start:w.approach[0],end:w.approach[1],kind:'transfer'},
   {id:'select-field',objectId:'selection',start:w.select[0],end:w.select[1],kind:'reveal'},
   {id:'remove-old-field',objectId:edited.id+'-old',start:w.edit[0],end:w.edit[1],kind:'process',channels:['maskProgress']},
   {id:'write-new-field',objectId:edited.id+'-new',start:w.edit[0],end:w.edit[1],kind:'process',channels:['maskProgress']},
   {id:'cursor-release',objectId:'cursor',start:w.release[0],end:w.release[1],kind:'transfer'},
   {id:'copy-result',objectId:'result-date',start:w.copy[0],end:w.copy[1],kind:'transfer'},
   ...(s.mode==='flash'?[]:[{id:'cursor-exit',objectId:'cursor',start:w.exit[0],end:w.exit[1],kind:'transfer'}])
  ].filter(a=>options.pointer!==false||a.objectId!=='cursor');
 }
 return {width,height,fps,duration,sourceRange:[0,duration],stateAt,actions,eventWindows,applyRequirement,ease};
});
