#!/usr/bin/env node
// MIT. Deterministic engineering samples, never pixel tracking or visual acceptance.
// Adapter exportAudit() returns this schema; intervals/IDs must derive from the render timeline.
// {schemaVersion:1,fps,duration,viewport:{width,height},sourceFiles:[path],videoFile:path,
//  coverage:{basis:'render-state-final-screen',objectIds:[id],scope:string,
//    notApplicable?:{checkpoints?:{sourceFile,anchor,reason},relays?:{sourceFile,anchor,reason}}},
//  frameAt(seconds):{objects:[{id,x,y,width,height,opacity,rotation?}],camera?:{cx,cy,z}},
//  actions:[{id,objectId,start,end,kind:'transfer'|'camera'|'realtime'|'reveal',channels?:[x|y|width|height|opacity],exception?}],
//  checkpoints:[{id,time,objectIds:[id],role:'pass'|'hold'|'cut',exception?}],
//  relays:[{id,fromAction,toAction,exception?}]}
// Exceptions: {kind:'reading'|'rhetorical'|'real-dependency'|'real-time'|'cut',
//              evidence:{sourceFile:path,anchor:exactSourceSubstring,reason:string}}
// They document attributable intent, not automatic proof of a necessary hold.
// Empty checkpoints/relays need coverage.notApplicable evidence or remain incomplete; actions cannot be waived.
// Constant individual channels are review clues. Ordinary transfer/camera hard findings use combined screen-point speeds.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const finite=(v,label)=>{if(!Number.isFinite(v))throw Error('Expected finite '+label);return v;};
const nonempty=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error('Missing '+label);return v;};
const uniq=(xs,label)=>{if(!Array.isArray(xs)||new Set(xs).size!==xs.length)throw Error('Invalid/duplicate '+label);return xs;};
const channels=['x','y','width','height','opacity','rotation'];
const EPS={positionPx:1e-5,velocity:1e-3,relative:1e-6,derivativeStep:1e-4,cruiseIntervals:6};
const bounds=b=>[b.x,b.y,b.width,b.height,b.opacity,b.rotation??0];
function viewportVisibility(b,viewport){
  if(b.opacity<=0||b.width<=0||b.height<=0)return 'hidden';
  if(b.x<viewport.width&&b.x+b.width>0&&b.y<viewport.height&&b.y+b.height>0)return 'visible';
  // The schema has no rotation pivot. Do not cull a rotated object using an unrotated rectangle.
  return Math.abs(b.rotation??0)>EPS.relative?'unresolved-rotation':'hidden';
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
  for(const a of s.actions){
    if(!ids.includes(a.objectId))throw Error('Action object not covered: '+a.id);
    if(!['transfer','camera','realtime','reveal'].includes(a.kind))throw Error('Unknown action kind '+a.id);
    finite(a.start,'action start');finite(a.end,'action end');if(a.start<0||a.end>s.duration||a.end<=a.start)throw Error('Invalid action range '+a.id);
    if(a.channels!==undefined&&(!Array.isArray(a.channels)||!a.channels.length||a.channels.some(c=>!(a.kind==='reveal'?['width','height','opacity']:['x','y','width','height']).includes(c))))throw Error('Invalid action channels '+a.id+'; reveal cannot exempt spatial translation');
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
  for(const r of s.relays)if(!aset.has(r.fromAction)||!aset.has(r.toAction)||r.fromAction===r.toAction)throw Error('Relay does not reference two actions: '+r.id);
}
export function auditMotion(spec,{baseDir=process.cwd(),adapterFile,requireVideo=true}={}){
  validateSpec(spec);
  const visibility=b=>viewportVisibility(b,spec.viewport),visible=b=>visibility(b)==='visible';
  const sameVisibleState=(a,b)=>!visible(a)&&!visible(b)||visible(a)&&visible(b)&&maxAbs(sub(bounds(a),bounds(b)))<=EPS.positionPx;
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
  if(spec.actions.length&&!spec.actions.some(a=>['transfer','camera'].includes(a.kind)))coverageGaps.push('Only reveal/realtime actions declared; primary movement is not covered');
  const cache=new Map();
  function read(t){
    finite(t,'sample time');const key=t.toPrecision(15);if(cache.has(key))return cache.get(key);
    if(t<0||t>spec.duration)throw Error('Sample outside duration');
    const frame=spec.frameAt(t);if(!frame||!Array.isArray(frame.objects))throw Error('Missing objects at '+t);
    uniq(frame.objects.map(o=>o.id),'sample object IDs');
    const map=new Map();
    for(const o of frame.objects){nonempty(o.id,'sample object id');for(const c of channels.slice(0,5))finite(o[c],`${o.id}.${c} at ${t}`);if(o.rotation!==undefined)finite(o.rotation,'rotation');if(o.width<0||o.height<0||o.opacity<0||o.opacity>1)throw Error('Invalid bounds/opacity at '+t);map.set(o.id,{...o,rotation:o.rotation??0});}
    for(const id of spec.coverage.objectIds)if(!map.has(id))throw Error('Covered object omitted at '+t+': '+id+'; retain its identity with opacity 0 if hidden');
    if(frame.camera){for(const k of ['cx','cy','z'])finite(frame.camera[k],'camera.'+k);if(frame.camera.z<=0)throw Error('Invalid camera scale');}
    const out={time:t,map,frame};cache.set(key,out);return out;
  }
  const samples=[];for(let f=0;f<=Math.floor(spec.duration*spec.fps);f++)samples.push(read(f/spec.fps));if(samples.at(-1).time!==spec.duration)samples.push(read(spec.duration));
  for(const id of spec.coverage.objectIds){
    const unresolved=samples.filter(s=>visibility(s.map.get(id))==='unresolved-rotation');
    if(unresolved.length)coverageGaps.push(`Rotation/viewport visibility unresolved for ${id}: ${unresolved[0].time}–${unresolved.at(-1).time}; provide final rotated bounds or inspect encoded frames`);
  }
  // Independent repeated/reverse seeking checks a stateful adapter without assuming sequential playback.
  for(const t of [spec.duration/2,0,spec.duration,.371*spec.duration].reverse()){
    const before=JSON.stringify(read(t).frame),again=JSON.stringify(spec.frameAt(t));if(before!==again)throw Error('Non-deterministic render adapter at '+t);
  }
  function actionPoints(a){
    const ts=[a.start,...samples.filter(s=>s.time>a.start&&s.time<a.end).map(s=>s.time),a.end];
    return ts.map(t=>({t,b:read(t).map.get(a.objectId)}));
  }
  const actionMeasurements=[];
  for(const a of spec.actions){
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
    const b=tt=>bounds(read(tt).map.get(id)),at=b(t);
    const L1=div(sub(at,b(t-h)),h),L2=div(sub(at,b(t-h/2)),h/2),R1=div(sub(b(t+h),at),h),R2=div(sub(b(t+h/2),at),h/2);
    return {left:L2.map((v,i)=>2*v-L1[i]),right:R2.map((v,i)=>2*v-R1[i]),h};
  }
  const checkpointMeasurements=[];
  for(const p of spec.checkpoints){
    const values=p.objectIds.map(id=>({id,sides:sides(id,p.time)}));
    const valid=values.filter(v=>v.sides&&visible(read(p.time).map.get(v.id)));
    if(!valid.length){coverageGaps.push('Checkpoint has no visible object with measurable states on both sides: '+p.id);continue;}
    const allStopped=valid.every(v=>maxAbs(v.sides.left)<EPS.velocity&&maxAbs(v.sides.right)<EPS.velocity);
    checkpointMeasurements.push({id:p.id,time:p.time,role:p.role,allCoveredObjectsStationaryAtNode:allStopped,objects:valid.map(({id,sides:s})=>({id,leftDerivative:s.left,rightDerivative:s.right,channels}))});
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
      m.unresolvedVisibilityObjectIds=spec.coverage.objectIds.filter(id=>ts.some(t=>visibility(read(t).map.get(id))==='unresolved-rotation'));
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
  // A static camera is not a violation. Report magnification and framing facts, not a shot quota.
  const cameraSamples=samples.filter(s=>s.frame.camera).map(s=>({time:s.time,...s.frame.camera}));
  const objectScale=spec.coverage.objectIds.map(id=>{
    const ps=samples.map(s=>({t:s.time,b:s.map.get(id)})).filter(x=>visible(x.b));
    return {id,visibleSamples:ps.length,widthFraction:ps.length?[Math.min(...ps.map(p=>p.b.width/spec.viewport.width)),Math.max(...ps.map(p=>p.b.width/spec.viewport.width))]:null,heightFraction:ps.length?[Math.min(...ps.map(p=>p.b.height/spec.viewport.height)),Math.max(...ps.map(p=>p.b.height/spec.viewport.height))]:null};
  });
  for(const lock of sourceLocks)if(sha(fs.readFileSync(lock.path))!==lock.sha256)throw Error('Source changed while sampling: '+lock.path);
  if(videoLock&&sha(fs.readFileSync(videoLock.path))!==videoLock.sha256)throw Error('Video changed while sampling');
  const status=coverageGaps.length?'incomplete':findings.length?'findings':'measured-no-findings';
  return {schemaVersion:1,status,visualAcceptance:'not-assessed',basis:'engineering evaluation of final-screen render state; not decoded pixel tracking',coverage:spec.coverage,coverageGaps,locks:{tool:fileLock(fileURLToPath(import.meta.url)),sources:sourceLocks,video:videoLock},measurementTolerances:{...EPS,basis:'numerical locator tolerances, not cross-project visual quality thresholds'},sampling:{fps:spec.fps,duration:spec.duration,renderFrameSamples:samples.length,allEvaluations:cache.size,repeatSeeking:'checked on sampled times only'},findings,exceptions,notApplicable,actions:actionMeasurements,checkpoints:checkpointMeasurements,relays:relayMeasurements,framing:{viewport:spec.viewport,objects:objectScale,camera:cameraSamples.length?{sampleCount:cameraSamples.length,zoomRange:[Math.min(...cameraSamples.map(c=>c.z)),Math.max(...cameraSamples.map(c=>c.z))],centerRange:{x:[Math.min(...cameraSamples.map(c=>c.cx)),Math.max(...cameraSamples.map(c=>c.cx))],y:[Math.min(...cameraSamples.map(c=>c.cy)),Math.max(...cameraSamples.map(c=>c.cy))]}}:null},requiredNext:['Inspect corresponding encoded frames and confirm adapter/source/video association.','Review reading, semantics, sound alignment and 1x perception separately. No finding is not visual approval.']};
}
const HELP=`node scripts/motion-audit.mjs --adapter <project/adapter.mjs> --out <project/new-audit.json>
Adapter exports exportAudit() returning schemaVersion 1, fps/duration/viewport, sourceFiles, videoFile, coverage, actual frameAt(seconds), and timeline-derived actions/checkpoints/relays. See schema comments in this file.
Frame objects MUST be final-screen {id,x,y,width,height,opacity,rotation?}; all coverage IDs must exist even while hidden. Camera is optional {cx,cy,z}. Never provide a second hand-authored state table.
Source and video are SHA-256 bound. Exceptions need kind plus evidence {sourceFile,anchor,reason} and remain human-review obligations.
Empty checkpoints/relays may declare coverage.notApplicable[group]={sourceFile,anchor,reason}; sources must be hash-bound and anchors must exist. Unsupported or contradictory waivers fail. No primary actions remains incomplete.
Per-channel uniformity is review-only; uniform-screen-motion tests combined final-screen bbox-point speeds for ordinary transfer/camera actions. Rotation-excluded intervals or insufficient consecutive visible samples are incomplete coverage, not a no-finding pass. Hidden/offscreen-only geometry cannot suppress a relay wait, while appearing/disappearing objects count as changes. Offscreen rotated bounds without a known pivot are visibility-unresolved and require review.
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
