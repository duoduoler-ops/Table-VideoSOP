// MIT. Inventory comes from production drawing; projected bounds do not certify painted pixels.
'use strict';
const path = require('node:path');
const {createScene} = require('./scene.cjs');
const {productionFiles} = require('./render.cjs');

function exportAudit({sceneInput = {}, omitIds = [], videoFile} = {}) {
  const scene = createScene(sceneInput);
  const {config, timeline} = scene;
  const draw = time => scene.render(time, {omitIds});
  const objectIds = new Set();
  const frameCount = Math.ceil(config.duration * config.fps);
  for (let frame = 0; frame < frameCount; frame++) {
    for (const id of draw(frame / config.fps).renderedObjectIds) objectIds.add(id);
  }
  const sourceFiles = productionFiles(__dirname).map(name => path.join(__dirname, name));
  return {
    ...timeline,
    schemaVersion: 1, fps: config.fps, duration: config.duration,
    viewport: {width: config.width, height: config.height}, videoFile, sourceFiles,
    coverage: {
      ...scene.coverage,
      basis: 'render-state-final-screen', inventoryMode: 'per-frame-draws', objectIds: [...objectIds],
      scope: 'Union of actual draw submissions across encoded frame times. Perspective visibility and occlusion require production pixel evidence.',
    },
    frameAt(time) {
      const frame = draw(time);
      if (frame.camera?.position && frame.camera?.target) {
        return {...frame, camera: undefined, camera3d: frame.camera};
      }
      return frame;
    },
  };
}
module.exports = {exportAudit};
