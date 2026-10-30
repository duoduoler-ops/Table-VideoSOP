import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_GATES, measureMoves, scoreFreeze, scoreCamera, scoreFollow as actualFollow, scoreAnticipation as actualAnticipation,
  scoreComposition as actualComposition, evaluateSpec as actualSpec, parseFreezeLog, main,
} from '../motion-gates.mjs';

import {paintSamples,paintSpec} from './paint-fixture.mjs';
const scoreFollow=(s,...a)=>actualFollow(paintSamples(s),...a);
const scoreAnticipation=(s,...a)=>actualAnticipation(paintSamples(s),...a);
const scoreComposition=(s,...a)=>actualComposition(paintSamples(s),...a);
const evaluateSpec=(s,...a)=>actualSpec(paintSpec(s),...a);
const self = fileURLToPath(import.meta.url);
const anchor = 'fixture-anchor-motion-gates';
// These analytic fixtures represent painted, unobscured rectangles; legacy bbox-only has separate tests.
const obj = (id, x, extra = {}) => ({id, x, y: 80, width: 100, height: 40, opacity: 1, observation:{state:'visible',reason:'fixture-painted-rectangle'}, ...extra});
const cam = (cx = 0) => ({cx, cy: 0, z: 1});

test('freeze ratio at 20% passes and above 20% fails; exceptions do not reduce the ratio', () => {
  const segs = n => Array.from({length: n}, (_, i) => ({start: i, duration: 1, end: i + 1}));
  assert.equal(scoreFreeze({duration: 100, segments: segs(20)}).status, '通过');
  assert.equal(scoreFreeze({duration: 100, segments: segs(21)}).status, '未通过');
  const excused = scoreFreeze({duration: 100, segments: segs(25), exceptions: [{t0: 0, t1: 25, valid: true}]});
  assert.equal(excused.status, '未通过');
  assert.match(excused.reasons.join('\n'), /25\.0%/);
  assert.equal(excused.reasons.some(r => r.includes('已登记例外')), false);
});

test('a 1.999s freeze passes and 2.0s fails unless a registered exception covers that segment only', () => {
  const short = scoreFreeze({duration: 100, segments: [{start: 1, duration: 1.999, end: 2.999}]});
  assert.equal(short.status, '通过');
  const exact = scoreFreeze({duration: 100, segments: [{start: 1, duration: 2, end: 3}]});
  assert.equal(exact.status, '未通过');
  const covered = scoreFreeze({
    duration: 100,
    segments: [{start: 1, duration: 2, end: 3}],
    exceptions: [{t0: 1, t1: 3, valid: true}],
  });
  assert.equal(covered.status, '通过');
  assert.equal(covered.measured.ratio, 0.02);
});

test('freezes shorter than the detector minimum are not counted', () => {
  const scored = scoreFreeze({duration: 100, segments: [{start: 0, duration: 0.5, end: 0.5}, {start: 2, duration: 1, end: 3}]});
  assert.equal(scored.measured.segments, 1);
  assert.equal(scored.measured.seconds, 1);
});

test('ep05 control log stays at the announced 60 segments, 63.0s, 1.93s max', () => {
  const text = fs.readFileSync('D:/skillfengzhuang/reports/20261027-motion-gates-implementation/证据/ep05_freezedetect_总控实测.txt', 'utf8');
  const parsed = parseFreezeLog(text);
  const sum = parsed.segments.reduce((s, x) => s + x.duration, 0);
  const max = Math.max(...parsed.segments.map(s => s.duration));
  assert.equal(parsed.segments.length, 60);
  assert.equal(parsed.incomplete.length, 0);
  assert.equal(parsed.segments.at(-1).closedAtEnd, true);
  assert.equal(parsed.segments.at(-1).start, 449.9);
  assert.equal(Math.round(sum * 10) / 10, 63);
  assert.equal(Math.round(parsed.duration * 10) / 10, 451.4);
  assert.equal(Math.round(max * 100) / 100, 1.93);
  assert.equal(parsed.segments.some(s => s.duration >= 2), false);
  const scored = scoreFreeze(parsed);
  assert.equal(scored.status, '通过');
  assert.equal(Math.round(scored.measured.ratio * 1000) / 10, 14);
});

test('median speed of 358 passes and below fails; single slow move does not fail alone; arc of 80 counts', () => {
  const one = (mean, arc = 100, t0 = 0, dur = 0.2) => ({t0, t1: t0 + dur, dur, arcPx: arc, mean, t80: dur * 0.4});
  // 单次 358 通过（中位 = 358）
  assert.equal(scoreCamera({moves: [one(358)], duration: 0.2}).status, '通过');
  // 单次 357.999：中位 < 358 → 未通过
  assert.equal(scoreCamera({moves: [one(357.999)], duration: 0.2}).status, '未通过');
  // 弧长 80 计入
  assert.equal(scoreCamera({moves: [one(400, 80)], duration: 0.2}).measured.largeCount, 1);
  assert.equal(scoreCamera({moves: [one(400, 79.999)], duration: 0.2}).status, '无法测量');
  // 间隔 4 秒通过，4.001 秒未通过
  assert.equal(scoreCamera({moves: [one(400, 100, 0, 0.2), one(400, 100, 4.2, 0.2)], duration: 5}).status, '通过');
  assert.equal(scoreCamera({moves: [one(400, 100, 0, 0.2), one(400, 100, 4.201, 0.2)], duration: 5}).status, '未通过');
  // 中位数判定：3 次移动，1 次 200，2 次 500；中位 = 500 > 358 → 通过（单次不判失败）
  assert.equal(scoreCamera({moves: [one(200, 100, 0, 0.3), one(500, 100, 1, 0.2), one(500, 100, 2, 0.2)], duration: 3}).status, '通过');
  // 中位数判定：3 次移动，2 次 200，1 次 500；中位 = 200 < 358 → 未通过
  assert.equal(scoreCamera({moves: [one(200, 100, 0, 0.3), one(200, 100, 1, 0.3), one(500, 100, 2, 0.2)], duration: 3}).status, '未通过');
});

test('a reveal longer than 1.5s is unmeasured without a role and fails without a written reason', () => {
  const slowReveal = [{t0: 0, t1: 1.6, dur: 1.6, arcPx: 900, mean: 560, t80: 0.5}];
  assert.equal(scoreCamera({moves: slowReveal, duration: 1.6}).status, '无法测量');
  assert.equal(scoreCamera({moves: slowReveal, duration: 1.6, roles: [{t0: 0, t1: 2, role: 'reveal'}]}).status, '未通过');
  assert.equal(scoreCamera({
    moves: slowReveal, duration: 1.6,
    roles: [{t0: 0, t1: 2, role: 'reveal', slowReason: '情绪慢镜，已写在镜头标注。'}],
  }).status, '通过');
  assert.equal(scoreCamera({moves: [{t0: 0, t1: 1.5, dur: 1.5, arcPx: 800, mean: 500, t80: 0.4}], duration: 1.5}).status, '通过');
});

test('linear pan of 80px is one large move', () => {
  const fps = 30;
  const t1 = 0.4;
  const pose = t => {
    const tt = Math.min(Math.max(t, 0), t1);
    const cx = tt < 0.1 ? 0 : tt > 0.3 ? 80 : (tt - 0.1) / 0.2 * 80;
    return {t: tt, cx, cy: 0, z: 1};
  };
  const samples = [];
  for (let t = 0; t <= t1 + 1e-9; t += 1 / fps) samples.push(pose(Math.min(t, t1)));
  const measured = measureMoves(samples, fps, DEFAULT_GATES, t => pose(t));
  const large = measured.moves.filter(m => m.arcPx + 1e-9 >= 80);
  assert.equal(large.length, 1);
  assert.ok(large[0].arcPx < 81, `arc ${large[0].arcPx}`);
});

function followSamples(delay, {rigid = false, feedback = false, opacityOnly = false} = {}) {
  const times = [0, 0.2, 0.2 + delay, 0.2 + delay + 0.08, 0.5];
  return times.map(t => {
    const subjectX = t >= 0.2 ? 30 : 0;
    const attachMoved = t >= 0.2 + delay - 1e-9;
    const extra = {y: 180};
    if (feedback && t >= 0.2 + delay + 0.07) extra.process = {maskProgress: 0.4};
    if (opacityOnly) extra.opacity = attachMoved ? 0.2 : 1;
    return {t, frame: {objects: [obj('hero', subjectX), obj('tag', attachMoved && !opacityOnly ? 20 : 0, extra)]}};
  });
}

test('follow delay >=3 frames (50ms) passes, <3 frames simultaneous fails, rigid needs feedback', () => {
  const beat = {id: 'f', subjectId: 'hero', attachmentId: 'tag'};
  // ≥3 帧（50ms）通过
  assert.equal(scoreFollow(followSamples(0.05), beat).status, '通过');
  // 100ms = 6 帧（目标参照内）通过
  assert.equal(scoreFollow(followSamples(0.1), beat).status, '通过');
  // 150ms = 9 帧通过
  assert.equal(scoreFollow(followSamples(0.15), beat).status, '通过');
  // 200ms 也通过（超出目标参照不判失败）
  assert.equal(scoreFollow(followSamples(0.2), beat).status, '通过');
  // 49ms < 3 帧 → 同时 → 失败
  const early = scoreFollow(followSamples(0.049), beat);
  assert.equal(early.status, '未通过');
  assert.equal(early.reasons.some(r => r.includes('同时')), true);
  // 只改透明度不算
  assert.equal(scoreFollow(followSamples(0, {opacityOnly: true}), beat).status, '未通过');
  // 刚性无接收反馈失败
  const rigid = {...beat, rigid: true};
  assert.equal(scoreFollow(followSamples(0, {rigid: true}), rigid).status, '未通过');
  assert.match(scoreFollow(followSamples(0, {rigid: true}), rigid).reasons.join('\n'), /接收反馈/);
  // 刚性有接收反馈通过
  assert.equal(scoreFollow(followSamples(0, {rigid: true, feedback: true}), rigid).status, '通过');
});

function anticipationSamples(prepDur, travel) {
  const main = 1;
  const pre0 = prepDur == null ? null : main - prepDur;
  const times = [0.2];
  if (pre0 != null) times.push(pre0);
  for (let i = 0; i <= 40; i++) times.push(main + i / 60);
  if (pre0 != null) for (let t = pre0; t < main; t += 1 / 60) times.push(t);
  const uniq = [...new Set(times.map(t => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
  return uniq.map(t => {
    let x = 0;
    if (pre0 != null && t > pre0 && t <= main) x = -12 * (t - pre0) / prepDur;
    else if (t > main) x = (pre0 == null ? 0 : -12) + travel * Math.min(1, (t - main) / 0.4);
    return {t, frame: {objects: [obj('body', x)]}};
  });
}

test('anticipation lasts 0.10–0.40s and a 200px move is the trigger', () => {
  const beat = {id: 'a', subjectId: 'body', t0: 0.2, t1: 1.6};
  assert.equal(scoreAnticipation(anticipationSamples(0.1, 200), beat).status, '通过');
  assert.equal(scoreAnticipation(anticipationSamples(0.4, 200), beat).status, '通过');
  assert.equal(scoreAnticipation(anticipationSamples(0.09, 200), beat).status, '未通过');
  assert.equal(scoreAnticipation(anticipationSamples(0.41, 200), beat).status, '未通过');
  assert.equal(scoreAnticipation(anticipationSamples(null, 200), beat).status, '未通过');
  const under = scoreAnticipation(anticipationSamples(null, 199), beat);
  assert.equal(under.status, '通过');
  assert.equal(under.measured.triggered, false);
});

test('stable content width of exactly 0.60 passes', () => {
  const frame = {objects: [obj('main', 0, {width: 1152, height: 400})], camera: cam()};
  const samples = [{t: 0, frame, camera: cam()}, {t: 0.5, frame, camera: cam()}];
  assert.equal(scoreComposition(samples, {mainContentIds: ['main']}).status, '通过');
  const narrow = {objects: [obj('main', 0, {width: 1151, height: 400})], camera: cam()};
  assert.equal(scoreComposition([{t: 0, frame: narrow, camera: cam()}, {t: 0.5, frame: narrow, camera: cam()}], {mainContentIds: ['main']}).status, '未通过');
  assert.equal(scoreComposition(samples, {}).status, '无法测量');
});

function passingSpec() {
  const frameAt = t => {
    const cx = t < 0.2 ? 0 : t < 0.5 ? (t - 0.2) / 0.3 * 500 : 500;
    const heroX = t < 0.6 ? 100 : 100 + (t - 0.6) * 80;
    const tagOn = 0.6 + 7 / 60;
    const tagX = t < tagOn ? 300 : 300 + (t - tagOn) * 80;
    let bodyX = 0;
    if (t >= 0.2 && t < 0.4) bodyX = -12 * (t - 0.2) / 0.2;
    else if (t >= 0.4) bodyX = -12 + Math.min(1, (t - 0.4) / 0.25) * 220;
    return {
      objects: [
        obj('main', 100, {width: 1400, height: 500}),
        obj('hero', heroX),
        obj('tag', tagX),
        // This fixture animates screen-space objects independently of its camera.
        obj('body', bodyX, {screenFixed: true}),
      ],
      camera: cam(cx),
    };
  };
  return {
    schemaVersion: 1, fps: 30, duration: 1.2, frameAt,
    motionCast: {
      follows: [{id: 'f', subjectId: 'hero', attachmentId: 'tag', t0: 0.5, t1: 1.0, sourceFile: self, anchor}],
      anticipations: [{id: 'a', subjectId: 'body', t0: 0.1, t1: 1.0, sourceFile: self, anchor}],
      mainContentIds: ['main'],
    },
  };
}

test('numeric-only exit codes describe the five declared measurements, never visual acceptance', () => {
  const freeze = {duration: 10, segments: [{start: 0, duration: 1, end: 1}]};
  const pass = evaluateSpec(passingSpec(), {freeze, baseDir: path.dirname(self)});
  assert.equal(pass.visualAcceptance, 'not-assessed');
  assert.notEqual(pass.status, '通过');
  assert.equal(pass.exitCode, 0, pass.gates.map(g => `${g.id}:${g.status}:${(g.reasons || []).join(';')}`).join(' | '));
  const fail = evaluateSpec(passingSpec(), {freeze: {duration: 10, segments: [{start: 0, duration: 3, end: 3}]}, baseDir: path.dirname(self)});
  assert.equal(fail.exitCode, 2);
  const spec = passingSpec();
  spec.motionCast.follows = [];
  const missing = evaluateSpec(spec, {freeze, baseDir: path.dirname(self)});
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.gates.find(g => g.id === 3).status, '无法测量');
});

test('missing CLI inputs return 1 and do not pretend to pass', async () => {
  assert.equal(await main(['--help']), 0);
  assert.equal(await main([]), 1);
});
