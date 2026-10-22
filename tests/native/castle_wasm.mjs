import assert from 'node:assert/strict';
import fs from 'node:fs';
import { castleScene } from '../../web/scene.mjs';
const native = JSON.parse(fs.readFileSync('research/castle.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  return core.restore();
}
function setup(immune = false) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100, 0, 0, 0);
  const bytes = save(),
    v = new DataView(bytes.buffer);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(32324, -400, true); // The native fixture calls castle routines after entrance.
  v.setUint32(32340, immune ? 1 : 0, true);
  assert.equal(restore(bytes), 1);
}
function actor(v, index, kind, damage, x = 335, speed = 0, range = 0, state = 5) {
  const start = 235 + index * 27;
  [state, kind, 10, damage, 0, 0, 0].forEach((n, i) => {
    v.setUint32((start + i) * 4, n, true);
  });
  [x, 240, 240, 0, 0, 600, speed, speed, 1, 0.8, 0, 0, x, 240, 240, 0.9, 1, 100, 0, range].forEach(
    (n, i) => {
      v.setFloat32((start + 7 + i) * 4, n, true);
    },
  );
  if (state === 5) v.setFloat32((start + 18) * 4, 5.9, true);
}
let frames = 0;
for (const c of native.cases) {
  setup(c.immune);
  let rng = 73;
  for (const f of c.frames) {
    const bytes = save(),
      v = new DataView(bytes.buffer);
    v.setUint32(20 * 4, rng, true);
    v.setUint32(235 * 4, 0, true);
    v.setUint32((235 + 27) * 4, 0, true);
    f.hits.forEach((damage, i) => {
      actor(v, i, 0, damage);
    });
    assert.equal(restore(bytes), 1);
    core.step();
    const current = new DataView(save().buffer),
      draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    for (const [offset, key] of [
      [48212, 'shake'],
      [48216, 'age'],
    ])
      assert.equal(
        current.getFloat32(offset, true),
        f.state[key],
        `${key} ${c.tier}/${c.immune}/${f.tick}`,
      );
    assert.equal(draw[2], f.state.hp, 'Original HP is not clamped after destruction');
    assert.equal(draw[5837], f.state.broken);
    const commands = castleScene(c.tier, draw[5838], draw[5839], draw[5840]);
    assert.deepEqual(
      commands.map((d) => ({ ...d, blend: d.blend ?? 'source-over' })),
      f.draws.map(({ color, ...d }) => d),
      `Castle frame ${c.tier}/${c.immune}/${f.tick}`,
    );
    if (f.state.broken)
      assert.equal(
        f.after_draws[0].image,
        'castle_enter_rez.png',
        'Breached arch draws after enemies',
      );
    if (f.tick === 22 || f.tick === 31) {
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
for (const a of native.breach.actors) {
  setup();
  const bytes = save(),
    v = new DataView(bytes.buffer);
  v.setUint32(48208, 1, true);
  v.setUint32(32340, 2, true);
  v.setFloat32(23 * 4, -1, true);
  actor(v, 0, a.kind, 4, a.initial.x, a.initial.speed, a.initial.range, 1);
  assert.equal(restore(bytes), 1);
  core.step();
  const now = new DataView(save().buffer);
  assert.equal(
    now.getFloat32(242 * 4, true),
    a.x,
    `Enemy ${a.kind} advances through breached door`,
  );
  assert.equal(now.getFloat32(248 * 4, true), a.speed);
  assert.equal(now.getFloat32(261 * 4, true), a.range);
  assert.equal(restore(save()), 1, 'Breached movement saves remain valid');
}
// Exactly zero HP survives in the original; the next hit starts defeat.
setup();
let bytes = save(),
  v = new DataView(bytes.buffer);
v.setFloat32(23 * 4, 10, true);
actor(v, 0, 0, 10);
assert.equal(restore(bytes), 1);
core.step();
let draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
assert.equal(draw[2], 0);
assert.equal(draw[3699], 0);
assert.equal(draw[5837], 0);
bytes = save();
v = new DataView(bytes.buffer);
actor(v, 0, 0, 1);
assert.equal(restore(bytes), 1);
core.step();
draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
assert.equal(draw[2], -1);
assert.equal(draw[3699], 2);
assert.equal(draw[5837], 1);
assert.equal(draw[5838] & 2, 0, 'The breaking hit happened after this frame’s castle drawing');
core.step();
draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
assert.equal(draw[5838] & 2, 2);
const good = save();
for (const [offset, value] of [
  [48212, NaN],
  [48216, -1],
  [48220, Infinity],
  [48224, -Infinity],
  [48228, 4],
]) {
  const bad = good.slice(),
    v = new DataView(bad.buffer);
  if (offset === 48228) v.setUint32(offset, value, true);
  else v.setFloat32(offset, value, true);
  assert.equal(restore(bad), 0);
  assert.deepEqual(save(), good);
}
const older = good.slice(0, 48212);
new DataView(older.buffer).setUint32(4, 12, true);
assert.equal(restore(older), 1);
assert.equal(new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len())[5837], 1);
console.log(
  `Castle: ${frames} native hit/draw frames, all 5 doors, victory immunity, 9 breached enemy types, exact-zero survival, replay and v12 migration pass.`,
);
