// Native release, flight, landing, recovery and collision sequences.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const cases = JSON.parse(fs.readFileSync('research/throw-cycle.json')).cases;
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
    3,
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
    a.min_y,
    a.cooldown,
    1,
    99,
    0,
    s.attack_range_offset,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  v.setUint32(61748, a.pose, true);
  v.setUint32(22540, a.disarmed, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  assert.equal(core.restore(), 1);

  for (const f of c.frames) {
    core.clear_sound_events();
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
      label = `${c.kind}/${c.scenario}/${f.tick}`;
    assert.equal(Boolean(d[20]), Boolean(n.active), `${label} active`);
    assert.equal(d[4], f.balances[1], `${label} gold`);
    assert.equal(d[5], f.balances[0], `${label} score`);
    const sound = new Uint32Array(core.memory.buffer, core.sound_events_ptr(), 5);
    for (let event = 0; event < 5; event++)
      assert.equal(
        Boolean(sound[event] & (1 << c.kind)),
        f.sounds.some((s) => s.event === event),
        `${label} sound ${event}`,
      );
    if (n.active) {
      assert.ok(Math.abs(d[26] - n.alpha / 255) < 0.00001, `${label} opacity`);
      if (n.pose === 4) assert.ok(Math.abs(d[30] - n.stun_time) < 0.00001, `${label} stun timer`);
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
  `Thrown enemies: ${frames} native input/flight/landing/recovery frames across all11 kinds pass.`,
);
