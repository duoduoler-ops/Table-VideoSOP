import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_GATES, measureMoves, scoreFreeze, scoreCamera as actualCamera, scoreFollow as actualFollow, scoreAnticipation as actualAnticipation,
  scoreComposition as actualComposition, evaluateSpec as actualSpec, deriveMotionCast, parseFreezeLog, main,
} from '../motion-gates.mjs';

import {paintSamples,paintSpec} from './paint-fixture.mjs';
const scoreCamera=o=>actualCamera({roles:[{t0:0,t1:100,role:'reveal'}],...o});
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

test('ep05 control log stays at the announced 60 segments, 63.0s, 1.93s max', {
  skip: !process.env.EP05_FREEZE_CONTROL_LOG && 'Optional original log not supplied; set EP05_FREEZE_CONTROL_LOG to verify it.',
}, () => {
  const text = fs.readFileSync(process.env.EP05_FREEZE_CONTROL_LOG, 'utf8');
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

test('camera speed and duration references diagnose slow and fast moves without hard failure',()=>{
  const move=(mean,t0=0,dur=.2,arc=100)=>({t0,t1:t0+dur,dur,arcPx:arc,mean,t80:dur*.4});
  for(const mean of [200,357.999,358,800])assert.equal(scoreCamera({moves:[move(mean)],duration:1}).status,'诊断');
  assert(scoreCamera({moves:[move(200)],duration:1}).reasons.some(r=>r.includes('中位均速')));
  const long=scoreCamera({moves:[move(560,0,1.6,900)],duration:7});
  assert.equal(long.status,'诊断');assert(long.reasons.length>=2);
  assert.equal(actualCamera({moves:[move(400)],duration:1}).status,'无法测量');
  assert.equal(scoreCamera({moves:[move(400,0,.2,80)],duration:1}).measured.largeCount,1);
  assert.equal(scoreCamera({moves:[move(400,0,.2,79.999)],duration:1}).status,'无法测量');
  assert.equal(long.visualAcceptance,'not-assessed');
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

test('anticipation durations are diagnostics and a 200px move selects a sample', () => {
  const beat = {id: 'a', subjectId: 'body', t0: 0.2, t1: 1.6};
  assert.equal(scoreAnticipation(anticipationSamples(0.1, 200), beat).status, '诊断');
  assert.equal(scoreAnticipation(anticipationSamples(0.4, 200), beat).status, '诊断');
  assert.equal(scoreAnticipation(anticipationSamples(0.09, 200), beat).status, '诊断');
  assert.equal(scoreAnticipation(anticipationSamples(0.41, 200), beat).status, '诊断');
  assert.equal(scoreAnticipation(anticipationSamples(null, 200), beat).status, '诊断');
  const under = scoreAnticipation(anticipationSamples(null, 199), beat);
  assert.equal(under.status, '诊断');
  assert.equal(under.measured.triggered, false);
});

test('wide and narrow content are diagnostic, absent content remains unmeasured', () => {
  const frame = {objects: [obj('main', 0, {width: 1152, height: 400})], camera: cam()};
  const samples = [{t: 0, frame, camera: cam()}, {t: 0.5, frame, camera: cam()}];
  assert.equal(scoreComposition(samples, {mainContentIds: ['main']}).status, '诊断');
  const narrow = {objects: [obj('main', 0, {width: 1151, height: 400})], camera: cam()};
  assert.equal(scoreComposition([{t: 0, frame: narrow, camera: cam()}, {t: 0.5, frame: narrow, camera: cam()}], {mainContentIds: ['main']}).status, '诊断');
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
      cameraRoles:[{t0:0,t1:1.2,role:"reveal"}],
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

function eventSamples(attachmentAt=3.1,{opacityOnly=false}={}) {
  return Array.from({length:241},(_,i)=>{
    const t=i/60;
    return {t,frame:{objects:[
      obj('hero',100+Math.max(0,t-1)*40),
      obj('tag',400+(opacityOnly?0:Math.max(0,t-attachmentAt)*100),{y:180,opacity:opacityOnly&&t>=attachmentAt?.5:1}),
    ]}};
  });
}
test('contact at 3s starts the half-second window, not the shot or subject approach',()=>{
  const beat={id:'contact',subjectId:'hero',attachmentId:'tag',trigger:{time:3,kind:'contact'}};
  const r=scoreFollow(eventSamples(),beat);
  assert.equal(r.status,'通过',JSON.stringify(r));
  assert.equal(r.measured.triggerTime,3);
  assert(r.measured.subjectOn<1.1 && r.measured.attachmentOn>3);
  assert(r.measured.delaySec<.2 && r.measured.subjectDelaySec>2);
  assert.equal(scoreFollow(eventSamples(3.7),beat).status,'未通过');
  assert.equal(scoreFollow(eventSamples(2.8),beat).status,'未通过');
  assert.equal(scoreFollow(eventSamples(3.1,{opacityOnly:true}),beat).status,'未通过');
});
test('legacy timing infers actual subject onset, including a delayed shot event',()=>{
  const samples=followSamples(.1).map(s=>({...s,t:s.t+5}));
  const r=scoreFollow(samples,{id:'legacy',subjectId:'hero',attachmentId:'tag'});
  assert.equal(r.status,'通过');assert.equal(r.measured.triggerTime,5.2);
  assert.equal(r.measured.triggerKind,'measured-subject-onset');
});
test('timeline relays preserve the actual production trigger and reject out-of-window times',()=>{
  const spec={fps:60,viewport:{width:1920,height:1080},coverage:{objectIds:['hero','tag']},
    actions:[{id:'approach',objectId:'hero',start:1,end:3},{id:'receive',objectId:'tag',start:3.1,end:3.5}],
    relays:[{id:'contact',fromAction:'approach',toAction:'receive',motionGate:'follow',trigger:{time:3,kind:'contact'}}]};
  const b=deriveMotionCast(spec).follows[0];
  assert.deepEqual(b.trigger,{time:3,kind:'contact'});
  assert.equal(scoreFollow(eventSamples(),b).status,'通过');
  assert.equal(scoreFollow(eventSamples(),{...b,trigger:{time:20}}).status,'无法测量');
});
test('unsupported SVG or perspective visibility cannot turn a missing measurement into a diagnostic pass',()=>{
  const samples=eventSamples();
  for(const s of samples)s.frame.objects[1].observation={state:'unknown',reason:'raw SVG/perspective'};
  assert.equal(actualFollow(samples,{id:'missing',subjectId:'hero',attachmentId:'tag',triggerTime:3}).status,'无法测量');
  assert.equal(actualComposition(samples,{mainContentIds:['tag']}).status,'无法测量');
  assert.equal(actualAnticipation(samples,{id:'a',subjectId:'tag',t0:0,t1:4}).status,'无法测量');
  const spec=passingSpec();const render=spec.frameAt;
  spec.frameAt=t=>({...render(t),camera:undefined,camera3d:{position:[0,0,1000]}});
  const report=evaluateSpec(spec,{freeze:{duration:10,segments:[]}});
  assert.equal(report.gates[1].status,'无法测量');assert.equal(report.exitCode,1);
});
test('report v2 aggregates diagnostics without aesthetic success and keeps hard failures and gaps',()=>{
  const spec=passingSpec(),render=spec.frameAt;
  spec.frameAt=t=>{
    const f=render(t);f.camera=cam(Math.min(1,t)*100);
    f.objects.find(o=>o.id==='main').width=400;
    for(const o of f.objects)if(['hero','tag'].includes(o.id))o.screenFixed=true;
    return f;
  };
  const report=evaluateSpec(spec,{freeze:{duration:10,segments:[]}});
  assert.equal(report.reportVersion,2);assert.equal(report.exitCode,0,JSON.stringify(report.gates));
  assert.deepEqual(report.gates.filter(g=>[2,4,5].includes(g.id)).map(g=>g.status),['诊断','诊断','诊断']);
  assert.equal(report.visualAcceptance,'not-assessed');
  assert(report.gates[1].reasons.length && report.gates[4].reasons.length);
  assert.equal(evaluateSpec(spec,{freeze:{duration:10,segments:[{start:0,end:3,duration:3}]}}).exitCode,2);
  spec.motionCast.mainContentIds=[];
  assert.equal(evaluateSpec(spec,{freeze:{duration:10,segments:[]}}).exitCode,1);
});
