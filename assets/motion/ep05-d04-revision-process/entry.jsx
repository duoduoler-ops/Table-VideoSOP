import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Composition,useCurrentFrame,registerRoot,delayRender,continueRender} from 'remotion';
import {Scene,G2,ui,C} from './Scene';
import TL from './timeline.cjs';

function Process({compositionId,deleteText=false}){
  const frame=useCurrentFrame();
  const [fontHandle]=useState(()=>delayRender('Installed system fonts'));
  useEffect(()=>{document.fonts.ready.then(()=>continueRender(fontHandle));},[fontHandle]);
  const t=TL.sourceFrame(frame,compositionId)/TL.FPS;
  return <AbsoluteFill style={{fontFamily:ui,background:G2,color:C.ink,overflow:'hidden'}}>
    {deleteText&&<style>{'.txt{visibility:hidden!important}'}</style>}
    <Scene t={t} deleteText={deleteText}/>
  </AbsoluteFill>;
}
registerRoot(()=> <>{Object.entries(TL.COMPOSITIONS).map(([id,c])=>
  <Composition key={id} id={id} component={Process} width={1920} height={1080} fps={TL.FPS} durationInFrames={c.frames} defaultProps={{compositionId:id,deleteText:false}}/>
)}</>);
