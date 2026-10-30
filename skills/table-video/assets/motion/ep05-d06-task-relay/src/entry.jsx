import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {D06Dyn} from './DynRoot';
import TL from './timeline.cjs';

registerRoot(() => <Composition id="EP05D06TaskRelay" component={D06Dyn}
  width={1920} height={1080} fps={TL.FPS} durationInFrames={TL.FRAMES}
  defaultProps={{deleteText: false}} />);
