#!/usr/bin/env node
// MIT. Relation-level source locator and real-source sampler; no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inside(root, rel){
  if(typeof rel!=='string'||path.isAbsolute(rel))throw Error('Index paths must be relative');
  const p=fs.realpathSync(path.resolve(root,rel)),r=path.relative(fs.realpathSync(root),p);
  if(r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('Index path escapes package: '+rel);
  return p;
}
export function locate({root=ROOT,relation,id,sample=false}={}){
  if(!relation&&!id)throw Error('Provide relation or id; topic-level omission is not a match.');
  const indexFile=inside(root,'assets/motion/process-index.json');
  const index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
  if(index.schemaVersion!==1||!Array.isArray(index.processes))throw Error('Unsupported process index');
  const terms=relation?.split(/[,，]/).map(s=>s.trim().toLowerCase()).filter(Boolean)||[];
  const selected=index.processes.filter(p=>id?p.id===id:terms.some(t=>p.relations.some(r=>r.toLowerCase()===t)));
  if(!selected.length)throw Error('No local causal relation matched; inspect available relations, not whole-topic similarity.');
  return {schemaVersion:1,basis:'distributed-source-execution; not screen tracking or visual acceptance',index:{path:indexFile,sha256:sha(fs.readFileSync(indexFile))},processes:selected.map(p=>{
    const files=p.implementation.map(f=>{
      const file=inside(root,f.path),bytes=fs.readFileSync(file),text=bytes.toString('utf8');
      return {path:f.path,absolutePath:file,sha256:sha(bytes),anchors:f.anchors.map(a=>{const pos=text.indexOf(a);if(pos<0)throw Error(`Missing source anchor ${a} in ${f.path}`);return {text:a,line:text.slice(0,pos).split('\n').length};})};
    });
    const result={...p,implementation:files};
    if(sample){
      if(p.sampler.unit!=='sourceSeconds')throw Error('Unsupported source timebase');
      const mod=require(inside(root,p.sampler.path)),fn=mod[p.sampler.export];
      if(typeof fn!=='function')throw Error('Missing executable source sampler '+p.sampler.export);
      result.samples=p.sampleSeconds.map(sourceSeconds=>{
        if(!Number.isFinite(sourceSeconds)||sourceSeconds<p.sourceSeconds[0]||sourceSeconds>=p.sourceSeconds[1])throw Error('Sample outside source range');
        const state=fn(sourceSeconds);if(!state||typeof state!=='object')throw Error('Source returned no state');
        return {sourceSeconds,state};
      });
    }
    return result;
  })};
}
async function main(){
  const args=process.argv.slice(2);if(args.includes('--help')){console.log('node scripts/process-locate.mjs --relation 接收,处理 [--sample] [--out project/result.json]\nOr --id ep05-d06-receive-process-deliver. Exact relation aliases in assets/motion/process-index.json. Output includes source paths, hashes, function anchors, actual source samples and reuse boundaries. --sample executes only bundled trusted source; no install, rendering or visual pass.');return;}
  const opts={};let out;
  for(let i=0;i<args.length;i++){const k=args[i];if(k==='--sample')opts.sample=true;else if(['--relation','--id','--out'].includes(k)){const v=args[++i];if(!v||v.startsWith('--'))throw Error('Missing '+k);if(k==='--out')out=v;else opts[k.slice(2)]=v;}else throw Error('Unknown argument '+k);}
  const text=JSON.stringify(locate(opts),null,2)+'\n';if(out)fs.writeFileSync(path.resolve(out),text,{encoding:'utf8',flag:'wx'});else process.stdout.write(text);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
