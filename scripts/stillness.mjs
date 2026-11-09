#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// 运动量条：一次检查量两件事。任何渲染器输出的 MP4 都能检查，不需要适配器。
// 1. 逐帧静止：按 30fps 取样，统计每一帧相对上一帧有多少比例的像素明显变化；变化像素少于 0.5% 的帧记为“几乎不动”。
// 2. 构图多久没变：按 10fps 取样，缩到 32×18 灰度；从一段的第一帧算起，变化超过 8/255 的格子不到 3%，就算构图还没变。
//    粒子闪烁、细线生长、小令牌移动在 32×18 下会被平均掉，“一张图加小动作”过不了这一项。
//
// 判断线按用户认可片标定（2026-11-08）：
//   逐帧静止（480×270 灰度，像素差 >6/255）：第08期认可的 8 段几乎不动 18–43%，最长连续 1.1–1.8 秒；
//     被否的单对象测试（2026-11-07）60%，最长连续 3.27 秒。
//   构图：第08期各段和第五期标杆共 7 段，构图 2 秒以上没变的时间占 0–11%，单次最长 1.0–2.9 秒；
//     2026-11-07 被否的两版 28–35%；2026-11-08 中途停止的两次测试 81–100%（单次 4.5 秒、7.5 秒）。
// 旧的 freezedetect −55dB 只能发现完全冻结；粒子微闪、装饰细动就能让它判“通过”，所以不再作为门禁。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const STILLNESS_DEFAULTS = Object.freeze({
  sampleFps: 30,
  width: 480,
  height: 270,
  pixelDelta: 6,          // 灰度差超过 6/255 才算这个像素在变
  stillAreaPct: 0.5,      // 变化像素少于画面 0.5%：这一帧几乎不动
  ratioMax: 0.5,          // 读字窗口之外，几乎不动的帧超过一半：未通过
  segmentMaxSec: 2.0,     // 读字窗口之外，连续几乎不动超过 2 秒：未通过
  reviewSegmentSec: 1.5,  // 连续几乎不动超过 1.5 秒：要查（第08期“主对象 1.5 秒没变化就要查”）
  compFps: 10,            // 构图取样帧率
  compWidth: 32,          // 构图取样的格子数（横）
  compHeight: 18,         // 构图取样的格子数（竖）
  compCellDelta: 8,       // 一格灰度差超过 8/255 才算这一格变了
  compCellFrac: 0.03,     // 变了的格子达到 3%：构图变了，从这一帧重新计时
  compHoldSec: 2.0,       // 构图超过 2 秒没变，记一次“长时间没变”
  compShareMax: 0.2,      // 读字窗口之外，长时间没变的时间超过两成：未通过
  compSegmentMaxSec: 4.0, // 读字窗口之外，单次构图超过 4 秒没变：未通过
});

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// 原片帧率。低于取样帧率时按原片帧率取样，避免补出的重复帧被当成“几乎不动”。
function sourceFps(video, ffmpeg) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', video], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  const m = String(r.stderr || '').match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?([\d.]+) fps/);
  return m ? Number(m[1]) : null;
}

const ffmpegError = r => {
  if (r.error) return new Error(`无法运行 FFmpeg：${r.error.message}`);
  return new Error(`FFmpeg 退出码 ${r.status}：${String(r.stderr).split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')}`);
};

// 构图取样：按 10fps 取帧，缩到 32×18 灰度，每帧 576 个格子。
export function measureComposition(video, {ffmpeg = 'ffmpeg', gates = STILLNESS_DEFAULTS} = {}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const vf = `fps=${g.compFps},scale=${g.compWidth}:${g.compHeight}:flags=area,format=gray`;
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-v', 'error', '-i', video, '-map', '0:v:0', '-an', '-vf', vf, '-f', 'rawvideo', 'pipe:1'],
    {maxBuffer: 64 * 1024 * 1024});
  if (r.error || r.status !== 0) throw ffmpegError(r);
  const n = g.compWidth * g.compHeight, frames = [];
  for (let o = 0; o + n <= r.stdout.length; o += n) frames.push(r.stdout.subarray(o, o + n));
  if (!frames.length) throw new Error('没有取到构图数据。');
  return {fps: g.compFps, width: g.compWidth, height: g.compHeight, frames};
}

// 用 FFmpeg 滤镜链完成：相邻帧求差 → 二值化 → 求平均。返回 area[i] 为第 i 帧相对 i−1 帧的变化像素百分比，area[0]=0；
// comp 为构图取样，两项一起交给 scoreStillness。
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
  if (r.error || r.status !== 0) throw ffmpegError(r);
  const values = [...String(r.stdout).matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map(m => Number(m[1]) / 255 * 100);
  if (!values.length) throw new Error('没有取到逐帧变化数据。');
  const area = [0, ...values];
  const comp = measureComposition(video, {ffmpeg, gates: g});
  return {fps, area, comp, duration: area.length / fps, method: {...g, sampleFps: fps, sourceFps: native}};
}

// 构图分段：从一段的第一帧算起，变了的格子达到 compCellFrac 就结束这一段，从这一帧重新计时。
// 读字窗口和登记的例外里的帧不计，并把前后分成两段。
function compositionRuns({frames, fps}, exempt, g) {
  const runs = [];
  let anchor = null, start = -1, counted = 0;
  const close = i => { if (start >= 0) runs.push({start: round(start / fps), end: round(i / fps), duration: round((i - start) / fps)}); start = -1; anchor = null; };
  for (let i = 0; i < frames.length; i++) {
    if (exempt(i / fps)) { close(i); continue; }
    counted++;
    const f = frames[i];
    if (anchor) {
      let changed = 0;
      for (let k = 0; k < f.length; k++) if (Math.abs(f[k] - anchor[k]) > g.compCellDelta) changed++;
      if (changed < g.compCellFrac * f.length) continue;
      close(i);
    }
    anchor = f;
    start = i;
  }
  close(frames.length);
  return {runs, countedSec: counted / fps};
}

function scoreComposition(comp, exempt, g) {
  const {runs, countedSec} = compositionRuns(comp, exempt, g);
  const holds = runs.filter(r => r.duration > g.compHoldSec + 1e-9);
  const share = countedSec ? holds.reduce((s, r) => s + r.duration, 0) / countedSec : 0;
  const reasons = [], review = [];
  if (share > g.compShareMax + 1e-9) reasons.push(`读字窗口之外，构图 ${g.compHoldSec} 秒以上没变的时间占 ${(share * 100).toFixed(1)}%，超过 ${(g.compShareMax * 100).toFixed(0)}%：这是一张图在放小动作，回到看点和事件改，补小动作过不了这一项。`);
  for (const r of holds) {
    if (r.duration > g.compSegmentMaxSec + 1e-9) reasons.push(`${r.start}–${r.end} 秒构图 ${r.duration} 秒没变，超过 ${g.compSegmentMaxSec} 秒，而且不在读字窗口里。`);
    else review.push(`${r.start}–${r.end} 秒构图 ${r.duration} 秒没变：不是读字就换构图或取景。`);
  }
  return {
    reasons, review,
    measured: {
      holdShare: round(share, 4), longestHoldSec: round(runs.reduce((m, r) => Math.max(m, r.duration), 0)), holds, countedSec: round(countedSec),
      method: `${comp.fps}fps 取样，${comp.width ?? g.compWidth}×${comp.height ?? g.compHeight} 灰度；从一段的第一帧算起，变化 >${g.compCellDelta}/255 的格子不到 ${g.compCellFrac * 100}% 记为构图没变`,
    },
  };
}

// readings / exceptions：[{t0, t1}]。读字窗口和经用户确认登记的例外不计入静止和构图统计。
// comp 缺省时只判逐帧静止（单元测试用）；实际检查由 measureStillness 一并取样。
export function scoreStillness({area, fps = 30, comp = null, readings = [], exceptions = [], gates = STILLNESS_DEFAULTS}) {
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
  const composition = comp?.frames?.length ? scoreComposition(comp, exempt, g) : null;
  if (composition) { reasons.push(...composition.reasons); review.push(...composition.review); }
  return {
    status: reasons.length ? '未通过' : '通过',
    judgment: 'hard-gate',
    reasons,
    review,
    measured: {
      ratio: round(ratio, 4), longestSec: round(longest), countedFrames: counted, exemptFrames: area.length - 1 - counted,
      stillRuns: runs.filter(r => r.duration >= 0.5), exemptWindows: windows.map(w => ({t0: w.t0, t1: w.t1})),
      method: `${fps}fps 取样，${g.width}×${g.height} 灰度，像素差 >${g.pixelDelta}/255，变化面积 <${g.stillAreaPct}% 记为几乎不动`,
      composition: composition ? composition.measured : null,
    },
  };
}

const compText = c => c ? `；构图 2 秒以上没变 ${(c.holdShare * 100).toFixed(0)}%，最长 ${c.longestHoldSec} 秒` : '';

// 运动量条：每一帧变化面积画成一根柱子，紫线标出构图 2 秒以上没变的时段。可同时画一段对标片做对照。
export function stillnessSvg({area, fps = 30, comp = null, readings = [], title = '本片', benchmark = null, gates = STILLNESS_DEFAULTS}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const rows = [{title, area, comp, readings}];
  if (benchmark?.area?.length) rows.push({title: benchmark.title || '对标片', area: benchmark.area.slice(0, area.length), readings: [], composition: benchmark.composition});
  const seconds = (area.length - 1) / fps, W = 1200, rowH = 150, pad = 46, cap = 12;
  const x = t => pad + (W - pad - 20) * Math.min(t, seconds) / Math.max(seconds, 1e-6);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let body = '';
  rows.forEach((row, k) => {
    const y0 = 30 + k * (rowH + 50), h = rowH;
    const scored = scoreStillness({area: row.area, fps, comp: row.comp, readings: row.readings, gates: g});
    const c = row.comp ? scored.measured.composition : row.composition;
    body += `<text x="${pad}" y="${y0 - 8}" font-size="15" fill="#222">${esc(row.title)}：几乎不动 ${(scored.measured.ratio * 100).toFixed(0)}%，最长连续 ${scored.measured.longestSec} 秒${compText(c)}</text>`;
    body += `<rect x="${pad}" y="${y0}" width="${W - pad - 20}" height="${h}" fill="#fafafa" stroke="#ccc"/>`;
    for (const w of row.readings) body += `<rect x="${x(w.t0)}" y="${y0}" width="${Math.max(1, x(w.t1) - x(w.t0))}" height="${h}" fill="#e8f2e8"/>`;
    const bw = Math.max(1, (W - pad - 20) / Math.max(1, row.area.length - 1));
    for (let i = 1; i < row.area.length; i++) {
      const v = Math.min(row.area[i], cap) / cap, still = row.area[i] < g.stillAreaPct;
      body += `<rect x="${x((i - 1) / fps).toFixed(1)}" y="${(y0 + h - v * h).toFixed(1)}" width="${bw.toFixed(2)}" height="${(v * h).toFixed(1)}" fill="${k ? '#c8742c' : '#3a6fbe'}"/>`;
      if (still) body += `<rect x="${x((i - 1) / fps).toFixed(1)}" y="${y0 + h + 2}" width="${bw.toFixed(2)}" height="4" fill="#d33"/>`;
    }
    for (const hold of (c?.holds ?? []).filter(h => h.start < seconds)) body += `<rect x="${x(hold.start).toFixed(1)}" y="${y0 + h + 8}" width="${Math.max(1, x(hold.end) - x(hold.start)).toFixed(1)}" height="4" fill="#8a4fbf"/>`;
    for (let s = 0; s <= Math.floor(seconds); s++) body += `<text x="${x(s) - 4}" y="${y0 + h + 24}" font-size="11" fill="#666">${s}s</text>`;
  });
  const H = 30 + rows.length * (rowH + 50) + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Microsoft YaHei, sans-serif">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>${body}`
    + `<text x="${pad}" y="${H - 4}" font-size="11" fill="#666">柱高＝这一帧画面在变的比例（封顶 ${cap}%）；红线＝几乎不动的帧；紫线＝构图 2 秒以上没变；浅绿底＝登记的读字窗口</text></svg>`;
}

// 同一张运动量条的 PNG 版（不依赖额外库，用 FFmpeg 编码），方便只能看位图的执行者自查。
// 蓝柱＝本片，橙柱＝对标片，红线＝几乎不动的帧，紫线＝构图 2 秒以上没变，浅绿底＝读字窗口，灰线＝每秒刻度。
export function stillnessPng({area, fps = 30, comp = null, readings = [], benchmark = null, file, ffmpeg = 'ffmpeg', gates = STILLNESS_DEFAULTS}) {
  const g = {...STILLNESS_DEFAULTS, ...gates};
  const own = comp?.frames?.length ? scoreStillness({area, fps, comp, readings, gates: g}).measured.composition : null;
  const rows = [{area, readings, holds: own?.holds ?? [], color: [58, 111, 190]}];
  if (benchmark?.area?.length) rows.push({area: benchmark.area.slice(0, area.length), readings: [], holds: benchmark.composition?.holds ?? [], color: [200, 116, 44]});
  const W = 1200, rowH = 150, gap = 24, H = rows.length * (rowH + gap) + gap, buf = Buffer.alloc(W * H * 3, 255);
  const put = (x, y, [r, gg, b]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = gg; buf[o + 2] = b; };
  const fill = (x0, y0, x1, y1, c) => { for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, c); };
  const seconds = Math.max((area.length - 1) / fps, 1e-6), x = t => 10 + (W - 20) * Math.min(t, seconds) / seconds, cap = 12;
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
    for (const hold of row.holds.filter(h => h.start < seconds)) fill(x(hold.start), y0 + rowH + 11, Math.max(x(hold.start) + 1, x(hold.end)), y0 + rowH + 17, [138, 79, 191]);
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
同时量逐帧静止和构图多久没变。输出 stillness.json，以及运动量条 stillness.png／stillness.svg（加 --benchmark 时同图对照）。退出码：0 通过；2 未通过；1 无法测量或参数错误。
读字窗口只登记画面上真有字要读的时段，每秒约 5 个字、至少 1 秒；“方便比较”不算读字。构图项未通过时回到看点和事件改，补小动作过不了。`;

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
  const result = scoreStillness({area: measured.area, fps: measured.fps, comp: measured.comp, readings});
  const benchmark = loadBenchmark(args.benchmark);
  fs.mkdirSync(args.out, {recursive: true});
  const report = {
    video: path.resolve(args.video), duration: round(measured.duration), ...result,
    benchmark: benchmark ? {id: benchmark.id, title: benchmark.title, ratio: benchmark.stats?.ratio, longestSec: benchmark.stats?.longestSec,
      compositionHoldShare: benchmark.composition?.holdShare ?? null, compositionLongestHoldSec: benchmark.composition?.longestHoldSec ?? null} : null,
    area: measured.area.map(v => round(v, 3)),
  };
  fs.writeFileSync(path.join(args.out, 'stillness.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(args.out, 'stillness.svg'), stillnessSvg({area: measured.area, fps: measured.fps, comp: measured.comp, readings, title: path.basename(args.video), benchmark}));
  stillnessPng({area: measured.area, fps: measured.fps, comp: measured.comp, readings, benchmark, file: path.join(args.out, 'stillness.png'), ffmpeg: args.ffmpeg || 'ffmpeg'});
  console.log(`${result.status}：几乎不动 ${(result.measured.ratio * 100).toFixed(1)}%，最长连续 ${result.measured.longestSec} 秒${compText(result.measured.composition)}。${[...result.reasons, ...result.review].join(' ')}`);
  return result.status === '通过' ? 0 : result.status === '未通过' ? 2 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (err) { console.error(String(err.message || err)); process.exitCode = 1; }
}
