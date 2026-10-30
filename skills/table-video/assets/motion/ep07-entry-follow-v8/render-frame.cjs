'use strict';
// MIT. Dependency-free SVG frame output; PNG uses only an explicitly supplied runtime.
const fs=require('node:fs'),path=require('node:path');
const {frameAt,CONFIG}=require('./src/scene.cjs');
async function main(){
  const args=process.argv.slice(2),opts={};
  if(args.includes('--help')){
    console.log('node render-frame.cjs --seconds 11.6 --out <new.svg|new.png> [--runtime <existing node_modules>]\nNo install, video, audio, or visual acceptance. Output parent must exist; existing files are not overwritten.');return;
  }
  for(let i=0;i<args.length;i++){
    const key=args[i];if(!['--seconds','--out','--runtime'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid argument '+key);
    opts[key.slice(2)]=args[++i];
  }
  const time=Number(opts.seconds),out=opts.out&&path.resolve(opts.out);
  if(opts.seconds===undefined||!Number.isFinite(time)||time<0||time>=CONFIG.duration||!out)throw Error('Provide seconds in [0,13.2) and a new output path.');
  if(fs.existsSync(out))throw Error('OUTPUT_EXISTS: choose a new file.');
  const svg=frameAt(time).svg;
  if(path.extname(out).toLowerCase()==='.svg')fs.writeFileSync(out,svg,{encoding:'utf8',flag:'wx'});
  else if(path.extname(out).toLowerCase()==='.png'){
    if(!opts.runtime)throw Error('PNG requires --runtime pointing to existing node_modules containing sharp.');
    const sharp=require(path.resolve(opts.runtime,'sharp'));
    const png=await sharp(Buffer.from(svg)).png().toBuffer();fs.writeFileSync(out,png,{flag:'wx'});
  }else throw Error('Only .svg and .png are supported.');
  console.log(JSON.stringify({seconds:time,out,source:'src/scene.cjs',visualAcceptance:'not-assessed'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
