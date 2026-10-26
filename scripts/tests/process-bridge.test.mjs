import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditMotion} from '../motion-audit.mjs';
import {locate} from '../process-locate.mjs';
const self=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(self),'../..');
const smooth=t=>t<=0?0:t>=1?1:3*t*t-2*t*t*t;
const box=(id,x=0,y=0)=>({id,x,y,width:120,height:80,opacity:1});
const exception=(kind)=>({kind,evidence:{sourceFile:self,anchor:'fixture intent evidence',reason:'Fixture verifies an attributable exception, not arbitrary text bypass.'}});
// fixture intent evidence: necessary reading / true clock progression / explicit cut
function spec(frameAt,duration=2){return {schemaVersion:1,fps:60,duration,viewport:{width:1920,height:1080},sourceFiles:[self],coverage:{basis:'render-state-final-screen',objectIds:['main'],scope:'Fixture only; not a visual example'},frameAt,actions:[{id:'a',objectId:'main',start:0,end:duration,kind:'transfer'}],checkpoints:[{id:'middle',time:duration/2,objectIds:['main'],role:'pass'}],relays:[{id:'same-object-relay',fromAction:'a',toAction:'b'}]};}
function run(s){if(!s.actions.some(a=>a.id==='b'))s.actions.push({id:'b',objectId:'main',start:s.duration*.8,end:s.duration,kind:'transfer'});return auditMotion(s,{requireVideo:false});}
test('relation matching includes actual EP05/D04/v4 sources and executable source states',()=>{
  const found=locate({root,relation:'处理,比较',sample:true});
  assert(found.processes.some(p=>p.id.startsWith('ep05-d04')));
  assert(found.processes.some(p=>p.id.startsWith('ep05-d06')));
  assert(found.processes.some(p=>p.id.startsWith('relay-v4')));
  for(const p of found.processes){assert.equal(p.samples.length,3);assert(p.implementation.every(f=>fs.existsSync(f.absolutePath)&&f.sha256.length===64));}
});
test('whole-topic mismatch cannot silently claim a source match',()=>assert.throws(()=>locate({root,relation:'unmatched topic'}),/No local causal/));
test('actual 8.15–9.25 linear x with curved y is detected',()=>{
  const s=spec(t=>({objects:[box('main',t<8.15?0:t>9.25?685.3:(t-8.15)*623,40*Math.sin(Math.PI*Math.max(0,Math.min(1,(t-8.15)/1.1))))]}),10);
  s.actions=[{id:'a',objectId:'main',start:8.15,end:9.25,kind:'transfer'}];s.checkpoints[0].time=9;
  const r=run(s);assert(r.findings.some(f=>f.code==='uniform-screen-channel'&&f.severity==='review'&&f.channel==='x'&&Math.abs(f.velocityPxPerSecond-623)<1e-7));
  assert(!r.findings.some(f=>f.code==='uniform-screen-motion'&&f.action==='a'));
});
test('short eased ends do not hide interior uniform cruise',()=>{
  const f=t=>t<.2?250*t*t:t<1.8?10+100*(t-.2):170+100*(t-1.8)-250*(t-1.8)**2;
  const r=run(spec(t=>({objects:[box('main',f(t))]})));
  assert(r.findings.some(f=>f.code==='uniform-screen-channel'&&f.start>=.19&&f.end<=1.81));
  assert(r.findings.some(f=>f.code==='uniform-screen-motion'&&f.severity==='constraint-violation'&&f.start>=.19&&f.end<=1.81));
});
test('smooth nonlinear displacement is not labeled uniform',()=>{
  const r=run(spec(t=>({objects:[box('main',600*smooth(t/2))]})));
  assert(!r.findings.some(f=>f.code==='uniform-screen-channel'));assert.equal(r.visualAcceptance,'not-assessed');
});
test('two individually smooth steps still stop together at a pass node',()=>{
  const r=run(spec(t=>({objects:[box('main',t<1?300*smooth(t):300+300*smooth(t-1))]})));
  assert(r.findings.some(f=>f.code==='pass-node-common-stop'));
});
test('4.4 start-speed jump is measured on both sides',()=>{
  const s=spec(t=>({objects:[box('main',t<4.4?0:400*(1-Math.exp(-4*(t-4.4))))]}),5);
  s.checkpoints[0].time=4.4;const r=run(s);assert(r.findings.some(f=>f.code==='node-velocity-discontinuity'&&f.time===4.4));
});
test('camera cancellation is assessed after composition, not by world movement',()=>{
  const s=spec(t=>({objects:[box('main',100+400*smooth(t/2)-400*smooth(t/2))],camera:{cx:400*smooth(t/2),cy:0,z:1}}));
  const r=run(s);assert(r.findings.some(f=>f.code==='pass-node-common-stop'));assert.equal(r.actions[0].endpointDisplacementPx,0);
});
test('real clock motion requires attributable source and remains visible as exception',()=>{
  const s=spec(t=>({objects:[box('main',100*t)]}));s.actions.forEach(a=>{a.kind='realtime';a.exception=exception('real-time');});
  s.actions.push({id:'b',objectId:'main',start:1.8,end:2,kind:'realtime',exception:exception('real-time')});
  const r=run(s);assert(!r.findings.some(f=>f.code.startsWith('uniform-screen-')));assert.equal(r.exceptions.length,2);
  s.actions[0].exception={kind:'real-time',evidence:{sourceFile:self,anchor:['NONEXISTENT','ANCHOR'].join(' '),reason:'excuse'}};
  assert.throws(()=>run(s),/anchor missing/);
});
test('necessary reading hold is recorded, not condemned as pass or auto-approved',()=>{
  const s=spec(t=>({objects:[box('main',t<.5?300*smooth(t*2):t>1.5?300+300*smooth((t-1.5)*2):300)]}));
  s.actions=[{id:'a',objectId:'main',start:0,end:.5,kind:'transfer'},{id:'b',objectId:'main',start:1.5,end:2,kind:'transfer'}];
  s.checkpoints[0]={...s.checkpoints[0],role:'hold',exception:exception('reading')};s.relays[0].exception=exception('reading');
  const r=run(s);assert(!r.findings.some(f=>['pass-node-common-stop','relay-empty-wait'].includes(f.code)));assert.equal(r.relays[0].measuredAllCoveredStatic,true);assert(r.exceptions.every(e=>e.status.includes('requires')));
});
test('undeclared empty wait between causal actions is flagged',()=>{
  const s=spec(t=>({objects:[box('main',t<.5?300*smooth(t*2):t>1.5?300+300*smooth((t-1.5)*2):300)]}));
  s.actions=[{id:'a',objectId:'main',start:0,end:.5,kind:'transfer'},{id:'b',objectId:'main',start:1.5,end:2,kind:'transfer'}];
  assert(run(s).findings.some(f=>f.code==='relay-empty-wait'));
});
test('empty actions/checkpoints/relays produce incomplete, never pass',()=>{
  const s=spec(t=>({objects:[box('main',t)]}));s.actions=[];s.checkpoints=[];s.relays=[];
  assert.equal(auditMotion(s,{requireVideo:false}).status,'incomplete');
});
test('missing covered object and NaN are rejected',()=>{
  assert.throws(()=>run(spec(()=>({objects:[]}))),/omitted/);
  assert.throws(()=>run(spec(()=>({objects:[box('main',NaN)]}))),/finite/);
});
test('delivery needs actual video lock and source lock',()=>{
  const s=spec(t=>({objects:[box('main',t)]}));s.actions.push({id:'b',objectId:'main',start:1.8,end:2,kind:'transfer'});
  assert.throws(()=>auditMotion(s),/videoFile/);
  // The hash function is deliberately independent of decoding. Media validation is not claimed.
  s.videoFile=self;const r=auditMotion(s);assert.equal(r.locks.video.sha256.length,64);assert.equal(r.locks.sources[0].sha256.length,64);
});
test('fixed-composition opacity reveal is measured without requiring a spatial trajectory',()=>{
  const s=spec(t=>({objects:[{...box('main'),opacity:t/2}]}));s.actions=[{id:'a',objectId:'main',start:0,end:2,kind:'reveal',channels:['opacity']},{id:'b',objectId:'main',start:1.8,end:2,kind:'reveal',channels:['opacity']}];
  const r=run(s);assert(!r.findings.some(f=>f.code==='uniform-screen-channel'));assert.equal(r.actions[0].channels.opacity.unit,'fraction');assert.equal(r.status,'findings');assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'&&f.severity==='review'));assert.equal(r.visualAcceptance,'not-assessed');
});
test('invisible moving layers cannot hide a visible common stop',()=>{
  const s=spec(t=>({objects:[box('main',t<1?300*smooth(t):300+300*smooth(t-1)),{...box('hidden',t*100),opacity:0}]}));s.coverage.objectIds.push('hidden');s.checkpoints[0].objectIds.push('hidden');
  assert(run(s).findings.some(f=>f.code==='pass-node-common-stop'));
});
test('relabeling a transfer as reveal cannot exempt its x/y motion',()=>{
  const s=spec(t=>({objects:[box('main',100*t)]}));s.actions[0].kind='reveal';s.actions[0].channels=['x'];assert.throws(()=>run(s),/reveal cannot exempt/);
});
test('all indexed relation sources have valid anchors and real executable samples',()=>{
  const index=JSON.parse(fs.readFileSync(path.join(root,'assets/motion/process-index.json'),'utf8'));
  for(const p of index.processes){const result=locate({root,id:p.id,sample:true});assert.equal(result.processes[0].samples.length,3);}
});
test('stateful evaluation and invalid realtime bypass are rejected',()=>{
  let n=0;assert.throws(()=>run(spec(()=>({objects:[box('main',++n)]}))),/Non-deterministic/);
  const s=spec(t=>({objects:[box('main',t)]}));s.actions[0].kind='realtime';assert.throws(()=>run(s),/requires attributable/);
});

// fixture scope evidence: this isolated action has no passage node or causal handoff.
const scopeEvidence=()=>({sourceFile:self,anchor:'fixture scope evidence',reason:'This isolated fixture contains one complete action and no internal joins or causal handoffs.'});
function standalone(frameAt,duration=1,withScope=true){
  const s=spec(frameAt,duration);s.checkpoints=[];s.relays=[];
  if(withScope)s.coverage.notApplicable={checkpoints:scopeEvidence(),relays:scopeEvidence()};
  return s;
}
function gapFixture(hiddenAt){
  const s=spec(t=>({objects:[box('main',t<.5?300*smooth(t*2):t>1.5?300+300*smooth((t-1.5)*2):300),hiddenAt(t)]}));
  s.coverage.objectIds.push('hidden');
  s.actions=[{id:'a',objectId:'main',start:0,end:.5,kind:'transfer'},{id:'b',objectId:'main',start:1.5,end:2,kind:'transfer'}];
  s.checkpoints[0].time=.25;
  return s;
}
test('hidden-only coordinate changes cannot erase an otherwise identical relay wait',()=>{
  for(const hiddenAt of [t=>({...box('hidden'),opacity:0}),t=>({...box('hidden',t*100),opacity:0}),t=>({...box('hidden',t*100),width:0})]){
    const r=auditMotion(gapFixture(hiddenAt),{requireVideo:false});
    assert.equal(r.relays[0].declaredGapSeconds,1);
    assert.equal(r.relays[0].measuredAllCoveredStatic,true);
    assert(r.findings.some(f=>f.code==='relay-empty-wait'));
  }
});
test('genuine appearance, disappearance and visible movement remain relay changes',()=>{
  for(const hiddenAt of [t=>({...box('hidden'),opacity:smooth((t-.5))}),t=>({...box('hidden'),opacity:1-smooth((t-.5))}),t=>box('hidden',t*100)]){
    const r=auditMotion(gapFixture(hiddenAt),{requireVideo:false});
    assert.equal(r.relays[0].measuredAllCoveredStatic,false);
    assert(!r.findings.some(f=>f.code==='relay-empty-wait'));
  }
});
test('one complete eased action can explicitly document inapplicable node and relay checks',()=>{
  const r=auditMotion(standalone(t=>({objects:[box('main',300*smooth(t))]})),{requireVideo:false});
  assert.equal(r.status,'measured-no-findings');assert.equal(r.coverageGaps.length,0);
  assert.equal(r.actions[0].visibleSampleCount,61);assert.equal(r.notApplicable.length,2);
  assert(r.notApplicable.every(n=>n.status==='attributed-not-applicable-requires-scope-review'));
  assert.equal(r.visualAcceptance,'not-assessed');
});
test('missing node and relay evidence still reports incomplete, and primary actions cannot be waived',()=>{
  const s=standalone(t=>({objects:[box('main',300*smooth(t))]}),1,false);
  const r=auditMotion(s,{requireVideo:false});assert.equal(r.status,'incomplete');assert.equal(r.coverageGaps.length,2);
  s.coverage.notApplicable={checkpoints:scopeEvidence(),relays:scopeEvidence()};s.actions=[];
  assert.equal(auditMotion(s,{requireVideo:false}).status,'incomplete');
  s.coverage.notApplicable.actions=scopeEvidence();assert.throws(()=>auditMotion(s,{requireVideo:false}),/only supported/);
});
test('not-applicable claims reject strings, missing anchors, unbound sources and nonempty groups',()=>{
  const make=()=>standalone(t=>({objects:[box('main',300*smooth(t))]}));
  let s=make();s.coverage.notApplicable.checkpoints='not needed';assert.throws(()=>auditMotion(s,{requireVideo:false}),/evidence reason/);
  s=make();s.coverage.notApplicable.checkpoints.anchor=['MISSING','SCOPE','ANCHOR'].join('-');assert.throws(()=>auditMotion(s,{requireVideo:false}),/anchor missing/);
  s=make();s.coverage.notApplicable.checkpoints.sourceFile=path.join(root,'scripts/motion-audit.mjs');assert.throws(()=>auditMotion(s,{requireVideo:false}),/not hash-bound/);
  s=make();s.checkpoints=[{id:'real-node',time:.5,role:'pass',objectIds:['main']}];assert.throws(()=>auditMotion(s,{requireVideo:false}),/must be empty/);
});
test('a constant x on a strongly accelerating arc is a clue, not a hard uniform-motion violation',()=>{
  const s=standalone(t=>({objects:[box('main',100+100*t,100+200*t*t)]}),2);
  const r=auditMotion(s,{requireVideo:false});
  assert(r.findings.some(f=>f.code==='uniform-screen-channel'&&f.channel==='x'&&f.severity==='review'));
  assert(!r.findings.some(f=>f.severity==='constraint-violation'));
  const speed=r.actions[0].compositeSpeed;assert(speed.minVelocity<101);assert(speed.maxVelocity>800);
});
test('true uniform diagonal translation remains a hard ordinary-motion finding',()=>{
  const r=auditMotion(standalone(t=>({objects:[box('main',100*t,200*t)]})),{requireVideo:false});
  const finding=r.findings.find(f=>f.code==='uniform-screen-motion');assert(finding);
  assert.equal(finding.severity,'constraint-violation');assert.equal(finding.rule,'ordinary-visual-nonuniform');
  assert(Math.abs(finding.speedPxPerSecond-Math.hypot(100,200))<1e-6);
});
test('a fixed corner cannot hard-fail otherwise accelerating scale',()=>{
  const r=auditMotion(standalone(t=>({objects:[{...box('main'),width:120+200*t*t,height:80+100*t*t}]})),{requireVideo:false});
  assert(!r.findings.some(f=>f.code==='uniform-screen-motion'));
  assert(r.actions[0].compositeSpeed.maxVelocity>10*r.actions[0].compositeSpeed.minVelocity);
});
test('uniform scale with one fixed corner is still measured from the other points',()=>{
  const r=auditMotion(standalone(t=>({objects:[{...box('main'),width:120+200*t,height:80+100*t}]})),{requireVideo:false});
  assert(r.findings.some(f=>f.code==='uniform-screen-motion'&&f.severity==='constraint-violation'));
});
test('rotation-changing bounds do not pretend to reconstruct uniform material-point motion',()=>{
  const r=auditMotion(standalone(t=>({objects:[{...box('main',100*t),rotation:90*t*t}]})),{requireVideo:false});
  assert(r.findings.some(f=>f.code==='uniform-screen-channel'));
  assert(!r.findings.some(f=>f.code==='uniform-screen-motion'));
  assert.equal(r.actions[0].compositeSpeed.visibleIntervals,0);
});


test('rotating nonlinear motion with all composite intervals excluded is incomplete, not no-findings',()=>{
  const r=auditMotion(standalone(t=>({objects:[{...box('main',500+100*Math.cos(t),500+100*Math.sin(t)),rotation:t}]})),{requireVideo:false});
  assert.equal(r.status,'incomplete');assert.equal(r.findings.length,0);
  assert.equal(r.actions[0].compositeSpeed.visibleIntervals,0);
  assert.equal(r.actions[0].compositeSpeed.minVelocity,null);
  assert.deepEqual(r.actions[0].compositeSpeed.rotationExcludedRanges,[{start:0,end:1,intervals:60}]);
  assert(r.coverageGaps.some(g=>g.includes('rotation-changing')));
});

test('a partially rotated action retains measured intervals and exposes its uncovered range',()=>{
  const r=auditMotion(standalone(t=>({objects:[{...box('main',300*smooth(t),100),rotation:t<=.5?0:t-.5}]})),{requireVideo:false});
  assert.equal(r.status,'incomplete');assert.equal(r.actions[0].compositeSpeed.visibleIntervals,30);
  assert.deepEqual(r.actions[0].compositeSpeed.rotationExcludedRanges,[{start:.5,end:1,intervals:30}]);
});

test('isolated or too-short visible samples cannot claim complete trajectory coverage',()=>{
  for(const opacity of [t=>t===0?1:0,t=>Math.round(t*60)%2===0?1:0,t=>t<=5/60?1:0]){
    const r=auditMotion(standalone(t=>({objects:[{...box('main',300*smooth(t),100),opacity:opacity(t)}]})),{requireVideo:false});
    assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('Insufficient consecutive visible')));
  }
  const r=auditMotion(standalone(t=>({objects:[{...box('main',300*smooth(t),100),opacity:t<=6/60?1:0}]})),{requireVideo:false});
  assert.equal(r.actions[0].compositeSpeed.maxContiguousIntervals,6);
  assert.equal(r.status,'findings');assert(r.findings.some(f=>f.code==='instant-element-visibility'));assert.equal(r.visualAcceptance,'not-assessed');
});

test('fully offscreen movement on any side cannot erase a visible relay wait',()=>{
  for(const offscreen of [t=>box('hidden',3000+100*t,100),t=>box('hidden',-500-100*t,100),t=>box('hidden',100,-500-100*t),t=>box('hidden',100,2000+100*t),t=>box('hidden',1920,100*t)]){
    const r=auditMotion(gapFixture(offscreen),{requireVideo:false});
    assert.equal(r.relays[0].measuredAllCoveredStatic,true);
    assert(r.findings.some(f=>f.code==='relay-empty-wait'));
  }
});

test('crossing the viewport boundary is a genuine relay change',()=>{
  for(const entering of [t=>box('hidden',2000-200*t,100),t=>box('hidden',1800+200*t,100)]){
    const r=auditMotion(gapFixture(entering),{requireVideo:false});
    assert.equal(r.relays[0].measuredAllCoveredStatic,false);
    assert(!r.findings.some(f=>f.code==='relay-empty-wait'));
  }
});

test('rotated bounds near the viewport are unresolved instead of incorrectly culled',()=>{
  const r=auditMotion(gapFixture(t=>({...box('hidden',1925+10*t,500),rotation:90})),{requireVideo:false});
  assert.equal(r.status,'incomplete');assert.equal(r.relays[0].measuredAllCoveredStatic,null);
  assert.deepEqual(r.relays[0].unresolvedVisibilityObjectIds,['hidden']);
  assert(r.coverageGaps.some(g=>g.includes('Rotation/viewport visibility unresolved')));
  assert(!r.findings.some(f=>f.code==='relay-empty-wait'));
});

function fadeOnly(frameAt=t=>({objects:[{...box('main',100,100),opacity:smooth(t)}]})){
  const s=standalone(frameAt);s.actions[0].kind='reveal';s.actions[0].channels=['opacity'];return s;
}
test('a real fixed-composition fade with attributed inapplicable joins has complete applicable coverage',()=>{
  const r=auditMotion(fadeOnly(),{requireVideo:false});
  assert.equal(r.status,'findings');assert.deepEqual(r.coverageGaps,[]);assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'));
  assert.equal(r.notApplicable.length,2);assert.equal(r.actions[0].channels.opacity.range,1);
  assert.equal(r.visualAcceptance,'not-assessed');assert(r.requiredNext.some(n=>n.includes('1x')));
});
test('reveal labels cannot conceal sampled translation, size or rotation changes',()=>{
  for(const change of [t=>({x:100+100*t}),t=>({width:120+100*t}),t=>({rotation:90*t})]){
    const r=auditMotion(fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t),...change(t)}]})),{requireVideo:false});
    assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('sampled visible translation, size or rotation')));
  }
});
test('reveal-only checks the full sampled composition, not merely the fading object',()=>{
  const s=fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t)},box('other',500+100*t,100)]}));s.coverage.objectIds.push('other');
  const r=auditMotion(s,{requireVideo:false});assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('spatial movement is not covered')));
});
test('reveal-only does not claim no spatial motion when visible objects are omitted from coverage',()=>{
  const r=auditMotion(fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t)},box('uncovered',500,100)]})),{requireVideo:false});
  assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('outside coverage: uncovered')));
});
test('reveal-only cannot conceal camera motion behind fixed final-screen object coordinates',()=>{
  for(const camera of [t=>({cx:t*100,cy:0,z:1}),t=>({cx:0,cy:0,z:1+t}),t=>t<.5?undefined:{cx:0,cy:0,z:1}]){
    const r=auditMotion(fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t)}],camera:camera(t)})),{requireVideo:false});
    assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('camera movement or changing camera coverage')));
  }
});
test('actual fade changes must lie within the declared object, time and channel coverage',()=>{
  let s=fadeOnly();s.actions[0].end=.5;
  assert(auditMotion(s,{requireVideo:false}).coverageGaps.some(g=>g.includes('outside its declared object/action/channel')));
  s=fadeOnly();s.actions[0].channels=['width'];
  assert(auditMotion(s,{requireVideo:false}).coverageGaps.some(g=>g.includes('outside its declared object/action/channel')));
  s=fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t)},{...box('second',500,100),opacity:smooth(t)}]}));s.coverage.objectIds.push('second');
  assert(auditMotion(s,{requireVideo:false}).coverageGaps.some(g=>g.includes('outside its declared object/action/channel coverage: second')));
});
test('a static hold labeled reveal or missing node evidence cannot become a complete fade audit',()=>{
  let s=fadeOnly(()=>({objects:[box('main',100,100)]}));
  assert(auditMotion(s,{requireVideo:false}).coverageGaps.some(g=>g.includes('no sampled opacity change')));
  s=fadeOnly();delete s.coverage.notApplicable;
  assert.equal(auditMotion(s,{requireVideo:false}).status,'incomplete');
});
test('pure fade applicability preserves realtime limits and ignores truly invisible helper geometry',()=>{
  let s=fadeOnly(t=>({objects:[{...box('main',100,100),opacity:smooth(t)},{...box('invisible',100*t,100),opacity:0}]}));
  assert.equal(auditMotion(s,{requireVideo:false}).status,'findings');
  s=fadeOnly();s.actions[0].kind='realtime';delete s.actions[0].channels;s.actions[0].exception=exception('real-time');
  assert.equal(auditMotion(s,{requireVideo:false}).status,'incomplete');
  s=fadeOnly();s.actions.push({id:'clock',objectId:'main',start:.5,end:1,kind:'realtime',exception:exception('real-time')});
  assert.equal(auditMotion(s,{requireVideo:false}).status,'incomplete');
});

// I1 D1: lifecycle/content changes are review findings, separate from visual acceptance.
const d1Codes=new Set(['opacity-only-lifecycle','instant-element-visibility','content-replaced-without-process']);
const d1=s=>auditMotion(s,{requireVideo:false});
test('natural modification aliases locate D04 and retain its successful-repair semantic boundary',()=>{
  for(const relation of ['修改','改写','修订','局部修改','反复修改']){
    const r=locate({root,relation});assert.equal(r.processes.length,1);assert.equal(r.processes[0].id,'ep05-d04-inspect-rewrite-handoff');
    assert(r.processes[0].limits.includes('诊断后改好'));assert(r.processes[0].limits.includes('反复修改仍不解决'));
    assert.deepEqual(r.processes[0].matchedRelations,[relation]);assert(!r.processes[0].samples);
  }
});
test('locator default is concise and partial matches expose unmatched terms',()=>{
  const r=locate({root,relation:'修改,未收录关系'});assert.equal(r.detail,'concise');assert.deepEqual(r.query.unmatchedTerms,['未收录关系']);
  assert(!Object.hasOwn(r.processes[0].implementation[0],'absolutePath'));assert(!Object.hasOwn(r.processes[0],'sampleSeconds'));
  const full=locate({root,relation:'修改',full:true});assert.equal(full.processes[0].implementation[0].sha256.length,64);assert(!full.processes[0].samples);
  assert.equal(locate({root,relation:'修改',sample:true}).processes[0].samples.length,3);
});
test('pure alpha entry and exit are review-only findings even if mislabeled transfer',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t<=.5?smooth(t*2):1-smooth((t-.5)/.4)}]})));
  const found=r.findings.filter(f=>f.code==='opacity-only-lifecycle');assert.equal(found.length,2);assert.deepEqual(found.map(f=>f.kind),['entry','exit']);
  assert(found.every(f=>f.severity==='review'));assert.equal(r.visualAcceptance,'not-assessed');
});
test('a twelve-pixel fade slide is still a lifecycle suspicion',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100+12*smooth(t),100),opacity:smooth(t)}]})));
  assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'&&f.translationPx>11.9&&f.translationPx<=12));
});
test('physical unfold and sampled mask/path/morph/occlusion progress establish a process',()=>{
  const examples=[t=>({...box('main',100,100),opacity:smooth(t),width:120*smooth(t)}),...['maskProgress','pathProgress','morphProgress','occlusionProgress'].map(key=>t=>({...box('main',100,100),opacity:smooth(t),process:{[key]:smooth(t)}}))];
  for(const fn of examples){const r=d1(standalone(t=>({objects:[fn(t)]})));assert(!r.findings.some(f=>d1Codes.has(f.code)));}
});
test('a process label with constant progress cannot waive a fade',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:smooth(t),process:{maskProgress:1}}]})));
  assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'));
});
test('retained dimming is not disappearance, and audio is outside the object contract',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:1-.8*smooth(t)}],audioGain:smooth(t)})));
  assert(!r.findings.some(f=>d1Codes.has(f.code)));assert.equal(r.lifecycle.length,0);
});
test('inherited camera movement does not disguise a pure fade as local object motion',()=>{
  const r=d1(standalone(t=>{const cx=500+200*smooth(t),z=1+smooth(t);return {objects:[{...box('main'),x:960+(500-cx)*z,y:540,width:120*z,height:80*z,opacity:smooth(t)}],camera:{cx,cy:0,z}};}));
  assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'&&f.geometryBasis==='centered-camera-inversion-inference'));
});
test('actual local geometry overrides camera inference',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100+100*smooth(t),100),opacity:smooth(t),localGeometry:{x:0,y:0,width:120,height:80}}],camera:{cx:0,cy:0,z:1}})));
  assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'&&f.geometryBasis==='production-local-geometry'));
});
test('instant jumps cannot manufacture visible geometry process',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',t<.5?100:500,100),opacity:t<.5?0:1}]})));
  assert(r.findings.some(f=>f.code==='instant-element-visibility'));
});
function contentSpec(extra=()=>({}),legacy=false){
  return standalone(t=>({objects:[{...box('main',100,100),...(!legacy?{contentVersion:t<.5?'old':'new'}:{}),...extra(t)}],...(legacy?{semantic:{main:t<.5?'old':'new'}}:{})}));
}
test('same-ID content swaps are detected with stable bounds and exact production boundary',()=>{
  const r=d1(contentSpec());const f=r.findings.find(f=>f.code==='content-replaced-without-process');assert(f);assert.equal(f.time,.5);assert.equal(f.fromVersion,'old');assert.equal(f.toVersion,'new');assert.equal(f.severity,'review');
});
test('legacy scalar semantic[objectId] is an explicit content identity fallback',()=>{
  const r=d1(contentSpec(()=>({}),true));assert(r.findings.some(f=>f.code==='content-replaced-without-process'));assert.deepEqual(r.contentVersionCoverage.covered,['main']);
});
test('resetting opacity at the version boundary does not conceal replacement',()=>{
  const r=d1(contentSpec(t=>({opacity:t<.5?1:smooth((t-.5)*2)})));assert(r.findings.some(f=>f.code==='content-replaced-without-process'&&f.time===.5));
});
test('actual replacement progress is tied to the old/new content pair',()=>{
  const r=d1(contentSpec(t=>({replacement:{kind:'mask',progress:smooth(t),fromVersion:'old',toVersion:'new'}})));
  assert.equal(r.replacements[0].replacementMechanism,'mask');assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
  const wrong=d1(contentSpec(t=>({replacement:{kind:'mask',progress:smooth(t),fromVersion:'other',toVersion:'new'}})));
  assert(wrong.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('replacement names, fixed progress and instantaneous progress jumps do not establish a process',()=>{
  for(const progress of [()=>.5,t=>t<.5?0:1]){
    const r=d1(contentSpec(t=>({replacement:{kind:'morph',progress:progress(t),fromVersion:'old',toVersion:'new'}})));
    assert(r.findings.some(f=>f.code==='content-replaced-without-process'));
  }
});
test('content prepared while hidden does not become a visible-replacement finding',()=>{
  const r=d1(contentSpec(()=>({opacity:0})));assert.equal(r.replacements.length,0);assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('unexposed identity remains explicitly uncovered rather than silently called stable',()=>{
  const r=d1(standalone(t=>({objects:[box('main',100+300*smooth(t),100)]})));
  assert.deepEqual(r.contentVersionCoverage.uncovered,['main']);assert.deepEqual(r.contentVersionCoverage.covered,[]);
});
test('a full scene cut with source evidence differs from an element-local cut',()=>{
  const s=contentSpec();delete s.coverage.notApplicable.checkpoints;
  s.checkpoints=[{id:'scene-cut',time:.5,role:'cut',scope:'scene',objectIds:['main'],exception:exception('cut')}];
  assert(!d1(s).findings.some(f=>f.code==='content-replaced-without-process'));
  delete s.checkpoints[0].scope;assert(d1(s).findings.some(f=>f.code==='content-replaced-without-process'));
});
test('a claimed scene cut cannot suppress unlisted visible participants',()=>{
  const s=contentSpec();const before=s.frameAt;s.frameAt=t=>({...before(t),objects:[...before(t).objects,box('other',400,100)]});s.coverage.objectIds.push('other');
  delete s.coverage.notApplicable.checkpoints;s.checkpoints=[{id:'partial-cut',time:.5,role:'cut',scope:'scene',objectIds:['main'],exception:exception('cut')}];
  assert(d1(s).findings.some(f=>f.code==='content-replaced-without-process'));
});
test('bad content/replacement/progress values cannot silently disable checks',()=>{
  assert.throws(()=>d1(contentSpec(()=>({contentVersion:{text:'not scalar'}}))),/scalar/);
  assert.throws(()=>d1(contentSpec(()=>({replacement:{kind:'mask',progress:.5}}))),/scalar/);
  assert.throws(()=>d1(contentSpec(()=>({process:{maskProgress:2}}))),/outside/);
});
function splitSpec(offset){
  const s=standalone(t=>({objects:[box('main',100+300*smooth(t),100),{...box('child',250+offset,100),opacity:t<.5?0:smooth((t-.5)*2)}]}));
  s.coverage.objectIds.push('child');s.sourceLinks=[{id:'same-location-copy',sourceObjectId:'main',targetObjectId:'child',time:.5,evidence:scopeEvidence()}];return s;
}
test('source/target relation checks actual first visible origin and catches stale coordinates',()=>{
  assert(!d1(splitSpec(0)).findings.some(f=>f.code==='source-origin-discontinuity'));
  const r=d1(splitSpec(528));const f=r.findings.find(f=>f.code==='source-origin-discontinuity');assert(f);assert.equal(f.distancePx,528);assert.equal(f.severity,'review');
});
test('source links require bound source evidence and valid covered IDs',()=>{
  const s=splitSpec(0);s.sourceLinks[0].evidence.anchor=['missing','split','relation','anchor'].join(' ');assert.throws(()=>d1(s),/anchor missing/);
  s.sourceLinks[0].targetObjectId='omitted';assert.throws(()=>d1(s),/not covered/);
});
test('opacity-only declared action still exposes a fading attached object while its parent travels',()=>{
  const s=standalone(t=>({objects:[{...box('main',100+160*smooth(t),100),opacity:1-smooth(t/.9)}]}));
  s.actions[0].kind='reveal';s.actions[0].channels=['opacity'];
  const r=d1(s);assert(r.findings.some(f=>f.code==='opacity-only-lifecycle'&&f.kind==='exit'&&f.declaredOpacityOnlyAction==='a'));
});


// I1 round 2: independent review boundaries, with encoded-frame EOF excluded.
test('subpixel shape noise cannot excuse an alpha-only entrance',()=>{
  for(const geometry of [t=>({width:120+.0001*t}),t=>({height:80+.0001*t}),t=>({rotation:.0001*t})]){
    const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t,...geometry(t)}]})));
    const f=r.findings.find(f=>f.code==='opacity-only-lifecycle');assert(f);assert.equal(f.shapeChange,false);
  }
});
test('one-millionth process-progress noise does not establish mask/path/morph/occlusion',()=>{
  for(const key of ['maskProgress','pathProgress','morphProgress','occlusionProgress']){
    const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t,process:{[key]:.5+t*1e-6}}]})));
    const f=r.findings.find(f=>f.code==='opacity-only-lifecycle');assert(f);assert.deepEqual(f.progressChannels,[]);
  }
});
test('replacement progress noise cannot hide an actual same-ID content swap',()=>{
  const r=d1(contentSpec(t=>({replacement:{kind:'mask',progress:.5+t*1e-6,fromVersion:'old',toVersion:'new'}})));
  assert(r.findings.some(f=>f.code==='content-replaced-without-process'&&f.time===.5));
});
test('a later correctly named mask cannot retroactively excuse an earlier visible text swap',()=>{
  const r=d1(contentSpec(t=>({replacement:t>=.6?{kind:'mask',progress:Math.min(1,(t-.6)/.1),fromVersion:'old',toVersion:'new'}:undefined})));
  const f=r.findings.find(f=>f.code==='content-replaced-without-process');assert(f);assert.equal(f.time,.5);assert.equal(f.replacementMechanism,null);
});
test('an already-finished mechanism also cannot excuse a later swap',()=>{
  const r=d1(contentSpec(t=>({replacement:{kind:'mask',progress:Math.min(1,t/.3),fromVersion:'old',toVersion:'new'}})));
  assert(r.findings.some(f=>f.code==='content-replaced-without-process'&&f.time===.5));
});
test('real replacement progress starting or completing at the actual boundary remains recognized',()=>{
  for(const progress of [t=>Math.max(0,Math.min(1,(t-.5)/.2)),t=>Math.max(0,Math.min(1,(t-.3)/.2))]){
    const r=d1(contentSpec(t=>({replacement:{kind:'mask',progress:progress(t),fromVersion:'old',toVersion:'new'}})));
    assert.equal(r.replacements[0].replacementMechanism,'mask');assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
  }
});
test('missing identity samples are partial coverage and leave the changed-version boundary unresolved',()=>{
  const r=d1(contentSpec(t=>({contentVersion:t<.4?'old':t>.6?'new':undefined})));
  assert.equal(r.status,'incomplete');assert(r.coverageGaps.some(g=>g.includes('Content identity coverage incomplete')));
  assert.deepEqual(r.contentVersionCoverage.covered,[]);assert.equal(r.contentVersionCoverage.partial[0].missingSamples,13);
  const missing=r.contentVersionCoverage.partial[0].missingRanges[0];assert.equal(missing.firstMissing,.4);assert.equal(missing.lastMissing,.6);
  const change=r.contentVersionCoverage.unresolvedChanges[0];assert.equal(change.time,null);assert.equal(change.lastKnownTime,23/60);assert.equal(change.firstKnownTime,37/60);
  assert(!r.replacements.length);assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('a partial identity gap does not erase other precisely known swaps',()=>{
  const r=d1(contentSpec(t=>({contentVersion:t<.2?'A':t<.4?'B':t<=.6?undefined:t<.8?'C':'D'})));
  assert.deepEqual(r.replacements.map(f=>f.time),[.2,.8]);assert.equal(r.contentVersionCoverage.unresolvedChanges[0].time,null);
  assert.equal(r.contentVersionCoverage.unresolvedChanges[0].fromVersion,'B');assert.equal(r.contentVersionCoverage.unresolvedChanges[0].toVersion,'C');
});
test('an identity gap found between encoded samples is not binary-searched into a false exact time',()=>{
  const r=d1(contentSpec(t=>({contentVersion:t<.491?'old':t<.495?undefined:'new'})));
  assert.equal(r.contentVersionCoverage.partial.length,1);assert.equal(r.contentVersionCoverage.covered.length,0);
  assert.equal(r.contentVersionCoverage.unresolvedChanges[0].time,null);assert.equal(r.replacements.length,0);
});
test('unencoded duration endpoint changes are not D1 visibility or content events',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t<1?1:0,contentVersion:t<1?'old':'new'}]})));
  assert(!r.findings.some(f=>d1Codes.has(f.code)));assert.equal(r.lifecycle.length,0);assert.equal(r.replacements.length,0);
  assert.equal(r.sampling.lifecycleEncodedFrames,60);assert.equal(r.sampling.lifecycleLastFrameTime,59/60);assert.equal(r.sampling.lifecycleEndExclusive,true);
});
test('the last actual encoded frame still participates in visibility and identity checks',()=>{
  const at=59/60;
  let r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t<at?1:0}]})));
  assert(r.findings.some(f=>f.code==='instant-element-visibility'&&f.end===at));
  r=d1(standalone(t=>({objects:[{...box('main',100,100),contentVersion:t<at?'old':'new'}]})));
  assert(r.findings.some(f=>f.code==='content-replaced-without-process'&&Math.abs(f.time-at)<1e-8));
});
test('fractional duration retains every frame strictly before its endpoint',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),opacity:t<1?1:0}]}),1.01));
  assert.equal(r.sampling.lifecycleEncodedFrames,61);assert.equal(r.sampling.lifecycleLastFrameTime,1);
  assert(r.findings.some(f=>f.code==='instant-element-visibility'&&f.end===1));
});
test('hidden content preparation followed by a genuine geometry reveal is not a visible replacement',()=>{
  const r=d1(contentSpec(t=>({opacity:t<.6?0:1,width:t<.6?0:120*Math.min(1,(t-.6)/.2)})));
  assert(!r.findings.some(f=>d1Codes.has(f.code)));assert.equal(r.replacements.length,0);
});
test('hidden preparation cannot waive a subsequent instant element pop',()=>{
  const r=d1(contentSpec(t=>({opacity:t<.6?0:1})));
  assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));assert(r.findings.some(f=>f.code==='instant-element-visibility'&&f.start>=.58));
});
test('hidden preparation is recognized after a previously visible old version has left',()=>{
  const r=d1(contentSpec(t=>({opacity:t<.3?1:t<.6?0:1,width:t<.6?120:120*Math.min(1,(t-.6)/.2)})));
  assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));assert(r.findings.some(f=>f.code==='instant-element-visibility'&&f.kind==='exit'));
});

// I2: declared content-layer boundaries affect D1 only, never engineering motion checks.
const i2D1Codes=new Set([...d1Codes,'source-origin-discontinuity']);
function categoryFixture(category){
  return standalone(t=>({objects:[{...box('main',100,100),opacity:t<.2?0:1,
    contentVersion:t<.5?'cue-A':'cue-B',...(category===undefined?{}:{d1Category:category})}]}));
}
test('I2 explicit cue/source-footage categories exclude all D1 with an unverified declaration record',()=>{
  for(const category of ['subtitle-cue','source-footage']){
    const r=d1(categoryFixture(category));assert(!r.findings.some(f=>i2D1Codes.has(f.code)));
    assert.deepEqual(r.d1Classification.excludedObjectIds,['main']);assert.deepEqual(r.d1Classification.checkedObjectIds,[]);
    assert.equal(r.d1Classification.objects[0].category,category);assert.equal(r.d1Classification.objects[0].disposition,'excluded');
    assert(r.d1Classification.objects[0].reason.includes('review'));assert(r.d1Classification.basis.includes('not assessed'));
    assert.deepEqual(r.contentVersionCoverage.covered,[]);assert.deepEqual(r.contentVersionCoverage.uncovered,[]);assert.equal(r.visualAcceptance,'not-assessed');
  }
});
test('I2 MG and post-production overlays still report direct appearance and same-node replacement',()=>{
  for(const category of ['mg','overlay']){
    const r=d1(categoryFixture(category));assert(r.findings.some(f=>f.code==='instant-element-visibility'));
    assert(r.findings.some(f=>f.code==='content-replaced-without-process'&&f.time===.5));assert.deepEqual(r.d1Classification.checkedObjectIds,['main']);
    assert.equal(r.d1Classification.objects[0].category,category);assert.deepEqual(r.d1Classification.excludedObjectIds,[]);
  }
});
test('I2 omitted, misspelled and invalid categories never become an exemption',()=>{
  for(const category of [undefined,'source-footage ','subtitle','unknown',null,17,{}]){
    const r=d1(categoryFixture(category));assert(r.findings.some(f=>f.code==='content-replaced-without-process'));
    assert.deepEqual(r.d1Classification.checkedObjectIds,['main']);assert.deepEqual(r.d1Classification.excludedObjectIds,[]);
    const c=r.d1Classification.objects[0];assert.equal(c.disposition,'checked');assert.equal(c.category,null);
    if(category===undefined)assert.equal(c.missingSamples,60);else assert(c.unknownCategories.length>0);
  }
});
test('I2 mixed or partially omitted categories retain the whole ID in D1 coverage',()=>{
  for(const categoryAt of [t=>t<.5?'subtitle-cue':'mg',t=>t<.2?undefined:'source-footage',t=>t<.5?'source-footage':'data-readout']){
    const s=categoryFixture();const original=s.frameAt;s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,d1Category:categoryAt(t)}))});
    const r=d1(s);assert(r.findings.some(f=>f.code==='content-replaced-without-process'));assert.equal(r.d1Classification.objects[0].category,null);
    assert.deepEqual(r.d1Classification.excludedObjectIds,[]);assert(r.d1Classification.objects[0].reason.includes('retain'));
  }
});
test('I2 a source-footage layer cannot exempt its separately identified annotation overlay',()=>{
  const s=categoryFixture('source-footage'),original=s.frameAt;s.coverage.objectIds.push('annotation');
  s.frameAt=t=>({objects:[...original(t).objects,{...original(t).objects[0],id:'annotation',d1Category:'overlay',parentId:'main'}]});
  const r=d1(s);assert.deepEqual(r.d1Classification.excludedObjectIds,['main']);assert.deepEqual(r.d1Classification.checkedObjectIds,['annotation']);
  assert(r.findings.some(f=>f.objectId==='annotation'&&f.code==='instant-element-visibility'));
  assert(r.findings.some(f=>f.objectId==='annotation'&&f.code==='content-replaced-without-process'));
  assert(!r.findings.some(f=>f.objectId==='main'&&i2D1Codes.has(f.code)));
});
test('I2 a real numeric readout may update every frame without same-node replacement findings',()=>{
  const make=category=>standalone(t=>({objects:[{...box('main',100,100),contentVersion:Math.floor(t*60),d1Category:category}]}));
  const excluded=d1(make('data-readout'));assert(!excluded.findings.some(f=>f.code==='content-replaced-without-process'));
  assert.equal(excluded.d1Classification.objects[0].disposition,'content-only-excluded');
  assert.deepEqual(excluded.d1Classification.excludedObjectIds,[]);assert.deepEqual(excluded.d1Classification.contentOnlyExcludedObjectIds,['main']);
  assert.deepEqual(excluded.d1Classification.checkedObjectIds,['main']);assert.deepEqual(excluded.d1Classification.contentCheckedObjectIds,[]);
  assert.deepEqual(excluded.d1Classification.objects[0].checks,{lifecycle:true,contentIdentity:false,sourceLinks:true});
  const mg=d1(make('mg'));assert(mg.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('I2 D1 exclusion does not waive ordinary uniform-motion engineering findings',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100+300*t,100),d1Category:'source-footage'}]})));
  assert.deepEqual(r.d1Classification.excludedObjectIds,['main']);assert(r.findings.some(f=>f.code==='uniform-screen-motion'&&f.severity==='constraint-violation'));
});
test('I2 D1 exclusion does not waive pass-node stops or causal empty waits',()=>{
  const s=spec(t=>({objects:[{...box('main',t<.5?300*smooth(t*2):t>1.5?300+300*smooth((t-1.5)*2):300),d1Category:'data-readout'}]}));
  s.actions=[{id:'a',objectId:'main',start:0,end:.5,kind:'transfer'},{id:'b',objectId:'main',start:1.5,end:2,kind:'transfer'}];
  const r=d1(s);assert(r.findings.some(f=>f.code==='pass-node-common-stop'));assert(r.findings.some(f=>f.code==='relay-empty-wait'));
});
test('I2 excluded content identity gaps are outside D1 while MG identity gaps remain incomplete',()=>{
  const make=category=>standalone(t=>({objects:[{...box('main',100+300*smooth(t),100),d1Category:category,contentVersion:t<.4?'A':t>.6?'B':undefined}]}));
  const footage=d1(make('source-footage'));assert.deepEqual(footage.contentVersionCoverage.partial,[]);assert(!footage.coverageGaps.some(g=>g.includes('identity')));
  const mg=d1(make('mg'));assert.equal(mg.contentVersionCoverage.partial.length,1);assert(mg.coverageGaps.some(g=>g.includes('identity')));
});
test('I2 the source-link target category controls D1 without inheriting a source exemption',()=>{
  const s=splitSpec(528),original=s.frameAt;
  s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,d1Category:o.id==='child'?'source-footage':'mg'}))});
  let r=d1(s);assert(!r.findings.some(f=>f.code==='source-origin-discontinuity'));assert.equal(r.d1Classification.excludedSourceLinks[0].id,'same-location-copy');
  assert.equal(r.d1Classification.excludedSourceLinks[0].targetObjectId,'child');
  s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,d1Category:o.id==='child'?'overlay':'source-footage'}))});
  r=d1(s);assert(r.findings.some(f=>f.code==='source-origin-discontinuity'));assert.deepEqual(r.d1Classification.excludedSourceLinks,[]);
});
test('I2 a scene cut is assessed over D1 participants without reintroducing excluded subtitle cues',()=>{
  const s=contentSpec(),original=s.frameAt;s.coverage.objectIds.push('cue');
  s.frameAt=t=>({objects:[...original(t).objects,{...box('cue',600,700),d1Category:'subtitle-cue',contentVersion:t<.5?'cue1':'cue2'}]});
  delete s.coverage.notApplicable.checkpoints;s.checkpoints=[{id:'scene-cut',time:.5,role:'cut',scope:'scene',objectIds:['main'],exception:exception('cut')}];
  const r=d1(s);assert.deepEqual(r.d1Classification.excludedObjectIds,['cue']);assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('I2 an unencoded EOF category cannot grant an earlier exemption',()=>{
  const s=categoryFixture('mg'),original=s.frameAt;s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,d1Category:t<1?'mg':'source-footage'}))});
  const r=d1(s);assert.equal(r.d1Classification.objects[0].category,'mg');assert(r.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('I2 excluded categories do not suppress invalid input or source binding requirements',()=>{
  const s=categoryFixture('source-footage'),original=s.frameAt;s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,x:NaN}))});
  assert.throws(()=>d1(s),/finite/);
  s.frameAt=original;s.sourceFiles=[];assert.throws(()=>d1(s),/No render source files/);
});

// I2 revision 2: real data updates exempt identity changes only, never designed entry/exit/copy.
test('I2 data-readout hard entry and exit remain D1 findings while numbers update from 0 to 100',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),d1Category:'data-readout',contentVersion:Math.min(100,Math.floor(t*125)),opacity:t<.2||t>=.8?0:1}]})));
  const lifecycle=r.findings.filter(f=>f.code==='instant-element-visibility');assert.equal(lifecycle.length,2);
  assert.deepEqual(lifecycle.map(f=>f.kind),['entry','exit']);assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
  assert.deepEqual(r.d1Classification.excludedObjectIds,[]);assert.deepEqual(r.d1Classification.contentOnlyExcludedObjectIds,['main']);
});
test('I2 data-readout alpha-only fades remain D1 lifecycle findings',()=>{
  const alpha=t=>t<.2?0:t<.5?(t-.2)/.3:t<.6?1:t<.9?(.9-t)/.3:0;
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),d1Category:'data-readout',contentVersion:Math.floor(t*100),opacity:Math.max(0,Math.min(1,alpha(t)))}]})));
  assert.equal(r.findings.filter(f=>f.code==='opacity-only-lifecycle').length,2);
  assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));assert.equal(r.d1Classification.objects[0].checks.lifecycle,true);
});
test('I2 data-readout with a genuine geometric reveal keeps that D1 process evidence',()=>{
  const r=d1(standalone(t=>({objects:[{...box('main',100,100),d1Category:'data-readout',contentVersion:Math.floor(t*100),width:120*smooth(t),opacity:smooth(t)}]})));
  assert.equal(r.lifecycle.length,1);assert.equal(r.lifecycle[0].hasProcess,true);assert(!r.findings.some(f=>i2D1Codes.has(f.code)));
  assert.deepEqual(r.d1Classification.checkedObjectIds,['main']);assert.equal(r.d1Classification.objects[0].disposition,'content-only-excluded');
});
test('I2 data-readout copy still checks its actual source even when the source is footage',()=>{
  const s=splitSpec(528),original=s.frameAt;
  s.frameAt=t=>({objects:original(t).objects.map(o=>({...o,d1Category:o.id==='child'?'data-readout':'source-footage',contentVersion:Math.floor(t*100)}))});
  const r=d1(s),finding=r.findings.find(f=>f.code==='source-origin-discontinuity');assert(finding);assert.equal(finding.distancePx,528);
  assert.deepEqual(r.d1Classification.excludedObjectIds,['main']);assert.deepEqual(r.d1Classification.contentOnlyExcludedObjectIds,['child']);
  assert.deepEqual(r.d1Classification.excludedSourceLinks,[]);assert.equal(r.sourceLinks.length,1);assert(!r.findings.some(f=>f.code==='content-replaced-without-process'));
});
test('I2 numeric content exemption does not propagate into its separately identified packaging label',()=>{
  const s=standalone(t=>({objects:[{...box('main',100,100),d1Category:'data-readout',contentVersion:Math.floor(t*100)},
    {...box('label',100,200),d1Category:'overlay',parentId:'main',opacity:t<.2?0:1,contentVersion:t<.5?'old label':'new label'}]}));
  s.coverage.objectIds.push('label');const r=d1(s);
  assert.deepEqual(r.d1Classification.contentOnlyExcludedObjectIds,['main']);assert.deepEqual(r.d1Classification.contentCheckedObjectIds,['label']);
  assert(r.findings.some(f=>f.objectId==='label'&&f.code==='instant-element-visibility'));
  assert(r.findings.some(f=>f.objectId==='label'&&f.code==='content-replaced-without-process'));
  assert(!r.findings.some(f=>f.objectId==='main'&&f.code==='content-replaced-without-process'));
});
