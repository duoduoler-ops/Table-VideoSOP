const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const TL = require('../src/timeline.cjs');
const meta = require('../provenance.json');
const data = require('../src/example-data.json');
const root = path.resolve(__dirname, '..');

test('all 2164 frame states retain the adopted source sequence', () => {
  assert.equal(TL.FPS, 60);
  assert.equal(TL.FRAMES, 2164);
  const hash = crypto.createHash('sha256');
  for (let f = 0; f < TL.FRAMES; f++) hash.update(JSON.stringify(TL.pAt(f / TL.FPS)) + '\n');
  assert.equal(hash.digest('hex'), meta.sourceStateSequenceSha256);
});

test('direct random frame access equals sequential evaluation', () => {
  const sequential = Array.from({length: TL.FRAMES}, (_, f) => JSON.stringify(TL.pAt(f / TL.FPS)));
  // 977 and 2164 are coprime: this visits each frame once in a different order.
  for (let i = 0; i < TL.FRAMES; i++) {
    const f = i * 977 % TL.FRAMES;
    assert.equal(JSON.stringify(TL.pAt(f / TL.FPS)), sequential[f], `frame ${f}`);
  }
});

test('mismatch produces a short recoil and preserves the unadapted card', () => {
  const hit = TL.pAt(28.1).slips[0];
  const stopped = TL.pAt(28.5).slips[0];
  assert.equal(hit.x, 2820);
  assert.equal(stopped.x, 2780);
  assert.equal(stopped.rot, -3);
  assert.equal(stopped.rewrite, undefined);
  assert.equal(TL.pAt(32.94).slips.length, 1);
});

test('new requirement changes only the adapted copy and keeps role rows', () => {
  const original = TL.pAt(28.5).slips[0];
  const [kept, adapted] = TL.pAt(33.53).slips;
  assert.equal(kept.x, 2300);
  assert.equal(kept.rewrite, undefined);
  assert.equal(adapted.x, 2848);
  assert.equal(adapted.rewrite, 1);
  assert.equal(adapted.teethK, 1);
  assert.equal(adapted.headerK, 1);
  assert.equal(adapted.headerB, '其他模型');
  assert.deepEqual(kept.rows, original.rows);
  assert.deepEqual(adapted.rows, original.rows);
  assert.equal(TL.pAt(34.38).lanes.g01, true);
});

test('media is visibly labeled synthetic SVG, with no original video node', () => {
  for (const [key, uri] of Object.entries(data.img)) {
    assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'), key);
    assert.match(decodeURIComponent(uri), /中性媒体占位/);
  }
  const scene = fs.readFileSync(path.join(root, 'src/scenes.jsx'), 'utf8');
  assert.doesNotMatch(scene, /<OffthreadVideo|staticFile\(/);
  assert.equal(data.inputs, undefined);
});

test('local import graph and data have no private absolute path', () => {
  const src = path.join(root, 'src');
  for (const name of fs.readdirSync(src)) {
    const text = fs.readFileSync(path.join(src, name), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z]\x3a(?:\x5c|\/)|file\x3a\/\//, name);
    for (const match of text.matchAll(/(?:from\s+|require\()['"](\.\.?\/[^'"]+)['"]/g)) {
      const base = path.resolve(src, match[1]);
      assert.ok([base, base + '.jsx', base + '.cjs', base + '.json'].some(p => fs.existsSync(p)), `${name} -> ${match[1]}`);
    }
  }
});
