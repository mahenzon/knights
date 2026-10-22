// Integrated native deaths, knockback and allocation across multiple enemy slots.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const cases = JSON.parse(fs.readFileSync('research/chain-cycle.json')).cases;
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
  const b = save(),
    v = new DataView(b.buffer);
  v.setFloat32(27 * 4, 9999, true);
  v.setUint32(20 * 4, 0, true);
  c.initial.forEach((a, i) => {
    const word = 235 + i * 27;
    [
      a.flying ? 3 : 1,
      a.kind,
      a.reward,
      a.damage,
      a.ability_done | (a.ability_active << 1),
      a.shield,
      a.immunity,
    ].forEach((n, j) => {
      v.setUint32((word + j) * 4, n, true);
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
      a.mass,
      a.size,
      a.stun_time,
      a.frame,
      a.target_x,
      a.target_y,
      a.min_y,
      a.cooldown,
      a.alpha / 255,
      a.ability_delay,
      a.ability_remaining,
      a.range,
    ].forEach((n, j) => {
      v.setFloat32((word + 7 + j) * 4, n, true);
    });
    v.setUint32(61748 + i * 4, a.pose, true);
    v.setFloat32(25380 + i * 4, Math.max(0, a.freeze_time), true);
  });
  if (c.projectile) {
    const p = c.projectile;
    v.setUint32(23340, 1, true);
    v.setUint32(23344, p.type, true);
    [
      p.age,
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
      p.angle,
    ].forEach((n, j) => {
      v.setFloat32(23352 + j * 4, n, true);
    });
    v.setUint32(31480, p.upgrade, true);
    v.setFloat32(31484, p.type === 2 ? p.unknown28 : 0, true);
    v.setInt32(31492, p.counter, true);
  }
  for (const m of c.missiles) {
    const p = 27480 + m.slot * 40;
    [1, m.type, m.upgrade].forEach((n, j) => {
      v.setUint32(p + j * 4, n, true);
    });
    [m.x, m.y, m.vx, m.vy, m.age, -m.negative_gravity, m.lifetime].forEach((n, j) => {
      v.setFloat32(p + 12 + j * 4, n, true);
    });
    v.setFloat32(47808 + m.slot * 4, m.smoke_timer, true);
  }
  restore(b);
  for (const f of c.frames) {
    core.clear_sound_events();
    core.step();
    const d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice();
    const label = `${c.name}/${f.tick}`;
    assert.deepEqual(
      Array.from(
        new Uint32Array(core.memory.buffer, core.audio_events_ptr(), core.audio_events_len()),
      ),
      f.sounds.map((s) => s.event * 30 + s.subtype),
      `${label} ordered sound requests`,
    );
    assert.equal(d[4], f.balances[1], `${label} gold`);
    assert.equal(d[5], f.balances[0], `${label} score`);
    const current = new DataView(save().buffer);
    for (let slot = 0; slot < 100; slot++) {
      const m = f.missiles.find((m) => m.slot === slot),
        p = 27480 + slot * 40;
      assert.equal(current.getUint32(p, true), m ? 1 : 0, `${label}/missile${slot} active`);
      if (!m) continue;
      assert.equal(current.getUint32(p + 4, true), m.type, `${label}/missile${slot} kind`);
      for (const [offset, expected] of [
        [p + 12, m.x],
        [p + 16, m.y],
        [p + 20, m.vx],
        [p + 24, m.vy],
        [p + 28, m.age],
        [47808 + slot * 4, m.smoke_timer],
      ])
        assert.ok(
          Math.abs(current.getFloat32(offset, true) - expected) < 0.0001,
          `${label}/missile${slot} field${offset}: ${current.getFloat32(offset, true)} vs ${expected}`,
        );
    }
    for (const a of f.actors) {
      const word = 235 + a.slot * 27;
      for (const [offset, expected] of [
        [(word + 13) * 4, a.speed],
        [(word + 22) * 4, a.cooldown],
        [25380 + a.slot * 4, Math.max(0, a.freeze_time)],
      ])
        assert.ok(
          Math.abs(current.getFloat32(offset, true) - expected) < 0.0001,
          `${label}/${a.slot} timer/speed at ${offset}`,
        );
    }
    if (f.tick === 1) {
      for (const [slot, n] of f.smokes.entries()) {
        const p = 3701 + slot * 6;
        const active =
          n.size + Math.fround(n.growth * Math.fround(1 / 60)) >= 0 &&
          n.alpha + Math.fround(n.fade * Math.fround(1 / 60)) >= 0;
        assert.deepEqual(
          [...d.slice(p, p + 3)],
          [
            active ? n.kind + 1 : 0,
            Math.trunc(Math.fround(n.x + Math.fround(n.vx * Math.fround(1 / 60)))),
            Math.trunc(Math.fround(n.y + Math.fround(n.vy * Math.fround(1 / 60)))),
          ],
          `${label} smoke ${slot}`,
        );
      }
      assert.equal(d[3701 + f.smokes.length * 6], 0, `${label} smoke count`);
      const state = new DataView(save().buffer);
      for (const [slot, n] of f.fragments.entries()) {
        const p = 41560 + slot * 28;
        assert.equal(state.getUint32(p + 4, true), n.kind, `${label} debris kind ${slot}`);
        const vy = Math.fround(
          n.vy + Math.fround((n.kind < 3 ? 1400 : 1000) * Math.fround(1 / 60)),
        );
        assert.equal(
          state.getInt32(p + 8, true),
          Math.trunc(Math.fround(n.x + Math.fround(n.vx * Math.fround(1 / 60)))),
          `${label} debris x ${slot}`,
        );
        assert.equal(
          state.getInt32(p + 12, true),
          Math.trunc(Math.fround(n.y + Math.fround(vy * Math.fround(1 / 60)))),
          `${label} debris y ${slot}`,
        );
      }
      assert.equal(
        state.getUint32(41560 + f.fragments.length * 28, true),
        0,
        `${label} debris count`,
      );
    }
    const sound = new Uint32Array(core.memory.buffer, core.sound_events_ptr(), 5);
    for (let event = 0; event < 5; event++)
      for (let kind = 0; kind < 11; kind++)
        assert.equal(
          Boolean(sound[event] & (1 << kind)),
          f.sounds.some((s) => s.event === event && s.subtype === kind),
          `${label} sound ${event}/${kind}`,
        );
    const shown = new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
    for (const [data, native, phase] of [
      [d, f.objects_after, 'live'],
      [shown, f.objects_before, 'drawn'],
    ]) {
      for (let slot = 0; slot < 30; slot++) {
        const n = native.find((n) => n.slot === slot),
          p = 2420 + slot * 10;
        assert.equal(data[p], n ? n.kind + 1 : 0, `${label}/${phase}/projectile${slot} kind`);
        if (!n) continue;
        for (const [offset, key] of [
          [1, 'x'],
          [2, 'y'],
          [3, 'angle'],
          [4, 'size'],
          [5, 'held'],
          [6, 'age'],
          [8, 'tier'],
        ])
          assert.ok(
            Math.abs(data[p + offset] - n[key]) < 0.0001,
            `${label}/${phase}/projectile${slot} ${key}: ${data[p + offset]} vs ${n[key]}`,
          );
      }
    }
    for (const [data, native, phase] of [
      [d, f.actors, 'live'],
      [shown, f.drawn, 'drawn'],
    ]) {
      for (let slot = 0; slot < 200; slot++) {
        const n = native.find((n) => n.slot === slot),
          p = 20 + slot * 12;
        assert.equal(Boolean(data[p]), Boolean(n), `${label}/${phase}/${slot} active`);
        if (!n) continue;
        assert.equal(data[p + 3], n.kind, `${label}/${phase}/${slot} kind`);
        assert.equal(
          Boolean(data[p + 8] & 4),
          Boolean(n.burning),
          `${label}/${phase}/${slot} burning`,
        );
        assert.equal(
          Boolean(data[p + 8] & 8),
          Boolean(n.frozen),
          `${label}/${phase}/${slot} frozen`,
        );
        for (const [offset, key] of [
          [1, 'x'],
          [2, 'y'],
          [4, 'frame'],
          [7, 'hp'],
        ])
          assert.ok(
            Math.abs(data[p + offset] - n[key]) < 0.0001,
            `${label}/${phase}/${slot} ${key}: ${data[p + offset]} vs ${n[key]}`,
          );
        assert.ok(
          Math.abs(data[p + 6] - n.alpha / 255) < 0.00001,
          `${label}/${phase}/${slot} alpha`,
        );
        assert.equal(
          enemySprite(animations, n.kind, data[p], data[p + 4], data[p + 8]),
          animations[n.kind][n.pose][Math.floor(n.frame)] ?? null,
          `${label}/${phase}/${slot} sprite`,
        );
      }
    }
    if ([1, 2, 10, 30, 60, 100, 180].includes(f.tick)) {
      const before = save();
      core.step();
      const after = save();
      restore(before);
      assert.deepEqual(
        new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()),
        shown,
      );
      core.step();
      assert.deepEqual(save(), after, `${label} replay`);
      restore(before);
    }
    frames++;
  }
}
console.log(
  `Enemy chains: ${frames} native multi-actor frames, rewards, sound events and replay pass.`,
);
