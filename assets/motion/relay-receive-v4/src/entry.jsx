import React from 'react';
import {AbsoluteFill,Composition,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
const {atFrame,FPS,FRAMES}=require('./state.cjs');
const {svg}=require('./scene.cjs');
function Example({version='v4',captions=[]}){const frame=useCurrentFrame(),{fps}=useVideoConfig(),t=frame/fps;const caption=captions.find(([a,b])=>t>=a&&t<b)?.[2]||'';return <AbsoluteFill dangerouslySetInnerHTML={{__html:svg(atFrame(t*FPS,version),caption)}}/>;}
function Root(){return <><Composition id="RelayReceiveV3" component={Example} durationInFrames={FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{version:'v3',captions:[]}}/><Composition id="RelayReceiveV4" component={Example} durationInFrames={FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{version:'v4',captions:[]}}/></>;}
registerRoot(Root);
