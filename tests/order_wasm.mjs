import assert from 'node:assert/strict';
import fs from 'node:fs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/global-order.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const offset = 48248,
  drawStart = 5845,
  objects = 230;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(b) {
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  return core.restore();
}
function setup() {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save();
  const v = new DataView(b.buffer);
  v.setFloat32(27 * 4, 9999, true);
  v.setUint32(offset, 0, true);
  b.fill(0, offset + 4);
  assert.equal(restore(b), 1);
}
const order = () =>
  [
    ...new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice(drawStart),
  ].filter(Boolean);
function actor(v, i, kind, y) {
  const p = 235 + i * 27;
  [1, kind, 10, 4, 0, 0, 0].forEach((n, j) => {
    v.setUint32((p + j) * 4, n, true);
  });
  [200.75, y, y, 0, 0, 600, 0, 0, 1, 0.8, 0, 0, 200.75, y, y, 100, 1, 99, 0, 0].forEach((n, j) => {
    v.setFloat32((p + j + 7) * 4, n, true);
  });
}
core.configure(0, 120); // Keep this ordering-only fixture out of the result transition.
core.start(73, 100000, 0, 0, 0);
assert.equal(new DataView(save().buffer).getUint32(offset, true), native.initial_timer);
for (let tick = 1; tick <= 29; tick++) {
  core.step();
  assert.equal(
    new DataView(save().buffer).getUint32(offset, true) === 0,
    native.initial_ticks.includes(tick),
    `First-run refresh at tick${tick}`,
  );
}
for (const c of native.cases) {
  setup();
  const b = save(),
    v = new DataView(b.buffer);
  for (let i = 0; i < 11; i++) actor(v, i, i, c.y);
  const kinds = [0, 1, 2, 4, 5, 6, 7];
  for (const [i, kind] of kinds.entries()) {
    const slot = i * 3,
      p = 23340 + slot * 68;
    v.setUint32(p, 1, true);
    v.setUint32(p + 4, kind, true);
    [0, 30, 0, 200, c.y, 0, 0, 200, c.y, 0, 0, 1, 0].forEach((n, j) => {
      v.setFloat32(p + (3 + j) * 4, n, true);
    });
    v.setFloat32(31484 + slot * 24, 0.4, true);
  }
  assert.equal(restore(b), 1);
  const expected = c.records
    .filter((r) => r.kind === 3 || r.slot % 3 === 0)
    .sort((a, b) => a.depth - b.depth)
    .map((r) => r.slot + (r.kind === 3 ? 1 : 201));
  for (let tick = 1; tick <= 13; tick++) {
    core.step();
    assert.deepEqual(
      order(),
      tick < 13 ? [] : expected,
      `Native periodic capture, y=${c.y}, tick=${tick}`,
    );
  }
  const before = save();
  core.step();
  const after = save();
  assert.equal(restore(before), 1);
  core.step();
  assert.deepEqual(save(), after);
  assert.equal(restore(before), 1);
  // A crossing does not reorder immediately; the original refreshes on tick26.
  const crossing = save(),
    cv = new DataView(crossing.buffer);
  cv.setFloat32((235 + 8) * 4, c.y + 100, true);
  cv.setFloat32((235 + 9) * 4, c.y + 100, true);
  assert.equal(restore(crossing), 1);
  for (let tick = 14; tick < 26; tick++) {
    core.step();
    assert.deepEqual(order(), expected);
  }
  core.step();
  assert.notDeepEqual(order(), expected);
}
setup();
core.equip(2, 2, 0, 315, 63);
for (let tick = 0; tick < 1861; tick++) core.step();
assert.equal(core.pickup(344, 76), 1);
const v = new DataView(save().buffer);
assert.equal(v.getUint32(offset, true), 0, 'Purchased rock forces native sort immediately');
assert.equal(v.getUint32(offset + 4, true), 201);
core.step();
assert.deepEqual(order(), [201]);
const good = save();
for (const [at, n] of [
  [offset, 13],
  [offset + 4, 231],
  [offset + 8, 201],
  [offset + 12, 2],
  [offset + 4 + objects * 4, 231],
]) {
  const b = good.slice();
  new DataView(b.buffer).setUint32(at, n, true);
  assert.equal(restore(b), 0);
  assert.deepEqual(save(), good);
}
const older = good.slice(0, offset);
new DataView(older.buffer).setUint32(4, 14, true);
assert.equal(restore(older), 1);
assert.deepEqual(order(), [201]);
assert.deepEqual(save().slice(0, 4), older.slice(0, 4));
const beforeDay = save().slice(offset, 50092);
core.start(73, 100000, 0, 0, 0);
assert.deepEqual(
  save().slice(offset, 50092),
  beforeDay,
  'Native day/player reset keeps the global sort cache',
);
console.log(
  'Object ordering: native mixed depths, first-frame/13-frame cadence, forced sort, between-day continuity, shared renderer list, replay, v14 migration and corruption rejection pass; historical equal-key qsort order remains unverified.',
);
