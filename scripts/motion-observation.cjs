// SPDX-License-Identifier: MIT
// Small production SVG recorder and conservative observation helpers. No runtime dependency.
// Supported proof: filled rectangles/simple polygons, axis-aligned parent transforms and rectangular clips,
// fully opaque rectangular foreground paint. Raw SVG/unsupported paint remains unknown.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MotionObservation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const EPS=1e-8,I=[1,0,0,1,0,0];
 const finite=(x,label)=>{if(!Number.isFinite(x))throw Error('Non-finite '+label);return x;};
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 const point=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
 const axis=m=>Math.abs(m[1])<EPS&&Math.abs(m[2])<EPS;
 const rectPoints=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
 const box=ps=>{if(!ps.length)return{x:0,y:0,width:0,height:0};const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};};
 const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
 // Shoelace/clipping assumes a simple boundary; self-intersections can cancel actual painted area.
 function simplePolygon(ps){
  if(area(ps)<=EPS)return false;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<=EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
  for(let i=0;i<ps.length;i++){
   const a=ps[i],b=ps[(i+1)%ps.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<=EPS)return false;
   for(let j=i+1;j<ps.length;j++){
    if(j===i+1||(i===0&&j===ps.length-1))continue;
    const c=ps[j],d=ps[(j+1)%ps.length],abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
    if(((abC>EPS&&abD< -EPS)||(abC< -EPS&&abD>EPS))&&((cdA>EPS&&cdB< -EPS)||(cdA< -EPS&&cdB>EPS))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;
   }
  }
  return true;
 }
 const intersects=(a,b)=>a.width>0&&a.height>0&&b.width>0&&b.height>0&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 function half(poly,index,value,keepGreater){
  if(!poly.length)return[];const out=[],inside=p=>keepGreater?p[index]>=value-EPS:p[index]<=value+EPS;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=inside(a),ib=inside(b);if(ia)out.push(a);if(ia!==ib){const q=(value-a[index])/(b[index]-a[index]);out.push([a[0]+q*(b[0]-a[0]),a[1]+q*(b[1]-a[1])]);}}
  return out;
 }
 function clipPolygon(p,r){return half(half(half(half(p,0,r.x,true),0,r.x+r.width,false),1,r.y,true),1,r.y+r.height,false);}
 function subtractRect(p,r){
  let rest=p;const out=[];for(const [k,v,greater]of [[0,r.x,true],[0,r.x+r.width,false],[1,r.y,true],[1,r.y+r.height,false]]){const exterior=half(rest,k,v,!greater);if(area(exterior)>EPS)out.push(exterior);rest=half(rest,k,v,greater);if(area(rest)<=EPS)break;}return out;
 }
 function visibleState(o,viewport={width:1920,height:1080}){
  if(!o||(o.opacity??1)<=0||o.width<=0||o.height<=0)return{state:'hidden',reason:'not-drawn-or-empty'};
  const on=intersects(o,{x:0,y:0,...viewport});
  if(!on){if(Math.abs(o.rotation??0)>EPS&&!o.observation)return{state:'unknown',reason:'unresolved-rotation'};return{state:'hidden',reason:'outside-viewport'};}
  const observation=o.observation;
  if(observation&&['visible','hidden','unknown'].includes(observation.state))return observation;
  return{state:'unknown',reason:'bbox-only-no-painted-visibility'};
 }
 function createObservedScene({width=1920,height=1080,camera}={}){
  finite(width,'width');finite(height,'height');if(width<=0||height<=0)throw Error('Invalid viewport');
  const cam=camera?{...camera}:null,cm=cam?[cam.z,0,0,cam.z,width/2-cam.cx*cam.z,height/2-cam.cy*cam.z]:I;
  cm.forEach(v=>finite(v,'camera'));if(cam&&cam.z<=0)throw Error('Invalid camera zoom');
  const nodes=[],byId=new Map();
  function add(type,s,paint){
   if(!s||typeof s.id!=='string'||!s.id||byId.has(s.id))throw Error('Missing/duplicate production object ID');
   const parent=s.parentId?byId.get(s.parentId):null;if(s.parentId&&!parent)throw Error('Parent must be submitted before child: '+s.id);
   const transform=s.transform??I;if(!Array.isArray(transform)||transform.length!==6)throw Error('Expected six-number affine transform');transform.forEach(v=>finite(v,'transform'));
   const local=type==='polygon'?s.points:rectPoints({x:s.x??0,y:s.y??0,width:s.width??0,height:s.height??0});
   if(!Array.isArray(local)||local.length<3||local.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Invalid production geometry');
   if(type==='polygon'&&!simplePolygon(local))throw Error('Unsupported self-intersecting or degenerate polygon; use raw() with conservative painted bounds');
   const geometry=box(local.map(p=>point(transform,p))),matrix=multiply(parent?.matrix??cm,transform),ps=local.map(p=>point(matrix,p)),bounds=box(ps);
   const ownOpacity=s.drawn===false?0:(s.opacity??1);finite(ownOpacity,'opacity');if(ownOpacity<0||ownOpacity>1)throw Error('Opacity outside 0..1');
   const opacity=ownOpacity*(parent?.opacity??1),clips=[...(parent?.clips??[])];
   if(s.clip){const c=s.clip;for(const k of ['x','y','width','height'])finite(c[k],'clip.'+k);if(c.width<0||c.height<0)throw Error('Negative clip extent');clips.push({local:{...c},matrix:[...matrix],bounds:box(rectPoints(c).map(p=>point(matrix,p))),supported:axis(matrix)});}
   const style=type==='raw'?null:{fill:'#000',...paint},fill=style?.fill;
   if(style&&Object.keys(style).some(k=>!['fill','stroke','strokeWidth','fillOpacity','strokeLinejoin','strokeLinecap','rx','ry','opacity'].includes(k)))throw Error('Unsupported primitive style; use raw() for arbitrary SVG');
   if(type!=='raw'&&(s.filter||s.mask||s.blendMode||(style.stroke&&style.stroke!=='none'&&(style.strokeWidth??1)>0)))throw Error('Stroke/effects need conservative painted bounds; use raw() or separate filled primitives');
   // Only simple literal opaque fills are proved; effects/gradients/masks are raw observations.
   const simple=type!=='raw'&&typeof fill==='string'&&/^(#[0-9a-f]{3}|#[0-9a-f]{6}|black|white|red|green|blue|yellow|gray|grey)$/i.test(fill)&&!(style.rx>0||style.ry>0)&&((style.opacity??1)===1)&&!s.filter&&!s.mask&&!s.blendMode;
   const supported=simple&&axis(matrix)&&clips.every(c=>c.supported),z=s.z??0;finite(z,'z');
   const hotspot=s.hotspot?point(matrix,[finite(s.hotspot.x,'hotspot.x'),finite(s.hotspot.y,'hotspot.y')]):null;
   const node={...s,type,style,body:type==='raw'?String(paint):null,index:nodes.length,z,local,matrix,ps,bounds,geometry,opacity,clips,supported,opaque:supported&&opacity===1&&(style?.fillOpacity??1)===1,typeRect:type==='rect',hotspot};
   if(type!=='raw'&&style?.fillOpacity!==undefined){finite(style.fillOpacity,'fillOpacity');if(style.fillOpacity<0||style.fillOpacity>1)throw Error('Invalid fillOpacity');if(style.fillOpacity!==1)node.supported=false;}
   nodes.push(node);byId.set(s.id,node);return s.id;
  }
  function finish(){
   const ordered=[...nodes].sort((a,b)=>a.z-b.z||a.index-b.index),viewport={x:0,y:0,width,height};
   const painted=ordered.map(n=>{let pieces=[clipPolygon(n.ps,viewport)];for(const c of n.clips)if(c.supported)pieces=pieces.map(p=>clipPolygon(p,c.bounds));pieces=pieces.filter(p=>area(p)>EPS);return{n,pieces};});
   const objects=painted.map(({n,pieces},i)=>{
    let remaining=pieces,uncertainFront=[],unknown=!n.supported,reason=unknown?'unsupported-paint-or-transform':'supported-painted-geometry';
    if(n.opacity<=0){remaining=[];unknown=false;reason='not-drawn';}
    else if(!pieces.length){unknown=false;reason='viewport-or-parent-clip-empty';}
    else for(let j=i+1;j<painted.length;j++){
     const front=painted[j];if(front.n.opacity<=0||!front.pieces.length)continue;
     const overlap=remaining.some(p=>front.pieces.some(q=>intersects(box(p),box(q))));if(!overlap)continue;
     if(front.n.opaque&&front.n.typeRect){for(const q of front.pieces)remaining=remaining.flatMap(p=>subtractRect(p,box(q))).filter(p=>area(p)>EPS);}
     else{uncertainFront.push(...front.pieces.map(box));}
     if(!remaining.length){unknown=false;reason='opaque-foreground-covered';break;}
    }
    let guaranteed=remaining;for(const r of uncertainFront)guaranteed=guaranteed.flatMap(p=>subtractRect(p,r)).filter(p=>area(p)>EPS);
    if(remaining.length&&!guaranteed.length){unknown=true;reason='unsupported-or-translucent-foreground';}
    const state=!remaining.length?'hidden':unknown?'unknown':'visible',visibleBounds=state==='visible'?box(guaranteed.flat()):null;
    return{id:n.id,...n.bounds,opacity:n.opacity,rotation:Math.atan2(n.matrix[1],n.matrix[0])*180/Math.PI,parentId:n.parentId,contentVersion:n.contentVersion??n.id,d1Category:n.d1Category??'mg',localGeometry:n.localGeometry??{...n.geometry},...(n.process?{process:n.process}:{}),...(n.replacement?{replacement:n.replacement}:{}),...(n.hotspot?{hotspot:{x:n.hotspot[0],y:n.hotspot[1]}}:{}),observation:{state,reason,visibleBounds,basis:'production-recorded-geometry',paintedAreaPx2:state==='visible'?guaranteed.reduce((a,p)=>a+area(p),0):null},layer:n.z};
   });
   const defs=[],groups=ordered.map(n=>{
    let body=n.body;if(n.type!=='raw'){const attrs=Object.entries(n.style).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${esc(v)}"`).join(' ');body=n.type==='rect'?`<rect x="${n.x??0}" y="${n.y??0}" width="${n.width??0}" height="${n.height??0}" ${attrs}/>`:`<polygon points="${n.local.map(p=>p.join(',')).join(' ')}" ${attrs}/>`;}
    let group=`<g data-object="${esc(n.id)}" transform="matrix(${n.matrix.join(' ')})" opacity="${n.opacity}">${body}</g>`;
    n.clips.forEach((c,k)=>{const id=`obs-${n.index}-clip-${k}`;defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${c.local.x}" y="${c.local.y}" width="${c.local.width}" height="${c.local.height}" transform="matrix(${c.matrix.join(' ')})"/></clipPath>`);group=`<g clip-path="url(#${id})">${group}</g>`;});return group;
   });
   return{svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join('')}</defs>${groups.join('')}</svg>`,objects,...(cam?{camera:cam}:{}),renderedObjectIds:nodes.map(n=>n.id),observationBasis:'production-recorder'};
  }
  return{rect:(s,style={})=>add('rect',s,style),polygon:(s,style={})=>add('polygon',s,style),raw:(s,body)=>add('raw',s,body),finish};
 }
 // These are source-frame coordinate observations, not speed-quality thresholds.
 function measureFrameMotion(samples,ids,viewport,fps,actions=[]){
  const objects=[],reviewFrames=new Map(),addFrame=(index,reason,id)=>{if(index<0||index>=samples.length)return;const frame=Math.round(samples[index].time*fps),item=reviewFrames.get(frame)??{frame,time:samples[index].time,objects:[],reasons:[]};if(!item.objects.includes(id))item.objects.push(id);if(!item.reasons.includes(reason))item.reasons.push(reason);reviewFrames.set(frame,item);};
  for(const id of ids){
   const rows=samples.map((s,sampleIndex)=>({sampleIndex,time:s.time,o:s.map?.get(id)??s.frame?.objects?.find(o=>o.id===id)})),steps=[];let path=0,unknown=0,visibleFrames=0,missingFrames=0;const events=[];
   for(let i=0;i<rows.length;i++){const r=rows[i];if(!r.o){missingFrames++;for(const d of [-1,0,1])addFrame(r.sampleIndex+d,'missing-object-observation',id);continue;}
    const v=visibleState(r.o,viewport);if(v.state==='visible')visibleFrames++;if(v.state==='unknown')unknown++;if(!i||!rows[i-1].o)continue;
    const prev=rows[i-1],pv=visibleState(prev.o,viewport),a=prev.o.hotspot??{x:prev.o.x+prev.o.width/2,y:prev.o.y+prev.o.height/2},b=r.o.hotspot??{x:r.o.x+r.o.width/2,y:r.o.y+r.o.height/2};
    const distance=Math.hypot(b.x-a.x,b.y-a.y),dt=r.time-prev.time;path+=distance;steps.push({frame:i,start:prev.time,end:r.time,distance,speed:dt>0?distance/dt:0,cumulative:path,confirmedVisible:pv.state==='visible'&&v.state==='visible'});
    if(v.state!==pv.state||(prev.o.opacity>0)!==(r.o.opacity>0)){const e={frame:Math.round(r.time*fps),time:r.time,from:pv.state,to:v.state,drawSwitch:(prev.o.opacity>0)!==(r.o.opacity>0)};events.push(e);for(const d of [-1,0,1])addFrame(i+d,'visibility-boundary',id);}
   }
   if(!rows.some(r=>r.o))continue;const moving=steps.filter(s=>s.distance>EPS),peak=steps.length?steps.reduce((a,b)=>b.distance>a.distance?b:a):null,first=moving[0],last=moving.at(-1),span=first?last.end-first.start:0;
   const cross=f=>{if(!path||missingFrames)return null;const s=steps.find(s=>s.cumulative>=path*f);return s?s.end-(first?.start??rows[0].time):null;};
   const firstQuarterPath=first?steps.filter(s=>s.end<=first.start+span*.25+EPS).reduce((n,s)=>n+s.distance,0):0;
   if(first){for(const f of [first.frame-1,first.frame,peak.frame-1,peak.frame,last.frame])addFrame(f,'motion-sample',id);}
   objects.push({id,basis:rows.filter(r=>r.o).every(r=>r.o.hotspot)?'production-hotspot':'bbox-center-coordinate',fps,visibleFrames,unknownVisibilityFrames:unknown,missingFrames,coordinateCoverage:missingFrames?'incomplete':'complete',totalPathPx:path,pathViewportDiagonalFraction:path/Math.hypot(viewport.width,viewport.height),maxFrameDisplacementPx:peak?.distance??0,peakFrame:peak?Math.round(peak.end*fps):null,peakTime:peak?.end??null,peakSpeedPxPerSec:peak?.speed??0,visiblePathPx:steps.filter(s=>s.confirmedVisible).reduce((n,s)=>n+s.distance,0),motionDurationSec:missingFrames?null:span,t50Sec:cross(.5),t80Sec:cross(.8),firstQuarterPathFraction:missingFrames?null:path?firstQuarterPath/path:0,visibilityEvents:events,qualityAssessment:'not-assessed'});
  }
  const actionObservations=[];for(const action of actions){const selected=samples.filter(s=>s.time>=action.start-EPS&&s.time<=action.end+EPS),m=measureFrameMotion(selected,[action.objectId],viewport,fps);if(m.objects[0])actionObservations.push({...m.objects[0],id:action.id,objectId:action.objectId,start:action.start,end:action.end});for(const row of m.reviewFrames){const existing=reviewFrames.get(row.frame);if(existing){for(const reason of row.reasons)if(!existing.reasons.includes(reason))existing.reasons.push(reason);for(const id of row.objects)if(!existing.objects.includes(id))existing.objects.push(id);}else reviewFrames.set(row.frame,row);}}
  return{basis:'actual production-frame samples; coordinates are retained for unknown visibility',qualityAssessment:'not-assessed',speedThreshold:null,objects,actions:actionObservations,reviewFrames:[...reviewFrames.values()].sort((a,b)=>a.frame-b.frame)};
 }
 return{createObservedScene,visibleState,measureFrameMotion,multiply,point};
});
