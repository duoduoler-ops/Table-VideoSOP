#!/usr/bin/env node
// Motion gates 1–5. Numbers default to the ep05 measurement confirmed 2026-10-27.
// Camera arc uses the same screen projection as the ep05 census:
//   [960+(x-cx)*z, 540+(y-cy)*z] on a 1920×1080 reference, independent of preview size.
// A constant vertical origin does not change arc length. frameAt().camera is the only pose source.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import {auditMotion} from './motion-audit.mjs';
import observation from './motion-observation.cjs';
const {visibleState,inspectActionCoverage}=observation;

export const DEFAULT_GATES = {
  freezeNoiseDb: -55,
  freezeMinDuration: 0.75,
  freezeRatioMax: 0.20,
  freezeSegmentMax: 2,
  largeArcPx: 80,
  minMeanPxPerSec: 358,
  revealMaxSec: 1.5,
  holdMaxSec: 4,
  moveOnPxPerSec: 40,
  followWindowSec: 0.5,
  followMinFrames: 3,
  followTargetMinFrames: 6,
  followTargetMaxFrames: 9,
  simultaneousFrames: 3,
  clockFps: 60,
  anticipationMinFrames: 6,
  anticipationMaxFrames: 24,
  anticipationDisplacementPx: 200,
  anticipationAmpRefPx: 8,
  anticipationNoisePx: 1,
  contentWidthMin: 0.6,
  refWidth: 1920,
  refHeight: 1080,
};

export const EP05_REFERENCE = {
  source: '第五期实测，2026-10-27 用户确认。全片静止来自总控 freezedetect 日志，不在本次重跑。',
  freezeRatio: 0.14,
  freezeMaxSec: 1.93,
  freezeSegments: 60,
  freezeSeconds: 63,
  durationSec: 451.4,
  bodyFreezeRatio: 0.15,
  cameraDurationSec: 0.7,
  cameraT80Sec: 0.43,
  cameraMeanPxPerSec: 726,
  cameraHoldSec: 1.15,
  slowestSegmentMeanPxPerSec: 358,
  anticipationAmpPx: 8,
  deform: {compression: 0.07, stretch: 0.095, contact: 0.09, settle: 0.025},
};

const POS_EPS = 0.45;
const PROC_EPS = 0.008;
const SCALE_EPS = 0.008;

export function round(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return null;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}
export function median(values) {
  const s = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return quantile(s, 0.5);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function framesOf(seconds, fps) { return seconds * fps; }
function nearly(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

export function parseClock(text) {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function parseFreezeLog(text) {
  const durationMatch = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
  const timeMatch = text.match(/time=(\d+:\d+:\d+(?:\.\d+))\s/);
  const duration = parseClock(durationMatch?.[1] ?? '') ?? parseClock(timeMatch?.[1] ?? '');
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    const start = line.match(/freeze_start:\s*([0-9.]+)/);
    const dur = line.match(/freeze_duration:\s*([0-9.]+)/);
    const end = line.match(/freeze_end:\s*([0-9.]+)/);
    if (start) events.push({kind: 'start', t: Number(start[1])});
    else if (dur) events.push({kind: 'duration', t: Number(dur[1])});
    else if (end) events.push({kind: 'end', t: Number(end[1])});
  }
  const segments = [];
  let open = null;
  let pending = null;
  for (const ev of events) {
    if (ev.kind === 'start') {
      if (open) segments.push(open);
      open = {start: ev.t, duration: null, end: null, closedAtEnd: false};
      pending = null;
    } else if (ev.kind === 'duration' && open) {
      pending = ev.t;
    } else if (ev.kind === 'end' && open) {
      open.end = ev.t;
      open.duration = pending ?? round(ev.t - open.start, 6);
      segments.push(open);
      open = null;
      pending = null;
    }
  }
  const incomplete = [];
  if (open) {
    // 文件在 freeze_end 之前结束时，用成片 Duration 收尾。第五期日志有 60 个 freeze_start、59 个 freeze_end；
    // 末段 449.9 收到 451.37 后才是宣布的 60 段、累计 63.0 秒。不另跑全片。
    if (duration != null && duration > open.start + 1e-6) {
      open.end = duration;
      open.duration = pending ?? (duration - open.start);
      open.closedAtEnd = true;
      segments.push(open);
    } else incomplete.push({start: open.start, duration: pending, end: null, incomplete: true});
  }
  return {duration, segments: segments.filter(s => s.duration != null), incomplete};
}

function overlaps(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0) > 1e-6; }

export function scoreFreeze({segments, duration, gates = DEFAULT_GATES, exceptions = []}) {
  if (duration == null || !(duration > 0)) {
    return {status: '无法测量', reasons: ['没有成片时长，不能算静止占比。'], measured: {}};
  }
  const usable = segments.filter(s => Number.isFinite(s.duration) && s.duration + 1e-9 >= gates.freezeMinDuration - 1e-9);
  const total = usable.reduce((s, x) => s + x.duration, 0);
  const ratio = total / duration;
  const max = usable.reduce((m, x) => Math.max(m, x.duration), 0);
  const long = usable.filter(s => s.duration + 1e-9 >= gates.freezeSegmentMax);
  const uncovered = long.filter(s => !exceptions.some(ex => overlaps(s.start, s.end ?? s.start + s.duration, ex.t0, ex.t1) && ex.valid !== false));
  const reasons = [];
  if (ratio > gates.freezeRatioMax + 1e-9) reasons.push(`累计静止 ${(ratio * 100).toFixed(1)}% > ${(gates.freezeRatioMax * 100).toFixed(0)}%。`);
  for (const s of uncovered) reasons.push(`静止段 ${round(s.start, 3)}–${round(s.end ?? s.start + s.duration, 3)} 长 ${round(s.duration, 3)} 秒，达到 ${gates.freezeSegmentMax} 秒且没有已登记例外。`);
  const measured = {
    segments: usable.length,
    seconds: round(total, 1),
    duration: round(duration, 3),
    ratio: round(ratio, 4),
    maxSec: round(max, 3),
    longUnregistered: uncovered.map(s => ({start: round(s.start, 3), duration: round(s.duration, 3)})),
  };
  return {
    status: reasons.length ? '未通过' : '通过',
    reasons,
    measured,
    reference: {ratio: EP05_REFERENCE.freezeRatio, maxSec: EP05_REFERENCE.freezeMaxSec, segments: EP05_REFERENCE.freezeSegments, seconds: EP05_REFERENCE.freezeSeconds, duration: EP05_REFERENCE.durationSec},
  };
}

function estSpeed(a, b, dt) {
  const z = Math.max(0.05, (a.z + b.z) / 2);
  const pan = Math.hypot((b.cx - a.cx) * z, (b.cy - a.cy) * z) / dt;
  const zoom = Math.abs(Math.log(b.z / a.z)) * 180 / dt;
  return Math.max(pan, zoom);
}
function screenOf(cam, x, y) {
  return [DEFAULT_GATES.refWidth / 2 + (x - cam.cx) * cam.z, DEFAULT_GATES.refHeight / 2 + (y - cam.cy) * cam.z];
}

export function measureMoves(samples, fps, gates = DEFAULT_GATES, camAt = null) {
  if (samples.length < 3) return {error: '镜头采样少于 3 帧。', moves: []};
  const dt = 1 / fps;
  const poseAt = camAt || (t => {
    let best = samples[0];
    let bestD = Infinity;
    for (const s of samples) {
      const d = Math.abs(s.t - t);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  });
  const on = samples.map((s, i) => i > 0 && estSpeed(samples[i - 1], s, dt) >= gates.moveOnPxPerSec);
  const spans = [];
  let i = 1;
  while (i < samples.length) {
    if (!on[i]) { i++; continue; }
    let j = i;
    while (j < samples.length && on[j]) j++;
    let k = j;
    while (k < samples.length && samples[k].t - samples[j - 1].t < 0.05) {
      if (on[k]) j = k + 1;
      k++;
    }
    const a = samples[i - 1];
    const b = samples[j - 1];
    if (b.t - a.t >= 2 / fps) spans.push([a.t, b.t]);
    i = j;
  }
  // 弧长沿用普查：在同一次 frameAt().camera 上按约 4 倍帧率求值，不另造轨迹表。
  const moves = spans.map(([a, b], idx) => {
    const c0 = poseAt(a);
    const center = {x: c0.cx, y: c0.cy};
    const offset = {x: c0.cx + 180 / c0.z, y: c0.cy + 100 / c0.z};
    const steps = Math.max(8, Math.round((b - a) * fps * 4));
    const arcOf = world => {
      let prev = screenOf(poseAt(a), world.x, world.y);
      let arc = 0;
      const cum = [0];
      let peak = 0;
      const times = [a];
      for (let s = 1; s <= steps; s++) {
        const t = a + (b - a) * s / steps;
        const p = screenOf(poseAt(t), world.x, world.y);
        const step = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        const stepDt = (b - a) / steps;
        peak = Math.max(peak, step / Math.max(1e-6, stepDt));
        arc += step;
        cum.push(arc);
        times.push(t);
        prev = p;
      }
      const total = cum[cum.length - 1] || 0;
      let t50 = null;
      let t80 = null;
      for (let n = 1; n < cum.length; n++) {
        if (t50 == null && cum[n] >= total * 0.5) t50 = times[n] - a;
        if (t80 == null && cum[n] >= total * 0.8) t80 = times[n] - a;
      }
      return {arc: total, peak, t50, t80};
    };
    const C = arcOf(center);
    const O = arcOf(offset);
    const primary = O.arc > C.arc * 1.25 ? 'offset180' : 'center';
    const P = primary === 'offset180' ? O : C;
    const dur = b - a;
    return {
      i: idx, t0: a, t1: b, dur, primary,
      arcPx: P.arc, mean: dur > 0 ? P.arc / dur : 0, peak: P.peak,
      t50: P.t50, t80: P.t80, z0: c0.z,
    };
  });
  return {moves};
}

function roleOf(move, roles) {
  return (roles ?? []).find(r => move.t0 + move.dur / 2 >= r.t0 - 1e-6 && move.t0 + move.dur / 2 <= r.t1 + 1e-6) ?? null;
}

export function scoreCamera({moves, duration, gates = DEFAULT_GATES, roles = null, readings = [], windowStats = null}) {
  if (!moves) return {status: '无法测量', reasons: ['没有镜头采样。'], measured: {}};
  const large = moves.filter(m => m.arcPx + 1e-6 >= gates.largeArcPx);
  if (!large.length) {
    return {status: '无法测量', reasons: [`没有屏幕弧长 ≥ ${gates.largeArcPx}px 的镜头移动。`], measured: {moveCount: moves.length, largeCount: 0}};
  }
  const reasons = [];
  const infoSlow = [];
  const longReveal = [];
  const holds = [];
  const ordered = [...moves].sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);

  // 按大段（窗口）中位数判，不按单次判
  if (windowStats) {
    for (const w of windowStats) {
      if (w.largeCount > 0 && w.medianMeanPxPerSec != null && w.medianMeanPxPerSec < gates.minMeanPxPerSec - 1e-6) {
        reasons.push(`窗口 ${w.id}（${round(w.t0, 3)}–${round(w.t1, 3)}）大移动 ${w.largeCount} 次，中位均速 ${w.medianMeanPxPerSec} px/s < ${gates.minMeanPxPerSec}。`);
      }
    }
  } else {
    // 无窗口信息时用全局中位数判
    const globalMedian = median(large.map(m => m.mean));
    if (globalMedian != null && globalMedian < gates.minMeanPxPerSec - 1e-6) {
      reasons.push(`大移动 ${large.length} 次，中位均速 ${round(globalMedian, 0)} px/s < ${gates.minMeanPxPerSec}。`);
    }
  }

  // 单次 < 358 逐次列出供审片参考，不判失败
  for (const m of large) {
    if (m.mean < gates.minMeanPxPerSec - 1e-6) {
      infoSlow.push(m);
    }
  }

  for (const m of large) {
    if (m.dur > gates.revealMaxSec + 1e-9) {
      const role = roleOf(m, roles);
      const kind = role?.role ?? null;
      if (!roles) {
        reasons.push(`镜头 ${round(m.t0, 3)}–${round(m.t1, 3)} 长 ${round(m.dur, 3)} 秒，适配器没有标明是不是揭示或重构图。`);
        longReveal.push({...m, kind: 'unclassified'});
      } else if (!role) {
        reasons.push(`镜头 ${round(m.t0, 3)}–${round(m.t1, 3)} 长 ${round(m.dur, 3)} 秒，没有落入已声明的镜头职责。`);
        longReveal.push({...m, kind: 'unclassified'});
      } else if ((kind === 'reveal' || kind === 'reframe') && !(role.slowReason && String(role.slowReason).trim())) {
        reasons.push(`揭示或重构图 ${round(m.t0, 3)}–${round(m.t1, 3)} 长 ${round(m.dur, 3)} 秒，没有写明的情绪慢镜理由。`);
        longReveal.push({...m, kind});
      }
    }
    const next = ordered.find(x => x.t0 >= m.t1 - 1e-6 && (x.t0 !== m.t0 || x.t1 !== m.t1));
    const gapEnd = next ? next.t0 : duration;
    const gap = gapEnd == null ? null : gapEnd - m.t1;
    if (gap != null && gap > gates.holdMaxSec + 1e-6) {
      const reading = readings.find(r => r.valid !== false && overlaps(m.t1, Math.min(m.t1 + gates.holdMaxSec, gapEnd), r.t0, r.t1));
      if (!reading) {
        holds.push({t0: m.t1, gap});
        reasons.push(`镜头在 ${round(m.t1, 3)} 结束，之后 ${round(gap, 3)} 秒内没有下一次移动，也没有标注写明的阅读对象。`);
      }
    }
  }
  const unclassified = reasons.some(r => r.includes('没有标明') || r.includes('没有落入'));
  const measured = {
    largeCount: large.length,
    medianMeanPxPerSec: round(median(large.map(m => m.mean)), 0),
    medianDurationSec: round(median(large.map(m => m.dur)), 3),
    medianT50Sec: round(median(large.map(m => m.t50)), 3),
    medianT80Sec: round(median(large.map(m => m.t80)), 3),
    medianPeakPxPerSec: round(median(large.map(m => m.peak)), 1),
    medianHoldSec: round(median(large.map(m => {
      const next = ordered.find(x => x.t0 >= m.t1 - 1e-6 && (x.t0 !== m.t0 || x.t1 !== m.t1));
      return next ? next.t0 - m.t1 : null;
    })), 3),
    slowestMeanPxPerSec: round(Math.min(...large.map(m => m.mean)), 1),
    infoSlow: infoSlow.map(m => ({t0: round(m.t0, 3), t1: round(m.t1, 3), mean: round(m.mean, 1), arcPx: round(m.arcPx, 1)})),
    holds: holds.map(h => ({t0: round(h.t0, 3), gap: round(h.gap, 3)})),
  };
  let status = '通过';
  if (reasons.length) {
    if (holds.length || longReveal.some(m => m.kind === 'reveal' || m.kind === 'reframe') || reasons.some(r => r.includes('中位均速'))) status = '未通过';
    else if (unclassified) status = '无法测量';
  }
  return {
    status,
    reasons: status === '通过' ? [] : reasons,
    measured,
    reference: {
      meanPxPerSec: EP05_REFERENCE.cameraMeanPxPerSec,
      durationSec: EP05_REFERENCE.cameraDurationSec,
      t80Sec: EP05_REFERENCE.cameraT80Sec,
      holdSec: EP05_REFERENCE.cameraHoldSec,
      floorPxPerSec: EP05_REFERENCE.slowestSegmentMeanPxPerSec,
    },
  };
}

function delta(a, b) {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const pos = Math.hypot(dx, dy) > POS_EPS;
  const proc = ['maskProgress', 'pathProgress', 'morphProgress', 'occlusionProgress']
    .some(k => Math.abs((b.process?.[k] ?? 0) - (a.process?.[k] ?? 0)) > PROC_EPS);
  const scale = Math.abs((b.width ?? 0) - (a.width ?? 0)) > SCALE_EPS || Math.abs((b.height ?? 0) - (a.height ?? 0)) > SCALE_EPS;
  const rot = Math.abs((b.rotation ?? 0) - (a.rotation ?? 0)) > 0.15;
  const opacity = Math.abs((b.opacity ?? 1) - (a.opacity ?? 1)) > 0.01;
  return {pos, proc, scale, rot, opacity, causal: pos || proc || scale || rot, dx, dy};
}

function objectAt(frame, id) {
  return frame?.objects?.find(o => o.id === id) ?? null;
}

function visibleObject(o, viewport = {width: DEFAULT_GATES.refWidth, height: DEFAULT_GATES.refHeight}) {
  return visibleState(o,viewport).state==='visible';
}
function localObject(o, frame, viewport = {width: DEFAULT_GATES.refWidth, height: DEFAULT_GATES.refHeight}) {
  if (o.localGeometry) return {...o, ...o.localGeometry};
  // A part without local geometry may still expose a real mask/path process;
  // its inherited rectangle cannot establish its own movement.
  if (o.parentId) return {...o, x: 0, y: 0, width: 0, height: 0, rotation: 0};
  const c = frame?.camera;
  if (c && !o.screenFixed) return {...o, x: (o.x - viewport.width / 2) / c.z + c.cx, y: (o.y - viewport.height / 2) / c.z + c.cy, width: o.width / c.z, height: o.height / c.z};
  return o;
}

export function scoreFollow(samples, beat, gates = DEFAULT_GATES) {
  const scope = {visualAcceptance: 'not-assessed', relationship: beat.timelineRelay ? 'timeline-declared-not-verified' : 'not-assessed', basis: 'Visible declared-object onset timing only; neither causal connection nor expressive strength is established'};
  if (beat.subjectId === beat.attachmentId) return {id: beat.id, ...scope, status: '无法测量', reasons: ['主体与跟随件是同一个对象，不能测部件接力。']};
  const fps = gates.clockFps;
  if (samples.length < 3) return {id: beat.id, status: '无法测量', reasons: ['跟随窗口采样不足。']};
  let subjectOn = null;
  let attachOn = null;
  let receiveOn = null;
  const withinAction = (range, i) => !range || (samples[i - 1].t >= range[0] - 1e-9 && samples[i].t <= range[1] + 1e-9);
  for (let i = 1; i < samples.length; i++) {
    const s0 = objectAt(samples[i - 1].frame, beat.subjectId);
    const s1 = objectAt(samples[i].frame, beat.subjectId);
    const a0 = objectAt(samples[i - 1].frame, beat.attachmentId);
    const a1 = objectAt(samples[i].frame, beat.attachmentId);
    if (!s0 || !s1 || !a0 || !a1) continue;
    const sd = delta(localObject(s0, samples[i - 1].frame, beat.viewport), localObject(s1, samples[i].frame, beat.viewport));
    const ad = delta(localObject(a0, samples[i - 1].frame, beat.viewport), localObject(a1, samples[i].frame, beat.viewport));
    const subjectVisible = visibleObject(s0, beat.viewport) && visibleObject(s1, beat.viewport);
    const attachmentVisible = visibleObject(a0, beat.viewport) && visibleObject(a1, beat.viewport);
    const subjectAction = withinAction(beat.timelineRelay?.fromRange, i);
    const attachmentAction = withinAction(beat.timelineRelay?.toRange, i);
    if (subjectOn == null && subjectVisible && subjectAction && (sd.pos || sd.proc)) subjectOn = samples[i].t;
    if (subjectOn != null && attachOn == null && attachmentVisible && attachmentAction && samples[i].t + 1e-9 >= subjectOn && ad.causal) attachOn = samples[i].t;
    if (attachOn != null && receiveOn == null && attachmentVisible && attachmentAction && samples[i].t > attachOn + (gates.simultaneousFrames / fps) && (ad.proc || ad.scale || ad.rot)) receiveOn = samples[i].t;
  }
  if (subjectOn == null) return {id: beat.id, ...scope, status: '无法测量', reasons: [`${beat.subjectId} 在窗口内没有可见的位置或揭示变化。`]};
  const reasons = [];
  if (attachOn == null || attachOn - subjectOn > gates.followWindowSec + 1e-6) {
    reasons.push(`${beat.attachmentId} 没有在主体启动后 ${gates.followWindowSec} 秒内发生位置、遮罩或形变。`);
    return {id: beat.id, ...scope, status: '未通过', reasons, measured: {subjectOn: round(subjectOn, 3)}};
  }
  const delay = attachOn - subjectOn;
  const delayFrames = framesOf(delay, fps);
  const measured = {subjectOn: round(subjectOn, 3), attachmentOn: round(attachOn, 3), delaySec: round(delay, 4), delayFrames: round(delayFrames, 2), rigid: !!beat.rigid};
  if (beat.rigid) {
    // 测到的是后续遮罩/形变/旋转，是否真是接收反馈仍须看实际画面。
    if (receiveOn == null) reasons.push('刚性组同步或近同步启动，但没有随后的接收反馈（遮罩、形变或旋转）。');
    else measured.receiveOn = round(receiveOn, 3);
  } else if (delayFrames < gates.simultaneousFrames - 1e-6) {
    reasons.push(`错开 ${round(delayFrames, 2)} 帧 < ${gates.simultaneousFrames} 帧，视为同时。`);
  }
  // 6–9 帧是目标参照，不作为失败线
  if (!beat.rigid && delayFrames >= gates.simultaneousFrames - 1e-6) {
    measured.targetNote = delayFrames >= gates.followTargetMinFrames - 1e-6 && delayFrames <= gates.followTargetMaxFrames + 1e-6
      ? '在目标参照 6–9 帧内' : '不在目标参照 6–9 帧内（不判失败）';
  }
  return {id: beat.id, ...scope, status: reasons.length ? '未通过' : '通过', reasons, measured};
}

function pathLength(samples, id, t0, t1) {
  let arc = 0;
  let prev = null;
  for (const s of samples) {
    if (s.t < t0 - 1e-9 || s.t > t1 + 1e-9) continue;
    const o = objectAt(s.frame, id);
    if (!o) continue;
    if (prev) arc += Math.hypot(o.x - prev.x, o.y - prev.y);
    prev = o;
  }
  return arc;
}

export function scoreAnticipation(samples, beat, gates = DEFAULT_GATES) {
  const fps = gates.clockFps;
  const minSec = gates.anticipationMinFrames / fps;
  const maxSec = gates.anticipationMaxFrames / fps;
  const inWindow = samples.filter(s => s.t >= beat.t0 - maxSec - 1e-9 && s.t <= beat.t1 + 1e-9);
  if (inWindow.length < 4) return {id: beat.id, status: '无法测量', reasons: ['预备窗口采样不足。']};
  const steps = [];
  let visiblePairs = 0;
  for (let i = 1; i < inWindow.length; i++) {
    const sa = objectAt(inWindow[i - 1].frame, beat.subjectId);
    const sb = objectAt(inWindow[i].frame, beat.subjectId);
    if (!visibleObject(sa, beat.viewport) || !visibleObject(sb, beat.viewport)) continue;
    visiblePairs++;
    const a = localObject(sa, inWindow[i - 1].frame, beat.viewport), b = localObject(sb, inWindow[i].frame, beat.viewport);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const squash = (a.width - b.width) / (a.width || 1);
    if (len <= 0.05 && !(squash > 0.02)) continue;
    steps.push({t0: inWindow[i - 1].t, t1: inWindow[i].t, dx, dy, len, squash, a, b});
  }
  const runs = [];
  if (!visiblePairs) return {id: beat.id, status: '无法测量', reasons: ['预备窗口内没有连续可见的主体采样。'], visualAcceptance: 'not-assessed'};
  for (const step of steps) {
    const prev = runs[runs.length - 1];
    const aligned = prev && step.t0 - prev.t1 <= 1.5 / fps && (prev.dx * step.dx + prev.dy * step.dy) >= -1e-6;
    if (!prev || !aligned) runs.push({t0: step.t0, t1: step.t1, dx: step.dx, dy: step.dy, path: step.len, squash: step.squash});
    else {
      prev.t1 = step.t1;
      prev.dx += step.dx;
      prev.dy += step.dy;
      prev.path += step.len;
      prev.squash = Math.max(prev.squash, step.squash);
    }
  }
  const main = beat.reveal === true
    ? (runs.find(r => r.path + 1e-6 >= gates.anticipationDisplacementPx) ?? runs[runs.length - 1] ?? null)
    : runs.find(r => r.path + 1e-6 >= gates.anticipationDisplacementPx) ?? null;
  if (!main) {
    return {id: beat.id, status: beat.reveal ? '无法测量' : '通过', reasons: beat.reveal ? ['声明了揭示，但没有采到主体位移。'] : [], measured: {triggered: false, travelPx: round(Math.max(0, ...runs.map(r => r.path), 0), 1), note: '未达到主体位移门槛，也不是已声明的主要物件揭示。'}};
  }
  const travel = main.path;
  const reasons = [];
  const prev = runs[runs.indexOf(main) - 1];
  const dir = Math.hypot(main.dx, main.dy) || 1;
  let amp = 0;
  let prepDur = null;
  if (prev && main.t0 - prev.t1 <= 1.5 / fps) {
    const along = (prev.dx * main.dx + prev.dy * main.dy) / dir;
    const reverse = along < -gates.anticipationNoisePx;
    const squash = !beat.rigid && prev.squash > 0.02;
    prepDur = main.t0 - prev.t0;
    amp = reverse ? -along : 0;
    if (!(reverse || squash) || prepDur + 1e-9 < minSec || prepDur > maxSec + 1e-9) {
      reasons.push(`主动作前的预备持续 ${round(prepDur, 3)} 秒，不在 ${round(minSec, 3)}–${round(maxSec, 3)} 秒的反向预备或蓄力里。`);
    }
  } else {
    reasons.push(`主动作前 ${gates.anticipationMinFrames}–${gates.anticipationMaxFrames} 帧没有反向预备或蓄力。`);
  }
  const measured = {triggered: true, travelPx: round(travel, 1), mainStart: round(main.t0, 3), anticipationSec: prepDur == null ? null : round(prepDur, 3), anticipationAmpPx: round(amp, 1), ampRefPx: gates.anticipationAmpRefPx, rigid: !!beat.rigid};
  return {id: beat.id, status: reasons.length ? '未通过' : '通过', reasons, measured};
}

function visibleContent(o, gates) {
  return visibleState(o,{width:gates.refWidth,height:gates.refHeight}).state==='visible';
}

function unionWidth(frame, ids, gates) {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const id of ids) {
    const o = objectAt(frame, id);
    if (!visibleContent(o, gates)) continue;
    const measured=o.observation?.visibleBounds??o;
    x0 = Math.min(x0, measured.x);
    x1 = Math.max(x1, measured.x + measured.width);
  }
  if (!Number.isFinite(x0)) return null;
  return clamp(x1, 0, gates.refWidth) - clamp(x0, 0, gates.refWidth);
}

export function scoreComposition(samples, cast, gates = DEFAULT_GATES) {
  const ids = cast?.mainContentIds;
  if (!ids?.length) return {status: '无法测量', reasons: ['没有声明主要内容对象，不能算外接框。'], measured: {}};
  const unresolved=ids.filter(id=>samples.some(s=>visibleState(objectAt(s.frame,id),{width:gates.refWidth,height:gates.refHeight}).state==='unknown'));
  const cameraSamples = samples.filter(s => s.camera);
  const moving = new Set();
  for (let i = 1; i < cameraSamples.length; i++) {
    const dt = cameraSamples[i].t - cameraSamples[i - 1].t || 1 / 60;
    if (estSpeed(cameraSamples[i - 1].camera, cameraSamples[i].camera, dt) >= gates.moveOnPxPerSec) moving.add(cameraSamples[i].t);
  }
  // Stable display requires a neighboring unchanged content state as well as a quiet camera.
  // Keep animated reveals out of this display-width check, but do not average a narrow hold away.
  const sameContent = (a, b) => ids.every(id => {
    const x = objectAt(a.frame, id), y = objectAt(b.frame, id);
    const shownX = visibleContent(x, gates), shownY = visibleContent(y, gates);
    if (!shownX && !shownY) return true;
    if (shownX !== shownY) return false;
    const d = delta(x, y);
    return !d.causal && !d.opacity;
  });
  const stable = samples.filter((s, i) => !moving.has(s.t) &&
    ((i > 0 && !moving.has(samples[i - 1].t) && sameContent(samples[i - 1], s)) ||
     (i + 1 < samples.length && !moving.has(samples[i + 1].t) && sameContent(s, samples[i + 1]))));
  const ratios = [];
  const narrowIntervals = [];
  const sampleIndices = new Map(samples.map((s, i) => [s, i]));
  let previousStableIndex = null;
  let lastNarrow = false;
  for (const s of stable) {
    const sampleIndex = sampleIndices.get(s);
    if (previousStableIndex !== sampleIndex - 1) lastNarrow = false;
    previousStableIndex = sampleIndex;
    if ((cast.emptyMood ?? []).some(ex => ex.valid !== false && s.t >= ex.t0 && s.t <= ex.t1)) {lastNarrow = false; continue;}
    const w = unionWidth(s.frame, ids, gates);
    if (w == null) {lastNarrow = false; continue;}
    const ratio = w / gates.refWidth;
    ratios.push(ratio);
    if (ratio < gates.contentWidthMin - 1e-9) {
      if (lastNarrow) {const interval = narrowIntervals.at(-1); interval.end = s.t; interval.samples++; interval.minWidthRatio = Math.min(interval.minWidthRatio, ratio);}
      else narrowIntervals.push({start: s.t, end: s.t, samples: 1, minWidthRatio: ratio});
      lastNarrow = true;
    } else lastNarrow = false;
  }
  if (!ratios.length) return {status: '无法测量', reasons: ['没有可测量的稳定展示帧。',...(unresolved.length?['绘制可见性未决：'+unresolved.join(', ')]:[])], measured: {unresolvedVisibilityObjectIds:unresolved}};
  const med = median(ratios);
  const worst = Math.min(...ratios);
  const reasons = [];
  for (const interval of narrowIntervals) reasons.push(`稳定展示 ${round(interval.start, 3)}–${round(interval.end, 3)} 的主要内容外接框宽度最低 ${(interval.minWidthRatio * 100).toFixed(1)}% < ${(gates.contentWidthMin * 100).toFixed(0)}%，不能由全段中位数抵消。`);
  return {
    status: unresolved.length ? '无法测量' : reasons.length ? '未通过' : '通过',
    reasons: [...reasons,...(unresolved.length?['绘制可见性未决：'+unresolved.join(', ')]:[])],
    measured: {stableFrames: ratios.length, medianWidthRatio: round(med, 3), minWidthRatio: round(worst, 3), narrowIntervals, unresolvedVisibilityObjectIds:unresolved,basis: 'Stable confirmed-painted content width only; spacing, legibility and semantic composition not assessed'},
    reference: {minWidthRatio: gates.contentWidthMin},
  };
}

function anchorOk(item, baseDir) {
  if (!item?.sourceFile || !item?.anchor) return {valid: false, reason: '例外或承诺没有源文件锚点。'};
  const file = path.resolve(baseDir, item.sourceFile);
  if (!fs.existsSync(file)) return {valid: false, reason: `找不到锚点文件 ${file}。`};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(item.anchor)) return {valid: false, reason: `锚点不在源文件中：${item.anchor}`};
  return {valid: true};
}

function bindList(list, baseDir) {
  return (list ?? []).map(item => {
    const check = anchorOk(item, baseDir);
    return {...item, valid: check.valid, anchorReason: check.reason ?? null};
  });
}

export function sampleFrames(frameAt, t0, t1, fps) {
  const samples = [];
  const dt = 1 / fps;
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const time = Math.min(t, t1);
    const frame = frameAt(time);
    if (!frame || !Array.isArray(frame.objects)) throw new Error(`frameAt(${time}) 没有 objects。`);
    const camera = frame.camera ?? null;
    if (camera && (![camera.cx, camera.cy, camera.z].every(Number.isFinite) || camera.z <= 0)) throw new Error(`frameAt(${time}) 的 camera 无效。`);
    samples.push({t: time, frame, camera});
  }
  return samples;
}

function mergeGate(parts) {
  if (!parts.length) return {status: '无法测量', reasons: ['没有可计算的条目。'], measured: {items: []}};
  if (parts.some(p => p.status === '未通过')) return {status: '未通过', reasons: parts.flatMap(p => p.reasons ?? []), measured: {items: parts}};
  if (parts.some(p => p.status === '无法测量')) return {status: '无法测量', reasons: parts.flatMap(p => p.reasons ?? []), measured: {items: parts}};
  return {status: '通过', reasons: [], measured: {items: parts}};
}

// Reuse the production timeline and coverage. Legacy motionCast remains a limited
// numeric input, never evidence that all promised component actions were covered.
export function deriveMotionCast(spec) {
  const cast = {...(spec.motionCast ?? {})};
  const actions = spec.actions ?? [], relays = spec.relays ?? [];
  const follows = relays.filter(r => ['follow', 'rigid-feedback'].includes(r.motionGate)).map(r => {
    const from = actions.find(a => a.id === r.fromAction), to = actions.find(a => a.id === r.toAction);
    const valid = !!from && !!to && from.objectId !== to.objectId && (spec.coverage?.objectIds ?? []).includes(from.objectId) && (spec.coverage?.objectIds ?? []).includes(to.objectId);
    return {id: r.id, subjectId: from?.objectId, attachmentId: to?.objectId, t0: from && to ? Math.max(0, Math.min(from.start, to.start) - 1 / spec.fps) : 0,
      t1: from && to ? Math.max(from.end, to.end) : 0, rigid: r.motionGate === 'rigid-feedback', timelineRelay: {fromAction: r.fromAction, toAction: r.toAction, fromRange: from ? [from.start, from.end] : null, toRange: to ? [to.start, to.end] : null}, viewport: spec.viewport,
      valid, anchorReason: valid ? null : '接力没有指向两个不同且已覆盖的生产动作对象。'};
  });
  const anticipations = actions.filter(a => a.motionGate === 'anticipation').map(a => ({id: a.id, subjectId: a.objectId, t0: a.start, t1: a.end, reveal: a.kind === 'reveal', rigid: a.rigid === true, timelineAction: a.id, viewport: spec.viewport,
    valid: (spec.coverage?.objectIds ?? []).includes(a.objectId), anchorReason: '预备动作对象不在生产 coverage 中。'}));
  const origin = {follows: follows.length ? 'timeline-relays' : 'legacy-motionCast', anticipations: anticipations.length ? 'timeline-actions' : 'legacy-motionCast', mainContentIds: spec.coverage?.mainContentIds ? 'coverage' : 'legacy-motionCast'};
  return {...cast, ...(follows.length ? {follows} : {}), ...(anticipations.length ? {anticipations} : {}), mainContentIds: spec.coverage?.mainContentIds ?? cast.mainContentIds, origin};
}

export function evaluateSpec(spec, {freeze, gates = DEFAULT_GATES, baseDir = process.cwd()} = {}) {
  const cast = deriveMotionCast(spec);
  const windows = cast.cameraWindows?.length ? cast.cameraWindows : [{id: 'all', t0: 0, t1: spec.duration}];
  const fps = spec.fps;
  let cameraError = null;
  const allMoves = [];
  const windowStats = [];
  try {
    for (const w of windows) {
      const cache = new Map();
      const at = t => {
        const key = Math.round(t * 1e6) / 1e6;
        if (!cache.has(key)) cache.set(key, spec.frameAt(key, {windowId: w.id, t0: w.t0, t1: w.t1}));
        return cache.get(key);
      };
      const samples = sampleFrames(at, w.t0, w.t1, fps);
      if (samples.some(s => !s.camera)) throw new Error(`窗口 ${w.id} 的 frameAt 没有 camera。`);
      const measured = measureMoves(samples.map(s => ({t: s.t, ...s.camera})), fps, gates, t => {
        const frame = at(t);
        if (!frame?.camera) throw new Error(`frameAt(${t}) 没有 camera。`);
        return frame.camera;
      });
      if (measured.error) throw new Error(measured.error);
      const large = measured.moves.filter(m => m.arcPx + 1e-9 >= gates.largeArcPx);
      windowStats.push({
        id: w.id, t0: w.t0, t1: w.t1, largeCount: large.length,
        medianMeanPxPerSec: round(median(large.map(m => m.mean)), 0),
        slowestMeanPxPerSec: large.length ? round(Math.min(...large.map(m => m.mean)), 1) : null,
      });
      for (const m of measured.moves) allMoves.push({...m, window: w.id});
    }
  } catch (err) {
    cameraError = String(err.message || err);
  }
  const readings = bindList(cast.reading, baseDir).filter(r => r.valid);
  const roles = cast.cameraRoles ?? null;
  const gate2 = cameraError
    ? {status: '无法测量', reasons: [cameraError], measured: {}}
    : scoreCamera({moves: allMoves, duration: spec.duration, gates, roles, readings, windowStats});
  if (!cameraError) gate2.measured.windows = windowStats;

  const follows = cast.origin.follows === 'timeline-relays' ? cast.follows : bindList(cast.follows, baseDir);
  let gate3;
  if (!follows.length) gate3 = {status: '无法测量', reasons: ['没有要测启动时差的生产接力标记或旧适配器条目。'], measured: {}};
  else if (follows.some(f => !f.valid)) gate3 = {status: '无法测量', reasons: follows.filter(f => !f.valid).map(f => f.anchorReason), measured: {}};
  else {
    const parts = [];
    for (const beat of follows) {
      try {
        const samples = sampleFrames(spec.frameAt, beat.t0, beat.t1, gates.clockFps);
        parts.push(scoreFollow(samples, beat, gates));
      } catch (err) {
        parts.push({id: beat.id, status: '无法测量', reasons: [String(err.message || err)]});
      }
    }
    gate3 = mergeGate(parts);
  }

  // A passing selected relay is only a selected measurement. Compare against all
  // production relationships and actual parent/part changes before aggregating it.
  let actionCoverage=null;
  if(spec.actions&&spec.coverage)try{
    actionCoverage=inspectActionCoverage(spec,sampleFrames(spec.frameAt,0,spec.duration,spec.fps));
    const followCoverage=actionCoverage.follow;
    gate3.measured={...(gate3.measured??{}),coverage:followCoverage};
    const missing=[...followCoverage.uncoveredRelayIds.map(id=>'未测生产接力 '+id),...followCoverage.relatedActionCandidates.map(r=>'尚未辨认父部件关系 '+r.parentAction+' → '+r.partAction)];
    if(missing.length){if(gate3.status!=='未通过')gate3.status='无法测量';gate3.reasons=[...(gate3.reasons??[]),...missing];}
  }catch(err){if(gate3.status!=='未通过')gate3.status='无法测量';gate3.reasons=[...(gate3.reasons??[]),'动作覆盖无法建立：'+String(err.message??err)];}

  const anticipations = cast.origin.anticipations === 'timeline-actions' ? cast.anticipations : bindList(cast.anticipations, baseDir);
  let gate4;
  if (!anticipations.length) gate4 = {status: '无法测量', reasons: ['没有声明要检查的主体位移或主要物件揭示。'], measured: {}};
  else if (anticipations.some(a => !a.valid)) gate4 = {status: '无法测量', reasons: anticipations.filter(a => !a.valid).map(a => a.anchorReason), measured: {}};
  else {
    const parts = [];
    for (const beat of anticipations) {
      try {
        const lead = gates.anticipationMaxFrames / gates.clockFps;
        const samples = sampleFrames(spec.frameAt, Math.max(0, beat.t0 - lead), beat.t1, gates.clockFps);
        parts.push(scoreAnticipation(samples, beat, gates));
      } catch (err) {
        parts.push({id: beat.id, status: '无法测量', reasons: [String(err.message || err)]});
      }
    }
    gate4 = mergeGate(parts);
    gate4.reference = {ampPx: EP05_REFERENCE.anticipationAmpPx, deform: EP05_REFERENCE.deform};
  }

  let gate5;
  if (!cast.mainContentIds?.length) {
    gate5 = {status: '无法测量', reasons: ['没有声明主要内容对象，不能算外接框。'], measured: {}};
  } else try {
    const samples = sampleFrames(spec.frameAt, 0, spec.duration, Math.min(fps, 30));
    const emptyMood = bindList(cast.emptyMood, baseDir);
    gate5 = scoreComposition(samples, {...cast, emptyMood}, gates);
  } catch (err) {
    gate5 = {status: '无法测量', reasons: [String(err.message || err)], measured: {}};
  }

  const exceptions = bindList(cast.freezeExceptions, baseDir);
  const gate1 = freeze
    ? scoreFreeze({segments: freeze.segments, duration: freeze.duration, gates, exceptions})
    : {status: '无法测量', reasons: ['没有 freezedetect 结果。'], measured: {}};
  if (freeze?.source) gate1.measured.source = freeze.source;

  const gatesOut = [
    {id: 1, name: '全帧静止比例', ...gate1},
    {id: 2, name: '声明窗口的镜头数值', ...gate2},
    {id: 3, name: '声明对象的启动时差', ...gate3},
    {id: 4, name: '触发动作的预备时长', ...gate4},
    {id: 5, name: '稳定主内容外接框宽度', ...gate5},
  ];
  const exitCode = gatesOut.some(g => g.status === '未通过') ? 2 : gatesOut.some(g => g.status !== '通过') ? 1 : 0;
  return {
    status: exitCode === 0 ? '已测数值满足约束' : exitCode === 2 ? '已测数值未满足约束' : '数值测量不完整',
    exitCode,
    visualAcceptance: 'not-assessed',
    actionCoverage,
    scope: {markerOrigin: cast.origin, componentSemantics: 'not-assessed', weight: 'not-assessed', note: '数值结果仅限报告中的对象、动作与窗口；没有测到问题不代表整体质量或部件表达通过。'},
    gates: gatesOut,
    reference: EP05_REFERENCE,
    thresholds: gates,
  };
}

export function runFreezeDetect(video, gates = DEFAULT_GATES, ffmpeg = 'ffmpeg') {
  const noise = `${gates.freezeNoiseDb}dB`;
  const args = ['-hide_banner', '-nostats', '-i', video, '-map', '0:v:0', '-vf', `freezedetect=n=${noise}:d=${gates.freezeMinDuration}`, '-an', '-f', 'null', '-'];
  const result = spawnSync(ffmpeg, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.error) throw new Error(`无法启动 ffmpeg：${result.error.message}`);
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (result.status !== 0 && !text.includes('freeze_start') && !text.includes('Duration:')) {
    throw new Error(`ffmpeg 退出 ${result.status}：${text.slice(-500)}`);
  }
  const parsed = parseFreezeLog(text);
  if (parsed.duration == null) throw new Error('freezedetect 日志里没有时长。');
  return {...parsed, raw: text, source: video};
}

function fileLock(file) {
  const resolved = fs.realpathSync(file), bytes = fs.readFileSync(resolved);
  return {path: resolved, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}

// One entry for old and new adapters: numeric measurements plus the existing
// source/video-bound engineering audit when that production contract is exposed.
export function evaluateMotion(spec, {freeze, gates = DEFAULT_GATES, baseDir = process.cwd(), adapterFile, video, requireVideo = !!video} = {}) {
  const hasAuditContract = !!(spec.coverage || spec.sourceFiles || spec.actions);
  const coverage = {mode: hasAuditContract ? 'production-audit' : 'legacy-declared-numeric-scope', internalProcess: 'unexposed', scriptSemantics: 'not-assessed'};
  let inputLocks;
  // Capture these before the first frameAt call, not after numeric sampling.
  // The later audit must bind the very same versions.
  try {
    if (video && spec.videoFile && fs.realpathSync(path.resolve(baseDir, spec.videoFile)) !== fs.realpathSync(video)) throw new Error('适配器 videoFile 与本次 --video 不同，不能混用证据。');
    const sources = [...new Set([...(spec.sourceFiles ?? []), ...(adapterFile ? [adapterFile] : [])].map(f => fs.realpathSync(path.resolve(baseDir, f))))];
    const selectedVideo = video ?? (spec.videoFile ? path.resolve(baseDir, spec.videoFile) : null);
    inputLocks = {tool: fileLock(fileURLToPath(import.meta.url)), observationTool:fileLock(fileURLToPath(new URL('./motion-observation.cjs',import.meta.url))),sources: sources.map(fileLock), video: selectedVideo ? fileLock(selectedVideo) : null};
  } catch (err) {
    return {status: '测量不完整', exitCode: 1, visualAcceptance: 'not-assessed', coverage, gates: [], engineeringAudit: {status: 'incomplete', visualAcceptance: 'not-assessed', coverageGaps: [String(err.message || err)]}};
  }
  const result = evaluateSpec(spec, {freeze, gates, baseDir});
  result.coverage = coverage;
  result.locks = inputLocks;
  function checkInputLocks() {
    for (const [kind, lock] of [...inputLocks.sources.map(lock => ['Source', lock]),['Observation tool',inputLocks.observationTool], ...(inputLocks.video ? [['Video', inputLocks.video]] : [])]) {
      let current;
      try { current = fileLock(lock.path); } catch { throw new Error(`${kind} changed while sampling: ${lock.path} is no longer readable`); }
      if (current.sha256 !== lock.sha256 || current.path !== lock.path) throw new Error(`${kind} changed while sampling: ${lock.path}`);
    }
  }
  function rejectChangedInputs(err) {
    const reason = String(err.message || err);
    result.engineeringAudit = {status: 'incomplete', visualAcceptance: 'not-assessed', coverageGaps: [reason]};
    result.locks = inputLocks;
    result.gates = result.gates.map(g => ({id: g.id, name: g.name, status: '无法测量', reasons: [reason + '; mixed-version numeric measurements discarded.'], measured: {}}));
    result.exitCode = 1;
    result.status = '测量不完整';
    return result;
  }
  try { checkInputLocks(); } catch (err) { return rejectChangedInputs(err); }
  if (hasAuditContract) {
    try {
      const audit = auditMotion({...spec, ...(video ? {videoFile: video} : {})}, {baseDir, adapterFile, requireVideo});
      if (audit.locks.sources.length !== inputLocks.sources.length || inputLocks.sources.some(lock => !audit.locks.sources.some(a => a.path === lock.path && a.sha256 === lock.sha256))) throw new Error('Source changed between numeric sampling and engineering audit bindings.');
      if (audit.locks.video?.path !== inputLocks.video?.path || audit.locks.video?.sha256 !== inputLocks.video?.sha256) throw new Error('Video changed between numeric sampling and engineering audit bindings.');
      result.engineeringAudit = audit;
      result.locks = {...audit.locks, sources: inputLocks.sources, video: inputLocks.video, gatesTool: inputLocks.tool};
      result.coverage.internalProcess = audit.processCoverage;
      if (audit.findings.length) result.exitCode = 2;
      else if (audit.status === 'incomplete' && result.exitCode !== 2) result.exitCode = 1;
    } catch (err) {
      if (/Source changed|Video changed/.test(String(err.message || err))) return rejectChangedInputs(err);
      result.engineeringAudit = {status: 'incomplete', visualAcceptance: 'not-assessed', coverageGaps: [String(err.message || err)]};
      if (result.exitCode !== 2) result.exitCode = 1;
    }
  } else {
    result.coverage.limitations = ['Legacy motionCast checks only its selected IDs and windows.', 'Internal parts, script promises and production-source association are not covered.'];
  }
  try { checkInputLocks(); } catch (err) { return rejectChangedInputs(err); }
  result.status = result.exitCode === 0 ? '已测约束无异常' : result.exitCode === 2 ? '发现约束失败或待核问题' : '测量不完整';
  return result;
}

export async function loadAdapter(file) {
  const abs = path.resolve(file);
  if (abs.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(abs).href);
    const fn = mod.exportAudit ?? mod.default?.exportAudit;
    if (typeof fn !== 'function') throw new Error('适配器没有 exportAudit()。');
    return {spec: fn(), file: abs};
  }
  const req = createRequire(abs);
  const mod = req(abs);
  const fn = mod.exportAudit ?? mod.default?.exportAudit;
  if (typeof fn !== 'function') throw new Error('适配器没有 exportAudit()。');
  return {spec: fn(), file: abs};
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) out[name] = true;
    else { out[name] = value; i++; }
  }
  return out;
}

function readGates(file) {
  if (!file) return {...DEFAULT_GATES};
  const extra = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {...DEFAULT_GATES, ...extra};
}

const HELP = `node scripts/motion-gates.mjs --adapter <adapter.mjs|cjs> --video <preview.mp4> --out <report.json> [--gates <overrides.json>] [--freeze-log <ffmpeg.txt>]
退出码：0 已声明范围的已测约束无异常；2 数值失败或工程审计待核问题；1 输入或覆盖不完整。都不是视觉验收。
优先复用 actions[].motionGate / relays[].motionGate 与 coverage.mainContentIds。完整生产适配器同步运行 motion-audit 并绑定源码/成片 SHA-256；旧 motionCast 只保留有限数值检测。
--freeze-log 使用已经跑完的 freezedetect 日志，不再解码该视频；日志与视频的来源关联未验证，会明确记录。`;

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.adapter || !args.video || !args.out) {
    console.log(HELP);
    return args.help ? 0 : 1;
  }
  const gates = readGates(args.gates);
  const video = path.resolve(args.video);
  if (!fs.existsSync(video) || !fs.statSync(video).isFile()) {
    const report = {status: '无法测量', exitCode: 1, reasons: [`找不到预览视频 ${video}`]};
    fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    return 1;
  }
  let freeze = null;
  let freezeError = null;
  try {
    if (args['freeze-log']) {
      const text = fs.readFileSync(args['freeze-log'], 'utf8');
      freeze = parseFreezeLog(text);
      freeze.source = path.resolve(args['freeze-log']);
      if (freeze.duration == null) throw new Error('静止日志没有时长。');
    } else {
      freeze = runFreezeDetect(video, gates, args.ffmpeg || 'ffmpeg');
    }
  } catch (err) {
    freezeError = String(err.message || err);
  }
  let spec;
  let adapterFile;
  try {
    const loaded = await loadAdapter(args.adapter);
    spec = loaded.spec;
    adapterFile = loaded.file;
    if (spec?.schemaVersion !== 1) throw new Error('schemaVersion 必须为 1。');
    if (!(spec.fps > 0) || !(spec.duration > 0) || typeof spec.frameAt !== 'function') throw new Error('exportAudit() 缺少 fps、duration 或 frameAt。');
  } catch (err) {
    const report = {status: '无法测量', exitCode: 1, reasons: [String(err.message || err)]};
    fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    return 1;
  }
  const result = evaluateMotion(spec, {freeze, gates, baseDir: path.dirname(adapterFile), adapterFile, video});
  if (args['freeze-log'] && freeze) {
    result.freezeEvidence = {log: fileLock(path.resolve(args['freeze-log'])), videoAssociation: 'not-verified', note: '日志文件哈希只锁定输入；日志时长和来源文字不能证明它来自当前视频。'};
    if (Math.abs(freeze.duration - spec.duration) > 1 / spec.fps + 0.01) {
      freezeError = '静止日志时长与适配器时长不一致，不能混用。';
    }
  } else if (freeze) result.freezeEvidence = {videoAssociation: 'decoded-current-video', videoSha256: result.locks?.video?.sha256 ?? null};
  if (freezeError) {
    result.gates[0] = {id: 1, name: '静止', status: '无法测量', reasons: [freezeError], measured: {}};
    result.exitCode = result.exitCode === 2 || result.gates.some(g => g.status === '未通过') ? 2 : 1;
    result.status = result.exitCode === 2 ? '发现约束失败或待核问题' : '测量不完整';
  }
  result.video = video;
  result.adapter = adapterFile;
  fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
  fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  const brief = result.gates.map(g => `${g.id}:${g.status}`).join(' ');
  console.log(`${result.status}；视觉验收未执行；范围 ${result.coverage.mode}。 ${brief}`);
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(err => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  });
}
