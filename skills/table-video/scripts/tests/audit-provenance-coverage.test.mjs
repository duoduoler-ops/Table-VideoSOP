import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import observation from '../motion-observation.cjs';
import {auditMotion} from '../motion-audit.mjs';
import {evaluateSpec} from '../motion-gates.mjs';
const {createObservedScene,visibleState,recordedFrameState}=observation;
const self=fileURLToPath(import.meta.url),viewport={width:1920,height:1080};
const smooth=(t,a,b)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);};
function production(){
 const actions=[
  {id:'body-a',objectId:'body-a',kind:'transfer',start:.2,end:.6},
  {id:'part-a',objectId:'part-a',kind:'process',channels:['y'],start:.3,end:.7},
  {id:'body-b',objectId:'body-b',kind:'transfer',start:1.2,end:1.6},
  {id:'part-b',objectId:'part-b',kind:'process',channels:['y'],start:1.3,end:1.7},
 ];
 const frameAt=t=>{
  const s=createObservedScene(viewport);
  for(const [suffix,y,start] of [['a',100,.2],['b',550,1.2]]){
   s.rect({id:'body-'+suffix,x:100,y,width:1100,height:350,transform:[1,0,0,1,100*smooth(t,start,start+.4),0]},{fill:'#fff'});
   s.rect({id:'part-'+suffix,parentId:'body-'+suffix,x:140,y:y+40,width:100,height:80,transform:[1,0,0,1,0,80*smooth(t,start+.1,start+.5)]},{fill:'#000'});
  }
  s.rect({id:'decoration',parentId:'body-a',x:1100,y:120,width:30,height:30},{fill:'#000'});
  return s.finish();
 };
 return{schemaVersion:1,fps:60,duration:2,viewport,sourceFiles:[self],coverage:{basis:'render-state-final-screen',objectIds:['body-a','part-a','body-b','part-b','decoration'],mainContentIds:['body-a','body-b'],scope:'Two production parent/part events with static decoration'},actions,frameAt,checkpoints:[{id:'pass',time:.4,objectIds:['body-a','part-a'],role:'pass'}],relays:[{id:'relay-a',fromAction:'body-a',toAction:'part-a',motionGate:'follow'},{id:'relay-b',fromAction:'body-b',toAction:'part-b',motionGate:'follow'}]};
}
test('author state/basis strings and copied observation JSON do not establish paint',()=>{
 const s=createObservedScene(viewport);s.rect({id:'a',x:20,y:20,width:100,height:50},{fill:'#fff'});const f=s.finish(),o=f.objects[0];
 assert.equal(visibleState(o,viewport).state,'visible');
 assert.equal(visibleState({...o,observation:{...o.observation}},viewport).state,'unknown');
 assert.equal(visibleState({...o,x:50},viewport).state,'unknown');
 assert.equal(visibleState({...o,id:'other'},viewport).state,'unknown');
 assert.equal(visibleState(o,{width:800,height:600}).state,'unknown');
 assert.equal(visibleState({...o,observation:{state:'visible',basis:'production-recorded-geometry',reason:'production-recorder'}},viewport).state,'unknown');
 assert.equal(recordedFrameState(f).status,'recorded');
 assert.equal(recordedFrameState({...f}).status,'unverified');
});
test('actual opaque foreground hides primitive content while unsupported raw/projected paint stays unknown',()=>{
 const s=createObservedScene(viewport);
 s.rect({id:'text',x:100,y:100,width:150,height:30},{fill:'#000'});
 s.rect({id:'cover',x:80,y:80,width:200,height:100,z:2},{fill:'#fff'});
 s.raw({id:'perspective',x:400,y:100,width:100,height:100},'<path d="M400 100L500 120L480 200Z" fill="#fff"/>');
 const f=s.finish();assert.equal(visibleState(f.objects.find(o=>o.id==='text'),viewport).state,'hidden');
 assert.equal(visibleState(f.objects.find(o=>o.id==='perspective'),viewport).state,'unknown');
});
test('fully represented production events pass follow scope without moving static decoration',()=>{
 const spec=production(),a=auditMotion(spec,{requireVideo:false}),g=evaluateSpec(spec).gates.find(g=>g.id===3);
 assert.equal(g.status,'通过',JSON.stringify(g));
 assert.equal(a.actionCoverage.status,'represented-sampled-changes');
 assert.deepEqual(a.actionCoverage.follow.uncoveredRelayIds,[]);
 assert.deepEqual(a.processCoverage.unmeasuredPartIds,[]);
 assert(a.processCoverage.inactivePartIds.includes('decoration'));
 assert.equal(a.renderInventory.status,'recorded');
 assert.equal(a.coverageGaps.length,0,JSON.stringify(a.coverageGaps));
 assert.equal(a.visualAcceptance,'not-assessed');
});
test('one selected passing follow cannot green the second unmeasured production relay',()=>{
 const spec=production();delete spec.relays[1].motionGate;
 const g=evaluateSpec(spec).gates.find(g=>g.id===3),a=auditMotion(spec,{requireVideo:false});
 assert.equal(g.measured.items[0].status,'通过');assert.equal(g.status,'无法测量');
 assert.deepEqual(g.measured.coverage.uncoveredRelayIds,['relay-b']);
 assert(a.coverageGaps.some(x=>x.includes('relay-b')));
});
test('removing a relation or a main event exposes sampled parent/part and action gaps',()=>{
 const spec=production();spec.relays.pop();
 const a=auditMotion(spec,{requireVideo:false});
 assert(a.actionCoverage.follow.relatedActionCandidates.some(c=>c.partAction==='part-b'));
 assert.equal(evaluateSpec(spec).gates.find(g=>g.id===3).status,'无法测量');
 spec.actions=spec.actions.filter(a=>a.id!=='part-b');
 const b=auditMotion(spec,{requireVideo:false});assert(b.actionCoverage.uncoveredChanges.some(c=>c.objectId==='part-b'));
});
test('legacy self-reported visibility retains coordinate measurements with incomplete coverage',()=>{
 const spec=production(),render=spec.frameAt;spec.frameAt=t=>JSON.parse(JSON.stringify(render(t)));
 const a=auditMotion(spec,{requireVideo:false});
 assert.equal(a.status,'incomplete');assert.equal(a.renderInventory.status,'declared-unverified');
 assert(a.motionObservations.objects.some(o=>o.totalPathPx>0));
 assert(a.motionObservations.objects.some(o=>o.unknownVisibilityFrames>0));
 assert(a.coverageGaps.some(x=>/visibility unresolved/.test(x)));
});

test('raw sparse or out-of-bounds paint cannot certify opaque hiding or uncovered lower pixels',()=>{
 for(const [bounds,body]of [[{x:0,y:0,width:1920,height:1080},'<path d="M10 10h1v1h-1Z" fill="black"/>'],[{x:10,y:10,width:1,height:1},'<rect width="1920" height="1080" fill="black"/>']]){
  const s=createObservedScene(viewport);s.rect({id:'lower',x:100,y:100,width:200,height:80},{fill:'#fff'});
  s.raw({id:'raw',...bounds},body);const f=s.finish();
  assert.equal(visibleState(f.objects[0],viewport).state,'unknown');
  assert.equal(visibleState(f.objects[1],viewport).state,'unknown');
 }
 const s=createObservedScene(viewport);
 s.raw({id:'text',x:10,y:10,width:10,height:10},'<text x="800" y="500">outside the declared bbox</text>');
 s.rect({id:'cover',x:0,y:0,width:50,height:50,z:2},{fill:'#fff'});
 assert.equal(visibleState(s.finish().objects[0],viewport).state,'unknown');
});


test('zero author bbox cannot hide positive-area raw paint or erase its recorded unknown',()=>{
 for(const bounds of [{width:0,height:0},{width:0,height:100},{width:100,height:0}]){
  const s=createObservedScene(viewport);
  s.raw({id:'raw-fullscreen',x:0,y:0,...bounds},'<rect width="1920" height="1080" fill="black"/>');
  const frame=s.finish(),o=frame.objects[0];
  assert(frame.svg.includes('<rect width="1920" height="1080" fill="black"/>'));
  assert.equal(recordedFrameState(frame).status,'recorded');
  assert.equal(o.observation.state,'unknown');
  assert.equal(visibleState(o,viewport).state,'unknown');
  assert.equal(visibleState(JSON.parse(JSON.stringify(o)),viewport).state,'unknown');
 }
});
test('actual primitive zero area and actual zero opacity remain hidden',()=>{
 for(const bounds of [{width:0,height:0},{width:0,height:100},{width:100,height:0}]){
  const s=createObservedScene(viewport);s.rect({id:'empty-primitive',x:0,y:0,...bounds},{fill:'#000'});
  assert.equal(visibleState(s.finish().objects[0],viewport).state,'hidden');
 }
 const s=createObservedScene(viewport);
 s.raw({id:'transparent-raw',x:0,y:0,width:0,height:0,opacity:0},'<rect width="1920" height="1080" fill="black"/>');
 const o=s.finish().objects[0];
 assert.equal(visibleState(o,viewport).state,'hidden');
 assert.equal(visibleState(JSON.parse(JSON.stringify(o)),viewport).state,'hidden');
});
test('zero-bbox raw paint remains an explicit engineering visibility gap',()=>{
 const spec=production();
 spec.coverage.objectIds=['raw-fullscreen'];spec.coverage.mainContentIds=['raw-fullscreen'];
 spec.actions=[{id:'raw-event',objectId:'raw-fullscreen',kind:'transfer',start:0,end:2}];
 spec.checkpoints=[];spec.relays=[];
 spec.frameAt=()=>{const s=createObservedScene(viewport);s.raw({id:'raw-fullscreen',x:0,y:0,width:0,height:0},'<rect width="1920" height="1080" fill="black"/>');return s.finish();};
 const a=auditMotion(spec,{requireVideo:false});
 assert(a.coverageGaps.some(g=>g.startsWith('Painted visibility unresolved for raw-fullscreen')));
 assert(a.motionObservations.objects[0].unknownVisibilityFrames>0);
});
