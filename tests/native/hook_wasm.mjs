import assert from 'node:assert/strict';
import fs from 'node:fs';
import { enemySprite } from '../../build/web/enemies.mjs';
const cases = JSON.parse(fs.readFileSync('research/captive-pose.json')).cases.filter(
  (c) => c.device === 0,
);
const enemies = JSON.parse(fs.readFileSync('research/enemy-data.json')).records;
const animations = JSON.parse(fs.readFileSync('build/web/game-data.json')).enemyAnimations;
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
const restore = (b) => {
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  return core.restore();
};
const draw = (captured = false) =>
  new Float32Array(
    core.memory.buffer,
    captured ? core.frame_ptr() : core.draw_ptr(),
    core.draw_len(),
  ).slice();
function near(a, b, label) {
  assert.ok(Math.abs(a - b) < 0.0001, `${label}: ${a} vs ${b}`);
}
let count = 0;
for (const c of cases) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((n, i) => {
    core.configure(i, n);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save(),
    v = new DataView(b.buffer),
    a = c.initial;
  const stats = enemies[c.kind].base_stats;
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(30 * 4, 0, true);
  v.setInt32(34 * 4, 0, true);
  [
    7,
    c.kind,
    stats.base_kill_reward,
    stats.castle_hit_damage,
    enemies[c.kind].base_fields['0xec'],
    1,
    0,
  ].forEach((n, i) => {
    v.setUint32((235 + i) * 4, n, true);
  });
  [
    a.x,
    a.y,
    a.ground,
    a.vx,
    a.vy,
    a.hp,
    a.speed,
    a.saved_speed,
    stats.drag_mass,
    stats.render_scale,
    a.drag_time,
    a.frame,
    a.target_x,
    a.target_y,
    a.y,
    stats.attack_cooldown,
    a.alpha / 255,
    99,
    0,
    stats.attack_range_offset,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  v.setUint32(61748, a.pose, true);
  assert.equal(restore(b), 1);
  for (const sample of c.frames) {
    core.step();
    const d = draw(),
      f = draw(true),
      native = sample.actor;
    const label = `${c.kind}/${c.pose}/${sample.tick}`;
    assert.equal(Boolean(d[20]), Boolean(native.active), `${label} active`);
    assert.equal(d[6], sample.sacrifices, `${label} sacrifices`);
    if (native.active) {
      for (const [offset, key] of [
        [21, 'x'],
        [22, 'y'],
        [24, 'frame'],
        [29, 'angle'],
      ])
        near(d[offset], native[key], `${label} ${key}`);
      near(d[26], native.alpha / 255, `${label} opacity`);
      assert.equal(
        enemySprite(animations, c.kind, d[20], d[24], d[28]),
        animations[c.kind][native.pose][Math.floor(native.frame)] ?? null,
        `${label} sprite`,
      );
    }
    if (sample.drawn.length) {
      const native = sample.drawn[0];
      near(f[21], native.x, `${label} displayed x`);
      near(f[22], native.y, `${label} displayed y`);
      near(f[24], native.frame, `${label} displayed frame`);
      assert.equal(
        enemySprite(animations, c.kind, f[20], f[24], f[28]),
        animations[c.kind][native.pose][Math.floor(native.frame)] ?? null,
        `${label} displayed sprite`,
      );
    } else assert.equal(f[20], 0, `${label} no actor drawn`);
    near(d[12], sample.device.elapsed, `${label} dragon timer`);
    if ([5, 35, 39, 40, 120].includes(sample.tick)) {
      const checkpoint = save();
      core.step();
      const next = save();
      assert.equal(restore(checkpoint), 1);
      assert.deepEqual(draw(true), f, `${label} captured pose resumes`);
      core.step();
      assert.deepEqual(save(), next, `${label} deterministic replay`);
      assert.equal(restore(checkpoint), 1);
    }
    count++;
  }
}
const valid = save();
const bad = valid.slice();
new DataView(bad.buffer).setUint32(61748, 12, true);
assert.equal(restore(bad), 0);
assert.deepEqual(save(), valid, 'Bad retained pose does not replace the live game');
const old = valid.slice(0, 61748);
new DataView(old.buffer).setUint32(4, 18, true);
assert.equal(restore(old), 1, 'Version18 is still readable');
console.log(
  `Hook: ${count} native frames across all11 kinds, initial poses, dark-knight escape, dragon rewards and save/replay pass.`,
);
