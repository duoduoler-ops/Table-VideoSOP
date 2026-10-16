// SPDX-License-Identifier: MIT
// Existing-runtime adapter. It never installs dependencies or downloads a browser.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const here=path.dirname(fileURLToPath(import.meta.url));
const exampleEntry=path.resolve(here,'../assets/motion/whole-result-return/src/entry.jsx');
export const help=`Render an editable motion example using an existing local runtime.
Required: --runtime PATH_TO_NODE_MODULES --browser PATH_TO_CHROME --out NEW_DIRECTORY
Optional: --entry FILE --composition ID --mode stills|video --scale NUMBER
          --frames 0,96,228 (stills) | --frames 0-119 (video, inclusive)
          --props JSON_FILE --public-dir DIRECTORY --concurrency INTEGER
Defaults: bundled example / WholeResultReturn / stills / scale 0.5 / concurrency 2.
Example-local frame selection is used only for the bundled entry. A custom entry
defaults to its first, middle and last frame. Video mode is explicitly requested.
All generated files, browser temporary files and logs go under the NEW_DIRECTORY.
Audio is disabled; mix the current adopted audio separately after visual timing.
No output is overwritten. A new run requires a new --out directory.`;

export function parseArgs(argv){
  if(argv.includes('--help')||argv.includes('-h'))return {help:true};
  const allowed=new Set(['runtime','browser','out','entry','composition','mode','scale','frames','props','public-dir','concurrency']);
  const raw={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i]?.replace(/^--/,'');
    if(!argv[i]?.startsWith('--')||!allowed.has(key))throw new Error('Unknown option: '+argv[i]);
    if(raw[key]!==undefined)throw new Error('Duplicate option: --'+key);
    const value=argv[i+1];
    if(value===undefined||value.startsWith('--'))throw new Error('Missing value: --'+key);
    raw[key]=value;
  }
  for(const key of ['runtime','browser','out'])if(!raw[key])throw new Error('Required: --'+key);
  const mode=raw.mode??'stills',scale=Number(raw.scale??.5),concurrency=Number(raw.concurrency??2);
  if(!['stills','video'].includes(mode))throw new Error('--mode must be stills or video');
  if(!Number.isFinite(scale)||scale<=0||scale>4)throw new Error('--scale must be > 0 and <= 4');
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw new Error('--concurrency must be an integer from 1 to 32');
  if(raw.entry&&!raw.composition)throw new Error('A custom --entry requires its --composition ID');
  return {...raw,mode,scale,concurrency,entry:path.resolve(raw.entry??exampleEntry),composition:raw.composition??'WholeResultReturn',
    runtime:path.resolve(raw.runtime),browser:path.resolve(raw.browser),out:path.resolve(raw.out),
    ...(raw.props?{props:path.resolve(raw.props)}:{}),...(raw['public-dir']?{publicDir:path.resolve(raw['public-dir'])}:{})};
}

export function selectFrames(spec,mode,durationInFrames,bundledExample=false){
  if(!Number.isInteger(durationInFrames)||durationInFrames<1)throw new Error('Invalid composition duration');
  const valid=f=>Number.isInteger(f)&&f>=0&&f<durationInFrames;
  if(mode==='video'){
    if(!spec)return [0,durationInFrames-1];
    const match=/^(\d+)-(\d+)$/.exec(spec);
    if(!match)throw new Error('Video --frames requires inclusive START-END');
    const range=match.slice(1).map(Number);
    if(!range.every(valid)||range[0]>range[1])throw new Error('Video frame range is outside the composition');
    return range;
  }
  let frames=spec?spec.split(',').map(v=>/^\d+$/.test(v)?Number(v):NaN):
    bundledExample?[0,96,159,228,366,432,550,660]:[0,Math.floor((durationInFrames-1)/2),durationInFrames-1];
  if(!spec)frames=[...new Set(frames)];
  if(!frames.length||!frames.every(valid))throw new Error('Still --frames must be comma-separated frame numbers inside the composition');
  if(new Set(frames).size!==frames.length)throw new Error('Still frame list contains duplicates');
  return frames;
}

function checkPath(target,kind,label){
  const stat=fs.statSync(target,{throwIfNoEntry:false});
  if(!stat||(kind==='file'?!stat.isFile():!stat.isDirectory()))throw new Error(label+' is not an existing '+kind+': '+target);
}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function render(options){
  checkPath(options.runtime,'directory','Runtime');checkPath(options.browser,'file','Browser');checkPath(options.entry,'file','Entry');
  if(options.publicDir)checkPath(options.publicDir,'directory','Public assets');
  if(options.props)checkPath(options.props,'file','Input props');
  if(fs.existsSync(options.out))throw new Error('Output directory already exists; choose a new --out: '+options.out);
  for(const pkg of ['@remotion/bundler','@remotion/renderer','react','react-dom','remotion'])checkPath(path.join(options.runtime,pkg),'directory',pkg);
  const inputProps=options.props?JSON.parse(fs.readFileSync(options.props,'utf8').replace(/^\uFEFF/,'')):{};
  if(!inputProps||typeof inputProps!=='object'||Array.isArray(inputProps))throw new Error('--props must contain a JSON object');
  const rootPath=path.resolve(here,'..');
  const within=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
  if(within(rootPath,options.out))throw new Error('--out must be outside the Skill source directory');
  if(within(options.runtime,options.out))throw new Error('--out must be outside the existing runtime');
  fs.mkdirSync(path.dirname(options.out),{recursive:true});
  fs.mkdirSync(options.out); // Atomic reservation: another run cannot reuse the same output directory.
  const temp=path.join(options.out,'temp'),framesDir=path.join(options.out,'frames'),publicDir=options.publicDir??path.join(options.out,'public');
  for(const dir of [temp,framesDir,...(options.publicDir?[]:[publicDir])])fs.mkdirSync(dir,{recursive:true});
  // Remotion/Chromium see the process-local temp location before they are imported.
  const previous=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(k=>[k,process.env[k]]));
  for(const key of Object.keys(previous))process.env[key]=temp;
  const logPath=path.join(options.out,'render.jsonl');
  const log=(type,data={})=>{const line=JSON.stringify({time:new Date().toISOString(),type,...data});fs.appendFileSync(logPath,line+'\n');console.log(line);};
  let browser,phase='initializing',restoreSignals;
  const beat=setInterval(()=>log('heartbeat',{phase}),30000);
  const artifacts=[];
  try{
    log('start',{entry:options.entry,composition:options.composition,mode:options.mode,scale:options.scale,entrySha256:hash(options.entry),runtime:options.runtime,browser:options.browser});
    const req=createRequire(import.meta.url);
    const {bundle}=req(path.join(options.runtime,'@remotion/bundler'));
    const {openBrowser,selectComposition,renderStill,renderMedia}=req(path.join(options.runtime,'@remotion/renderer'));
    let cancelled=false;
    const onSignal=()=>{cancelled=true;log('interrupted',{phase});process.exitCode=130;};
    process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
    restoreSignals=()=>{process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);};
    const assertActive=()=>{if(cancelled)throw new Error('Render interrupted');};
    phase='bundling';
    const serveUrl=await bundle({entryPoint:options.entry,outDir:path.join(options.out,'bundle'),rootDir:path.dirname(options.entry),publicDir,enableCaching:false,gitSource:null,
      webpackOverride:cfg=>({...cfg,cache:false,resolve:{...cfg.resolve,modules:[options.runtime,'node_modules'],alias:{...cfg.resolve?.alias,react:path.join(options.runtime,'react'),'react-dom':path.join(options.runtime,'react-dom'),remotion:path.join(options.runtime,'remotion')}}})});
    assertActive();phase='opening existing browser';browser=await openBrowser('chrome',{browserExecutable:options.browser});
    const common={serveUrl,browserExecutable:options.browser,puppeteerInstance:browser,inputProps,timeoutInMilliseconds:120000};
    const composition=await selectComposition({...common,id:options.composition});
    const selection=selectFrames(options.frames,options.mode,composition.durationInFrames,path.resolve(options.entry)===exampleEntry);
    log('composition',{id:composition.id,width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames,selection});
    if(options.mode==='stills'){
      for(const frame of selection){
        assertActive();phase='still '+frame;const output=path.join(framesDir,'F'+String(frame).padStart(5,'0')+'.png');
        await renderStill({...common,composition,frame,output,imageFormat:'png',scale:options.scale,overwrite:false});
        artifacts.push({file:path.relative(options.out,output),frame,bytes:fs.statSync(output).size,sha256:hash(output)});log('still',artifacts.at(-1));
      }
    }else{
      assertActive();phase='video rendering';let prior=-1;const output=path.join(options.out,'motion.mp4');
      await renderMedia({...common,composition,outputLocation:output,codec:'h264',crf:16,pixelFormat:'yuv420p',muted:true,concurrency:options.concurrency,scale:options.scale,frameRange:selection,overwrite:false,
        onProgress:p=>{phase=`rendered ${p.renderedFrames}, encoded ${p.encodedFrames}`;assertActive();const step=Math.floor(p.progress*20);if(step>prior){prior=step;log('progress',{percent:step*5,rendered:p.renderedFrames,encoded:p.encodedFrames});}}});
      artifacts.push({file:'motion.mp4',bytes:fs.statSync(output).size,sha256:hash(output)});log('video',artifacts.at(-1));
    }
    const manifest={composition:{id:composition.id,width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames},scale:options.scale,selection,artifacts,
      validation:'Technical rendering only. Not proof of semantic accuracy, motion quality, audio alignment or user acceptance.'};
    fs.writeFileSync(path.join(options.out,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');log('end',{artifacts:artifacts.length});return manifest;
  }catch(error){log('error',{message:error.message});throw error;}
  finally{
    clearInterval(beat);restoreSignals?.();
    try{if(browser)await browser.close({silent:true});}
    finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const options=parseArgs(process.argv.slice(2));if(options.help)console.log(help);else await render(options);}
  catch(error){console.error(error.message);process.exitCode=process.exitCode||1;}
}
