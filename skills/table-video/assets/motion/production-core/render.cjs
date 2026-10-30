#!/usr/bin/env node
// MIT. Uses an explicitly supplied existing runtime/browser; never installs or downloads.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createScene}=require('./scene.cjs');
const arg=k=>{const value=process.argv.find(x=>x.startsWith('--'+k+'='));return value?.slice(k.length+3);};
async function main(){
  const runtime=arg('runtime'),browserExecutable=arg('browser'),outArg=arg('out');
  if(!runtime||!browserExecutable||!outArg)throw Error('Required: --runtime=<existing node_modules> --browser=<existing executable> --out=<NEW directory>');
  for(const p of [path.join(runtime,'@remotion/bundler/package.json'),path.join(runtime,'@remotion/renderer/package.json'),browserExecutable])if(!fs.existsSync(p))throw Error('Missing existing dependency: '+p);
  const out=path.resolve(outArg);
  if(fs.existsSync(out))throw Error('Output exists. Use a new version directory to preserve the first render: '+out);
  const input=arg('input')?JSON.parse(fs.readFileSync(path.resolve(arg('input')),'utf8').replace(/^\uFEFF/,'')):{};
  const scene=createScene(input),omitIds=(arg('omit')||'').split(',').filter(Boolean);
  const frames=(arg('frames')||'0,90,150,210,285,312,360').split(',').map(Number);
  if(frames.some(f=>!Number.isInteger(f)||f<0||f>=scene.config.duration*scene.config.fps))throw Error('Frame is outside this composition. Supply --frames=... for changed timing.');
  const audio=arg('audio');if(audio&&!fs.statSync(path.resolve(audio)).isFile())throw Error('Audio must be an existing adopted local file');
  fs.mkdirSync(out,{recursive:true});const pub=path.join(out,'public'),sourceDir=path.join(out,'source');fs.mkdirSync(pub);fs.mkdirSync(sourceDir);
  const sourceFiles=fs.readdirSync(__dirname).filter(n=>/\.(cjs|jsx)$/.test(n));
  const sources=sourceFiles.map(name=>{const bytes=fs.readFileSync(path.join(__dirname,name));fs.writeFileSync(path.join(sourceDir,name),bytes);return {name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
  const audioFile=audio?'adopted-audio'+path.extname(audio):null;if(audio)fs.copyFileSync(path.resolve(audio),path.join(pub,audioFile));
  const inputProps={sceneInput:input,omitIds,audioFile};
  const logFile=path.join(out,'render.log'),log=m=>{fs.appendFileSync(logFile,new Date().toISOString()+' '+m+'\n','utf8');console.log(m);};
  let browser,last='bundle',lastReported=-1;const heartbeat=setInterval(()=>log('HEARTBEAT '+last),30000);
  log('START production-core; visual acceptance remains unassessed');
  fs.writeFileSync(path.join(out,'render-manifest.json'),JSON.stringify({created:new Date().toISOString(),input,config:scene.config,omitIds,sources,audio:audio?{path:path.resolve(audio),sha256:crypto.createHash('sha256').update(fs.readFileSync(audio)).digest('hex')}:null,quality:'not-assessed',visibility:'unknown; perspective coordinates alone do not certify pixels'},null,2));
  try{
    const {bundle}=require(path.join(path.resolve(runtime),'@remotion/bundler'));
    const {openBrowser,selectComposition,renderStill,renderMedia}=require(path.join(path.resolve(runtime),'@remotion/renderer'));
    const serveUrl=await bundle({entryPoint:path.join(__dirname,'entry.jsx'),rootDir:__dirname,outDir:path.join(out,'bundle'),publicDir:pub,enableCaching:false,
      webpackOverride:c=>({...c,cache:false,resolve:{...c.resolve,modules:[path.resolve(runtime),...(c.resolve.modules||[])]}})});
    browser=await openBrowser('chrome',{browserExecutable:path.resolve(browserExecutable),logLevel:'error'});
    const opts={serveUrl,browserExecutable:path.resolve(browserExecutable),puppeteerInstance:browser,logLevel:'error'};
    const composition=await selectComposition({...opts,id:'ProductionScene',inputProps});
    for(const frame of frames){last='frame '+frame;await renderStill({...opts,composition,inputProps,frame,imageFormat:'png',output:path.join(out,`f${String(frame).padStart(4,'0')}.png`)});log('FRAME '+frame);}
    if(process.argv.includes('--video')){
      last='video';await renderMedia({...opts,composition,inputProps,codec:'h264',crf:18,imageFormat:'jpeg',jpegQuality:94,concurrency:2,outputLocation:path.join(out,'preview.mp4'),
        onProgress:({progress})=>{last='video '+Math.floor(progress*100)+'%';const bucket=Math.floor(progress*10);if(bucket>lastReported){lastReported=bucket;log(last);}}});
    }
    log('END; rendered only, no 1x viewing claim');
  }catch(error){log('ERROR '+error.stack);throw error;}finally{clearInterval(heartbeat);if(browser)await browser.close({silent:true});}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
