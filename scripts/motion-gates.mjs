#!/usr/bin/env node
// Gates 1/3 and an explicitly fixed camera are constraints; motion-style references are diagnostic.
// Gate 1 measures perceptual stillness, how long the composition stays unchanged and one-frame whole-scene changes
// on the decoded video (scripts/stillness.mjs), whatever the camera does: a declared fixed camera only proves the
// framing did not move, not that the picture keeps moving. Only source-backed role:'cut', scope:'scene' checkpoints
// (chapter boundaries or user-confirmed breaks) register a one-frame scene change.
// Camera arc uses the same screen projection as the ep05 census:
//   [960+(x-cx)*z, 540+(y-cy)*z] on a 1920×1080 reference, independent of preview size.
// A constant vertical origin does not change arc length. frameAt().camera is the only pose source.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import {auditMotion,cameraCutFrames} from './motion-audit.mjs';
import {measureStillness, scoreStillness} from './stillness.mjs';
import observation from './motion-observation.cjs';
const {visibleState,inspectActionCoverage}=observation;

export const DEFAULT_GATES = {
  // Gate 1, perceptual stillness: 30fps, 480x270 gray, pixel delta >6/255, changed area <0.5% = nearly still.
  // Calibrated 2026-11-08 on 8 approved Ep08 segments (18-43%, longest 1.1-1.8 s) and the rejected test (60%, 3.27 s).
  stillPixelDelta: 6,
  stillAreaPct: 0.5,
  stillRatioMax: 0.5,
  stillSegmentMax: 2,
  stillReviewSec: 1.5,
  // Gate 1, composition hold: 10fps, 32x18 gray; a run lasts while <3% of cells differ by >8/255 from its first frame.
  // Calibrated 2026-11-08: 8 approved/accepted clips 0-11% of time in holds >2 s (longest 2.9 s);
  // rejected 2026-11-07 clips 28-35%; stopped 2026-11-08 golden tests 81-100%.
  compositionHoldSec: 2,
  compositionShareMax: 0.2,
  compositionSegmentMax: 4,
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

const stillGates = g => Object.fromEntries(Object.entries({
  pixelDelta: g.stillPixelDelta, stillAreaPct: g.stillAreaPct, ratioMax: g.stillRatioMax, segmentMaxSec: g.stillSegmentMax, reviewSegmentSec: g.stillReviewSec,
  compHoldSec: g.compositionHoldSec, compShareMax: g.compositionShareMax, compSegmentMaxSec: g.compositionSegmentMax,
}).filter(([, v]) => v !== undefined));

function overlaps(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0) > 1e-6; }

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

  // Historical window medians locate review candidates; they do not fail a shot.
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
  const missingRoles = large.filter(m => !roleOf(m, roles));
  if (missingRoles.length && !unclassified) reasons.push('有镜头移动但缺少职责声明，须补本段观看依据。');
  const status = unclassified || missingRoles.length ? '无法测量' : '诊断';
  return {
    status,
    judgment: 'diagnostic',
    visualAcceptance: 'not-assessed',
    reasons,
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
  const declaredTrigger = beat.trigger?.time ?? beat.triggerTime;
  if (declaredTrigger != null && (!Number.isFinite(declaredTrigger) || declaredTrigger < samples[0].t - 1e-9 || declaredTrigger > samples.at(-1).t + 1e-9))
    return {id:beat.id,...scope,status:'无法测量',reasons:['实际触发时间无效或不在采样范围内。']};
  const unresolved = samples.some(s => [beat.subjectId,beat.attachmentId].some(id => {
    const object=objectAt(s.frame,id);
    return !object || visibleState(object,beat.viewport).state==='unknown';
  }));
  if(unresolved)return {id:beat.id,...scope,status:'无法测量',reasons:['主体或部件的实际绘制可见性缺测；须从同源变换、路径和触发数据补测并核像素。']};
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
    if (attachOn == null && attachmentVisible && attachmentAction && ad.causal) attachOn = samples[i].t;
    if (attachOn != null && receiveOn == null && attachmentVisible && attachmentAction && samples[i].t > attachOn + (gates.simultaneousFrames / fps) && (ad.proc || ad.scale || ad.rot)) receiveOn = samples[i].t;
  }
  if (subjectOn == null) return {id: beat.id, ...scope, status: '无法测量', reasons: [`${beat.subjectId} 在窗口内没有可见的位置或揭示变化。`]};
  const triggerTime = declaredTrigger ?? subjectOn;
  const triggerKind = beat.trigger?.kind ?? (declaredTrigger == null ? 'measured-subject-onset' : 'declared-production-event');
  const measured = {triggerTime:round(triggerTime,6),triggerKind,subjectOn:round(subjectOn,3),attachmentOn:round(attachOn,3),rigid:!!beat.rigid};
  const reasons = [];
  if (attachOn == null || attachOn - triggerTime > gates.followWindowSec + 1e-6) {
    reasons.push(`${beat.attachmentId} 没有在实际触发事件后 ${gates.followWindowSec} 秒内发生位置、遮罩或形变。`);
    return {id: beat.id, ...scope, status: '未通过', reasons, measured};
  }
  const delay = attachOn - triggerTime;
  const delayFrames = framesOf(delay, fps);
  Object.assign(measured,{delaySec:round(delay,4),delayFrames:round(delayFrames,2),subjectDelaySec:round(attachOn-subjectOn,4)});
  if(delay < -1e-6)reasons.push('附属件在实际触发事件之前响应，因果顺序不成立。');
  if (beat.rigid) {
    // 测到的是后续遮罩/形变/旋转，是否真是接收反馈仍须看实际画面。
    if (receiveOn == null || receiveOn < triggerTime || receiveOn-triggerTime > gates.followWindowSec + 1e-6) reasons.push('刚性组缺少实际触发窗口内的接收反馈（遮罩、形变或旋转）。');
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
  if(inWindow.some(s=>!objectAt(s.frame,beat.subjectId)||visibleState(objectAt(s.frame,beat.subjectId),beat.viewport).state==='unknown'))
    return {id:beat.id,status:'无法测量',reasons:['预备窗口包含缺失或未决绘制，诊断不能视为通过。']};
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
    return {id: beat.id, status: beat.reveal ? '无法测量' : '诊断', judgment:'diagnostic', reasons: beat.reveal ? ['声明了揭示，但没有采到主体位移。'] : [], measured: {triggered: false, travelPx: round(Math.max(0, ...runs.map(r => r.path), 0), 1), note: '未达到历史位移取样参照；重量仍按实际过程判断。'}};
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
  return {id: beat.id, status: '诊断', judgment:'diagnostic', visualAcceptance:'not-assessed', reasons, measured};
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
    status: unresolved.length ? '无法测量' : '诊断',
    judgment: 'diagnostic',
    visualAcceptance: 'not-assessed',
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
  if (parts.some(p => p.status === '诊断')) return {status:'诊断',judgment:'diagnostic',reasons:parts.flatMap(p=>p.reasons??[]),measured:{items:parts}};
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
      ...(r.trigger ? {trigger:r.trigger} : r.triggerTime != null ? {triggerTime:r.triggerTime} : {}),
      valid, anchorReason: valid ? null : '接力没有指向两个不同且已覆盖的生产动作对象。'};
  });
  const anticipations = actions.filter(a => a.motionGate === 'anticipation').map(a => ({id: a.id, subjectId: a.objectId, t0: a.start, t1: a.end, reveal: a.kind === 'reveal', rigid: a.rigid === true, timelineAction: a.id, viewport: spec.viewport,
    valid: (spec.coverage?.objectIds ?? []).includes(a.objectId), anchorReason: '预备动作对象不在生产 coverage 中。'}));
  const origin = {follows: follows.length ? 'timeline-relays' : 'legacy-motionCast', anticipations: anticipations.length ? 'timeline-actions' : 'legacy-motionCast', mainContentIds: spec.coverage?.mainContentIds ? 'coverage' : 'legacy-motionCast'};
  return {...cast, ...(follows.length ? {follows} : {}), ...(anticipations.length ? {anticipations} : {}), mainContentIds: spec.coverage?.mainContentIds ?? cast.mainContentIds, origin};
}

function fixedPose(frame) {
  if (frame.camera) {
    const {cx,cy,z} = frame.camera;
    if ([cx,cy,z].every(Number.isFinite) && z > 0) return [cx,cy,z];
  }
  const c = frame.camera3d;
  if (c && [c.position,c.right,c.down,c.forward].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) &&
      [c.focalLength,c.viewport?.width,c.viewport?.height].every(v => Number.isFinite(v) && v > 0)) {
    return [...c.position,...c.right,...c.down,...c.forward,c.focalLength,c.viewport.width,c.viewport.height];
  }
  throw Error('固定镜头的实际相机姿态未暴露。');
}

export function evaluateSpec(spec, {stillness, gates = DEFAULT_GATES, baseDir = process.cwd()} = {}) {
  const cast = deriveMotionCast(spec);
  const windows = cast.cameraWindows?.length ? cast.cameraWindows : [{id: 'all', t0: 0, t1: spec.duration}];
  const fps = spec.fps;
  let cameraError = null;
  let sceneCuts = new Set();
  const allMoves = [];
  const windowStats = [];
  const fixedDrift = [];
  let measuredFixedIntervals = 0;
  try {
    const {frames:cuts,gaps} = cameraCutFrames(spec,baseDir);
    if (gaps.length) throw Error(gaps.join(' '));
    sceneCuts = cuts;
    for (const w of windows) {
      if (![w.t0,w.t1].every(Number.isFinite) || w.t0 < 0 || w.t1 > spec.duration || w.t1 <= w.t0) throw Error('镜头窗口无效：' + w.id);
      const cache = new Map();
      const at = t => {
        const key = t;
        if (!cache.has(key)) cache.set(key, spec.frameAt(key, {windowId: w.id, t0: w.t0, t1: w.t1}));
        return cache.get(key);
      };
      const start = Math.ceil(w.t0*fps-1e-8), end = Math.ceil(w.t1*fps-1e-8);
      const boundaries = [start,...[...cuts].filter(i => start < i && i < end).sort((a,b)=>a-b),end];
      if (end <= start) throw Error('镜头窗口没有编码帧：' + w.id);
      for (let j=0; j+1<boundaries.length; j++) {
        const first = boundaries[j], last = boundaries[j+1]-1;
        if (w.role === 'fixed') {
          // Adjacent fixed windows also share a pose unless there is an actual cut.
          const previousFixed = windows.some(prev => prev.role === 'fixed' && Math.abs(prev.t1-w.t0)<1e-8);
          const compareFrom = first === start && previousFixed && !cuts.has(first) && first > 0 ? first-1 : first;
          const reference = fixedPose(at(compareFrom/fps));
          let firstDrift = null, lastDrift = null;
          for (let i=compareFrom+1; i<=last; i++) {
            const current = fixedPose(at(i/fps));
            if (current.length !== reference.length) throw Error('固定窗口的相机坐标类型发生变化：'+w.id);
            if (current.some((v,k) => Math.abs(v-reference[k]) > 1e-7)) {
              firstDrift ??= i;
              lastDrift = i;
            }
          }
          measuredFixedIntervals += last-compareFrom;
          if (firstDrift !== null) fixedDrift.push({id:w.id,firstDriftFrame:firstDrift,lastDriftFrame:lastDrift,
            start:firstDrift/fps,end:lastDrift/fps,fps,reviewFrames:[...new Set([
              Math.max(compareFrom,firstDrift-1),firstDrift,Math.min(last,firstDrift+1),lastDrift,Math.min(last,lastDrift+1)])]});
          windowStats.push({id:w.id,role:'fixed',firstFrame:first,lastFrame:last,fixedIntervals:last-compareFrom});
          continue;
        }
        const samples = [];
        for (let i=first;i<=last;i++) {const t=i/fps; samples.push({t,camera:at(t)?.camera});}
        if (samples.some(s => !s.camera || ![s.camera.cx,s.camera.cy,s.camera.z].every(Number.isFinite) || s.camera.z <= 0))
          throw new Error(`窗口 ${w.id} 的 frameAt 没有有效的二维 camera。`);
        const measured = measureMoves(samples.map(s => ({t: s.t, ...s.camera})), fps, gates, t => {
          const frame = at(t);
          if (!frame?.camera) throw new Error(`frameAt(${t}) 没有 camera。`);
          return frame.camera;
        });
        if (measured.error) throw new Error(measured.error);
        const large = measured.moves.filter(m => m.arcPx + 1e-9 >= gates.largeArcPx);
        windowStats.push({
          id: w.id, t0: first/fps, t1: last/fps, largeCount: large.length,
          medianMeanPxPerSec: round(median(large.map(m => m.mean)), 0),
          slowestMeanPxPerSec: large.length ? round(Math.min(...large.map(m => m.mean)), 1) : null,
        });
        for (const m of measured.moves) allMoves.push({...m, window: w.id});
      }
    }
  } catch (err) {
    cameraError = String(err.message || err);
  }
  const readings = bindList(cast.reading, baseDir).filter(r => r.valid);
  const roles = cast.cameraRoles ?? null;
  let gate2;
  if (fixedDrift.length) gate2 = {status:'未通过',judgment:'hard-gate',reasons:['实际相机在声明的固定窗口发生变化。',...(cameraError?[cameraError]:[])],measured:{fixedDrift}};
  else if (cameraError) gate2 = {status:'无法测量',reasons:[cameraError],measured:{}};
  else if (windows.every(w=>w.role==='fixed')) gate2 = measuredFixedIntervals
    ? {status:'通过',judgment:'hard-gate',reasons:[],measured:{measuredFixedIntervals}}
    : {status:'无法测量',reasons:['固定窗口内没有相邻的编码帧。'],measured:{}};
  else gate2 = scoreCamera({moves:allMoves,duration:spec.duration,gates,roles,readings,windowStats});
  gate2.measured.windows = windowStats;

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
    actionCoverage=inspectActionCoverage(spec,sampleFrames(spec.frameAt,0,spec.duration,spec.fps),sceneCuts);
    const followCoverage=actionCoverage.follow;
    gate3.measured={...(gate3.measured??{}),coverage:followCoverage};
    const missing=[...followCoverage.uncoveredRelayIds.map(id=>'未测生产接力 '+id),...followCoverage.relatedActionCandidates.map(r=>'尚未辨认父部件关系 '+r.parentAction+' → '+r.partAction)];
    if(missing.length){if(gate3.status!=='未通过')gate3.status='无法测量';gate3.reasons=[...(gate3.reasons??[]),...missing];}
    else if(!follows.length && Array.isArray(spec.relays) && !spec.relays.length){
      const proof=spec.coverage.notApplicable?.relays;
      if(proof?.reason && anchorOk(proof,baseDir).valid &&
        spec.sourceFiles?.some(f=>path.resolve(baseDir,f)===path.resolve(baseDir,proof.sourceFile))){
        gate3={status:'不适用',reasons:[proof.reason],measured:{coverage:followCoverage,basis:proof}};
      }
    }
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

  // Only declared reading windows (text actually being read) and user-confirmed exceptions are exempt.
  const exceptions = bindList(cast.stillExceptions ?? cast.freezeExceptions, baseDir);
  const readingWindows = bindList(cast.reading, baseDir).filter(r => r.valid);
  const gate1 = stillness
    ? scoreStillness({area: stillness.area, fps: stillness.fps, comp: stillness.comp, cuts: stillness.cuts ?? null, allowedCuts: [...sceneCuts].map(i => i / fps),
      readings: readingWindows, exceptions, gates: stillGates(gates)})
    : {status: '无法测量', reasons: ['没有成片的逐帧变化数据。'], measured: {}};

  const gatesOut = [
    {id: 1, name: '感知静止', ...gate1},
    {id: 2, name: '声明窗口的镜头数值', ...gate2},
    {id: 3, name: '声明对象的启动时差', ...gate3},
    {id: 4, name: '触发动作的预备时长', ...gate4},
    {id: 5, name: '稳定主内容外接框宽度', ...gate5},
  ];
  for(const g of gatesOut)g.judgment=g.judgment??([1,3].includes(g.id)?'hard-gate':'diagnostic');
  const exitCode = gatesOut.some(g => g.status === '未通过') ? 2 : gatesOut.some(g => !['通过','诊断','不适用'].includes(g.status)) ? 1 : 0;
  return {
    reportVersion: 2,
    status: exitCode === 0 ? '硬要求已测，诊断待人工判断' : exitCode === 2 ? '硬要求未满足' : '数值测量不完整',
    exitCode,
    visualAcceptance: 'not-assessed',
    actionCoverage,
    scope: {markerOrigin: cast.origin, componentSemantics: 'not-assessed', weight: 'not-assessed', note: '数值结果仅限报告中的对象、动作与窗口；没有测到问题不代表整体质量或部件表达通过。'},
    gates: gatesOut,
    reference: EP05_REFERENCE,
    thresholds: gates,
  };
}

function fileLock(file) {
  const resolved = fs.realpathSync(file), bytes = fs.readFileSync(resolved);
  return {path: resolved, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}

// One entry for old and new adapters: numeric measurements plus the existing
// source/video-bound engineering audit when that production contract is exposed.
export function evaluateMotion(spec, {stillness, gates = DEFAULT_GATES, baseDir = process.cwd(), adapterFile, video, requireVideo = !!video} = {}) {
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
  const result = evaluateSpec(spec, {stillness, gates, baseDir});
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
  result.status = result.exitCode === 0 ? '硬要求已测，诊断待人工判断' : result.exitCode === 2 ? '发现硬要求失败或工程待核问题' : '测量不完整';
  return result;
}

export async function loadAdapter(file, input) {
  const abs = path.resolve(file);
  if (abs.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(abs).href);
    const fn = mod.exportAudit ?? mod.default?.exportAudit;
    if (typeof fn !== 'function') throw new Error('适配器没有 exportAudit()。');
    return {spec: await fn(input), file: abs};
  }
  const req = createRequire(abs);
  const mod = req(abs);
  const fn = mod.exportAudit ?? mod.default?.exportAudit;
  if (typeof fn !== 'function') throw new Error('适配器没有 exportAudit()。');
  return {spec: await fn(input), file: abs};
}

// The production entry renders a frozen source directory. Resolve the receipt
// before importing code, then recheck its locks after sampling and decoding.
function readRenderManifest(file, adapter, video) {
  const manifestPath = fs.realpathSync(file);
  const bytes = fs.readFileSync(manifestPath);
  const lock = {path:manifestPath,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const manifest = JSON.parse(bytes.toString('utf8'));
  const dir = path.dirname(lock.path);
  const sourceDir = path.join(dir, 'source');
  if (!Array.isArray(manifest.sources) || !manifest.sources.length ||
      !Array.isArray(manifest.omitIds) || manifest.omitIds.some(id => typeof id !== 'string') ||
      !manifest.input || typeof manifest.input !== 'object' || Array.isArray(manifest.input)) {
    throw Error('渲染清单缺少实际输入、删层参数或源码快照。');
  }
  const verifyFile = (root, entry) => {
    if (!entry || typeof entry.name !== 'string' || path.isAbsolute(entry.name) ||
        entry.name.split(/[\\/]/).some(part => !part || part === '..' || part === '.')) throw Error('渲染清单文件路径无效。');
    const actual = fileLock(path.resolve(root, entry.name));
    const relative = path.relative(fs.realpathSync(root), actual.path);
    if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || actual.sha256 !== entry.sha256) {
      throw Error('文件与渲染时的版本不同：' + entry.name);
    }
    return actual;
  };
  const sources = manifest.sources.map(entry => verifyFile(sourceDir, entry));
  if (!sources.some(source => source.path === fs.realpathSync(adapter))) throw Error('检查适配器未绑定这次渲染的源码快照。');
  const videoLock = verifyFile(dir, manifest.video);
  if (videoLock.path !== fs.realpathSync(video)) throw Error('成片与渲染清单不匹配。');
  return {lock, sources, videoLock, config:manifest.config, input:{sceneInput:manifest.input, omitIds:manifest.omitIds, videoFile:videoLock.path}};
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

const HELP = `node scripts/motion-gates.mjs --adapter <adapter.mjs|cjs> --video <preview.mp4> --out <report.json> [--render-manifest <render-manifest.json>] [--gates <overrides.json>]
报告 reportVersion:2。第 1 项为感知静止、构图多久没变和一帧换场（与 scripts/stillness.mjs 同一算法），静止和构图只豁免登记的读字窗口和用户确认的例外；一帧换场只放行带来源依据的 role:'cut', scope:'scene' 检查点，它们只能用在章与章之间或用户确认的断点。固定镜头由 motionCast.cameraWindows 的 role:'fixed' 声明并逐帧核对，实际姿态漂移将记为硬失败；镜头固定只说明机位没动，画面是否在推进由第 1 项判断。其余相机风格、预备时长和构图只作诊断。整场硬切用现有带来源依据的 role:'cut', scope:'scene' 检查点，在切点两侧分别计算。
退出码：0 硬要求已测且诊断数据完整，待人工判断；2 硬要求失败或工程审计待核问题；1 输入或覆盖不完整。都不是视觉验收。
优先复用 actions[].motionGate / relays[].motionGate 与 coverage.mainContentIds。完整生产适配器同步运行 motion-audit 并绑定源码/成片 SHA-256；旧 motionCast 只保留有限数值检测。`;

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
  const beforeDecode = fileLock(video);
  let stillness = null;
  let stillnessError = null;
  try {
    stillness = measureStillness(video, {ffmpeg: args.ffmpeg || 'ffmpeg', gates: stillGates(gates)});
  } catch (err) {
    stillnessError = String(err.message || err);
  }
  let spec;
  let adapterFile;
  let receipt;
  try {
    receipt = args['render-manifest'] ? readRenderManifest(args['render-manifest'], args.adapter, video) : null;
    const loaded = await loadAdapter(args.adapter, receipt?.input);
    spec = loaded.spec;
    adapterFile = loaded.file;
    if (spec?.schemaVersion !== 1) throw new Error('schemaVersion 必须为 1。');
    if (!(spec.fps > 0) || !(spec.duration > 0) || typeof spec.frameAt !== 'function') throw new Error('exportAudit() 缺少 fps、duration 或 frameAt。');
    if (receipt) {
      const {config} = receipt;
      if (config?.fps !== spec.fps || config?.duration !== spec.duration || config?.width !== spec.viewport?.width || config?.height !== spec.viewport?.height) {
        throw Error('适配器的帧率、时长或画幅与渲染清单不匹配。');
      }
      spec = {...spec, sourceFiles:[...new Set([...(spec.sourceFiles ?? []), ...receipt.sources.map(s => s.path)])]};
    }
  } catch (err) {
    const report = {status: '无法测量', exitCode: 1, visualAcceptance:'not-assessed', gates:[], reasons: [String(err.message || err)]};
    fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    return 1;
  }
  const result = evaluateMotion(spec, {stillness, gates, baseDir: path.dirname(adapterFile), adapterFile, video});
  if (receipt && result.locks) result.locks.renderManifest = receipt.lock;
  const expected = [beforeDecode, ...(receipt ? [receipt.lock, receipt.videoLock, ...receipt.sources] : [])];
  if (!expected.every(lock => {
    try { return fileLock(lock.path).sha256 === lock.sha256; } catch { return false; }
  })) {
    const reason = '取证期间，源码、渲染清单或成片版本已变化，须对同一版本重新取证。';
    fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive:true});
    fs.writeFileSync(args.out, JSON.stringify({status:'测量不完整', exitCode:1, visualAcceptance:'not-assessed', gates:[], reasons:[reason]}, null, 2));
    return 1;
  }
  if (stillness) result.stillnessEvidence = {videoAssociation: 'decoded-current-video', videoSha256: result.locks?.video?.sha256 ?? null, sampleFps: stillness.fps};
  if (stillness && Math.abs(stillness.duration - spec.duration) > 1 / 30 + 0.02) {
    stillnessError = '静止检测时长与适配器时长不一致，不能混用。';
  }
  if (stillnessError) {
    result.gates[0] = {id: 1, name: '感知静止', status: '无法测量', reasons: [stillnessError], measured: {}};
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
