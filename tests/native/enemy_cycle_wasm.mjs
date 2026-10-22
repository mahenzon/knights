// Long integrated native walking/attack cycles, including disarm and barrel death.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const cases = JSON.parse(fs.readFileSync('research/enemy-cycle.json')).cases;
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
  assert.equal(core.restore(), 1);
};
// Supply the probe's random value at the ability call through the snapshot seam.
function undoShift(value, bits, left) {
  let result = value;
  for (let shift = bits; shift < 32; shift += bits)
    result ^= left ? value << shift : value >>> shift;
  return result >>> 0;
}
let frames = 0;
for (const c of cases) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((n, i) => {
    core.configure(i, n);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const p = core.save_ptr(),
    b = new Uint8Array(core.memory.buffer, p, core.save_len()).slice(),
    v = new DataView(b.buffer),
    a = c.initial,
    s = enemies[c.kind].base_stats;
  v.setFloat32(27 * 4, 9999, true);
  [
    1,
    c.kind,
    s.base_kill_reward,
    s.castle_hit_damage,
    enemies[c.kind].base_fields['0xec'],
    0,
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
    s.drag_mass,
    s.render_scale,
    a.stun_time,
    a.frame,
    a.target_x,
    a.target_y,
    a.y,
    a.cooldown,
    1,
    a.ability_delay,
    0,
    s.attack_range_offset,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  assert.equal(core.restore(), 1);

  for (const f of c.frames) {
    core.clear_sound_events();
    if (c.abilities) {
      const b = save(),
        v = new DataView(b.buffer);
      let seed = 123456;
      const calls = 3 + (v.getFloat32(48232, true) > 0 ? 2 : 0);
      for (let i = 0; i < calls; i++)
        seed = undoShift(undoShift(undoShift(seed, 5, true), 17, false), 13, true);
      v.setUint32(20 * 4, seed, true);
      restore(b);
    }
    core.step();
    assert.deepEqual(
      Array.from(
        new Uint32Array(core.memory.buffer, core.audio_events_ptr(), core.audio_events_len()),
      ).filter((id) => id < 150),
      f.sounds.filter((s) => s.event < 5).map((s) => s.event * 30 + s.subtype),
      `Native actor sound order ${c.kind}/${f.tick}`,
    );
    const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    const n = f.actor,
      label = `${c.kind}/${c.abilities ? 'abilities' : 'ordinary'}/${f.tick}`;
    assert.equal(Boolean(d[20]), Boolean(n.active), `${label} active`);
    const sound = new Uint32Array(core.memory.buffer, core.sound_events_ptr(), 5);
    for (let event = 0; event < 5; event++)
      assert.equal(
        Boolean(sound[event] & (1 << c.kind)),
        f.sounds.some((s) => s.event === event),
        `${label} sound ${event}`,
      );
    if (n.active) {
      assert.ok(Math.abs(d[26] - n.alpha / 255) < 0.00001, `${label} alpha`);
      const state = new DataView(save().buffer);
      assert.equal(state.getUint32(240 * 4, true), n.shield, `${label} shield`);
      assert.equal(
        state.getUint32(239 * 4, true),
        n.ability_done | (n.ability_active << 1),
        `${label} ability flags`,
      );
      for (const [offset, key] of [
        [248, 'speed'],
        [249, 'saved_speed'],
        [259, 'ability_delay'],
        [260, 'ability_remaining'],
      ])
        assert.ok(
          Math.abs(state.getFloat32(offset * 4, true) - n[key]) < 0.00001,
          `${label} ${key}: ${state.getFloat32(offset * 4, true)} vs ${n[key]}`,
        );
      for (const [offset, key] of [
        [21, 'x'],
        [22, 'y'],
        [24, 'frame'],
        [27, 'hp'],
      ])
        assert.ok(
          Math.abs(d[offset] - n[key]) < 0.0001,
          `${label} ${key}: ${d[offset]} vs ${n[key]}`,
        );
      assert.equal(
        enemySprite(animations, c.kind, d[20], d[24], d[28]),
        animations[c.kind][n.pose][Math.floor(n.frame)] ?? null,
        `${label} sprite`,
      );
    }
    const rendered = new Float32Array(
      core.memory.buffer,
      core.frame_ptr(),
      core.draw_len(),
    ).slice();
    if (f.drawn.length) {
      const n = f.drawn[0];
      for (const [offset, key] of [
        [21, 'x'],
        [22, 'y'],
        [24, 'frame'],
      ])
        assert.ok(Math.abs(rendered[offset] - n[key]) < 0.0001, `${label} displayed ${key}`);
      assert.equal(
        enemySprite(animations, c.kind, rendered[20], rendered[24], rendered[28]),
        animations[c.kind][n.pose][Math.floor(n.frame)] ?? null,
        `${label} displayed sprite`,
      );
    } else assert.equal(rendered[20], 0, `${label} inactive actor is not drawn`);
    if ([45, 79, 80, 81, 223, 250, 279, 301].includes(f.tick)) {
      const before = save();
      core.step();
      const after = save();
      restore(before);
      assert.deepEqual(
        new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()),
        rendered,
      );
      core.step();
      assert.deepEqual(save(), after, `${label} deterministic replay`);
      restore(before);
    }
    frames++;
  }
}
console.log(
  `Enemy cycles: ${frames} native walking/ability/attack frames across all11 kinds pass.`,
);
