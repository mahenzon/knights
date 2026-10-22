import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { enemySprite } from '../build/web/enemies.mjs';
const cases = JSON.parse(fs.readFileSync('tests/fixtures/gate-ejection.json')).cases;
const enemies = JSON.parse(fs.readFileSync('tests/fixtures/enemy-data.json')).records;
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
for (const c of cases) {
  assert.equal(core.fix_ballista_gate(0), 1);
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
  v.setFloat32(31 * 4, 22, true);
  v.setFloat32(32 * 4, -1, true);
  v.setInt32(33 * 4, 0, true);
  v.setUint32(32304 + 32, 1, true);
  [
    8,
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
    a.stun_time,
    a.frame,
    a.target_x,
    a.target_y,
    a.y,
    a.cooldown,
    a.alpha / 255,
    99,
    0,
    stats.attack_range_offset,
  ].forEach((n, i) => {
    v.setFloat32((242 + i) * 4, n, true);
  });
  v.setUint32(61748, a.pose, true);
  v.setUint32(22540, a.disarmed, true);
  v.setFloat32(25380, Math.max(0, a.freeze_time), true);
  assert.equal(restore(b), 1);
  for (let tick = 0; tick < 333; tick++) core.step();
  core.clear_sound_events();
  const beforeEjection = save();
  const before = draw();
  const events = core.step();
  const emitted = draw(),
    displayed = draw(true).slice(6075);
  const native = c.ejection.drawn[0];
  near(displayed[1], native.x, 'Ejection draws the recovered captive at its native x');
  near(displayed[4], native.frame, 'Ejection retains its pre-mutation animation');
  assert.equal(emitted[20], 9);
  assert.equal(emitted[6], 1);
  assert.ok(events & 64);
  const live = new DataView(save().buffer);
  const vx = live.getFloat32(245 * 4, true);
  assert.ok(vx >= -79 && vx <= -40);
  near(emitted[21], before[21] + Math.fround(vx / 60), 'Skeleton launches from the recovered x');
  assert.equal(
    enemySprite(animations, c.kind, emitted[20], emitted[24], emitted[28]),
    animations[c.kind][5][Math.floor(c.ejection.actor.frame)],
  );
  const originalEjection = save();
  assert.equal(core.fix_ballista_gate(1), 1);
  assert.equal(core.fix_ballista_gate(2), 0, 'Reject invalid flag without changing it');
  assert.deepEqual(save(), originalEjection, 'Flag does not alter or extend saved data');
  core.start(73, 100000, 0, 0, 0, 1);
  assert.equal(restore(b), 1, 'Flag survives next-day start and restore');
  for (let tick = 0; tick < 333; tick++) core.step();
  core.clear_sound_events();
  assert.deepEqual(save(), beforeEjection, 'Digestion is unchanged for every captive kind');
  const fixedEvents = core.step();
  const fixed = draw();
  const expected = emitted.slice();
  if (c.kind === 5) {
    expected[21] = Math.fround(233 + Math.fround(vx / 60));
    expected[6076] = expected[21];
  }
  assert.deepEqual(fixed, expected, 'Only ballista ejection x changes; rewards and physics agree');
  assert.equal(fixedEvents, events, 'Sacrifice and sound events are unchanged');
  assert.deepEqual(draw(true).slice(6075), displayed, 'Pre-ejection drawing phase is preserved');

  const fixedCheckpoint = save();
  for (let tick = 0; tick < 12; tick++) core.step();
  const fixedLater = save();
  assert.equal(restore(fixedCheckpoint), 1);
  for (let tick = 0; tick < 12; tick++) core.step();
  assert.deepEqual(save(), fixedLater, 'Corrected flight replays after save/restore');

  assert.equal(core.fix_ballista_gate(0), 1);
  assert.equal(restore(beforeEjection), 1);
  core.step();
  assert.deepEqual(save(), originalEjection, 'Disabling restores the original ejection');
}
const source = fs.readFileSync('web/game.mjs', 'utf8');
const configureFlag = source.match(/core\.fix_ballista_gate\([\s\S]*?\);/)?.[0];
assert.ok(configureFlag, 'Browser boot selects the optional fix');
for (const [search, expected] of [
  ['', 0],
  ['?fixBallistaGate=0', 0],
  ['?fixBallistaGate=true', 0],
  ['?fixBallistaGate=1', 1],
  ['?mute=1&perf=1&fixBallistaGate=1', 1],
]) {
  let selected;
  vm.runInNewContext(configureFlag, {
    URLSearchParams,
    location: { search },
    core: { fix_ballista_gate: (value) => (selected = value) },
  });
  assert.equal(selected, expected, `URL flag ${search}`);
}
console.log(
  'Gate: original ballista ejection, optional correction, URL selection and save/replay pass.',
);
