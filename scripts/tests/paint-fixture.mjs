// Test renderer: the old analytic fixtures now submit actual filled rectangles.
// This is deliberately a test utility, not a production visibility bypass.
import observation from '../motion-observation.cjs';
export function paintFrame(frame,viewport={width:1920,height:1080}){
 if(frame.objects.some(o=>['x','y','width','height','opacity'].some(k=>!Number.isFinite(o[k]))))return frame;
 const scene=observation.createObservedScene(viewport);
 const original=new Map(frame.objects.map(o=>[o.id,o]));
 for(const o of frame.objects){
  const {observation:ignored,rotation,...props}=o;
  scene.rect(props,{fill:'#fff'});
 }
 const result=scene.finish();
 for(const o of result.objects){
  const input=original.get(o.id);
  if(input.observation?.reason!=='fixture-painted-rectangle')o.observation=input.observation;
  if(input.contentVersion===undefined)delete o.contentVersion;
  if(input.localGeometry===undefined)delete o.localGeometry;
  if(input.d1Category===undefined)delete o.d1Category;else o.d1Category=input.d1Category;
  if(input.screenFixed!==undefined)o.screenFixed=input.screenFixed;
  if(input.rotation)o.rotation=input.rotation;
 }
 if(frame.camera)result.camera=frame.camera;
 if(frame.semantic)result.semantic=frame.semantic;
 return result;
}
export const paintSamples=(samples,viewport)=>samples.map(s=>({...s,frame:paintFrame(s.frame,viewport)}));
export const paintSpec=spec=>({...spec,frameAt:(...args)=>paintFrame(spec.frameAt(...args),spec.viewport)});
