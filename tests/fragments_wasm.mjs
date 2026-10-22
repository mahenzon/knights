import fs from 'node:fs';
import assert from 'node:assert/strict';
const native = JSON.parse(fs.readFileSync('tests/fixtures/fragment-emissions.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const start = 41560;
function save() {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
}
function restore(b) {
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  return core.restore();
}
function setup() {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save();
  new DataView(b.buffer).setFloat32(27 * 4, 9999, true);
  assert.equal(restore(b), 1);
}
function shards() {
  const v = new DataView(save().buffer),
    result = [];
  for (let slot = 0; slot < 150; slot++) {
    const p = start + slot * 28;
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
const compact = (s) =>
  Object.fromEntries(['slot', 'kind', 'x', 'y', 'vx', 'vy', 'size'].map((k) => [k, s[k]]));
function undo(value, bits, left) {
  let x = value;
  for (let i = bits; i < 32; i += bits) x ^= left ? value << i : value >>> i;
  return x >>> 0;
}
function rewind(seed, count) {
  for (let i = 0; i < count; i++) seed = undo(undo(undo(seed, 5, true), 17, false), 13, true);
  return seed;
}
// Trigger real projectile deaths, including allocation failure at the native 150-slot limit.
for (const c of native.cases.filter((c) => c.source === 'projectile' && [0, 5].includes(c.kind))) {
  setup();
  const b = save(),
    v = new DataView(b.buffer),
    p = (235 + 200 * 27 + 200) * 4;
  v.setUint32(20 * 4, rewind(73, 2), true);
  v.setUint32(p, 1, true);
  v.setUint32(p + 4, c.kind, true);
  for (const [i, value] of [
    [3, 10],
    [4, 1],
    [6, 200],
    [7, 120],
    [14, 1],
  ])
    v.setFloat32(p + i * 4, value, true);
  v.setUint32(31480, c.tier, true);
  assert.equal(restore(b), 1);
  core.step();
  assert.deepEqual(
    shards(),
    c.shards.map(compact),
    `Actual projectile ${c.kind}/${c.tier} emission`,
  );
  assert.equal(
    new DataView(save().buffer).getUint32(20 * 4, true),
    c.rng,
    'Native RNG advances even when the pool is full',
  );
}
// Native machine Die is reached by a fatal landing at the same position.
for (const kind of [4, 5]) {
  setup();
  const b = save(),
    v = new DataView(b.buffer);
  v.setUint32(20 * 4, rewind(73, 2), true);
  [3, kind, 10, 4, 0, 0, 0].forEach((n, i) => {
    v.setUint32((235 + i) * 4, n, true);
  });
  [
    200.75, 240.5, 240.5, 0, 100, -1, 0, 0, 1, 0.8, 0, 0, 200.75, 240.5, 240.5, 0.9, 1, -1, 0, 0,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  assert.equal(restore(b), 1);
  core.step();
  const c = native.cases.find((c) => c.source === 'creep' && c.kind === kind);
  assert.deepEqual(shards(), c.shards.map(compact), `Actual machine ${kind} emission`);
}
// Door breaks only below zero, emits once, and stays intact during the victory grace period.
for (const [hp, damage, ending, broken] of [
  [100, 10, 0, false],
  [10, 10, 0, false],
  [10, 11, 0, true],
  [10, 11, 1, false],
]) {
  setup();
  const b = save(),
    v = new DataView(b.buffer);
  v.setFloat32(23 * 4, hp, true);
  v.setUint32(32340, ending, true);
  v.setUint32(20 * 4, rewind(73, 2), true);
  [5, 0, 10, damage, 0, 0, 0].forEach((n, i) => {
    v.setUint32((235 + i) * 4, n, true);
  });
  [335, 240, 240, 0, 0, 600, 0, 0, 1, 0.8, 0, 0, 335, 240, 240, 0.9, 1, -1, 0, 0].forEach(
    (n, i) => {
      v.setFloat32((242 + i) * 4, n, true);
    },
  );
  // Finish the attack animation to trigger the actual castle hit this frame.
  v.setFloat32(253 * 4, 5.9, true);
  assert.equal(restore(b), 1);
  const events = core.step();
  assert.equal(Boolean(events & 128), broken, 'Original door-destruction sound');
  assert.equal(
    Boolean(new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len())[5837]),
    broken,
  );
  const c = native.cases.find((c) => c.source === 'castle' && c.shards.length);
  assert.deepEqual(shards(), broken ? c.shards.map(compact) : []);
  if (broken) {
    const before = save();
    core.step();
    const after = save();
    assert.equal(restore(before), 1);
    core.step();
    assert.deepEqual(save(), after);
    const replay = save(),
      r = new DataView(replay.buffer);
    r.setUint32(235 * 4, 5, true);
    r.setFloat32(253 * 4, 5.9, true);
    assert.equal(restore(replay), 1);
    assert.equal(core.step() & 128, 0, 'Later attacks cannot break the same door twice');
  }
}
const good = save();
const older = good.slice(0, 48208);
new DataView(older.buffer).setUint32(4, 11, true);
assert.equal(restore(older), 1);
assert.equal(
  new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len())[5837],
  0,
  'Version11 migrates with intact door',
);
assert.equal(restore(good), 1);
const bad = good.slice();
new DataView(bad.buffer).setUint32(48208, 2, true);
assert.equal(restore(bad), 0);
assert.deepEqual(save(), good);
console.log(
  `Fragments: ${native.cases.length} focused native emission fixtures, saturation, RNG, replay and v11 migration pass.`,
);
