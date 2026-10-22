import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const native = JSON.parse(fs.readFileSync('research/enemy-followup.json'));
const enemies = JSON.parse(fs.readFileSync('research/enemy-data.json')).records;
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const save = () => {
  const pointer = core.save_ptr();
  return new Uint8Array(core.memory.buffer, pointer, core.save_len()).slice();
};
function restore(bytes) {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
}
function setup(timeline) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const bytes = save(),
    view = new DataView(bytes.buffer);
  const float = (word, value) => view.setFloat32(word * 4, value, true);
  const int = (word, value) => view.setUint32(word * 4, value, true);
  const { kind, initial: u } = timeline,
    s = enemies[kind].base_stats;
  float(27, 9999);
  [1, kind, s.base_kill_reward, s.castle_hit_damage, 0, 0, 0].forEach((v, i) => {
    int(235 + i, v);
  });
  [
    u.x,
    u.y,
    u.y,
    0,
    0,
    s.hp,
    u.speed,
    u.saved_speed,
    0.9,
    0.8,
    0,
    0,
    u.x,
    u.y,
    u.y,
    s.attack_cooldown,
    1,
    -1,
    0,
    s.attack_range_offset,
  ].forEach((v, i) => {
    float(242 + i, v);
  });
  restore(bytes);
}
// Feed the native probe's fixed random draw through the existing snapshot seam.
function undoShift(value, bits, left) {
  let result = value;
  for (let shift = bits; shift < 32; shift += bits)
    result ^= left ? value << shift : value >>> shift;
  return result >>> 0;
}
let seed = 123456;
// Two native door draws precede the first enemy.
for (let i = 0; i < 3; i++)
  seed = undoShift(undoShift(undoShift(seed, 5, true), 17, false), 13, true);
function step() {
  const bytes = save();
  new DataView(bytes.buffer).setUint32(20 * 4, seed, true);
  restore(bytes);
  core.step();
}
for (const timeline of native.abilities) {
  setup(timeline);
  let checkpoint, final;
  for (const expected of timeline.frames) {
    step();
    const view = new DataView(save().buffer);
    const float = (i) => view.getFloat32((242 + i) * 4, true);
    const integer = (i) => view.getUint32((235 + i) * 4, true);
    const context = `kind ${timeline.kind}, frame ${expected.tick}`;
    assert.equal(integer(5), expected.shield, `Shield: ${context}`);
    assert.equal(integer(4) & 1, expected.ability_done, `Ability finished: ${context}`);
    assert.equal(integer(4) >> 1, expected.ability_active, `Ability active: ${context}`);
    for (const [i, key] of [
      [0, 'x'],
      [1, 'y'],
      [3, 'vx'],
      [4, 'vy'],
      [6, 'speed'],
      [7, 'saved_speed'],
      [18, 'ability_remaining'],
    ])
      assert.ok(
        Math.abs(float(i) - expected[key]) < 0.002,
        `${key}: ${context}: ${float(i)} vs ${expected[key]}`,
      );
    assert.ok(Math.abs(float(16) - expected.alpha / 255) < 0.00001, `Alpha: ${context}`);
    const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    assert.equal(
      enemySprite(native.animation_bindings, timeline.kind, d[20], d[24], d[28]),
      native.animation_bindings[timeline.kind][expected.animation][Math.floor(expected.frame)],
      `Sprite: ${context}`,
    );
    if (expected.tick === 10) checkpoint = save();
  }
  final = save();
  restore(checkpoint);
  for (let i = 10; i < 480; i++) step();
  assert.deepEqual(save(), final, `Save/replay: kind ${timeline.kind}`);
}
console.log(
  'Enemies: 2,400 original ability/movement/sprite frames and mid-ability save/replay pass.',
);
