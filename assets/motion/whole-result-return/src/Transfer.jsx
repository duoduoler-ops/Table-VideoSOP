// SPDX-License-Identifier: MIT
import React,{useEffect,useState} from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig,delayRender,continueRender} from 'remotion';
import {Poster,palette as c} from './Poster';
const TL=require('./timeline.cjs');
const font='Segoe UI, Microsoft YaHei, sans-serif';
// Optional captions use local seconds: [[start, end, text], ...]. No source voiceover is bundled.
function Txt({x,y,size=32,fill=c.ink,weight=600,anchor='start',children,...props}){return <text x={x} y={y} fontSize={size} fontFamily={font} fill={fill} fontWeight={weight} textAnchor={anchor} {...props}>{children}</text>;}
function Paper({p}){return <g data-object={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s*(p.sx??1)} ${p.s*(p.sy??1)})`}>
 <g filter="url(#paper-shadow)"><Poster version={p.version}/></g>
 {p.tail!==undefined&&<g transform={`translate(170 -257) rotate(${p.tail})`}><path d="M-8 0H14V52L3 45L-8 52Z" fill={c.yellow} stroke={c.ink} strokeWidth="1.5"/></g>}
 </g>;}
function Cursor({p}){if(p.opacity<=0)return null;return <g opacity={p.opacity} transform={`translate(${p.x} ${p.y}) scale(${1-.12*p.press})`}><path d="M0 0L3 46L15 34L25 54L36 49L25 29L43 28Z" fill={c.ink} stroke="white" strokeWidth="3.5" strokeLinejoin="round"/></g>;}
function Machine({s}){return <g transform={`translate(1230 370) scale(${1+.025*s.pulse} ${1-.025*s.pulse})`}>
 <rect x="-174" y="-160" width="348" height="300" rx="24" fill={c.pale} stroke={c.line} strokeWidth="3" filter="url(#paper-shadow)"/>
 <rect x="-146" y="-134" width="292" height="240" rx="16" fill={c.paper} stroke={c.line} strokeWidth="2"/>
 <Txt x="0" y="-44" size="70" weight="800" anchor="middle">AI</Txt>
 <rect x="-108" y="-5" width="216" height="15" rx="7.5" fill={c.ink}/>
 <rect x="-108" y="-5" width={216*s.pulse} height="15" rx="7.5" fill={c.yellow}/>
 <path d="M-80 38H80 M-80 61H48" stroke={c.line} strokeWidth="8" strokeLinecap="round"/>
 <path d="M-104 128H104" stroke={c.ink} strokeWidth="18" strokeLinecap="round"/>
 <path d="M-105 139H105" stroke={c.paper} strokeWidth="4" strokeLinecap="round"/>
 <rect x="-182" y="-26" width="18" height="69" rx="7" fill={c.ink}/>
 </g>;}
function RequestArea({s}){const w=s.words;return <g opacity={s.requestHold}>
 <circle cx="292" cy="221" r="29" fill={c.ink}/><Txt x="292" y="231" size="29" fill="white" anchor="middle">我</Txt>
 <rect x="340" y="183" width="428" height="330" rx="22" fill={c.paper} stroke={c.line} strokeWidth="3"/>
 {w?['高级一点','自然一点','好看一点'].map((word,i)=><g key={word}><rect x="365" y={214+i*88} width="365" height="70" rx="12" fill={s.wordIndex===i?c.yellowPale:c.paper}/><Txt x="390" y={264+i*88} size="43" weight="650">{word}</Txt></g>):<>
 <Txt x="390" y="276" size="30" fill={c.muted}>怎么改？</Txt>
 <Txt x="520" y="397" size="91" anchor="middle">…</Txt>
 <path d="M385 445H704" stroke={c.line} strokeWidth="3"/></>}
 <path d="M768 343H797L768 370" fill={c.paper} stroke={c.line} strokeWidth="2"/>
 </g>;}
function Expectation({s}){return <g opacity={TL.P(s.t,2.80,3.20,TL.E.reveal)}>
 <path d="M2025 687V1020" stroke={c.line} strokeWidth="8" strokeLinecap="round"/>
 <g transform={`translate(0 ${s.expectY})`}>
 <path d="M508 0H2025" stroke={c.muted} strokeWidth="2.5" strokeDasharray="12 11"/>
 <rect x="2001" y="-12" width="49" height="24" rx="8" fill={c.yellow} stroke={c.ink} strokeWidth="2"/>
 <rect x="2065" y="-43" width="255" height="79" rx="13" fill={c.paper} stroke={c.line} strokeWidth="2"/>
 <Txt x="2090" y="9" size="43" weight="650">我的期待</Txt>
 </g>
 </g>;}
export function Transfer({captions=[],heading='结果与期待'}){
 const [handle]=useState(()=>delayRender('Wait for installed fonts'));
 useEffect(()=>{let active=true;document.fonts.ready.then(()=>active&&continueRender(handle));return ()=>{active=false}},[handle]);
 const f=useCurrentFrame(),{fps}=useVideoConfig(),s=TL.state(f/fps),cam=s.camera;
 const caption=captions.find(([a,b])=>s.t>=a&&s.t<b)?.[2]||'';
 return <AbsoluteFill style={{background:c.background}}>
 <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{display:'block'}}>
 <defs><radialGradient id="background"><stop stopColor="#FFF"/><stop offset="1" stopColor={c.background}/></radialGradient><filter id="paper-shadow" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="13" floodColor="#252628" floodOpacity=".11"/></filter></defs>
 <rect width="1920" height="1080" fill="url(#background)"/>
 <g transform={`translate(960 470) scale(${cam.z}) translate(${-cam.cx} ${-cam.cy})`}>
 {/* The receiving surface is fixed in world coordinates, visible only as the camera reveals it. */}
 <rect x="440" y="875" width="1520" height="590" rx="26" fill="#EFF1ED" stroke={c.line} strokeWidth="2"/>
 <path d="M472 1452H1928" stroke={c.line} strokeWidth="7" strokeLinecap="round"/>
 <Expectation s={s}/>
 <RequestArea s={s}/>
 {s.original.show&&<Paper p={s.original}/>}
 {s.outputs.map(p=><Paper key={p.id} p={p}/>)}
 {s.requests.map(p=><g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s})`}><rect x="-105" y="-41" width="210" height="82" rx="14" fill={c.yellowPale} stroke={c.ink} strokeWidth="2"/><Txt x="0" y="12" size="48" anchor="middle">…</Txt></g>)}
 {/* All paper passing through the source is occluded by the real source body. */}
 <Machine s={s}/>
 <Cursor p={s.pointer}/>
 {s.accept.show&&<g transform={`translate(${s.accept.x} ${s.accept.y}) scale(${s.accept.s})`}>
 <rect x="-112" y="-55" width="224" height="110" rx="24" fill={c.yellowPale} stroke={c.ink} strokeWidth="2.5"/>
 <path d="M-90 55L-105 80L-55 55" fill={c.yellowPale} stroke={c.ink} strokeWidth="2.5"/>
 <Txt x="0" y="20" size="60" anchor="middle">可以</Txt>
 </g>}
 </g>
 <rect x="74" y="54" width="8" height="24" rx="3" fill={c.yellow}/><Txt x="100" y="76" size="24" fill={c.muted} weight="500">{heading}</Txt>
 {caption&&<g><rect x={960-(caption.length*42+88)/2} y="970" width={caption.length*42+88} height="74" rx="14" fill={c.ink}/><Txt x="960" y="1021" size="42" fill="white" weight="500" anchor="middle">{caption}</Txt></g>}
 </svg>
 </AbsoluteFill>;
}
