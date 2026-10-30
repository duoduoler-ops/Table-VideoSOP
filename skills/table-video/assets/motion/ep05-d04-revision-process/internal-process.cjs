// SPDX-License-Identifier: MIT
// Thin SVG extraction of Paper + VoiceStrip. Source time, reading, knot and splice
// functions remain in model.cjs. This example means a diagnosed sentence is fixed;
// it must not be used to imply success when the story says the problem remains.
const M=require('./model.cjs');
const DATA=require('./source-data.json');
const {EV}=require('./source-timeline.cjs');
const C=DATA.tokens.colors;
const RANGE=Object.freeze([10.3,17.05]);
const bounds=Object.freeze({width:760,height:560});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const chars=s=>[...s].length;
function contentOf(options={}){
  const c={title:options.title??'原稿',context:options.context??DATA.page.p,before:options.before??DATA.page.stuckBefore,after:options.after??DATA.page.stuckAfter};
  if(!Array.isArray(c.context)||c.context.length!==4||[c.title,...c.context,c.before,c.after].some(s=>typeof s!=='string'||!s.length))throw Error('Content requires title, four context lines, before and after strings');
  return {...c,context:[...c.context]};
}
// For replacement text, keep the source event order but map character progress
// to the new strings. The waveform is a reading illustration, not generated audio.
function mappedWave(a,b,rough,seq,charStart,charEnd,seed=0){
  const pts=[];
  for(let x=a;x<=b;x+=.8){
    const f=charStart+(x-a)/Math.max(.001,b-a)*(charEnd-charStart);
    const amp=M.envAt(f,rough,seq),lam=rough?3.6*(.7+.6*M.hash(Math.floor(x/5)+5)):3.6;
    pts.push([x,M.CY-M.WAVE_A*Math.min(1.35,amp)*Math.sin(2*Math.PI*(x-M.X0+seed)/lam)]);
  }
  return pts;
}
function stateAt(sourceSeconds,options={}){
  if(!Number.isFinite(sourceSeconds))throw Error('sourceSeconds must be finite');
  const t=M.clamp(sourceSeconds,...RANGE),source=M.state(t),content=contentOf(options);
  const defaultText=content.context.every((s,i)=>s===DATA.page.p[i])&&content.before===DATA.page.stuckBefore&&content.after===DATA.page.stuckAfter;
  const lag=M.reading(t-EV.waveLag),readN=lag.c.reduce((a,b)=>a+b,0)+lag.c5;
  const xEnd=M.X0+readN*M.DX,oldEnd=Math.min(xEnd,M.XK);
  const newEnd=M.X5+source.wave.newConnect*chars(content.after)*M.DX;
  const beforeSeq=[...content.context.join(''),...content.before],afterSeq=[...content.context.join(''),...content.after];
  const contextN=chars(content.context.join(''));
  const paths=defaultText?{
    smooth:M.pd(M.wavePts(M.X0,Math.min(xEnd,M.X5),false)),
    rough:M.pd(xEnd>M.X5?M.wavePts(M.X5,oldEnd,true):[]),
    fresh:M.pd(source.wave.newConnect>0?M.wavePts(M.X5,newEnd,false,M.SEQ_B,1.3):[])
  }:{
    smooth:M.pd(mappedWave(M.X0,Math.min(xEnd,M.X5),false,beforeSeq,0,contextN*Math.min(1,readN/M.N5))),
    rough:M.pd(xEnd>M.X5?mappedWave(M.X5,oldEnd,true,beforeSeq,contextN,contextN+chars(content.before)*lag.c5/chars(DATA.page.stuckBefore)):[]),
    fresh:M.pd(source.wave.newConnect>0?mappedWave(M.X5,newEnd,false,afterSeq,contextN,contextN+chars(content.after)*source.wave.newConnect,1.3):[])
  };
  paths.knotPath=M.pd(M.knotPts(source.wave.knot));
  return {kind:'sentence-revision',sourceSeconds:t,bounds:{...bounds},content,
    reading:{context:source.reading.c.map((n,i)=>n/DATA.page.p[i].length),before:source.reading.c5/chars(DATA.page.stuckBefore),after:source.wave.newConnect},
    sentence:{remove:1-source.longSentence.oldOpacity,reveal:source.longSentence.newReveal,height:source.longSentence.paragraphHeight,
      circle:source.longSentence.circleDraw,circleShrink:source.longSentence.circleShrink,circleOpacity:source.longSentence.circleOpacity},
    wave:{...source.wave,...paths,joinX:M.X5,centerY:M.CY,width:Math.max(710,M.X5+chars(content.after)*M.DX+20)},
    result:{check:source.result.check},
    // Source state is available for a project-owned layout; no camera or outer-card
    // motion is silently applied by the portable renderer.
    source};
}
function renderSvg(s,{idPrefix='revision'}={}){
  if(s?.kind!=='sentence-revision')throw Error('Expected sentence-revision state');
  if(!/^[A-Za-z][\w-]*$/.test(idPrefix))throw Error('idPrefix must be a safe unique SVG id prefix');
  const {content:c,sentence:q,wave:w}=s,tx=(x,y,text,size=19)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${C.ink}" textLength="${Math.min(640,chars(text)*size*.92)}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>`;
  const width=640,oldW=width*(1-q.remove),newW=width*q.reveal,afterY=336+q.height;
  const clip=(name,x,y,w,h)=>`<clipPath id="${idPrefix}-${name}"><rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${h}"/></clipPath>`;
  const wavePath=(d,color=C.system)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  const rows=c.context.map((text,i)=>`<rect x="60" y="${94+i*37}" width="${width*s.reading.context[i]}" height="25" rx="3" fill="${C.status}"/>${tx(60,114+i*37,text)}`).join('');
  return `<g font-family="Microsoft YaHei, Segoe UI, sans-serif">
    <defs>${clip('old',60+width*q.remove,280,oldW,62)}${clip('new',60,280,newW,62)}</defs>
    <rect x="28" y="20" width="704" height="420" rx="18" fill="${C.card}" stroke="${C.line}" stroke-width="2"/>
    ${tx(60,65,c.title,26)}${rows}
    <g clip-path="url(#${idPrefix}-old)"><rect x="60" y="286" width="${Math.min(width,chars(c.before)*19*.92)*s.reading.before}" height="25" fill="${C.status}"/>${tx(60,306,c.before)}</g>
    <g clip-path="url(#${idPrefix}-new)" transform="translate(${14*(1-q.reveal)} 0)"><rect x="60" y="286" width="${Math.min(width,chars(c.after)*19*.92)*s.reading.after}" height="25" fill="${C.status}"/>${tx(60,306,c.after)}</g>
    <rect x="52" y="280" width="${M.lerp(656,620,q.circleShrink)}" height="${q.height+12}" rx="13" fill="none" stroke="${C.action}" stroke-width="2.5" stroke-dasharray="1500 1500" stroke-dashoffset="${1500*(1-q.circle)}" opacity="${q.circleOpacity}"/>
    <path d="M60 ${afterY} H580 M60 ${afterY+18} H430" stroke="${C.line}" stroke-width="9" stroke-linecap="round"/>
    <path d="M650 365 l12 13 24 -28" fill="none" stroke="${C.action}" stroke-width="5" stroke-dasharray="55 55" stroke-dashoffset="${55*(1-s.result.check)}"/>
    <rect x="28" y="464" width="704" height="80" rx="15" fill="${C.card}" stroke="${C.line}" stroke-width="2"/>
    <g transform="translate(40 466) scale(${680/w.width} 1)"><path d="M${M.X0} ${M.CY} H${w.width-20}" stroke="${C.line}"/>
      ${wavePath(w.smooth)}<g opacity="${1-w.oldRemove}" transform="translate(${w.joinX} ${w.centerY}) scale(${1-.85*w.oldRemove} ${1-.6*w.oldRemove}) translate(${-w.joinX} ${-w.centerY})">${wavePath(w.rough)}${wavePath(w.knotPath,C.action)}</g>${wavePath(w.fresh)}
    </g></g>`;
}
function renderDocument(state,options={}){return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${renderSvg(state,options)}</svg>`;}
module.exports={stateAt,renderSvg,renderDocument,bounds,sourceRange:RANGE};
