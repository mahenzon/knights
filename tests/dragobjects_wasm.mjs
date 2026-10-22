import fs from 'node:fs';
import assert from 'node:assert/strict';
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const c = instance.exports,
  fixtures = JSON.parse(fs.readFileSync('tests/fixtures/drag-followup.json'));
const base = (2 + 12 + 9 + 7 + 5 + 200 + 200 * 27 + 200) * 4,
  extra = 31480;
function save() {
  const ptr = c.save_ptr();
  return new Uint8Array(c.memory.buffer, ptr, c.save_len()).slice();
}
function state() {
  const d = new DataView(save().buffer),
    f = (i) => d.getFloat32(base + i * 4, true),
    u = (i) => d.getUint32(base + i * 4, true);
  return {
    active: u(0),
    type: u(1),
    held: u(2),
    age: f(3),
    lifetime: f(4),
    gravity: f(5),
    x: f(6),
    y: f(7),
    vx: f(8),
    vy: f(9),
    target_x: f(10),
    target_y: f(11),
    scale: f(14),
    angle: f(15),
    landed: u(16),
    upgrade: d.getUint32(extra, true),
    unknown28: d.getFloat32(extra + 4, true),
    travel_charge: d.getFloat32(extra + 8, true),
    counter: d.getInt32(extra + 12, true),
    pressed: d.getUint32(extra + 16, true),
    finished: d.getUint32(extra + 20, true),
  };
}
function compare(native, label) {
  const actual = state();
  for (const [k, v] of Object.entries(actual)) {
    if (k === 'unknown28' && native.type !== 2) continue;
    assert.ok(Math.abs(v - native[k]) < 0.003, `${label} ${k}: ${v} vs ${native[k]}`);
  }
}
for (const fixture of fixtures.controls) {
  const { device: kind, tier } = fixture;
  [10000, -1000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    c.configure(i, v);
  });
  c.enemy_type(0, 0);
  c.start(73, 100000, 0, 0, 0);
  const x = kind === 2 ? 315 : kind === 4 ? 405 : 408,
    y = kind === 2 ? 63 : kind === 4 ? 38 : 150;
  c.equip(5, kind, tier, x, y);
  for (let i = 0; i < 1861; i++) c.step();
  const px = kind === 2 ? 344 : kind === 4 ? 438 : 447,
    py = kind === 2 ? 76 : kind === 4 ? 51 : 163;
  assert.equal(c.pickup(px, py), 1);
  if (kind !== 4) compare(fixture.pressed, `${kind}/${tier} press`);
  if (kind === 4) {
    c.release();
    c.step();
    assert.equal(c.pickup(200, 10), 1);
    c.drag(200, 100);
  } else c.drag(200, 100);
  compare(fixture.moved, `${kind}/${tier} move`);
  for (let i = 0; i < 6; i++) c.step();
  compare(fixture.held, `${kind}/${tier} held`);
  c.release();
  compare(fixture.released, `${kind}/${tier} release`);
  for (let frame = 1; frame <= 181; frame++) {
    c.step();
    const sample = fixture.samples.find((s) => s.frame === frame);
    if (sample) compare(sample.state, `${kind}/${tier} frame${frame}`);
  }
  const before = save();
  assert.ok(before.length <= 65536 && Buffer.from(before).toString('base64').length <= 90000);
  for (let i = 0; i < 20; i++) c.step();
  const after = save();
  new Uint8Array(c.memory.buffer, c.load_buffer(before.length), before.length).set(before);
  assert.equal(c.restore(), 1);
  for (let i = 0; i < 20; i++) c.step();
  // Restore intentionally cancels the native Column's persistent pressed flag.
  if (kind === 4) new DataView(after.buffer).setUint32(26180 + (5 * 13 + 7) * 4, 0, true);
  assert.deepEqual(save(), after);
}
console.log('Wasm dragobjects: all ten native upgrade traces and deterministic save replay pass.');
