import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createScene}=require('../../assets/motion/production-core/scene.cjs');
const {exportAudit}=require('../../assets/motion/production-core/audit-adapter.cjs');
const get=(scene,t,id)=>scene.render(t).objects.find(o=>o.id===id);
test('semantic condition chooses the actual changed part, geometry and destination',()=>{
  const repaired=createScene(),blocked=createScene({repairCapacity:0});
  assert.deepEqual(repaired.finalLengths,[48,60,54]);assert.equal(repaired.route,'accepted');
  assert.deepEqual(blocked.finalLengths,[48,76,54]);assert.equal(blocked.route,'rework');
  assert.notDeepEqual(repaired.stateAt(10).position,blocked.stateAt(10).position);
  assert.ok(get(repaired,6.6,'kit.part.b').localGeometry.width<get(blocked,6.6,'kit.part.b').localGeometry.width);
  assert.equal(repaired.render(10).state.received,true);
});
test('moving a defect changes the cutter target and leaves the original good part unchanged',()=>{
  const shifted=createScene({parts:[{id:'a',length:76},{id:'b',length:48},{id:'c',length:54}]});
  assert.equal(shifted.stateAt(5).activePart,0);
  assert.equal(get(shifted,5,'kit.cutter').semantic.target,'a');
  assert.ok(get(shifted,5,'kit.part.a').process.morphProgress>0);
  assert.equal(get(shifted,5,'kit.part.b').process.morphProgress,0);
});
test('cosmetic label substitution does not alter the physical process or classification',()=>{
  const a=createScene(),b=createScene({labels:{source:'零件入口',inspect:'尺寸检查',accepted:'可用',rework:'重做'}});
  for(const t of [0,2,4,5.3,7.8,10])assert.deepEqual(a.stateAt(t),b.stateAt(t));
  assert.notEqual(a.render(0).html,b.render(0).html);
});
test('untouched parts do not morph while the selected part changes locally',()=>{
  const scene=createScene(),before=scene.render(4.25),during=scene.render(5.3),after=scene.render(6.4);
  const width=(f,id)=>f.objects.find(o=>o.id===id).localGeometry.width;
  assert.equal(width(before,'kit.part.a'),width(after,'kit.part.a'));
  assert.ok(width(before,'kit.part.b')>width(during,'kit.part.b'));
  assert.ok(width(during,'kit.part.b')>width(after,'kit.part.b'));
});
test('every rendered object ID and bound comes from an actual draw submission',()=>{
  const scene=createScene(),frame=scene.render(5.3);
  assert.deepEqual(frame.renderedObjectIds,frame.objects.map(o=>o.id));
  for(const o of frame.objects){
    assert.ok([o.x,o.y,o.width,o.height].every(Number.isFinite),o.id);
    assert.equal(o.observation.state,'unknown');
    if(o.worldGeometry.width>0)assert.ok(frame.html.includes(`data-object-id="${o.id}"`),o.id);
  }
  const omitted=scene.render(5.3,{omitIds:['kit']});
  assert.ok(!omitted.html.includes('data-object-id="kit"'));
  assert.ok(!omitted.renderedObjectIds.includes('kit.part.b'));
  // Detached waste is part of the inspection stage and survives removing the transported assembly.
  assert.ok(omitted.renderedObjectIds.includes('kit.offcut.b'));
});
test('depth is real projection and camera takes a curved XYZ route',()=>{
  const scene=createScene(),cams=[.8,1.35,1.9,2.45,3].map(t=>scene.cameraAt(t));
  assert.ok(new Set(cams.map(c=>Math.round(c.position[2]))).size>=4);
  const frame=scene.render(2);
  assert.ok(frame.html.includes('matrix3d('));
  assert.ok(!frame.html.includes('perspective:'));
  const depths=frame.objects.filter(o=>!o.parentId).map(o=>o.worldGeometry.center[2]);
  assert.ok(new Set(depths).size>=3);
});
test('parts retire with their owner, and no independent text erasure is used',()=>{
  const scene=createScene(),[r0,r1]=scene.input.windows.retire,late=r1-.1;
  for(const id of ['kit','kit.part.a','inspection','inspection.title','tray.accepted','tray.accepted.title']){
    const a=get(scene,r0,id).worldGeometry.center,b=get(scene,late,id).worldGeometry.center;
    assert.ok(Math.abs((b[1]-a[1])-scene.stateAt(late).retiredOffset[1])<1e-6,id);
  }
  assert.ok(!scene.render(r1-.2).html.includes('clip-path'));
  const finalFrame=scene.render((Math.ceil(scene.config.duration*scene.config.fps)-1)/scene.config.fps);
  assert.deepEqual(finalFrame.objects.filter(o=>o.width>0&&o.height>0&&o.x+o.width>0&&o.y+o.height>0&&o.x<scene.config.width&&o.y<scene.config.height).map(o=>o.id),[]);
});
test('tool and waste remain at inspection when the workpiece leaves',()=>{
  // Sample after the offcut has landed and settled, while the carrier is travelling, and again before retirement.
  const scene=createScene(),w=scene.input.windows,leaving=w.repair[1]+.35+.55,arrived=w.retire[0]-.05;
  assert.ok(leaving>w.dispatch[0]&&leaving<w.dispatch[1]);
  assert.deepEqual(get(scene,leaving,'kit.offcut.b').worldGeometry.center,get(scene,arrived,'kit.offcut.b').worldGeometry.center);
  assert.deepEqual(get(scene,leaving,'kit.cutter').worldGeometry.center,get(scene,arrived,'kit.cutter').worldGeometry.center);
  assert.notDeepEqual(get(scene,leaving,'kit').worldGeometry.center,get(scene,arrived,'kit').worldGeometry.center);
});
test('foreground operating tool is actually painted after the tilted workpiece',()=>{
  const frame=createScene().render(5);
  const position=id=>frame.html.indexOf(`data-object-id="${id}"`);
  assert.ok(position('kit.cutter')>position('kit.part.b'));
  assert.ok(position('kit.offcut.b')>position('kit.part.b'));
});
test('repair framing exposes the condition, active edge and tool at close reading scale',()=>{
  const scene=createScene(),frame=scene.render(5);
  const kit=frame.objects.find(o=>o.id==='kit');
  assert.ok(kit.width>480,'the workpiece needs an actual close view, not just a smaller camera number');
  for(const id of ['inspection.constraint','kit','kit.cutter','kit.offcut.b']){
    const o=frame.objects.find(x=>x.id===id);
    assert.ok(o.x>=0&&o.y>=0&&o.x+o.width<=scene.config.width&&o.y+o.height<=scene.config.height,id);
  }
  assert.ok(get(scene,5,'kit.cutter').localGeometry.x>get(scene,6.4,'kit.cutter').localGeometry.x);
  assert.ok(get(scene,5,'kit.offcut.b').localGeometry.y>get(scene,4.25,'kit.offcut.b').localGeometry.y);
});
test('close-reading handoff starts from the current projection without a framing jump',()=>{
  // The carrier is already moving (anticipation release), so compare across 1 microsecond: a jump would be units, not 1e-3.
  const scene=createScene(),d0=scene.input.windows.dispatch[0],a=scene.cameraAt(d0-1e-6),b=scene.cameraAt(d0);
  assert.ok(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<1e-3);
  const c=scene.cameraAt(d0+.3-1e-6),d=scene.cameraAt(d0+.3+1e-6);
  assert.ok(Math.hypot(...c.position.map((v,i)=>v-d.position[i]))<.01);
});
test('receiving sockets and waste tray share the delivered objects’ actual anchors',()=>{
  const scene=createScene(),frame=scene.render(10),kit=frame.objects.find(o=>o.id==='kit');
  const socket=frame.objects.find(o=>o.id==='tray.accepted.socket');
  assert.deepEqual(socket.worldGeometry.center.slice(0,2),kit.worldGeometry.center.slice(0,2));
  const bin=frame.objects.find(o=>o.id==='inspection.scrap-bin').localGeometry;
  const waste=frame.objects.find(o=>o.id==='kit.offcut.b').localGeometry;
  assert.ok(waste.x>=bin.x&&waste.y>=bin.y&&waste.x+waste.width<=bin.x+bin.width&&waste.y+waste.height<=bin.y+bin.height);
});
test('adapter invokes production drawing and adopts the same event definitions',()=>{
  const scene=createScene(),spec=exportAudit();
  assert.deepEqual(spec.actions,scene.timeline.actions);
  assert.deepEqual(spec.relays,scene.timeline.relays);
  assert.deepEqual(spec.frameAt(5).objects,scene.render(5).objects);
  assert.deepEqual(spec.frameAt(5).submittedActionIds,spec.actions.map(a=>a.id));
});
test('invalid semantic input or contradictory adopted event windows fail explicitly',()=>{
  assert.throws(()=>createScene({parts:[{id:'a',length:10}]}),/three/);
  assert.throws(()=>createScene({limit:-1}),/limit/);
  assert.throws(()=>createScene({windows:{scan:[1,2]}}),/causality/);
});

test('default stages hand off with overlap instead of stop-then-start',()=>{
  const w=createScene().input.windows;
  for(const [a,b] of [['transport','scan'],['scan','repair'],['repair','dispatch'],['dispatch','overview']])
    assert.ok(w[b][0]<w[a][1]+.35,`${b} should start while ${a} is still settling`);
  // A stage may not start before its cause begins.
  assert.throws(()=>createScene({windows:{repair:[2.5,4.6]}}),/causality/);
});
test('camera approach uses the front-loaded camera curve rather than a symmetric smoothstep',()=>{
  const scene=createScene(),w=scene.input.windows,start=Math.max(w.transport[0],w.transport[1]-1.5),end=w.transport[1];
  const n=60,pos=[...Array(n+1)].map((_,i)=>scene.cameraAt(start+(end-start)*i/n).position);
  const speed=pos.slice(1).map((p,i)=>Math.hypot(...p.map((v,k)=>v-pos[i][k])));
  const peak=speed.indexOf(Math.max(...speed))/n,mean=speed.reduce((a,b)=>a+b,0)/speed.length;
  assert.ok(peak<.4,`peak at ${peak}`);
  assert.ok(Math.max(...speed)/mean>1.9,`peak/mean ${Math.max(...speed)/mean}`);
});
test('contact and receipt produce lagged secondary responses',()=>{
  const scene=createScene(),w=scene.input.windows,arrive=w.transport[1];
  const at=t=>scene.stateAt(t);
  assert.ok(at(arrive+.05).kitPress>at(arrive+.05).benchPress,'the carrier is pressed first');
  assert.ok(at(arrive+.12).benchPress>0,'the bench answers a few frames later');
  assert.equal(at(arrive+.6).kitPress,0);
  assert.ok(at(w.dispatch[1]+.12).trayPress>0,'the receiving tray takes the load');
  assert.ok(Math.abs(at((w.transport[0]+w.transport[1])/2).roll)>1,'the carrier rolls along its arc');
});
