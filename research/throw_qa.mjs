// Native release, flight, landing, recovery and collision sequences.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../build/web/enemies.mjs';
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
const saves = {};
const template = JSON.parse(fs.readFileSync('research/enemy-cycle-qa-saves.json'))['winding-up'];
for (const c of cases.filter(c => c.kind === 4 && c.scenario === 'wall-ground' || c.kind === 0 && c.scenario === 'gentle')) {
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


  const ticks = c.kind === 4 ? 8 : 165;
  for(let n=0;n<ticks;n++) core.step();
  saves[c.scenario] = {...template, state: Buffer.from(save()).toString('base64')};
}
fs.writeFileSync('research/throw-qa-saves.json', JSON.stringify(saves));
console.log('Two throw checkpoints created.');
