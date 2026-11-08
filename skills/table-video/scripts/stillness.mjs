#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// 感知静止检查：按 30fps 取样，统计每一帧相对上一帧有多少比例的像素明显变化。
// 变化像素少于 0.5% 的帧记为“几乎不动”。任何渲染器输出的 MP4 都能检查，不需要适配器。
//
// 判断线按用户认可片标定（2026-11-08，480×270 灰度，像素差 >6/255）：
//   第08期认可的 8 段：几乎不动 18–43%，最长连续 1.1–1.8 秒，多数不超过 1.5 秒；
//   被否的单对象测试（2026-11-07）：60%，最长连续 3.27 秒。
// 旧的 freezedetect −55dB 只能发现完全冻结；粒子微闪、装饰细动就能让它判“通过”，所以不再作为门禁。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const STILLNESS_DEFAULTS = Object.freeze({
  sampleFps: 30,
  width: 480,
  height: 270,
  pixelDelta: 6,        // 灰度差超过 6/255 才算这个像素在变
  stillAreaPct: 0.5,    // 变化像素少于画面 0.5%：这一帧几乎不动
  ratioMax: 0.5,        // 读字窗口之外，几乎不动的帧超过一半：未通过
  segmentMaxSec: 2.0,   // 读字窗口之外，连续几乎不动超过 2 秒：未通过
  reviewSegmentSec: 1.5 // 连续几乎不动超过 1.5 秒：要查（第08期“主对象 1.5 秒没变化就要查”）
});

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// 原片帧率。低于取样帧率时按原片帧率取样，避免补出的重复帧被当成“几乎不动”。
function sourceFps(video, ffmpeg) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', video], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  const m = String(r.stderr || '').match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?([\d.]+) fps/);
  return m ? Number(m[1]) : null;
}

// 用 FFmpeg 滤镜链完成：相邻帧求差 → 二值化 → 求平均。返回 area[i] 为第 i 帧相对 i−1 帧的变化像素百分比，area[0]=0。
export function measureStillness(video, {ffmpeg = 'ffmpeg', gates = STILLNESS_DEFAULTS} = {}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const native = sourceFps(video, ffmpeg);
  const fps = native && native > 0 ? Math.min(g.sampleFps, native) : g.sampleFps;
  const vf = [
    `fps=${fps}`, `scale=${g.width}:${g.height}:flags=area`, 'format=gray',
    'tblend=all_mode=difference', `lut=y='if(gt(val\\,${g.pixelDelta})\\,255\\,0)'`,
    'signalstats', 'metadata=print:key=lavfi.signalstats.YAVG:file=-',
  ].join(',');
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', video, '-map', '0:v:0', '-an', '-vf', vf, '-f', 'null', '-'],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.error) throw new Error(`无法运行 FFmpeg：${r.error.message}`);
  if (r.status !== 0) throw new Error(`FFmpeg 退出码 ${r.status}：${String(r.stderr).split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')}`);
  const values = [...String(r.stdout).matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map(m => Number(m[1]) / 255 * 100);
  if (!values.length) throw new Error('没有取到逐帧变化数据。');
  const area = [0, ...values];
  return {fps, area, duration: area.length / fps, method: {...g, sampleFps: fps, sourceFps: native}};
}

// readings / exceptions：[{t0, t1}]。读字窗口和经用户确认登记的例外不计入静止统计。
export function scoreStillness({area, fps = 30, readings = [], exceptions = [], gates = STILLNESS_DEFAULTS}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  if (!Array.isArray(area) || area.length < 2) return {status: '无法测量', reasons: ['没有逐帧变化数据。'], review: [], measured: {}};
  const windows = [...readings, ...exceptions].filter(w => w && Number.isFinite(w.t0) && Number.isFinite(w.t1) && w.t1 > w.t0 && w.valid !== false);
  const exempt = t => windows.some(w => t > w.t0 + 1e-9 && t <= w.t1 + 1e-9);
  let counted = 0, still = 0, run = 0, runStart = 0;
  const runs = [];
  const close = i => { if (run) runs.push({start: round(runStart / fps), end: round(i / fps), duration: round(run / fps)}); run = 0; };
  for (let i = 1; i < area.length; i++) {
    const t = i / fps;
    if (exempt(t)) { close(i - 1); continue; }
    counted++;
    if (area[i] < g.stillAreaPct) { still++; if (!run) runStart = i - 1; run++; }
    else close(i - 1);
  }
  close(area.length - 1);
  const ratio = counted ? still / counted : 0;
  const longest = runs.reduce((m, r) => Math.max(m, r.duration), 0);
  const reasons = [];
  if (ratio > g.ratioMax + 1e-9) reasons.push(`读字窗口之外，几乎不动的帧占 ${(ratio * 100).toFixed(1)}%，超过 ${(g.ratioMax * 100).toFixed(0)}%。`);
  for (const r of runs.filter(r => r.duration > g.segmentMaxSec + 1e-9)) reasons.push(`${r.start}–${r.end} 秒连续 ${r.duration} 秒几乎不动，超过 ${g.segmentMaxSec} 秒，而且不在读字窗口里。`);
  const review = runs.filter(r => r.duration > g.reviewSegmentSec + 1e-9 && r.duration <= g.segmentMaxSec + 1e-9)
    .map(r => `${r.start}–${r.end} 秒连续 ${r.duration} 秒几乎不动：确认这里主对象确实不需要变化。`);
  return {
    status: reasons.length ? '未通过' : '通过',
    judgment: 'hard-gate',
    reasons,
    review,
    measured: {
      ratio: round(ratio, 4), longestSec: round(longest), countedFrames: counted, exemptFrames: area.length - 1 - counted,
      stillRuns: runs.filter(r => r.duration >= 0.5), exemptWindows: windows.map(w => ({t0: w.t0, t1: w.t1})),
      method: `${fps}fps 取样，${g.width}×${g.height} 灰度，像素差 >${g.pixelDelta}/255，变化面积 <${g.stillAreaPct}% 记为几乎不动`,
    },
  };
}

// 运动量条：每一帧变化面积画成一根柱子。可同时画一段对标片做对照。
export function stillnessSvg({area, fps = 30, readings = [], title = '本片', benchmark = null, gates = STILLNESS_DEFAULTS}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const rows = [{title, area, readings}];
  if (benchmark?.area?.length) rows.push({title: benchmark.title || '对标片', area: benchmark.area.slice(0, area.length), readings: []});
  const seconds = (area.length - 1) / fps, W = 1200, rowH = 150, pad = 46, cap = 12;
  const x = t => pad + (W - pad - 20) * t / Math.max(seconds, 1e-6);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let body = '';
  rows.forEach((row, k) => {
    const y0 = 30 + k * (rowH + 40), h = rowH;
    const scored = scoreStillness({area: row.area, fps, readings: row.readings, gates: g});
    body += `<text x="${pad}" y="${y0 - 8}" font-size="15" fill="#222">${esc(row.title)}：几乎不动 ${(scored.measured.ratio * 100).toFixed(0)}%，最长连续 ${scored.measured.longestSec} 秒</text>`;
    body += `<rect x="${pad}" y="${y0}" width="${W - pad - 20}" height="${h}" fill="#fafafa" stroke="#ccc"/>`;
    for (const w of row.readings) body += `<rect x="${x(w.t0)}" y="${y0}" width="${Math.max(1, x(w.t1) - x(w.t0))}" height="${h}" fill="#e8f2e8"/>`;
    const bw = Math.max(1, (W - pad - 20) / Math.max(1, row.area.length - 1));
    for (let i = 1; i < row.area.length; i++) {
      const v = Math.min(row.area[i], cap) / cap, still = row.area[i] < g.stillAreaPct;
      body += `<rect x="${x((i - 1) / fps).toFixed(1)}" y="${(y0 + h - v * h).toFixed(1)}" width="${bw.toFixed(2)}" height="${(v * h).toFixed(1)}" fill="${k ? '#c8742c' : '#3a6fbe'}"/>`;
      if (still) body += `<rect x="${x((i - 1) / fps).toFixed(1)}" y="${y0 + h + 2}" width="${bw.toFixed(2)}" height="4" fill="#d33"/>`;
    }
    for (let s = 0; s <= Math.floor(seconds); s++) body += `<text x="${x(s) - 4}" y="${y0 + h + 18}" font-size="11" fill="#666">${s}s</text>`;
  });
  const H = 30 + rows.length * (rowH + 40) + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Microsoft YaHei, sans-serif">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>${body}`
    + `<text x="${pad}" y="${H - 4}" font-size="11" fill="#666">柱高＝这一帧画面在变的比例（封顶 ${cap}%）；红线＝几乎不动的帧；浅绿底＝登记的读字窗口</text></svg>`;
}

// 同一张运动量条的 PNG 版（不依赖额外库，用 FFmpeg 编码），方便只能看位图的执行者自查。
// 蓝柱＝本片，橙柱＝对标片，红线＝几乎不动的帧，浅绿底＝读字窗口，灰线＝每秒刻度。
export function stillnessPng({area, fps = 30, readings = [], benchmark = null, file, ffmpeg = 'ffmpeg', gates = STILLNESS_DEFAULTS}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const rows = [{area, readings, color: [58, 111, 190]}];
  if (benchmark?.area?.length) rows.push({area: benchmark.area.slice(0, area.length), readings: [], color: [200, 116, 44]});
  const W = 1200, rowH = 150, gap = 24, H = rows.length * (rowH + gap) + gap, buf = Buffer.alloc(W * H * 3, 255);
  const put = (x, y, [r, gg, b]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = gg; buf[o + 2] = b; };
  const fill = (x0, y0, x1, y1, c) => { for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, c); };
  const seconds = Math.max((area.length - 1) / fps, 1e-6), x = t => 10 + (W - 20) * t / seconds, cap = 12;
  rows.forEach((row, k) => {
    const y0 = gap + k * (rowH + gap);
    fill(10, y0, W - 10, y0 + rowH, [248, 248, 248]);
    for (const w of row.readings) fill(x(w.t0), y0, x(w.t1) + 1, y0 + rowH, [226, 241, 226]);
    for (let s = 0; s <= Math.floor(seconds); s++) fill(x(s), y0, x(s) + 1, y0 + rowH, [215, 215, 215]);
    for (let i = 1; i < row.area.length; i++) {
      const v = Math.min(row.area[i], cap) / cap, xa = x((i - 1) / fps), xb = Math.max(xa + 1, x(i / fps));
      fill(xa, y0 + rowH - v * rowH, xb, y0 + rowH, row.color);
      if (row.area[i] < g.stillAreaPct) fill(xa, y0 + rowH + 3, xb, y0 + rowH + 9, [210, 40, 40]);
    }
  });
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', file], {input: buf});
  if (r.status !== 0) throw new Error(`运动量条 PNG 编码失败：${String(r.stderr).slice(0, 200)}`);
  return file;
}

function parseWindows(text) {
  if (!text) return [];
  return String(text).split(',').filter(Boolean).map(part => {
    const [a, b] = part.split(':').map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new Error(`读字窗口格式应为 起秒:止秒，收到 ${part}`);
    return {t0: a, t1: b};
  });
}

export function loadBenchmark(name, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  if (!name) return null;
  const file = fs.existsSync(name) ? name : path.join(root, 'assets', 'motion', 'benchmarks', 'stillness-profiles.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(data.area)) return data;
  const hit = (data.profiles || []).find(p => p.id === name);
  if (!hit) throw new Error(`没有名为 ${name} 的对标曲线；可选：${(data.profiles || []).map(p => p.id).join('、')}`);
  return hit;
}

const HELP = `node scripts/stillness.mjs --video <preview.mp4> --out <新的输出目录> [--reading 起秒:止秒,…] [--benchmark ep08-d07-v04|ep05-d03-b-v4|<曲线.json>] [--ffmpeg ffmpeg]
输出 stillness.json，以及运动量条 stillness.png／stillness.svg（加 --benchmark 时同图对照）。退出码：0 通过；2 未通过；1 无法测量或参数错误。
读字窗口只登记画面上真有字要读的时段，每秒约 5 个字、至少 1 秒；“方便比较”不算读字。`;

export function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--help' || k === '-h') { console.log(HELP); return 0; }
    if (!k.startsWith('--')) throw new Error(`无法识别参数 ${k}\n${HELP}`);
    args[k.slice(2)] = argv[++i];
  }
  if (!args.video || !args.out) { console.error(HELP); return 1; }
  if (fs.existsSync(args.out) && fs.readdirSync(args.out).length) { console.error(`输出目录已存在且不为空，拒绝覆盖：${args.out}`); return 1; }
  let measured;
  try { measured = measureStillness(args.video, {ffmpeg: args.ffmpeg || 'ffmpeg'}); }
  catch (err) { console.error(String(err.message || err)); return 1; }
  const readings = parseWindows(args.reading);
  const result = scoreStillness({area: measured.area, fps: measured.fps, readings});
  const benchmark = loadBenchmark(args.benchmark);
  fs.mkdirSync(args.out, {recursive: true});
  const report = {video: path.resolve(args.video), duration: round(measured.duration), ...result, benchmark: benchmark ? {id: benchmark.id, title: benchmark.title, ratio: benchmark.stats?.ratio, longestSec: benchmark.stats?.longestSec} : null, area: measured.area.map(v => round(v, 3))};
  fs.writeFileSync(path.join(args.out, 'stillness.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(args.out, 'stillness.svg'), stillnessSvg({area: measured.area, fps: measured.fps, readings, title: path.basename(args.video), benchmark}));
  stillnessPng({area: measured.area, fps: measured.fps, readings, benchmark, file: path.join(args.out, 'stillness.png'), ffmpeg: args.ffmpeg || 'ffmpeg'});
  console.log(`${result.status}：几乎不动 ${(result.measured.ratio * 100).toFixed(1)}%，最长连续 ${result.measured.longestSec} 秒。${[...result.reasons, ...result.review].join(' ')}`);
  return result.status === '通过' ? 0 : result.status === '未通过' ? 2 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (err) { console.error(String(err.message || err)); process.exitCode = 1; }
}
