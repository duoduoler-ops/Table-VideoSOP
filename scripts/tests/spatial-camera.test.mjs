/* SPDX-License-Identifier: MIT
 * Original mathematical/contract regression tests. These cannot certify
 * visual communication, comfortable motion, or a completed 1x review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import space from '../../assets/motion/production-core/space.cjs';
import camera from '../../assets/motion/production-core/camera.cjs';
import timing from '../../assets/motion/production-core/timing.cjs';

const {makeCamera, projectPoint, unprojectPoint, planePoint, projectPlane} = space;
const {cubicPath, splinePath, createCameraMove, followCamera, handoffCamera, blendCameras} = camera;
const {createTiming, createScreenArcMap, cubicBezier} = timing;
const viewport = {width: 1280, height: 720};
const cam = (position = [0, 0, 0], target = [0, 0, 1000], other = {}) => makeCamera({position, target, viewport, focalLength: 800, near: 1, ...other});
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} (tolerance ${eps})`);
const closeVector = (a, b, eps = 1e-6) => a.forEach((v, i) => close(v, b[i], eps));
const velocity = (path, t, dt = 1e-5) => path(t + dt).map((v, i) => (v - path(t - dt)[i]) / (2 * dt));

test('adaptive sampling next to handoff endpoints remains finite and bounded',()=>{
  const from=cam([0,0,0]),to=cam([100,30,-100],[100,30,1000]);
  const handoff=handoffCamera({follow:()=>from,destination:to,start:6.8,end:7.4});
  const schedule=createTiming({start:6.8,end:7.4});
  for(const epsilon of [1e-3,1e-6,1e-9,1e-12,Number.EPSILON]) {
    for(const t of [6.8+epsilon,7.4-epsilon]) {
      const result=handoff(t),p=schedule(t);
      assert(result.position.every(Number.isFinite));assert(p>=0&&p<=1);
    }
  }
  // User-provided invalid timing still fails: this is no blanket tolerance.
  assert.throws(()=>handoffCamera({follow:()=>from,destination:to,start:0,end:1,timing:t=>t===0?0:t===1?1:1.01})(.5),/\[0,1\]/);
});
const magnitude = p => Math.hypot(...p);

test('perspective produces depth-dependent size and genuine parallax', () => {
  const a = cam(), b = cam([100, 0, 0], [100, 0, 1000]);
  const near = projectPoint([0, 0, 500], a), far = projectPoint([0, 0, 1500], a);
  const nearMoved = projectPoint([0, 0, 500], b), farMoved = projectPoint([0, 0, 1500], b);
  close(nearMoved.x - near.x, -160);
  close(farMoved.x - far.x, -160 / 3);
  assert.ok(Math.abs(nearMoved.x - near.x) > 2.9 * Math.abs(farMoved.x - far.x));
  const nearPlane = projectPlane({center: [0, 0, 500], width: 100, height: 100}, a);
  const farPlane = projectPlane({center: [0, 0, 1500], width: 100, height: 100}, a);
  close((nearPlane.bounds.right - nearPlane.bounds.left) / (farPlane.bounds.right - farPlane.bounds.left), 3);
});

test('aim direction, roll and perspective inverse agree across viewport sizes', () => {
  for (const scale of [0.25, 1, 3.2]) {
    const c = cam([31, -82, -300], [410, 87, 900], {viewport: {width: 1280 * scale, height: 720 * scale}, focalLength: 800 * scale, roll: 21});
    const anchor = [359 * scale, 487 * scale];
    closeVector([projectPoint(c.target, c).x, projectPoint(c.target, c).y], [640 * scale, 360 * scale]);
    const p = unprojectPoint(anchor, 1700, c), q = projectPoint(p, c);
    closeVector([q.x, q.y], anchor);
    close(q.depth, 1700);
    close(space.dot(c.right, c.down), 0);
    close(space.dot(c.forward, c.down), 0);
    close(magnitude(c.right), 1);
  }
});

test('CSS projective matrix matches independent point projection on a tilted plane', () => {
  const c = cam([130, -30, -700], [80, 170, 900], {roll: -13});
  const plane = {center: [100, 120, 1300], width: 900, height: 440, rotation: [22, -41, 9]};
  const result = projectPlane(plane, c), m = result.matrix;
  assert.equal(result.status, 'projected');
  assert.match(result.cssTransform, /^matrix3d\(/);
  for (const [x, y] of [[0, 0], [900, 0], [900, 440], [0, 440], [130, 95], [478, 330]]) {
    const divisor = m[3] * x + m[7] * y + m[15];
    const matrixPoint = [(m[0] * x + m[4] * y + m[12]) / divisor, (m[1] * x + m[5] * y + m[13]) / divisor];
    const expected = projectPoint(planePoint(plane, x, y), c);
    closeVector(matrixPoint, [expected.x, expected.y]);
  }
  // An affine transform of the same three corners cannot reproduce the fourth.
  const [tl, tr, br, bl] = result.points;
  assert.ok(Math.hypot(tr.x + bl.x - tl.x - br.x, tr.y + bl.y - tl.y - br.y) > 5);
});

test('near-plane and behind-camera cases are explicit, never infinite fake screen points', () => {
  const c = cam([0, 0, 0], [0, 0, 100], {near: 10});
  for (const z of [-20, 0, 5]) {
    const p = projectPoint([1, 2, z], c);
    assert.equal(p.projectable, false);
    assert.equal(p.x, null);
    assert.equal(p.reason, z <= 0 ? 'behind-camera' : 'near-clipped');
  }
  assert.equal(projectPoint([0, 0, 10], c).projectable, true);
  const crossing = projectPlane({center: [0, 0, 20], width: 100, height: 40, rotation: [0, 60, 0]}, c);
  assert.equal(crossing.status, 'near-clipped');
  assert.equal(crossing.cssTransform, null);
  assert.match(crossing.reason, /requires a clipped mesh/);
  const behind = projectPlane({center: [0, 0, -50], width: 10, height: 10}, c);
  assert.equal(behind.status, 'behind-camera');
  assert.equal(projectPoint([10000, 0, 100], c).projectable, true);
  assert.equal(projectPoint([10000, 0, 100], c).inViewport, false);
});

test('XYZ cubic path has actual depth and lateral curvature, independent of timing', () => {
  const path = cubicPath([[0, 0, 0], [240, 300, -450], [650, -180, -700], [1000, 0, 200]]);
  closeVector(path(0), [0, 0, 0]); closeVector(path(1), [1000, 0, 200]);
  const midpoint = path(0.5);
  assert.ok(Math.abs(midpoint[1]) > 40);
  assert.ok(midpoint[2] < -350);
  const a = createTiming({start: 0, end: 4}), b = createTiming({start: 10, end: 18});
  closeVector(path(a(1)), path(b(12)));
  assert.notDeepEqual(path(a(1)), path(a(3)));
});

test('spline passes through authored waypoints with nonzero continuous velocity', () => {
  const points = [[0, 0, 0], [200, -80, -120], [470, 150, 260], [900, 0, 400]];
  const path = splinePath(points);
  points.forEach((p, i) => closeVector(path(i / 3), p));
  for (const t of [1 / 3, 2 / 3]) {
    const left = velocity(path, t - 2e-7, 1e-7), right = velocity(path, t + 2e-7, 1e-7);
    const i = Math.round(t * 3);
    const expected = points[i - 1].map((value, axis) => (points[i + 1][axis] - value) * 1.5);
    assert.ok(magnitude(left) > 100);
    closeVector(left, expected, 0.003);
    closeVector(right, expected, 0.003);
  }
});

test('semantic timing preserves an authored speed allocation without stopping at each knot', () => {
  const at = createTiming({start: 2, end: 10, knots: [{time: 4, progress: 0.22}, {time: 7, progress: 0.87}]});
  close(at(4), 0.22); close(at(7), 0.87);
  const derivative = t => (at(t + 1e-5) - at(t - 1e-5)) / 2e-5;
  for (const t of [4, 7]) {
    assert.ok(derivative(t) > 0.02);
    close(derivative(t - 2e-5), derivative(t + 2e-5), 1e-4);
  }
  assert.ok(derivative(5.5) > 3 * derivative(9.5));
  assert.ok(derivative(2 + 1e-5) < 1e-5);
  let previous = 0;
  for (let t = 2; t <= 10; t += 0.003) { const value = at(t); assert.ok(value >= previous - 1e-12 && value <= 1); previous = value; }
});

test('holds are explicit and time scaling preserves the same path, not frame integration', () => {
  const knots = [{time: 1, progress: 0.2}, {time: 2, progress: 0.2}, {time: 3, progress: 0.75}];
  const a = createTiming({start: 0, end: 4, knots});
  const b = createTiming({start: 20, end: 32, knots: knots.map(k => ({time: 20 + k.time * 3, progress: k.progress}))});
  close(a(1.25), 0.2); close(a(1.75), 0.2);
  for (const t of [3.7, 0.2, 2.5, 4, 1.5, 0, 3.7]) close(a(t), b(20 + 3 * t));
});

test('screen arc mapping samples arbitrary projected XYZ points and preserves chosen nonuniform time', () => {
  const path = cubicPath([[0, 0, -800], [400, -250, -950], [-120, 270, -120], [700, 80, -300]]);
  const world = [{id: 'tilted-near', point: [-110, 180, 300], weight: 2}, {id: 'far-detail', point: [640, -220, 1800]}];
  const raw = u => cam(path(u), [200, 80, 1000]);
  const arc = createScreenArcMap({steps: 2048, sample: u => world.map(row => ({...projectPoint(row.point, raw(u)), id: row.id, weight: row.weight}))});
  assert.ok(arc.totalPixels > 100);
  for (const u of [0, 0.1, 0.4, 0.88, 1]) close(arc.at(arc.progressAtParameter(u)), u, 1e-6);
  // A nonlinear source parameter becomes nearly equal projected travel at equal
  // arc progress. The caller then applies semantic easing, so time is not uniform.
  const one = createScreenArcMap({sample: u => [{id: 'vertical-depth-reference', x: 15, y: 900 * u ** 3}], steps: 2048});
  close(one.at(0.5), Math.cbrt(0.5), 1e-6);
  const ease = createTiming({start: 0, end: 4});
  const earlyDistance = 900 * ease(0.5), middleDistance = 900 * (ease(2.5) - ease(2));
  assert.ok(middleDistance > 3 * earlyDistance);
  assert.equal(arc.diagnostics.complete, true);
});

test('camera move couples geometric path to time and remains independently seekable', () => {
  const positionPath = cubicPath([[0, 0, -500], [150, -180, -1000], [630, 80, -800], [500, 0, -300]]);
  const move = createCameraMove({positionPath, targetPath: () => [300, 0, 500], start: 5, end: 9, viewport,
    focalLength: 800, referencePoints: [{id: 'subject', point: [300, 0, 500]}, {id: 'side', point: [-100, 100, 800]}]});
  const expected = new Map([5, 6.1, 7.3, 8.9, 9].map(t => [t, move(t)]));
  for (const t of [8.9, 6.1, 9, 5, 7.3, 6.1]) assert.deepEqual(move(t), expected.get(t));
  assert.deepEqual(move(3), move(5)); assert.deepEqual(move(12), move(9));
  assert.ok(move.arc.totalPixels > 0);
});

test('screen arc inverse has continuous velocity across sampled nodes', () => {
  const arc = createScreenArcMap({steps: 32, sample: u => [{id: 'part', x: 100 * (u + u * u), y: 45 * Math.sin(u * 2)}]});
  for (const u of [0.25, 0.5, 0.75]) {
    const p = arc.progressAtParameter(u), dt = 1e-7;
    const left = (arc.at(p - dt) - arc.at(p - 2 * dt)) / dt;
    const right = (arc.at(p + 2 * dt) - arc.at(p + dt)) / dt;
    close(left, right, 2e-5);
    assert.ok(left > 0);
  }
});

test('following binds final XYZ subject state to a fixed screen anchor including camera roll', () => {
  const orientation = cam([0, 0, -300], [200, 60, 900], {roll: 12});
  const subject = t => [220 * t, 50 * Math.sin(t), 300 + 100 * t * t];
  const anchor = [450, 330];
  for (const t of [2.7, 0, 1, 4.8, 2.7]) {
    const c = followCamera({subject: subject(t), screenAnchor: anchor, distance: 900, orientation});
    const p = projectPoint(subject(t), c);
    closeVector([p.x, p.y], anchor); close(p.depth, 900);
  }
});

test('follow-to-wide handoff is continuous and does not force an arrival stop', () => {
  const orientation = cam();
  const follow = t => followCamera({subject: [200 * t, -30 * t, 1000 + 40 * t], screenAnchor: [520, 360], distance: 700, orientation});
  const destination = cam([700, -170, -1300], [700, 0, 1100]);
  const move = handoffCamera({follow, destination, start: 2, end: 4});
  const position = t => move(t).position;
  closeVector(position(2), follow(2).position);
  closeVector(position(4), destination.position);
  closeVector(velocity(position, 2 - 1e-4), velocity(position, 2 + 1e-4), 0.002);
  assert.ok(magnitude(velocity(position, 2)) > 190);
  assert.ok(magnitude(velocity(position, 4 - 1e-4)) < 0.001);
  assert.deepEqual(move(3.1), move(3.1));
});

test('spatial coordinate and viewport scaling do not hide a 1920x1080 assumption', () => {
  const original = cam([50, -60, -700], [100, 50, 800]);
  const p = [320, 150, 1000], q = projectPoint(p, original);
  for (const scale of [0.01, 5, 200]) {
    const scaled = cam(original.position.map(v => v * scale), original.target.map(v => v * scale), {near: original.near * scale});
    closeVector([projectPoint(p.map(v => v * scale), scaled).x, projectPoint(p.map(v => v * scale), scaled).y], [q.x, q.y]);
  }
  const screenScale = 1.7;
  const screenCamera = cam(original.position, original.target, {viewport: {width: viewport.width * screenScale, height: viewport.height * screenScale}, focalLength: 800 * screenScale});
  closeVector([projectPoint(p, screenCamera).x, projectPoint(p, screenCamera).y], [q.x * screenScale, q.y * screenScale]);
});

test('counterexamples reject missing coverage, impossible timing, ambiguous geometry and malformed input', () => {
  assert.throws(() => createScreenArcMap({sample: u => [{id: 'part', x: u, y: u, projectable: u < 0.5}]}), /unprojectable/);
  assert.throws(() => createScreenArcMap({sample: u => u < 0.5 ? [{id: 'a', x: u, y: 0}] : [{id: 'b', x: u, y: 0}]}), /stable/);
  assert.throws(() => createScreenArcMap({sample: () => [{id: 'same', x: 0, y: 0}, {id: 'same', x: 1, y: 0}]}), /unique/);
  assert.throws(() => createScreenArcMap({sample: u => [{id: 'part', x: Math.max(0, u - 0.5), y: 0}]}), /stationary interval/);
  assert.throws(() => createTiming({start: 0, end: 1, knots: [{time: 0.5, progress: 0.5, speed: 20}]}), /overshoot/);
  assert.throws(() => createTiming({start: 0, end: 1, knots: [{time: 0.2, progress: 0.8}, {time: 0.8, progress: 0.2}]}), /nondecreasing/);
  assert.throws(() => makeCamera({position: [0, 0, 0], target: [0, 0, 0], viewport, focalLength: 800}), /direction/);
  assert.throws(() => cubicPath([[0, 0, 0], [1, 1, 1]]), /four/);
  assert.throws(() => blendCameras(cam(), cam([0, 0, 0], [0, 0, -1000]), 0.5), /direction/);
  assert.throws(() => handoffCamera({follow: () => cam(), destination: cam(), start: 0, end: 1, timing: () => 0.5}), /equal 0/);
  assert.throws(() => cubicBezier(-0.2, 0, 1, 1), /time controls/);
});
