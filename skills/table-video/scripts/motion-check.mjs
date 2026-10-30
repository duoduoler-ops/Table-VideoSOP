#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Motion diagnostics locate suspect intervals; they never certify visual quality.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const HELP = `Usage: node motion-check.mjs --input <video> --out <NEW directory>
  [--ranges 4:8,22:28] [--overview-frames 48] [--dense-fps 10]
  [--min-freeze 0.75] [--threshold-db -55] [--ffmpeg ffmpeg] [--ffprobe ffprobe]
  [--purpose-at 2] [--rework-over 3]
  [--audit <source-bound motion-audit/motion-gates report.json>]
The output parent must exist. Existing output directories are never overwritten.
Uses existing FFmpeg/FFprobe, no installation. Duration thresholds flag intervals
for review against project requirements; small meaningful motion may look static
to the detector. Thresholds alone do not decide whether an interval needs rework.
These diagnostics cannot establish camera movement, visual meaning, or quality.`;

function options(args) {
  if (args.includes('--help')) return { help: true };
  const accepted = new Set(['input', 'out', 'ranges', 'overview-frames', 'dense-fps', 'min-freeze', 'threshold-db', 'purpose-at', 'rework-over', 'ffmpeg', 'ffprobe', 'audit']);
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !accepted.has(key) || i + 1 >= args.length || Object.hasOwn(o, key)) throw new Error(`Unknown, repeated, or incomplete option: ${args[i]}`);
    o[key] = args[i + 1];
  }
  if (!o.input || !o.out) throw new Error('--input and --out are required');
  for (const [key, value, min, max] of [
    ['overview-frames', 48, 1, 96], ['dense-fps', 10, 1, 30],
    ['min-freeze', 0.75, 0.05, 60], ['threshold-db', -55, -120, -1],
    ['purpose-at', 2, 0.05, 600], ['rework-over', 3, 0.05, 600],
  ]) {
    o[key] = Number(o[key] ?? value);
    if (!Number.isFinite(o[key]) || o[key] < min || o[key] > max) throw new Error(`Invalid ${key}: expected ${min}..${max}`);
  }
  if (!Number.isInteger(o['overview-frames'])) throw new Error('overview-frames must be an integer');
  if (o['purpose-at'] > o['rework-over']) throw new Error('purpose-at must not exceed rework-over');
  return o;
}

async function command(executable, args, logPath) {
  const result = await new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', overflow = false;
    const limit = 16 * 1024 * 1024;
    const collect = (kind, chunk) => {
      if (kind === 'out') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      if (stdout.length + stderr.length > limit) { overflow = true; proc.kill(); }
    };
    proc.stdout.on('data', b => collect('out', b));
    proc.stderr.on('data', b => collect('err', b));
    proc.on('error', error => reject(new Error(`Cannot run ${executable}: ${error.code ?? error.message}`)));
    proc.on('close', code => resolve({ code, stdout, stderr, overflow }));
  });
  if (logPath) await fs.writeFile(logPath, result.stderr || result.stdout, { encoding: 'utf8', flag: 'wx' });
  if (result.code !== 0 || result.overflow) throw new Error(`${executable} failed (${result.overflow ? 'output limit' : result.code}): ${result.stderr.slice(-1600)}`);
  return result;
}

function rational(value) {
  const [a, b = '1'] = String(value ?? '').split('/').map(Number);
  return Number.isFinite(a / b) && a / b > 0 ? a / b : null;
}
const rounded = n => Math.round(n * 1e6) / 1e6;
const timestamp = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${(n % 60).toFixed(3).padStart(6, '0')}`;

export function parseFreezes(log, duration, { purposeAt = 2, reworkOver = 3 } = {}) {
  let start = null;
  const intervals = [];
  function append(end, closedAtEof) {
    if (start === null) throw new Error('Malformed freeze log: end without start');
    const boundedEnd = Math.min(duration, end);
    if (start < 0 || boundedEnd < start) throw new Error('Malformed freeze interval');
    const seconds = rounded(boundedEnd - start);
    intervals.push({ start: rounded(start), end: rounded(boundedEnd), duration: seconds, closedAtEof,
      review: seconds > reworkOver ? 'default-rework' : seconds >= purposeAt ? 'purpose-review-required' : 'locate-only' });
    start = null;
  }
  for (const match of log.matchAll(/lavfi\.freezedetect\.freeze_(start|end):\s*([-+\d.eE]+)/g)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value)) throw new Error('Malformed freeze timestamp');
    if (match[1] === 'start') {
      if (start !== null) throw new Error('Malformed freeze log: repeated start');
      start = value;
    } else append(value, false);
  }
  if (start !== null) append(duration, true);
  return intervals;
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function json(filename, value) { await fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); }

export function exactFrameFilter(frame) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error('Invalid source frame index');
  return `select=eq(n\\,${frame})`;
}

// Decode-frame PTS, not nominal fps or -ss rounding, is authoritative for selected evidence.
export function planAuditFrames(report, videoHash, pts, {lastFrameDuration=0}={}) {
  const audit=report.engineeringAudit??report;
  if (!audit.locks?.video?.sha256 || audit.locks.video.sha256!==videoHash) throw new Error('Audit/video hash mismatch or missing binding');
  if (!Array.isArray(pts)||!pts.length||pts.some((t,i)=>!Number.isFinite(t)||(i>0&&t<pts[i-1]))) throw new Error('Invalid decoded frame PTS');
  if (!Number.isFinite(lastFrameDuration)||lastFrameDuration<0) throw new Error('Invalid decoded final-frame duration');
  const risks=[...(audit.motionObservations?.reviewFrames??[])];
  for (const f of audit.findings??[]) for (const time of [f.time,f.start,f.end]) if (Number.isFinite(time)) risks.push({time,reasons:[f.code],objects:[f.objectId].filter(Boolean)});
  if (!risks.length) return [];
  const origin=pts[0],coverageEnd=pts.at(-1)-origin+lastFrameDuration,selected=new Map();
  for (const risk of risks) {
    if (!Number.isFinite(risk.time)||risk.time<0) throw new Error('Invalid audit review time');
    // One microsecond only absorbs FFprobe decimal timestamp rounding. Never trust adapter duration.
    if (risk.time>coverageEnd+1e-6) throw new Error(`Audit review time ${risk.time}s outside decoded video coverage 0..${coverageEnd}s`);
    const target=origin+risk.time;
    let lo=0,hi=pts.length-1;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(pts[mid]<target)lo=mid+1;else hi=mid;}
    const index=lo>0&&Math.abs(pts[lo-1]-target)<=Math.abs(pts[lo]-target)?lo-1:lo;
    const row=selected.get(index)??{sourceFrame:index,sourcePtsSeconds:pts[index],relativeSeconds:pts[index]-origin,requestedTimes:[],requestedProductionFrames:[],objects:[],reasons:[]};
    for (const [key,values] of [['requestedTimes',[risk.time]],['requestedProductionFrames',Number.isInteger(risk.frame)?[risk.frame]:[]],['objects',risk.objects??[]],['reasons',risk.reasons??[]]]) for (const value of values) if(!row[key].includes(value))row[key].push(value);
    selected.set(index,row);
  }
  return [...selected.values()].sort((a,b)=>a.sourceFrame-b.sourceFrame);
}

export async function motionCheck(o) {
  const source = await fs.realpath(path.resolve(o.input));
  const sourceStat = await fs.stat(source);
  if (!sourceStat.isFile() || !sourceStat.size) throw new Error('Input must be a nonempty regular video file');
  const requestedOut = path.resolve(o.out);
  const outputParent = await fs.realpath(path.dirname(requestedOut));
  const out = path.join(outputParent, path.basename(requestedOut));
  try { await fs.lstat(out); throw new Error(`Output already exists; choose a new directory: ${out}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ffmpeg = o.ffmpeg ?? 'ffmpeg', ffprobe = o.ffprobe ?? 'ffprobe';
  const versions = await Promise.all([command(ffmpeg, ['-version']), command(ffprobe, ['-version'])]);
  const probe = await command(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', source]);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw new Error('Input has no playable video stream');
  const duration = Number(video.duration ?? metadata.format?.duration);
  const fps = rational(video.avg_frame_rate) ?? rational(video.r_frame_rate);
  if (!(duration > 0) || !Number.isFinite(duration) || !fps) throw new Error('Video duration/frame rate is unavailable');
  const ranges = o.ranges ? o.ranges.split(',').map((range, i) => {
    const parts = range.split(':');
    if (parts.length !== 2 || parts.some(p => !p.trim())) throw new Error(`Invalid range: ${range}`);
    const [start, end] = parts.map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) throw new Error(`Range outside video: ${range}`);
    return { id: i + 1, start, end };
  }) : [];
  if (ranges.reduce((n, r) => n + r.end - r.start, 0) > 300) throw new Error('Dense ranges exceed 300 seconds; split the review into separate runs');
  const sourceHash = await sha256(source);
  const auditFile=o.audit?await fs.realpath(path.resolve(o.audit)):null;
  const auditReport=auditFile?JSON.parse(await fs.readFile(auditFile,'utf8')):null;
  const auditHash=auditFile?await sha256(auditFile):null;
  let exactPlan=[],exactCoverage=null;
  if (auditReport) {
    const probeFrames=await command(ffprobe,['-v','error','-select_streams',String(video.index),'-show_frames','-show_entries','frame=best_effort_timestamp_time,duration_time,pkt_duration_time','-of','json',source]);
    const decoded=JSON.parse(probeFrames.stdout).frames,pts=decoded?.map(f=>Number(f.best_effort_timestamp_time));
    const last=decoded?.at(-1),durationField=['duration_time','pkt_duration_time'].find(key=>Number.isFinite(Number(last?.[key]))&&Number(last[key])>0);
    const lastFrameDuration=durationField?Number(last[durationField]):0;
    exactPlan=planAuditFrames(auditReport,sourceHash,pts,{lastFrameDuration});
    exactCoverage={firstPtsSeconds:pts[0],lastPtsSeconds:pts.at(-1),lastFrameDurationSeconds:lastFrameDuration,durationBasis:durationField??'unavailable; coverage ends at final PTS',relativeEndSeconds:pts.at(-1)-pts[0]+lastFrameDuration};
  }
  await fs.mkdir(out); // Atomic exclusive creation protects against races and overwrite.
  const eventPath = path.join(out, 'events.jsonl');
  const started = new Date().toISOString();
  let stage = 'start', logQueue = Promise.resolve(), heartbeat;
  const event = (type, details = {}) => {
    logQueue = logQueue.then(() => fs.appendFile(eventPath, JSON.stringify({ time: new Date().toISOString(), type, stage, ...details }) + '\n', 'utf8'));
    return logQueue;
  };
  const commands = [];
  const run = async (name, args, log = false) => {
    stage = name;
    commands.push({ stage, executable: ffmpeg, args });
    return command(ffmpeg, ['-hide_banner', '-nostdin', '-nostats', '-n', ...args], log ? path.join(out, `${name}.log`) : undefined);
  };
  try {
    await event('start', { source, sourceHash, output: out });
    console.error(`Motion diagnostics started. Status and heartbeat: ${eventPath}`);
    heartbeat = setInterval(() => { event('heartbeat').catch(error => console.error(error.message)); }, 60000);
    await json(path.join(out, 'probe.json'), metadata);
    const filter = `setpts=PTS-STARTPTS,freezedetect=n=${o['threshold-db']}dB:d=${o['min-freeze']}`;
    const detected = await run('freeze', ['-i', source, '-map', `0:${video.index}`, '-an', '-vf', filter, '-f', 'null', '-'], true);
    const freezes = parseFreezes(detected.stderr, duration, { purposeAt: o['purpose-at'], reworkOver: o['rework-over'] });
    const overviewDir = path.join(out, 'overview');
    await fs.mkdir(overviewDir);
    const count = Math.min(o['overview-frames'], Math.max(1, Math.floor(duration * fps)));
    const last = Math.max(0, duration - Math.max(1 / fps, 0.05));
    const overview = [];
    for (let i = 0; i < count; i++) {
      const second = rounded(count === 1 ? 0 : i * last / (count - 1));
      const name = `frame-${String(i + 1).padStart(3, '0')}.jpg`;
      await run(`overview-${i + 1}`, ['-ss', String(second), '-i', source, '-map', `0:${video.index}`, '-an', '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3', path.join(overviewDir, name)]);
      if (!(await fs.stat(path.join(overviewDir, name))).size) throw new Error(`No overview frame at ${second}`);
      overview.push({ frame: i + 1, requestedSourceSecond: second, timestamp: timestamp(second), path: `overview/${name}` });
    }
    await run('overview-sheets', ['-framerate', '1', '-start_number', '1', '-i', path.join(overviewDir, 'frame-%03d.jpg'), '-vf', 'tile=4x4:padding=6:margin=6:color=white', '-frames:v', String(Math.ceil(count / 16)), '-q:v', '3', path.join(out, 'overview-page-%02d.jpg')]);
    const dense = [];
    for (const range of ranges) {
      const relative = `dense-${String(range.id).padStart(2, '0')}`, folder = path.join(out, relative);
      await fs.mkdir(folder);
      await run(relative, ['-ss', String(range.start), '-i', source, '-map', `0:${video.index}`, '-an', '-t', String(range.end - range.start), '-vf', `fps=${o['dense-fps']},scale=480:-2`, '-q:v', '3', path.join(folder, 'frame-%05d.jpg')]);
      const names = (await fs.readdir(folder)).filter(n => /^frame-\d+\.jpg$/.test(n)).sort();
      if (!names.length) throw new Error(`No frames extracted for range ${range.id}`);
      dense.push({ ...range, frames: names.map((name, i) => ({ frame: i + 1,
        requestedSourceSecond: rounded(range.start + i / o['dense-fps']), timestamp: timestamp(range.start + i / o['dense-fps']), path: `${relative}/${name}` })) });
    }
    const exact=[];
    if (exactPlan.length) {
      const folder=path.join(out,'audit-frames');await fs.mkdir(folder);
      for (const row of exactPlan) {
        const name=`frame-${String(row.sourceFrame).padStart(7,'0')}.png`;
        await run(`audit-frame-${row.sourceFrame}`,['-i',source,'-map',`0:${video.index}`,'-an','-vf',exactFrameFilter(row.sourceFrame),'-frames:v','1','-fps_mode','passthrough',path.join(folder,name)]);
        if (!(await fs.stat(path.join(folder,name))).size) throw new Error('Missing exact decoded frame '+row.sourceFrame);
        exact.push({...row,path:`audit-frames/${name}`,timestamp:timestamp(row.relativeSeconds),frame:row.sourceFrame});
      }
    }
    if (auditFile&&await sha256(auditFile)!==auditHash) throw new Error('Audit report changed during extraction');
    const finishStat = await fs.stat(source);
    if (finishStat.size !== sourceStat.size || finishStat.mtimeMs !== sourceStat.mtimeMs || await sha256(source) !== sourceHash) throw new Error('Source changed during diagnostics; rerun on a stable source');
    const nearStaticSeconds = rounded(freezes.reduce((n, f) => n + f.duration, 0));
    const summary = {
      schemaVersion: 1, status: 'analysis-complete', qualityAssessment: 'not-performed', started, finished: new Date().toISOString(),
      source: { path: source, sha256: sourceHash, bytes: sourceStat.size, videoStream: video.index, width: video.width, height: video.height,
        duration, fps, frameRate: video.avg_frame_rate, audioStreams: metadata.streams.filter(s => s.codec_type === 'audio').length },
      parameters: { minFreezeSeconds: o['min-freeze'], thresholdDb: o['threshold-db'], purposeReviewSeconds: o['purpose-at'], defaultReworkOverSeconds: o['rework-over'], ptsOrigin: 'video-first-frame', overviewFrames: count, denseFps: o['dense-fps'], ranges },
      tools: { ffmpeg: versions[0].stdout.split(/\r?\n/)[0], ffprobe: versions[1].stdout.split(/\r?\n/)[0] },
      freezes, totals: { nearStaticSeconds, nearStaticRatio: rounded(nearStaticSeconds / duration), longestSeconds: Math.max(0, ...freezes.map(f => f.duration)), purposeReviewCount: freezes.filter(f => f.duration >= o['purpose-at']).length, defaultReworkCount: freezes.filter(f => f.duration > o['rework-over']).length },
      evidence: { freezeLog: 'freeze.log', index: 'frame-index.json', overviewPages: Math.ceil(count / 16), denseFrameCount: dense.reduce((n, r) => n + r.frames.length, 0),auditFrameCount:exact.length,...(auditFile?{audit:{path:auditFile,sha256:auditHash,videoAssociation:'sha256-matched',sampling:'decoded-frame-index-and-best-effort-PTS'}}:{}) },
      limitations: ['近静止检测定位疑点，不等于逐像素静止。', `>=${o['purpose-at']}秒需说明阅读/理解用途；>${o['rework-over']}秒标为默认返修疑点。最终按项目DESIGN及必要阅读与实际观看证据判定，门槛可按项目配置。`, '检测不到有效运镜、因果表达或装饰性动作，低静止率也不是质量通过。', '画面须继续做删字、静音、合看及同类样片对标；技术成功不替代真实视听验收。', 'overview/dense图片时间是请求采样时间，不代表源文件精确逐帧PTS；exact审计帧按真实解码帧号抽取，列出实际PTS及原请求秒点。'],
    };
    await json(path.join(out, 'frame-index.json'), { overview, dense, exact, exactCoverage, samplingNote: summary.limitations.at(-1),exactSamplingNote:'exact[] uses source decoded frame index and actual best-effort PTS; production fps/time is only the requested location. Requests beyond decoded PTS plus measured final-frame duration are rejected; the exact EOF boundary maps to the last displayed frame.' });
    await json(path.join(out, 'summary.json'), summary);
    await fs.writeFile(path.join(out, 'summary.txt'), [
      '动态定位完成；未作质量通过判定。', `源文件：${source}`, `SHA256：${sourceHash}`,
      `时长：${duration}s；帧率：${fps}；${video.width}×${video.height}；音轨：${summary.source.audioStreams}`,
      `参数：minFreeze=${o['min-freeze']}s，threshold=${o['threshold-db']}dB，dense=${o['dense-fps']}fps`,
      `近静止总计 ${nearStaticSeconds}s；最长 ${summary.totals.longestSeconds}s；>${o['rework-over']}s 默认返修疑点 ${summary.totals.defaultReworkCount}处`,
      ...freezes.map(f => `${timestamp(f.start)}–${timestamp(f.end)} | ${f.duration}s | ${f.review}${f.closedAtEof ? ' | closed-at-video-EOF' : ''}`),
      ...summary.limitations, '',
    ].join('\n'), { encoding: 'utf8', flag: 'wx' });
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const html = frames => frames.map(f => `<figure><a href="${escape(f.path)}"><img src="${escape(f.path)}"></a><figcaption>#${f.frame} · ${f.timestamp}${f.sourcePtsSeconds!==undefined?`<br>源PTS ${f.sourcePtsSeconds}s；请求 ${escape(f.requestedTimes.join(', '))}s<br>${escape(f.objects.join(', '))} · ${escape(f.reasons.join(', '))}`:''}</figcaption></figure>`).join('\n');
    await fs.writeFile(path.join(out, 'frames.html'), `<!doctype html><meta charset="utf-8"><title>动态定位帧证据</title><style>body{font:16px sans-serif;background:#eee}section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}figure{margin:6px}img{width:100%}figcaption{padding:5px}</style><h1>帧证据：需结合原片审看</h1><p>${escape(summary.limitations.at(-1))}</p>${exact.length?`<h2>审计疑点：真实解码帧（从0计数）</h2><section>${html(exact)}</section>`:''}<h2>全片总览</h2><section>${html(overview)}</section>${dense.map(r => `<h2>${timestamp(r.start)}–${timestamp(r.end)}，${o['dense-fps']}fps</h2><section>${html(r.frames)}</section>`).join('\n')}`, { encoding: 'utf8', flag: 'wx' });
    await json(path.join(out, 'commands.json'), commands);
    clearInterval(heartbeat);
    await event('end', { result: 'analysis-complete', qualityAssessment: 'not-performed' });
    return { status: summary.status, output: out, summary: path.join(out, 'summary.json'), totals: summary.totals, qualityAssessment: summary.qualityAssessment };
  } catch (error) {
    clearInterval(heartbeat);
    await event('error', { message: error.message });
    await json(path.join(out, 'error.json'), { error: error.message, stage, source, sourceHash, commands });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = options(process.argv.slice(2));
    if (o.help) console.log(HELP);
    else console.log(JSON.stringify(await motionCheck(o), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: error.message }));
    process.exitCode = 1;
  }
}
