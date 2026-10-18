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
  const r=run(s);assert(r.findings.some(f=>f.code==='uniform-screen-channel'&&f.channel==='x'&&Math.abs(f.velocityPxPerSecond-623)<1e-7));
});
test('short eased ends do not hide interior uniform cruise',()=>{
  const f=t=>t<.2?250*t*t:t<1.8?10+100*(t-.2):170+100*(t-1.8)-250*(t-1.8)**2;
  const r=run(spec(t=>({objects:[box('main',f(t))]})));
  assert(r.findings.some(f=>f.code==='uniform-screen-channel'&&f.start>=.19&&f.end<=1.81));
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
  const r=run(s);assert(!r.findings.some(f=>f.code==='uniform-screen-channel'));assert.equal(r.exceptions.length,2);
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
