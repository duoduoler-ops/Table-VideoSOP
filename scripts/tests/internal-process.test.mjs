import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {locate} from '../process-locate.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const revision=require('../../assets/motion/ep05-d04-revision-process/internal-process.cjs');
const adaptation=require('../../assets/motion/ep05-d06-task-relay/internal-process.cjs');
const model=require('../../assets/motion/ep05-d04-revision-process/model.cjs');
const docContent={title:'剪辑说明',context:['先确认本期采用的原稿。','读取叙述与操作的对应关系。','检查读起来不顺的句子。','保留原稿其余部分。'],before:'先装底层工具让代码进行剪辑拼接音视频等多项操作',after:'装好工具后，用代码剪辑和拼接音视频。'};
const adaptContent={before:['长度：一个字符串','尺寸：一个字符串','声音：一句话'],after:['时长：独立数值字段','画幅：宽度 × 高度','声音：环境声与拟音'],requirements:['输入字段须分别提供','时长采用秒','宽高采用数字','保留文件路径','保留原始输入','结构拆成独立字段','动作须有起止时间','声音须明确来源','不要添加无关指令','保存修改后的副本']};
test('D04 keeps source knot/path math and successful-revision causality',()=>{
  const stuck=revision.stateAt(15.6),editing=revision.stateAt(16.6),done=revision.stateAt(17.05);
  assert.equal(stuck.wave.knot,1);assert.equal(stuck.sentence.reveal,0);assert.equal(stuck.result.check,0);
  assert.equal(stuck.wave.knot,model.state(15.6).wave.knot);
  assert.equal(stuck.wave.knot>0,true);assert.equal(stuck.wave.oldRemove,0);
  assert.equal(stuck.wave.fresh,'');assert(editing.wave.fresh.length>50);assert(done.wave.fresh.length>editing.wave.fresh.length);
  assert(stuck.reading.before>0&&stuck.reading.before<1,'The reading cursor stops inside the old sentence, not at its end');
  assert.equal(done.sentence.remove,1);assert.equal(done.sentence.reveal,1);assert.equal(done.sentence.height,26);
  assert(done.result.check>.99);assert.equal(done.wave.oldRemove,1);assert.equal(done.wave.newConnect,1);
  const expected=model.pd(model.knotPts(1));assert.equal(stuck.wave.knot,1);assert.equal(stuck.wave.knot===model.state(15.6).wave.knot,true);
  // Paths are separate from scalar driver fields: do not let extraction shadow them.
  assert.equal(stuck.wave.knotPath,expected);
});
test('D06 requirement precedes rewrite; rewritten rows and mating teeth settle together',()=>{
  const read=adaptation.stateAt(32.6,adaptContent),pick=adaptation.stateAt(32.98,adaptContent),mid=adaptation.stateAt(33.25,adaptContent),done=adaptation.stateAt(33.75,adaptContent);
  assert(read.document.read>0);assert.equal(read.rewrite,0);assert.equal(read.document.pick,0);
  assert(pick.document.pick>0);assert.equal(pick.rewrite,0);assert(mid.rewrite>0);assert(mid.teethK>0);
  assert(done.rows.every(r=>r.erase===1&&r.reveal===1));assert.equal(done.teethK,1);
  assert.equal(new Set(read.teeth.map(t=>`${t.y}/${t.height}`)).size,4);
  assert.equal(new Set(done.teeth.map(t=>`${t.y}/${t.height}`)).size,2);
  assert.equal(done.dockX,0);assert.equal(done.contact,0);assert(adaptation.stateAt(33.58).contact>.9);
});
test('same state renders the same static or dynamic SVG; custom content is escaped and drives wave shape',()=>{
  for(const [entry,t,content] of [[revision,16.6,docContent],[adaptation,33.3,adaptContent]]){
    const s=entry.stateAt(t,content),again=entry.stateAt(t,content);
    assert.deepEqual(s,again);assert.equal(entry.renderDocument(s),entry.renderDocument(JSON.parse(JSON.stringify(s))));
    assert(entry.renderDocument(s).includes(entry.renderSvg(s)));
    assert.throws(()=>entry.stateAt(NaN),/finite/);assert.throws(()=>entry.renderSvg(s,{idPrefix:'bad id'}),/safe unique/);
    assert.deepEqual(entry.stateAt(-100,content),entry.stateAt(entry.sourceRange[0],content));
    s.bounds.width=1;s.content[entry===revision?'context':'requirements'][0]='mutated';
    assert.deepEqual(entry.stateAt(t,content),again,'Caller mutation cannot change later snapshots or content options');
  }
  const s=revision.stateAt(16.8,{...docContent,after:'<输入 & 输出>'});assert(revision.renderSvg(s).includes('&lt;输入 &amp; 输出&gt;'));
  assert.notEqual(s.wave.fresh,revision.stateAt(16.8,docContent).wave.fresh);
  const long={...docContent,after:'长'.repeat(200)};assert.equal(revision.stateAt(15,long).wave.width,revision.stateAt(17,long).wave.width);
  assert.throws(()=>revision.stateAt(16,{context:[]}),/four context/);
  assert.throws(()=>adaptation.stateAt(33,{after:[]}),/three before/);
});
test('locator gives internal render anchors and semantic boundaries without requiring full output',()=>{
  const r=locate({root,relation:'观察,重排,三版比较'});
  for(const id of ['semantic-inspection','ep05-d06-adapt-return','whole-result-return'])assert(r.processes.some(p=>p.id===id));
  const d=locate({root,id:'ep05-d04-inspect-rewrite-handoff'}).processes[0];
  assert(d.componentChain.length>=3);assert(d.driverFields.VoiceStrip.includes('wavePts/knotPts'));assert(d.portableEntry.path.endsWith('internal-process.cjs'));
  assert(d.implementation.some(f=>f.anchors.some(a=>a.text==='function Paper(')));
  assert(d.implementation.some(f=>f.anchors.some(a=>a.text==='function VoiceStrip(')));
  assert(d.limits.includes('仍不解决'));
});
const sharpRuntime=process.env.TABLE_VIDEO_SHARP_RUNTIME;
test('actual sharp pixels show linked internal changes while unchanged context stays fixed',{skip:!sharpRuntime&&'Set TABLE_VIDEO_SHARP_RUNTIME to an existing node_modules directory for the pixel check'},async()=>{
  const sharp=require(path.join(sharpRuntime,'sharp'));
  const frames=[];
  async function pixels(entry,t,content,name){
    const s=entry.stateAt(t,content),svg=entry.renderDocument(s),png=await sharp(Buffer.from(svg)).png().toBuffer();
    const raw=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});frames.push({name,t,png,svg,raw});return raw;
  }
  function diff(a,b,box){let n=0;for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++){const i=(y*a.info.width+x)*4;if(a.data.subarray(i,i+4).some((v,c)=>v!==b.data[i+c]))n++;}return n;}
  const a=await pixels(revision,15.6,docContent,'d04-stuck'),b=await pixels(revision,16.6,docContent,'d04-rewriting'),c=await pixels(revision,17.05,docContent,'d04-connected');
  const measures={sentence:diff(a,c,{x:50,y:270,width:660,height:145}),wave:diff(a,c,{x:28,y:464,width:704,height:80}),fixedContext:diff(a,c,{x:28,y:20,width:704,height:230})};
  assert(measures.sentence>300);assert(measures.wave>300);assert.equal(measures.fixedContext,0);
  const d=await pixels(adaptation,32.6,adaptContent,'d06-reading'),e=await pixels(adaptation,33.25,adaptContent,'d06-reordering'),f=await pixels(adaptation,33.75,adaptContent,'d06-connected');
  measures.document=diff(d,f,{x:28,y:50,width:352,height:448});measures.input=diff(e,f,{x:510,y:185,width:330,height:210});measures.teeth=diff(e,f,{x:810,y:150,width:72,height:270});
  assert(measures.document>300);assert(measures.input>300);assert(measures.teeth>100);
  if(process.env.TABLE_VIDEO_PIXEL_REPORT){
    const out=path.resolve(process.env.TABLE_VIDEO_PIXEL_REPORT);fs.mkdirSync(out,{recursive:true});
    for(const {name,png,svg} of frames){fs.writeFileSync(path.join(out,name+'.png'),png);fs.writeFileSync(path.join(out,name+'.svg'),svg);}
    const tiles=[];for(let i=0;i<frames.length;i++){const label=Buffer.from(`<svg width="500" height="310"><rect width="500" height="310" fill="#f7f3e9"/><text x="12" y="300" font-size="16">${frames[i].name} @ ${frames[i].t}s</text></svg>`);const tile=await sharp(label).composite([{input:await sharp(frames[i].png).resize(500,280,{fit:'contain',background:'#f7f3e9'}).toBuffer(),top:0,left:0}]).png().toBuffer();tiles.push({input:tile,left:(i%3)*500,top:Math.floor(i/3)*310});}
    await sharp({create:{width:1500,height:620,channels:4,background:'#f7f3e9'}}).composite(tiles).png().toFile(path.join(out,'internal-process-contact-sheet.png'));
    fs.writeFileSync(path.join(out,'pixel-evidence.json'),JSON.stringify({basis:'actual sharp output; not 1x video review or semantic acceptance',measures,frames:frames.map(({name,t})=>({name,sourceSeconds:t}))},null,2)+'\n');
  }
});
