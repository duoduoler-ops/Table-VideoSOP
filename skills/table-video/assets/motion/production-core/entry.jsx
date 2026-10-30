// MIT. This composition calls exactly the same scene.render() as the engineering adapter.
import React from 'react';
import {AbsoluteFill, Audio, Composition, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import sceneModule from './scene.cjs';
const {CONFIG,createScene}=sceneModule;
function ProductionScene({sceneInput={},omitIds=[],audioFile=null}){
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const scene=React.useMemo(()=>createScene(sceneInput),[sceneInput]);
  const result=scene.render(frame/fps,{omitIds});
  return <AbsoluteFill style={{background:'radial-gradient(circle at 50% 42%, #FFFFFF 0%, #FDF7E4 68%)',fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'}}>
    <div style={{position:'absolute',inset:0}} dangerouslySetInnerHTML={{__html:result.html}} />
    {audioFile?<Audio src={staticFile(audioFile)} />:null}
  </AbsoluteFill>;
}
function Root(){return <Composition id="ProductionScene" component={ProductionScene} width={CONFIG.width} height={CONFIG.height} fps={CONFIG.fps} durationInFrames={Math.ceil(CONFIG.duration*CONFIG.fps)}
  calculateMetadata={({props})=>{const {config}=createScene(props.sceneInput);return {width:config.width,height:config.height,fps:config.fps,durationInFrames:Math.ceil(config.duration*config.fps)};}}
  defaultProps={{sceneInput:{},omitIds:[],audioFile:null}} />;}
registerRoot(Root);
