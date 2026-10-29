import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {auditMotion} from '../motion-audit.mjs';
import {scoreFollow} from '../motion-gates.mjs';
import * as checker from '../motion-check.mjs';
const require=createRequire(import.meta.url),self=fileURLToPath(import.meta.url);
const observation=()=>require('../motion-observation.cjs');
const box=(id,t=0,extra={})=>({id,x:10+40*t,y:10,width:20,height:20,opacity:1,localGeometry:{x:40*t,y:0,width:20,height:20},...extra});
// fixture: isolated source-bound motion with no handoff or checkpoint
const evidence={sourceFile:self,anchor:'fixture: isolated source-bound motion',reason:'This fixture has no handoff or checkpoint.'};
function spec(at){return{schemaVersion:1,fps:30,duration:1,viewport:{width:200,height:100},sourceFiles:[self],coverage:{basis:'render-state-final-screen',objectIds:['pointer'],scope:'Fixture production output',notApplicable:{checkpoints:evidence,relays:evidence}},frameAt:at,actions:[{id:'move',objectId:'pointer',start:0,end:1,kind:'process',channels:['x']}],checkpoints:[],relays:[]};}

test('bbox-only legacy adapters retain coordinates but cannot prove visible internal work',()=>{
 const r=auditMotion(spec(t=>({objects:[box('pointer',t)]})),{requireVideo:false});
 assert.equal(r.status,'incomplete');assert.notEqual(r.processCoverage.actions[0].status,'measured-change');
 assert(r.coverageGaps.some(s=>/visibility/i.test(s)));
});
test('paint-hidden child motion cannot satisfy process or follow checks',()=>{
 const hidden={observation:{state:'hidden',reason:'parent-clip-empty'}};
 const r=auditMotion(spec(t=>({objects:[box('pointer',t,hidden)]})),{requireVideo:false});
 assert.notEqual(r.processCoverage.actions[0].status,'measured-change');
 const samples=[0,.1,.2,.3].map(t=>({t,frame:{objects:[box('body',t,{observation:{state:'visible',reason:'supported-geometry'}}),box('pointer',Math.max(0,t-.1),hidden)]}}));
 assert.notEqual(scoreFollow(samples,{id:'f',subjectId:'body',attachmentId:'pointer'}).status,'通过');
});
test('the actual draw inventory exposes a pointer omitted by the adapter',()=>{
 const r=auditMotion(spec(t=>({objects:[box('pointer',t)],renderedObjectIds:['pointer','cursor']})),{requireVideo:false});
 assert(r.coverageGaps.some(s=>s.includes('cursor')&&/render|draw|inventory/i.test(s)));
});

test('unexposed render inventory cannot claim complete coverage even with definite rectangle visibility',()=>{
 const r=auditMotion(spec(t=>({objects:[box('pointer',t,{observation:{state:'visible',reason:'fixture-painted-rectangle'}})]})),{requireVideo:false});
 assert.equal(r.status,'incomplete');assert.equal(r.renderInventory.status,'unexposed');
 assert(r.coverageGaps.some(g=>/inventory.*not exposed/i.test(g)));
 assert(r.motionObservations.objects[0].totalPathPx>0);
 const empty=auditMotion(spec(t=>({objects:[box('pointer',t,{observation:{state:'visible',reason:'fixture-painted-rectangle'}})],renderedObjectIds:[]})),{requireVideo:false});
 assert.equal(empty.status,'incomplete');assert(empty.coverageGaps.some(g=>/absent from production draw inventory/.test(g)));
});
test('same production submit renders children and computes parent clipping and opaque front layers',()=>{
 const {createObservedScene}=observation();
 const scene=createObservedScene({width:200,height:100});
 scene.rect({id:'panel',x:0,y:0,width:100,height:80,transform:[1,0,0,1,30,10],clip:{x:0,y:0,width:100,height:10}},{fill:'#fff'});
 scene.rect({id:'child',parentId:'panel',x:10,y:40,width:20,height:20,hotspot:{x:10,y:40}},{fill:'#000'});
 scene.polygon({id:'cursor',points:[[0,0],[0,12],[8,8]],transform:[1,0,0,1,150,40],hotspot:{x:0,y:0}},{fill:'#000'});
 scene.rect({id:'cover',x:140,y:30,width:40,height:40,z:10},{fill:'#fff'});
 const f=scene.finish(),child=f.objects.find(x=>x.id==='child'),cursor=f.objects.find(x=>x.id==='cursor');
 assert(f.svg.includes('data-object="child"'));assert(f.renderedObjectIds.includes('cursor'));
 assert.equal(child.observation.state,'hidden');assert.equal(cursor.observation.state,'hidden');
 assert.deepEqual(child.hotspot,{x:40,y:50});
});
test('unsupported raw or translucent covering paint remains unknown rather than bbox-visible',()=>{
 const {createObservedScene}=observation(),scene=createObservedScene({width:200,height:100});
 scene.rect({id:'base',x:10,y:10,width:50,height:50},{fill:'#fff'});
 scene.raw({id:'effect',x:10,y:10,width:50,height:50,z:5},'<path d="M10 10H60V60H10Z" fill="black" opacity=".5"/>');
 const f=scene.finish();assert.equal(f.objects.find(x=>x.id==='base').observation.state,'unknown');
 assert.equal(f.objects.find(x=>x.id==='effect').observation.state,'unknown');
});
test('a small unknown foreground does not erase a separately provable visible part of the card',()=>{
 const s=observation().createObservedScene({width:200,height:100});
 s.rect({id:'card',x:0,y:0,width:180,height:90},{fill:'#fff'});
 s.raw({id:'text',x:10,y:10,width:60,height:20,z:1},'<text x="10" y="25">label</text>');
 const f=s.finish();assert.equal(f.objects[0].observation.state,'visible');assert.equal(f.objects[1].observation.state,'unknown');
});
test('camera/parent transforms and native 30fps visibility exit are measured without a reference-clock conversion',()=>{
 const at=t=>{const s=observation().createObservedScene({width:200,height:100,camera:{cx:100,cy:50,z:2}});
 s.rect({id:'card',x:0,y:0,width:50,height:30,transform:[1,0,0,1,80,40]},{fill:'#fff'});
 s.polygon({id:'pointer',parentId:'card',points:[[0,0],[0,10],[8,6]],transform:[1,0,0,1,10,5],hotspot:{x:0,y:0},drawn:t<.5},{fill:'#000'});return s.finish();};
 const p=at(.4).objects.find(o=>o.id==='pointer');assert.deepEqual(p.hotspot,{x:80,y:40});
 const ss=spec(at);ss.coverage.objectIds=['card','pointer'];
 const r=auditMotion(ss,{requireVideo:false});const e=r.motionObservations.objects.find(o=>o.id==='pointer').visibilityEvents.find(e=>e.drawSwitch);
 assert.equal(e.frame,15);assert.equal(e.time,.5);assert.equal(e.to,'hidden');
 assert(r.findings.some(f=>f.code==='instant-element-visibility'&&f.objectId==='pointer'));
});
test('rounded/translucent/rotated unsupported paint is never promoted to definite visibility',()=>{
 for(const [specification,style]of [[{}, {fill:'#fff',rx:12}],[{}, {fill:'#fff',opacity:.5}],[{transform:[0,1,-1,0,80,10]},{fill:'#fff'}]]){
  const s=observation().createObservedScene({width:200,height:100});s.rect({id:'x',x:10,y:10,width:20,height:20,...specification},style);
  assert.equal(s.finish().objects[0].observation.state,'unknown');
 }
});
test('screen displacement and concentration are diagnostics with no universal speed verdict',()=>{
 const {createObservedScene}=observation();
 const make=distance=>spec(t=>{const s=createObservedScene({width:2000,height:100});s.rect({id:'pointer',x:0,y:10,width:10,height:10,transform:[1,0,0,1,distance*(1-(1-t)**5),0],hotspot:{x:0,y:10}},{fill:'#000'});return s.finish();});
 const a=auditMotion(make(100),{requireVideo:false}),b=auditMotion(make(1000),{requireVideo:false});
 const x=a.motionObservations.objects[0],y=b.motionObservations.objects[0];
 assert(y.maxFrameDisplacementPx>x.maxFrameDisplacementPx*9.9);
 assert(Math.abs(x.firstQuarterPathFraction-y.firstQuarterPathFraction)<1e-9);
 assert.equal(b.motionObservations.qualityAssessment,'not-assessed');
 assert(!b.findings.some(f=>/too-fast|speed-limit/.test(f.code)));
});
test('exact-frame review maps risk time to decoded PTS and rejects a different video hash',()=>{
 const report={locks:{video:{sha256:'video-a'}},motionObservations:{reviewFrames:[{frame:3,time:.1,reasons:['visibility-boundary'],objects:['pointer']}]}};
 const pts=[2,2.04,2.12,2.16];
 const selected=checker.planAuditFrames(report,'video-a',pts);
 assert.equal(selected[0].sourceFrame,2);assert.equal(selected[0].sourcePtsSeconds,2.12);
 assert(Math.abs(selected[0].relativeSeconds-.12)<1e-9);
 assert.throws(()=>checker.planAuditFrames(report,'video-b',pts),/hash|video/i);
 assert.equal(checker.exactFrameFilter(2),'select=eq(n\\,2)');
 assert.throws(()=>checker.exactFrameFilter(-1),/frame/i);
});

test('missing object samples keep their source indices and do not bridge a false per-frame displacement',()=>{
 const {measureFrameMotion}=observation(),at=(x,opacity=1)=>box('pointer',0,{x,opacity,observation:{state:opacity?'visible':'hidden',reason:'fixture'}});
 const samples=[at(0),null,at(90),at(100,0)].map((o,i)=>({time:i/30,frame:{objects:o?[o]:[]}}));
 const r=measureFrameMotion(samples,['pointer'],{width:200,height:100},30),p=r.objects[0];
 assert.equal(p.maxFrameDisplacementPx,10);assert.equal(p.missingFrames,1);
 assert.equal(p.visibilityEvents[0].frame,3);
 assert(r.reviewFrames.some(f=>f.frame===3&&f.reasons.includes('visibility-boundary')));
 assert(r.reviewFrames.some(f=>f.frame===1&&f.reasons.includes('missing-object-observation')));
});

test('primitive paint rejects stroke and effects that need bounds beyond supported fill geometry',()=>{
 for(const [extra,style]of [[{}, {fill:'#fff',stroke:'#000',strokeWidth:2}],[{filter:'url(#shadow)'},{fill:'#fff'}]]){
  const s=observation().createObservedScene({width:200,height:100});
  assert.throws(()=>s.rect({id:'x',x:10,y:10,width:20,height:20,...extra},style),/raw/i);
 }
});

test('self-intersecting polygons cannot be certified hidden by signed-area cancellation',()=>{
 const {createObservedScene}=observation();
 for(const points of [[[10,10],[90,90],[10,90],[90,10]],[[10,10],[90,90],[10,90],[70,10]]]){
  const s=createObservedScene({width:100,height:100});
  assert.throws(()=>s.polygon({id:'bowtie',points},{fill:'#000'}),/polygon.*raw/i);
 }
 const raw=createObservedScene({width:100,height:100});
 raw.raw({id:'bowtie',x:10,y:10,width:80,height:80},'<polygon points="10,10 90,90 10,90 90,10" fill="#000"/>');
 assert.equal(raw.finish().objects[0].observation.state,'unknown');
 const simple=createObservedScene({width:100,height:100});
 simple.polygon({id:'concave-pointer',points:[[10,10],[10,90],[40,50],[90,50]]},{fill:'#000'});
 assert.equal(simple.finish().objects[0].observation.state,'visible');
});

test('risk requests outside decoded coverage are rejected while measured final-frame duration preserves EOF',()=>{
 const report=time=>({locks:{video:{sha256:'v'}},sampling:{duration:10},motionObservations:{reviewFrames:[{time,frame:150}]}});
 const pts=[2,2+1/30,2+2/30,2.1];
 assert.throws(()=>checker.planAuditFrames(report(5),'v',pts),/outside.*decoded/i);
 assert.throws(()=>checker.planAuditFrames(report(5),'v',pts,{lastFrameDuration:1/30}),/outside.*decoded/i);
 assert.equal(checker.planAuditFrames(report(.1),'v',pts)[0].sourceFrame,3);
 assert.throws(()=>checker.planAuditFrames(report(.12),'v',pts),/outside.*decoded/i);
 assert.equal(checker.planAuditFrames(report(.12),'v',pts,{lastFrameDuration:1/30})[0].sourceFrame,3);
 assert.equal(checker.planAuditFrames(report(4/30),'v',pts,{lastFrameDuration:1/30})[0].sourceFrame,3);
 assert.throws(()=>checker.planAuditFrames(report(.14),'v',pts,{lastFrameDuration:1/30}),/outside.*decoded/i);
 assert.throws(()=>checker.planAuditFrames(report(.1),'v',pts,{lastFrameDuration:-1}),/duration/i);
 // FFprobe decimal PTS rounds repeating fractions; this is precision tolerance, not an extra frame.
 assert.equal(checker.planAuditFrames(report(1/30),'v',[0,.033333])[0].sourceFrame,1);
});
