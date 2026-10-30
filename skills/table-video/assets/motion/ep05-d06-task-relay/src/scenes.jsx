// 2026-09-25 动态：由已确认的 redo-20260924/scenes.jsx 复制，组件参数改为可随时间连续变化（p 由 timeline.cjs 按段内时间算出）。
import React from 'react';
import {Img} from 'remotion';
import {C, CH, DATA, IMG, ui, mono, cardShadow, winShadow, World, Svg, Window, Chip, Label, Cursor, CheckMark, ImageCard, FileCard, RowCard, FileName, clamp, lerp, easeIO} from './parts';
import {AgentsWin, HeidanWin, PromptWin, L, Y} from './docs';
import {D05Plate, G01Row} from './d05plate';

const Q = DATA.quotes;

// ---------- 路由线（橙色＝实际发生的动作路径；按比例画出） ----------
function Route({d, p = 1, dashed = false, w = 4}) {
  if (p <= 0) return null;
  return <Svg><path d={d} pathLength="1" fill="none" stroke={C.action} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
    strokeDasharray={dashed ? '0.012 0.012' : `${p} 1`} markerEnd={p >= 0.999 ? 'url(#arrowO)' : undefined} /></Svg>;
}
const Dot = ({x, y, r = 8}) => <Svg><circle cx={x} cy={y} r={r} fill={C.action} /></Svg>;

// ---------- ChatGPT 对话界面（重绘；深色取自参考截图；只推近上传区与输入区） ----------
export const CW = {x: 2620, y: 1700, w: 1060, h: 600};
// 动态：attachK＝输入框撑开并显示附件（0..1），textK＝提示词填入，send＝发送键形态，press＝按下
function Composer({x, y, w, attachK = 0, textK = 0, send = false, press = 0, attach = null, text = null}) {
  const h = lerp(70, 250, attachK);
  return <div style={{position: 'absolute', left: x, top: y - h, width: w, height: h, borderRadius: 28, background: CH.composer, border: `1px solid ${CH.line}`, boxSizing: 'border-box'}}>
    {attachK > 0 && <div style={{position: 'absolute', left: 22, top: 22, display: 'flex', gap: 18, opacity: clamp((attachK - 0.5) / 0.5)}}>{attach}</div>}
    <div style={{position: 'absolute', left: 22, bottom: 18, fontSize: 30, color: CH.text, fontFamily: ui, lineHeight: '34px'}}>＋</div>
    {textK > 0 && <div className="txt" style={{position: 'absolute', left: 66, right: 236, bottom: 20, fontFamily: ui, fontSize: 18, lineHeight: 1.45, color: CH.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: textK}}>{text}</div>}
    {textK < 1 && <div style={{position: 'absolute', left: 66, bottom: 22, fontFamily: ui, fontSize: 18, color: CH.muted, opacity: 1 - textK}}>问问 ChatGPT</div>}
    <div style={{position: 'absolute', right: 108, bottom: 16, height: 38, padding: '0 14px', borderRadius: 19, background: CH.pill, color: CH.muted, fontFamily: ui, fontSize: 15, lineHeight: '38px'}}>思考强度</div>
    <div style={{position: 'absolute', right: 16, bottom: 14, width: 42, height: 42, borderRadius: 21, background: send ? '#ECECEC' : CH.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 - 0.1 * press})`}}>
      {send
        ? <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 16 V4 M4.5 9.5 L10 4 L15.5 9.5" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg width="20" height="20" viewBox="0 0 20 20">{[4, 8, 12, 16].map((v, i) => <path key={i} d={`M${3 + i * 4.6} ${10 - [3, 6, 4, 2][i]} V${10 + [3, 6, 4, 2][i]}`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />)}</svg>}
    </div>
    <svg width="22" height="26" viewBox="0 0 22 26" style={{position: 'absolute', right: 64, bottom: 22}}><rect x="7" y="2" width="8" height="13" rx="4" fill="none" stroke={CH.text} strokeWidth="2" /><path d="M3.5 11 Q3.5 19 11 19 Q18.5 19 18.5 11 M11 19 V24" fill="none" stroke={CH.text} strokeWidth="2" strokeLinecap="round" /></svg>
  </div>;
}
// 聊天里的附件：身份图缩略图；画风图只以文件方块出现（不入画）。
const IdThumb = ({s = 110, chip = true}) => <div style={{position: 'relative', width: s, height: s}}>
  <Img src={IMG.identity} style={{width: s, height: s, objectFit: 'cover', borderRadius: 14, display: 'block'}} />
  {chip && <Chip x={-6} y={s - 26} size={20}>身份</Chip>}
</div>;
const StyleTile = ({s = 110, chip = true}) => <div style={{position: 'relative', width: s * 2, height: s, borderRadius: 14, background: CH.pill, border: `1px solid ${CH.line}`, boxSizing: 'border-box'}}>
  <svg width="36" height="30" viewBox="0 0 36 30" style={{position: 'absolute', left: 16, top: 18}}><rect x="1.5" y="1.5" width="33" height="27" rx="5" fill="none" stroke={CH.text} strokeWidth="2" /><path d="M5 25 L14 14 L20 20 L25 15 L32 25 Z" fill={CH.text} opacity=".6" /></svg>
  <div className="txt" style={{position: 'absolute', left: 16, top: 56, fontFamily: mono, fontSize: 15, color: CH.text, whiteSpace: 'nowrap'}}>画风_STYLE_2.png</div>
  {chip && <Chip x={s * 2 - 76} y={s - 26} size={20}>画风</Chip>}
</div>;

// 动态：{dx, attachK, textK, send, press, sentK（用户消息升起）, genVis（生成区出现）, genP（生成进度）, doneK（下载键）, dlPress, hideImg（首帧已被拿走）}
function ChatWin({st}) {
  const {x, y, w, h} = CW;
  const cw = w - 4, sk = st.sentK || 0;
  return <Window x={x + (st.dx || 0)} y={y} w={w} h={h} title="ChatGPT" bg={CH.bg} style={{opacity: st.opacity ?? 1}}>
    <div style={{position: 'absolute', inset: 0, background: CH.bg}}>
      {sk > 0 && <div style={{opacity: sk, transform: `translateY(${70 * (1 - sk)}px)`}}>
        <div style={{position: 'absolute', right: 60, top: 26, display: 'flex', gap: 14}}><IdThumb s={96} chip={false} /><StyleTile s={96} chip={false} /></div>
        <div className="txt" style={{position: 'absolute', right: 60, top: 136, width: 520, padding: '12px 18px', borderRadius: 22, background: CH.bubble, color: '#fff', fontFamily: ui, fontSize: 18, lineHeight: 1.45, boxSizing: 'border-box', maxHeight: 76, overflow: 'hidden'}}>{Q.imgFirst}若工具不支持该像素尺寸……</div>
      </div>}
      {(st.genVis || 0) > 0 && <div style={{opacity: st.genVis}}><GenImage x={60} y={224} w={480} p={st.genP || 0} doneK={st.doneK || 0} press={st.dlPress || 0} hide={st.hideImg || 0} /></div>}
      <Composer x={60} y={h - 26} w={cw - 120} attachK={st.attachK || 0} textK={st.textK || 0} send={!!st.send} press={st.press || 0} text={Q.imgFirst + '只输出一张完整画面……'}
        attach={<><IdThumb s={120} /><StyleTile s={120} /></>} />
    </div>
  </Window>;
}
// 生成中的图：上部已清晰，下部仍模糊（进度 p）；完成后出现下载键。hide＝首帧已被拿去 Flow（原位变暗留底）。
function GenImage({x, y, w, p, doneK = 0, press = 0, hide = 0}) {
  const h = w * 941 / 1672;
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 18, overflow: 'hidden', background: CH.pill, opacity: 1 - 0.6 * hide}}>
    <Img src={IMG.firstFrame} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px) saturate(.7)', opacity: 0.9}} />
    <div style={{position: 'absolute', left: 0, top: 0, width: '100%', height: `${p * 100}%`, overflow: 'hidden'}}>
      <Img src={IMG.firstFrame} style={{position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'cover'}} />
    </div>
    {p < 1 && <div style={{position: 'absolute', left: 0, top: `${p * 100}%`, width: '100%', height: 36, marginTop: -18, background: 'linear-gradient(rgba(0,0,0,0), rgba(255,255,255,.18), rgba(0,0,0,0))'}} />}
    {doneK > 0 && <div style={{position: 'absolute', right: 14, top: 14, width: 40, height: 40, borderRadius: 12, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: doneK, transform: `scale(${1 - 0.12 * press})`}}>
      <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 3 V13 M5 8.5 L10 13.5 L15 8.5 M4 17 H16" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>}
  </div>;
}

// ---------- 生成区（简化 MG，不仿任何产品界面）：顶部图槽、左缘提示词接口、底部出片口 ----------
export const GZ = {x: 2780, y: 2990, w: 760, h: 470};
// 接口齿形：flow＝四个小齿（对应经验页第 6 节的分项写法），other＝两个宽齿。
const teeth = kind => kind === 'flow' ? [[0, 44], [66, 44], [132, 44], [198, 44]] : [[10, 96], [130, 96]];
function GenZone({x, y, w = GZ.w, h = GZ.h, name, kind = 'flow', dashed = false, progress = 0, tray = null, opacity = 1}) {
  const stroke = dashed ? C.muted : C.system, body = dashed ? C.card : C.system;
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity}}>
    <svg width={w} height={h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
      <rect x="2" y="2" width={w - 4} height={h - 4} rx="24" fill={body} stroke={stroke} strokeWidth="3" strokeDasharray={dashed ? '14 10' : undefined} />
      <rect x="380" y="24" width="352" height="200" rx="16" fill={dashed ? C.surface : C.card} stroke={dashed ? C.line : C.card} strokeWidth="3" />
      {/* 左缘接口 */}
      <rect x="-10" y="118" width="40" height="264" rx="10" fill={dashed ? C.surface : C.card} stroke={dashed ? C.muted : C.card} strokeWidth="3" strokeDasharray={dashed ? '8 6' : undefined} />
      {teeth(kind).map(([o, hh], i) => <rect key={i} x="-10" y={132 + o} width="22" height={hh - 12} rx="5" fill={dashed ? C.muted : C.system} />)}
      <rect x="380" y="250" width="352" height="14" rx="7" fill={dashed ? C.line : 'rgba(255,253,249,.35)'} />
      {progress > 0 && <rect x="380" y="250" width={352 * clamp(progress)} height="14" rx="7" fill={C.action} />}
      <rect x={w / 2 - 180} y={h - 20} width="360" height="12" rx="6" fill={dashed ? C.line : 'rgba(55,55,51,.35)'} />
    </svg>
    <div className="txt" style={{position: 'absolute', left: 60, top: 34, fontFamily: ui, fontSize: 40, fontWeight: 600, color: dashed ? C.ink : C.card, whiteSpace: 'nowrap', lineHeight: 1.16}}>{name}</div>
    <div style={{position: 'absolute', left: 380, top: 24, width: 352, height: 200, borderRadius: 16, overflow: 'hidden'}}>{tray}</div>
  </div>;
}

// ---------- 提示词分项卡（从文件里取的真实行；右缘齿形表示写法） ----------
// rows：[{role:'身份', text}]；flow：Flow 专属分项的真实行；rewrite 0..1：按官方文档改写的进度（改写后只画示意横条，不编造文字）。
// 动态补充：teethK 0..1＝右缘齿从四小齿过渡到两宽齿（交叉淡变＋伸缩）；headerB/headerK＝标题标签交叉淡变；squash＝入口接触时的轻压。
function Slip({x, y, w = 470, rot = 0, lift = 0, header, headerB = null, headerK = 0, headerTone = 'action', headerSize = 24, rows = [], flow = [], rewrite = 0, kind = 'flow', teethK = null, lit = false, teethOff = false, lines = [], s = 1, squash = 0, opacity = 1, style = {}}) {
  const flowH = flow.length * 36 + 24;
  const tk = teethK ?? (kind === 'other' ? 1 : 0);
  const k = teeth(kind === 'mix' ? 'flow' : kind);
  const Teeth = ({kk, o, sy}) => <svg width="24" height="300" style={{position: 'absolute', right: -22, top: 30, overflow: 'visible', opacity: o}}>
    {teeth(kk).map(([oo, hh], i) => <rect key={i} x="0" y={oo} width="20" height={hh - 12} rx="5" fill={C.system} transform={`scale(1 ${sy})`} style={{transformOrigin: `0 ${oo + (hh - 12) / 2}px`}} />)}
  </svg>;
  return <div style={{position: 'absolute', left: x, top: y, width: w, opacity, transform: `rotate(${rot}deg) scale(${s * (1 - 0.02 * squash)}, ${s * (1 + 0.03 * squash)})`, transformOrigin: '100% 50%', ...style}}>
    <div style={{position: 'relative', borderRadius: 16, background: C.card, border: `2px solid ${lit ? C.action : C.system}`, boxShadow: `0 ${10 + lift}px ${26 + lift}px rgba(59,53,46,${0.10 + lift * 0.005})`, padding: '18px 22px 16px'}}>
      {header && <Chip x={18} y={-24 - (headerSize - 24)} tone={headerTone} size={headerSize} style={{opacity: headerB ? 1 - headerK : 1}}>{header}</Chip>}
      {headerB && headerK > 0 && <Chip x={18} y={-24 - (headerSize - 24)} tone={headerTone} size={headerSize} style={{opacity: headerK}}>{headerB}</Chip>}
      <div style={{height: 12}} />
      {lines.map((l, i) => <div key={'l' + i} className="txt" style={{fontFamily: ui, fontSize: 18, lineHeight: 1.45, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4}}>{l}</div>)}
      {rows.map((r, i) => <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10}}>
        <div className="txt" style={{flex: 'none', padding: '3px 10px', borderRadius: 12, border: `2px solid ${C.action}`, background: C.status, color: C.action, fontFamily: ui, fontSize: 23, fontWeight: 600}}>{r.role}</div>
        <div className="txt" style={{fontFamily: ui, fontSize: 18, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{r.text}</div>
      </div>)}
      {flow.length > 0 && <div style={{position: 'relative', marginTop: 6, height: flowH, borderRadius: 10, background: C.line}}>
        {flow.map((t, i) => <div key={i} className="txt" style={{position: 'absolute', left: 14, right: 14, top: 12 + i * 36, fontFamily: ui, fontSize: 18, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 1 - clamp(rewrite * 1.6 - i * 0.18)}}>{t}</div>)}
        {rewrite > 0 && [0, 1, 2].map(i => { const q = clamp(rewrite * 1.5 - 0.3 - i * 0.15); return <div key={i} style={{position: 'absolute', left: 14, top: 18 + i * 44, height: 14, borderRadius: 7, width: `${q * [80, 64, 72][i]}%`, background: C.system, opacity: 0.55}} />; })}
      </div>}
    </div>
    {/* 右缘齿（与生成区左缘接口对应） */}
    {!teethOff && tk < 1 && <Teeth kk="flow" o={1 - tk} sy={1 - 0.6 * tk} />}
    {!teethOff && tk > 0 && <Teeth kk="other" o={tk} sy={0.4 + 0.6 * tk} />}
  </div>;
}

// ---------- 苹果框里的生成视频（W5；外框尺寸随镜头构图，标题栏比例固定） ----------
// 动态：play＝播放 G01（静音副本 public/G01_v01_noaudio.mp4，1× 不变速）；源片 00:00.000 对齐段内帧 G01_START_FRAME（全片 04:02.000）。
export const G01_START_FRAME = 1070;
function Film({x, y, w, src, play = false, title = 'G01', opacity = 1}) {
  const h = w * 9 / 16;
  return <Window x={x} y={y} w={w} h={h} title={title} style={{opacity}}>
    <Img src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
    {/* Original video deliberately omitted. The image is an explicitly labeled neutral placeholder. */}
  </Window>;
}

// ---------- 官方文档卡（其他模型；只画示意横条，不编造具体写法） ----------
// 动态：readP＝读取条位置（0..1，线性），readO＝读取条不透明度，pickK＝挑出那条要求的橙框强度。
function DocCard({x, y, w = 470, h = 560, readP = 0, readO = 1, pickK = 0, pick = false, opacity = 1}) {
  const bars = [88, 72, 94, 60, 84, 78, 90, 66, 82, 58];
  const pk = pick ? 1 : pickK;
  return <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 16, background: C.card, border: `2px solid ${C.system}`, boxShadow: cardShadow}} />
    <div style={{position: 'absolute', right: 0, top: 0, width: 46, height: 46, background: C.chrome, borderLeft: `2px solid ${C.system}`, borderBottom: `2px solid ${C.system}`, borderBottomLeftRadius: 10, borderTopRightRadius: 16}} />
    <div className="txt" style={{position: 'absolute', left: 32, top: 28, fontFamily: ui, fontSize: 34, fontWeight: 600, color: C.ink, lineHeight: 1.16}}>官方文档</div>
    <Chip x={32} y={82} tone="ink" size={26}>其他模型</Chip>
    {bars.map((b, i) => { const read = readP > 0 && 150 + i * 38 + 7 < 140 + readP * 380 + 18; return <div key={i} style={{position: 'absolute', left: 32, top: 150 + i * 38, height: 14, width: (w - 64) * b / 100, borderRadius: 7, background: i === 5 && pk > 0 ? mixHex(read ? mixHex(C.line, C.system, 0.45) : C.line, C.action, pk) : read ? mixHex(C.line, C.system, 0.45) : C.line}} />; })}
    {pk > 0 && <div style={{position: 'absolute', left: 20, top: 150 + 5 * 38 - 12, width: w - 40, height: 38, borderRadius: 10, border: `3px solid ${C.action}`, boxSizing: 'border-box', opacity: pk, transform: `scale(${1.04 - 0.04 * pk})`}} />}
    {/* 动态：读取条（Agent 在读）更醒目，读过的行变成浅蓝灰，看得出读到哪 */}
    {readP > 0 && readO > 0 && <div style={{position: 'absolute', left: 16, top: 140 + readP * 380, width: w - 32, height: 36, borderRadius: 8, background: C.system, opacity: 0.30 * readO, boxShadow: `0 3px 0 ${C.system}`}} />}
  </div>;
}
function mixHex(a, b, t) { const h = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }; const x = h(a), y = h(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(t)))).join(',')})`; }

// ---------- V08＝CH05“分段制作”（2026-09-25 按全片章节卡统一样式重画） ----------
// 统一样式以 D04 CH04 为准：章名卡 x160 y150 1116×341、章名 104px、副标题 40px（≤8 字）；小黑蛋 heidan1.png 在 x1586 y312、高 226。
// 主动作：大段表 12 行下移并拉长成 12 条泳道（给章名卡让出上方），章名卡随后落下。画面坐标＝世界坐标减 V8 原点（末镜头 Z1 居中）。
export const V8 = {x: 2100, y: 3450}; // 动态：比静态版（1250,4900）上移，缩短 S5→CH05 的镜头行程；画面坐标（相对 V8）不变
export const CH5 = {title: {x: 160, y: 150, w: 1116, h: 341}, cat: {x: 1586, y: 312, h: 226},
  table: {x: 160, y: 150, pitch: 56, h: 46, w: 1100}, lane: {x: 160, y: 566, pitch: 26, h: 22, w: 1860}};
function Lanes({ext = 0, tableO = 1, rowsO = 1, g01 = null}) {
  const {x: OX, y: OY} = V8, T = CH5.table, LN = CH5.lane;
  const rows = DATA.mainRows;
  return <>
    {tableO > 0 && <div style={{opacity: tableO}}>
      <FileName x={OX + T.x + 8} y={OY + T.y - 94}>制作大段表.md</FileName>
      <Window x={OX + T.x - 20} y={OY + T.y - 46} w={T.w + 40} h={T.pitch * 12 + 18} title="制作大段表.md" />
    </div>}
    {rows.map((r, i) => {
      const m = easeIO(clamp(ext * 1.25 - i * 0.02));
      const y = OY + lerp(T.y + i * T.pitch, LN.y + i * LN.pitch, m), h = lerp(T.h, LN.h, m), w = lerp(T.w, LN.w, m);
      const d06 = r.id === 'D06' && g01;
      const rowO = clamp(1 - m / 0.55), laneO = clamp((m - 0.45) / 0.55);
      return <div key={r.id} style={{position: 'absolute', left: OX + LN.x, top: y, width: w, height: h, opacity: rowsO}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: lerp(14, 11, m), background: C.surface, border: `2px solid ${d06 ? C.action : C.line}`, boxShadow: m > 0.05 && m < 0.95 ? cardShadow : '0 2px 6px rgba(59,53,46,0.08)'}} />
        {rowO > 0 && <div className="txt" style={{position: 'absolute', left: 16, top: (h - 30) / 2, fontFamily: ui, fontSize: 24, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', lineHeight: 1.25, opacity: rowO}}><span style={{fontFamily: mono, color: C.system, marginRight: 10}}>{r.id}</span>{r.name}</div>}
        {rowO > 0 && <div className="txt" style={{position: 'absolute', left: 392, right: 16, top: (h - 26) / 2, fontFamily: ui, fontSize: 18, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: rowO}}>{r.task}</div>}
        {laneO > 0 && <div className="txt" style={{position: 'absolute', left: 10, top: (h - 18) / 2, fontFamily: mono, fontSize: 14, fontWeight: 600, color: C.system, lineHeight: '18px', opacity: laneO}}>{r.id}</div>}
        {laneO > 0 && <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: laneO}}><path d={`M${d06 ? 104 : 58} ${h / 2} H${w - 16}`} stroke={C.system} strokeOpacity=".35" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" /></svg>}
        {d06 && (laneO > 0
          ? <div className="txt" style={{position: 'absolute', left: 50, top: (h - 16) / 2, padding: '0 6px', height: 16, borderRadius: 8, border: `1.5px solid ${C.action}`, background: C.status, color: C.action, fontFamily: ui, fontSize: 12, fontWeight: 600, lineHeight: '14px', boxSizing: 'border-box', opacity: laneO}}>G01</div>
          : <Chip x={300} y={(h - 38) / 2} size={20} style={{opacity: rowO}}>G01</Chip>)}
      </div>;
    })}
  </>;
}
function TitleCard({drop = 1, squash = 0, sub = 1}) {
  const {x: OX, y: OY} = V8, T = CH5.title;
  if (drop <= 0) return null;
  return <div style={{position: 'absolute', left: OX + T.x, top: lerp(OY - T.h - 40, OY + T.y, drop), width: T.w, height: T.h, transformOrigin: '50% 100%', transform: `scale(${1 + 0.015 * squash}, ${1 - 0.03 * squash})`, borderRadius: 16, background: C.card, border: `2px solid ${C.line}`, boxSizing: 'border-box', boxShadow: cardShadow}}>
    <div className="txt" style={{position: 'absolute', left: 72, top: 70, fontFamily: ui, fontSize: 104, fontWeight: 600, lineHeight: 1.16, color: C.ink, whiteSpace: 'nowrap'}}>分段制作</div>
    <div className="txt" style={{position: 'absolute', left: 76, top: 212, fontFamily: ui, fontSize: 40, fontWeight: 400, lineHeight: 1.3, color: C.muted, whiteSpace: 'nowrap', opacity: sub, transform: `translateY(${8 * (1 - sub)}px)`}}>12 段并行</div>
  </div>;
}
function Heidan({k = 1}) {
  const {x: OX, y: OY} = V8, P = CH5.cat;
  if (k <= 0) return null;
  const w = P.h * DATA.heidanSize[0] / DATA.heidanSize[1];
  return <Img src={IMG.heidan} style={{position: 'absolute', left: OX + lerp(1990, P.x, k), top: OY + P.y, height: P.h, width: w, transformOrigin: '50% 100%', transform: `rotate(${lerp(-6, 0, k)}deg)`, filter: 'drop-shadow(0 8px 10px rgba(59,53,46,.14))'}} />;
}

// ---------- 括号：标出文件里的一段（竖线＋两端短横）；p＝画出进度 ----------
function Bracket({x, y1, y2, side = 'right', w = 4, p = 1}) {
  const t = side === 'right' ? -14 : 14;
  if (p <= 0) return null;
  return <Svg><path d={`M${x + t} ${y1} H${x} V${y2} H${x + t}`} pathLength="1" strokeDasharray={`${p} 1`} fill="none" stroke={C.action} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
// ---------- 文件缩回成行：W5 框从文件尺寸收成 G01 行尺寸，内容由文件淡到 G01 行（与 D05 交来的同一行外观） ----------
function Morph({x, y, w, h, k = 0.5, o = 1}) {
  return <Window x={x} y={y} w={w} h={h} title="G01_风掀纸角，黑蛋按住.md" style={{opacity: o}}>
    <div style={{position: 'absolute', inset: 0, padding: '18px 26px', opacity: 1 - k, overflow: 'hidden'}}>
      {[92, 70, 86, 60, 78, 90, 66, 84, 72, 88, 64, 80].map((b, i) => <div key={i} style={{height: 12, borderRadius: 6, background: C.line, width: `${b}%`, margin: '10px 0'}} />)}
    </div>
    <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: k}}><G01Row x={64} y={(h - 60) / 2} w={Math.max(120, w - 92)} lift={0.4} /></div>
  </Window>;
}

// ---------- 屏幕固定角标：重绘界面在画面上时，右上“界面演示” ----------
const DemoTag = ({o = 1}) => <div className="txt" style={{position: 'absolute', right: 28, top: 26, padding: '4px 14px', borderRadius: 14, border: `2px solid ${C.action}`, background: C.status, color: C.action, fontFamily: ui, fontSize: 18, fontWeight: 600, opacity: o}}>界面演示</div>;

// ---------- 世界（动态：p 由 timeline.cjs 的 pAt(t) 给出） ----------
export function Stage({s}) {
  const p = s.p || {};
  const fl = p.fileLabel;
  return <>
    <World cam={p.cam}>
      {p.plate && <D05Plate {...p.plate} />}
      {!p.hideDocs && <><AgentsWin st={p.agents} /><HeidanWin st={p.heidan} /></>}
      {p.wp !== false && <PromptWin st={p.prompt || {}} />}
      {(p.brackets || []).map((b, i) => <Bracket key={i} {...b} />)}
      {(p.routes || []).map((r, i) => <Route key={i} {...r} />)}
      {(p.dots || []).map((d, i) => <Dot key={i} {...d} />)}
      {p.chat && <ChatWin st={p.chat} />}
      {(p.refs || []).map((r, i) => r.kind === 'id' ? <ImageCard key={i} {...r} src={IMG.identity} /> : <FileCard key={i} {...r} />)}
      {p.flow && <GenZone {...GZ} name="Google Flow" kind="flow" {...p.flow} tray={p.flow.tray ? <Img src={IMG[p.flow.tray]} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : null} />}
      {fl && fl.o > 0 && <div className="txt" style={{position: 'absolute', left: 3176, top: 2172 + 10 * (1 - fl.o), opacity: fl.o, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: C.card, border: `1px solid ${C.system}`, fontFamily: ui, fontSize: 24 / 1.8, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', boxShadow: cardShadow}}>
        <svg width={10.5} height={12.6} viewBox="0 0 20 24"><path d="M3 1.5 H12 L17.5 7 V21 Q17.5 22.5 16 22.5 H3 Q1.5 22.5 1.5 21 V3 Q1.5 1.5 3 1.5Z M12 1.5 V7 H17.5" fill="none" stroke={C.system} strokeWidth="2" strokeLinejoin="round" /></svg>G01_首帧_v01.png</div>}
      {p.other && <GenZone {...GZ} name="其他模型" kind="other" dashed {...p.other} />}
      {p.doc && <DocCard {...p.doc} />}
      {(p.slips || []).map((sl, i) => <Slip key={i} {...sl} />)}
      {(p.imgs || []).map((m, i) => <ImageCard key={i} {...m} src={IMG[m.img]} />)}
      {p.film && <Film {...p.film} src={IMG[p.film.img]} />}
      {p.lanes && <Lanes {...p.lanes} />}
      {p.title && <TitleCard {...p.title} />}
      {p.cat != null && <Heidan k={p.cat} />}
      {(p.chips || []).map((c, i) => <Chip key={i} {...c} />)}
      {p.morph && <Morph {...p.morph} />}
      {p.g01 && <G01Row {...p.g01} />}
      {p.cursor && p.cursor.o > 0 && <div style={{position: 'absolute', left: 0, top: 0, zIndex: 5, opacity: p.cursor.o}}><Cursor {...p.cursor} /></div>}
    </World>
    {(p.demoTag || 0) > 0 && <DemoTag o={p.demoTag} />}
  </>;
}
