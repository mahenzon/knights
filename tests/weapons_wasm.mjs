import fs from 'node:fs';
import assert from 'node:assert/strict';
import { deviceScene } from '../web/scene.mjs';

const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/weapon-followup.json'));
for (const fixture of fixtures.volleys) {
  [120, -1000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  assert.equal(core.start(73, 100000, 0, 0, 0), 1);
  const kind = fixture.device,
    tier = fixture.tier,
    x = kind === 6 ? 392 : 432,
    y = kind === 6 ? 237 : 142;
  assert.equal(core.equip(5, kind, tier, x, y), 1);
  const px = kind === 6 ? x + 35 : x,
    py = kind === 6 ? y + 17 : y - 36;
  assert.equal(core.pickup(px, py), 0, 'New weapon must recharge before firing');
  for (let i = 0; i < 901; i++) core.step();
  assert.equal(core.pickup(px, py), 1);
  core.drag(200, y);
  core.release();
  const view = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
  const deviceStart = 2420 + view[17] * 10,
    p = deviceStart + 5 * 11,
    missileStart = deviceStart + view[18] * 11;
  assert.equal(view[18], 25);
  assert.equal(view[19], 100);
  assert.equal(view[p + 4], 0, 'Release restarts cooldown');
  const images = deviceScene({
    kind,
    tier,
    x,
    y,
    elapsed: view[p + 4],
    cooldown: view[p + 5],
    angle: view[p + 6],
    recoil: view[p + 8],
    animation: view[p + 9],
  });
  const art = JSON.parse(fs.readFileSync('build/web/game-data.json')).art;
  assert.ok(images.length > 0);
  for (const image of images) assert.ok(art[image.image]);
  assert.equal(view[missileStart], fixture.shots[0].type + 1);
  assert.equal(view[missileStart + 1], fixture.shots[0].x);
  assert.equal(view[missileStart + 2], fixture.shots[0].y);
  assert.notEqual(core.weapon_sounds(), 0);
  assert.equal(core.weapon_sounds(), 0, 'Sound events drain once');
  const ptr = core.save_ptr(),
    saved = new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice();
  assert.equal(new DataView(saved.buffer).getUint32(4, true), 22);
  assert.ok(
    saved.length <= 65536 && Buffer.from(saved).toString('base64').length <= 90000,
    'Save fits the browser/core validation limits',
  );
  for (let i = 0; i < 40; i++) core.step();
  const futurePtr = core.save_ptr(),
    future = new Uint8Array(core.memory.buffer, futurePtr, core.save_len()).slice();
  new Uint8Array(core.memory.buffer, core.load_buffer(saved.length), saved.length).set(saved);
  assert.equal(core.restore(), 1);
  for (let i = 0; i < 40; i++) core.step();
  const replayPtr = core.save_ptr();
  assert.deepEqual(new Uint8Array(core.memory.buffer, replayPtr, core.save_len()), future);
}
console.log(
  'Wasm weapons: six native configurations, input/cooldown, renderer layout, one-shot audio and save replay pass.',
);

const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
const restore = (bytes) => {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
};
const good = save();
for (const [offset, value] of [
  [62548, NaN],
  [62548, 9],
  [62552, 2],
  [62556, 2],
]) {
  const bad = good.slice(),
    v = new DataView(bad.buffer);
  if (offset === 62548) v.setFloat32(offset, value, true);
  else v.setUint32(offset, value, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
  assert.equal(core.restore(), 0, `Reject corrupt device presentation ${offset}`);
  assert.deepEqual(save(), good);
}
const legacy = good.slice(0, 62548);
new DataView(legacy.buffer).setUint32(4, 19, true);
restore(legacy);
assert.equal(save().length, 63652, 'Version19 saves migrate');
restore(good);
console.log('Wasm guns: corrupt device presentation rejection and version19 save migration pass.');
