'use strict';
// MIT. Thin lookup adapter: never recompute an idealized second trajectory.
const scene=require('./scene.cjs');
const path=require('node:path');
const {CAMERA_EVENTS}=require('./camera.cjs');
function state(seconds){
  const {objects,camera,events}=scene.frameAt(seconds);
  return {seconds,objects,camera,events};
}

// Inventory is derived from actual source states, not another animation schedule.
// Keep identities when absent; opacity 0 means no claimed visible geometry.
const renderedIds=()=>{
  const ids=new Set();
  for(let f=0;f<=scene.CONFIG.duration*scene.CONFIG.fps;f++)
    for(const object of scene.frameAt(f/scene.CONFIG.fps).objects)ids.add(object.id);
  return [...ids];
};
function exportAudit({videoFile}={}){
  const {width,height,fps,duration}=scene.CONFIG,objectIds=renderedIds();
  const sceneSource=path.join(__dirname,'scene.cjs');
  return {
    schemaVersion:1,fps,duration,viewport:{width,height},videoFile,
    sourceFiles:[__filename,sceneSource,path.join(__dirname,'camera.cjs'),path.join(__dirname,'mg-primitives.cjs')],
    coverage:{
      basis:'render-state-final-screen',objectIds,
      scope:'All IDs observed in actual render-frame states, including primary cards, files, carriers, receivers, history and paths. Final-screen declared bbox = actual world bbox composed with the same camera transform; absent or fully off-viewport IDs remain opacity 0. No pixel or occlusion inference.',
      limitations:[
        'Declared object bounds can exceed painted or clipped area; opacity 1 does not prove visible pixels or entry.',
        'No bounding-box proof for line-prefix growth, fold area, notch deformation, masks, text or layer occlusion; verify.cjs --runtime checks actual path pixels separately.',
        'ACTIONS covers its declared motions only. Camera range is measured; exact subject binding and follow-to-wide joins are separately tested by verify.cjs.',
        'Inventory samples all output frames, not arbitrary subframe-only hidden constructs. The adapter is an example bridge, not complete perceptual QA.'
      ],
      cameraEvents:CAMERA_EVENTS,
    },
    frameAt(seconds){
      const actual=scene.frameAt(seconds),objects=new Map(actual.objects.map(o=>[o.id,o])),cam=actual.camera;
      return {camera:{cx:cam.cx,cy:cam.cy,z:cam.z},objects:objectIds.map(id=>{
        const o=objects.get(id);
        if(!o)return {id,x:0,y:0,width:0,height:0,opacity:0};
        const x=width/2+(o.x-cam.cx)*cam.z,y=height/2+(o.y-cam.cy)*cam.z,w=o.w*cam.z,h=o.h*cam.z;
        const inViewport=x<width&&y<height&&x+w>0&&y+h>0;
        return {id,x,y,width:w,height:h,opacity:inViewport?o.opacity:0};
      })};
    },
    // Source 'process' denotes aperture height/connection width changes; preserve
    // those declared geometric channels as reveal, never exempt x/y translation.
    actions:scene.ACTIONS.map(a=>({...a,kind:a.kind==='process'?'reveal':a.kind})),
    checkpoints:scene.CHECKPOINTS.map(p=>{
      if(p.role==='pass')return {...p};
      return {...p,exception:{kind:'reading',evidence:{sourceFile:sceneSource,anchor:p.exception,reason:p.exception}}};
    }),
    relays:scene.RELAYS.map(r=>({...r})),
  };
}
module.exports={state,exportAudit,frameAt:scene.frameAt,CONFIG:scene.CONFIG};
