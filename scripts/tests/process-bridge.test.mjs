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
test('opacity reveal is measured without masquerading as a trajectory pass',()=>{
  const s=spec(t=>({objects:[{...box('main'),opacity:t/2}]}));s.actions=[{id:'a',objectId:'main',start:0,end:2,kind:'reveal',channels:['opacity']},{id:'b',objectId:'main',start:1.8,end:2,kind:'reveal',channels:['opacity']}];
  const r=run(s);assert(!r.findings.some(f=>f.code==='uniform-screen-channel'));assert.equal(r.actions[0].channels.opacity.unit,'fraction');assert.equal(r.status,'incomplete');
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
  assert.equal(r.status,'measured-no-findings');assert.equal(r.visualAcceptance,'not-assessed');
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
