#!/usr/bin/env node
// MIT. Render and inspect the same source snapshot with the supplied existing runtime.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');

const arg = key => process.argv.find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// This root is the dedicated scene source folder. Generated render trees,
// tool dependencies and linked directories never become project source inputs.
function productionFiles(root, outputDir) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const file = path.join(directory, entry.name);
      if (file === outputDir) continue;
      if (entry.isSymbolicLink()) throw Error('Source links/junctions are unsupported; use a real source directory: ' + file);
      if (entry.isDirectory()) {
        if (!fs.existsSync(path.join(file, 'render-manifest.json'))) visit(file);
      } else if (entry.isFile() && /\.(?:cjs|mjs|jsx?|tsx?|css|json|svg|png|webp|jpe?g|woff2?|ttf|otf|glsl)$/i.test(entry.name)) {
        files.push(path.relative(root, file).split(path.sep).join('/'));
      }
    }
  }
  visit(root);
  return files.sort();
}

function motionChecker() {
  const skillRoot = arg('skill-root') || path.resolve(__dirname, '../../..');
  const file = path.resolve(skillRoot, 'scripts', 'motion-gates.mjs');
  if (!fs.existsSync(file)) throw Error('Motion checker missing. For a copied production project supply --skill-root=<table-video directory>.');
  return file;
}

async function main() {
  const runtimeDir = arg('runtime'), browserPath = arg('browser'), outArg = arg('out');
  if (!runtimeDir || !browserPath || !outArg) throw Error('Required: --runtime=<existing node_modules> --browser=<existing executable> --out=<NEW directory>');
  const runtime = path.resolve(runtimeDir), browserExecutable = path.resolve(browserPath);
  for (const file of [path.join(runtime, '@remotion/bundler/package.json'), path.join(runtime, '@remotion/renderer/package.json'), browserExecutable]) {
    if (!fs.existsSync(file)) throw Error('Missing existing dependency: ' + file);
  }
  const videoRequested = process.argv.includes('--video');
  const checker = videoRequested ? motionChecker() : null;
  const inputFile = arg('input') ? path.resolve(arg('input')) : null;
  const inputBytes = inputFile ? fs.readFileSync(inputFile) : null;
  const input = inputBytes ? JSON.parse(inputBytes.toString('utf8').replace(/^\uFEFF/, '')) : {};
  const omitIds = (arg('omit') || '').split(',').filter(Boolean);
  const audio = arg('audio') ? path.resolve(arg('audio')) : null;
  if (audio && !fs.statSync(audio).isFile()) throw Error('Audio must be an existing adopted local file');

  const out = path.resolve(outArg);
  if (fs.existsSync(out)) throw Error('Output exists. Use a new version directory to preserve the first render: ' + out);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.mkdirSync(out);
  const pub = path.join(out, 'public'), sourceDir = path.join(out, 'source');
  fs.mkdirSync(pub);
  fs.mkdirSync(sourceDir);
  const logFile = path.join(out, 'render.log');
  function log(message) {
    fs.appendFileSync(logFile, new Date().toISOString() + ' ' + message + '\n', 'utf8');
    console.log(message);
  }
  let browser, last = 'snapshot';
  const heartbeat = setInterval(() => log('HEARTBEAT ' + last), 30000);
  try {
    log('START production-core; visual acceptance remains unassessed');
    const sources = productionFiles(__dirname, out).map(name => {
      const bytes = fs.readFileSync(path.join(__dirname, name));
      fs.mkdirSync(path.dirname(path.join(sourceDir, name)), {recursive:true});
      fs.writeFileSync(path.join(sourceDir, name), bytes);
      return {name, sha256: hash(bytes)};
    });
    const {createScene} = require(path.join(sourceDir, 'scene.cjs'));
    const scene = createScene(input);
    const {duration, fps} = scene.config;
    const lastFrame = Math.ceil(duration * fps) - 1;
    const checkpoints = (scene.timeline?.checkpoints ?? []).map(({time}) => Math.min(lastFrame, Math.round(time * fps)));
    const frames = arg('frames') ? arg('frames').split(',').map(Number) : [...new Set([0, ...checkpoints, lastFrame])];
    if (frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame > lastFrame)) throw Error('Frame outside this composition; check --frames against its fps and duration.');

    const audioFile = audio ? 'adopted-audio' + path.extname(audio) : null;
    if (audio) fs.copyFileSync(audio, path.join(pub, audioFile));
    const manifestFile = path.join(out, 'render-manifest.json');
    const manifest = {
      schemaVersion: 1, created: new Date().toISOString(), projectSourceDir: __dirname, sources,
      inputFile, inputSha256: inputBytes ? hash(inputBytes) : null, input, config: scene.config, omitIds,
      audio: audio ? {path: audio, sha256: hash(fs.readFileSync(path.join(pub, audioFile)))} : null,
      quality: 'not-assessed', visibility: 'unknown; perspective coordinates alone do not certify pixels',
    };
    const saveManifest = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    saveManifest();

    last = 'bundle';
    const {bundle} = require(path.join(runtime, '@remotion/bundler'));
    const {openBrowser, selectComposition, renderStill, renderMedia} = require(path.join(runtime, '@remotion/renderer'));
    const serveUrl = await bundle({
      entryPoint: path.join(sourceDir, 'entry.jsx'), rootDir: sourceDir, outDir: path.join(out, 'bundle'), publicDir: pub, enableCaching: false,
      webpackOverride: config => ({...config, cache: false, resolve: {...config.resolve, modules: [runtime, ...(config.resolve.modules || [])]}}),
    });
    browser = await openBrowser('chrome', {browserExecutable, logLevel: 'error'});
    const opts = {serveUrl, browserExecutable, puppeteerInstance: browser, logLevel: 'error'};
    const inputProps = {sceneInput: input, omitIds, audioFile};
    const composition = await selectComposition({...opts, id: 'ProductionScene', inputProps});
    for (const frame of frames) {
      last = 'frame ' + frame;
      await renderStill({...opts, composition, inputProps, frame, imageFormat: 'png', output: path.join(out, 'f' + String(frame).padStart(4, '0') + '.png')});
      log('FRAME ' + frame);
    }
    if (!videoRequested) {
      log('END; requested stills rendered');
      return 0;
    }
    last = 'video';
    let lastBucket = -1;
    const video = path.join(out, 'preview.mp4');
    await renderMedia({
      ...opts, composition, inputProps, codec: 'h264', crf: 18, imageFormat: 'jpeg', jpegQuality: 94, concurrency: 2, outputLocation: video,
      onProgress: ({progress}) => {
        last = 'video ' + Math.floor(progress * 100) + '%';
        const bucket = Math.floor(progress * 10);
        if (bucket > lastBucket) { lastBucket = bucket; log(last); }
      },
    });
    manifest.video = {name: path.basename(video), sha256: hash(fs.readFileSync(video))};
    saveManifest();
    last = 'motion audit';
    log('AUDIT encoded video and render snapshot');
    const {main: checkMotion} = await import(pathToFileURL(checker).href);
    const report = path.join(out, 'motion-report.json');
    const pendingReport = path.join(out, '.motion-report.pending.json');
    let status = await checkMotion(['--adapter', path.join(sourceDir, 'audit-adapter.cjs'), '--render-manifest', manifestFile, '--video', video, '--out', pendingReport]);
    const measured = JSON.parse(fs.readFileSync(pendingReport, 'utf8'));
    if (measured.locks?.renderManifest?.sha256 === hash(fs.readFileSync(manifestFile)) && measured.locks.video?.sha256 === manifest.video.sha256) {
      last = 'review frames';
      try {
        const pixelTool = path.join(path.dirname(checker), 'motion-check.mjs');
        const {extractReviewFrames} = await import(pathToFileURL(pixelTool).href);
        measured.reviewFrames = await extractReviewFrames({input:video, out:path.join(out,'review-frames'), report:measured});
      } catch (error) {
        measured.reviewFrames = {status:'incomplete', reason:error.message};
        if (status === 0) { status = 1; measured.status = '测量不完整'; }
        log('REVIEW FRAMES incomplete: ' + error.message);
      }
    } else {
      measured.reviewFrames = {status:'incomplete', reason:'No matching render-manifest and video locks; decode evidence withheld.'};
      status = 1;
      measured.status = '测量不完整';
    }
    measured.exitCode = status;
    fs.writeFileSync(pendingReport, JSON.stringify(measured, null, 2) + '\n');
    fs.renameSync(pendingReport, report);
    log('END; engineering check exit ' + status + '; report ' + report + '; 1x viewing remains unassessed');
    return status;
  } catch (error) {
    log('ERROR ' + error.stack);
    throw error;
  } finally {
    clearInterval(heartbeat);
    if (browser) await browser.close({silent: true});
  }
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {main, productionFiles};
