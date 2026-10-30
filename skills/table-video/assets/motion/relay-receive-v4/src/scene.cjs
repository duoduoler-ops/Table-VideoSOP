// Original editable SVG scene for this test. No image assets or old project code.
// Full-process relationships adapted from the Skill examples; see SOURCE.md.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,p)=>a+(b-a)*p;
const io=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const travel=x=>1-Math.pow(1-x,3);
const ease=(t,a,b,fn=io)=>fn(clamp((t-a)/(b-a)));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function colorMix(a,b,p){const av=parseInt(a.slice(1),16),bv=parseInt(b.slice(1),16);return '#'+[16,8,0].map(n=>Math.round(lerp((av>>n)&255,(bv>>n)&255,p)).toString(16).padStart(2,'0')).join('');}
const {C}=require('./design.cjs');
function text(x,y,content,size=40,weight=400,fill=C.ink,anchor='start',attrs='') { return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central" ${attrs}>${esc(content)}</text>`; }
function rect(x,y,w,h,fill=C.paper,r=24,stroke=C.line,sw=2,attrs=''){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${attrs}/>`;}
function line(x1,y1,x2,y2,stroke=C.line,sw=2,attrs=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${attrs}/>`;}
function path(d,stroke=C.line,sw=2,attrs=''){return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;}
const stateCard=(id='result',x=900,y=500,s=1,version=3,extra={})=>({id,x,y,s,version,r:0,opacity:1,parts:0,fix:0,approved:0,...extra});
function geometry(p){
 const k=p.fix||0,split=p.parts||0;
 const st=io(clamp(k/.65)),tp=io(clamp(k/.75)),ts=io(clamp((k-.25)/.75)),bt=io(clamp((k-.45)/.55));
 const g={
  progress:{stats:st,timerSize:ts,timerPosition:tp,button:bt},
  stats:{x:lerp(0,270,st)-200*split,y:lerp(-30,-160,st)-100*split,w:lerp(880,280,st),h:lerp(300,84,st)},
  timer:{x:lerp(-150,0,tp)+230*split,y:lerp(220,20,tp)-30*split,w:lerp(300,800,ts),h:lerp(96,224,ts)},
  button:{x:lerp(230,0,bt)-150*split,y:lerp(220,190,bt)+140*split,w:lerp(260,440,bt),h:lerp(72,88,bt)},
 };
 // Inspection moves the existing pieces; it never changes their content or size.
 if(p.inspection)for(const id of ['stats','timer','button'])g[id]={...g[id],...p.inspection[id]};
 return g;
}
function worldPoint(p,x,y){const r=(p.r||0)*Math.PI/180;return {x:p.x+p.s*(x*Math.cos(r)-y*Math.sin(r)),y:p.y+p.s*(x*Math.sin(r)+y*Math.cos(r))};}
function card(p){
 const g=geometry(p),k=p.fix||0,split=p.parts||0,v=p.version||0;
 const styles=[{fill:C.neutral,r:18,stroke:C.line,weight:700},{fill:C.paper,r:8,stroke:'#A5ABA8',weight:700},{fill:'#F8F9F6',r:44,stroke:C.line,weight:600},{fill:C.pale,r:24,stroke:C.yellow,weight:700}];
 const blend=p.styleMix??1,from=p.styleFrom??v;
 const style=blend===1?styles[v]:{fill:colorMix(styles[from].fill,styles[v].fill,blend),r:lerp(styles[from].r,styles[v].r,blend),stroke:colorMix(styles[from].stroke,styles[v].stroke,blend),weight:lerp(styles[from].weight,styles[v].weight,blend)};
 let inner=rect(-500-20*split,-330-12*split,1000+40*split,660+24*split,C.paper,28,C.line,2,'filter="url(#soft-shadow)"');
 inner+=`<g opacity="${1-io(clamp(split/.4))}">${text(-430,-265,'专注计时',38,700)}${rect(-460,-282,8,34,C.yellow,4,'none',0)}${line(-440,-220,440,-220)}</g>`;
 if(split>0){
   inner+=`<g opacity="${split*.8}" data-object="${p.id}-attachment-lines">`;
   inner+=line(0,-30,g.stats.x,g.stats.y,'#ADB6B0',2,'stroke-dasharray="7 7"');
   inner+=line(-150,220,g.timer.x,g.timer.y,'#ADB6B0',2,'stroke-dasharray="7 7"');
   inner+=line(230,220,g.button.x,g.button.y,'#ADB6B0',2,'stroke-dasharray="7 7"')+'</g>';
 }
 const st=g.stats,sk=g.progress.stats,tk=g.progress.timerSize,bk=g.progress.button;
 inner+=`<g data-object="${p.id}-stats" transform="translate(${st.x} ${st.y})">`;
 inner+=rect(-st.w/2,-st.h/2,st.w,st.h,style.fill,lerp(style.r,16,sk),style.stroke,2,split>.01?'filter="url(#part-shadow)"':'');
 inner+=text(lerp(-365,-104,sk),lerp(-91,0,sk),'连续',lerp(32,20,sk),400,C.muted);
 inner+=text(lerp(-8,31,sk),lerp(21,0,sk),'7',lerp(182,42,sk),style.weight,C.ink,'middle');
 inner+=text(lerp(99,69,sk),lerp(67,3,sk),'天',lerp(48,22,sk),500,C.ink,'middle');
 if(v===0||(from===0&&blend<1)) inner+=`<g opacity="${(1-k)*(v===0?1:1-blend)}">${Array.from({length:7},(_,i)=>rect(-155+i*46,119,30,7,'#A5AEA7',3,'none',0)).join('')}</g>`;
 inner+='</g>';
 const tm=g.timer;
 inner+=`<g data-object="${p.id}-timer" transform="translate(${tm.x} ${tm.y})">`;
 inner+=rect(-tm.w/2,-tm.h/2,tm.w,tm.h,C.paper,lerp(18,30,tk),C.line,lerp(2,0,tk),split>.01?'filter="url(#part-shadow)"':'');
 inner+=text(0,0,'25:00',lerp(56,164,tk),600,C.ink,'middle','font-variant-numeric="tabular-nums"')+'</g>';
 const b=g.button;
 inner+=`<g data-object="${p.id}-start" transform="translate(${b.x} ${b.y})">`;
 inner+=rect(-b.w/2,-b.h/2,b.w,b.h,blend===1?(v===3?C.yellow:C.neutral):colorMix(from===3?C.yellow:C.neutral,v===3?C.yellow:C.neutral,blend),lerp(from===1?8:18,v===1?8:18,blend),'none',0,split>.01?'filter="url(#part-shadow)"':'');
 inner+=text(0,0,'开始专注',lerp(28,36,bk),600,C.ink,'middle')+'</g>';
 if(p.approved>0) inner+=`<g data-object="approval-sign" opacity="${p.approved}">${rect(289,-322,160,60,C.pale,14,C.yellow,2)}${text(369,-291,'可以',30,600,C.ink,'middle')}</g>`;
 return `<g data-object="${p.id}" data-version="${v}" opacity="${p.opacity??1}" transform="translate(${p.x} ${p.y}) rotate(${p.r||0}) scale(${p.s})">${inner}</g>`;
}
function sleeve(p,open=0,front=false){
 const pad=lerp(0,60,open); let s='';
 if(!front){s=rect(-538,-351,1076,712,C.neutral,32,C.line,2,'filter="url(#soft-shadow)"');}
 else {
  s=rect(-538-pad,-350,30,712,C.neutral,14,C.line,2)+rect(508+pad,-350,30,712,C.neutral,14,C.line,2);
  s+=rect(-538,-350-pad,1076,25,C.neutral,12,C.line,2)+rect(-538,328+pad,1076,34,C.neutral,12,C.line,2);
  s+=text(-466,345+pad,'采用',22,500,C.muted);
 }
 return `<g data-object="adoption-sleeve-${front?'front':'back'}" transform="translate(${p.x} ${p.y}) scale(${p.s})" opacity="${1-open}">${s}</g>`;
}
function reply(p){if(!p)return '';return `<g data-object="reply-pending" opacity="${p.opacity??1}" transform="translate(${p.x} ${p.y}) scale(${p.s??1})">${rect(-140,-54,280,108,C.pale,24,C.yellow,2,'filter="url(#soft-shadow)"')}${text(0,0,'可以',54,600,C.ink,'middle')}</g>`;}
function ai(p){if(!p)return '';const pulse=p.pulse||0;return `<g data-object="AI-interface" opacity="${p.opacity??1}" transform="translate(${p.x} ${p.y}) scale(${p.s??1})">${rect(-122,-167,244,334,C.paper,28,C.line,2,'filter="url(#soft-shadow)"')}${text(0,-88,'AI',52,600,C.ink,'middle')}${rect(-104,-8,208,15,C.ink,7,'none',0)}${rect(-104,-8,208*pulse,15,C.yellow,7,'none',0)}${line(-70,58,70,58)}${line(-70,85,28,85)}${rect(-16,136,32,22,C.ink,6,'none',0)}</g>`;}
function note(p){if(!p)return '';const w=p.w||600,h=p.h||86;return `<g data-object="${p.id||'advice'}" opacity="${p.opacity??1}" transform="translate(${p.x} ${p.y}) scale(${p.s??1})">${rect(-w/2,-h/2,w,h,p.fill||C.paper,20,p.stroke||C.line,2,'filter="url(#part-shadow)"')}${text(0,0,p.text,p.size||40,600,C.ink,'middle')}</g>`;}
function annotations(s){let out='';const p=s.cards.find(x=>x.id==='result');
 if(s.purpose&&p){const g=geometry(p),a=worldPoint(p,-390,-242),b=worldPoint(p,g.timer.x-g.timer.w/2,g.timer.y);const q=s.purpose;
 out+=`<g data-object="task-to-timer" opacity="${q}">${path(`M${a.x} ${a.y} L${a.x-75} ${a.y+26} L${a.x-75} ${b.y} L${b.x-16} ${b.y}`,C.yellow,4,'marker-end="url(#arrow)"')}</g>`;
 }
 if(s.instruction&&p){const g=geometry(p),st=worldPoint(p,g.stats.x+g.stats.w/2,g.stats.y),tm=worldPoint(p,g.timer.x+g.timer.w/2,g.timer.y),q=s.instruction.opacity??1;const k=p.fix||0;
 const retract=s.instruction.retract||0,draw=retract?`pathLength="100" stroke-dasharray="100" stroke-dashoffset="${retract*100}"`:'';
 out+=`<g data-object="instruction-anchors" opacity="${q}">${path(`M1460 386 H1425 V${st.y} H${st.x+12}`,C.yellow,3,draw)}${path(`M1460 448 H1420 V${lerp(650,tm.y,k)} H${tm.x+12} V${tm.y}`,C.yellow,3,draw)}<circle cx="${st.x}" cy="${st.y}" r="6" fill="${C.yellow}" opacity="${1-retract}"/><circle cx="${tm.x}" cy="${tm.y}" r="6" fill="${C.yellow}" opacity="${1-retract}"/></g>`;
 out+=note({id:'specific-instruction',x:1655,y:417,w:390,h:142,size:32,fill:C.pale,stroke:C.yellow,text:'放大计时，弱化统计',opacity:q});
 }
 return out;
}
function caption(str){if(!str)return '';const units=[...str].reduce((n,ch)=>n+(/[\u0000-\u00ff]/.test(ch)?.57:1),0),w=Math.min(1750,units*42+78);return `<g data-object="original-caption">${rect(960-w/2,965,w,78,'rgba(37,38,40,.94)',15,'none',0)}${text(960,1004,str,42,400,'#FFF','middle')}</g>`;}
function svg(s,captionText='',opts={}){
 const cam=s.cam||{cx:960,cy:470,z:1};let world='';
 if(s.sleeve)world+=sleeve(s.sleeve,s.sleeve.open||0,false);
 if(s.tray)world+=rect(150,660,1620,165,'#EEF0EC',26,C.line,2);
 for(const p of s.cards)world+=card(p);
 if(s.sleeve)world+=sleeve(s.sleeve,s.sleeve.open||0,true);
 if(s.requestPanel){const rp=s.requestPanel;world+=`<g opacity="${rp.opacity??1}">${rect(rp.x,rp.y,600,145,C.paper,22,C.line,2)}${text(rp.x+36,rp.y+67,rp.text||'…',44,500,C.muted)}</g>`;}
 if(s.requests)for(const r of s.requests)world+=note({id:r.id||'request',...r});
 if(s.versionLabels)for(const l of s.versionLabels)world+=`<g opacity="${l.opacity??1}">${text(l.x,l.y,l.text,32,600,C.muted,'middle')}</g>`;
 world+=ai(s.ai)+reply(s.reply)+note(s.advice)+note(s.emptyFeedback);
 world+=annotations(s);
 if(s.channel)world+=`<g opacity="${s.channelOpacity??1}">${text(960,126,'桌子的频道',58,700,C.ink,'middle')}</g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" style="font-family:Microsoft YaHei, sans-serif"><defs><radialGradient id="bg"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="${C.canvas}"/></radialGradient><filter id="soft-shadow" x="-30%" y="-35%" width="170%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#252628" flood-opacity=".10"/></filter><filter id="part-shadow" x="-35%" y="-50%" width="180%" height="220%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#252628" flood-opacity=".08"/></filter><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8Z" fill="${C.yellow}"/></marker><clipPath id="scene-window"><rect x="0" y="0" width="1920" height="905"/></clipPath></defs><rect width="1920" height="1080" fill="url(#bg)"/><g clip-path="url(#scene-window)"><g id="world" transform="translate(960 470) scale(${cam.z}) translate(${-cam.cx} ${-cam.cy})">${world}</g></g>${opts.hideMeta?'':text(80,65,'界面示意',23,400,'#8A918F')}${opts.hideCaption?'':caption(captionText)}</svg>`;
}
module.exports={C,clamp,lerp,io,travel,ease,stateCard,geometry,worldPoint,svg};
