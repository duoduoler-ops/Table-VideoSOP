// MIT. Projected geometry is read from the real draw submissions. Perspective visibility remains unknown.
'use strict';
const path=require('node:path');
const {createScene}=require('./scene.cjs');
function exportAudit({sceneInput={},videoFile}={}){
  const scene=createScene(sceneInput),initial=scene.render(0),{config,timeline}=scene;
  return {schemaVersion:1,fps:config.fps,duration:config.duration,viewport:{width:config.width,height:config.height},videoFile,
    sourceFiles:['stage.cjs','parts.cjs','scene.cjs','entry.jsx','space.cjs','camera.cjs','timing.cjs','audit-adapter.cjs'].map(f=>path.join(__dirname,f)),
    coverage:{basis:'render-state-final-screen',objectIds:initial.renderedObjectIds,mainContentIds:['kit','inspection','tray.accepted','tray.rework'],
      scope:'All actual CSS plane submissions, including parts and zero-size cut-offs. Engineering coordinates only; perspective visibility/occlusion unknown until selected production pixel evidence is inspected.'},
    actions:timeline.actions,relays:timeline.relays,checkpoints:timeline.checkpoints,
    frameAt:t=>{const frame=scene.render(t);return {...frame,camera:undefined,camera3d:frame.camera};},};
}
module.exports={exportAudit};
