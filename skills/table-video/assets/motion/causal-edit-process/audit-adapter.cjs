// SPDX-License-Identifier: MIT
// Copy this thin adapter with the production files; pass the actual encoded video path.
const path=require('node:path');
const M=require('./process.cjs'),S=require('./scene.cjs');
function exportAudit({videoFile,mode='good',pointer=true,content}={}){
 if(!videoFile)throw Error('Provide the actual encoded videoFile; an SVG or placeholder is not video evidence');
 const options={mode,pointer,...(content?{content}:{})},sourceFiles=[__filename,path.join(__dirname,'process.cjs'),path.join(__dirname,'scene.cjs'),path.resolve(__dirname,'../../../scripts/motion-observation.cjs')];
 const frames=[0,1.75,3.4,5.8,8.2].map(t=>S.frameAt(t,options));
 const objectIds=[...new Set(frames.flatMap(f=>f.renderedObjectIds))],modelFile=sourceFiles[1];
 return {schemaVersion:1,fps:M.fps,duration:M.duration,viewport:{width:M.width,height:M.height},sourceFiles,videoFile:path.resolve(videoFile),
  coverage:{basis:'render-state-final-screen',objectIds,scope:'Production-rendered field values, masks, pointer hotspot and layers; raw text visibility/readability remains unproved.'},
  frameAt:t=>S.frameAt(t,options),actions:M.actions(options),
  checkpoints:[{id:'requirement-readable',time:1.75,objectIds:['requirement'],role:'hold',exception:{kind:'reading',evidence:{sourceFile:modelFile,anchor:'requirement:[1.15,1.75]',reason:'The explicit requirement is established before the good edit begins.'}}}],
  relays:[{id:'edit-then-copy',fromAction:'write-new-field',toAction:'copy-result'}]};
}
module.exports={exportAudit};
