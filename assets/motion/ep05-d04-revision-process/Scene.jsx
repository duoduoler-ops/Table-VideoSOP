// Source-preserving MG excerpt: M1 separately; M3/M4 complete reading/revision/handoff.
// No G02/character image, audio, font file, chapter card, or external asset included.
// 2026-09-24 v15 重做：D04 静态关键帧。画面是时间 t 的函数（t＝段内局部秒），关键帧取自同一条时间表。
// 纯 MG 直接在 G2 画布上；苹果框只装 G02。镜头＝整画面变换（World），框与内容一起动。
import React from 'react';
import data from './source-data.json';
import TL from './source-timeline.cjs';
import M from './model.cjs';
const {clamp,lerp,seg,easeIO,reveal,travel,drop,slide,squash,hash,cam,toScreen,PAGE,LAY,DOC,TRACK,STUCK_IDX,p5h,reading,caretWorld,pageXform,pageHeight,P5_OLD,P5_NEW,SEQ,N,N5,X0,XK,DX,X5,WAVE_A,CY,PUNCT,SEQ_A,SEQ_B,envAt,wavePts,knotPts,pd,stripRect}=M;

const EV = TL.EV;
export const C = data.tokens.colors;
export const G2 = data.tokens.background.css;
export const ui = 'Segoe UI, Microsoft YaHei, PingFang SC, sans-serif';
const cardShadow = data.tokens.shape.cardShadow, winShadow = data.tokens.shape.windowShadow;
const P = data.page, DUR = data.wave.duration, B = data.bounds;
const HL = 'rgba(255,101,0,0.13)'; // 读过的字：action 色 13% 底，只改底色不改字重

// ---------- 通用小件 ----------
const Txt = ({children, style, className = 'txt'}) => <div className={className} style={{position: 'absolute', whiteSpace: 'nowrap', fontFamily: ui, color: C.ink, ...style}}>{children}</div>;
function ReadPara({text, count = 0, caret = false, hl = 1, top, width = 616, style}) {
  const n = Math.floor(count);
  return <div className="txt" style={{position: 'absolute', left: PAGE.pad, top, width, fontFamily: ui, fontSize: 18, lineHeight: `${LAY.lh}px`, color: C.ink, ...style}}>
    {[...text].map((ch, i) => <React.Fragment key={i}>
      {caret && i === n && <Caret />}
      <span style={{background: i < n && hl > 0 ? HL : 'transparent', opacity: 1}}>{ch}</span>
    </React.Fragment>)}
    {caret && n >= [...text].length && <Caret />}
  </div>;
}
const Caret = () => <span style={{display: 'inline-block', position: 'relative', width: 0, height: 20, verticalAlign: '-3px'}}><span style={{position: 'absolute', left: -1.5, top: -2, width: 3, height: 24, borderRadius: 2, background: C.action}} /></span>;

// ---------- M1 系列底座（与 D03 尾帧同一组几何） ----------
function BaseStack({t}) {
  const slabs = [['DESIGN.md', 630, -16, true], ['AGENTS.md', 718, 22, true], ['SOP', 806, 0, false]];
  const rec = easeIO(seg(t, EV.recedeA, EV.recedeB));
  const slotO = 1 - seg(t, EV.slotFadeA, EV.slotFadeB);
  return <div style={{position: 'absolute', left: 0, top: 0, transformOrigin: '960px 757px', transform: `scale(${1 - 0.03 * rec})`, opacity: 1 - 0.65 * rec}}>
    {slotO > 0 && <div style={{position: 'absolute', left: 620, top: 458, width: 680, height: 140, borderRadius: 16, border: `3px dashed ${C.line}`, boxSizing: 'border-box', background: 'rgba(255,255,255,.35)', opacity: slotO}} />}
    {slabs.map(([n, y, dx, isMono], i) => {
      const k = seg(t, EV.basePress + i * 4 / 60, EV.basePress + i * 4 / 60 + 0.24);
      const dy = 4 * Math.sin(Math.PI * k) * (k < 1 ? 1 : 0);
      return <div key={n} style={{position: 'absolute', left: 300 + dx, top: y + dy, width: 1320, height: 80, boxSizing: 'border-box', borderRadius: 16, background: C.card, border: `3px solid ${C.system}`, boxShadow: cardShadow, display: 'flex', alignItems: 'center', padding: '0 30px', gap: 20}}>
        <div className="txt" style={{fontFamily: isMono ? 'Consolas, Microsoft YaHei, monospace' : ui, fontSize: 24, fontWeight: 600, color: C.ink, width: 180}}>{n}</div>
        <div style={{flex: 1, height: 4, borderRadius: 2, background: C.line}} />
        <div style={{width: 120, height: 4, borderRadius: 2, background: C.line}} />
      </div>;
    })}
  </div>;
}

// ---------- 稿纸（主角） ----------
function Paper({t, deleteText}) {
  const X = pageXform(t), H = pageHeight(t);
  const r = reading(t), hlO = 1 - seg(t, EV.hlFadeA, EV.hlFadeB);
  const caretO = seg(t, EV.caretInA, EV.caretInB) * (1 - seg(t, 17.0, 17.2));
  const inS3 = t >= EV.cut2;
  let caretPara = -1;
  if (inS3 && caretO > 0) { if (t >= EV.caretJumpA + 0.1) caretPara = 5; else { caretPara = 3; for (let i = 0; i < 4; i++) if (r.c[i] < P.p[i].length) { caretPara = i; break; } } }
  const oldO = 1 - seg(t, EV.oldOutA, EV.oldOutB), oldSx = 1 - 0.15 * easeIO(seg(t, EV.oldOutA, EV.oldOutB));
  const newK = easeIO(seg(t, EV.newInA, EV.newInB));
  const h5 = p5h(t), afterTop = LAY.p5 + h5 + 12;
  const fold = t >= EV.unfoldA && t < EV.unfoldB;
  return <div style={{position: 'absolute', left: X.x, top: X.y, width: PAGE.w, height: H, transformOrigin: '0 0', transform: `rotate(${X.rot}deg) scale(${X.s}) scale(${X.sx}, ${X.sy})`}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 16, background: C.card, border: `2px solid ${C.line}`, boxSizing: 'border-box', boxShadow: '0 16px 40px rgba(59,53,46,0.14), 0 2px 8px rgba(59,53,46,0.06)', overflow: 'hidden'}}>
      <Txt style={{left: PAGE.pad, top: LAY.title, fontSize: 34, fontWeight: 600, lineHeight: 1.16}}>{P.title}</Txt>
      <Txt style={{left: PAGE.pad, top: LAY.h1, fontSize: 24, fontWeight: 600, lineHeight: 1.25}}>{P.h1}</Txt>
      {P.p.map((s, i) => <ReadPara key={i} text={s} top={LAY.p[i]} count={inS3 ? r.c[i] : 0} hl={hlO} caret={caretPara === i && caretO > 0} />)}
      <Txt style={{left: PAGE.pad, top: LAY.h2, fontSize: 24, fontWeight: 600, lineHeight: 1.25}}>{P.h2}</Txt>
      {/* 被卡住的长句：改前（手动优化稿原句）→改后（v03 原句） */}
      {oldO > 0 && <div style={{position: 'absolute', left: 0, top: 0, width: '100%', opacity: oldO, transformOrigin: `${PAGE.pad}px ${LAY.p5}px`, transform: `scaleX(${oldSx})`}}>
        <ReadPara text={P.stuckBefore} top={LAY.p5} count={inS3 ? r.c5 : 0} hl={hlO} caret={caretPara === 5 && t < EV.spliceInA && caretO > 0} width={560} />
      </div>}
      {newK > 0 && <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - newK) * 100}% 0 0)`}}>
        <ReadPara text={P.stuckAfter} top={LAY.p5} count={r.c5n} hl={hlO} caret={caretPara === 5 && t >= EV.spliceInA && caretO > 0} />
      </div>}
      {P.after.slice(0, 2).map((s, i) => <div key={i} className="txt" style={{position: 'absolute', left: PAGE.pad, top: afterTop + [0, 38][i], width: 616, fontFamily: ui, fontSize: 18, lineHeight: `${LAY.lh}px`, color: C.ink}}>{s}</div>)}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 44, opacity: seg(H, 420, 540), background: `linear-gradient(rgba(255,253,249,0), ${C.card} 80%)`}} />
      {fold && <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, background: `linear-gradient(${C.card}, ${C.chrome})`, borderTop: `2px solid ${C.line}`}} />}
    </div>
  </div>;
}

// 橙圈（手绘椭圆，页面世界坐标）与确认勾
// 手绘圈：超椭圆贴合两行文字，首尾错开一点（像一笔圈过去）
function ellipsePath(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + 12, ry = b.h / 2 + 4, n = 5; const pts = [];
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i <= 96; i++) { const a = Math.PI * 1.08 + (i / 96) * Math.PI * 2.1; const j = 1 + 0.018 * Math.sin(a * 2 + 0.7); pts.push([cx + rx * j * sp(Math.cos(a), 2 / n), cy + ry * j * sp(Math.sin(a), 2 / n) - 1 + (i / 96) * 4]); }
  return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L');
}
function ProblemMarks({t}) {
  const draw = easeIO(seg(t, EV.circleA, EV.circleB)); if (draw <= 0) return null;
  const sk = easeIO(seg(t, EV.circleShrinkA, EV.circleShrinkB));
  const b = {x: lerp(P5_OLD.x, P5_NEW.x, sk), y: lerp(P5_OLD.y, P5_NEW.y, sk), w: lerp(P5_OLD.w, P5_NEW.w, sk), h: lerp(P5_OLD.h, P5_NEW.h, sk)};
  const o = (1 - seg(t, EV.circleFadeA, EV.circleFadeB)) * (1 - seg(t, 17.0, 17.3));
  const ck = reveal(seg(t, EV.checkA, EV.checkB)), co = 1 - seg(t, EV.docA, EV.docA + 0.01) * 0;
  const d = easeIO(seg(t, EV.docA, EV.docB)), s = lerp(1, DOC.s, d), dx = lerp(0, DOC.x - 620, d), dy = lerp(0, DOC.y - 458, d);
  return <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
    <g transform={`translate(${620 + dx} ${458 + dy}) scale(${s}) translate(-620 -458)`}>
      {o > 0 && <path d={ellipsePath(b)} fill="none" stroke={C.action} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1 1" strokeDashoffset={1 - draw} opacity={o} />}
      {ck > 0 && <g transform={`translate(${P5_NEW.x + P5_NEW.w + 18} ${P5_NEW.y + P5_NEW.h / 2}) scale(${0.6 + 0.4 * ck})`} opacity={ck * co}>
        <circle r="15" fill={C.status} stroke={C.action} strokeWidth="2.5" /><path d="M-6.5 0.5 L-1.5 5.5 L7 -5" fill="none" stroke={C.action} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>}
    </g>
  </svg>;
}

// ---------- 朗读轨 → 配音.wav / 配音.srt ----------
// V06 分段横坐标：time→x（sep 0..1）
function segX(time, sep) {
  const gap = 14 * sep, W = TRACK.w - 11 * gap; let j = 0; while (j < 11 && time >= B[j + 1]) j++;
  return TRACK.x + (time / DUR) * W + j * gap;
}
function segIndex(time) { let j = 0; while (j < 11 && time >= B[j + 1]) j++; return j; }

function VoiceStrip({t}) {
  if (t < EV.stripInA) return null;
  const R = stripRect(t), sx = R.w / 1040, sy = R.h / 80;
  const sep = easeIO(seg(t, EV.sepA, EV.sepB)), gap = 14 * sep;
  // 示意波形（本地坐标 1040×80）
  const lag = EV.waveLag, rr = reading(t - lag);
  const readN = rr.c.reduce((a, b) => a + b, 0) + rr.c5;
  const xEnd = X0 + readN * DX;
  const lineO = 1 - seg(t, EV.lineFadeA, EV.lineFadeB);
  const outK = seg(t, EV.spliceOutA, EV.spliceOutB), inK = seg(t, EV.spliceInA, EV.spliceInB);
  const kn = seg(t, EV.knotA, EV.knotB);
  const smooth = wavePts(X0, Math.min(xEnd, X5), false);
  const rough = xEnd > X5 ? wavePts(X5, Math.min(xEnd, XK), true) : [];
  const knot = kn > 0 ? knotPts(kn) : [];
  const fresh = inK > 0 ? wavePts(X5, X5 + inK * [...P.stuckAfter].length * DX, false, SEQ_B, 1.3) : [];
  const baseK = easeIO(seg(t, EV.baseLineA, EV.baseLineB));
  const ringK = reveal(seg(t, EV.ringA, EV.ringB)) * (1 - seg(t, EV.spliceOutA, EV.spliceOutA + 0.2));
  const micO = 1 - seg(t, EV.micFadeA, EV.micFadeB);
  // 真实峰值条
  const vals = data.wave.values, vmax = Math.max(...vals);
  const bars = t >= EV.barsA ? vals.map((v, i) => {
    const u = (i + 0.5) / vals.length, st = EV.barsA + EV.barsSpread * u, g = easeIO(seg(t, st, st + EV.barDur));
    if (g <= 0) return null; const time = u * DUR, x = sep > 0 ? segX(time, sep) : R.x + u * R.w, yc = R.y + R.h / 2, hh = Math.max(2, Math.pow(v / vmax, 0.8) * 0.42 * R.h) * g;
    return <line key={i} x1={x} x2={x} y1={yc - hh} y2={yc + hh} stroke={C.system} strokeWidth="2.4" strokeLinecap="round" />;
  }) : null;
  return <>
    {/* 朗读轨／配音.wav 卡片：切开前一整张，切线画完（sepA）起换成 12 张，外角不变、内角从 0 长到 10，阴影与卡面分两层画 */}
    <Cards t={t} y={R.y} h={R.h} x={R.x} w={R.w} r={16} ri={10} shadow="drop-shadow(0 10px 13px rgba(59,53,46,0.10))" />

    <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: R.o}}>
      <g transform={`translate(${R.x} ${R.y}) scale(${sx} ${sy})`}>
        {micO > 0 && <g opacity={micO} transform="translate(16 22)"><rect x="3" y="0" width="12" height="22" rx="6" fill="none" stroke={C.system} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><path d="M0 14 Q9 30 18 14 M9 27 V34" fill="none" stroke={C.system} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></g>}
        {lineO > 0 && <g opacity={lineO}>
          <path d={`M${X0} ${CY} H${lerp(X0, 1010, baseK)}`} stroke={C.line} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={pd(smooth)} fill="none" stroke={C.system} strokeWidth="1.6" strokeLinejoin="round" />
          {(rough.length > 0 || knot.length > 0) && <g opacity={1 - outK} transform={`translate(${X5} ${CY}) scale(${1 - 0.85 * outK} ${1 - 0.6 * outK}) translate(${-X5} ${-CY})`}>
            <path d={pd(rough)} fill="none" stroke={C.system} strokeWidth="1.6" strokeLinejoin="round" />
            <path d={pd(knot)} fill="none" stroke={C.system} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </g>}
          {fresh.length > 0 && <path d={pd(fresh)} fill="none" stroke={C.system} strokeWidth="1.6" strokeLinejoin="round" />}
          {ringK > 0 && <circle cx={XK + 20} cy={CY} r={30} fill="none" stroke={C.action} strokeWidth="3.5" opacity={ringK} transform={`translate(${XK + 20} ${CY}) scale(${0.6 + 0.4 * ringK}) translate(${-XK - 20} ${-CY})`} vectorEffect="non-scaling-stroke" />}
        </g>}
      </g>
      {bars}
    </svg>
  </>;
}

function SrtRow({t}) {
  const k = reveal(seg(t, EV.srtRowA, EV.srtRowB)); if (k <= 0) return null;
  const sep = easeIO(seg(t, EV.sepA, EV.sepB)), split = sep > 0.02, yb = TRACK.srtY + (TRACK.srtH - 24) / 2;
  const blocks = data.cues.map((c, i) => {
    const u = c.start / DUR, st = EV.blocksA + EV.blocksSpread * u, g = seg(t, st, st + EV.blockDur); if (g <= 0) return null;
    const e = travel(g), x1 = segX(c.start, sep), x2 = Math.max(x1 + 2, segX(Math.min(c.end, B[segIndex(c.start) + 1] - 1e-6), sep) - 1);
    return <rect key={i} x={x1} y={yb - 60 * (1 - e)} width={x2 - x1} height={24} rx="3" fill={C.system} opacity={0.42 * Math.min(1, g * 2)} />;
  });
  return <>
    <div style={{position: 'absolute', left: 0, top: 0, opacity: k, transform: `translateY(${12 * (1 - k)}px)`}}><Cards t={t} y={TRACK.srtY} h={TRACK.srtH} x={TRACK.x} w={TRACK.w} r={12} ri={8} shadow="drop-shadow(0 6px 10px rgba(59,53,46,0.08))" /></div>
    <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>{blocks}</svg>
  </>;
}

// 轨道卡片：与已确认静态稿同一画法（SVG 描边居中＋整组投影，末态四角半径 ri），末帧与 D05 首帧逐像素对齐。
// 切开前一整张（半径 r）；sepA 起 12 张：外角 r→ri、内角 0→ri，切换那一帧形状不跳。
function rrPath(x, y, w, h, tl, tr, br, bl) {
  return `M${x + tl} ${y} H${x + w - tr} A${tr} ${tr} 0 0 1 ${x + w} ${y + tr} V${y + h - br} A${br} ${br} 0 0 1 ${x + w - br} ${y + h} H${x + bl} A${bl} ${bl} 0 0 1 ${x} ${y + h - bl} V${y + tl} A${tl} ${tl} 0 0 1 ${x + tl} ${y} Z`;
}
function Cards({t, x, y, w, h, r, ri, shadow}) {
  const sep = easeIO(seg(t, EV.sepA, EV.sepB));
  const paths = t < EV.sepA ? [rrPath(x, y, w, h, r, r, r, r)] : B.slice(0, 12).map((b0, j) => {
    const l = segX(b0 + 1e-6, sep), rg = segX(B[j + 1] - 1e-6, sep), cap = (rg - l) / 2;
    const outer = Math.min(lerp(r, ri, sep), cap), inner = Math.min(ri * sep, cap);
    const L = j === 0 ? outer : inner, R = j === 11 ? outer : inner;
    return rrPath(l, y, rg - l, h, L, R, R, L);
  });
  return <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: shadow}}>
    {paths.map((d, i) => <path key={i} d={d} fill={C.card} stroke={C.line} strokeWidth="2" />)}
  </svg>;
}

function FileTag({x, y, label, k}) {
  // k：下落进度（0..1），q：接触轻压
  return <div style={{position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 6px 12px', borderRadius: 14, background: C.card, border: `2px solid ${C.system}`, boxShadow: cardShadow, fontFamily: ui, fontSize: 24, fontWeight: 600, color: C.ink, lineHeight: 1.25, whiteSpace: 'nowrap'}}>
    <svg width="20" height="24" viewBox="0 0 20 24"><path d="M3 1.5 H12 L17.5 7 V21 Q17.5 22.5 16 22.5 H3 Q1.5 22.5 1.5 21 V3 Q1.5 1.5 3 1.5Z M12 1.5 V7 H17.5" fill="none" stroke={C.system} strokeWidth="2" strokeLinejoin="round" /></svg><span className="txt">{label}</span>
  </div>;
}
function Tags({t}) {
  const one = (a, land, settle, y0, label, w) => {
    if (t < a) return null; const k = travel(seg(t, a, land)), q = squash(seg(t, land, settle + 0.1));
    return <div style={{position: 'absolute', left: 1760 - w, top: y0 - 70 * (1 - k), opacity: Math.min(1, seg(t, a, a + 0.06) + 0), transformOrigin: '50% 100%', transform: `scale(${1 + 0.03 * q}, ${1 - 0.06 * q})`}}><FileTag x={0} y={0} label={label} /></div>;
  };
  return <>
    {one(EV.wavTagA, EV.wavTagLand, EV.wavTagSettle, TRACK.wavY + TRACK.wavH / 2 - 23, '配音.wav', 186)}
    {one(EV.srtTagA, EV.srtTagLand, EV.srtTagSettle, TRACK.srtY + TRACK.srtH / 2 - 23, '配音.srt', 180)}
  </>;
}

// ---------- 场景 ----------
export function World({t, children}) {
  const c = cam(t);
  return <div style={{position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', transform: `translate(960px,540px) scale(${c.z}) translate(${-c.cx}px,${-c.cy}px)`}}>{children}</div>;
}
export function Scene({t, deleteText}) {
  if (t < EV.cut1) return <World t={t}><BaseStack t={t} /><Paper t={t} deleteText={deleteText} /></World>;
  return <World t={t}>
    <Paper t={t} deleteText={deleteText} />
    <ProblemMarks t={t} />
    <VoiceStrip t={t} />
    <SrtRow t={t} />
    <Tags t={t} />
  </World>;
}
