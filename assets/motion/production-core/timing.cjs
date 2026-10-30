/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 table-video contributors
 * Original implementation of standard cubic interpolation and sampled arc
 * length. No episode timings or universal motion/quality thresholds.
 */
'use strict';

const clamp01 = x => Math.max(0, Math.min(1, x));
function finite(n, name) {
  if (!Number.isFinite(n)) throw new TypeError(`${name} must be finite`);
  return n;
}
function cubicBezier(x1, y1, x2, y2) {
  [x1, y1, x2, y2].forEach((v, i) => finite(v, `bezier control ${i}`));
  if ([x1, x2].some(v => v < 0 || v > 1)) throw new RangeError('Bezier time controls must be in [0,1]');
  const value = (u, a, b) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u ** 2 * b + u ** 3;
  return progress => {
    const p = clamp01(finite(progress, 'progress'));
    if (p === 0 || p === 1) return p;
    let lo = 0, hi = 1;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (value(mid, x1, x2) < p) lo = mid; else hi = mid;
    }
    return value((lo + hi) / 2, y1, y2);
  };
}
const smootherstep = p => {
  const x = clamp01(finite(p, 'progress'));
  return clamp01(x ** 3 * (x * (x * 6 - 15) + 10));
};
const hermite = (p0, p1, m0, m1, h, u) => (2 * u ** 3 - 3 * u ** 2 + 1) * p0
  + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * p1
  + (u ** 3 - u ** 2) * h * m1;

function createTiming({start, end, knots = []}) {
  finite(start, 'start'); finite(end, 'end');
  if (end <= start) throw new RangeError('end must be later than start');
  if (!Array.isArray(knots)) throw new TypeError('knots must be an array');
  const points = knots.map(k => ({time: finite(k.time, 'knot.time'), progress: finite(k.progress, 'knot.progress'), speed: k.speed}));
  if (!points.length || points[0].time > start) points.unshift({time: start, progress: 0});
  if (points[points.length - 1].time < end) points.push({time: end, progress: 1});
  if (points[0].time !== start || points[0].progress !== 0 || points.at(-1).time !== end || points.at(-1).progress !== 1) {
    throw new RangeError('timing must start at progress 0 and end at progress 1');
  }
  const h = [], d = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.progress < 0 || p.progress > 1) throw new RangeError('knot.progress must be in [0,1]');
    if (p.speed !== undefined && (!Number.isFinite(p.speed) || p.speed < 0)) throw new RangeError('knot.speed must be finite and nonnegative');
    if (i) {
      const a = points[i - 1];
      if (p.time <= a.time || p.progress < a.progress) throw new RangeError('knots need increasing times and nondecreasing progress');
      h.push(p.time - a.time); d.push((p.progress - a.progress) / h.at(-1));
    }
  }
  const slopes = points.map((p, i) => {
    if (p.speed !== undefined) return p.speed;
    if (i === 0 || i === points.length - 1 || d[i - 1] === 0 || d[i] === 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  });
  // Sufficient monotonic Hermite bound. Explicit speeds are a contract: an
  // impossible one is rejected instead of silently changing the timing design.
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) {
      if (slopes[i] || slopes[i + 1]) throw new RangeError('a hold requires zero speed at both boundaries');
    } else {
      const length = Math.hypot(slopes[i] / d[i], slopes[i + 1] / d[i]);
      if (length > 3 + 1e-12) {
        if (points[i].speed !== undefined || points[i + 1].speed !== undefined) throw new RangeError('explicit speed would overshoot a timing segment');
        const factor = 3 / length;
        slopes[i] *= factor; slopes[i + 1] *= factor;
      }
    }
  }
  const at = time => {
    finite(time, 'time');
    if (time <= start) return 0;
    if (time >= end) return 1;
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].time <= time) lo = mid; else hi = mid; }
    // The monotonic construction is bounded analytically; roundoff near an
    // endpoint must not turn a valid timing into an out-of-range camera move.
    return clamp01(hermite(points[lo].progress, points[hi].progress, slopes[lo], slopes[hi], h[lo], (time - points[lo].time) / h[lo]));
  };
  at.knots = points.map((p, i) => ({...p, speed: slopes[i]}));
  return at;
}

function createScreenArcMap({sample, steps = 256}) {
  if (typeof sample !== 'function') throw new TypeError('sample must be a function');
  if (!Number.isInteger(steps) || steps < 2) throw new RangeError('steps must be an integer >= 2');
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const rows = sample(i / steps);
    if (!Array.isArray(rows) || !rows.length) throw new RangeError(`screen arc sample ${i} is empty`);
    const map = new Map();
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || map.has(row.id)) throw new TypeError('screen arc needs unique stable string IDs');
      if (row.projectable === false || !Number.isFinite(row.x) || !Number.isFinite(row.y)) {
        throw new RangeError(`screen arc point ${row.id} is unprojectable at sample ${i}; split this path or choose other reference points`);
      }
      const weight = row.weight === undefined ? 1 : row.weight;
      if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('screen arc weights must be positive');
      map.set(row.id, {x: row.x, y: row.y, weight});
    }
    if (frames.length) {
      const first = frames[0];
      if (map.size !== first.size || [...first].some(([id, row]) => !map.has(id) || map.get(id).weight !== row.weight)) {
        throw new RangeError('screen arc reference IDs and weights must remain stable; missing intervals cannot be bridged');
      }
    }
    frames.push(map);
  }
  const cumulative = [0];
  for (let i = 1; i < frames.length; i++) {
    let distance = 0, weightSum = 0;
    for (const [id, a] of frames[i - 1]) {
      const b = frames[i].get(id);
      distance += Math.hypot(b.x - a.x, b.y - a.y) * a.weight;
      weightSum += a.weight;
    }
    cumulative.push(cumulative.at(-1) + distance / weightSum);
  }
  const totalPixels = cumulative.at(-1);
  if (totalPixels && cumulative.some((value, i) => i > 0 && value === cumulative[i - 1])) {
    throw new RangeError('screen arc has an unmeasured stationary interval; split the path or add reference points instead of skipping time');
  }
  // Interpolate the inverse distance map with shared monotone tangents. A
  // piecewise-linear inverse introduces a speed step at every sampled node.
  const arcX = totalPixels ? cumulative.map(v => v / totalPixels) : cumulative.map((_, i) => i / steps);
  const arcH = arcX.slice(1).map((v, i) => v - arcX[i]);
  const arcD = arcH.map(h => 1 / steps / h);
  const arcM = arcX.map((_, i) => {
    if (i === 0) return arcD[0];
    if (i === steps) return arcD.at(-1);
    const w1 = 2 * arcH[i] + arcH[i - 1], w2 = arcH[i] + 2 * arcH[i - 1];
    return (w1 + w2) / (w1 / arcD[i - 1] + w2 / arcD[i]);
  });
  for (let i = 0; i < steps; i++) {
    const length = Math.hypot(arcM[i] / arcD[i], arcM[i + 1] / arcD[i]);
    if (length > 3) { const factor = 3 / length; arcM[i] *= factor; arcM[i + 1] *= factor; }
  }
  const parameterAt = progress => {
    const p = clamp01(finite(progress, 'progress'));
    if (!totalPixels || p === 0 || p === 1) return p;
    let lo = 0, hi = steps;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arcX[mid] <= p) lo = mid; else hi = mid; }
    return hermite(lo / steps, hi / steps, arcM[lo], arcM[hi], arcH[lo], (p - arcX[lo]) / arcH[lo]);
  };
  const progressAtParameter = parameter => {
    const p = clamp01(finite(parameter, 'parameter'));
    if (!totalPixels || p === 0 || p === 1) return p;
    let lo = 0, hi = 1;
    for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (parameterAt(mid) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  return {at: parameterAt, progressAtParameter, totalPixels,
    diagnostics: {steps, referenceCount: frames[0].size, complete: true, static: totalPixels === 0,
      limitation: 'C1 sampled distance map; finite samples do not prove visibility, capture unsampled motion, or certify viewing quality'}};
}

module.exports = {clamp01, smootherstep, cubicBezier, createTiming, createScreenArcMap};
