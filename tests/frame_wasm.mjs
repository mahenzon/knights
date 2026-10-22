import assert from 'node:assert/strict';
import fs from 'node:fs';
import { enemySprite } from '../build/web/enemies.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/frame-phase.json'));
const enemies = JSON.parse(fs.readFileSync('tests/fixtures/enemy-data.json')).records;
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const offset = 50092;
function save() {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
}
function restore(bytes) {
  const p = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, p, bytes.length).set(bytes);
  return core.restore();
}
function draw(presentation) {
  const p = presentation ? core.frame_ptr() : core.draw_ptr();
  return new Float32Array(core.memory.buffer, p, core.draw_len()).slice();
}
function setup() {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save();
  const v = new DataView(b.buffer);
  v.setFloat32(27 * 4, 9999, true);
  v.setUint32(48248, 30, true);
  return b;
}
function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.0001, `${label}: ${actual} vs ${expected}`);
}
let count = 0;
for (const c of native.creeps) {
  const b = setup(),
    v = new DataView(b.buffer),
    u = c.initial,
    s = enemies[c.kind].base_stats;
  [1, c.kind, s.base_kill_reward, s.castle_hit_damage, u.ability_done, u.shield, 0].forEach(
    (n, j) => {
      v.setUint32((235 + j) * 4, n, true);
    },
  );
  [
    u.x,
    u.y,
    u.y,
    0,
    0,
    s.hp,
    u.speed,
    u.saved_speed,
    s.drag_mass,
    s.render_scale,
    0,
    0,
    u.x,
    u.y,
    u.y,
    100,
    1,
    100,
    0,
    s.attack_range_offset,
  ].forEach((n, j) => {
    v.setFloat32((242 + j) * 4, n, true);
  });
  assert.equal(restore(b), 1);
  for (const [tick, f] of c.frames.entries()) {
    core.step();
    const frame = draw(true),
      live = draw(false),
      label = `${c.kind}/${tick}`;
    for (const [i, key] of [
      [21, 'x'],
      [22, 'y'],
      [24, 'frame'],
    ]) {
      near(frame[i], f.before.actor[key], `${label} displayed ${key}`);
      near(live[i], f.after.actor[key], `${label} live ${key}`);
    }
    assert.equal(
      enemySprite(data.enemyAnimations, c.kind, frame[20], frame[24], frame[28]),
      f.draws[0].image,
    );
    count++;
  }
}
for (const c of native.objects) {
  const b = setup(),
    v = new DataView(b.buffer),
    p = c.initial;
  v.setUint32(23340, 1, true);
  v.setUint32(23344, c.kind, true);
  [
    0,
    p.lifetime,
    p.gravity,
    p.x,
    p.y,
    p.vx,
    p.vy,
    p.target_x,
    p.target_y,
    0,
    0,
    p.scale,
    0,
  ].forEach((n, j) => {
    v.setFloat32(23352 + j * 4, n, true);
  });
  v.setFloat32(31484, c.kind === 2 ? p.unknown28 : 0, true);
  v.setInt32(31492, p.counter, true);
  assert.equal(restore(b), 1);
  for (const [tick, f] of c.frames.entries()) {
    core.step();
    const frame = draw(true),
      live = draw(false),
      label = `object ${c.kind}/${tick}`;
    for (const [i, key] of [
      [2421, 'x'],
      [2422, 'y'],
      [2423, 'angle'],
      [2426, 'age'],
    ]) {
      near(frame[i], f.before.object[key], `${label} displayed ${key}`);
      near(live[i], f.after.object[key], `${label} live ${key}`);
    }
    count++;
  }
}
const checkpoint = save(),
  pictured = draw(true);
assert.equal(checkpoint.length, 63652);
assert.ok(checkpoint.length <= 65536 && Buffer.from(checkpoint).toString('base64').length <= 90000);
core.step();
const later = save(),
  laterFrame = draw(true);
assert.equal(restore(checkpoint), 1);
assert.deepEqual(draw(true), pictured);
core.step();
assert.deepEqual(save(), later);
assert.deepEqual(draw(true), laterFrame);
const good = save();
for (const [at, value, float] of [
  [offset, 2, false],
  [offset + 4, 200, false],
  [offset + 8, 12, true],
  [offset + 12, NaN, true],
  [offset + 20, 11, true],
  [offset + 40, 384, true],
  [offset + 8 + 2400 * 4, 4, true],
  [offset + 8 + 2404 * 4, 0, true],
]) {
  const bad = good.slice(),
    v = new DataView(bad.buffer);
  if (float) v.setFloat32(at, value, true);
  else v.setUint32(at, value, true);
  assert.equal(restore(bad), 0, `Reject frame field ${at}`);
  assert.deepEqual(save(), good);
}
const old = good.slice(0, offset);
new DataView(old.buffer).setUint32(4, 15, true);
assert.equal(restore(old), 1);
assert.deepEqual(draw(true), draw(false), 'Old saves start from the available live pose');
console.log(
  `Frame timing: ${count} native enemy/object frames, independent displayed/live poses, current replay, v15 migration, corrupt-frame rejection and save-size limits pass.`,
);
