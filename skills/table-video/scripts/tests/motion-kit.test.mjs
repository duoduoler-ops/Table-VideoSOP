import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const kit = require('../../assets/motion/production-core/motion-kit.cjs');

const speedProfile = (f, n = 400) => {
  const v = [];
  for (let i = 0; i < n; i++) v.push((f((i + 1) / n) - f(i / n)) * n);
  return v;
};

test('camera curve is front-loaded with a long settle, unlike a symmetric smoothstep', () => {
  const v = speedProfile(kit.ease.camera), peak = Math.max(...v);
  assert.ok(v.indexOf(peak) / v.length < .32, 'peak speed arrives in the first third');
  assert.ok(peak > 2.2, 'peak speed is well above the mean');
  const smooth = speedProfile(p => p * p * (3 - 2 * p));
  assert.ok(Math.max(...smooth) < 1.6, 'smoothstep only reaches 1.5x mean and peaks at the middle');
});

test('damped step overshoots once and settles; sway and press decay to rest', () => {
  const samples = [...Array(200)].map((_, i) => kit.dampedStep(i / 100));
  assert.ok(Math.max(...samples) > 1.05, 'one visible overshoot');
  assert.ok(Math.abs(kit.dampedStep(2) - 1) < .01);
  assert.equal(kit.sway(1.5), 0);
  assert.ok(kit.press(.05) > .6 && kit.press(.6) === 0);
  assert.equal(kit.shake(.4), 0);
});

test('responses start only after the cause plus the lag', () => {
  const events = [{t: 1}];
  const f = t => kit.respond(t, events, dt => kit.press(dt), {lag: kit.LAG.near});
  assert.equal(f(1 + kit.LAG.near - 1e-4), 0);
  assert.ok(f(1 + kit.LAG.near + .04) > 0);
});

test('action envelope compresses before release, stretches on release and settles once', () => {
  const start = 1;
  assert.ok(kit.actionEnvelope(start - .03, start) > .05, 'anticipation squash');
  assert.ok(kit.actionEnvelope(start + .08, start) < 0, 'release stretch');
  assert.ok(kit.actionEnvelope(start + .24, start) > 0, 'settle');
  assert.equal(kit.actionEnvelope(start + .6, start), 0);
});

test('drop accelerates under gravity and reacts on contact', () => {
  const a = kit.drop(.25, 0, 1, 100).y - kit.drop(0, 0, 1, 100).y;
  const b = kit.drop(1, 0, 1, 100).y - kit.drop(.75, 0, 1, 100).y;
  assert.ok(b > a * 3, 'the last quarter covers far more distance than the first');
  assert.ok(kit.drop(1.05, 0, 1, 100).squash > .08, 'contact squash');
  assert.ok(kit.drop(1.15, 0, 1, 100).squash < 0, 'rebound');
  assert.ok(kit.drop(1.15, 0, 1, 100).follower > 0, 'attached part answers a few frames later');
});

test('chain extends a short tail into the next onset and reports dead gaps', () => {
  const {windows, gaps} = kit.chain([{id: 'a', at: 1, dur: .6}, {id: 'b', at: 1.8, dur: .5}, {id: 'c', at: 4, dur: .5}]);
  assert.ok(windows[0].end > windows[1].start, 'a short gap becomes an overlap');
  assert.equal(windows[1].start, 1.7, 'the onset stays tied to its word');
  assert.equal(gaps.length, 1);
  assert.ok(gaps[0].duration > 1.5);
});

test('camera timing reaches 0 and 1 at the window ends', () => {
  const f = kit.cameraTiming(2, 4);
  assert.equal(f(2), 0);
  assert.equal(f(4), 1);
  assert.ok(f(2.7) > .5, 'half the move is done by 35% of the time (smoothstep needs 50%)');
});
