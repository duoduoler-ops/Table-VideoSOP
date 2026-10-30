/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 table-video contributors
 * Original reusable implementation. Camera convention and planar homography
 * were checked against the local spatial-depth-review candidate; no episode
 * coordinates, timings, artwork, or acceptance claims are included here.
 * X is right, Y is down, Z is away; angles are degrees. Units are caller-defined.
 */
'use strict';

const EPS = 1e-10;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value, name) {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function vector(value, name = 'point') {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${name} must contain three finite coordinates`);
  }
  return value.slice();
}
function unit(v, name) {
  const length = Math.hypot(...v);
  if (length < EPS) throw new RangeError(`${name} has no direction`);
  return mul(v, 1 / length);
}
function viewportSize(viewport) {
  if (!viewport) throw new TypeError('viewport is required');
  return {width: positive(viewport.width, 'viewport.width'), height: positive(viewport.height, 'viewport.height')};
}

function makeCamera({position, target, viewport, focalLength, near = 1, roll = 0}) {
  const pos = vector(position, 'position');
  const aim = vector(target, 'target');
  const forward = unit(sub(aim, pos), 'camera target');
  // The alternative reference keeps a vertical view defined. Crossing this
  // pole changes the reference frame; use an explicit roll/path away from it.
  const reference = Math.abs(forward[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];
  const unrolledRight = unit(cross(reference, forward), 'camera right');
  const unrolledDown = cross(forward, unrolledRight);
  const angle = finite(roll, 'roll') * Math.PI / 180;
  const right = add(mul(unrolledRight, Math.cos(angle)), mul(unrolledDown, Math.sin(angle)));
  const down = add(mul(unrolledRight, -Math.sin(angle)), mul(unrolledDown, Math.cos(angle)));
  return {
    position: pos, target: aim, forward, right, down,
    viewport: viewportSize(viewport), focalLength: positive(focalLength, 'focalLength'),
    near: positive(near, 'near'), roll,
  };
}

function toCamera(point, camera) {
  const relative = sub(vector(point), camera.position);
  return [dot(relative, camera.right), dot(relative, camera.down), dot(relative, camera.forward)];
}
function projectPoint(point, camera) {
  const [x, y, depth] = toCamera(point, camera);
  const reason = depth <= 0 ? 'behind-camera' : depth < camera.near ? 'near-clipped' : null;
  if (reason) return {x: null, y: null, depth, projectable: false, inViewport: false, reason};
  const sx = camera.viewport.width / 2 + camera.focalLength * x / depth;
  const sy = camera.viewport.height / 2 + camera.focalLength * y / depth;
  return {
    x: sx, y: sy, depth, projectable: true,
    inViewport: sx >= 0 && sx <= camera.viewport.width && sy >= 0 && sy <= camera.viewport.height,
    reason: null,
  };
}
function unprojectPoint(screenPoint, depth, camera) {
  if (!Array.isArray(screenPoint) || screenPoint.length !== 2 || !screenPoint.every(Number.isFinite)) {
    throw new TypeError('screenPoint must contain two finite coordinates');
  }
  positive(depth, 'depth');
  return add(camera.position, add(mul(camera.forward, depth), add(
    mul(camera.right, (screenPoint[0] - camera.viewport.width / 2) * depth / camera.focalLength),
    mul(camera.down, (screenPoint[1] - camera.viewport.height / 2) * depth / camera.focalLength),
  )));
}

function planeBasis(plane) {
  const center = vector(plane.center, 'plane.center');
  positive(plane.width, 'plane.width');
  positive(plane.height, 'plane.height');
  const [rx, ry, rz] = vector(plane.rotation || [0, 0, 0], 'plane.rotation').map(v => v * Math.PI / 180);
  const [sx, cx, sy, cy, sz, cz] = [Math.sin(rx), Math.cos(rx), Math.sin(ry), Math.cos(ry), Math.sin(rz), Math.cos(rz)];
  // Euler Rz * Ry * Rx, applied to centered local coordinates.
  const u = [cz * cy, sz * cy, -sy];
  const v = [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx];
  return {center, u, v};
}
function planePoint(plane, x, y) {
  finite(x, 'plane x'); finite(y, 'plane y');
  const {center, u, v} = planeBasis(plane);
  return add(center, add(mul(u, x - plane.width / 2), mul(v, y - plane.height / 2)));
}
function planeCorners(plane) {
  return [[0, 0], [plane.width, 0], [plane.width, plane.height], [0, plane.height]].map(([x, y]) => planePoint(plane, x, y));
}

function projectPlane(plane, camera) {
  const worldPoints = planeCorners(plane);
  const points = worldPoints.map(p => projectPoint(p, camera));
  const center = projectPoint(plane.center, camera);
  const depths = points.map(p => p.depth);
  const depthRange = [Math.min(...depths), Math.max(...depths)];
  if (points.some(p => !p.projectable)) {
    // This flat DOM primitive deliberately does not polygon-clip a plane at
    // the near plane. A partially clipped plane is unsupported, not invisible.
    const status = depths.every(d => d <= 0) ? 'behind-camera' : 'near-clipped';
    return {status, projectable: false, cssTransform: null, matrix: null, points, center, worldPoints, depthRange, bounds: null,
      reason: status === 'near-clipped' ? 'partial/near plane clipping requires a clipped mesh renderer' : 'all corners behind camera'};
  }
  const {u, v} = planeBasis(plane);
  const q0 = toCamera(worldPoints[0], camera);
  const dx = [dot(u, camera.right), dot(u, camera.down), dot(u, camera.forward)];
  const dy = [dot(v, camera.right), dot(v, camera.down), dot(v, camera.forward)];
  const [cx, cy, f, d] = [camera.viewport.width / 2, camera.viewport.height / 2, camera.focalLength, q0[2]];
  const matrix = [
    (f * dx[0] + cx * dx[2]) / d, (f * dx[1] + cy * dx[2]) / d, 0, dx[2] / d,
    (f * dy[0] + cx * dy[2]) / d, (f * dy[1] + cy * dy[2]) / d, 0, dy[2] / d,
    0, 0, 1, 0,
    (f * q0[0] + cx * q0[2]) / d, (f * q0[1] + cy * q0[2]) / d, 0, 1,
  ];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {status: 'projected', projectable: true, cssTransform: `matrix3d(${matrix.join(',')})`, matrix,
    points, center, worldPoints, depthRange,
    bounds: {left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)}, reason: null};
}

// projectable means a finite projection, not visibility/occlusion. CSS planes
// need left/top=0 and transform-origin:0 0, with no extra CSS perspective.
// They do not provide depth-buffer occlusion, self-intersection, volumetric
// meshes, or 3D transforms inside the plane. SVG affine transforms are NOT a
// substitute for this homography. The caller owns clipping and paint order.
module.exports = {makeCamera, toCamera, projectPoint, unprojectPoint, planePoint, planeCorners, projectPlane,
  vector, add, sub, mul, dot, cross, unit};
