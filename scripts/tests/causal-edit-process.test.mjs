// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {locate} from '../process-locate.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const M=require('../../assets/motion/causal-edit-process/process.cjs');
const S=require('../../assets/motion/causal-edit-process/scene.cjs');
const d06=require('../../assets/motion/ep05-d06-task-relay/internal-process.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));

test('relation lookup separates unsuccessful revision from a requirement-driven successful change',()=>{
 const failure=locate({root,relation:'反复修改'}).processes;
 assert(failure.some(p=>p.id==='whole-result-return'));assert(!failure.some(p=>p.id==='ep05-d04-inspect-rewrite-handoff'));
 const positive=locate({root,relation:'要求驱动修改',sample:true}).processes;
 assert.equal(positive.length,1);assert.equal(positive[0].id,'causal-field-edit');
 const before=positive[0].samples[0].state;assert(before.rows.every(r=>r.edit===0));assert.equal(before.requirement.progress,0);
 assert(positive[0].samples.at(-1).state.result.matchesRequirement);
});

test('same outcome does not erase the premature-cause counterexample',()=>{
 const a=M.stateAt(1.1),b=M.stateAt(1.1,{mode:'premature'});
 assert.equal(a.requirement.progress,0);assert.equal(a.selection.progress,0);assert(a.rows.every(r=>r.edit===0));
 assert.equal(b.requirement.progress,0);assert.equal(b.selection.progress,1);assert.equal(b.rows[0].edit,1);
 const end=M.stateAt(8),bad=M.stateAt(8,{mode:'premature'});
 assert.equal(end.result.value,bad.result.value);assert(end.result.matchesRequirement);
 assert.deepEqual(end.content,bad.content);assert.equal(end.duration,bad.duration);
});

test('requirement selects the actual field; an unrelated edit cannot repair the output',()=>{
 const good=M.stateAt(5.8),bad=M.stateAt(5.8,{mode:'wrong-target'});
 assert.equal(good.rows[0].after,'2026-10-29');assert.equal(good.result.value,'2026-10-29');
 assert.deepEqual(good.rows.slice(1).map(r=>[r.value,r.after,r.edit]),[['12','12',0],['杭州','杭州',0]]);
 assert.equal(bad.rows[1].after,'24');assert.equal(bad.rows[0].edit,0);assert.equal(bad.result.value,'2026/10/29');assert.equal(bad.result.matchesRequirement,false);
 const content={title:'另一条记录',fields:[{id:'city',label:'城市',value:'南京'},{id:'count',label:'人数',value:'18'},{id:'departure',label:'出发日',value:'2026/11/03'}],requirement:{targetId:'departure',label:'出发日',operation:'date-separators',separator:'.'}};
 const changed=M.stateAt(5.8,{content});assert.equal(changed.selection.targetId,'departure');assert.equal(changed.result.value,'2026.11.03');assert.equal(changed.rows[0].edit,0);assert.equal(changed.rows[1].edit,0);
 assert.throws(()=>M.stateAt(1,{content:{...content,requirement:{...content.requirement,targetId:'missing'}}}),/existing field/);
});

test('production pointer is registered while hidden and leaves the viewport before deletion',()=>{
 const registered=S.frameAt(7.3).objects.find(o=>o.id==='cursor');assert(registered);assert.equal(registered.observation.state,'hidden');assert.equal(registered.opacity,0);
 const before=S.frameAt(7.1666666667).objects.find(o=>o.id==='cursor');assert(before.hotspot.y>720);assert.equal(before.observation.state,'hidden');assert.equal(before.opacity,1);
 const visible=S.frameAt(2.7).objects.find(o=>o.id==='cursor');assert.equal(visible.observation.state,'visible');assert(visible.hotspot.x>0&&visible.hotspot.x<1280);
 const missing=S.frameAt(2.7,{pointer:false}).objects.find(o=>o.id==='cursor');assert.equal(missing.observation.state,'hidden');assert(!M.actions({pointer:false}).some(a=>a.objectId==='cursor'));
 const flashBefore=S.frameAt(3.9333333333,{mode:'flash'}).objects.find(o=>o.id==='cursor'),flashAfter=S.frameAt(3.9666666667,{mode:'flash'}).objects.find(o=>o.id==='cursor');
 assert.equal(flashBefore.observation.state,'visible');assert.equal(flashAfter.opacity,0);assert(flashAfter.hotspot.x<1280&&flashAfter.hotspot.y<720);
});

test('same renderer exposes actual masking and layer errors, without claiming raw text is painted visibility',()=>{
 const f=S.frameAt(2.7),bad=S.frameAt(2.7,{mode:'flash'});
 assert.equal(f.objects.find(o=>o.id==='cursor').observation.state,'visible');assert.equal(bad.objects.find(o=>o.id==='cursor').observation.state,'hidden');
 const text=f.objects.find(o=>o.id==='date-old');assert.equal(text.observation.state,'unknown');
 const hidden=S.frameAt(0).objects.find(o=>o.id==='date-new');assert.equal(hidden.observation.state,'hidden');
 assert.deepEqual(new Set(f.renderedObjectIds),new Set(f.objects.map(o=>o.id)));
 for(const id of f.renderedObjectIds)assert(f.svg.includes(`data-object="${id}"`));
});

test('tracking example distributes the approach rather than copying the fast transfer curve',()=>{
 const peak=mode=>{let max=0,prev=M.stateAt(0,{mode}).cursor;for(let f=1;f<Math.round(M.duration*M.fps);f++){const c=M.stateAt(f/M.fps,{mode}).cursor;if(c.drawn&&prev.drawn)max=Math.max(max,Math.hypot(c.x-prev.x,c.y-prev.y));prev=c;}return max;};
 assert(peak('flash')>peak('good')*3,'Example-local regression: the flash fixture must remain a meaningfully different speed distribution');
 const at=t=>M.stateAt(t).cursor,a=at(1.85),b=at(2.7),p=at(1.95);
 assert(Math.hypot(p.x-a.x,p.y-a.y)<Math.hypot(b.x-a.x,b.y-a.y)*.03);
});

test('browser and Node use the same production state and observation renderer with random access',()=>{
 const context=vm.createContext({});for(const relative of ['scripts/motion-observation.cjs','assets/motion/causal-edit-process/process.cjs','assets/motion/causal-edit-process/scene.cjs'])vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context);
 for(const mode of ['good','premature','wrong-target','flash'])for(const t of [0,3.7,2.15,8.2,1.2]){
  const state=M.stateAt(t,{mode}),frame=S.frameAt(t,{mode});
  assert.deepEqual(copy(context.CausalEditProcess.stateAt(t,{mode})),state);
  assert.equal(context.CausalEditScene.frameAt(t,{mode}).svg,frame.svg);
  assert.equal(S.renderDocument(state),frame.svg);
 }
 const before=M.stateAt(3.5);M.stateAt(3.5).rows[0].value='mutated';assert.deepEqual(M.stateAt(3.5),before);
 assert.deepEqual(M.stateAt(-5),M.stateAt(0));assert.deepEqual(M.stateAt(200),M.stateAt(M.duration));
});

test('D06 portable adaptation binds the selected requirement and changes only its addressed rows',()=>{
 const options={binding:{requirementIndex:1,rowIds:['duration']}};
 const s=d06.stateAt(33.75,options);
 assert.equal(s.document.selectedRow,1);
 assert.equal(s.rows[0].reveal,1);assert.equal(s.rows[1].reveal,0);assert.equal(s.rows[2].reveal,0);
 assert(s.rows[1].before===s.rows[1].after&&s.rows[2].before===s.rows[2].after);
 assert.throws(()=>d06.stateAt(33,{binding:{requirementIndex:1,rowIds:['missing']}}),/row/);
});
