import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../build/web/enemies.mjs';
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm')),
  core = instance.exports;
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice();
const frame = () => new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function captured(gate) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save(),
    v = new DataView(b.buffer),
    float = (word, x) => v.setFloat32(word * 4, x, true),
    int = (word, x) => v.setInt32(word * 4, x, true);
  float(27, 9999);
  float(30, gate ? -1 : 0);
  float(31, gate ? 22 : 0);
  float(32, -1);
  int(33, gate ? 0 : -1);
  int(34, gate ? -1 : 0);
  const base = 235;
  [gate ? 8 : 7, 0, 10, 10, 0, 0, 0].forEach((x, i) => {
    int(base + i, x);
  });
  [
    gate ? 233 : 120,
    gate ? 130 : 90,
    gate ? 300 : 244,
    0,
    0,
    600,
    0,
    70,
    1,
    1,
    0,
    0,
    gate ? 233 : 120,
    gate ? 100 : 60,
    90,
    0,
    1,
    99,
    0,
    0,
  ].forEach((x, i) => {
    float(base + 7 + i, x);
  });
  if (gate) int(32304 / 4 + 8, 1);
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  assert.equal(core.restore(), 1);
}
captured(true);
for (let tick = 1; tick <= 334; tick++) {
  core.clear_sound_events();
  const events = core.step();
  assert.equal(state()[6], tick === 334 ? 1 : 0, `Payout timing at frame ${tick}`);
  const sounds = new Uint32Array(core.memory.buffer, core.sound_events_ptr(), 5);
  assert.equal(sounds[0] & 1, tick === 35 ? 1 : 0, 'One floor-impact sound');
  assert.equal(Boolean(events & 64), tick === 334, 'One payout sound');
}
assert.equal(state()[6], 1, 'Gate awards exactly one sacrifice at ejection');
assert.equal(frame()[6075], 8, 'Payout preserves the pre-ejection captive drawing');
const savedGate = save();
const savedFrame = frame();
core.clear_sound_events();
assert.equal(core.step() & 64, 0, 'Later frames cannot repeat the payout sound');
assert.equal(state()[6], 1, 'Later frames cannot repeat the reward');
const legacy = savedGate.slice(0, 60900);
new DataView(legacy.buffer).setUint32(4, 16, true);
new Uint8Array(core.memory.buffer, core.load_buffer(legacy.length), legacy.length).set(legacy);
assert.equal(core.restore(), 1, 'Version16 remains readable');
new Uint8Array(core.memory.buffer, core.load_buffer(savedGate.length), savedGate.length).set(
  savedGate,
);
assert.equal(core.restore(), 1);
assert.deepEqual(frame(), savedFrame, 'Current saves preserve the gate drawing pass');
for (const [offset, value] of [
  [60900, 12],
  [60904, NaN],
  [60920, -1],
]) {
  const bad = savedGate.slice();
  const view = new DataView(bad.buffer);
  view.setFloat32(offset, value, true);
  if (offset === 60920) view.setFloat32(60900, 8, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
  assert.equal(core.restore(), 0, `Reject corrupt gate pose ${offset}`);
  assert.deepEqual(save(), savedGate);
}
const corpse = JSON.parse(fs.readFileSync('tests/fixtures/gate-corpse.json'));
const animations = JSON.parse(fs.readFileSync('build/web/game-data.json')).enemyAnimations;
captured(true);
const checkpoint = save(),
  view = new DataView(checkpoint.buffer),
  initial = corpse.initial;
view.setInt32(33 * 4, -1, true);
view.setUint32(235 * 4, 9, true);
for (const [word, value] of [
  [242, initial.x],
  [243, initial.y],
  [244, 265],
  [245, initial.vx],
  [246, initial.vy],
  [253, 0],
  [258, initial.alpha / 255],
])
  view.setFloat32(word * 4, value, true);
new Uint8Array(core.memory.buffer, core.load_buffer(checkpoint.length), checkpoint.length).set(
  checkpoint,
);
assert.equal(core.restore(), 1);
for (const [frame, sample] of corpse.frames.entries()) {
  core.step();
  const d = state();
  assert.equal(d[20] !== 0, !!sample.active, `Skeleton lifetime frame ${frame}`);
  if (!sample.active) continue;
  assert.equal(d[20], 9, 'landed skeleton never turns into a bloody knight');
  assert.equal(d[21], sample.x);
  assert.equal(d[22], sample.y);
  assert.equal(d[29], sample.angle, `Native skeleton rotation frame ${frame}`);
  assert.ok(Math.abs(d[26] - sample.alpha / 255) < 0.00001, `Skeleton fade frame ${frame}`);
  assert.equal(enemySprite(animations, d[23], d[20], d[24], d[28]), 'skeleton.png');
  if (frame === 30 || (sample.dead && !corpse.frames[frame - 1].dead)) {
    const current = save(),
      rendered = new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
    core.step();
    const next = save();
    new Uint8Array(core.memory.buffer, core.load_buffer(current.length), current.length).set(
      current,
    );
    assert.equal(core.restore(), 1);
    assert.deepEqual(
      new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()),
      rendered,
    );
    core.step();
    assert.deepEqual(save(), next, 'Skeleton rotation survives replay in flight and after landing');
    new Uint8Array(core.memory.buffer, core.load_buffer(current.length), current.length).set(
      current,
    );
    assert.equal(core.restore(), 1);
  }
}
const rotated = save();
for (const value of [NaN, Infinity, 1e7]) {
  const bad = rotated.slice();
  new DataView(bad.buffer).setFloat32(60948, value, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
  assert.equal(core.restore(), 0, 'Reject corrupt rotation without replacing live state');
  assert.deepEqual(save(), rotated);
}
const v17 = rotated.slice(0, 60948);
new DataView(v17.buffer).setUint32(4, 17, true);
new DataView(v17.buffer).setFloat32(50092 + 8 + 9 * 4, 1, true);
new DataView(v17.buffer).setFloat32(60900 + 9 * 4, 1, true);
new Uint8Array(core.memory.buffer, core.load_buffer(v17.length), v17.length).set(v17);
assert.equal(core.restore(), 1, 'Version17 remains readable');
assert.equal(state()[29], 0, 'Old save has no live rotation history');
assert.equal(frame()[29], 0, 'Old captured direction is not interpreted as an angle');
assert.equal(frame()[6084], 0, 'Old gate direction is not interpreted as an angle');
console.log(
  'Sacrifices: payout drawing, v16/v17 migration/replay/rejection, 181 skeleton flight/rotation/fade frames and exactly-once rewards/sounds pass.',
);
