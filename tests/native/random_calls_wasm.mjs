import fs from 'node:fs';
import assert from 'node:assert/strict';

const native = JSON.parse(fs.readFileSync('research/random-calls.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
function save() {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
}
function restore(bytes) {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
}
function advance(seed, count) {
  for (let i = 0; i < count; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
  }
  return seed >>> 0;
}
function undo(value, bits, left) {
  let result = value;
  for (let shift = bits; shift < 32; shift += bits)
    result ^= left ? value << shift : value >>> shift;
  return result >>> 0;
}
function rewind(seed, count) {
  for (let i = 0; i < count; i++) seed = undo(undo(undo(seed, 5, true), 17, false), 13, true);
  return seed;
}
function start(kind = 0, range = 0) {
  [120, -10000, 0, 0, range, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, kind);
  core.start(73, 100000, 0, 0, 0);
}
let frames = 0;
for (const c of native.cases) {
  start();
  const b = save(),
    v = new DataView(b.buffer),
    a = c.initial;
  v.setFloat32(108, 9999, true);
  if (a) {
    [
      1,
      a.kind,
      a.reward,
      a.damage,
      a.ability_done | (a.ability_active << 1),
      a.shield,
      a.immunity,
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
    ].forEach((n, i) => {
      v.setFloat32((242 + i) * 4, n, true);
    });
  }
  restore(b);
  for (const f of c.frames) {
    const b = save(),
      v = new DataView(b.buffer);
    const ability = f.calls.findIndex((x) => x === '0x273f0' || x === '0x274b0');
    const seed = ability < 0 ? 73 : rewind(123456, ability + 1);
    v.setUint32(80, seed, true);
    restore(b);
    core.step();
    const actual = new DataView(save().buffer).getUint32(80, true);
    assert.equal(
      actual,
      advance(seed, f.calls.length),
      `kind ${c.kind}, frame ${f.tick}: native random call count ${f.calls.length}`,
    );
    frames++;
  }
}
for (const c of native.initializers) {
  start(c.kind, c.speed_range);
  const b = save(),
    v = new DataView(b.buffer);
  v.setUint32(19 * 4, 9, true);
  v.setFloat32(108, -1, true);
  v.setUint32(62848, 0, true);
  // Probability, unused tier, lane, table and giant selection precede creep::Init.
  v.setUint32(80, rewind(c.seed, 5), true);
  restore(b);
  core.step();
  const out = new DataView(save().buffer),
    label = `spawn ${c.kind}/${c.seed}/range${c.speed_range}`;
  assert.equal(
    out.getUint32(80, true),
    advance(c.seed, c.calls.length + 2),
    `${label} random call count`,
  );
  assert.equal(out.getFloat32((242 + 6) * 4, true), c.actor.speed, `${label} randomized speed`);
  if ([1, 6, 7, 8, 9].includes(c.kind))
    assert.equal(
      out.getFloat32((242 + 17) * 4, true),
      Math.fround(c.actor.ability_delay - Math.fround(1 / 60)),
      `${label} independent ability draws`,
    );
}
console.log(
  `Random calls: ${frames} native world frames and ${native.initializers.length} enemy initializers match call counts, branch order and ability/speed draws.`,
);
