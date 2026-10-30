// 2026-09-24 D06 重做：通用图形部件。全部按 DESIGN P1/G2/W5/T5/S1/I6 绘制。
// World／Window／Chip／Label／Cursor 改自 D03 重做 parts.jsx（相机作用于整个画面，框与内容一起动）。
import React, {useLayoutEffect, useRef, useState} from 'react';
import {Img, delayRender, continueRender} from 'remotion';
import data from './example-data.json';

export const C = data.tokens.colors;
export const G2 = data.tokens.background.css;
export const ui = 'Segoe UI, Microsoft YaHei, PingFang SC, sans-serif';
export const mono = 'Consolas, Microsoft YaHei, monospace';
export const IMG = data.img;
export const DATA = data;
export const CH = data.chat;
export const cardShadow = data.tokens.shape.cardShadow;
export const winShadow = data.tokens.shape.windowShadow;

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const scaleShadow = (s, k) => s.replace(/(-?\d+(?:\.\d+)?)px/g, (_, n) => `${(+n / k).toFixed(2)}px`);

// ---------- 相机：整画面变换 ----------
// cam 可为 {cx,cy,z} 或 (anchors)=>cam；children 可为 (anchors, ready)=>节点。需要锚点时先测量再定镜。
export function World({cam, children}) {
  const ref = useRef(null);
  const [a, setA] = useState(null);
  const [handle] = useState(() => delayRender('world-measure'));
  const needs = typeof cam === 'function' || typeof children === 'function';
  useLayoutEffect(() => {
    if (!needs || a) { continueRender(handle); return; }
    document.fonts.ready.then(() => {
      const root = ref.current; const prev = root.style.transform;
      root.style.transform = 'none';
      const rb = root.getBoundingClientRect(); const m = {};
      root.querySelectorAll('[data-anchor]').forEach(el => {
        const r = el.getBoundingClientRect();
        m[el.dataset.anchor] = {x: r.left - rb.left, y: r.top - rb.top, w: r.width, h: r.height};
      });
      root.style.transform = prev; setA(m);
    });
  }, [a]);
  const anchors = a || {};
  const c = typeof cam === 'function' ? (a ? cam(a) : {cx: 960, cy: 540, z: 1}) : cam;
  const content = typeof children === 'function' ? children(anchors, !!a) : children;
  return <div ref={ref} style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', transform: `translate(960px,540px) scale(${c.z}) translate(${-c.cx}px,${-c.cy}px)`}}>{content}</div>;
}

export const Svg = ({children, style}) => <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', ...style}}><defs>
  <marker id="arrowO" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2 2 L10 6 L2 10" fill="none" stroke={C.action} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></marker>
</defs>{children}</svg>;

// ---------- W5 苹果框（真实文件、界面、生成视频） ----------
export function Window({x, y, w, h, title = '', children, bg = C.surface, style = {}, contentStyle = {}, lit = false}) {
  const bar = 22;
  return <div style={{position: 'absolute', left: x, top: y, width: w, boxSizing: 'border-box', border: `2px solid ${lit ? C.action : C.line}`, borderRadius: 16, boxShadow: winShadow, background: bg, overflow: 'hidden', ...style}}>
    <div style={{height: bar, background: C.chrome, borderBottom: `1px solid ${C.line}`, position: 'relative', fontFamily: ui, fontSize: 10, fontWeight: 500, color: C.muted, lineHeight: `${bar}px`, textAlign: 'center'}}>
      <div style={{position: 'absolute', left: 12, top: (bar - 7) / 2, display: 'flex', gap: 7}}>{[C.chromeRed, C.chromeYellow, C.chromeGreen].map(c => <i key={c} style={{display: 'block', width: 7, height: 7, borderRadius: '50%', background: c}} />)}</div>
      {title}
    </div>
    <div style={{position: 'relative', height: h, overflow: 'hidden', ...contentStyle}}>{children}</div>
  </div>;
}

// 文件名标签：放在窗口左上外侧，给观众看清“这是哪份文件”（24px）。
export const FileName = ({x, y, children, k = 1, tone = 'ink'}) => <div className="txt" style={{position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 10 / k, fontFamily: ui, fontSize: 24 / k, fontWeight: 600, color: tone === 'action' ? C.action : C.ink, whiteSpace: 'nowrap'}}>
  <svg width={20 / k} height={24 / k} viewBox="0 0 20 24"><path d="M3 1.5 H12 L17.5 7 V21 Q17.5 22.5 16 22.5 H3 Q1.5 22.5 1.5 21 V3 Q1.5 1.5 3 1.5Z M12 1.5 V7 H17.5" fill="none" stroke={C.system} strokeWidth="2" strokeLinejoin="round" /></svg>{children}
</div>;

// ---------- 状态标签 / 短标签 ----------
export const Chip = ({x, y, k = 1, children, tone = 'action', size = 24, style = {}, className = 'txt'}) => <div className={className} style={{position: 'absolute', left: x, top: y, padding: `${6 / k}px ${14 / k}px`, borderRadius: 14 / k, fontFamily: ui, fontSize: size / k, fontWeight: 600, lineHeight: 1.25, whiteSpace: 'nowrap',
  background: tone === 'action' ? C.status : tone === 'system' ? C.system : C.card, border: `${2 / k}px solid ${tone === 'action' ? C.action : tone === 'system' ? C.system : C.line}`, color: tone === 'action' ? C.action : tone === 'system' ? C.card : C.ink, ...style}}>{children}</div>;
export const Label = ({x, y, k = 1, size = 24, weight = 600, color = C.ink, children, font = ui, style = {}, className = 'txt'}) => <div className={className} style={{position: 'absolute', left: x, top: y, fontFamily: font, fontSize: size / k, fontWeight: weight, lineHeight: 1.25, color, whiteSpace: 'nowrap', ...style}}>{children}</div>;

// 动态：与 D05 光标同形同影（drop-shadow）；k＝抵消镜头缩放，press＝按下时缩小 12%。
export const Cursor = ({x, y, k = 1, press = 0}) => <Svg><path transform={`translate(${x} ${y}) scale(${(1 - 0.12 * press) / k})`} d="M0 0 L0 30 L8 23 L13 35 L19 32 L14 21 L24 21 Z" fill={C.surface} stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round" style={{filter: "drop-shadow(0 3px 4px rgba(59,53,46,.25))"}} /></Svg>;

export const CheckMark = ({x, y, s = 1, color = C.action, bg = C.status}) => <svg width={34 * s} height={34 * s} viewBox="0 0 34 34" style={{position: 'absolute', left: x, top: y, overflow: 'visible'}}>
  <rect x="2" y="2" width="30" height="30" rx="8" fill={bg} stroke={color} strokeWidth="2.5" />
  <path d="M9 17.5 L14.5 23 L25 11" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
</svg>;

// ---------- 图片卡（参考图、回图；静态图不用苹果框） ----------
export function ImageCard({x, y, w, h, src, label, rot = 0, lift = 0, style = {}, labelTone = 'action', fit = 'cover'}) {
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `rotate(${rot}deg)`, ...style}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden', border: `2px solid ${C.line}`, background: C.card, boxShadow: `0 ${10 + lift}px ${26 + lift}px rgba(59,53,46,${0.10 + lift * 0.004})`}}>
      <Img src={src} style={{width: '100%', height: '100%', objectFit: fit, display: 'block'}} />
    </div>
    {label && <Chip x={12} y={-22} tone={labelTone}>{label}</Chip>}
  </div>;
}

// 画风参考只以文件卡出现（公共资产 README：画风图不直接作为成片画面）。
export function FileCard({x, y, w = 250, h = 150, name, label, rot = 0, lift = 0, style = {}, glyph = 'image'}) {
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `rotate(${rot}deg)`, ...style}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 16, border: `2px solid ${C.system}`, background: C.card, boxShadow: `0 ${10 + lift}px ${26 + lift}px rgba(59,53,46,${0.10 + lift * 0.004})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12}}>
      {glyph === 'image' ? <svg width="64" height="50" viewBox="0 0 64 50"><rect x="2" y="2" width="60" height="46" rx="8" fill={C.chrome} stroke={C.system} strokeWidth="3" /><path d="M8 42 L24 22 L34 32 L42 24 L56 42 Z" fill={C.system} opacity=".35" /><circle cx="46" cy="14" r="5" fill={C.system} opacity=".55" /></svg> : null}
      <div className="txt" style={{fontFamily: mono, fontSize: 18, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap'}}>{name}</div>
    </div>
    {label && <Chip x={12} y={-22}>{label}</Chip>}
  </div>;
}

// ---------- D05 交来的 G01 行（真实大段表“生视频段落推荐”的一行，只读快照） ----------
export function RowCard({x, y, w = 940, rot = 0, lift = 0, s = 1, opacity = 1, row = DATA.g01Row, compact = false, style = {}}) {
  const h = compact ? 64 : 112;
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transformOrigin: '0 50%', transform: `rotate(${rot}deg) scale(${s})`, opacity, ...style}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 16, background: C.card, border: `2px solid ${C.action}`, boxShadow: `0 ${10 + lift}px ${26 + lift}px rgba(59,53,46,${0.10 + lift * 0.005})`}} />
    <CheckMark x={20} y={compact ? 15 : 39} />
    <div className="txt" style={{position: 'absolute', left: 72, top: compact ? 14 : 18, fontFamily: ui, fontSize: 24, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap'}}>{row.id}</div>
    {!compact && <div className="txt" style={{position: 'absolute', left: 72, top: 56, fontFamily: mono, fontSize: 18, color: C.muted, whiteSpace: 'nowrap'}}>{row.window}</div>}
    <div style={{position: 'absolute', left: compact ? 196 : 372, top: 12, bottom: 12, width: 2, background: C.line}} />
    <div className="txt" style={{position: 'absolute', left: compact ? 216 : 394, right: 24, top: compact ? 17 : 20, fontFamily: ui, fontSize: 18, lineHeight: 1.45, color: C.ink, overflow: 'hidden', maxHeight: compact ? 27 : 78}}>{row.action}</div>
  </div>;
}

// ---------- 生成区（简化 MG，不仿任何产品界面） ----------
// 蓝灰主体＝处理器（I6）；两个入口：图、提示词；下方出片口。dashed=空白的“其他模型”。
export function GenZone({x, y, w = 760, h = 520, name, dashed = false, progress = 0, slotImg = null, slotText = null, notch = 'flow', dim = false}) {
  const stroke = dashed ? C.muted : C.system;
  const body = dashed ? C.card : C.system;
  const nameColor = dashed ? C.ink : C.card;
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity: dim ? 0.4 : 1}}>
    <svg width={w} height={h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
      <rect x="2" y="2" width={w - 4} height={h - 4} rx="24" fill={body} stroke={stroke} strokeWidth="3" strokeDasharray={dashed ? '14 10' : undefined} />
      {/* 图入口 */}
      <rect x="40" y="96" width="300" height="190" rx="16" fill={dashed ? C.surface : C.card} stroke={dashed ? C.line : C.card} strokeWidth="3" />
      {/* 提示词入口：Flow 口为四齿（对应经验页第 6 节的分项结构），其他模型口为另一种形状 */}
      {notch === 'flow'
        ? <path d={`M380 96 H${w - 40} V286 H380 Z`} fill={dashed ? C.surface : C.card} stroke={dashed ? C.line : C.card} strokeWidth="3" strokeLinejoin="round" />
        : <path d={`M380 96 H${w - 40} V286 H380 Z`} fill={C.surface} stroke={C.muted} strokeWidth="3" strokeDasharray="10 8" strokeLinejoin="round" />}
      {notch === 'flow'
        ? [0, 1, 2, 3].map(i => <rect key={i} x={380 + 14} y={110 + i * 44} width="16" height="30" rx="4" fill={dashed ? C.line : C.system} opacity=".55" />)
        : [0, 1].map(i => <rect key={i} x={380 + 14} y={124 + i * 84} width="40" height="46" rx="8" fill={C.line} />)}
      {/* 进度条（真实进度用线性） */}
      <rect x="40" y="322" width={w - 80} height="16" rx="8" fill={dashed ? C.line : 'rgba(255,253,249,.35)'} />
      {progress > 0 && <rect x="40" y="322" width={(w - 80) * clamp(progress)} height="16" rx="8" fill={C.action} />}
      {/* 出片口 */}
      <rect x={w / 2 - 170} y={h - 22} width="340" height="14" rx="7" fill={dashed ? C.line : 'rgba(55,55,51,.35)'} />
    </svg>
    <div className="txt" style={{position: 'absolute', left: 40, top: 30, fontFamily: ui, fontSize: 34, fontWeight: 600, color: nameColor, whiteSpace: 'nowrap', lineHeight: 1.16}}>{name}</div>
    <div style={{position: 'absolute', left: 40, top: 96, width: 300, height: 190}}>{slotImg}</div>
    <div style={{position: 'absolute', left: 380, top: 96, width: w - 420, height: 190}}>{slotText}</div>
  </div>;
}

// 提示词分项小卡（从文件里取出的真实行，送进生成区）
export function PromptSlip({x, y, w = 420, lines = [], title, rot = 0, lift = 0, tone = 'system', style = {}, bars = 0}) {
  return <div style={{position: 'absolute', left: x, top: y, width: w, transform: `rotate(${rot}deg)`, ...style}}>
    <div style={{borderRadius: 16, background: C.card, border: `2px solid ${tone === 'action' ? C.action : C.system}`, boxShadow: `0 ${10 + lift}px ${26 + lift}px rgba(59,53,46,${0.10 + lift * 0.005})`, padding: '16px 20px 12px'}}>
      {title && <div className="txt" style={{fontFamily: ui, fontSize: 24, fontWeight: 600, color: C.ink, marginBottom: 8, whiteSpace: 'nowrap'}}>{title}</div>}
      {lines.map((l, i) => <div key={i} className="txt" style={{fontFamily: ui, fontSize: 18, lineHeight: 1.45, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4}}>{l}</div>)}
      {Array.from({length: bars}).map((_, i) => <div key={i} style={{height: 10, borderRadius: 5, background: C.line, margin: '10px 0', width: `${[92, 78, 86, 64][i % 4]}%`}} />)}
    </div>
  </div>;
}

export {Img};
