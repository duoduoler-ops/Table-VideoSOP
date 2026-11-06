import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {proveWavGain} from './gain-proof.mjs';
import {withProjectLock, commitFiles, recoverFiles, readState, CONTROL} from './storage.mjs';
import {WorkflowError, requireValue as need, text, id, validateState, validateRequest, SLOTS, KINDS, ACTIONS, RESULTS, METHODS} from './schema.mjs';

const FENCE = String.fromCharCode(96).repeat(3);
const QA_START = '<!-- table-video-qa:start -->';
const QA_END = '<!-- table-video-qa:end -->';
const timestamp = () => new Date().toISOString();
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const dataHash = value => digest(canonical(value));
const own = (object, key) => Object.hasOwn(object, key);
const visualLayers = state => [...new Set(state.choices.allowedVisualLayers)].sort();
const EFFECT_CHECKS = ['visual-design', 'motion'];
const EFFECT_ASPECTS = new Set(['visual', ...EFFECT_CHECKS, 'design', 'dynamic', 'static']);
const usesMG = state => state.choices.allowedVisualLayers.includes('mg');

function upstreamObjects(view, scope) {
  const result = new Set([scope]);
  for (const objectId of result) for (const parent of view.artifacts[objectId]?.dependencyIds || []) result.add(parent);
  return result;
}

// These checks bind review evidence to the current artifact version. They do not
// infer visual quality from an aspect name or replace actual viewing.
function effectCheck(view, objectId, aspect) {
  const passing = (id, needsReport = false) => view.qa.some(q => q.objectId === id && q.aspect === aspect && q.current &&
    q.result === '通过' && ['inspection', 'human-view'].includes(q.method) && (!needsReport || q.motionProof));
  if (!passing(objectId)) return false;
  if (aspect !== 'motion') return true;
  const plan = motionReviewPlan(view, objectId);
  return !plan.blocker && plan.targets.every(target => passing(target, true));
}
// Existing projects and ordinary footage keep their original review method.
// New video registrations classify ambiguous mixed-route media at the point of use.
function motionReviewPlan(view, objectId) {
  const {state} = view;
  const artifact = state.artifacts[objectId];
  const ancestors = [...explicitAncestors(state,objectId)].filter(id => id !== objectId);
  const role = id => {
    const mode = state.artifacts[id]?.motionRole;
    if (mode !== 'auto') return mode;
    return visualLayers(state).length === 1 && usesMG(state) ? 'render' : null;
  };
  const sources = ancestors.filter(id => role(id) === 'render');
  if (artifact?.motionRole === 'render') return {targets:[objectId,...sources]};
  if (sources.length) return {targets:sources};
  if (artifact?.motionRole === 'assembly') return {targets:[],blocker:'总装须用 dependency 关联实际采用的 MG 分段'};
  if (artifact?.motionRole === 'auto' && usesMG(state)) {
    if (role(objectId) === 'render') return {targets:[objectId]};
    return {targets:[],blocker:'混合路线需要标明本候选的 motionRole（render、assembly 或 footage）'};
  }
  return {targets:[]};
}
function effectFailures(view, scope) {
  if (!scope) return [];
  const applicable = new Set([scope]);
  const {state} = view;
  for (const slot of ['design', 'storyboard', 'visualOverview']) {
    if (view.adopted[slot]?.current) applicable.add(view.adopted[slot].objectId);
  }
  if (state.adopted.finalVideo?.objectId === scope) {
    for (const segment of state.segments) applicable.add(segment.objectId);
  }
  for (const objectId of applicable) {
    for (const dep of state.dependencies) if (dep.to === objectId) applicable.add(dep.from);
  }
  return view.qa.filter(q => applicable.has(q.objectId) && (q.current || q.unresolvedFailure) &&
    EFFECT_ASPECTS.has(q.aspect) && q.result === '未通过');
}
function visualRouteLabel(state) {
  const names = {mg:'MG',generated:'生视频（手动生成）',screen:'录屏'};
  return ['mg','generated','screen'].filter(layer => state.choices.allowedVisualLayers.includes(layer)).map(layer => names[layer]).join('＋') || '待选择';
}
function safeId(value, label) {
  id(value, label); need(!['constructor', 'prototype', '__proto__'].includes(value), 'INVALID_ID', 'Reserved identifier'); return value;
}
export async function projectFile(root, value, {mustExist = true} = {}) {
  text(value, 'path');
  const base = path.resolve(root), target = path.resolve(base, value), relative = path.relative(base, target);
  need(relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative), 'PATH_ESCAPE', 'File must stay inside the project');
  const baseReal = await fs.realpath(base);
  let cursor = target;
  while (true) {
    try {
      const real = await fs.realpath(cursor);
      const r = path.relative(baseReal, real);
      need(!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r), 'PATH_ESCAPE', 'Symlink or junction escapes the project');
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (mustExist || cursor === base) throw new WorkflowError('MISSING_FILE', 'Missing project file: ' + relative);
      cursor = path.dirname(cursor);
    }
  }
  return {absolute: target, relative: relative.split(path.sep).join('/')};
}
function pointer(document, selector) {
  if (selector === '') return document;
  need(typeof selector === 'string' && selector.startsWith('/'), 'SELECTOR', 'selector must be a JSON Pointer');
  let value = document;
  for (const encoded of selector.slice(1).split('/')) {
    need(!/~(?![01])/u.test(encoded), 'SELECTOR', 'Invalid JSON Pointer escape');
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    need(value !== null && typeof value === 'object' && own(value, key), 'SELECTOR', 'Missing scope key: ' + key);
    value = value[key];
  }
  return value;
}
function markdownSection(raw, selector) {
  const sectionId = selector.slice(3); safeId(sectionId,'Markdown section ID');
  const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const name = new RegExp('^' + escaped + '(?:\\s|[｜|：:]|$)');
  const headings = []; let offset = 0, fence = null;
  for (const line of raw.split(/(?<=\n)/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0]===fence[0] && marker[1].length>=fence.length &&
        /^[ \t]*(?:\r?\n)?$/.test(line.slice(marker[0].length))) fence = null;
    } else if (!fence) {
      const h = line.match(/^ {0,3}(#{1,6})[ \t]+([^\r\n]+)/);
      if (h) headings.push({offset,level:h[1].length,matches:name.test(h[2])});
    }
    offset += line.length;
  }
  const matches = headings.filter(h=>h.matches);
  need(matches.length===1,'SELECTOR', 'Markdown section ID must occur exactly once outside code fences: ' + sectionId);
  const start = matches[0], end = headings.find(h=>h.offset>start.offset && h.level<=start.level);
  return raw.slice(start.offset,end?.offset ?? raw.length);
}
async function content(root, artifact) {
  const file = await projectFile(root, artifact.path);
  const stat = await fs.stat(file.absolute);
  need(stat.isFile(), 'NOT_FILE', 'Artifact must be a regular file');
  const bytes = await fs.readFile(file.absolute);
  const fileHash = digest(bytes);
  let contentHash = fileHash;
  if (artifact.selector !== undefined) {
    let json;
    try {
      const raw = bytes.toString('utf8').replace(/^\uFEFF/, '');
      if (artifact.selector.startsWith('md:')) {
        need(/\.md$/i.test(file.absolute),'SELECTOR','md: selectors require a Markdown file');
        return {fileHash,contentHash:digest(markdownSection(raw,artifact.selector))};
      }
      if (/\.json$/i.test(file.absolute)) json = JSON.parse(raw);
      else {
        const pattern = new RegExp('^' + FENCE + 'table-video-json\\s*\\r?\\n([\\s\\S]*?)^' + FENCE + '\\s*$', 'gm');
        const blocks = [...raw.matchAll(pattern)];
        need(blocks.length === 1, 'SELECTOR', 'Scoped Markdown needs exactly one table-video-json block');
        json = JSON.parse(blocks[0][1]);
      }
    } catch (e) { throw new WorkflowError('SELECTOR', 'Cannot parse scoped content: ' + e.message); }
    contentHash = dataHash(pointer(json, artifact.selector));
  }
  return {fileHash, contentHash};
}
async function evaluate(root, state) {
  const cache = {}, active = new Set();
  async function visit(objectId) {
    if (own(cache, objectId)) return cache[objectId];
    const artifact = state.artifacts[objectId];
    need(own(state.artifacts, objectId), 'UNKNOWN_OBJECT', 'Unknown object: ' + objectId);
    need(!active.has(objectId), 'DEPENDENCY_CYCLE', 'Dependency cycle at ' + objectId);
    active.add(objectId);
    try {
      const actual = await content(root, artifact);
      const upstream = [];
      for (const dep of state.dependencies.filter(d => d.to === objectId).sort((a, b) => a.from.localeCompare(b.from))) {
        const parent = await visit(dep.from);
        upstream.push({id: dep.from, actualId:dep.from, hash: parent.effectiveHash, validity: parent.validity});
      }
      const context = {};
      if (artifact.motionRole) context.motionRole = artifact.motionRole;
      if (artifact.motionEdition) context.motionEdition = artifact.motionEdition;
      if (['design','storyboard','static','pilot','video'].includes(artifact.kind)) context.output = state.choices.output;
      const segmentRoutes = state.segments.filter(segment => segment.objectId === objectId)
        .map(segment => ({id:segment.id,route:segment.route})).sort((a,b) => a.id.localeCompare(b.id));
      if (segmentRoutes.length) context.segmentRoutes = segmentRoutes;
      if (segmentRoutes.length || ['storyboard','static','pilot','video'].includes(artifact.kind)) context.allowedVisualLayers = visualLayers(state);
      if (artifact.kind === 'video') {
        context.soundPolicy = state.choices.soundPolicy;
        context.subtitlePolicy = state.choices.subtitlePolicy;
      }
      if (['storyboard','static','pilot','video'].includes(artifact.kind)) {
        context.adopted = {};
        for (const slot of ['script','narration','design']) {
          const adoptedId = state.adopted[slot]?.objectId;
          if (!adoptedId || adoptedId === objectId) { context.adopted[slot] = null; continue; }
          // Explicit scope dependencies preserve a confirmed unaffected segment.
          const scoped = upstream.some(p => state.artifacts[p.id]?.kind === slot && state.artifacts[p.id].selector !== undefined && state.artifacts[p.id].path === state.artifacts[adoptedId]?.path);
          if (scoped) context.adopted[slot] = {id:adoptedId,scope:'explicit-dependency'};
          else {
            const adoptedInput = await visit(adoptedId);
            context.adopted[slot] = {id:adoptedId,hash:adoptedInput.effectiveHash};
            upstream.push({id:'adopted:'+slot,actualId:adoptedId,hash:adoptedInput.effectiveHash,validity:adoptedInput.validity});
          }
        }
      }
      const validity = actual.contentHash === artifact.contentHash && upstream.every(p => p.validity === 'current') ? 'current' : 'stale';
      const dependencyIds = [...new Set(upstream.map(p=>p.actualId))];
      cache[objectId] = {...actual, effectiveHash: dataHash({kind: artifact.kind, risk: !!artifact.risk, content: actual.contentHash, context, upstream: upstream.map(p => ({id: p.id, hash: p.hash}))}), validity,dependencyIds};
    } catch (e) {
      if (e.code === 'DEPENDENCY_CYCLE') throw e;
      cache[objectId] = {fileHash: null, contentHash: null, effectiveHash: null, validity: e.code === 'MISSING_FILE' ? 'missing' : 'stale', error: e.message};
    } finally { active.delete(objectId); }
    return cache[objectId];
  }
  for (const objectId of Object.keys(state.artifacts)) await visit(objectId);
  return cache;
}
async function captureEvidence(root, state, input, {allowAgent = false} = {}) {
  need(input && typeof input === 'object', 'EVIDENCE_REQUIRED', 'Evidence is required');
  text(input.quote, 'evidence.quote');
  need(['user', 'test'].includes(input.actor) || (allowAgent && input.actor === 'agent'), 'EVIDENCE_ACTOR', 'Evidence actor must be user or test; agent is allowed only for inspection/technical QA');
  need(input.actor !== 'test' || (state.testOnly && input.testOnly === true), 'TEST_EVIDENCE', 'Test evidence is only allowed in a testOnly project');
  need(state.testOnly || input.testOnly !== true, 'TEST_EVIDENCE', 'Test evidence cannot enter a real project');
  const file = await projectFile(root, input.path);
  const bytes = await fs.readFile(file.absolute);
  need(bytes.toString('utf8').includes(input.quote), 'EVIDENCE_QUOTE', 'Evidence quote is absent from the referenced file');
  return {path: file.relative, quote: input.quote, actor: input.actor, testOnly: input.testOnly === true, hash: digest(bytes), capturedAt: timestamp()};
}
async function evidenceCurrent(root, evidence) {
  try { const f = await projectFile(root, evidence.path); return digest(await fs.readFile(f.absolute)) === evidence.hash; }
  catch { return false; }
}
function reviewKindMatches(state, review) {
  return !(review.aspect === 'storyboard' || review.allows.includes('design')) ||
    state.artifacts[review.objectId]?.kind === 'storyboard';
}
// Stored legacy superseded flags were aspect-wide. Derive the latest result
// independently per method without rewriting old projects during a read.
function qaMethodView(records) {
  const key = r => JSON.stringify([r.objectId,r.aspect,r.method]);
  const latest = new Map(records.map((r,i)=>[key(r),i]));
  return records.map((r,i)=>({...r,superseded:r.result==='未通过'?false:latest.get(key(r))!==i}));
}
async function inheritedEvidenceCurrent(root,state,artifacts,record) {
  for(let p=record.inheritedFrom;p;p=p.previous) if(p.proof) {
    if(p.approvalId && state.approvals.find(a=>a.id===p.approvalId)?.revoked)return false;
    if(artifacts[p.fromNarration]?.fileHash!==p.proof.beforeHash || artifacts[p.toNarration]?.fileHash!==p.proof.afterHash ||
      !(await evidenceCurrent(root,p.evidence)))return false;
  }
  return true;
}
async function qaBindingCurrent(root,state,artifacts,record) {
  const actual=artifacts[record.objectId];
  if (actual?.validity !== 'current' || actual.effectiveHash !== record.effectiveHash ||
      !(await evidenceCurrent(root,record.evidence)) || !(await inheritedEvidenceCurrent(root,state,artifacts,record))) return false;
  for (const file of record.motionProof?.files || []) if (!(await evidenceCurrent(root,file))) return false;
  for (const note of record.motionProof?.rechecks || []) if (!(await evidenceCurrent(root,note.evidence))) return false;
  return true;
}

// Only exhibit files inside the project are read. Keep relative bindings so an
// already-reviewed project can be moved without trusting paths embedded in a report.
async function captureMotionProof(root, state, artifact, actual, payload) {
  const relative = payload.motionReport ?? path.join(path.dirname(artifact.path),'motion-report.json');
  const reportFile = await projectFile(root,relative,{mustExist:false});
  let bytes;
  try { bytes = await fs.readFile(reportFile.absolute); }
  catch (err) { if (err.code !== 'ENOENT') throw err; throw new WorkflowError('MOTION_REPORT','缺少当前候选的运动检查报告：'+reportFile.relative); }
  let report;
  try { report = JSON.parse(bytes); } catch { throw new WorkflowError('MOTION_REPORT','运动检查报告 JSON 无效'); }
  need(report?.reportVersion >= 2 && [0,1,2].includes(report.exitCode) && Array.isArray(report.gates) &&
    report.gates.length && report.visualAcceptance === 'not-assessed' && report.locks?.sources?.length &&
    report.locks.video?.sha256 === actual.fileHash,'MOTION_REPORT','运动报告缺少正式检查数据或与当前视频不匹配');
  const candidate = await projectFile(root,artifact.path);
  need(typeof report.locks.video.path === 'string' && path.relative(await fs.realpath(candidate.absolute),path.resolve(root,report.locks.video.path)) === '',
    'MOTION_REPORT','报告绑定的是另一个视频路径；请用当前候选重新检查');
  need(!report.gates.some(g => g.judgment === 'hard-gate' && g.status === '未通过'),'MOTION_HARD_FAILURE','当前成片有已证实的运动约束失败，修复并重新出交审预览');
  const findings = report.engineeringAudit?.findings || [];
  need(!findings.some(f => ['hard-failure','constraint-violation'].includes(f.severity)),'MOTION_HARD_FAILURE','生产状态违反已声明的工程约束，核实声明、修正并重新出交审预览');
  const files = new Map([[reportFile.relative,{path:reportFile.relative,hash:digest(bytes)}]]);
  async function bind(file, expected) {
    const f = await projectFile(root,file);
    const data = await fs.readFile(f.absolute);
    need(digest(data) === expected,'MOTION_STALE','运动检查引用已变更：'+f.relative);
    files.set(f.relative,{path:f.relative,hash:expected});
    return data;
  }
  for (const source of report.locks.sources) await bind(source.path,source.sha256);
  if (report.locks.renderManifest) {
    // Prefer the candidate's manifest, even if an old report refers to a still
    // valid manifest in another version directory.
    const manifestPath = path.join(path.dirname(artifact.path),'render-manifest.json');
    const manifest = JSON.parse(await bind(manifestPath,report.locks.renderManifest.sha256));
    need(manifest.video?.sha256 === actual.fileHash && typeof manifest.projectSourceDir === 'string' &&
      Array.isArray(manifest.sources) && manifest.sources.length,'MOTION_REPORT','渲染清单未绑定当前工程和成片');
    for (const source of manifest.sources) await bind(path.join(manifest.projectSourceDir,source.name),source.sha256);
    if (manifest.inputFile) await bind(manifest.inputFile,manifest.inputSha256);
  } else {
    // A public-core candidate cannot be downgraded to a legacy/custom report.
    const local = await projectFile(root,path.join(path.dirname(artifact.path),'render-manifest.json'),{mustExist:false});
    try {
      const manifest = JSON.parse(await fs.readFile(local.absolute,'utf8'));
      need(!(manifest.projectSourceDir && manifest.video?.name === path.basename(artifact.path)),'MOTION_REPORT','公共工程的报告须绑定本版本的渲染清单');
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  const outstanding = new Set([
    ...report.gates.filter(g => !['通过','诊断','不适用'].includes(g.status)).map(g => 'gate:'+g.id),
    ...(report.engineeringAudit?.coverageGaps || []).map((_,i) => 'gap:'+i),
    ...findings.map((_,i) => 'finding:'+i),
  ]);
  const rechecks = [];
  if (report.exitCode !== 0 && !outstanding.size) outstanding.add('report');
  if (outstanding.size) {
    const notes = payload.motionRecheck;
    need(Array.isArray(notes) && notes.length,'MOTION_RECHECK','须按当前报告补查：'+[...outstanding].join(', '));
    const duration = report.engineeringAudit?.sampling?.duration;
    for (const note of notes) {
      need(Array.isArray(note?.items) && note.items.length && note.items.every(key => outstanding.has(key)) &&
        Number.isFinite(note.start) && Number.isFinite(note.end) && note.start >= 0 && note.end >= note.start &&
        (!Number.isFinite(duration) || note.end <= duration + 1e-6),'MOTION_RECHECK','补查须标记报告项和成片内的真实区间');
      const evidence = await captureEvidence(root,state,note.evidence,{allowAgent:true});
      const noteFile = await projectFile(root,evidence.path);
      const noteBytes = await fs.readFile(noteFile.absolute);
      need(evidence.path !== reportFile.relative && digest(noteBytes) === evidence.hash && noteBytes.includes(actual.fileHash) &&
        note.items.every(key => evidence.quote.includes(key)),'MOTION_RECHECK','补查证据须独立记当前成片 SHA-256，引用原文须包含所核报告项及观察');
      for (const key of note.items) outstanding.delete(key);
      rechecks.push({items:note.items,start:note.start,end:note.end,evidence});
    }
    need(!outstanding.size,'MOTION_RECHECK','尚缺对应时段的实查：'+[...outstanding].join(', '));
  }
  return {files:[...files.values()],...(rechecks.length?{rechecks}:{})};
}
function qaMarkdown(records, revision) {
  const rows = qaMethodView(records).filter(r => !r.superseded).map(r => '| ' + [r.checkId, r.objectId, r.aspect, r.result, r.method, r.reason || ''].map(v => String(v).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')).join(' | ') + ' |');
  return '# QA 状态表\n\n唯一结论源为下面的 JSON 记录区；表格按方法显示登记结果，保留失败历史，不能单凭此表认定缺陷仍存在或已经解决。当前有效性与解决链以 workflow status 的实际文件/证据核对为准。用户确认仅引用 state 中的 approvalId。\n\n' +
    QA_START + '\n' + FENCE + 'json\n' + JSON.stringify({schemaVersion: '1.0', generatedFromRevision: revision, records}, null, 2) + '\n' + FENCE + '\n' + QA_END +
    '\n\n| 检查 ID | 对象 | 方面 | 结果 | 方法 | 原因 |\n| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n';
}
async function readQA(root, state) {
  const file = await projectFile(root, state.qaPath);
  const raw = await fs.readFile(file.absolute, 'utf8');
  need(raw.split(QA_START).length === 2 && raw.split(QA_END).length === 2, 'QA_FORMAT', 'QA requires exactly one structured record block');
  const inside = raw.split(QA_START)[1].split(QA_END)[0].trim();
  need(inside.startsWith(FENCE + 'json\n') && inside.endsWith(FENCE), 'QA_FORMAT', 'QA JSON fence invalid');
  const data = JSON.parse(inside.slice((FENCE + 'json\n').length, -FENCE.length));
  need(data.schemaVersion === '1.0' && Array.isArray(data.records), 'QA_FORMAT', 'QA record schema invalid');
  need(data.generatedFromRevision===state.revision,'STATE_QA_CONFLICT','State and QA revisions differ; re-read after the writer finishes, or inspect recovery');
  for (const r of data.records) {
    need(RESULTS.includes(r.result) && METHODS.includes(r.method) && r.effectiveHash && r.evidence?.hash, 'QA_FORMAT', 'Incomplete QA record');
  }
  return data.records;
}
function planMarkdown(state) {
  const rows = state.segments.map(s => {
    const a=state.artifacts[s.objectId];
    const target=a?'../'+a.path.split('/').map(encodeURIComponent).join('/'):null;
    const reference=target?'['+s.objectId+']('+target+')'+(a.selector?' · '+a.selector:''):s.objectId;
    return '| ' + [s.id, s.narrative, s.anchors, s.route, reference, s.progress || '待制作'].map(v => String(v).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')).join(' | ') + ' |';
  });
  return '# 制作大段表\n\n自动生成视图，不独立维护采用；generatedFromRevision: ' + state.revision +
    '\n\n当前阶段：' + state.currentStage + '\n\n允许画面形式：' + visualRouteLabel(state) + '\n\n采用引用：\n' +
    Object.entries(state.adopted).map(([k, v]) => '- ' + k + ': ' + (v ? v.objectId : '待定')).join('\n') +
    '\n\n| ID | 叙事任务 | 配音锚点 | 路线 | 对象 ID | 制作进度 |\n| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n\n检查结论见 ' + state.qaPath + '；恢复时重新核对有效摘要。\n';
}
// Scope-aware consent is a derived read-time fact, never a new stored approval.
const approvalBindings = new WeakMap();
async function inspect(root, state, records) {
  const artifacts = await evaluate(root, state);
  const inheritanceCurrent = record => inheritedEvidenceCurrent(root,state,artifacts,record);
  const approvals = [], bindings = new Map();
  for (const approval of state.approvals) {
    const actual = artifacts[approval.objectId];
    const binding = !approval.revoked && reviewKindMatches(state, approval) && ['approved', 'delegated'].includes(approval.decision) &&
      actual?.validity === 'current' && approval.effectiveHash === actual.effectiveHash &&
      await evidenceCurrent(root, approval.evidence) && await inheritanceCurrent(approval);
    bindings.set(approval.id,binding);
    const current = binding && (!approval.coverage || approval.coverage.every(c=>
      artifacts[c.objectId]?.validity==='current' && artifacts[c.objectId].effectiveHash===c.effectiveHash));
    approvals.push({...approval, current});
  }
  const adopted = {};
  for (const slot of SLOTS) {
    const a = state.adopted[slot];
    if (!a) { adopted[slot] = null; continue; }
    const approval = approvals.find(r => r.id === a.approvalId);
    adopted[slot] = {...a, current: !!approval?.current && artifacts[a.objectId]?.effectiveHash === a.effectiveHash};
  }
  const qa = [], validQa = new Map();
  for (const record of qaMethodView(records)) {
    const binding = await qaBindingCurrent(root,state,artifacts,record);
    validQa.set(record.checkId,binding);
    qa.push({...record,current:!record.superseded && binding});
  }
  // Component source/report changes also invalidate the assembly's motion
  // conclusion when its muxed media and the written assembly note are intact.
  for (const record of qa) if (record.aspect === 'motion' && record.result === '通过') {
    const plan = motionReviewPlan({state},record.objectId);
    const sourcesCurrent = !plan.blocker && plan.targets.every(target => target === record.objectId ? !!record.motionProof :
      qa.some(q => q.objectId === target && q.aspect === 'motion' && q.result === '通过' && q.current && q.motionProof));
    if (!sourcesCurrent) { record.current = false; validQa.set(record.checkId,false); }
  }
  // Resolution is an evidence-backed fact, not the latest method status.
  // A later pending check cannot reopen a repaired defect; invalid evidence can.
  for (const q of qa) if (q.result === '未通过') {
    const a = artifacts[q.objectId];
    const resolved = qa.some(r => r.checkId === q.resolvedBy && validQa.get(r.checkId) && r.result === '通过' &&
      r.objectId === q.objectId && r.aspect === q.aspect);
    if (resolved) q.current = false;
    q.unresolvedFailure = !resolved && a?.validity === 'current' && a.effectiveHash === q.effectiveHash;
  }
  const blockers = [];
  for (const [slot, adoptedItem] of Object.entries(adopted)) if (adoptedItem && !adoptedItem.current) blockers.push('采用失效：' + slot);
  const waitingReviews = state.pendingReviews.filter(r => r.status === 'pending').map(r => ({...r, current: reviewKindMatches(state, r) && artifacts[r.objectId]?.effectiveHash === r.effectiveHash && artifacts[r.objectId]?.validity === 'current'}));
  const missing = [];
  for (const choice of ['narrationSource', 'output']) if (!state.choices[choice]) missing.push('输入选择：' + choice);
  if (!state.choices.allowedVisualLayers.length) missing.push('输入选择：allowedVisualLayers（画面路线待选择）');
  if (!adopted.script?.current) missing.push('有效采用稿件');
  if (!adopted.narration?.current) missing.push('有效采用配音与核对材料');
  if (['S04','S05','S06','S07','S08','S09','S10'].includes(state.currentStage) && !adopted.design?.current) missing.push('有效采用 DESIGN');
  const next = {stage: state.currentStage, missing, waitingReviews, note: '只暂停依赖缺项的工作；精确对点须另核对实际音频锚点。'};
  if (state.currentStage === 'S03') {
    // Reuse the evaluated evidence; choosing a source or a character is not a full-frame reference.
    const referenceApproval = aspect => approvals.some(a => a.current && a.aspect === aspect && a.allows.includes('pilot') &&
      ['config','static','asset'].includes(state.artifacts[a.objectId]?.kind));
    const existingStatic = approvals.some(a => a.current && a.aspect === 'static' && state.artifacts[a.objectId]?.kind === 'static' &&
      a.allows.some(action => ['pilot','animate'].includes(action)));
    let guidance;
    if (adopted.design?.current || existingStatic || referenceApproval('style-reference')) {
      guidance = 'S03 已有有效参考或完整静态依据；复用已确认范围，补齐尚缺的完整静态确认后记录 DESIGN，直接进入制作分段。运动按经验设定，在实际制作片段中检查；只有具体风险或用户主动要求才做局部小样。';
    } else if (referenceApproval('self-drawn-exploration')) {
      guidance = 'S03 仅已获用户明确授权自绘探索；可做静态风格测试，确认后记录 DESIGN 并进入制作分段，不另设默认动态测试。';
    } else {
      missing.push('S03 完整画面参考与借鉴范围确认，或用户明确授权自绘探索');
      guidance = 'S03 先获取并确认完整画面参考及借鉴范围，或由用户明确选择自绘探索；仅选择参考来源、角色身份或局部图形试样不能替代。';
    }
    next.note = guidance + next.note;
  }
  const riskValidations = [];
  for(const proof of state.riskValidations || [])riskValidations.push({...proof,proofCurrent:await inheritanceCurrent(proof)});
  const view = {state, artifacts, approvals, adopted, qa, blockers, next,riskValidations};
  approvalBindings.set(view,bindings);
  next.adopted = adopted;
  next.blockers = [...blockers];
  next.invalidatedObjects = Object.entries(artifacts).filter(([objectId,a]) => a.validity!=='current' && state.artifacts[objectId].status!=='superseded').map(([objectId,a])=>({objectId,validity:a.validity,error:a.error || null}));
  if (state.adopted.finalVideo) {
    next.finalCheck = checkAction(view,'final',state.adopted.finalVideo.objectId);
    if (!next.finalCheck.ok) next.blockers.push(...next.finalCheck.blockers);
  }
  view.delivery = {recordedStatus:state.deliveryStatus,currentStatus:state.deliveryStatus};
  if (state.deliveryStatus === 'accepted' && !checkAction(view,'final',state.adopted.finalVideo?.objectId).ok) view.delivery.currentStatus = 'awaiting_review';
  if (state.deliveryStatus === 'delivered_with_limits' && (!adopted.finalVideo?.current ||
    effectFailures(view,state.adopted.finalVideo?.objectId).length ||
    !(await evidenceCurrent(root,state.deliveryEvidence || {})))) view.delivery.currentStatus = 'awaiting_review';
  return view;
}
const VISUAL_TARGET_KINDS = new Set(['static','pilot','video']);
function explicitAncestors(state,scope) {
  const result=new Set([scope]);
  for(const id of result)for(const dep of state.dependencies)if(dep.to===id)result.add(dep.from);
  return result;
}
function overviewConsent(view,{scoped=false}={}) {
  const adopted=view.adopted.visualOverview, actual=view.artifacts[adopted?.objectId];
  if(!adopted || actual?.validity!=='current' || actual.effectiveHash!==adopted.effectiveHash)return false;
  return view.approvals.find(a=>a.id===adopted.approvalId && a.objectId===adopted.objectId &&
    (scoped ? approvalBindings.get(view)?.get(a.id) : adopted.current && a.current) &&
    ['approved','delegated'].includes(a.decision) && a.aspect==='visual-overview' && a.allows.includes('batch-animate'));
}
function coveredProductionTargets(view,scopes,{rejectUnmapped=false,scoped=false}={}) {
  const blockers=[], consent=overviewConsent(view,{scoped});
  // Explicit static reviews select execution targets even before approval; pending
  // or revoked authorization must block, never vanish from the selected batch.
  const direct=view.state.pendingReviews.filter(r=>r.aspect==='static' && r.allows.includes('batch-animate')).map(r=>r.objectId);
  const selected=[...new Set([...direct,...(consent?.coverage??[]).map(c=>c.objectId)])].filter(id=>
    id!==view.adopted.visualOverview?.objectId && VISUAL_TARGET_KINDS.has(view.state.artifacts[id]?.kind) &&
    view.state.artifacts[id]?.status!=='superseded');
  const selectedAncestors=new Map(selected.map(id=>[id,explicitAncestors(view.state,id)]));
  const targets=selected.filter(id=>scopes.some(scope=>selectedAncestors.get(id).has(scope)));
  for(const scope of scopes)if(!targets.some(id=>selectedAncestors.get(id).has(scope)))
    blockers.push('正式制作范围缺少明确选定且有实际制作依赖的 static/pilot/video 目标：'+scope+'；须为实际目标建立 static/batch-animate 审阅');
  if(rejectUnmapped)for(const id of selected)if(!targets.includes(id))
    blockers.push('本批执行目标未关联任何当前分段：'+id+'；参考旧片不应登记为制作目标');
  return {targets:[...new Set(targets)],blockers};
}
function batchInputs(view,scope) {
  const {state,adopted,approvals,artifacts} = view;
  const ancestors = explicitAncestors(state,scope);
  const segments = state.segments.filter(s => ancestors.has(s.objectId));
  const relevant = Object.keys(state.artifacts).filter(id => state.artifacts[id].kind === 'storyboard' && state.artifacts[id].status !== 'superseded' &&
    (ancestors.has(id) || segments.some(s => state.dependencies.some(d => d.from === s.objectId && d.to === id))));
  const ids = relevant.length ? relevant.filter(id => approvals.some(a => a.current && a.objectId === id && a.aspect === 'storyboard' && a.allows.includes('design'))) :
    adopted.storyboard?.current ? [adopted.storyboard.objectId] : [];
  const bind = id => ({objectId:id,path:state.artifacts[id].path,...(state.artifacts[id].selector !== undefined ? {selector:state.artifacts[id].selector} : {}),effectiveHash:artifacts[id].effectiveHash});
  return {scope,action:'batch-animate',target:bind(scope),segments:segments.map(({id,narrative,anchors,route}) => ({id,narrative,anchors,route})),
    storyboards:ids.map(bind),inputs:['script','narration','design'].filter(slot => adopted[slot]?.current).map(slot => ({slot,...bind(adopted[slot].objectId)}))};
}
function checkAction(view, action, scope) {
  const requestedAction = action, batch = action === 'batch-animate';
  if (batch) action = 'animate';
  const blockers = [];
  const {state, artifacts, approvals, adopted, qa} = view;
  if(batch && !VISUAL_TARGET_KINDS.has(state.artifacts[scope]?.kind)) {
    const selected=coveredProductionTargets(view,[scope],{scoped:true});
    blockers.push(...selected.blockers);
    const workerInputs = [];
    for(const target of selected.targets) {
      const gate=checkAction(view,'batch-animate',target);
      blockers.push(...gate.blockers.map(message=>target+'：'+message));
      if (gate.ok) workerInputs.push(...gate.workerInputs);
    }
    return {ok:!blockers.length,action:requestedAction,scope,blockers,...(!blockers.length?{workerInputs}:{})};
  }
  const block = message => blockers.push(message);
  const currentObject = scope && artifacts[scope]?.validity === 'current';
  function approval(aspect, allow, strict = false, objectId = scope) {
    return approvals.some(a => a.objectId === objectId && a.current && a.aspect === aspect && a.allows.includes(allow) && (!strict || a.decision === 'approved'));
  }
  function check(aspect, method, allowNA = false) {
    if (qa.some(q=>q.objectId===scope && q.aspect===aspect && q.unresolvedFailure)) return false;
    return qa.some(q => q.objectId === scope && q.aspect === aspect && q.current &&
      ((q.result === '通过' && q.method === method) || (allowNA && q.result === '不适用' && q.reason)));
  }
  if (['generate-image', 'generate-video'].includes(action)) return {ok: false, action, scope, blockers: ['生图生视频由用户手动提交；Agent 不执行生成或重抽。']};
  if (action === 'publish') return {ok: false, action, scope, blockers: ['P0 不执行发布。当前宿主权限和另行发布授权需在实际操作时检查。']};
  if (!['storyboard','design','pilot','animate','picture-lock','final'].includes(action)) return {ok: false, action, scope, blockers: ['未知动作，不放行：' + action]};
  if (!state.choices.allowedVisualLayers.length) block('画面路线未选择：allowedVisualLayers 为空，先确认允许的画面组合。');
  if (!currentObject) block('目标对象不存在、缺失或已过期：' + scope);
  for (const slot of ['script','narration','design']) if (!adopted[slot]?.current) block('缺少有效采用：' + slot);
  let brief;
  if (batch) {
    brief = batchInputs(view,scope);
    if (!brief.storyboards.length) block('正式制作须绑定本段当前有效的已审文字镜头剧本，或已采用的整期剧本');
    if(scope===adopted.visualOverview?.objectId)block('当前总览自身不能作为本轮实际制作目标；请覆盖并验证独立的 static/pilot/video 产物');
    const consent = overviewConsent(view,{scoped:true});
    const ancestors = explicitAncestors(state,scope);
    const coveredTargets = [...new Set([scope,...state.segments.filter(s=>ancestors.has(s.objectId)).map(s=>s.objectId)])];
    const direct=approval('static','batch-animate');
    if (!direct && (!consent?.coverage?.length ||
      !coveredTargets.every(target=>artifacts[target]?.validity==='current' &&
        consent.coverage.some(c=>c.objectId===target && c.effectiveHash===artifacts[target].effectiveHash))))
      block('正式批量动画缺少当前目标 static/batch-animate 的有效授权；准备或局部制作不等于本批放行');
  }
  if (['animate','picture-lock','final'].includes(action)) {
    for (const failure of effectFailures(view,scope)) block('当前效果检查未通过：' + failure.objectId + '/' + failure.aspect);
  }
  if (action === 'storyboard') {
    if (!approval('segmentation','storyboard')) block('缺少当前分段与路线确认／委托');
  } else if (action === 'design') {
    // A segment proposal is not a storyboard. A stable segment scope can instead
    // use the actual storyboard that explicitly depends on that proposal.
    const storyboards = state.artifacts[scope]?.kind === 'storyboard' ? [scope] :
      state.segments.some(segment => segment.objectId === scope) ?
        state.dependencies.filter(d => d.from === scope && state.artifacts[d.to]?.kind === 'storyboard').map(d => d.to) : [];
    if (!storyboards.length) block('缺少当前范围的实际文字镜头剧本（kind=storyboard）；分段概述不能替代剧本');
    if (!storyboards.some(objectId => approval('storyboard', 'design', false, objectId))) block('缺少当前范围的文字镜头剧本确认／委托');
  } else {
    if (action === 'animate' || action === 'pilot') {
      if (!approval('static', action) && !(batch && approval('static','batch-animate'))) block('缺少当前范围静态确认及对应制作授权');
      if (action === 'animate') {
        // Each declared upstream risk needs evidence from its applicable pilot.
        const upstream = upstreamObjects(view,scope);
        for (const objectId of upstream) {
          if (!state.artifacts[objectId]?.risk) continue;
          const pilots = state.artifacts[objectId].kind === 'pilot' ? [objectId] :
            (view.riskValidations || []).filter(v => v.proofCurrent && v.riskObjectId === objectId &&
              v.riskHash === artifacts[objectId]?.effectiveHash &&
              v.pilotHash === artifacts[v.pilotObjectId]?.effectiveHash).map(v => v.pilotObjectId);
          const validPilot = pilots.some(p => approval('dynamic','animate',true,p) &&
            qa.some(q => q.objectId === p && q.current && q.aspect === 'visual' && q.method === 'human-view' && q.result === '通过') &&
            (!usesMG(state) || EFFECT_CHECKS.every(aspect => effectCheck(view,p,aspect))) &&
            !effectFailures(view,p).length);
          if (!validPilot) block('新类型／风险样片尚未实际验证和确认：' + objectId);
        }
      }
    }
    if (action === 'picture-lock' || action === 'final') {
      if (state.artifacts[scope]?.kind !== 'video') block('目标必须是实际登记的视频产物');
      if (!approval(action === 'final' ? 'final' : 'picture', action, true)) block('缺少当前整片的明确审查确认');
      if (!check('visual','human-view')) block('画面实际审看未通过或证据已过期');
      if (usesMG(state)) for (const aspect of EFFECT_CHECKS) {
        if (!effectCheck(view,scope,aspect)) block('缺少当前有效 MG 效果检查：' + aspect + '（inspection 或 human-view）');
      }
    }
    if (action === 'final') {
      if (adopted.finalVideo?.objectId !== scope || !adopted.finalVideo?.current) block('最终采用视频引用无效');
      for (const [aspect, method] of [['audio','human-listen'],['technical','technical'],['sources','inspection']]) if (!check(aspect,method)) block('缺少当前有效检查：' + aspect);
      if (!check('subtitles','human-view',state.choices.subtitlePolicy === 'none')) block('字幕检查未通过，或不适用依据不足');
    }
  }
  return {ok: blockers.length === 0, action:requestedAction, scope, blockers,...(batch && !blockers.length ? {workerInputs:[brief]} : {})};
}
function initialState(projectId, testOnly) {
  return {schemaVersion:'1.0', toolVersion:'0.1.0-p0',workflowMode:'skill-v1',projectId,testOnly,revision:0,
    currentStage:'S01',stageStatus:'waiting_input',choices:{narrationSource:null,allowedVisualLayers:[],output:null,soundPolicy:null,subtitlePolicy:null},
    artifacts:{},adopted:Object.fromEntries(SLOTS.map(s => [s,null])),segments:[],pendingReviews:[],approvals:[],permissions:[],dependencies:[],
    qaPath:'06_审片与QA/QA状态表.md',deliveryStatus:'awaiting_review',operations:[]};
}
export async function initialize(root, {testOnly = false, projectId = 'episode-' + crypto.randomUUID()} = {}) {
  need(typeof testOnly === 'boolean','INVALID_INPUT','testOnly must be boolean'); safeId(projectId,'projectId');
  await fs.mkdir(path.resolve(root),{recursive:true});
  return withProjectLock(root, async () => {
    const previous = await readState(root);
    need(!previous,'ALREADY_INITIALIZED','Existing state is preserved. Use status or explicit migration.');
    for (const relative of [CONTROL + '/制作大段表.md','06_审片与QA/QA状态表.md']) {
      try { await fs.access(path.join(root,relative)); throw new WorkflowError('LEGACY_PROJECT','Existing control files require migration; init does not overwrite them'); }
      catch(e) { if(e.code !== 'ENOENT') throw e; }
    }
    const state = initialState(projectId,testOnly); await validateState(state);
    await commitFiles(root,{state,qaMarkdown:qaMarkdown([],0),planMarkdown:planMarkdown(state)});
    return {state};
  });
}
export async function status(root) {
  const state = await readState(root); need(state,'NOT_INITIALIZED','No state. Inspect task scope before initializing.');
  await validateState(state); return inspect(root,state,await readQA(root,state));
}
export async function validate(root, {action,scope}) { return checkAction(await status(root),action,scope); }
export async function recover(root) { return withProjectLock(root, async () => { await recoverFiles(root); return status(root); }); }
export async function renderPlan(root) {
  return withProjectLock(root,async () => {
    const view = await status(root);
    await commitFiles(root,{state:view.state,qaMarkdown:qaMarkdown(await readQA(root,view.state),view.state.revision),planMarkdown:planMarkdown(view.state)});
    return {revision:view.state.revision};
  });
}
export async function apply(root, request) {
  await validateRequest(request);
  return withProjectLock(root,async () => {
    const state = await readState(root); need(state,'NOT_INITIALIZED','Project has no state');
    await validateState(state);
    const requestHash = dataHash(request);
    const prior = state.operations.find(o => o.id === request.operationId);
    if (prior) {
      need(prior.requestHash === requestHash,'OPERATION_REUSE','operationId reused with different content');
      return {state,result:prior.result,idempotent:true};
    }
    need(state.revision === request.expectedRevision,'REVISION_CONFLICT','Expected revision ' + request.expectedRevision + ', actual ' + state.revision);
    const records = await readQA(root,state);
    let view = await inspect(root,state,records);
    const p = request.payload;
    let result = {};
    const object = objectId => { need(own(state.artifacts,objectId),'UNKNOWN_OBJECT','Unknown object: '+objectId); return state.artifacts[objectId]; };
    const current = objectId => { object(objectId); const a=view.artifacts[objectId]; need(a?.validity==='current','STALE_OBJECT','Refresh changed input before this operation: '+objectId); return a; };
    switch(request.type) {
      case 'choices': {
        need(p.partial && typeof p.partial==='object' && !Array.isArray(p.partial),'INVALID_INPUT','partial must be an object');
        for(const [key,value] of Object.entries(p.partial)) {
          need(own(state.choices,key),'INVALID_INPUT','Unknown choice: '+key);
          if(key==='allowedVisualLayers') need(Array.isArray(value) && value.every(v=>['mg','screen','generated'].includes(v)),'INVALID_INPUT','Invalid visual layers');
          if(key==='narrationSource') need(['existing','external-ai','self-recorded'].includes(value),'INVALID_INPUT','Invalid narration source');
          if(key==='output') need(value && typeof value==='object' && Number.isFinite(value.width) && value.width>0 && Number.isFinite(value.height) && value.height>0,'INVALID_INPUT','output needs width and height');
          if(['soundPolicy','subtitlePolicy'].includes(key)) text(value,key);
          state.choices[key]=value;
        }
        break;
      }
      case 'register': {
        safeId(p.id); need(KINDS.includes(p.kind),'INVALID_INPUT','Unknown artifact kind');
        const file=await projectFile(root,p.path);
        need(!file.relative.startsWith(CONTROL+'/') && file.relative!==state.qaPath,'CONTROL_ASSET','Control files cannot be media or confirmation objects');
        need(p.fidelity!=='simulated' || state.testOnly,'SIMULATED_ASSET','Simulated assets require a testOnly project');
        if(p.selector!==undefined) need(typeof p.selector==='string','SELECTOR','selector must be a string');
        if(p.risk!==undefined) need(typeof p.risk==='boolean','INVALID_INPUT','risk must be boolean');
        const artifact={id:p.id,path:file.relative,kind:p.kind,selector:p.selector,risk:!!p.risk,fidelity:p.fidelity || (state.testOnly?'simulated':'real'),status:'candidate'};
        if (p.motionRole !== undefined) {
          need(['render','assembly','footage'].includes(p.motionRole) && ['pilot','video'].includes(p.kind),'MOTION_SCOPE','motionRole 只适用于视频、样片的 render、assembly 或 footage');
          artifact.motionRole = p.motionRole;
        }
        if (['pilot','video'].includes(p.kind) && /\.(?:mp4|mov|m4v|mkv|webm|avi)$/i.test(file.relative)) {
          artifact.motionRole ??= state.artifacts[p.id]?.motionRole ?? 'auto';
          const local = await projectFile(root,path.join(path.dirname(file.relative),'render-manifest.json'),{mustExist:false});
          try {
            const manifest = JSON.parse(await fs.readFile(local.absolute,'utf8'));
            if (manifest.projectSourceDir && manifest.video?.name === path.basename(file.relative)) artifact.motionRole = 'render';
          } catch (err) { if (err.code !== 'ENOENT') throw err; }
        }
        // A new registration at a new path is its own production version, even
        // if two encodes match byte for byte. Explicit byte-identical rebinds
        // retain this edition and their previously captured evidence.
        if (artifact.motionRole) artifact.motionEdition = file.relative;
        if(artifact.selector===undefined) delete artifact.selector;
        Object.assign(artifact,await content(root,artifact));
        state.artifacts[p.id]=artifact;
        break;
      }
      case 'dependency': {
        object(p.from);object(p.to);need(p.from!==p.to,'DEPENDENCY_CYCLE','Self dependency');
        if (p.removeLegacyValidationEdge === true) {
          need(object(p.from).risk && object(p.to).kind === 'pilot','RISK_MIGRATION','Only risk source -> pilot can replace a legacy validation edge');
          need(state.dependencies.some(d=>d.from===p.to&&d.to===p.from),'RISK_MIGRATION','No exact legacy pilot -> risk edge exists');
          const evidence = await captureEvidence(root,state,p.evidence,{allowAgent:true});
          state.dependencies = state.dependencies.filter(d=>!(d.from===p.to&&d.to===p.from));
          result = {legacyValidationEdgeRemoved:true,requiresFreshPilotReview:true,evidence};
        }
        if(!state.dependencies.some(d=>d.from===p.from&&d.to===p.to)) state.dependencies.push({from:p.from,to:p.to});
        await evaluate(root,state);break;
      }
      case 'risk-proof': {
        const risk = object(p.riskObjectId), pilot = object(p.pilotObjectId);
        need(risk.risk && pilot.kind === 'pilot' && risk.id !== pilot.id,'RISK_PROOF','A declared risk and a separate pilot are required');
        const ancestors = upstreamObjects(view,pilot.id);
        need(ancestors.has(risk.id),'RISK_SOURCE','Register the real risk -> pilot production dependency before reviewing the pilot');
        const ra = current(risk.id), pa = current(pilot.id);
        need(view.approvals.some(a=>a.objectId===pilot.id && a.current && a.aspect==='dynamic' && a.decision==='approved' && a.allows.includes('animate')) &&
          view.qa.some(q=>q.objectId===pilot.id && q.current && q.aspect==='visual' && q.method==='human-view' && q.result==='通过') &&
          (!usesMG(state) || EFFECT_CHECKS.every(a=>effectCheck(view,pilot.id,a))) && !effectFailures(view,pilot.id).length,
          'RISK_REVIEW','The current pilot needs complete actual review and explicit dynamic approval');
        const proof = {riskObjectId:risk.id,pilotObjectId:pilot.id,riskHash:ra.effectiveHash,pilotHash:pa.effectiveHash,at:timestamp()};
        state.riskValidations = (state.riskValidations || []).filter(v=>!(v.riskObjectId===risk.id && v.pilotObjectId===pilot.id));
        state.riskValidations.push(proof); result = proof; break;
      }
      case 'review': {
        safeId(p.id);text(p.aspect,'aspect'); const a=current(p.objectId);
        need(!state.pendingReviews.some(r=>r.id===p.id),'DUPLICATE_REVIEW','Review ID already exists');
        need(Array.isArray(p.allows)&&p.allows.length>0&&p.allows.every(a=>ACTIONS.includes(a)),'INVALID_INPUT','Review allows must name supported actions');
        need(reviewKindMatches(state,p),'STORYBOARD_REQUIRED','Storyboard review and design permission require an actual kind=storyboard object, not a segment proposal');
        let coverage;
        if (p.allows.includes('batch-animate') && p.aspect!=='visual-overview')
          need(p.aspect==='static' && VISUAL_TARGET_KINDS.has(object(p.objectId).kind),'BATCH_TARGET','Batch authorization requires an actual static/pilot/video target and static aspect');
        if (p.covers !== undefined || p.aspect==='visual-overview') {
          need(object(p.objectId).kind==='static' && p.aspect==='visual-overview' && Array.isArray(p.covers) && p.covers.length>0 && new Set(p.covers).size===p.covers.length,
            'OVERVIEW_SCOPE','Visual overview review requires a static artifact and unique covers object IDs');
          coverage = p.covers.map(objectId=>({objectId,effectiveHash:current(objectId).effectiveHash}));
        }
        state.pendingReviews.push({id:p.id,objectId:p.objectId,aspect:p.aspect,allows:[...new Set(p.allows)],artifactHash:a.fileHash,effectiveHash:a.effectiveHash,...(coverage?{coverage}:{}),status:'pending',createdAt:timestamp()});
        break;
      }
      case 'approve': {
        const review=state.pendingReviews.find(r=>r.id===p.reviewId);
        need(review?.status==='pending','UNKNOWN_REVIEW','Review is absent or already resolved');
        need(reviewKindMatches(state,review),'STORYBOARD_REQUIRED','Storyboard review and design permission require an actual kind=storyboard object, not a segment proposal');
        const actual=current(review.objectId);
        need(actual.effectiveHash===review.effectiveHash,'STALE_REVIEW','Review refers to changed content');
        if (review.coverage) need(review.coverage.every(c=>current(c.objectId).effectiveHash===c.effectiveHash),'STALE_REVIEW','Overview target changed after review creation');
        need(['approved','delegated','rejected'].includes(p.decision),'INVALID_INPUT','Invalid approval decision');
        const approvalId=safeId(p.id || request.operationId,'approvalId');
        need(!state.approvals.some(a=>a.id===approvalId),'DUPLICATE_APPROVAL','Approval ID already exists');
        const evidence=await captureEvidence(root,state,p.evidence);
        state.approvals.push({id:approvalId,reviewId:review.id,objectId:review.objectId,aspect:review.aspect,allows:review.allows,...(review.coverage?{coverage:review.coverage}:{}),artifactHash:review.artifactHash,effectiveHash:review.effectiveHash,decision:p.decision,evidence,createdAt:timestamp(),revoked:false});
        review.status=p.decision;result={approvalId};break;
      }
      case 'adopt': {
        need(SLOTS.includes(p.slot),'INVALID_INPUT','Unknown adopted slot'); const a=current(p.objectId);
        const approval=view.approvals.find(x=>x.id===p.approvalId);
        need(approval?.current&&approval.objectId===p.objectId&&approval.allows.includes('adopt:'+p.slot),'ADOPTION_NOT_APPROVED','No valid approval for this object and slot');
        const kinds={script:['script'],narration:['narration'],design:['design','config'],storyboard:['storyboard'],visualOverview:['static'],mainProject:['config','other'],finalVideo:['video']};
        need(kinds[p.slot].includes(object(p.objectId).kind),'KIND_MISMATCH','Artifact kind cannot fill '+p.slot);
        const old=state.adopted[p.slot];
        if(old&&old.objectId!==p.objectId) state.artifacts[old.objectId].status='superseded';
        state.adopted[p.slot]={objectId:p.objectId,approvalId:p.approvalId,effectiveHash:a.effectiveHash};
        state.artifacts[p.objectId].status='adopted';break;
      }
      case 'narration-gain-adopt': {
        const old = state.adopted.narration;
        need(old && view.adopted.narration?.current,'GAIN_SOURCE_CHANGED','Keep the adopted original WAV unchanged; restore its verified backup before gain revision');
        const prior = object(old.objectId), next = object(p.objectId), nextActual = current(next.id);
        need(prior.id!==next.id && prior.path!==next.path && next.kind==='narration' && prior.kind==='narration' &&
          prior.selector===undefined && next.selector===undefined,'GAIN_INPUT','Register the new WAV under a new narration ID/path; retain the original whole-file WAV');
        const permission = view.approvals.find(a=>a.id===p.approvalId);
        need(permission?.current && permission.objectId===next.id && permission.allows.includes('adopt:narration'),
          'ADOPTION_NOT_APPROVED','New narration still requires its own current adoption authorization');
        const evidence = await captureEvidence(root,state,p.evidence,{allowAgent:true});
        const oldFile=await projectFile(root,prior.path), newFile=await projectFile(root,next.path);
        const proof=proveWavGain(await fs.readFile(oldFile.absolute),await fs.readFile(newFile.absolute));
        need(proof.beforeHash===view.artifacts[prior.id].fileHash && proof.afterHash===nextActual.fileHash,'GAIN_SOURCE_CHANGED','WAV changed during revision');
        const provenance={operationId:request.operationId,proof,evidence,fromNarration:prior.id,toNarration:next.id};
        state.adopted.narration={objectId:next.id,approvalId:p.approvalId,effectiveHash:nextActual.effectiveHash};
        prior.status='superseded';next.status='adopted';
        const after = await evaluate(root,state);
        const eligible = new Set(Object.keys(after).filter(id=>id!==prior.id && id!==next.id &&
          view.artifacts[id]?.validity==='current' && after[id].validity==='current' &&
          view.artifacts[id].fileHash===after[id].fileHash && view.artifacts[id].contentHash===after[id].contentHash &&
          view.artifacts[id].effectiveHash!==after[id].effectiveHash));
        const visualAspects = new Set([...EFFECT_ASPECTS,'segmentation','storyboard','picture','visual-overview']);
        const visualAllows = new Set(['storyboard','design','pilot','animate','batch-animate','picture-lock','adopt:storyboard','adopt:visualOverview']);
        const approvalMap=new Map(), checkMap=new Map();
        for (const a of view.approvals.filter(a=>a.current && eligible.has(a.objectId) &&
          (visualAspects.has(a.aspect) || (a.aspect==='content' && a.allows.every(v=>visualAllows.has(v)))))) {
          if(a.aspect==='final' || a.aspect==='audio')continue;
          const approvalId=safeId(request.operationId+':a'+approvalMap.size);
          const copy={...a,id:approvalId,effectiveHash:after[a.objectId].effectiveHash,artifactHash:after[a.objectId].fileHash,
            allows:a.allows.filter(v=>visualAllows.has(v)),inheritedFrom:{approvalId:a.id,effectiveHash:a.effectiveHash,...provenance,previous:a.inheritedFrom || null}};
          delete copy.current;
          if(copy.coverage)copy.coverage=copy.coverage.map(c=>({...c,effectiveHash:after[c.objectId].effectiveHash}));
          if(!copy.allows.length)continue;
          state.approvals.push(copy);approvalMap.set(a.id,approvalId);
        }
        // Keep latest method statuses, known failures and their still-valid
        // resolution evidence even when that proof is no longer the latest check.
        const selectedChecks=new Set(view.qa.filter(q=>(q.current || (q.result==='未通过' && q.effectiveHash===view.artifacts[q.objectId]?.effectiveHash)) &&
          eligible.has(q.objectId) && EFFECT_ASPECTS.has(q.aspect)).map(q=>q.checkId));
        for(const q of view.qa.filter(q=>selectedChecks.has(q.checkId) && q.result==='未通过' && q.resolvedBy)) {
          const resolution=view.qa.find(r=>r.checkId===q.resolvedBy && r.objectId===q.objectId && r.aspect===q.aspect && r.result==='通过');
          if(resolution && await qaBindingCurrent(root,state,view.artifacts,resolution))selectedChecks.add(resolution.checkId);
        }
        for(const q of view.qa.filter(q=>selectedChecks.has(q.checkId)))
          checkMap.set(q.checkId,safeId(request.operationId+':q'+checkMap.size));
        for (const q of view.qa.filter(q=>checkMap.has(q.checkId))) {
          const copy={...q,checkId:checkMap.get(q.checkId),effectiveHash:after[q.objectId].effectiveHash,artifactHash:after[q.objectId].fileHash,
            superseded:q.superseded,inheritedFrom:{checkId:q.checkId,effectiveHash:q.effectiveHash,...provenance,previous:q.inheritedFrom || null}};
          if(copy.resolvedBy)copy.resolvedBy=checkMap.get(copy.resolvedBy);
          delete copy.current;delete copy.unresolvedFailure;records.push(copy);
        }
        for(const slot of ['storyboard','visualOverview']) {
          const a=state.adopted[slot];
          if(a && approvalMap.has(a.approvalId))state.adopted[slot]={...a,approvalId:approvalMap.get(a.approvalId),effectiveHash:after[a.objectId].effectiveHash};
        }
        for(const v of [...state.riskValidations || []]) if(v.riskHash===view.artifacts[v.riskObjectId]?.effectiveHash && v.pilotHash===view.artifacts[v.pilotObjectId]?.effectiveHash &&
          after[v.riskObjectId]?.validity==='current' && after[v.pilotObjectId]?.validity==='current') {
          state.riskValidations.push({...v,riskHash:after[v.riskObjectId].effectiveHash,pilotHash:after[v.pilotObjectId].effectiveHash,inheritedFrom:{...provenance,previous:v.inheritedFrom || null}});
        }
        result={...provenance,inheritedApprovalIds:[...approvalMap.values()],inheritedCheckIds:[...checkMap.values()],audioAndFinalInherited:false};
        break;
      }
      case 'qa': {
        safeId(p.checkId);text(p.aspect,'aspect');const a=current(p.objectId);
        need(RESULTS.includes(p.result)&&METHODS.includes(p.method),'INVALID_INPUT','Invalid QA result/method');
        if(['未通过','未验证','不适用'].includes(p.result)) text(p.reason,'reason');
        if(p.result==='通过'&&['visual','subtitles'].includes(p.aspect)) need(p.method==='human-view','QA_METHOD','Visual pass requires actual viewing evidence');
        if(p.result==='通过'&&p.aspect==='audio') need(p.method==='human-listen','QA_METHOD','Audio pass requires actual listening evidence');
        if(p.result==='通过'&&EFFECT_CHECKS.includes(p.aspect)) need(['inspection','human-view'].includes(p.method),'QA_METHOD','Effect review requires inspection or actual viewing evidence; technical success is insufficient');
        const evidence=await captureEvidence(root,state,p.evidence,{allowAgent:['inspection','technical'].includes(p.method)});
        let motionProof;
        if (p.aspect === 'motion' && p.result === '通过') {
          const plan = motionReviewPlan(view,p.objectId);
          need(!plan.blocker,'MOTION_SCOPE',plan.blocker);
          if (plan.targets.includes(p.objectId) || p.motionReport) motionProof = await captureMotionProof(root,state,object(p.objectId),a,p);
          for (const source of plan.targets.filter(id => id !== p.objectId))
            need(effectCheck(view,source,'motion'),'MOTION_REPORT','总装引用的 MG 分段缺少当前运动复核：'+source);
        }
        need(!records.some(r=>r.checkId===p.checkId),'DUPLICATE_CHECK','checkId is immutable and globally unique; use a fresh ID');
        const resolves = p.resolves || [];
        need(Array.isArray(resolves) && new Set(resolves).size===resolves.length,'QA_RESOLUTION','resolves must contain unique failed check IDs');
        need(!resolves.length || p.result==='通过','QA_RESOLUTION','Only an actual passing recheck can resolve a failure');
        for (const checkId of resolves) {
          const failed = records.find(r=>r.checkId===checkId);
          need(failed && failed.result==='未通过' && failed.objectId===p.objectId && failed.aspect===p.aspect,'QA_RESOLUTION','Resolution must identify a failure of this object and aspect');
          need(failed.evidence.path!==evidence.path || failed.evidence.quote!==evidence.quote,'QA_RESOLUTION','Resolution needs distinct actual recheck evidence, not the original failure quote');
          failed.resolvedBy = p.checkId;
        }
        for(const r of records) if(r.objectId===p.objectId && r.aspect===p.aspect && r.method===p.method && r.result!=='未通过') r.superseded=true;
        records.push({checkId:p.checkId,objectId:p.objectId,aspect:p.aspect,artifactHash:a.fileHash,effectiveHash:a.effectiveHash,result:p.result,method:p.method,evidence,...(motionProof?{motionProof}:{}),reason:p.reason || '',recordedAt:timestamp(),superseded:false});
        break;
      }
      case 'rebind': {
        const a=object(p.objectId), file=await projectFile(root,p.path);
        need(!file.relative.startsWith(CONTROL+'/') && file.relative!==state.qaPath,'CONTROL_ASSET','Control files cannot be artifacts');
        const rebound={...a,path:file.relative};const actual=await content(root,rebound);
        need(actual.fileHash===a.fileHash,'CONTENT_CHANGED','Rebind only accepts byte-identical content; register a new candidate for other changes');
        a.path=file.relative;break;
      }
      case 'revoke': {
        const approval=state.approvals.find(a=>a.id===p.approvalId);
        need(approval,'UNKNOWN_APPROVAL','Unknown approval');approval.revoked=true;approval.revokedAt=timestamp();break;
      }
      case 'segment': {
        safeId(p.id);object(p.objectId);text(p.narrative,'narrative');text(p.anchors,'anchors');text(p.route,'route');
        const segment={id:p.id,objectId:p.objectId,narrative:p.narrative,anchors:p.anchors,route:p.route,progress:p.progress||'待制作'};
        const index=state.segments.findIndex(s=>s.id===p.id);
        if(index<0)state.segments.push(segment);else state.segments[index]=segment;
        break;
      }
      case 'stage': {
        need(/^S(0[1-9]|10)$/.test(p.stage),'INVALID_STAGE','Invalid stage');
        const stage=Number(p.stage.slice(1));
        if(stage>=3)need(state.choices.allowedVisualLayers.length>0,'STAGE_BLOCKED','Missing allowedVisualLayers: choose a visual route before visual planning');
        if(stage>=3)for(const slot of ['script','narration'])need(view.adopted[slot]?.current,'STAGE_BLOCKED','Missing adopted '+slot);
        if(stage>=4)need(view.adopted.design?.current,'STAGE_BLOCKED','Missing adopted DESIGN');
        if(stage>=5 && stage<=9) {
          need(state.segments.length>0,'STAGE_BLOCKED','No segments registered');
          if(stage===8) {
            const selected=coveredProductionTargets(view,state.segments.map(s=>s.objectId),{rejectUnmapped:true});
            need(!selected.blockers.length,'STAGE_BLOCKED',selected.blockers.join('; '));
            for(const objectId of selected.targets) {
              const gate=checkAction(view,'batch-animate',objectId);
              need(gate.ok,'STAGE_BLOCKED',objectId+': '+gate.blockers.join('; '));
            }
          } else for(const segment of state.segments) {
            if(stage===9) current(segment.objectId);
            else {
              const target={5:'storyboard',6:'design',7:'pilot'}[stage];
              const gate=checkAction(view,target,segment.objectId);
              need(gate.ok,'STAGE_BLOCKED',gate.blockers.join('; '));
            }
          }
        }
        if(stage===10)need(checkAction(view,'final',state.adopted.finalVideo?.objectId).ok,'STAGE_BLOCKED','Final QA not complete');
        state.currentStage=p.stage;state.stageStatus='ready';break;
      }
      case 'finalize': {
        need(['limited','accepted'].includes(p.mode),'INVALID_INPUT','mode must be limited or accepted');
        if(p.mode==='accepted')need(checkAction(view,'final',state.adopted.finalVideo?.objectId).ok,'QA_BLOCKED','Final acceptance conditions are not met');
        else {
          need(state.adopted.finalVideo&&view.adopted.finalVideo?.current,'DELIVERY_MISSING','Limited delivery still needs an actual adopted file');
          need(!effectFailures(view,state.adopted.finalVideo.objectId).length,'QA_BLOCKED','Current failed visual, design, or motion QA must be resolved before limited delivery');
          state.deliveryEvidence=await captureEvidence(root,state,p.evidence);
        }
        state.deliveryStatus=p.mode==='accepted'?'accepted':'delivered_with_limits';break;
      }
      default: throw new WorkflowError('INVALID_OPERATION','Unsupported operation');
    }
    state.revision++;
    state.operations.push({id:request.operationId,requestHash,result,revision:state.revision,at:timestamp()});
    if(request.type!=='finalize')state.deliveryStatus='awaiting_review';
    await validateState(state);
    // Validate dependency graph and all new bindings before any disk commit.
    await evaluate(root,state);
    await commitFiles(root,{state,qaMarkdown:qaMarkdown(records,state.revision),planMarkdown:planMarkdown(state)});
    return {state,result};
  });
}

// Migration candidates contain evidence-backed imports only; no inference of legacy approvals.
export async function prepareMigration(root,{projectId='migration-'+crypto.randomUUID(),testOnly=false}={}) {
  need(typeof testOnly==='boolean','INVALID_INPUT','testOnly must be boolean');
  await fs.mkdir(path.resolve(root),{recursive:true});
  return withProjectLock(root,async()=>{
    need(!(await readState(root)),'ALREADY_INITIALIZED','Existing skill state uses ordinary recovery, not legacy migration');
    const originals=[];
    for(const relative of [CONTROL+'/制作大段表.md',CONTROL+'/本期说明.md','06_审片与QA/QA状态表.md']) {
      try{const f=await projectFile(root,relative);originals.push({path:relative,hash:digest(await fs.readFile(f.absolute))});}
      catch(e){if(e.code!=='MISSING_FILE')throw e;originals.push({path:relative,hash:null});}
    }
    need(originals.some(o=>o.hash),'NO_LEGACY_CONTROL','No legacy control files found');
    const candidateId='migration-'+crypto.randomUUID();
    const candidateDir=path.join(root,CONTROL,'migration-candidates',candidateId);
    await projectFile(root,path.join(candidateDir,'candidate.json'),{mustExist:false});
    await fs.mkdir(candidateDir,{recursive:true});
    const state=initialState(safeId(projectId),testOnly);
    state.migration={candidateId,status:'candidate',originals,preparedAt:timestamp(),note:'旧采用与确认未自动推断，须按证据重新导入。'};
    const candidateBytes=JSON.stringify(state,null,2)+'\n';
    await fs.writeFile(path.join(candidateDir,'candidate.json'),candidateBytes,{encoding:'utf8',flag:'wx'});
    await fs.writeFile(path.join(candidateDir,'制作大段表.md'),planMarkdown(state),{encoding:'utf8',flag:'wx'});
    return {candidateId,candidateHash:digest(candidateBytes),originals,adoptedImported:0};
  });
}
async function migrationCandidate(root,candidateId) {
  safeId(candidateId);
  const f=await projectFile(root,CONTROL+'/migration-candidates/'+candidateId+'/candidate.json');
  const bytes=await fs.readFile(f.absolute);
  const state=JSON.parse(bytes.toString('utf8'));await validateState(state);
  need(state.migration?.candidateId===candidateId&&state.migration.status==='candidate','MIGRATION_STATE','Candidate is not active');
  const pristine=initialState(safeId(state.projectId),state.testOnly);
  pristine.migration=state.migration;
  need(canonical(pristine)===canonical(state),'MIGRATION_STATE','Migration cannot import unverified state or approvals');
  const paths=[CONTROL+'/制作大段表.md',CONTROL+'/本期说明.md','06_审片与QA/QA状态表.md'];
  need(state.migration.originals?.length===paths.length && paths.every(p=>state.migration.originals.filter(o=>o.path===p).length===1),'MIGRATION_STATE','Incomplete original file inventory');
  return {state,file:f.absolute,hash:digest(bytes)};
}
export async function cancelMigration(root,{candidateId}) {
  return withProjectLock(root,async()=>{
    need(!(await readState(root)),'ALREADY_INITIALIZED','An activated project cannot be cancelled as a pending migration; inspect backups for an explicit rollback');
    const {state,file}=await migrationCandidate(root,candidateId);
    state.migration.status='cancelled';
    await fs.writeFile(file,JSON.stringify(state,null,2)+'\n','utf8');
    return {candidateId,status:'cancelled',legacyUnchanged:true};
  });
}
export async function commitMigration(root,{candidateId,expectedCandidateHash,evidence},{fault}={}) {
  return withProjectLock(root,async()=>{
    need(!(await readState(root)),'ALREADY_INITIALIZED','Cannot overwrite an active project');
    const {state,hash}=await migrationCandidate(root,candidateId);
    need(expectedCandidateHash && hash===expectedCandidateHash,'MIGRATION_STALE','Candidate hash differs from the reviewed candidate');
    for(const original of state.migration.originals) {
      let actualHash=null;
      try{const f=await projectFile(root,original.path);actualHash=digest(await fs.readFile(f.absolute));}
      catch(e){if(e.code!=='MISSING_FILE')throw e;}
      need(actualHash===original.hash,'MIGRATION_STALE','Legacy file appeared, disappeared or changed; prepare a fresh candidate');
    }
    state.migration.evidence=await captureEvidence(root,state,evidence);
    state.migration.status='activated';state.migration.activatedAt=timestamp();
    await commitFiles(root,{state,qaMarkdown:qaMarkdown([],0),planMarkdown:planMarkdown(state)},{fault});
    return {state,notice:'已切换为空采用状态；旧文档已备份，未伪造导入确认。按实际证据逐项登记。'};
  });
}
