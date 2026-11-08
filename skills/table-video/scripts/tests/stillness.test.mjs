import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {measureStillness, scoreStillness} from '../stillness.mjs';

// 构图取样的合成数据：10fps，每帧 32×18=576 格。changeAt 里的秒点把整幅画换成另一种灰度（构图大变）；
// flicker 为 true 时，每帧都有 5 个格子（不到 1%）来回闪，模拟“一张图加小动作”。
const compData = (duration, {changeAt = [], flicker = false} = {}) => {
  const fps = 10, frames = [];
  let level = 60;
  for (let i = 0; i < Math.round(duration * fps); i++) {
    if (changeAt.some(t => Math.round(t * fps) === i)) level = level === 60 ? 160 : 60;
    const f = Buffer.alloc(576, level);
    if (flicker) for (let k = 0; k < 5; k++) f[k * 97] = i % 2 ? 250 : 0;
    frames.push(f);
  }
  return {fps, width: 32, height: 18, frames};
};
// 逐帧静止部分全程在动（每帧 5% 像素变化），只让构图这一项决定结果。
const moving = duration => [0, ...new Array(Math.round(duration * 30)).fill(5)];

test('a fixed picture with small motions passes per-frame stillness but fails the composition hold', () => {
  const r = scoreStillness({area: moving(10), fps: 30, comp: compData(10, {flicker: true})});
  assert.equal(r.status, '未通过');
  assert.equal(r.measured.ratio, 0);
  assert.equal(r.measured.composition.holdShare, 1);
  assert.match(r.reasons.join(' '), /构图 2 秒以上没变的时间占 100\.0%/);
  assert.match(r.reasons.join(' '), /补小动作过不了/);
});

test('changing the composition every second passes', () => {
  const r = scoreStillness({area: moving(10), fps: 30, comp: compData(10, {changeAt: [1, 2, 3, 4, 5, 6, 7, 8, 9]})});
  assert.equal(r.status, '通过');
  assert.equal(r.measured.composition.holdShare, 0);
  assert.ok(r.measured.composition.longestHoldSec <= 1.0001);
});

test('reading windows are not counted as composition holds', () => {
  const comp = compData(6);
  assert.equal(scoreStillness({area: moving(6), fps: 30, comp}).status, '未通过');
  const r = scoreStillness({area: moving(6), fps: 30, comp, readings: [{t0: 1.5, t1: 5}]});
  assert.equal(r.status, '通过');
  assert.equal(r.measured.composition.holds.length, 0);
});

test('one hold longer than 4 seconds fails even when the share stays under one fifth', () => {
  const changes = [];
  for (let t = 4.5; t < 30; t += 1) changes.push(t);
  const r = scoreStillness({area: moving(30), fps: 30, comp: compData(30, {changeAt: changes})});
  assert.ok(r.measured.composition.holdShare < 0.2);
  assert.equal(r.status, '未通过');
  assert.match(r.reasons.join(' '), /0–4\.5 秒构图 4\.5 秒没变，超过 4 秒/);
});

test('holds between 2 and 4 seconds are listed for review without failing on their own', () => {
  const r = scoreStillness({area: moving(20), fps: 30, comp: compData(20, {changeAt: [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5]})});
  assert.equal(r.status, '通过');
  assert.equal(r.review.length, 1);
  assert.match(r.review[0], /不是读字就换构图或取景/);
});

test('benchmark profiles carry composition numbers inside the pass line', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../assets/motion/benchmarks/stillness-profiles.json', import.meta.url), 'utf8'));
  for (const p of data.profiles) {
    assert.ok(p.composition, p.id);
    assert.ok(p.composition.holdShare <= 0.2, p.id);
    assert.ok(p.composition.longestHoldSec <= 4, p.id);
  }
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('measureStillness samples the composition from a real video', {skip: !hasFfmpeg && 'ffmpeg 不可用'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stillness-comp-'));
  try {
    const still = path.join(dir, 'still.mp4'), box = path.join(dir, 'box.mp4');
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=30:d=4', '-pix_fmt', 'yuv420p', still]).status, 0);
    assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'color=c=white:s=120x120:r=30:d=4',
      '-filter_complex', "[0][1]overlay=x='mod(t*200,320)':y=30:shortest=1", '-pix_fmt', 'yuv420p', box]).status, 0);
    const a = measureStillness(still);
    assert.equal(a.comp.frames.length >= 38, true);
    const sa = scoreStillness({area: a.area, fps: a.fps, comp: a.comp});
    assert.equal(sa.status, '未通过');
    assert.ok(sa.measured.composition.holdShare > 0.9);
    const b = measureStillness(box);
    const sb = scoreStillness({area: b.area, fps: b.fps, comp: b.comp});
    assert.equal(sb.measured.composition.holdShare, 0);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
