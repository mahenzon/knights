import assert from 'node:assert/strict';
import fs from 'node:fs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/ice-fragments.json'));
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const ICE = 41560;
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
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 10000, 0, 0, 0);
  const b = save();
  new DataView(b.buffer).setFloat32(27 * 4, 9999, true);
  assert.equal(restore(b), 1);
}
function shards() {
  const v = new DataView(save().buffer);
  const result = [];
  for (let slot = 0; slot < 150; slot++) {
    const p = ICE + slot * 28;
    if (!v.getUint32(p, true)) continue;
    result.push({
      slot,
      kind: v.getUint32(p + 4, true),
      x: v.getInt32(p + 8, true),
      y: v.getInt32(p + 12, true),
      vx: v.getFloat32(p + 16, true),
      vy: v.getFloat32(p + 20, true),
      size: v.getFloat32(p + 24, true),
    });
  }
  return result;
}
setup();
const initial = save(),
  view = new DataView(initial.buffer);
for (const s of native.cases[0].initial) {
  const p = ICE + s.slot * 28;
  [1, s.kind, s.x, s.y].forEach((v, i) => {
    view.setInt32(p + i * 4, v, true);
  });
  [s.vx, s.vy, s.size].forEach((v, i) => {
    view.setFloat32(p + 16 + i * 4, v, true);
  });
}
assert.equal(restore(initial), 1);
const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
for (const [i, d] of native.cases[0].draws.entries())
  assert.deepEqual([...draw.slice(5237 + i * 4, 5241 + i * 4)], [d.kind + 1, d.x, d.y, d.sx]);
for (const frame of native.timelines) {
  core.step();
  assert.deepEqual(shards(), frame.shards, `Native fragment frame ${frame.frame}`);
  if (frame.frame === 20) {
    const checkpoint = save();
    core.step();
    const after = save();
    assert.equal(restore(checkpoint), 1);
    core.step();
    assert.deepEqual(save(), after);
    assert.equal(restore(checkpoint), 1);
  }
}
function undo(value, bits, left) {
  let x = value;
  for (let i = bits; i < 32; i += bits) x ^= left ? value << i : value >>> i;
  return x >>> 0;
}
for (const expected of native.landings) {
  setup();
  const b = save(),
    v = new DataView(b.buffer);
  // Only the two native door draws precede this landing's emitter.
  let seed = 73;
  for (let i = 0; i < 2; i++) seed = undo(undo(undo(seed, 5, true), 17, false), 13, true);
  v.setUint32(20 * 4, seed, true);
  [3, 0, 10, 4, 0, 0, 0].forEach((n, i) => {
    v.setUint32((235 + i) * 4, n, true);
  });
  [
    200.75,
    240.5,
    240.5,
    0,
    expected.velocity,
    600,
    0,
    38,
    0.9,
    0.8,
    0,
    0,
    200.75,
    240.5,
    240.5,
    0.9,
    1,
    -1,
    0,
    0,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  v.setFloat32(25380, 3.5, true);
  assert.equal(restore(b), 1);
  const events = core.step();
  assert.ok(events & 2048, 'frozen impact plays the original ice_destroy sound');
  assert.equal(shards().length, expected.fragments);
  const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
  assert.equal(d[20], expected.active, 'shattered enemy is removed');
  assert.equal(d[4], expected.gold, 'nonfatal frozen landing grants no kill reward');
  if (expected.velocity === 100) assert.deepEqual(shards(), native.timelines[0].shards);
}
const good = save();
for (const [offset, value] of [
  [0, 2],
  [4, 15],
  [8, 0x7fffffff],
  [16, 0x7fc00000],
  [20, 0x7f800000],
  [24, 0xbf800000],
]) {
  const b = good.slice();
  new DataView(b.buffer).setUint32(ICE + offset, value, true);
  assert.equal(restore(b), 0);
  assert.deepEqual(save(), good, 'invalid shard save must be atomic');
}
const old = good.slice(0, ICE);
new DataView(old.buffer).setUint32(4, 9, true);
assert.equal(restore(old), 1);
assert.equal(shards().length, 0, 'snapshot9 migrates without phantom fragments');
console.log(
  'Ice shatter: 74 native flight frames, drawing, two landing/reward paths, save replay and v9 migration match.',
);
