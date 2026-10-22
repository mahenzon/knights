import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const native = JSON.parse(fs.readFileSync('research/corpses.json'));
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const enemies = JSON.parse(fs.readFileSync('research/enemy-data.json')).records;
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  const p = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, p, bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
}
let frames = 0;
for (const c of native.cases) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, c.initial.gold, 0, 0);
  const bytes = save(),
    view = new DataView(bytes.buffer),
    u = c.initial,
    s = enemies[c.kind].base_stats;
  view.setFloat32(27 * 4, 9999, true);
  [
    u.active ? 6 : 0,
    c.kind,
    s.base_kill_reward,
    s.castle_hit_damage,
    c.flying ? 4 : 0,
    0,
    0,
  ].forEach((v, i) => {
    view.setUint32((235 + i) * 4, v, true);
  });
  [
    u.x,
    u.y,
    240,
    u.vx,
    u.vy,
    -10000,
    0,
    u.saved_speed,
    0.9,
    0.8,
    0,
    0,
    u.x,
    u.y,
    u.y,
    0,
    u.alpha / 255,
    -1,
    0,
    s.attack_range_offset,
  ].forEach((v, i) => {
    view.setFloat32((242 + i) * 4, v, true);
  });
  restore(bytes);
  for (const expected of c.frames) {
    core.step();
    const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()),
      label = `corpse ${c.kind}/${c.flying}/${expected.tick}`;
    assert.equal(Number(d[20] !== 0), expected.active, `${label} active`);
    assert.equal(d[4], expected.gold, `${label} native repeat landing reward`);
    if (expected.active) {
      for (const [index, key] of [
        [21, 'x'],
        [22, 'y'],
        [24, 'frame'],
      ])
        assert.ok(
          Math.abs(d[index] - expected[key]) < 0.0001,
          `${label} ${key}: ${d[index]} vs ${expected[key]}`,
        );
      assert.ok(Math.abs(d[26] - expected.alpha / 255) < 0.00001, `${label} alpha`);
      assert.equal(
        enemySprite(data.enemyAnimations, c.kind, d[20], d[24], d[28]),
        data.enemyAnimations[c.kind][expected.animation][Math.floor(expected.frame)],
        `${label} sprite`,
      );
    }
    if (expected.tick === 20 || expected.tick === 70) {
      const checkpoint = save();
      core.step();
      const after = save();
      restore(checkpoint);
      core.step();
      assert.deepEqual(save(), after, `${label} resume`);
      restore(checkpoint);
    }
    frames++;
  }
}
console.log(
  `Corpses: ${native.cases.length} native deaths, ${frames} pose/flight/fade/reward frames and airborne/fading save replay pass.`,
);
