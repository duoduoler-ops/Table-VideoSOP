import React from 'react';
import {Poster,palette as c} from './Poster';
const font='Microsoft YaHei, sans-serif';
function Txt({x,y,size=32,children,...rest}){return <text x={x} y={y} fontSize={size} fontFamily={font} fill={c.ink} {...rest}>{children}</text>}
export function Scene({s,caption=''}){
 const {camera:cam,paper:p,selection:r}=s;
 return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{display:'block',background:c.background}}>
 <defs><filter id="shadow" x="-30%" y="-30%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="13" floodColor={c.ink} floodOpacity=".11"/></filter></defs>
 <rect width="1920" height="1080" fill={c.background}/>
 <g data-object="world-camera" transform={`translate(960 465) scale(${cam.z}) translate(${-cam.cx} ${-cam.cy})`}>
 <g data-object="feedback-box" opacity={s.feedback} transform={`translate(1370 560) scale(${.92+.08*s.feedback})`}>
 <rect x="-630" y="-300" width="1260" height="600" rx="34" fill="white" stroke={c.line} strokeWidth="3" filter="url(#shadow)"/>
 <path d="M-180 -210V210" stroke={c.line} strokeWidth="2"/>
 {s.feedbackText&&<Txt x="-140" y="-76" size="63" fontWeight="600">{s.feedbackText}</Txt>}
 {s.feedbackText&&<path d={`M${-140+s.feedbackText.length*63+12} -124V-60`} stroke={c.ink} strokeWidth="4" strokeLinecap="round"/>}
 </g>
 <g data-object="version-3" transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s})`}>
 <g filter="url(#shadow)"><Poster version={3}/></g>
 <g transform="translate(170 -257)"><path d="M-8 0H14V52L3 45L-8 52Z" fill={c.yellow} stroke={c.ink} strokeWidth="1.5"/></g>
 {r&&<g data-object="selection" opacity={s.selectionOpacity??1}>
 <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill="none" stroke={c.yellow} strokeWidth={4/p.s} />
 {[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]].map(([x,y],i)=><rect key={i} x={x-5/p.s} y={y-5/p.s} width={10/p.s} height={10/p.s} fill="white" stroke={c.ink} strokeWidth={1.6/p.s}/>)}
 </g>}
 {s.cursor&&<g data-object="selection-cursor" transform={`translate(${s.cursor.x} ${s.cursor.y}) scale(${.9/p.s})`} opacity={s.cursor.opacity??1}><path d="M0 0L2 38L13 28L23 46L32 41L23 25L37 24Z" fill={c.ink} stroke="white" strokeWidth="2.8" strokeLinejoin="round"/></g>}
 </g>
 <g data-object="advice" transform={`translate(${s.advice.x} ${s.advice.y}) rotate(${s.advice.r??0})`} opacity={s.advice.opacity??1}>
 <rect x="-190" y="-60" width="380" height="120" rx="21" fill={c.yellow} filter="url(#shadow)"/>
 <path d="M-190 6L-224 28L-190 43" fill={c.yellow}/>
 <Txt x="0" y="19" size="60" fontWeight="750" textAnchor="middle">说具体</Txt>
 </g>
 </g>
 {caption&&<g data-object="caption"><rect x={960-(caption.length*42+88)/2} y="973" width={caption.length*42+88} height="73" rx="14" fill={c.ink}/><Txt x="960" y="1023" size="42" textAnchor="middle" style={{fill:'white'}}>{caption}</Txt></g>}
 </svg>;
}

