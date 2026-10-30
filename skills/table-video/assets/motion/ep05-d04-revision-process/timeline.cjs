// Public, independently seekable interface. All source times remain unchanged.
const source=require('./source-timeline.cjs');
const model=require('./model.cjs');
const FPS=source.FPS;
const COMPOSITIONS={
  EP05D04Process:{sourceStartFrame:564,sourceEndFrameExclusive:1142,frames:578,scope:'M3/M4: read, knot, circle, rewrite in place, reconnect waveform, hand off voice/subtitle result'},
  EP05D04PaperUnfold:{sourceStartFrame:0,sourceEndFrameExclusive:166,frames:166,scope:'M1: paper falls into slot, receiver responds, same sheet unfolds'},
};
function composition(id='EP05D04Process'){const c=COMPOSITIONS[id];if(!c)throw Error('Unknown composition: '+id);return c;}
function sourceFrame(frame,id='EP05D04Process'){
  const c=composition(id);
  if(!Number.isInteger(frame)||frame<0||frame>=c.frames)throw Error('Frame outside composition: '+frame);
  return c.sourceStartFrame+frame;
}
function stateAtFrame(frame,id='EP05D04Process'){
  const sf=sourceFrame(frame,id);
  return {composition:id,localFrame:frame,localSeconds:frame/FPS,sourceFrame:sf,sourceGlobalFrame:source.F0+sf,...model.state(sf/FPS)};
}
function events(id='EP05D04Process'){
  const c=composition(id),a=c.sourceStartFrame/FPS,b=c.sourceEndFrameExclusive/FPS;
  return source.EVENTS.filter(([, , ,start,end])=>start<b&&(end??start)>=a).map(([shot,kind,description,start,end])=>({
    shot,kind,description,sourceStartSeconds:start,sourceEndSeconds:end,
    sourceStartFrame:Math.round(start*FPS),sourceEndFrame:end===null?null:Math.round(end*FPS),
    localStartFrame:Math.max(0,Math.round(start*FPS)-c.sourceStartFrame),
    localEndFrame:end===null?null:Math.min(c.frames,Math.round(end*FPS)-c.sourceStartFrame),
    basis:'preserved source execution schedule; not a new render measurement or human-verified speech onset',
  }));
}
function facts(){return {
  fps:FPS,width:1920,height:1080,sourceVersion:'dyn-20260925',sourceFrames:1228,
  compositions:Object.fromEntries(Object.keys(COMPOSITIONS).map(id=>[id,{...composition(id),seconds:composition(id).frames/FPS,events:events(id)}])),
  joins:{concatenated:false,reason:'Original media segment [166,564) separates different camera states; no substitute transition authored.'},
  representativeStates:[0,30,84,180,326,350,402,441,507,548,577].map(f=>stateAtFrame(f)),
  paperUnfoldStates:[0,42,57,100,141,165].map(f=>stateAtFrame(f,'EP05D04PaperUnfold')),
};}
module.exports={FPS,COMPOSITIONS,composition,sourceFrame,stateAtFrame,events,facts};
if(require.main===module)process.stdout.write(JSON.stringify(facts(),null,2)+'\n');
