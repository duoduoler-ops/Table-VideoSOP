// 2026-09-25 动态：三份真实文件窗口（由已确认的 redo-20260924/docs.jsx 复制，版式与锚点不变）。
// 与静态版的区别：高亮、压暗、标签和边框亮起都改成 0..1 的强度，可随时间渐变；提示词窗可从行卡尺寸“展开”（unfold）。
import React from 'react';
import {C, DATA, Window, FileName, Chip, clamp, lerp} from './parts';
import {MdDoc} from './md';

const Q = DATA.quotes;
export const L = {
  WA: {x: 50, y: 0, w: 900},
  WE: {x: 0, y: 1080, w: 1000},
  WP: {x: 1180, y: 1080, w: 1000},
  pad: 36,
};

export const agentsAnchors = {aSec: '镜头设计与节奏路由', aHead: '生图生视频风格与经验入口', aEntry: '准备生图、生视频提示词', aNext: '配音驱动连续 MG 与粗制动画返工经验路由'};
export const heidanAnchors = {hTitle: '黑蛋生图与 Google Flow 制作经验', h6: '6. Google Flow 提示词的固定结构', h6i1: '**输入模式**', h6i3: '**镜头合同**', h6i4: '**逐秒动作合同**', h6i7: '**声音合同**', h7: '7. 固定机位、首尾帧和多参考的选择'};
export const promptAnchors = {
  pTitle: 'G01｜风掀纸角，黑蛋按住', secOrder: '操作顺序', secImg: '生图：G01_首帧', upload: '上传顺序：图1',
  imgFirst: Q.imgFirst, roleHead: '参考图逐张分工：', role1: Q.role1, role2: Q.role2, roleNote: '不同参考各司其职',
  lockIdImg: Q.lockId, role3a: Q.role3a, role3b: Q.role3b, textRule: '允许生成的文字：无', styleImg: Q.style, banImg: '严格禁止：额外人物', selfCheck: '输出前自检',
  secVid: '生视频：G01', vidTool: Q.vidTool, vidIn: '输入：G01_首帧_v01.png', vidOut: '输出原片拟名', vidRange: '原片计划选区间',
  vidFirst: Q.vidFirst, vidInput: Q.vidInput, vidUse: '内容用途：', lockId: Q.lockId, style: Q.style, camera: Q.camera, keep: '必须保持的因果与连续性',
  action: Q.action, act0: '00:00.000–00:00.800', act1: Q.act1, act1b: '00:01.700–00:02.200', act2: Q.act2, act3: Q.act3, act4: '00:02.900–00:04.400', act5: '00:04.400–00:08.000',
  sound: Q.sound, snd1: '00:00.800–00:02.200：一阵轻微', snd2: '00:00.900–00:02.100', snd3: 'SFX @ 00:02.200', snd4: '00:02.200–00:08.000：安静', sndNote: '音效轻而短', banVid: '严格禁止：额外人物', holdVid: '结果看清后的停稳',
  secQa: '回传验收与接入',
};

export const Y = {
  aHead: 432, aEntry: 474, aFileX: 155, aFileY: 501, hTitle: 1132, h6: 3257, h6end: 3700,
  pTitle: 1132, secImg: 1594, imgFirst: 1762, role1: 1963, role2: 2023, lockIdImg: 2097, role3a: 2189, role3bEnd: 2353,
  secVid: 2679, vidTool: 2721, vidFirst: 3029, vidInput: 3063, lockId: 3189, lockIdEnd: 3267, style: 3275, styleEnd: 3353, camera: 3368, action: 3442, act5End: 3732, sound: 3747, snd4End: 3935, wpBottom: 4540,
};

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const mixc = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(t)))).join(',')})`; };
const vars = o => Object.fromEntries(Object.entries(o).map(([k, v]) => ['--' + k, String(clamp(v ?? 0))]));

// agents：{dimK, trigK, fileK}
export function AgentsWin({st = {}}) {
  const {x, y, w} = L.WA;
  const link = '[制作经验](00_系列规则/黑蛋生图与Google%20Flow制作经验.md)';
  const marks = {aEntry: [{text: '准备生图、生视频提示词、参考上传、动作／音效合同或返工前', cls: 'trigger'}, {text: link, cls: 'file', anchor: 'aFile'}]};
  return <div style={vars({dimk: st.dimK, trk: st.trigK, flk: st.fileK})}>
    <FileName x={x + 8} y={y - 48}>AGENTS.md</FileName>
    <Window x={x} y={y} w={w} title="AGENTS.md">
      <div style={{padding: `28px ${L.pad}px 16px`}}>
        <MdDoc src={DATA.agentsSlice} anchors={agentsAnchors} marks={marks} focus={['aHead', 'aEntry']} />
      </div>
    </Window>
  </div>;
}

// heidan：{litK, titleK, sec6K, dimK（按 sec6 或 title 聚焦）}
export function HeidanWin({st = {}}) {
  const {x, y, w} = L.WE;
  const sec6 = (st.sec6K || 0) > 0;
  const cls = {hTitle: 'hl', h6: 'hl6'};
  const focus = sec6 ? ['h6', 'h6i1', 'h6i3', 'h6i4', 'h6i7'] : ['hTitle'];
  return <div style={{...vars({dimk: sec6 ? st.sec6K : st.titleK, hlk: st.titleK}), '--h6k': String(clamp(st.sec6K || 0))}}>
    <style>{`.md .hl6{background:color-mix(in srgb, ${C.status} calc(var(--h6k,0) * 100%), transparent);box-shadow:-8px 0 0 color-mix(in srgb, ${C.status} calc(var(--h6k,0) * 100%), transparent),8px 0 0 color-mix(in srgb, ${C.status} calc(var(--h6k,0) * 100%), transparent)}`}</style>
    <FileName x={x + 8} y={y - 48}>黑蛋生图与 Google Flow 制作经验.md</FileName>
    <Window x={x} y={y} w={w} title="黑蛋生图与 Google Flow 制作经验.md" style={{borderColor: mixc(C.line, C.action, st.litK || 0)}}>
      <div style={{padding: `28px ${L.pad}px 16px`}}>
        <MdDoc src={DATA.heidanMd} anchors={heidanAnchors} cls={cls} focus={focus} />
      </div>
    </Window>
  </div>;
}

// prompt：{reveal, caret, unfold:{w,h}|null, dimK, focus[], roleK, roleChips[3], vidRoleK[3], flowCount, idK, o}
export const FLOW_ONLY = ['vidTool', 'vidFirst', 'camera', 'action', 'act0', 'act1', 'act1b', 'act2', 'act3', 'act4', 'act5', 'sound', 'snd1', 'snd2', 'snd3', 'snd4'];
export function PromptWin({st = {}}) {
  const {x, y, w} = L.WP;
  const cls = {};
  for (const k of ['role1', 'role2', 'role3a', 'role3b']) cls[k] = 'role';
  FLOW_ONLY.slice(0, Math.max(0, Math.round(st.flowCount || 0))).forEach(k => { cls[k] = 'flowmark'; });
  const cx = x - 76;
  const chip = (k, yy, label) => k > 0 ? <Chip x={cx - 10 * (1 - k)} y={yy} style={{opacity: k}}>{label}</Chip> : null;
  const rc = st.roleChips || [0, 0, 0], vc = st.vidRoleK || [0, 0, 0];
  // 展开：窗口可见范围从行卡大小长到整窗（先横后纵），内容随写出逐段出现
  const clip = st.unfold ? `inset(0 ${Math.max(0, w - st.unfold.w)}px calc(100% - ${st.unfold.h}px) 0 round 16px)` : undefined;
  return <div style={{opacity: st.o ?? 1, ...vars({dimk: st.dimK, rok: st.roleK})}}>
    <div style={{opacity: st.nameK ?? 1}}><FileName x={x + 8} y={y - 48}>G01_风掀纸角，黑蛋按住.md</FileName></div>
    <div style={{position: 'absolute', left: x, top: y, width: w, height: 3600, clipPath: clip}}>
      <Window x={0} y={0} w={w} title="G01_风掀纸角，黑蛋按住.md">
        <div style={{padding: `28px ${L.pad}px 16px`}}>
          <MdDoc src={DATA.promptMd} anchors={promptAnchors} cls={cls} focus={st.focus || null} reveal={st.reveal ?? 1} caret={!!st.caret} />
        </div>
      </Window>
    </div>
    {chip(rc[0], Y.role1 + 6, '身份')}{chip(rc[1], Y.role2 + 2, '画风')}{chip(rc[2], Y.role3a + 40, '场景')}
    {chip(vc[0], Y.vidInput + 8, '场景')}{chip(vc[1], Y.lockId + 20, '身份')}{chip(vc[2], Y.style + 20, '画风')}
    {(st.idK || 0) > 0 && <div style={{position: 'absolute', left: x + 26, top: Y.lockId - 10, width: w - 52, height: Y.lockIdEnd - Y.lockId + 20, border: `3px solid ${C.action}`, borderRadius: 10, boxSizing: 'border-box', opacity: st.idK, transform: `scale(${1.03 - 0.03 * st.idK})`}} />}
  </div>;
}
