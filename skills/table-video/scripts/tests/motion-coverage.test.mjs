import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const self=fileURLToPath(import.meta.url);
const dir=process.env.MOTION_TEST_DIR||path.resolve(path.dirname(self),'..');
const actualGates=await import(pathToFileURL(path.join(dir,'motion-gates.mjs')));
import {paintSamples,paintSpec} from './paint-fixture.mjs';
const gates={...actualGates,scoreFollow:(s,...args)=>actualGates.scoreFollow(paintSamples(s),...args),scoreComposition:(s,...args)=>actualGates.scoreComposition(paintSamples(s),...args),evaluateMotion:(s,...args)=>actualGates.evaluateMotion(paintSpec(s),...args)};
const {auditMotion:actualAudit}=await import(pathToFileURL(path.join(dir,'motion-audit.mjs')));
const auditMotion=(spec,options)=>actualAudit(paintSpec(spec),options);
// These fixtures explicitly paint an unobscured rectangle; do not generalize this proof to legacy adapters.
const box=(id,x=100,more={})=>({id,x,y:100,width:120,height:80,opacity:1,observation:{state:'visible',reason:'fixture-painted-rectangle'},...more});
const smooth=t=>3*t*t-2*t*t*t;
const follow=()=>[0,.2,.3,.4,.5].map(t=>({t,frame:{objects:[box('hero',100+(t>=.2?30:0)),box('tag',300+(t>=.3?20:0))]}}));
const beat={id:'follow',subjectId:'hero',attachmentId:'tag'};
test('hidden and offscreen component motion cannot satisfy a visible follow timing check',()=>{
  for(const invis of [{opacity:0},{y:2000}]){
    const samples=follow();for(const s of samples)s.frame.objects[1]={...s.frame.objects[1],...invis};
    assert.notEqual(gates.scoreFollow(samples,beat).status,'通过');
  }
});
test('one object cannot follow itself and legacy delay never asserts a causal relationship',()=>{
  assert.notEqual(gates.scoreFollow(follow(),{...beat,attachmentId:'hero',rigid:true}).status,'通过');
  const r=gates.scoreFollow(follow(),beat);
  assert.equal(r.status,'通过');
  assert.equal(r.relationship,'not-assessed');
  assert.equal(r.visualAcceptance,'not-assessed');
});
test('container or camera transport cannot substitute for part-local follow motion',()=>{
  const samples=follow();for(const s of samples){s.frame.objects[1].parentId='hero';s.frame.objects[1].localGeometry={x:5,y:5,width:120,height:80};}
  assert.notEqual(gates.scoreFollow(samples,beat).status,'通过');
});
test('a short stable narrow composition cannot be hidden by a wide median',()=>{
  const samples=Array.from({length:10},(_,i)=>({t:i/10,frame:{objects:[box('main',100,{width:i>=4&&i<=6?600:1400})]}}));
  const r=gates.scoreComposition(samples,{mainContentIds:['main']});
  assert.equal(r.status,'诊断');assert(r.measured.narrowIntervals.length);
});
// fixture process evidence: no checkpoint/relay in this isolated process measurement
const evidence={sourceFile:self,anchor:'fixture process evidence',reason:'A single internal process has no pass/hold/cut or handoff node.'};
function processSpec({local=true,change=true,hidden=false,progress=false}={}){
  return {schemaVersion:1,fps:60,duration:1,viewport:{width:1920,height:1080},sourceFiles:[self],
    coverage:{basis:'render-state-final-screen',objectIds:['panel','row'],mainContentIds:['panel'],scope:'Actual component state fixture',notApplicable:{checkpoints:evidence,relays:evidence}},
    frameAt:t=>({objects:[box('panel',100+400*smooth(t),{width:1400}),box('row',110+400*smooth(t),{parentId:'panel',opacity:hidden?0:1,...(local?{localGeometry:{x:10,y:10,width:120,height:change?20+60*smooth(t):80}}:{}),...(progress?{process:{maskProgress:change?smooth(t):0}}:{})})]}),
    actions:[{id:'unfold',objectId:'row',start:0,end:1,kind:'process',channels:[progress?'maskProgress':'height']}],checkpoints:[],relays:[]};
}
test('process actions measure actual internal state and expose source locks',()=>{
  const r=auditMotion(processSpec(),{requireVideo:false});
  assert.equal(r.visualAcceptance,'not-assessed');assert.equal(r.processCoverage.actions[0].status,'measured-change');
  assert(r.processCoverage.actions[0].channels.height.range>59);
  assert(r.locks.sources.some(s=>s.path===self&&s.sha256.length===64));
});
test('parent-only transport, hidden motion and absent local state leave internal work uncovered',()=>{
  for(const options of [{change:false},{hidden:true},{local:false}]){
    const r=auditMotion(processSpec(options),{requireVideo:false});
    assert.equal(r.status,'incomplete');assert(r.coverageGaps.length);assert.notEqual(r.processCoverage.actions[0].status,'measured-change');
  }
});
test('actual mask progress is measured but an invented static label is no internal process',()=>{
  const measured=auditMotion(processSpec({local:false,progress:true}),{requireVideo:false});
  assert.equal(measured.processCoverage.actions[0].status,'measured-change');
  const missing=auditMotion(processSpec({local:false,progress:true,change:false}),{requireVideo:false});
  assert.equal(missing.status,'incomplete');
});
test('returned internal parts with no process action are explicitly uncovered',()=>{
  const s=processSpec();s.actions=[{id:'transport',objectId:'panel',start:0,end:1,kind:'transfer'}];
  const r=auditMotion(s,{requireVideo:false});
  assert.deepEqual(r.processCoverage.unmeasuredPartIds,['row']);
  assert.equal(r.processCoverage.status,'partial');
});
test('new action and relay gate marks reuse production IDs and times rather than motionCast substitutes',()=>{
  const s=processSpec();s.actions.push({id:'body',objectId:'panel',start:.1,end:.7,kind:'transfer',motionGate:'anticipation'});
  s.relays=[{id:'handoff',fromAction:'body',toAction:'unfold',motionGate:'follow'}];delete s.coverage.notApplicable.relays;
  const cast=gates.deriveMotionCast(s);
  assert.equal(cast.origin.follows,'timeline-relays');assert.equal(cast.follows[0].subjectId,'panel');assert.equal(cast.follows[0].attachmentId,'row');
  assert.equal(cast.anticipations[0].t0,.1);assert.deepEqual(cast.mainContentIds,['panel']);
});
test('visible objects omitted from coverage are caught outside reveal-only adapters too',()=>{
  const s=processSpec(),at=s.frameAt;s.frameAt=t=>({...at(t),objects:[...at(t).objects,box('omitted-label')]});
  const r=auditMotion(s,{requireVideo:false});
  assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(x=>x.includes('omitted-label')));
});
test('analytic EOF or between-frame process changes do not count as encoded component work',()=>{
  for(const pulse of [t=>t===1?1:0,t=>t>.503&&t<.509?1:0]){
    const s=processSpec({progress:true}),at=s.frameAt;
    s.frameAt=t=>{const f=at(t);f.objects[1].process.maskProgress=pulse(t);return f;};
    const r=auditMotion(s,{requireVideo:false});assert.equal(r.processCoverage.actions[0].status,'unmeasured');
  }
});
test('active internal progress prevents false common-stop and empty-wait findings',()=>{
  const s=processSpec({progress:true}),at=s.frameAt;
  s.frameAt=t=>{const f=at(t);f.objects[0].x=100;f.objects[1].x=110;return f;};
  s.actions.push({id:'before',objectId:'panel',kind:'transfer',start:0,end:.2},{id:'after',objectId:'panel',kind:'transfer',start:.8,end:1});
  s.checkpoints=[{id:'inside-unfold',time:.5,objectIds:['row'],role:'pass'}];
  s.relays=[{id:'across-unfold',fromAction:'before',toAction:'after'}];s.coverage.notApplicable={};
  const r=auditMotion(s,{requireVideo:false});
  assert(!r.findings.some(f=>f.code==='pass-node-common-stop'));
  assert(!r.findings.some(f=>f.code==='relay-empty-wait'));
});
test('combined entry binds production audit sources and exposes internal scope without visual approval',()=>{
  const s=processSpec(),r=gates.evaluateMotion(s,{freeze:{duration:1,segments:[]},adapterFile:self,requireVideo:false});
  assert.equal(r.coverage.mode,'production-audit');assert.equal(r.visualAcceptance,'not-assessed');
  assert.equal(r.coverage.internalProcess.actions[0].status,'measured-change');
  assert.equal(r.locks.sources.find(f=>f.path===self).sha256.length,64);
  const hard=gates.evaluateMotion(s,{freeze:{duration:1,segments:[{start:0,end:1,duration:1}]},requireVideo:false});
  assert.equal(hard.exitCode,2);assert.equal(hard.gates[0].status,'未通过');
});
test('a mismatched supplied video is an incomplete audit, never a source-bound success',()=>{
  const s=processSpec();s.videoFile=self;
  const r=gates.evaluateMotion(s,{video:path.join(dir,'motion-audit.mjs'),requireVideo:true});
  assert.equal(r.engineeringAudit.status,'incomplete');assert(r.engineeringAudit.coverageGaps.some(x=>x.includes('videoFile')));
});
test('hidden or offscreen main-content staging cannot suppress a stable narrow display',()=>{
  for(const hidden of [{opacity:0},{y:2000}]){
    const comp=moving=>Array.from({length:31},(_,i)=>{const t=i/30;return {t,frame:{objects:[box('main',100,{width:t<.5?1400:600}),box('staged',moving&&t>=.5?100+t*100:100,hidden)]}};});
    const still=gates.scoreComposition(comp(false),{mainContentIds:['main','staged']});
    const staging=gates.scoreComposition(comp(true),{mainContentIds:['main','staged']});
    assert.equal(still.status,'诊断');assert.equal(staging.status,'诊断');
    assert.deepEqual(staging.measured.narrowIntervals,still.measured.narrowIntervals);
  }
});
test('a timeline relay ignores unrelated attachment movement before its actual toAction',()=>{
  const s={fps:60,duration:3,viewport:{width:1920,height:1080},coverage:{objectIds:['hero','tail']},actions:[{id:'hero-event',objectId:'hero',start:1,end:1.4},{id:'tail-event',objectId:'tail',start:2,end:2.4}],relays:[{id:'relay',fromAction:'hero-event',toAction:'tail-event',motionGate:'follow'}]};
  const b=gates.deriveMotionCast(s).follows[0],ramp=(t,a,z)=>Math.max(0,Math.min(1,(t-a)/(z-a)));
  const sample=early=>Array.from({length:Math.round((b.t1-b.t0)*60)+1},(_,i)=>{const t=b.t0+i/60;return {t,frame:{objects:[box('hero',100+100*ramp(t,1,1.4)),box('tail',300+(early?20*ramp(t,1.1,1.3):0)+100*ramp(t,2,2.4))]}};});
  assert.equal(gates.scoreFollow(sample(false),b).status,'未通过');
  assert.equal(gates.scoreFollow(sample(true),b).status,'未通过');
  // A correctly timed action still passes using those same production ranges.
  s.actions[1].start=1.1;s.actions[1].end=1.4;
  const good=gates.deriveMotionCast(s).follows[0];
  assert.equal(gates.scoreFollow(sample(true),good).status,'通过');
});
test('source, adapter and video locks cover the first numeric sample through the final audit',()=>{
  const output=process.env.MOTION_REPORT_DIR||(process.env.TABLE_VIDEO_TEST_OUTPUT&&path.join(process.env.TABLE_VIDEO_TEST_OUTPUT,'motion-coverage-tests'))||path.resolve(path.dirname(self),'../../../reports/motion-coverage-tests');fs.mkdirSync(output,{recursive:true});
  for(const kind of ['source','adapter','video']){
    const fixture=fs.mkdtempSync(path.join(output,'binding-')),files=Object.fromEntries(['source','adapter','video'].map(k=>[k,path.join(fixture,k+'.txt')]));
    for(const file of Object.values(files))fs.writeFileSync(file,'old-version');
    const s=processSpec(),at=s.frameAt;let count=0;s.sourceFiles.push(files.source);s.videoFile=files.video;
    s.frameAt=t=>{if(++count===10)fs.writeFileSync(files[kind],'new-version');return at(t);};
    const r=gates.evaluateMotion(s,{adapterFile:files.adapter,video:files.video,freeze:{duration:1,segments:[]}});
    assert.equal(r.engineeringAudit.status,'incomplete');
    assert(r.engineeringAudit.coverageGaps.some(x=>/Source changed|Video changed|Adapter changed/.test(x)),kind);
    assert.equal(r.exitCode,1);assert(r.gates.every(g=>g.status==='无法测量'));
    const locked=kind==='video'?r.locks.video:r.locks.sources.find(x=>x.path===files[kind]);
    assert.equal(locked.sha256,crypto.createHash('sha256').update('old-version').digest('hex'));
  }
});
