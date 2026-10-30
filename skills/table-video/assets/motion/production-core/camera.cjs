/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 table-video contributors
 * Original generic path, follow and handoff implementation. The local EP07
 * candidate informed the fixed-anchor/final-subject-state boundary only;
 * episode motion values, layout and artwork are not included.
 */
'use strict';

const {makeCamera, projectPoint, vector, add, sub, mul} = require('./space.cjs');
const {clamp01, smootherstep, createTiming, createScreenArcMap} = require('./timing.cjs');
const mix = (a, b, u) => add(mul(a, 1 - u), mul(b, u));
function progress(value) {
  if (!Number.isFinite(value)) throw new TypeError('progress must be finite');
  return clamp01(value);
}
function cubicPath(controlPoints) {
  if (!Array.isArray(controlPoints) || controlPoints.length !== 4) throw new TypeError('cubicPath needs four XYZ control points');
  const p = controlPoints.map(v => vector(v));
  return value => {
    const u = progress(value), q = 1 - u;
    return p[0].map((v, i) => q ** 3 * v + 3 * q ** 2 * u * p[1][i] + 3 * q * u ** 2 * p[2][i] + u ** 3 * p[3][i]);
  };
}
function splinePath(points, {tension = 0} = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError('splinePath needs at least two XYZ waypoints');
  if (!Number.isFinite(tension) || tension < 0 || tension > 1) throw new RangeError('tension must be in [0,1]');
  const p = points.map(v => vector(v));
  // One shared tangent per waypoint, unlike easing each segment to a stop.
  // Uniform Catmull-Rom can overshoot the waypoint hull; author the geometry
  // accordingly. Uneven semantic timing belongs to createTiming, not here.
  const tangents = p.map((v, i) => mul(sub(p[Math.min(p.length - 1, i + 1)], p[Math.max(0, i - 1)]), (1 - tension) * (i === 0 || i === p.length - 1 ? 1 : 0.5)));
  return value => {
    const u = progress(value) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(u)), s = u - i;
    return p[i].map((v, j) => (2 * s ** 3 - 3 * s ** 2 + 1) * v
      + (s ** 3 - 2 * s ** 2 + s) * tangents[i][j]
      + (-2 * s ** 3 + 3 * s ** 2) * p[i + 1][j]
      + (s ** 3 - s ** 2) * tangents[i + 1][j]);
  };
}

function createCameraMove({positionPath, targetPath, start, end, timing, viewport, focalLength, near = 1, roll = 0, referencePoints, arcSteps = 256}) {
  if (typeof positionPath !== 'function' || typeof targetPath !== 'function') throw new TypeError('positionPath and targetPath must be functions');
  const timeAt = timing || createTiming({start, end});
  if (typeof timeAt !== 'function') throw new TypeError('timing must be a function of absolute seconds');
  const geometryAt = u => makeCamera({position: positionPath(u), target: targetPath(u), viewport,
    focalLength: typeof focalLength === 'function' ? focalLength(u) : focalLength, near,
    roll: typeof roll === 'function' ? roll(u) : roll});
  const arc = referencePoints ? createScreenArcMap({steps: arcSteps, sample: u => {
    const camera = geometryAt(u);
    const rows = typeof referencePoints === 'function' ? referencePoints(u) : referencePoints;
    if (!Array.isArray(rows)) throw new TypeError('referencePoints must yield an array of {id,point,weight?}');
    return rows.map(row => ({...projectPoint(row.point, camera), id: row.id, weight: row.weight}));
  }}) : null;
  const at = time => {
    const timed = timeAt(time);
    if (!Number.isFinite(timed) || timed < 0 || timed > 1) throw new RangeError('camera timing must return progress in [0,1]');
    return geometryAt(arc ? arc.at(timed) : timed);
  };
  at.geometryAt = geometryAt;
  at.arc = arc;
  return at;
}

function followCamera({subject, screenAnchor, distance, orientation, viewport, focalLength}) {
  const subjectPoint = vector(subject, 'subject');
  if (!orientation || !orientation.forward) throw new TypeError('orientation must be a camera from makeCamera');
  if (!Array.isArray(screenAnchor) || screenAnchor.length !== 2 || !screenAnchor.every(Number.isFinite)) throw new TypeError('screenAnchor needs two finite screen coordinates');
  if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('distance must be positive');
  const dimensions = viewport || orientation.viewport;
  if (!dimensions || !Number.isFinite(dimensions.width) || dimensions.width <= 0 || !Number.isFinite(dimensions.height) || dimensions.height <= 0) throw new RangeError('viewport dimensions must be positive');
  const f = focalLength === undefined ? orientation.focalLength : focalLength;
  if (!Number.isFinite(f) || f <= 0) throw new RangeError('focalLength must be positive');
  const offset = add(mul(orientation.forward, distance), add(
    mul(orientation.right, (screenAnchor[0] - dimensions.width / 2) * distance / f),
    mul(orientation.down, (screenAnchor[1] - dimensions.height / 2) * distance / f),
  ));
  const position = sub(subjectPoint, offset);
  // Reuse the actual orientation basis, including roll, without recomputing
  // an anchor from a moving start point or integrating previous frame state.
  return {...orientation, position, target: add(position, mul(orientation.forward, distance)),
    right: orientation.right.slice(), down: orientation.down.slice(), forward: orientation.forward.slice(),
    viewport: {...dimensions}, focalLength: f};
}

function blendCameras(a, b, value) {
  const u = progress(value);
  if (a.viewport.width !== b.viewport.width || a.viewport.height !== b.viewport.height) throw new RangeError('camera handoff needs the same viewport');
  if (u === 0) return a;
  if (u === 1) return b;
  return makeCamera({position: mix(a.position, b.position, u), target: mix(a.target, b.target, u), viewport: a.viewport,
    focalLength: Math.exp(Math.log(a.focalLength) * (1 - u) + Math.log(b.focalLength) * u),
    near: a.near * (1 - u) + b.near * u, roll: a.roll * (1 - u) + b.roll * u});
}
function handoffCamera({follow, destination, start, end, timing}) {
  if (typeof follow !== 'function') throw new TypeError('follow must be a function of absolute seconds');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError('handoff needs increasing finite start/end');
  const to = typeof destination === 'function' ? destination : () => destination;
  const at = timing || (time => smootherstep((time - start) / (end - start)));
  if (typeof at !== 'function' || Math.abs(at(start)) > 1e-10 || Math.abs(at(end) - 1) > 1e-10
    || !Number.isFinite(at(start)) || !Number.isFinite(at(end))) throw new RangeError('handoff timing must equal 0 at start and 1 at end');
  return time => {
    if (!Number.isFinite(time)) throw new TypeError('time must be finite');
    if (time <= start) return follow(time);
    if (time >= end) return to(time);
    const amount = at(time);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw new RangeError('handoff timing must return [0,1]');
    return blendCameras(follow(time), to(time), amount);
  };
}

// This is an aiming camera, not a quaternion flight rig. Opposite aim vectors,
// a zero-length interpolated target, or crossing the vertical reference pole
// require an authored orientation solution. No depth-buffer renderer is implied.
module.exports = {cubicPath, splinePath, createCameraMove, followCamera, blendCameras, handoffCamera};
