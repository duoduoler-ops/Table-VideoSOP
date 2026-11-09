// MIT. 运动默认件：从系列认可片（第五期 D03 样片 B v4、第08期 D07 v04）的实际代码整理。
// 新场景默认全部使用。某一项确实不适用时，在本段运动标注里写一句原因。
// 时间一律用秒；延迟按 60fps 帧数换算成秒，任何工程帧率通用。
'use strict';
const {cubicBezier} = require('./timing.cjs');

const clamp01 = x => Math.max(0, Math.min(1, x));
const window01 = (t, start, end) => clamp01((t - start) / (end - start));

// 按职责选缓动。不要用一条曲线包办全部动作，也不要拿 smoothstep 做镜头。
const ease = {
  // 镜头推、拉、摇、移：起步果断，后段长收尾。峰值约为平均速度的 2.4 倍，出现在全程约 26% 处。
  camera: cubicBezier(.3, 0, .25, 1),
  push: cubicBezier(.35, .1, .25, 1),
  // 出现、到位。
  reveal: cubicBezier(.16, 1, .3, 1),
  // 转交、快速归位：主要看落点。
  travel: cubicBezier(.22, .72, .22, 1),
  // 过程本身要被看清的动作，如搜索、剥离、展开、收缩。
  process: p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  // 离场：加速离开。
  leave: cubicBezier(.5, 0, .75, .4),
  // 重力下落。
  fall: p => p * p,
};

// 原因发生后，附属件晚多少秒响应：近处 3 帧，较远 5 帧，远处或挂件 7 帧（均按 60fps 计）。
const LAG = {near: 3 / 60, mid: 5 / 60, far: 7 / 60};

const seg = (t, start, end, e = ease.process) => e(window01(t, start, end));
// 单次鼓包：start 开始，持续 dur 秒，0→1→0。
const bump = (t, start, dur) => { const u = (t - start) / dur; return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0; };

// 受力阶跃：被推、被压、被撬的物件从 0 走到 1，带一次过冲再回落。参数取自 D07 横梁：ζ=.55，ω=9.5。
function dampedStep(dt, {zeta = .55, omega = 9.5} = {}) {
  if (dt <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * dt) * (Math.cos(wd * dt) + zeta * omega / wd * Math.sin(wd * dt));
}
// 余摆：挂件、秤盘、枝梢受力后来回摆几下逐渐停住。参数取自 D07：1.4Hz，exp(−3.2t)。
function sway(dt, {hz = 1.4, decay = 3.2, span = 1.4} = {}) {
  return dt > 0 && dt < span ? Math.sin(dt * 2 * Math.PI * hz) * Math.exp(-dt * decay) : 0;
}
// 接触下压：接触后 0.05 秒压到底，然后指数回弹。参数取自 D07 秤盘。
function press(dt, {rise = .05, tau = .11, span = .5} = {}) {
  return dt > 0 && dt < span ? Math.sin(Math.min(1, dt / rise) * Math.PI / 2) * Math.exp(-dt / tau) : 0;
}
// 落地震动：只用于有分量的接触，0.34 秒内衰减完。参数取自 D07：9Hz×exp(−11t)。
function shake(dt, {hz = 9, decay = 11, span = .34} = {}) {
  return dt > 0 && dt < span ? Math.sin(dt * 2 * Math.PI * hz) * Math.exp(-dt * decay) : 0;
}
// 把一串事件引起的反应叠加起来。events 为 [{t, ...}]；fn(dt, event) 在事件发生 lag 秒后开始起作用。
function respond(t, events, fn, {lag = LAG.near} = {}) {
  let sum = 0;
  for (const e of events) {
    const dt = t - e.t - lag;
    if (dt > 0) sum += fn(dt, e);
  }
  return sum;
}
// 动作包络：预备（反向压缩）→ 放出（拉伸）→ 一次小回正。返回形变量，正数为压缩，负数为拉伸。
// 默认值取自 D07 送件：预备 0.14 秒压缩 7%，放出时拉伸 5%，回正 2%。刚性卡片可以把形变换成同样节奏的位移或倾角。
function actionEnvelope(t, start, {anticipation = .14, release = .16, squash = .07, stretch = .05, settle = .02} = {}) {
  const ant = seg(t, start - anticipation, start) * (1 - seg(t, start, start + .06));
  return squash * ant - stretch * bump(t, start, release) + settle * bump(t, start + release, release);
}
// 有分量的落体：t0 起落，t1 接触，height 为起落高度。返回 {y, squash, contact, follower}。
// 下落按重力加速；接触后压缩 9%，回弹到 −2.5%，再归零；附属件晚 3 帧下压后弹回。
// 下落至少要能看见 0.3 秒（30fps 下 9 帧），且接触前最后一帧位移不超过物体高度的 1/3。
// 不满足时降低起落高度或提早起落，不要移动接触时刻，也不要改成匀速。
function drop(t, t0, t1, height) {
  if (t < t0) return {y: -height, squash: 0, contact: false, follower: 0};
  if (t < t1) {
    const u = (t - t0) / (t1 - t0);
    return {y: -height * (1 - u * u), squash: -.05 * u * u, contact: false, follower: 0};
  }
  const dt = t - t1;
  let squash = 0;
  if (dt < .05) squash = .09 * (dt / .05);
  else if (dt < .15) squash = .09 + (-.025 - .09) * ((dt - .05) / .10);
  else if (dt < .32) squash = -.025 * (1 - (dt - .15) / .17);
  const lag = dt - LAG.near;
  const follower = lag > 0 && lag < .34 ? Math.sin(Math.PI * lag / .17) * Math.exp(-lag / .16) : 0;
  return {y: 0, squash, contact: true, follower};
}
// 动作链：按配音词点排相邻动作。beats 为 [{id, at, dur}]，at 是关键词时刻。
// 每个动作在词点前 lead 秒起势，关键变化落在词上，不提前到词点之前。
// 相邻动作之间只差一小段（小于 minGap）时，把上一个动作的收尾延长到下一个起势之后 overlap 秒，
// 让余势和下一动作的起势重叠，而不是“停稳再起”。
// 返回 {windows, gaps}：gaps 列出超过 minGap 秒、没有任何动作在进行的空档，排时阶段就要处理掉，
// 可以用上一动作的余摆、下一动作的预备或一次有目的的镜头运动来补。
function chain(beats, {overlap = .12, lead = .1, minGap = .5} = {}) {
  const windows = [];
  for (const b of beats) {
    const start = b.at - lead;
    const prev = windows[windows.length - 1];
    if (prev && start - prev.end > -overlap && start - prev.end < minGap) prev.end = start + overlap;
    windows.push({id: b.id, start, end: start + b.dur});
  }
  return {windows, gaps: findGaps(windows, {minGap})};
}
// 找出时间表里没有任何动作在进行的空档（读字窗口另行登记，不在这里豁免）。
function findGaps(windows, {minGap = .5, from = null, to = null} = {}) {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = from ?? (sorted[0]?.start ?? 0);
  for (const w of sorted) {
    if (w.start - cursor >= minGap) gaps.push({start: cursor, end: w.start, duration: w.start - cursor});
    cursor = Math.max(cursor, w.end);
  }
  if (to != null && to - cursor >= minGap) gaps.push({start: cursor, end: to, duration: to - cursor});
  return gaps;
}
// 给 createCameraMove／handoffCamera 的 timing 参数：按镜头职责曲线从 start 走到 end。
const cameraTiming = (start, end, e = ease.camera) => t => e(window01(t, start, end));

module.exports = {ease, LAG, clamp01, window01, seg, bump, dampedStep, sway, press, shake, respond, actionEnvelope, drop, chain, findGaps, cameraTiming};
