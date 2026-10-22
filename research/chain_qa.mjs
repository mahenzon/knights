// Integrated native deaths, knockback and allocation across multiple enemy slots.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../build/web/enemies.mjs';
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
const saves = {};
const template = JSON.parse(fs.readFileSync('research/enemy-cycle-qa-saves.json'))['winding-up'];
for (const c of cases.filter(c => ['missile-0-0-crowd','missile-2-0-crowd'].includes(c.name))) {
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
    [p.age, p.lifetime, p.gravity, p.x, p.y, p.vx, p.vy, p.target_x, p.target_y, 0, 0, p.scale, p.angle].forEach((n, j) => {
      v.setFloat32(23352 + j * 4, n, true);
    });
    v.setUint32(31480, p.upgrade, true);
    v.setFloat32(31484, p.type === 2 ? p.unknown28 : 0, true);
    v.setInt32(31492, p.counter, true);
  }
  for (const m of c.missiles) {
    const p = 27480 + m.slot * 40;
    [1, m.type, m.upgrade].forEach((n,j) => v.setUint32(p+j*4,n,true));
    [m.x,m.y,m.vx,m.vy,m.age,-m.negative_gravity,m.lifetime].forEach((n,j) => v.setFloat32(p+12+j*4,n,true));
    v.setFloat32(47808 + m.slot * 4, m.smoke_timer, true);
  }
  restore(b);

  for(let n=0;n<8;n++)core.step();
  saves[c.name] = {...template, state: Buffer.from(save()).toString('base64')};
}
fs.writeFileSync('research/chain-qa-saves.json',JSON.stringify(saves));
console.log('Two missile-chain checkpoints created.');
