// SPDX-License-Identifier: MIT
import React from 'react';
import {registerRoot,Composition} from 'remotion';
import {Transfer} from './Transfer';
const {FPS,FRAMES}=require('./timeline.cjs');
// These dimensions and timings belong to this example only.
registerRoot(()=> <Composition id="WholeResultReturn" component={Transfer} width={1920} height={1080} fps={FPS} durationInFrames={FRAMES} defaultProps={{captions:[],heading:'结果与期待'}}/>);
