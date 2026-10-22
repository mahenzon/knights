import fs from 'node:fs';
import assert from 'node:assert/strict';
const native = JSON.parse(fs.readFileSync('tests/fixtures/smoke-data.json'));
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  return core.restore();
}
function setup() {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const bytes = save();
  new DataView(bytes.buffer).setFloat32(27 * 4, 9999, true);
  assert.equal(restore(bytes), 1);
}
// Replay every captured native smoke through the public save/step/draw ABI.
for (const timeline of native.timelines) {
  setup();
  const bytes = save(),
    view = new DataView(bytes.buffer),
    u = timeline.initial;
  view.setUint32(32344, 1, true);
  view.setUint32(32348, u.kind, true);
  [u.x, u.y, u.size, u.growth, u.alpha, u.fade].forEach((v, i) => {
    view.setFloat32(32352 + i * 4, v, true);
  });
  view.setUint32(32376, u.additive, true);
  assert.equal(restore(bytes), 1);
  for (const expected of timeline.frames) {
    core.step();
    const s = new DataView(save().buffer),
      label = `smoke ${u.kind}, frame ${expected.tick}`;
    assert.equal(s.getUint32(32344, true), expected.active, label);
    assert.equal(s.getFloat32(32360, true), expected.size, label);
    assert.equal(s.getFloat32(32368, true), expected.alpha, label);
    if (expected.tick === 3) {
      const checkpoint = save();
      core.step();
      const after = save();
      assert.equal(restore(checkpoint), 1);
      core.step();
      assert.deepEqual(save(), after);
      assert.equal(restore(checkpoint), 1);
    }
  }
}
// Expiring an actual barrel must emit the recovered four layers at its real coordinates.
setup();
const b = save(),
  v = new DataView(b.buffer),
  p = (235 + 200 * 27 + 200) * 4;
v.setUint32(p, 1, true);
v.setUint32(p + 4, 4, true);
for (const [i, value] of [
  [3, 10],
  [4, 1],
  [6, 200],
  [7, 240],
  [14, 0.8],
])
  v.setFloat32(p + i * 4, value, true);
assert.equal(restore(b), 1);
core.step();
const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
const barrel = native.emitters.find((e) => e.source === 'projectile' && e.kind === 4);
for (const [i, u] of barrel.smokes.entries()) {
  const offset = 3701 + i * 6;
  assert.equal(d[offset], u.kind + 1);
  assert.equal(d[offset + 1], 200);
  assert.equal(d[offset + 2], 240);
}
assert.equal(d[3701 + 4 * 6], 0, 'Exactly four layers, no duplicate emission');
const good = save(),
  bad = good.slice();
new DataView(bad.buffer).setUint32(32348, 999, true);
assert.equal(restore(bad), 0);
assert.deepEqual(save(), good, 'Malformed effects cannot replace a valid save');
for (const version of [7, 8]) {
  const older = good.slice(0, 32344);
  new DataView(older.buffer).setUint32(4, version, true);
  assert.equal(restore(older), 1, `Read snapshot ${version}`);
  assert.equal(new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len())[3701], 0);
}
// Spell charge changes selected fade rates; compare all four tiers at three strengths.
for (const emitter of native.emitters.filter((e) => e.source === 'fireball')) {
  setup();
  const bytes = save(),
    view = new DataView(bytes.buffer),
    extra = 31480;
  view.setUint32(p, 1, true);
  view.setUint32(p + 4, 2, true);
  for (const [i, value] of [
    [3, 3],
    [4, 3],
    [6, 200],
    [7, 240],
    [14, 1],
  ])
    view.setFloat32(p + i * 4, value, true);
  view.setUint32(extra, emitter.kind, true);
  view.setFloat32(extra + 4, emitter.charge, true);
  view.setUint32(extra + 12, 3, true);
  assert.equal(restore(bytes), 1);
  core.step();
  const actual = new DataView(save().buffer);
  for (const [i, layer] of emitter.smokes.entries()) {
    const at = 32344 + i * 36,
      expected = native.timelines.find((t) => JSON.stringify(t.initial) === JSON.stringify(layer))
        .frames[0];
    assert.equal(actual.getUint32(at + 4, true), layer.kind, `spell ${emitter.kind}, layer ${i}`);
    assert.equal(actual.getFloat32(at + 16, true), expected.size);
    assert.equal(actual.getFloat32(at + 24, true), expected.alpha);
    assert.equal(actual.getUint32(at, true), expected.active);
  }
}
console.log(
  'Effects: native blast growth/fades, barrel and 12 charged spell impacts, save/replay and versions 7/8 migration pass.',
);
