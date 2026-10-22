import fs from 'node:fs';
import assert from 'node:assert/strict';
import { deviceScene } from '../../web/scene.mjs';

const fixture = JSON.parse(fs.readFileSync('research/device-phase.json')).cases.find(
  (c) => c.kind === 7,
);
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
[120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((value, index) => {
  core.configure(index, value);
});
core.enemy_type(0, 0);
core.start(73, 100000, 0, 0, 0);
core.clear_equipment();
core.equip(0, 7, 0, 50, 247);
const p = core.save_ptr();
const saved = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
const v = new DataView(saved.buffer);
const actor = fixture.initial.actor;
v.setFloat32(27 * 4, 9999, true);
[1, 0, 10, 10, 0, 0, 0].forEach((n, j) => {
  v.setUint32((235 + j) * 4, n, true);
});
[
  actor.x,
  actor.y,
  247,
  0,
  0,
  actor.hp,
  actor.speed,
  actor.saved_speed,
  1,
  1,
  0,
  0,
  actor.x,
  actor.y,
  actor.y,
  0,
  1,
  99,
  0,
  0,
].forEach((n, j) => {
  v.setFloat32((242 + j) * 4, n, true);
});
new Uint8Array(core.memory.buffer, core.load_buffer(saved.length), saved.length).set(saved);
assert.equal(core.restore(), 1);
for (const f of fixture.frames) {
  core.step();
  const p = core.frame_ptr();
  const d = new Float32Array(core.memory.buffer, p, core.draw_len()).slice();
  assert.equal(d[2729], f.device.animation, `Platform frame ${f.tick}`);
  assert.equal(d[2730], f.device.animating);
  const commands = deviceScene({
    kind: 7,
    tier: 0,
    x: 50,
    y: 247,
    elapsed: d[2724],
    cooldown: 0.4,
    angle: 0,
    recoil: 0,
    animation: d[2729],
  });
  assert.equal(commands[0].image, f.draws.find((d) => d.image?.startsWith('jump_platform')).image);
  if (f.tick <= 24) {
    assert.equal(d[21], f.actor_draws[0].x);
    assert.equal(d[22], f.actor_draws[0].y);
  }
  if (f.tick === 46) {
    const s = core.save_ptr();
    const snapshot = new Uint8Array(core.memory.buffer, s, core.save_len()).slice();
    new Uint8Array(core.memory.buffer, core.load_buffer(snapshot.length), snapshot.length).set(
      snapshot,
    );
    assert.equal(core.restore(), 1, 'Final platform sprite is a valid resumable state');
  }
}
console.log(
  'Devices: 60 integrated native platform frames, trigger-before-draw positions, all eight sprites and final-frame resume pass.',
);
