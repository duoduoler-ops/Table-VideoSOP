// SPDX-License-Identifier: MIT
// Minimal unchanged primitives actually used by the complete example.
// Extracted from the adopted Episode 5 D07 timeline; unrelated scene data is excluded.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = u => ((ax * u + bx) * u + cx) * u, Y = u => ((ay * u + by) * u + cy) * u, dX = u => (3 * ax * u + 2 * bx) * u + cx;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let u = x; for (let i = 0; i < 8; i++) { const d = dX(u); if (Math.abs(d) < 1e-6) break; u -= (X(u) - x) / d; } u = clamp(u); return Y(u); };
}
const E = {
  reveal: bez(0.16, 1, 0.3, 1), travel: bez(0.22, 0.72, 0.22, 1),
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const bump = (t, a, m, b) => (t < a || t > b ? 0 : t < m ? E.io((t - a) / (m - a)) : 1 - E.reveal((t - m) / (b - m)));
module.exports={clamp,lerp,E,bump};
