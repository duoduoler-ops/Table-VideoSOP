import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {initialize,status,apply,validate} from '../core.mjs';

async function fixture(name){
  const root=path.resolve(process.env.TABLE_VIDEO_TEST_OUTPUT||'reports/workflow-tests',`${name}-${Date.now()}-${process.pid}`);
  await initialize(root,{testOnly:true,projectId:'batch-test'});
  let seq=0;
  const op=async(type,payload)=>apply(root,{operationId:'op-'+(++seq),expectedRevision:(await status(root)).state.revision,type,payload});
  await fs.writeFile(path.join(root,'evidence.md'),'Synthetic workflow fixture only.');
  const evidence={path:'evidence.md',quote:'Synthetic workflow fixture only.',actor:'test',testOnly:true};
  const register=async(id,kind,extra={})=>{
    await fs.writeFile(path.join(root,id+'.txt'),id);
    await op('register',{id,path:id+'.txt',kind,...extra});
  };
  const approve=async(objectId,aspect,allows,extra={})=>{
    const rid='review-'+(++seq);
    await op('review',{id:rid,objectId,aspect,allows,...extra});
    return (await op('approve',{reviewId:rid,decision:'approved',evidence})).result.approvalId;
  };
  await op('choices',{partial:{allowedVisualLayers:['screen'],narrationSource:'existing',output:{width:1280,height:720}}});
  for(const slot of ['script','narration','design']){
    await register(slot,slot);
    const approvalId=await approve(slot,slot,['adopt:'+slot]);
    await op('adopt',{slot,objectId:slot,approvalId});
  }
  for(const n of [1,2]){
    await register('plan'+n,'config');await register('shot'+n,'static');
    await op('dependency',{from:'plan'+n,to:'shot'+n});
    await op('segment',{id:'D0'+n,objectId:'plan'+n,narrative:'test section',anchors:'test words',route:'screen'});
  }
  return {root,op,approve,register,evidence};
}
test('first batch works without an overview, prepared later targets wait for explicit authorization',async()=>{
  const f=await fixture('scoped-batch');
  await f.approve('shot1','static',['batch-animate']);
  assert.equal((await status(f.root)).adopted.visualOverview,null);
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot1'})).ok,true);
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'plan1'})).ok,true);
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot2'})).ok,false);
  await assert.rejects(f.op('stage',{stage:'S08'}),e=>e.code==='STAGE_BLOCKED');
  await f.approve('shot2','static',['animate']);
  assert.equal((await validate(f.root,{action:'animate',scope:'shot2'})).ok,true);
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot2'})).ok,false);
  await f.approve('shot2','static',['batch-animate']);
  await f.op('stage',{stage:'S08'});
  assert.equal((await status(f.root)).state.currentStage,'S08');
  assert.equal((await validate(f.root,{action:'final',scope:'shot1'})).ok,false);
});
test('changed target, revoked approval, pending target and known failure remain blockers',async()=>{
  const f=await fixture('batch-evidence');
  const approval=await f.approve('shot1','static',['batch-animate']);
  await f.op('review',{id:'pending-shot2',objectId:'shot2',aspect:'static',allows:['batch-animate']});
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'plan2'})).ok,false);
  await f.op('qa',{checkId:'defect',objectId:'shot1',aspect:'visual',result:'未通过',method:'inspection',reason:'Synthetic known defect.',evidence:f.evidence});
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot1'})).ok,false);
  await f.op('revoke',{approvalId:approval});
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot1'})).ok,false);
  await fs.appendFile(path.join(f.root,'shot2.txt'),'changed');
  await assert.rejects(f.op('approve',{reviewId:'pending-shot2',decision:'approved',evidence:f.evidence}),e=>['STALE_OBJECT','STALE_REVIEW'].includes(e.code));
  await assert.rejects(f.op('review',{id:'fake',objectId:'plan1',aspect:'static',allows:['batch-animate']}),e=>e.code==='BATCH_TARGET');
});
test('valid legacy overview coverage is accepted without changing stored schema',async()=>{
  const f=await fixture('legacy-batch');
  await f.register('overview','static');
  await f.approve('shot1','static',['animate']);await f.approve('shot2','static',['animate']);
  const approvalId=await f.approve('overview','visual-overview',['batch-animate','adopt:visualOverview'],{covers:['plan1','shot1','plan2','shot2']});
  await f.op('adopt',{slot:'visualOverview',objectId:'overview',approvalId});
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'plan1'})).ok,true);
  await f.op('stage',{stage:'S08'});
  await fs.appendFile(path.join(f.root,'shot2.txt'),'changed');
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot1'})).ok,true);
  assert.equal((await validate(f.root,{action:'batch-animate',scope:'shot2'})).ok,false);
});
