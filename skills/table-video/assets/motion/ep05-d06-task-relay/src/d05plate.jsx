// 2026-09-25 动态：由 redo-20260924/d05plate.jsx 复制；detached 时表里 G01 行位置留空（不画空槽框），G01 行与光标由世界层单独绘制。
// 2026-09-25 总览修改：D05→D06 交接。
// 按 D05 重做源码（05_制作工程/分段/D05_拆分任务与画面增量/src/redo-20260924/D05Redo.jsx、timeline.cjs，只读）的版式常量与同一份表格数据，
// 重建 D05 末帧（段内 35.983 秒、镜头 Z1.40）里看得见的部分：W5 文档窗、重点审查 R7–R9 行、“生视频段落推荐”标题与表、勾选框、被拎起的 G01 行、光标。
// 目的：D06 第 0 帧与 D05 末帧同字同位（由 scripts/redo-20260924/compare-d05.cjs 逐像素比对）；之后 G01 行卡从表里脱出，表留空槽。
// D05 若改末帧版式，本文件的常量须同步。
import React from 'react';
import {C, DATA, ui, mono, winShadow} from './parts';

const T5 = DATA.d05Tables;
// D05 版式（Z=1 时世界坐标＝画面坐标）
export const D5 = {
  WIN: {x: 40, y: 420, w: 1840, h: 2784, bar: 22}, TX: 64, TR: 1880,
  RISK: {row0: 2036, rowH: 56, cols: [300, 540, 560, 416], x: [64, 364, 904, 1464, 1880], marked: [0, 2, 7]},
  GEN: {h2: 2584, head: 2628, headH: 48, row0: 2676, rowH: 60, box: {x: 76, s: 32}, cols: [520, 1240], x: [120, 640, 1880], x0: 120, g01: 2},
  CAM_END: {cx: 707, cy: 2814, z: 1.40}, // D05 段内 35.950 起的末镜头
  LIFT: {dx: 14, dy: -26, rot: -1.2, s: 1.03}, // D05 拎起终态
};

const Box = ({x, y, w, h, style, children}) => <div style={{position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', ...style}}>{children}</div>;
const rowId = s => { const m = s.match(/^([A-Z]\d{2}|R\d)\s*(.*)$/); return m ? [m[1], m[2]] : ['', s]; };
function RowHead({text, w}) {
  const [id, rest] = rowId(text);
  return <div className="txt" style={{position: 'absolute', left: 16, top: 0, width: w - 28, height: '100%', display: 'flex', alignItems: 'center', paddingTop: 0, boxSizing: 'border-box', gap: 10, whiteSpace: 'nowrap', overflow: 'hidden'}}>
    <span style={{fontFamily: mono, fontSize: 24, fontWeight: 600, color: C.ink, flex: 'none', lineHeight: '28px'}}>{id}</span>
    <span style={{fontFamily: ui, fontSize: 18, fontWeight: 500, color: C.ink, lineHeight: '26px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 0}}>{rest}</span>
  </div>;
}
function Cell({text, w}) {
  return <div className="txt" style={{position: 'absolute', left: 16, top: 0, width: w - 30, height: '100%', display: 'flex', alignItems: 'center', fontFamily: ui, fontSize: 18, lineHeight: '26px', color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{text}</div>;
}
const VLines = ({xs, x0, h}) => <>{xs.slice(1, -1).map((x, i) => <div key={i} style={{position: 'absolute', left: x - x0 - 0.5, top: 0, width: 1, height: h, background: C.line}} />)}</>;
const CheckBox = ({cx, cy, s = 1, o = 1}) => <g transform={`translate(${cx} ${cy}) scale(${s})`} opacity={o}>
  <rect x={-16} y={-16} width={32} height={32} rx="8" fill={C.status} stroke={C.action} strokeWidth="2.5" />
  <path d="M-8 1 L-2 7 L9 -6" fill="none" stroke={C.action} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
</g>;

// G01 行的外观（D05 生视频推荐表的一行：编号格＋一句话动作格），可单独飞出。
// x,y＝未变换时行框左上（世界坐标）；w＝行宽（D05 原宽 1760，飞行中收短，右格截断）；dx,dy,rot,s＝相对变换（旋转与缩放以行宽 20%、行高 50% 为轴）。
export function G01Row({x, y, w = 1760, dx = 0, dy = 0, rot = 0, s = 1, cs = 1, lift = 1, ring = 1, cb = true, o = 1}) {
  const G = D5.GEN, r = T5.gen.rows[G.g01], c0 = Math.min(G.cols[0], w);
  return <>
    <Box x={x} y={y} w={w} h={G.rowH} style={{background: C.surface, borderBottom: `1.5px solid ${C.line}`, opacity: o,
      transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${s})`, transformOrigin: '20% 50%', zIndex: 3,
      boxShadow: `0 ${16 * lift}px ${40 * lift}px rgba(59,53,46,${0.2 * lift}), 0 0 0 2px rgba(255,101,0,${ring})`, borderRadius: 10}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: c0, height: G.rowH, overflow: 'hidden'}}><RowHead text={r[0]} w={c0} /></div>
      {w > c0 + 20 && <div style={{position: 'absolute', left: c0, top: 0, width: w - c0, height: G.rowH, overflow: 'hidden'}}><Cell text={r[1]} w={w - c0} /></div>}
      {w > c0 + 20 && <div style={{position: 'absolute', left: c0 - 0.5, top: 0, width: 1, height: G.rowH, background: C.line}} />}
    </Box>
    {cb && <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <CheckBox cx={x - 28 + dx} cy={y + G.rowH / 2 + dy} s={cs} o={o} />
    </svg>}
  </>;
}

// D05 末帧可见部分。detached＝G01 行已脱出：原位只剩空槽（行框与竖线，无字、无勾选框）。
export function D05Plate({ox = 0, oy = 0, detached = false, cursor = true, o = 1}) {
  const {WIN, TX, TR, RISK, GEN} = D5;
  const H2 = ({y, children}) => <div className="txt" style={{position: 'absolute', left: TX, top: y, whiteSpace: 'nowrap', fontFamily: ui, color: C.ink, fontSize: 24, fontWeight: 600, lineHeight: 1.25}}>{children}</div>;
  return <div style={{position: 'absolute', left: ox, top: oy, width: 0, height: 0, opacity: o}}>
    <Box x={WIN.x} y={WIN.y} w={WIN.w} h={WIN.h} style={{borderRadius: 16, border: `2px solid ${C.line}`, background: C.surface, boxShadow: winShadow, overflow: 'hidden'}}>
      <div style={{height: WIN.bar, background: C.chrome, borderBottom: `1px solid ${C.line}`}} />
    </Box>
    {/* 与 D05 一致：表格层自成层叠上下文（D05 的 Doc 外层有 scale 变换），G01 行的 zIndex 不越出本层，光标画在它上面 */}
    <div style={{position: 'absolute', left: 0, top: 0, isolation: 'isolate'}}>
      {/* 重点审查表：R7–R9（R8 为已标记行，其余淡到 0.55） */}
      {T5.risk.rows.map((r, j) => {
        if (j < 6) return null;
        const marked = RISK.marked.indexOf(j) >= 0;
        const box = marked ? {transform: 'translateX(12px) scale(1.015)', transformOrigin: '0 50%', zIndex: 2, boxShadow: '0 10px 26px rgba(59,53,46,0.16)'} : {opacity: 0.55};
        return <Box key={j} x={TX} y={RISK.row0 + j * RISK.rowH} w={TR - TX} h={RISK.rowH} style={{background: C.surface, borderBottom: `1.5px solid ${C.line}`, ...box}}>
          {marked && <><div style={{position: 'absolute', inset: 0, background: C.status}} /><div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: C.action}} /></>}
          {RISK.cols.map((cw, c) => <div key={c} style={{position: 'absolute', left: RISK.x[c] - TX, top: 0, width: cw, height: RISK.rowH, overflow: 'hidden'}}>{c === 0 ? <RowHead text={r[c]} w={cw} /> : <Cell text={r[c]} w={cw} />}</div>)}
          <VLines xs={RISK.x} x0={TX} h={RISK.rowH} />
        </Box>;
      })}
      <H2 y={GEN.h2}>生视频段落推荐</H2>
      <Box x={GEN.x0} y={GEN.head} w={TR - GEN.x0} h={GEN.headH} style={{background: C.chrome, borderTop: `1px solid ${C.line}`, borderBottom: `1.5px solid ${C.line}`}}>
        {T5.gen.head.map((h, c) => <div key={c} className="txt" style={{position: 'absolute', left: GEN.x[c] - GEN.x0 + 16, top: 0, width: GEN.cols[c] - 28, height: GEN.headH, display: 'flex', alignItems: 'center', fontFamily: ui, fontSize: 18, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden'}}>{h}</div>)}
        <VLines xs={GEN.x} x0={GEN.x0} h={GEN.headH} />
      </Box>
      {T5.gen.rows.map((r, j) => {
        const y = GEN.row0 + j * GEN.rowH;
        if (j === GEN.g01) {
          if (detached) return null; // 动态：行卡已作为独立对象画在世界里（起始位置与 D05 拎起终态相同），表里原位留空
          return <G01Row key={j} x={GEN.x0} y={y} dx={14} dy={-26} rot={-1.2} s={1.03} cb={false} />;
        }
        return <Box key={j} x={GEN.x0} y={y} w={TR - GEN.x0} h={GEN.rowH} style={{background: C.surface, borderBottom: `1.5px solid ${C.line}`, opacity: 0.55}}>
          {GEN.cols.map((cw, c) => <div key={c} style={{position: 'absolute', left: GEN.x[c] - GEN.x0, top: 0, width: cw, height: GEN.rowH, overflow: 'hidden'}}>{c === 0 ? <RowHead text={r[c]} w={cw} /> : <Cell text={r[c]} w={cw} />}</div>)}
          <VLines xs={GEN.x} x0={GEN.x0} h={GEN.rowH} />
        </Box>;
      })}
      <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        {T5.gen.rows.map((_, i) => {
          if (i === GEN.g01 && detached) return null;
          const lifted = i === GEN.g01;
          return <CheckBox key={i} cx={GEN.box.x + GEN.box.s / 2 + (lifted ? 14 : 0)} cy={GEN.row0 + i * GEN.rowH + GEN.rowH / 2 + (lifted ? -26 : 0)} />;
        })}
      </svg>
    </div>
    {cursor && <svg width="1" height="1" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <path transform="translate(334 2806) scale(1)" d="M0 0 L0 30 L8 23 L13 35 L19 32 L14 21 L24 21 Z" fill={C.surface} stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round" style={{filter: 'drop-shadow(0 3px 4px rgba(59,53,46,.25))'}} />
    </svg>}
  </div>;
}
