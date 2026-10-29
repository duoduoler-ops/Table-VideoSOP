// SPDX-License-Identifier: MIT
// This renderer records the objects it actually draws; frameAt never invents trajectories.
(function(root,factory){const api=typeof module==='object'&&module.exports?factory(require('./process.cjs'),require('../../../scripts/motion-observation.cjs')):factory(root.CausalEditProcess,root.MotionObservation);if(typeof module==='object'&&module.exports)module.exports=api;else root.CausalEditScene=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M,O){
 'use strict';
 const C={background:'#F3F4F2',card:'#FFFFFF',ink:'#26352F',muted:'#64756D',line:'#D7DFD8',accent:'#D8B52B',soft:'#FFF5CF',green:'#517866'};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function build(s){
  if(s?.kind!=='causal-field-edit')throw Error('Expected causal field edit state');
  const out=O.createObservedScene({width:M.width,height:M.height});
  const rect=(id,x,y,width,height,fill,z,extra={})=>out.rect({id,x,y,width,height,z,...extra},{fill});
  const text=(id,x,y,width,str,size,z,extra={})=>out.raw({id,x,y:y-size,width:extra.paintWidth??width,height:size+8,z,contentVersion:str,...extra},`<text x="${x}" y="${y}" font-family="Microsoft YaHei, Segoe UI, sans-serif" font-size="${size}" fill="${C.ink}"${extra.paintWidth?` textLength="${extra.paintWidth}" lengthAdjust="spacingAndGlyphs"`:''}>${esc(str)}</text>`);
  rect('background',0,0,M.width,M.height,C.background,-10);
  text('context-title',70,31,1000,s.content.title,21,30);
  rect('source-card',70,180,540,350,C.card,10);
  rect('destination-card',740,180,470,350,C.card,10);
  text('source-title',100,217,410,'待提交记录',25,30);
  text('destination-title',770,217,400,'导入预览',25,30);
  rect('requirement',70,50,1140,90,C.soft,50,{clip:{x:70,y:50,width:1140*s.requirement.progress,height:90},process:{maskProgress:s.requirement.progress}});
  text('requirement-text',100,105,1080,`${s.requirement.label}格式要求：${s.requirement.value}`,29,51,{parentId:'requirement'});
  rect('selection',s.selection.x,s.selection.y,s.selection.width,s.selection.height,C.accent,19,{process:{maskProgress:s.selection.progress}});
  for(const row of s.rows){
   text(row.id+'-label',105,row.y+35,150,row.label,26,30);
   rect(row.id+'-field',row.x,row.y,row.width,row.height,C.background,20);
   const inkWidth=str=>Math.min(276,[...str].reduce((sum,c)=>sum+(c.charCodeAt(0)<128?15.6:26),0));
   const oldW=inkWidth(row.value),newW=inkWidth(row.after);
   const oldClip={x:row.x+12+oldW*row.edit,y:row.y,width:oldW*(1-row.edit),height:row.height};
   const newClip={x:row.x+12,y:row.y,width:newW*row.edit,height:row.height};
   text(row.id+'-old',row.x+12,row.y+35,oldW,row.value,26,31,{clip:oldClip,paintWidth:oldW,process:{maskProgress:1-row.edit}});
   text(row.id+'-new',row.x+12,row.y+35,newW,row.after,26,32,{clip:newClip,paintWidth:newW,process:{maskProgress:row.edit}});
   text('destination-'+row.id+'-label',770,row.y+35,115,row.label,25,30);
   rect('destination-'+row.id+'-slot',900,row.y,280,50,C.background,20);
   if(row.id!==s.requirement.targetId)text('destination-'+row.id+'-value',912,row.y+35,260,row.value,26,31);
  }
  // A copy retains the actual edited field value; an unrelated edit cannot fix it.
  rect('result-date',s.copy.x,s.copy.y,s.copy.width,50,C.soft,60,{drawn:s.copy.drawn,contentVersion:s.copy.value});
  text('result-date-text',12,35,276,s.copy.value,26,61,{parentId:'result-date',transform:[1,0,0,1,s.copy.x,s.copy.y],drawn:s.copy.drawn});
  text('result-caption',770,581,420,'对照要求与实际结果',23,30);
  // A visible triangle is a supported polygon; the tip is the tracked hotspot.
  out.polygon({id:'cursor',points:[[0,0],[0,30],[9,21],[23,22]],transform:[1,0,0,1,s.cursor.x,s.cursor.y+s.cursor.pressed*3],z:s.cursor.layer,drawn:s.cursor.drawn,hotspot:{x:0,y:0},contentVersion:'pointer',d1Category:'overlay'},{fill:C.ink});
  const frame=out.finish();
  // Inline SVG clip IDs are document-wide in browsers. The comparison renders
  // both modes in one document; namespace paint IDs without changing object IDs.
  const prefix='causal-'+s.mode+'-';
  frame.svg=frame.svg.replace(/id="obs-/g,`id="${prefix}obs-`).replace(/url\(#obs-/g,`url(#${prefix}obs-`);
  return frame;
 }
 function renderDocument(s){return build(s).svg;}
 function renderSvg(s){return renderDocument(s).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');}
 function frameAt(t,options={}){return build(M.stateAt(t,options));}
 return {stateAt:M.stateAt,renderDocument,renderSvg,frameAt,build,bounds:{width:M.width,height:M.height},sourceRange:M.sourceRange};
});
