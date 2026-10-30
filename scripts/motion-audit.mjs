#!/usr/bin/env node
// MIT. Deterministic engineering samples, never pixel tracking or visual acceptance.
// Adapter exportAudit() returns this schema; intervals/IDs must derive from the render timeline.
// {schemaVersion:1,fps,duration,viewport:{width,height},sourceFiles:[path],videoFile:path,
//  coverage:{basis:'render-state-final-screen',objectIds:[id],scope:string,
//    notApplicable?:{checkpoints?:{sourceFile,anchor,reason},relays?:{sourceFile,anchor,reason}}},
//  frameAt(seconds):{objects:[{id,x,y,width,height,opacity,rotation?,contentVersion?,d1Category?,
//    parentId?,localGeometry?:{x,y,width,height,rotation?},screenFixed?:boolean,
//    observation?:{state:'visible'|'hidden'|'unknown',reason,visibleBounds?,basis?},hotspot?:{x,y},
//    process?:{maskProgress?,pathProgress?,morphProgress?,occlusionProgress?},
//    replacement?:{kind:'geometry'|'mask'|'path'|'morph'|'occlusion'|'source-copy',progress,fromVersion,toVersion}}],camera?:{cx,cy,z},
//    semantic?:{[objectId]:string|number|boolean}}, // legacy scalar semantic[ID] is a contentVersion fallback
// frameAt may also return renderedObjectIds from the actual production recorder; omitted draw IDs are gaps.
// observation is verified through the shared recorder in this process, never by an author state/basis string.
// Legacy/custom/serialized observations retain coordinates but painted visibility stays unknown.
//  sourceLinks?:[{id,sourceObjectId,targetObjectId,time,sourceTime?,sourceAnchor?:[x,y],targetAnchor?:[x,y],evidence}],
//  actions:[{id,objectId,start,end,kind:'transfer'|'camera'|'realtime'|'reveal'|'process',channels?,motionGate?:'anticipation',exception?}],
//  checkpoints:[{id,time,objectIds:[id],role:'pass'|'hold'|'cut',exception?}],
//  relays:[{id,fromAction,toAction,motionGate?:'follow'|'rigid-feedback',exception?}]}
// process actions reuse production actions and measure localGeometry channels or actual process progress.
// parentId is the production container ID; localGeometry for parts excludes that parent's transport.
// Neither declared parts nor sampled changes prove the script's semantic coverage or perceptual strength.
// Exceptions: {kind:'reading'|'rhetorical'|'real-dependency'|'real-time'|'cut',
//              evidence:{sourceFile:path,anchor:exactSourceSubstring,reason:string}}
// They document attributable intent, not automatic proof of a necessary hold.
// d1Category on each object: mg | overlay | subtitle-cue | source-footage | data-readout.
// Only a consistently declared subtitle-cue/source-footage is excluded from all D1 checks.
// data-readout excludes content identity updates only; its designed lifecycle and source links remain checked.
// Missing, unknown or varying categories do not exempt. Declarations do not prove source authenticity.
// Packaging overlays require their own IDs/category; a source-footage classification never propagates to them.
// Classification excludes only D1 lifecycle/identity/target-source-link checks, never trajectory/checkpoint/relay checks.
// contentVersion identifies the actual rendered text/identity; omit only when not exposed (reported as uncovered).
// process/replacement progress MUST be read from actual production masks/paths/morphs/occlusion, not an invented ramp.
// localGeometry excludes inherited camera motion. Without it, centered camera inversion is a review-only inference.
// sourceLinks mean same-location split/copy origin: compare actual source and first visible target anchor, not intended coordinates.
// Scene cuts apply only with evidence and the complete visible object set; an element-local cut cannot waive a pop.
// Empty checkpoints/relays need coverage.notApplicable evidence or remain incomplete; actions cannot be waived.
// Constant individual channels are review clues. Ordinary transfer/camera hard findings use combined screen-point speeds.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import observation from './motion-observation.cjs';
const {visibleState,recordedFrameState,measureFrameMotion,inspectActionCoverage}=observation;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const finite=(v,label)=>{if(!Number.isFinite(v))throw Error('Expected finite '+label);return v;};
const nonempty=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error('Missing '+label);return v;};
const uniq=(xs,label)=>{if(!Array.isArray(xs)||new Set(xs).size!==xs.length)throw Error('Invalid/duplicate '+label);return xs;};
const channels=['x','y','width','height','opacity','rotation'];
const processChannels=['maskProgress','pathProgress','morphProgress','occlusionProgress'];
const localChannels=['x','y','width','height','rotation'];
const EPS={positionPx:1e-5,velocity:1e-3,relative:1e-6,derivativeStep:1e-4,cruiseIntervals:6};
// D1 locator tolerances reject numerical noise; exceeding one never certifies perceptual quality.
const D1={geometryProcessPx:1,processProgress:1e-3,tinySlidePx:24};
const D1_CATEGORIES=new Set(['mg','overlay','subtitle-cue','source-footage','data-readout']);
const D1_EXCLUDED=new Set(['subtitle-cue','source-footage']);
const bounds=b=>[b.x,b.y,b.width,b.height,b.opacity,b.rotation??0];
function viewportVisibility(b,viewport){
  return visibleState(b,viewport).state;
}
const screenPoints=b=>[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height],[b.x+b.width/2,b.y+b.height/2]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const div=(a,k)=>a.map(x=>x/k);
const maxAbs=v=>Math.max(...v.map(Math.abs));
function resolveExisting(p,base){const f=fs.realpathSync(path.resolve(base,nonempty(p,'file path')));if(!fs.statSync(f).isFile())throw Error('Not a file '+f);return f;}
function fileLock(f){const b=fs.readFileSync(f);return {path:f,bytes:b.length,sha256:sha(b)};}
function validateSpec(s){
  if(s?.schemaVersion!==1)throw Error('Unsupported adapter schemaVersion');
  finite(s.fps,'fps');finite(s.duration,'duration');if(s.fps<=0||s.fps>240||s.duration<=0||s.duration>3600||s.fps*s.duration>100000)throw Error('Unsupported sampling extent; audit a production block instead of silently reducing samples');
  for(const k of ['width','height'])if(finite(s.viewport?.[k],k)<=0)throw Error('Viewport must be positive');
  if(typeof s.frameAt!=='function')throw Error('Missing frameAt');
  if(s.coverage?.basis!=='render-state-final-screen')throw Error('Declare final-screen render-state coverage; world coordinates cannot be audited as screen coordinates');
  nonempty(s.coverage.scope,'coverage.scope');
  const ids=uniq(s.coverage.objectIds,'coverage.objectIds');if(!ids.length)throw Error('No covered objects');ids.forEach(id=>nonempty(id,'objectId'));
  if(s.coverage.mainContentIds!==undefined&&uniq(s.coverage.mainContentIds,'coverage.mainContentIds').some(id=>!ids.includes(id)))throw Error('Main content object not covered');
  if(!Array.isArray(s.sourceFiles)||!s.sourceFiles.length)throw Error('No render source files');
  for(const group of ['actions','checkpoints','relays']){if(!Array.isArray(s[group]))throw Error('Missing '+group+' (empty allowed with explicit coverage gap)');uniq(s[group].map(x=>nonempty(x.id,group+' id')),group+' ids');}
  if(s.coverage.notApplicable!==undefined){
    const na=s.coverage.notApplicable;
    if(!na||typeof na!=='object'||Array.isArray(na))throw Error('Invalid coverage.notApplicable');
    for(const group of Object.keys(na)){
      if(!['checkpoints','relays'].includes(group))throw Error('Not-applicable coverage is only supported for checkpoints/relays');
      if(s[group].length)throw Error('Not-applicable group must be empty: '+group);
    }
  }
  if(s.sourceLinks!==undefined){
    if(!Array.isArray(s.sourceLinks))throw Error('Invalid sourceLinks');uniq(s.sourceLinks.map(x=>nonempty(x.id,'sourceLink id')),'sourceLink ids');
    for(const link of s.sourceLinks){
      if(!ids.includes(link.sourceObjectId)||!ids.includes(link.targetObjectId))throw Error('Source link object not covered');
      for(const t of [link.time,link.sourceTime??link.time])if(finite(t,'sourceLink time')<0||t>s.duration)throw Error('Source link outside timeline');
      for(const a of [link.sourceAnchor??[.5,.5],link.targetAnchor??[.5,.5]])if(!Array.isArray(a)||a.length!==2||a.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Invalid sourceLink anchor');
    }
  }
  for(const a of s.actions){
    if(!ids.includes(a.objectId))throw Error('Action object not covered: '+a.id);
    if(!['transfer','camera','realtime','reveal','process'].includes(a.kind))throw Error('Unknown action kind '+a.id);
    finite(a.start,'action start');finite(a.end,'action end');if(a.start<0||a.end>s.duration||a.end<=a.start)throw Error('Invalid action range '+a.id);
    if(a.channels!==undefined&&(!Array.isArray(a.channels)||!a.channels.length||a.channels.some(c=>!(a.kind==='process'?[...localChannels,...processChannels]:a.kind==='reveal'?['width','height','opacity']:['x','y','width','height']).includes(c))))throw Error('Invalid action channels '+a.id+'; reveal cannot exempt spatial translation');
    if(a.kind==='process'&&!a.channels?.length)throw Error('Process action must name actual local/progress channels: '+a.id);
    if(a.motionGate!==undefined&&a.motionGate!=='anticipation')throw Error('Unknown action motionGate '+a.id);
    if(a.kind==='realtime'&&a.exception?.kind!=='real-time')throw Error('Realtime action requires attributable real-time evidence: '+a.id);
  }
  for(const p of s.checkpoints){
    finite(p.time,'checkpoint time');if(p.time<0||p.time>s.duration)throw Error('Checkpoint outside timeline');
    if(!['pass','hold','cut'].includes(p.role))throw Error('Unknown checkpoint role');
    if(!uniq(p.objectIds,'checkpoint objects').length||p.objectIds.some(id=>!ids.includes(id)))throw Error('Missing checkpoint coverage '+p.id);
    if(p.role!=='pass'&&!p.exception)throw Error('Hold/cut requires attributable evidence '+p.id);
    if(p.role==='cut'&&p.exception.kind!=='cut')throw Error('Cut exception kind mismatch');
  }
  const aset=new Set(s.actions.map(a=>a.id));
  for(const r of s.relays){if(!aset.has(r.fromAction)||!aset.has(r.toAction)||r.fromAction===r.toAction)throw Error('Relay does not reference two actions: '+r.id);if(r.motionGate!==undefined&&!['follow','rigid-feedback'].includes(r.motionGate))throw Error('Unknown relay motionGate '+r.id);}
}
export function auditMotion(spec,{baseDir=process.cwd(),adapterFile,requireVideo=true}={}){
  const observationLock=fileLock(fileURLToPath(new URL('./motion-observation.cjs',import.meta.url)));
  validateSpec(spec);
  const visibility=b=>viewportVisibility(b,spec.viewport),visible=b=>visibility(b)==='visible';
  const sameVisibleState=(a,b)=>!visible(a)&&!visible(b)||visible(a)&&visible(b)&&maxAbs(sub(bounds(a),bounds(b)))<=EPS.positionPx&&processChannels.every(k=>Math.abs((a.process?.[k]??0)-(b.process?.[k]??0))<=D1.processProgress)&&localChannels.every(k=>Math.abs((a.localGeometry?.[k]??0)-(b.localGeometry?.[k]??0))<=EPS.positionPx);
  const sources=[...new Set(spec.sourceFiles.map(p=>resolveExisting(p,baseDir)))];
  if(adapterFile){const f=resolveExisting(adapterFile,baseDir);if(!sources.includes(f))sources.push(f);}
  const sourceLocks=sources.map(fileLock);
  let videoLock=null;if(spec.videoFile)videoLock=fileLock(resolveExisting(spec.videoFile,baseDir));else if(requireVideo)throw Error('Missing videoFile: delivery audit must bind the actual video');
  const sourceSet=new Set(sources),exceptions=[],notApplicable=[],findings=[],coverageGaps=[];
  function evidenceFor(evidence,owner){
    if(!evidence)throw Error('Missing evidence '+owner);
    nonempty(evidence.reason,'evidence reason');const anchor=nonempty(evidence.anchor,'evidence anchor');
    const f=resolveExisting(evidence.sourceFile,baseDir);
    if(!sourceSet.has(f))throw Error('Evidence source is not hash-bound '+owner);
    if(!fs.readFileSync(f,'utf8').includes(anchor))throw Error('Evidence source anchor missing '+owner);
    return {sourceFile:f,anchor,reason:evidence.reason};
  }
  function exception(e,owner){
    if(!e)return false;
    if(!['reading','rhetorical','real-dependency','real-time','cut'].includes(e.kind))throw Error('Unknown exception kind '+owner);
    exceptions.push({owner,kind:e.kind,...evidenceFor(e.evidence,owner),status:'attributed-intent-requires-reading-or-causality-review'});return true;
  }
  for(const a of spec.actions)exception(a.exception,a.id);
  for(const p of spec.checkpoints)exception(p.exception,p.id);
  for(const r of spec.relays)exception(r.exception,r.id);
  for(const [group,label] of [['actions','No declared primary actions; linear motion is not covered'],['checkpoints','No declared pass/hold/cut nodes; joins are not covered'],['relays','No declared causal relay; waiting is not covered']])if(!spec[group].length){
    if(Object.hasOwn(spec.coverage.notApplicable??{},group))notApplicable.push({group,...evidenceFor(spec.coverage.notApplicable[group],'notApplicable.'+group),status:'attributed-not-applicable-requires-scope-review'});
    else coverageGaps.push(label);
  }
  const hasSpatialActions=spec.actions.some(a=>['transfer','camera'].includes(a.kind));
  const revealOnly=spec.actions.length>0&&spec.actions.every(a=>a.kind==='reveal');
  if(spec.actions.length&&!hasSpatialActions&&!revealOnly&&!spec.actions.some(a=>a.kind==='process'))coverageGaps.push('Only reveal/realtime actions declared; primary movement is not covered');
  const cache=new Map();
  function read(t){
    finite(t,'sample time');const key=t.toPrecision(15);if(cache.has(key))return cache.get(key);
    if(t<0||t>spec.duration)throw Error('Sample outside duration');
    const frame=spec.frameAt(t);if(!frame||!Array.isArray(frame.objects))throw Error('Missing objects at '+t);
    if(frame.renderedObjectIds!==undefined)uniq(frame.renderedObjectIds,'renderedObjectIds').forEach(id=>nonempty(id,'rendered object ID'));
    uniq(frame.objects.map(o=>o.id),'sample object IDs');
    const map=new Map();
    for(const o of frame.objects){nonempty(o.id,'sample object id');for(const c of channels.slice(0,5))finite(o[c],`${o.id}.${c} at ${t}`);if(o.rotation!==undefined)finite(o.rotation,'rotation');if(o.width<0||o.height<0||o.opacity<0||o.opacity>1)throw Error('Invalid bounds/opacity at '+t);if(o.contentVersion!==undefined&&!['string','number','boolean'].includes(typeof o.contentVersion))throw Error('contentVersion must be a scalar');
      if(typeof o.contentVersion==='number')finite(o.contentVersion,'contentVersion');
      if(o.localGeometry){for(const k of ['x','y','width','height'])finite(o.localGeometry[k],'localGeometry.'+k);if(o.localGeometry.rotation!==undefined)finite(o.localGeometry.rotation,'localGeometry.rotation');}
      if(o.observation&&!['visible','hidden','unknown'].includes(o.observation.state))throw Error('Invalid observation state '+o.id);
      if(o.observation?.visibleBounds)for(const k of ['x','y','width','height'])finite(o.observation.visibleBounds[k],'visibleBounds.'+k);
      if(o.hotspot){finite(o.hotspot.x,'hotspot.x');finite(o.hotspot.y,'hotspot.y');}
      if(o.parentId!==undefined){nonempty(o.parentId,'parentId');if(o.parentId===o.id||!spec.coverage.objectIds.includes(o.parentId))throw Error('Part parent must be a distinct covered production object: '+o.id);}
      if(o.process)for(const [k,v] of Object.entries(o.process)){if(!['maskProgress','pathProgress','morphProgress','occlusionProgress'].includes(k))throw Error('Unknown process channel '+k);if(finite(v,'process.'+k)<0||v>1)throw Error('Process progress outside 0..1');}
      if(o.replacement){for(const key of ['fromVersion','toVersion'])if(!['string','number','boolean'].includes(typeof o.replacement[key]))throw Error('Replacement requires scalar '+key);if(!['geometry','mask','path','morph','occlusion','source-copy'].includes(o.replacement.kind))throw Error('Unknown replacement kind');if(finite(o.replacement.progress,'replacement.progress')<0||o.replacement.progress>1)throw Error('Replacement progress outside 0..1');}
      const fallback=frame.semantic?.[o.id];const contentVersion=o.contentVersion??(['string','number','boolean'].includes(typeof fallback)?fallback:undefined);
      map.set(o.id,{...o,rotation:o.rotation??0,...(contentVersion===undefined?{}:{contentVersion})});}
    for(const id of spec.coverage.objectIds)if(!map.has(id))throw Error('Covered object omitted at '+t+': '+id+'; retain its identity with opacity 0 if hidden');
    if(frame.camera){for(const k of ['cx','cy','z'])finite(frame.camera[k],'camera.'+k);if(frame.camera.z<=0)throw Error('Invalid camera scale');}
    const out={time:t,map,frame};cache.set(key,out);return out;
  }
  const samples=[];for(let f=0;f<=Math.floor(spec.duration*spec.fps);f++)samples.push(read(f/spec.fps));if(samples.at(-1).time!==spec.duration)samples.push(read(spec.duration));
  const outside=new Set();
  const omittedDraws=new Set(),unregisteredObjects=new Set();
  for(const s of samples)for(const id of s.frame.renderedObjectIds??[])if(!s.map.has(id)||!spec.coverage.objectIds.includes(id))omittedDraws.add(id);
  for(const s of samples)if(Array.isArray(s.frame.renderedObjectIds))for(const id of s.map.keys())if(!s.frame.renderedObjectIds.includes(id))unregisteredObjects.add(id);
  if(omittedDraws.size)coverageGaps.push('Production draw inventory omitted from adapter/coverage: '+[...omittedDraws].join(', '));
  if(unregisteredObjects.size)coverageGaps.push('Adapter objects absent from production draw inventory: '+[...unregisteredObjects].join(', '));
  const inventorySamples=samples.filter(s=>s.time<spec.duration),inventoryCount=inventorySamples.filter(s=>Array.isArray(s.frame.renderedObjectIds)).length;
  const verifiedInventoryCount=inventorySamples.filter(s=>recordedFrameState(s.frame).status==='recorded').length;
  const renderInventory={status:verifiedInventoryCount===inventorySamples.length?'recorded':verifiedInventoryCount?'partial':inventoryCount?'declared-unverified':'unexposed',recordedFrames:verifiedInventoryCount,declaredFrames:inventoryCount,omittedObjectIds:[...omittedDraws],basis:'Shared recorder submissions bound to the same SVG and observations; author inventory strings remain declared only'};
  if(inventoryCount&&verifiedInventoryCount!==inventorySamples.length)coverageGaps.push('Production draw inventory is author-declared or changed after rendering; same-renderer coverage remains unverified');
  if(!inventoryCount)coverageGaps.push('Production draw inventory is not exposed; coordinate diagnostics remain available but complete renderer coverage is unproven');
  if(inventoryCount&&inventoryCount!==inventorySamples.length)coverageGaps.push('Production draw inventory is only partially exposed');
  for(const s of samples)if(s.time<spec.duration)for(const [id,b]of s.map)if(!spec.coverage.objectIds.includes(id)&&visibility(b)!=='hidden')outside.add(id);
  if(outside.size)coverageGaps.push('Returned visible or unresolved objects outside declared coverage: '+[...outside].join(', '));
  for(const id of spec.coverage.objectIds){
    const unresolved=samples.filter(s=>s.time<spec.duration&&visibility(s.map.get(id))==='unknown');
    if(unresolved.length)coverageGaps.push(`Painted visibility unresolved for ${id}: ${unresolved[0].time}–${unresolved.at(-1).time}; bbox-only/unsupported paint retains coordinate statistics but cannot establish visible process or lifecycle coverage`);
  }
  // Independent repeated/reverse seeking checks a stateful adapter without assuming sequential playback.
  for(const t of [spec.duration/2,0,spec.duration,.371*spec.duration].reverse()){
    const before=JSON.stringify(read(t).frame),again=JSON.stringify(spec.frameAt(t));if(before!==again)throw Error('Non-deterministic render adapter at '+t);
  }
  function actionPoints(a){
    const ts=[a.start,...samples.filter(s=>s.time>a.start&&s.time<a.end).map(s=>s.time),a.end];
    return ts.map(t=>({t,b:read(t).map.get(a.objectId)}));
  }
  // A fixed-composition fade has no spatial trajectory to audit. This exception
  // is proved from sampled render states, not from naming a moving action reveal.
  if(revealOnly){
    const times=[...new Set([...samples.map(s=>s.time),...spec.actions.flatMap(a=>[a.start,a.end])])].sort((a,b)=>a-b);
    const probes=times.map(read),covered=new Set(spec.coverage.objectIds),uncovered=new Set();
    for(const s of probes)for(const [id,b]of s.map)if(!covered.has(id)&&visibility(b)!=='hidden')uncovered.add(id);
    if(uncovered.size)coverageGaps.push('Reveal-only scope has visible or unresolved objects outside coverage: '+[...uncovered].join(', '));
    const camera=probes[0].frame.camera;
    if(probes.some(s=>!!s.frame.camera!==!!camera||(camera&&['cx','cy','z'].some(k=>Math.abs(s.frame.camera[k]-camera[k])>(k==='z'?EPS.relative:EPS.positionPx)))))
      coverageGaps.push('Reveal-only scope has camera movement or changing camera coverage; declare the applicable spatial action');
    for(const id of spec.coverage.objectIds){
      const visibleStates=probes.map(s=>s.map.get(id)).filter(visible),first=visibleStates[0];
      if(first&&visibleStates.some(b=>['x','y','width','height','rotation'].some(k=>Math.abs((b[k]??0)-(first[k]??0))>(k==='rotation'?EPS.relative:EPS.positionPx))))
        coverageGaps.push('Reveal-only scope has sampled visible translation, size or rotation change: '+id+'; spatial movement is not covered');
      const actions=spec.actions.filter(a=>a.objectId===id);
      let outside=false;
      for(let i=1;i<probes.length;i++){
        const before=probes[i-1],after=probes[i],a=before.map.get(id),b=after.map.get(id);
        if((visibility(a)!=='hidden'||visibility(b)!=='hidden')&&Math.abs(b.opacity-a.opacity)>EPS.relative&&
          !actions.some(action=>action.start<=before.time&&action.end>=after.time&&(!action.channels||action.channels.includes('opacity'))))outside=true;
      }
      if(outside)coverageGaps.push('Reveal-only opacity change lies outside its declared object/action/channel coverage: '+id);
    }
    for(const action of spec.actions){
      const opacity=actionPoints(action).map(p=>p.b.opacity);
      if(Math.max(...opacity)-Math.min(...opacity)<=EPS.relative)
        coverageGaps.push('Declared reveal has no sampled opacity change: '+action.id+'; a static hold does not establish a reveal');
    }
  }
  const actionCoverage=inspectActionCoverage(spec,samples);
  for(const gap of actionCoverage.uncoveredChanges)coverageGaps.push(`Sampled object change has no production action: ${gap.objectId} ${gap.start}–${gap.end} (${gap.fields.join(', ')})`);
  for(const id of actionCoverage.follow.uncoveredRelayIds)coverageGaps.push('Cross-object production relay not measured for component timing: '+id);
  for(const gap of actionCoverage.follow.relatedActionCandidates)coverageGaps.push('Actual parent/part actions need relationship coverage: '+gap.parentAction+' -> '+gap.partAction+'; causal or independent remains unassessed, no extra motion is required');
  const processCoverage={status:'unexposed',actions:[],exposedPartIds:[],unmeasuredPartIds:[],inactivePartIds:[],basis:'Actual sampled part changes matched to declared process events; static parts do not require invented action, and script meaning/perceptual strength remain unassessed'};
  processCoverage.exposedPartIds=spec.coverage.objectIds.filter(id=>samples.some(s=>s.map.get(id).parentId));
  processCoverage.unmeasuredPartIds=processCoverage.exposedPartIds.filter(id=>actionCoverage.changes.some(c=>c.objectId===id&&c.fields.some(k=>k.startsWith('local.')||k.startsWith('process.')))&&!spec.actions.some(a=>a.objectId===id&&a.kind==='process'));
  processCoverage.inactivePartIds=processCoverage.exposedPartIds.filter(id=>!actionCoverage.changes.some(c=>c.objectId===id));
  const actionMeasurements=[];
  for(const a of spec.actions){
    if(a.kind==='process'){
      // Internal change must exist on encoded frames. The analytic EOF and
      // subframe action endpoints cannot invent an on-screen process.
      const p=samples.filter(s=>s.time>=a.start&&s.time<=a.end&&s.time<spec.duration).map(s=>({t:s.time,b:s.map.get(a.objectId)})),active=p.filter(v=>visible(v.b));
      const m={id:a.id,objectId:a.objectId,kind:a.kind,start:a.start,end:a.end,visibleSampleCount:active.length,status:'unmeasured',channels:{},visualAcceptance:'not-assessed'};
      const gaps=[];
      if(active.length<2)gaps.push('no consecutive visible process samples');
      for(const c of a.channels){
        const get=b=>processChannels.includes(c)?b.process?.[c]:b.localGeometry?.[c];
        const values=active.map(v=>get(v.b));
        if(!values.length||values.some(v=>!Number.isFinite(v))){gaps.push('missing actual '+(processChannels.includes(c)?'process.':'localGeometry.')+c);continue;}
        const range=Math.max(...values)-Math.min(...values),tolerance=processChannels.includes(c)?D1.processProgress:EPS.positionPx;
        const visibleChange=p.slice(1).some((v,i)=>visible(v.b)&&visible(p[i].b)&&Number.isFinite(get(v.b))&&Number.isFinite(get(p[i].b))&&Math.abs(get(v.b)-get(p[i].b))>tolerance);
        m.channels[c]={range,unit:processChannels.includes(c)?'fraction':c==='rotation'?'degrees':'pixels',basis:processChannels.includes(c)?'production-process':'production-local-geometry',visibleChange};
      }
      if(!Object.values(m.channels).some(c=>c.visibleChange))gaps.push('no sampled visible internal change; container/camera transport does not count');
      m.status=gaps.length?'unmeasured':'measured-change';m.uncovered=gaps;
      for(const gap of gaps)coverageGaps.push('Process '+a.id+': '+gap);
      processCoverage.actions.push(m);actionMeasurements.push(m);continue;
    }
    const p=actionPoints(a);if(p.length<4){coverageGaps.push('Action too short for trajectory checks: '+a.id);continue;}
    const fullyHidden=p.every(p=>!visible(p.b));
    if(fullyHidden){coverageGaps.push('Action has no confirmed visible sampled object: '+a.id);continue;}
    const active=p.filter(v=>visible(v.b));
    const measurement={id:a.id,objectId:a.objectId,kind:a.kind,start:a.start,end:a.end,visibleSampleCount:active.length,channels:{}};
    for(const c of a.channels||(a.kind==='reveal'?['opacity']:['x','y','width','height'])){
      const slopes=p.slice(1).map((v,i)=>({start:p[i].t,end:v.t,value:(v.b[c]-p[i].b[c])/(v.t-p[i].t),visible:visible(v.b)&&visible(p[i].b)}));
      const vals=p.map(p=>p.b[c]);const range=Math.max(...vals)-Math.min(...vals);
      measurement.channels[c]={range,unit:c==='opacity'?'fraction':'pixels',minVelocity:Math.min(...slopes.map(v=>v.value)),maxVelocity:Math.max(...slopes.map(v=>v.value))};
      if(range<EPS.positionPx)continue;
      let first=0;
      for(let i=1;i<=slopes.length;i++){
        const base=slopes[first],cur=slopes[i],equal=cur&&base.visible&&cur.visible&&Math.abs(cur.value-base.value)<=EPS.velocity+EPS.relative*Math.abs(base.value);
        if(equal)continue;
        const count=i-first;
        if(base.visible&&count>=EPS.cruiseIntervals&&Math.abs(base.value)>EPS.velocity&&!['realtime','reveal'].includes(a.kind)){
          findings.push({code:'uniform-screen-channel',severity:'review',action:a.id,objectId:a.objectId,channel:c,start:base.start,end:slopes[i-1].end,velocityPxPerSecond:base.value,sampleIntervals:count,note:'One final-screen channel is constant. This is a diagnostic clue, not proof of uniform composite movement; inspect dominant displacement, combined speed and the applicable motion rule.'});
        }
        first=i;
      }
    }
    // Final-screen bbox points combine translation and scale. A linear x alone cannot prove uniform motion.
    // Rotation-changing intervals require a richer point adapter/pixel review; bbox points do not reconstruct rotating material points.
    const composite=p.slice(1).map((v,i)=>{
      const prev=p[i],dt=v.t-prev.t,from=screenPoints(prev.b),to=screenPoints(v.b);
      const pointSpeeds=to.map((q,j)=>Math.hypot(q[0]-from[j][0],q[1]-from[j][1])/dt);
      const onScreen=visible(prev.b)&&visible(v.b),rotationChanged=Math.abs((v.b.rotation??0)-(prev.b.rotation??0))>EPS.relative;
      return {start:prev.t,end:v.t,value:Math.sqrt(pointSpeeds.reduce((s,x)=>s+x*x,0)/pointSpeeds.length),pointSpeeds,
        visible:onScreen&&!rotationChanged,rotationExcluded:onScreen&&rotationChanged};
    });
    const measured=composite.filter(v=>v.visible),rotationExcludedRanges=[];
    let currentRun=0,maxContiguousIntervals=0;
    for(const v of composite){
      currentRun=v.visible?currentRun+1:0;maxContiguousIntervals=Math.max(maxContiguousIntervals,currentRun);
      if(v.rotationExcluded){
        const last=rotationExcludedRanges.at(-1);
        if(last&&last.end===v.start){last.end=v.end;last.intervals++;}
        else rotationExcludedRanges.push({start:v.start,end:v.end,intervals:1});
      }
    }
    measurement.compositeSpeed={basis:'RMS speed of final-screen bbox corners and center; rotation-changing intervals excluded',unit:'pixels/second',visibleIntervals:measured.length,
      maxContiguousIntervals,minimumContiguousIntervals:EPS.cruiseIntervals,rotationExcludedRanges,
      minVelocity:measured.length?Math.min(...measured.map(v=>v.value)):null,maxVelocity:measured.length?Math.max(...measured.map(v=>v.value)):null};
    if(['transfer','camera'].includes(a.kind)){
      if(rotationExcludedRanges.length)coverageGaps.push('Composite screen speed excludes visible rotation-changing intervals: '+a.id+'; inspect encoded frames or provide material-point motion');
      if(maxContiguousIntervals<EPS.cruiseIntervals)coverageGaps.push(`Insufficient consecutive visible composite-speed intervals for ${a.id}: ${maxContiguousIntervals}/${EPS.cruiseIntervals}; uniform motion is not covered`);
      let first=0;
      for(let i=1;i<=composite.length;i++){
        const base=composite[first],cur=composite[i],equal=cur&&base.visible&&cur.visible&&Math.abs(cur.value-base.value)<=EPS.velocity+EPS.relative*Math.abs(base.value)
          &&cur.pointSpeeds.every((v,j)=>Math.abs(v-base.pointSpeeds[j])<=EPS.velocity+EPS.relative*Math.abs(base.pointSpeeds[j]));
        if(equal)continue;
        const count=i-first;
        if(base.visible&&count>=EPS.cruiseIntervals&&base.value>EPS.velocity)findings.push({code:'uniform-screen-motion',severity:'constraint-violation',action:a.id,objectId:a.objectId,start:base.start,end:composite[i-1].end,speedPxPerSecond:base.value,sampleIntervals:count,
          rule:'ordinary-visual-nonuniform',basis:measurement.compositeSpeed.basis,note:'Combined screen-point speeds are numerically constant in an ordinary transfer/camera action. Check the encoded frames and applicable nonuniform-motion rule; this is engineering evidence, not visual acceptance.'});
        first=i;
      }
    }
    const start=read(a.start).map.get(a.objectId),end=read(a.end).map.get(a.objectId);
    measurement.endpointDisplacementPx=Math.hypot(end.x-start.x,end.y-start.y);
    measurement.visibleAreaFraction={min:Math.min(...active.map(p=>p.b.width*p.b.height/(spec.viewport.width*spec.viewport.height))),max:Math.max(...active.map(p=>p.b.width*p.b.height/(spec.viewport.width*spec.viewport.height)))};
    actionMeasurements.push(measurement);
  }
  function sides(id,t){
    const h=Math.min(EPS.derivativeStep,1/spec.fps/100,t/2,(spec.duration-t)/2);if(h<=0)return null;
    const internal=[...new Set(spec.actions.filter(a=>a.objectId===id&&a.kind==='process'&&a.start<=t&&a.end>=t).flatMap(a=>a.channels))];
    const names=[...channels,...internal.map(c=>(processChannels.includes(c)?'process.':'localGeometry.')+c)];
    const b=tt=>{const o=read(tt).map.get(id);return [...bounds(o),...internal.map(c=>processChannels.includes(c)?o.process?.[c]:o.localGeometry?.[c])];},at=b(t);
    if([...at,...b(t-h),...b(t+h)].some(v=>!Number.isFinite(v)))return null;
    const L1=div(sub(at,b(t-h)),h),L2=div(sub(at,b(t-h/2)),h/2),R1=div(sub(b(t+h),at),h),R2=div(sub(b(t+h/2),at),h/2);
    return {left:L2.map((v,i)=>2*v-L1[i]),right:R2.map((v,i)=>2*v-R1[i]),h,channels:names};
  }
  const checkpointMeasurements=[];
  for(const p of spec.checkpoints){
    const values=p.objectIds.map(id=>({id,sides:sides(id,p.time)}));
    const valid=values.filter(v=>v.sides&&visible(read(p.time).map.get(v.id)));
    if(!valid.length){coverageGaps.push('Checkpoint has no visible object with measurable states on both sides: '+p.id);continue;}
    const allStopped=valid.every(v=>maxAbs(v.sides.left)<EPS.velocity&&maxAbs(v.sides.right)<EPS.velocity);
    checkpointMeasurements.push({id:p.id,time:p.time,role:p.role,allCoveredObjectsStationaryAtNode:allStopped,objects:valid.map(({id,sides:s})=>({id,leftDerivative:s.left,rightDerivative:s.right,channels:s.channels}))});
    if(allStopped&&p.role==='pass')findings.push({code:'pass-node-common-stop',severity:'constraint-violation',checkpoint:p.id,time:p.time,objectIds:p.objectIds,note:'A declared pass node brings all audited final-screen object channels to zero. This checks declared objects, not the entire raster scene.'});
    if(p.role!=='cut')for(const {id,sides:s} of valid){
      const delta=maxAbs(sub(s.left,s.right)),scale=Math.max(maxAbs(s.left),maxAbs(s.right),1);
      if(delta>EPS.velocity+scale*.001)findings.push({code:'node-velocity-discontinuity',severity:'review',checkpoint:p.id,objectId:id,time:p.time,leftDerivative:s.left,rightDerivative:s.right,note:'One-sided velocity limits differ; check intended contact, attachment/camera changes and the rendered frames.'});
    }
  }
  const relayMeasurements=[];
  for(const r of spec.relays){
    const a=spec.actions.find(a=>a.id===r.fromAction),b=spec.actions.find(a=>a.id===r.toAction),gap=b.start-a.end;
    const m={id:r.id,fromAction:a.id,toAction:b.id,declaredGapSeconds:gap,measuredAllCoveredStatic:false,basis:'viewport-intersecting covered-object states; hidden/offscreen-only changes ignored; unresolved rotated visibility is not a no-wait result'};
    if(gap>0){
      const ts=[a.end,...samples.filter(s=>s.time>a.end&&s.time<b.start).map(s=>s.time),b.start];
      m.unresolvedVisibilityObjectIds=spec.coverage.objectIds.filter(id=>ts.some(t=>visibility(read(t).map.get(id))==='unknown'));
      if(m.unresolvedVisibilityObjectIds.length){
        m.measuredAllCoveredStatic=null;
        coverageGaps.push('Relay has unresolved rotated-object viewport visibility: '+r.id+' ('+m.unresolvedVisibilityObjectIds.join(', ')+')');
      }else{
        const at=read(ts[0]),stationary=ts.slice(1).every(t=>spec.coverage.objectIds.every(id=>sameVisibleState(read(t).map.get(id),at.map.get(id))));
        m.measuredAllCoveredStatic=stationary;
        if(stationary&&!r.exception)findings.push({code:'relay-empty-wait',severity:'review',relay:r.id,start:a.end,end:b.start,note:'Declared causal handoff contains no measured change in covered objects. Check whether a necessary readable/causal hold is missing from the source, or an avoidable empty wait.'});
      }
    }
    relayMeasurements.push(m);
  }
  // D1 audits only encoded-frame times [0,duration). The analytic endpoint remains
  // available to the existing trajectory/derivative checks, never as an extra rendered frame.
  const lifecycleMeasurements=[],replacementMeasurements=[],sourceLinkMeasurements=[];
  const lifecycleFrames=samples.filter(s=>s.time<spec.duration);
  const d1Classification={basis:'adapter-declared categories; authenticity and semantic correctness are not assessed',
    scope:'Only D1 lifecycle, content identity and source-link targets; trajectory, checkpoint and relay checks remain unchanged',
    checkedObjectIds:[],excludedObjectIds:[],contentCheckedObjectIds:[],contentOnlyExcludedObjectIds:[],objects:[],excludedSourceLinks:[]};
  const d1Excluded=new Map(),d1ContentOnlyExcluded=new Set();
  for(const id of spec.coverage.objectIds){
    const values=lifecycleFrames.map(s=>s.map.get(id).d1Category),first=values[0];
    const stable=D1_CATEGORIES.has(first)&&values.every(v=>v===first),excluded=stable&&D1_EXCLUDED.has(first),contentOnlyExcluded=stable&&first==='data-readout';
    const missingSamples=values.filter(v=>v===undefined).length;
    const unknownCategories=[...new Set(values.filter(v=>v!==undefined&&!D1_CATEGORIES.has(v)).map(v=>typeof v==='string'?v:'<'+(v===null?'null':typeof v)+'>'))];
    const record={objectId:id,category:stable?first:null,disposition:excluded?'excluded':contentOnlyExcluded?'content-only-excluded':'checked',
      checks:{lifecycle:!excluded,contentIdentity:!excluded&&!contentOnlyExcluded,sourceLinks:!excluded},
      declaredCategories:[...new Set(values.filter(v=>typeof v==='string'))],missingSamples,unknownCategories,
      reason:excluded?'consistent declared category; exclusion requires scope/authenticity review':contentOnlyExcluded?'declared data-readout; only numerical content updates excluded, lifecycle/source links still checked; verify actual data mapping':stable?'explicit D1 category':
        missingSamples===values.length?'no category declared; default D1 coverage':'missing, unknown or inconsistent category; retain D1 coverage'};
    d1Classification.objects.push(record);
    if(excluded){d1Excluded.set(id,first);d1Classification.excludedObjectIds.push(id);}
    else{
      d1Classification.checkedObjectIds.push(id);
      if(contentOnlyExcluded){d1ContentOnlyExcluded.add(id);d1Classification.contentOnlyExcludedObjectIds.push(id);}
      else d1Classification.contentCheckedObjectIds.push(id);
    }
  }
  const contentVersionCoverage={covered:[],partial:[],uncovered:[],unresolvedChanges:[],
    note:'Only d1Classification.contentCheckedObjectIds participate; full D1 and content-only exclusions are recorded separately. Covered means identity is exposed at every encoded-frame sample. Partial identity has an explicit coverage gap; no precise replacement time is inferred through an unknown span. Unexposed IDs are not checked. Provide actual contentVersion or legacy semantic[objectId] scalar.'};
  function local(s,id){
    const b=s.map.get(id);if(b.localGeometry)return {...b.localGeometry,rotation:b.localGeometry.rotation??0};
    const c=s.frame.camera;if(!c||b.screenFixed)return b;
    return {...b,x:(b.x-spec.viewport.width/2)/c.z+c.cx,y:(b.y-spec.viewport.height/2)/c.z+c.cy,width:b.width/c.z,height:b.height/c.z};
  }
  const range=xs=>Math.max(...xs)-Math.min(...xs);
  function processEvidence(frames,id){
    const g=frames.map(s=>local(s,id)),boxes=frames.map(s=>s.map.get(id));
    const screenScale=Math.max(...frames.map(s=>s.frame.camera?.z??1));
    const translationPx=Math.hypot(range(g.map(b=>b.x)),range(g.map(b=>b.y)))*screenScale;
    const widthDeltaPx=range(g.map(b=>b.width))*screenScale,heightDeltaPx=range(g.map(b=>b.height))*screenScale;
    const rotationArcPx=Math.max(...g.map(b=>Math.hypot(b.width,b.height)/2))*range(g.map(b=>b.rotation??0))*Math.PI/180*screenScale;
    const shapeDeltaPx=Math.max(widthDeltaPx,heightDeltaPx,rotationArcPx),shapeChange=shapeDeltaPx>D1.geometryProcessPx;
    const progressChannels=processChannels.filter(k=>{
      const values=boxes.map(b=>b.process?.[k]);return values.every(Number.isFinite)&&range(values)>D1.processProgress&&values.some(v=>v>D1.processProgress&&v<1-D1.processProgress);
    });
    return {translationPx,shapeDeltaPx,shapeChange,progressChannels,
      geometryBasis:boxes.every(b=>b.localGeometry)?'production-local-geometry':frames.some(s=>s.frame.camera)?'centered-camera-inversion-inference':'final-screen-geometry',
      hasProcess:shapeChange||translationPx>D1.tinySlidePx||progressChannels.length>0};
  }
  function sceneCutAt(time){
    return spec.checkpoints.find(p=>p.role==='cut'&&p.scope==='scene'&&Math.abs(p.time-time)<=1/spec.fps&&d1Classification.checkedObjectIds.filter(id=>visible(read(Math.max(0,time-1/spec.fps)).map.get(id))||visible(read(time).map.get(id))).every(id=>p.objectIds.includes(id)));
  }
  function identityGap(id,detail){
    let partial=contentVersionCoverage.partial.find(p=>p.objectId===id);
    if(!partial){partial={objectId:id,missingRanges:[],subframeGaps:[]};contentVersionCoverage.partial.push(partial);}
    if(detail)partial.subframeGaps.push(detail);
    contentVersionCoverage.covered=contentVersionCoverage.covered.filter(x=>x!==id);
    const message='Content identity coverage incomplete for '+id+'; replacement timing across unknown values is unresolved';
    if(!coverageGaps.includes(message))coverageGaps.push(message);
    return partial;
  }
  for(const id of d1Classification.checkedObjectIds){
    let start=null,sign=0;
    function finish(end){
      if(start===null)return;
      const frames=lifecycleFrames.slice(start,end+1),first=frames[0],last=frames.at(-1),a=first.map.get(id),b=last.map.get(id);
      const enters=a.opacity<=EPS.relative&&b.opacity>EPS.relative,exits=a.opacity>EPS.relative&&b.opacity<=EPS.relative;
      if((enters||exits)&&frames.some(s=>visible(s.map.get(id)))){
        const evidence=processEvidence(frames,id),cut=sceneCutAt(enters?last.time:first.time);
        const alphaAction=spec.actions.find(a=>a.objectId===id&&a.kind==='reveal'&&a.channels?.length===1&&a.channels[0]==='opacity'&&a.start<=first.time+1/spec.fps&&a.end>=last.time-1/spec.fps);
        evidence.declaredOpacityOnlyAction=alphaAction?.id??null;
        const m={objectId:id,kind:enters?'entry':'exit',start:first.time,end:last.time,opacity:[a.opacity,b.opacity],...evidence,sceneCut:cut?.id??null};
        lifecycleMeasurements.push(m);
        if((!evidence.hasProcess||last.time-first.time<=1/spec.fps+1e-9||(alphaAction&&!evidence.shapeChange&&!evidence.progressChannels.length))&&!cut){
          const instant=last.time-first.time<=1/spec.fps+1e-9;
          findings.push({code:instant?'instant-element-visibility':'opacity-only-lifecycle',severity:'review',...m,
            note:'Suspected element appearance/disappearance without a sampled geometry, mask or path process. Tiny slide/shape/progress noise cannot establish a process. Spatial travel under an opacity-only declared action may be inherited; check the element-local mechanism. Inspect first/last visible encoded frames and the project DESIGN exception; this is not an automatic visual failure.'});
        }
      }
      start=null;sign=0;
    }
    for(let i=1;i<lifecycleFrames.length;i++){
      const delta=lifecycleFrames[i].map.get(id).opacity-lifecycleFrames[i-1].map.get(id).opacity,sgn=Math.abs(delta)>1e-12?Math.sign(delta):0;
      if(sgn&&sgn===sign)continue;
      finish(i-1);if(sgn){start=i-1;sign=sgn;}
    }
    finish(lifecycleFrames.length-1);
    if(d1ContentOnlyExcluded.has(id))continue; // numerical updates only; lifecycle above and source links below remain checked
    const known=lifecycleFrames.map((s,index)=>({s,index})).filter(x=>x.s.map.get(id).contentVersion!==undefined);
    if(!known.length){contentVersionCoverage.uncovered.push(id);continue;}
    if(known.length===lifecycleFrames.length)contentVersionCoverage.covered.push(id);
    else{
      const partial=identityGap(id);partial.knownSamples=known.length;partial.missingSamples=lifecycleFrames.length-known.length;
      for(let i=0;i<lifecycleFrames.length;){
        if(lifecycleFrames[i].map.get(id).contentVersion!==undefined){i++;continue;}
        const begin=i;while(i<lifecycleFrames.length&&lifecycleFrames[i].map.get(id).contentVersion===undefined)i++;
        partial.missingRanges.push({firstMissing:lifecycleFrames[begin].time,lastMissing:lifecycleFrames[i-1].time,
          lastKnownTime:begin?lifecycleFrames[begin-1].time:null,firstKnownTime:i<lifecycleFrames.length?lifecycleFrames[i].time:null});
      }
    }
    for(let i=1;i<known.length;i++){
      const prev=known[i-1],curr=known[i],a=prev.s,b=curr.s,old=a.map.get(id),next=b.map.get(id);
      if(Object.is(old.contentVersion,next.contentVersion))continue;
      const unlocated={objectId:id,time:null,lastKnownTime:a.time,firstKnownTime:b.time,fromVersion:old.contentVersion,toVersion:next.contentVersion};
      if(curr.index!==prev.index+1){contentVersionCoverage.unresolvedChanges.push({...unlocated,reason:'identity not exposed between encoded-frame samples'});continue;}
      // Refine only a known, adjacent identity boundary; unknown or a third identity
      // encountered during refinement stays an interval, never a made-up exact time.
      let lo=a.time,hi=b.time,unresolved=false;
      for(let j=0;j<32;j++){
        const mid=(lo+hi)/2,version=read(mid).map.get(id).contentVersion;
        if(version===undefined||!Object.is(version,old.contentVersion)&&!Object.is(version,next.contentVersion)){
          identityGap(id,{start:lo,end:hi,probe:mid,reason:'unknown or additional identity between encoded frames'});
          contentVersionCoverage.unresolvedChanges.push({...unlocated,reason:'unknown or additional identity during boundary refinement'});unresolved=true;break;
        }
        if(Object.is(version,old.contentVersion))lo=mid;else hi=mid;
      }
      if(unresolved)continue;
      const time=Math.round(hi*1e9)/1e9,before=read(lo).map.get(id),after=read(hi).map.get(id);
      // Inspect visibility at the actual change, not an arbitrary future window.
      // A later reveal of prepared hidden content is an entry, not a visible text swap.
      if(!visible(before)&&!visible(after))continue;
      const matching=r=>r&&Object.is(r.fromVersion,old.contentVersion)&&Object.is(r.toVersion,next.contentVersion);
      const atBoundary=after.replacement;
      const context=lifecycleFrames.slice(Math.max(0,prev.index-1),Math.min(lifecycleFrames.length,curr.index+3));
      const rp=context.map(s=>s.map.get(id).replacement).filter(matching);
      const immediate=[a,b,lifecycleFrames[curr.index+1]].filter(Boolean).map(s=>s.map.get(id).replacement).filter(matching);
      // Require the process at the change itself AND changing in its neighboring
      // encoded interval. An effect starting later cannot excuse an earlier hard swap.
      const mechanism=matching(atBoundary)&&rp.length>=3&&rp.every(r=>r.kind===atBoundary.kind)&&
        immediate.length>=2&&range(immediate.map(r=>r.progress))>D1.processProgress&&
        range(rp.map(r=>r.progress))>D1.processProgress&&new Set(rp.map(r=>r.progress)).size>=3&&
        rp.some(r=>r.progress>D1.processProgress&&r.progress<1-D1.processProgress)?atBoundary.kind:null;
      const cut=sceneCutAt(time),m={objectId:id,time,lastOldSample:a.time,firstNewSample:b.time,fromVersion:old.contentVersion,toVersion:next.contentVersion,replacementMechanism:mechanism,sceneCut:cut?.id??null};
      replacementMeasurements.push(m);
      if(!mechanism&&!cut)findings.push({code:'content-replaced-without-process',severity:'review',...m,note:'The same node changes rendered content/identity without sampled replacement progress at that boundary. A later mechanism, alpha reset, parent travel or numerical noise cannot excuse the earlier swap. Check old last/new first visible pixels and the project DESIGN exception.'});
    }
  }
  for(const link of spec.sourceLinks??[]){
    const proof=evidenceFor(link.evidence,'sourceLink.'+link.id);
    if(d1Excluded.has(link.targetObjectId)){
      d1Classification.excludedSourceLinks.push({id:link.id,sourceObjectId:link.sourceObjectId,targetObjectId:link.targetObjectId,
        category:d1Excluded.get(link.targetObjectId),reason:'target is a consistently declared D1-excluded layer; not proof of source authenticity',...proof});continue;
    }
    const source=read(link.sourceTime??link.time).map.get(link.sourceObjectId);
    const first=lifecycleFrames.find(s=>s.time>=link.time&&visible(s.map.get(link.targetObjectId)));
    if(!first){coverageGaps.push('Source link target has no visible sample: '+link.id);continue;}
    const target=first.map.get(link.targetObjectId),sa=link.sourceAnchor??[.5,.5],ta=link.targetAnchor??[.5,.5];
    const from=[source.x+source.width*sa[0],source.y+source.height*sa[1]],to=[target.x+target.width*ta[0],target.y+target.height*ta[1]];
    const distancePx=Math.hypot(to[0]-from[0],to[1]-from[1]);
    const initial=read(link.time).map.get(link.targetObjectId),targetStartAnchor=[initial.x+initial.width*ta[0],initial.y+initial.height*ta[1]],startDistancePx=Math.hypot(targetStartAnchor[0]-from[0],targetStartAnchor[1]-from[1]);
    const m={id:link.id,sourceObjectId:link.sourceObjectId,targetObjectId:link.targetObjectId,sourceTime:link.sourceTime??link.time,firstTargetTime:first.time,from,to,distancePx,targetStartAnchor,startDistancePx,...proof};sourceLinkMeasurements.push(m);
    if(distancePx>1)findings.push({code:'source-origin-discontinuity',severity:'review',...m,note:'Declared same-location split/copy starts away from its actual source anchor. Sampling may include first-frame travel: inspect the boundary and any real visible transfer; distance is not a universal visual threshold.'});
  }
  // A static camera is not a violation. Report magnification and framing facts, not a shot quota.
  const cameraSamples=samples.filter(s=>s.frame.camera).map(s=>({time:s.time,...s.frame.camera}));
  const objectScale=spec.coverage.objectIds.map(id=>{
    const ps=samples.map(s=>({t:s.time,b:s.map.get(id)})).filter(x=>visible(x.b));
    return {id,visibleSamples:ps.length,widthFraction:ps.length?[Math.min(...ps.map(p=>p.b.width/spec.viewport.width)),Math.max(...ps.map(p=>p.b.width/spec.viewport.width))]:null,heightFraction:ps.length?[Math.min(...ps.map(p=>p.b.height/spec.viewport.height)),Math.max(...ps.map(p=>p.b.height/spec.viewport.height))]:null};
  });
  for(const lock of sourceLocks)if(sha(fs.readFileSync(lock.path))!==lock.sha256)throw Error('Source changed while sampling: '+lock.path);
  if(sha(fs.readFileSync(observationLock.path))!==observationLock.sha256)throw Error('Observation tool changed while sampling');
  if(videoLock&&sha(fs.readFileSync(videoLock.path))!==videoLock.sha256)throw Error('Video changed while sampling');
  processCoverage.status=processCoverage.actions.length?(processCoverage.unmeasuredPartIds.length||processCoverage.actions.some(a=>a.status!=='measured-change')?'partial':'declared-actions-measured'):processCoverage.exposedPartIds.length?'partial':'unexposed';
  const motionObservations=measureFrameMotion(samples.filter(s=>s.time<spec.duration),spec.coverage.objectIds,spec.viewport,spec.fps,spec.actions);
  const status=coverageGaps.length?'incomplete':findings.length?'findings':'measured-no-findings';
  return {schemaVersion:1,status,visualAcceptance:'not-assessed',basis:'engineering evaluation of final-screen render state; not decoded pixel tracking',coverage:spec.coverage,coverageGaps,actionCoverage,processCoverage,renderInventory,motionObservations,locks:{observationTool:observationLock,tool:fileLock(fileURLToPath(import.meta.url)),sources:sourceLocks,video:videoLock},measurementTolerances:{...EPS,d1:D1,basis:'numerical locator tolerances, not cross-project visual quality thresholds'},sampling:{fps:spec.fps,duration:spec.duration,renderFrameSamples:samples.length,lifecycleEncodedFrames:lifecycleFrames.length,lifecycleLastFrameTime:lifecycleFrames.at(-1).time,lifecycleEndExclusive:true,allEvaluations:cache.size,repeatSeeking:'checked on sampled times only'},findings,exceptions,notApplicable,lifecycle:lifecycleMeasurements,replacements:replacementMeasurements,sourceLinks:sourceLinkMeasurements,contentVersionCoverage,d1Classification,actions:actionMeasurements,checkpoints:checkpointMeasurements,relays:relayMeasurements,framing:{viewport:spec.viewport,objects:objectScale,camera:cameraSamples.length?{sampleCount:cameraSamples.length,zoomRange:[Math.min(...cameraSamples.map(c=>c.z)),Math.max(...cameraSamples.map(c=>c.z))],centerRange:{x:[Math.min(...cameraSamples.map(c=>c.cx)),Math.max(...cameraSamples.map(c=>c.cx))],y:[Math.min(...cameraSamples.map(c=>c.cy)),Math.max(...cameraSamples.map(c=>c.cy))]}}:null},requiredNext:['Inspect corresponding encoded frames and confirm adapter/source/video association.','Review reading, semantics, sound alignment and 1x perception separately. No finding is not visual approval.']};
}
const HELP=`node scripts/motion-audit.mjs --adapter <project/adapter.mjs> --out <project/new-audit.json>
Adapter exports exportAudit() returning schemaVersion 1, fps/duration/viewport, sourceFiles, videoFile, coverage, actual frameAt(seconds), and timeline-derived actions/checkpoints/relays. See schema comments in this file.
Frame objects MUST be final-screen {id,x,y,width,height,opacity,rotation?}; contentVersion identifies actual rendered text/identity (legacy frame.semantic[objectId] scalar supported). Optional localGeometry, process progress, and replacement {kind,progress,fromVersion,toVersion} must derive from production, not invented ramps; all coverage IDs must exist even while hidden. Camera is optional {cx,cy,z}. Never provide a second hand-authored state table.
Internal process actions reuse the production timeline: kind:'process', objectId, start/end, channels. x/y/width/height/rotation are read from production localGeometry; maskProgress/pathProgress/morphProgress/occlusionProgress from process. Component parentId names its actual covered container and localGeometry excludes that parent's transport. Missing local state, hidden-only changes or no visible internal change are incomplete coverage. processCoverage lists measured changes, exposed parts with no process action and unexposed scope; parameter movement does not certify semantics or perceptual strength. Optional actions[].motionGate:'anticipation', relays[].motionGate:'follow'|'rigid-feedback', and coverage.mainContentIds are reused by motion-gates; no separate motionCast promises are needed for these measurements.
Source and video are SHA-256 bound. Exceptions need kind plus evidence {sourceFile,anchor,reason} and remain human-review obligations.
Empty checkpoints/relays may declare coverage.notApplicable[group]={sourceFile,anchor,reason}; sources must be hash-bound and anchors must exist. Unsupported or contradictory waivers fail. No primary actions remains incomplete.
Per-channel uniformity is review-only; uniform-screen-motion tests combined final-screen bbox-point speeds for ordinary transfer/camera actions. Rotation-excluded intervals or insufficient consecutive visible samples are incomplete coverage, not a no-finding pass. Hidden/offscreen-only geometry cannot suppress a relay wait, while appearing/disappearing objects count as changes. Offscreen rotated bounds without a known pivot are visibility-unresolved and require review.
D1 object categories are mg/overlay/subtitle-cue/source-footage/data-readout via objects[].d1Category. Only consistent subtitle-cue/source-footage declarations skip all D1; data-readout skips content updates only and retains lifecycle/source-link checks. Missing/unknown/varying values keep all D1. d1Classification records full versus content-only exclusions, each check scope and excluded source-link targets; declarations do not prove authenticity. Source content and packaging overlays must use distinct object IDs. Other motion checks never inherit this exclusion. D1 samples encoded times [0,duration); the analytic EOF state is not another encoded frame. Partial content identity is incomplete coverage with unresolved intervals, not an exact replacement time. Tiny shape/progress noise cannot establish a process, and replacement progress must meet the actual identity boundary, not start afterward. D1 adds review-only opacity-only-lifecycle / instant-element-visibility and content-replaced-without-process findings. Tiny translations <=24px are a locator, not a quality threshold. Camera inversion is explicitly an inference; provide localGeometry to remove it. Retained dimming and evidence-bound scope:'scene' cuts are distinct from disappearance. Unexposed content identities are listed as uncovered; no finding cannot claim those were checked. sourceLinks optionally audit same-location split/copy origins with source evidence.
Exit 0: measured-no-findings in declared scope only; NOT visual pass. Exit 2: findings require repair or review. Exit 1: incomplete coverage or invalid inputs. Output is engineering sampling, NOT pixel tracking. No install or rendering.`;
async function main(){
  const args=process.argv.slice(2);if(args.includes('--help')){console.log(HELP);return;}
  let adapter,out;for(let i=0;i<args.length;i++){const k=args[i],v=args[++i];if(!v||v.startsWith('--'))throw Error('Missing argument '+k);if(k==='--adapter')adapter=v;else if(k==='--out')out=v;else throw Error('Unknown argument '+k);}
  if(!adapter||!out)throw Error('Require --adapter and --out');
  const file=fs.realpathSync(path.resolve(adapter)),mod=await import(pathToFileURL(file).href);
  const fn=mod.exportAudit??mod.default?.exportAudit;if(typeof fn!=='function')throw Error('Adapter must export exportAudit()');
  const result=auditMotion(await fn(),{baseDir:path.dirname(file),adapterFile:file});
  fs.writeFileSync(path.resolve(out),JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({status:result.status,findings:result.findings.length,coverageGaps:result.coverageGaps,output:path.resolve(out),visualAcceptance:result.visualAcceptance}));
  process.exitCode=result.status==='incomplete'?1:result.findings.length?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
