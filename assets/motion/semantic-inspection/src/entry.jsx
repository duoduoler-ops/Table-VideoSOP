import React,{useEffect,useState} from 'react';
import {registerRoot,Composition,AbsoluteFill,useCurrentFrame,delayRender,continueRender} from 'remotion';
import {Scene} from './Scene';
const TL=require('./timeline.cjs');
function Clip({captions=false}){const f=useCurrentFrame(),s=TL.state(f/TL.FPS);const[h]=useState(()=>delayRender('fonts'));useEffect(()=>{document.fonts.ready.then(()=>continueRender(h));},[h]);return <AbsoluteFill><Scene s={s} caption={captions?s.caption:''}/></AbsoluteFill>;}
registerRoot(()=> <Composition id="SemanticInspection" component={Clip} width={1920} height={1080} fps={TL.FPS} durationInFrames={TL.FRAMES}/>);
