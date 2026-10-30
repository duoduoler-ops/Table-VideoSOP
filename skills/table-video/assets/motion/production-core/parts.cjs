// MIT. Content-bearing parts for the development example, not a universal scene DSL.
'use strict';
const {esc} = require('./stage.cjs');
const INK='#3B352E', MUTED='#847C70', ORANGE='#FF6500', BLUE='#58728A', LINE='#DCE3E8';
const label = (text,size=28,color=INK,weight=600) => `<div style="font-size:${size}px;color:${color};font-weight:${weight};line-height:1.2;white-space:nowrap">${esc(text)}</div>`;

function tray(stage, {id, center, title, active, received, retirement = [0,0,0]}) {
  const geometry={center:center.map((n,i)=>n+retirement[i]),width:310,height:300,rotation:[0,-7,0]};
  const parent={id,geometry};
  stage.plane({id,geometry,contentVersion:title,style:{background:'#FFFDF9',border:`3px solid ${active?ORANGE:LINE}`,borderRadius:'18px',boxShadow:'0 18px 0 #DCE3E8,0 26px 30px #3B352E12'}});
  stage.part(parent,{id:id+'.title',box:{x:24,y:22,width:270,height:40},html:label(title),contentVersion:title});
  stage.part(parent,{id:id+'.socket',box:{x:37,y:60,width:236,height:180},offsetZ:-1,
    style:{background:received?'#FFF8F1':'#F4F5F4',border:`3px ${received?'solid':'dashed'} ${active?ORANGE:LINE}`,borderRadius:'14px'},contentVersion:'socket',semantic:{received}});
  return parent;
}

function workpiece(stage, state, input) {
  const {position, lengths, activePart, cutProgress, offcutFall, retiredOffset} = state;
  const geometry={center:position.map((n,i)=>n+retiredOffset[i]),width:236,height:180,rotation:[0,-7,0]};
  const parent={id:'kit',geometry};
  const benchFrame={id:'inspection',geometry:{...geometry,center:[0,32,40].map((v,i)=>v+retiredOffset[i])}};
  // The receiver uses the same local frame as the falling material, not the deeper bench face.
  stage.part(benchFrame,{id:'inspection.scrap-bin',box:{x:160,y:210,width:75,height:38},offsetZ:6,
    style:{background:'#EBEEF0',border:`2px solid ${LINE}`,borderRadius:'5px'},contentVersion:'scrap-bin'});
  stage.plane({id:'kit',geometry,contentVersion:'three-part-kit',style:{background:'#FFFFFF',border:`3px solid ${BLUE}`,borderRadius:'14px',boxShadow:'0 9px 0 #CBD4DD,0 16px 22px #3B352E19'},semantic:{route:state.route}});
  // The acceptance limit is a geometric reference at the same scale as every part.
  const unit=2.15, x0=28, y0=32;
  stage.part(parent,{id:'kit.limit',box:{x:x0+input.limit*unit-1,y:16,width:2,height:148},offsetZ:-1,
    style:{background:ORANGE},contentVersion:'limit-'+input.limit,semantic:{limit:input.limit}});
  input.parts.forEach((part,i)=>{
    const width=lengths[i]*unit, selected=activePart===i;
    stage.part(parent,{id:'kit.part.'+part.id,box:{x:x0,y:y0+i*46,width,height:24},offsetZ:-2,
      style:{background:selected?ORANGE:BLUE,borderRadius:'5px',border:`2px solid ${selected?ORANGE:BLUE}`},
      contentVersion:'solid-part-'+part.id,process:{morphProgress:state.partProgress[i]},semantic:{value:lengths[i],original:part.length}});
    // The cut excess remains a physical part until it moves below the work area.
    const excess = Math.max(0, part.length - lengths[i]);
    stage.part(benchFrame,{id:'kit.offcut.'+part.id,box:{x:x0+lengths[i]*unit+state.partProgress[i]*5+offcutFall[i]*10,y:y0+i*46+offcutFall[i]*(214-y0-i*46),width:excess*unit,height:24},offsetZ:-3,independentPlane:true,paintAfter:'kit',
      style:{background:ORANGE,borderRadius:'4px'},contentVersion:'offcut-'+part.id,
      process:{morphProgress:state.partProgress[i]},semantic:{removed:excess}});
  });
  // Tool targets the actual failing row. Its vertical position is derived from semantic input.
  stage.part(benchFrame,{id:'kit.cutter',box:{x:x0+state.cutterLength*unit-9,y:state.cutterY,width:18,height:60},offsetZ:-5,independentPlane:true,paintAfter:'kit',
    style:{background:'#D5DDE3',border:`2px solid ${BLUE}`,borderRadius:'3px'},contentVersion:'cutting-tool',
    process:{morphProgress:cutProgress},semantic:{target:activePart<0?null:input.parts[activePart].id}});
  return parent;
}

function inspectionBench(stage, state, input) {
  const geometry={center:[0,0,100].map((v,i)=>v+state.retiredOffset[i]),width:430,height:420,rotation:[0,-7,0]};
  const parent={id:'inspection',geometry};
  stage.plane({id:parent.id,geometry,style:{background:'#F7F9FA',border:`3px solid ${BLUE}`,borderRadius:'20px',boxShadow:'0 20px 0 #CBD4DD'},contentVersion:'inspection-bench'});
  stage.part(parent,{id:'inspection.title',box:{x:28,y:25,width:370,height:44},html:label(input.labels.inspect,34),contentVersion:input.labels.inspect});
  stage.part(parent,{id:'inspection.constraint',box:{x:28,y:118,width:370,height:44},html:label(`长度 ≤ ${input.limit}`,28,BLUE),contentVersion:'length-limit-'+input.limit});
  const railY=182+state.scanProgress*148;
  stage.part(parent,{id:'inspection.scanner',box:{x:34,y:railY,width:355,height:8},offsetZ:-100,independentPlane:true,
    style:{background:ORANGE,borderRadius:'4px'},contentVersion:'scanner',process:{pathProgress:state.scanProgress}});
  // Gate rotation/extension selects the route that the workpiece really takes.
  const gateWidth=64+80*state.gateProgress;
  stage.part(parent,{id:'inspection.gate',box:{x:360,y:state.route==='accepted'?135:300,width:gateWidth,height:18},offsetZ:-10,
    style:{background:state.gateProgress>0?ORANGE:BLUE,borderRadius:'8px'},contentVersion:'route-gate',process:{morphProgress:state.gateProgress},semantic:{destination:state.route}});
  return parent;
}
module.exports={tray,workpiece,inspectionBench,label,INK,MUTED,ORANGE,BLUE,LINE};
