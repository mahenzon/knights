import fs from 'node:fs';
import assert from 'node:assert/strict';
const native = JSON.parse(fs.readFileSync('tests/fixtures/trembling.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const offset = 48232;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  return core.restore();
}
function setup(strength) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const bytes = save(),
    v = new DataView(bytes.buffer);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(offset, strength, true);
  assert.equal(restore(bytes), 1);
}
let frames = 0;
for (const c of native.timelines) {
  setup(c.initial);
  let rng = 73;
  for (const f of c.frames) {
    const b = save();
    new DataView(b.buffer).setUint32(20 * 4, rng, true);
    assert.equal(restore(b), 1);
    core.step();
    const v = new DataView(save().buffer);
    for (const [i, name] of ['strength', 'x', 'y'].entries())
      assert.equal(v.getFloat32(offset + i * 4, true), f[name], `${c.initial}/${frames}/${name}`);
    const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    assert.deepEqual([...draw.slice(5841, 5845)], [...(f.transforms[0] ?? [0, 0]), f.x, f.y]);
    if (frames % 30 === 0) {
      const before = save();
      core.step();
      const after = save();
      assert.equal(restore(before), 1);
      core.step();
      assert.deepEqual(save(), after);
      assert.equal(restore(before), 1);
    }
    rng = f.rng;
    frames++;
  }
}
let triggers = 0;
for (const c of native.triggers.filter((c) => !(c.source === 'death' && c.kind === 3))) {
  setup(Math.fround(0.75 + Math.fround(Math.fround(1 / 60) * 10)));
  const b = save(),
    v = new DataView(b.buffer);
  if (c.source === 'missile') {
    const p = 27480;
    [1, c.kind, c.tier].forEach((n, i) => {
      v.setUint32(p + i * 4, n, true);
    });
    [
      200,
      280,
      0,
      50,
      0,
      c.kind === 0 ? 1200 : c.kind === 3 ? 600 : 0,
      c.kind === 0 ? 0.6 : c.kind === 3 ? 10 : 1.4,
    ].forEach((n, i) => {
      v.setFloat32(p + (i + 3) * 4, n, true);
    });
  } else {
    const p = 23340,
      initial = c.initial;
    v.setUint32(p, 1, true);
    v.setUint32(p + 4, c.kind, true);
    const values = initial
      ? [
          0,
          initial.lifetime,
          initial.gravity,
          initial.x,
          initial.y,
          initial.vx,
          initial.vy,
          0,
          0,
          0,
          0,
          initial.scale,
          0,
        ]
      : [1, 0.5, 0, 200, 120, 0, 0, 0, 0, 0, 0, 1, 0];
    values.forEach((n, i) => {
      v.setFloat32(p + (i + 3) * 4, n, true);
    });
    v.setUint32(p + 16 * 4, c.landed ? 1 : 0, true);
    v.setUint32(31480, c.tier, true);
    v.setFloat32(31484, 0.4, true);
    v.setInt32(31492, initial?.counter ?? 0, true);
  }
  assert.equal(restore(b), 1, JSON.stringify(c));
  core.step();
  assert.equal(
    new DataView(save().buffer).getFloat32(offset, true),
    c.strength,
    `${c.source}/${c.kind}/${c.tier}/${c.landed}`,
  );
  triggers++;
}
const good = save();
for (const [at, n] of [
  [offset, NaN],
  [offset, -2],
  [offset + 4, Infinity],
  [offset + 8, NaN],
  [offset + 12, 2],
]) {
  const b = good.slice(),
    v = new DataView(b.buffer);
  if (at === offset + 12) v.setUint32(at, n, true);
  else v.setFloat32(at, n, true);
  assert.equal(restore(b), 0);
  assert.deepEqual(save(), good);
}
const old = good.slice(0, offset);
new DataView(old.buffer).setUint32(4, 13, true);
assert.equal(restore(old), 1);
assert.deepEqual(
  [...new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice(5841, 5845)],
  [0, 0, 0, 0],
);
console.log(
  `Screen shake: ${frames} native transform frames, ${triggers} impact cases, retained particle offsets, replay, v13 migration and corruption rejection pass.`,
);
