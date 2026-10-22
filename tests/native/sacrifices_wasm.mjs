import fs from 'node:fs';
import assert from 'node:assert/strict';
import { enemySprite } from '../../build/web/enemies.mjs';
const integrated = JSON.parse(fs.readFileSync('research/device-phase.json'));
const gate = integrated.cases.find((c) => c.kind === 3);
const awardFrame = gate.frames.find((f) => f.balances[2] > 0).tick;
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm')),
  core = instance.exports;
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice();
const frame = () => new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function captured(gate) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const b = save(),
    v = new DataView(b.buffer),
    float = (word, x) => v.setFloat32(word * 4, x, true),
    int = (word, x) => v.setInt32(word * 4, x, true);
  float(27, 9999);
  float(30, gate ? -1 : 0);
  float(31, gate ? 22 : 0);
  float(32, -1);
  int(33, gate ? 0 : -1);
  int(34, gate ? -1 : 0);
  const base = 235;
  [gate ? 8 : 7, 0, 10, 10, 0, 0, 0].forEach((x, i) => {
    int(base + i, x);
  });
  [
    gate ? 233 : 120,
    gate ? 130 : 90,
    gate ? 300 : 244,
    0,
    0,
    600,
    0,
    70,
    1,
    1,
    0,
    0,
    gate ? 233 : 120,
    gate ? 100 : 60,
    90,
    0,
    1,
    99,
    0,
    0,
  ].forEach((x, i) => {
    float(base + 7 + i, x);
  });
  if (gate) int(32304 / 4 + 8, 1);
  new Uint8Array(core.memory.buffer, core.load_buffer(b.length), b.length).set(b);
  assert.equal(core.restore(), 1);
}
captured(false);
for (const sample of integrated.cases.find((c) => c.kind === 0).frames) {
  core.step();
  assert.deepEqual(
    Array.from(
      new Uint32Array(core.memory.buffer, core.audio_events_ptr(), core.audio_events_len()),
    ),
    sample.draws.filter((s) => s.op === 'sound').map((s) => s.event * 30 + s.subtype),
    `Native altar sound order ${sample.tick}`,
  );
  const d = state();
  const hook = sample.draws.find((d) => d.image === 'altar_hook.png');
  assert.ok(
    Math.abs(d[3695] - (hook ? (hook.alpha ?? 1) : 0)) < 1e-7,
    `Hook fade frame ${sample.tick}`,
  );
  assert.equal(d[6], sample.balances[2]);
  assert.equal(
    Boolean(frame()[20]),
    Boolean(sample.actor_draws.length),
    'Dragon consumes after actor drawing',
  );
}
captured(true);
let opening = 22;
for (const f of gate.frames) {
  const previous = state();
  const lid = f.draws.find((d) => d.image === 'hole_krishka.png');
  const sample = { ...f.device, frame: f.tick, y: f.after.actor.y, lid_y: lid.y };
  core.clear_sound_events();
  const events = core.step(),
    d = state(),
    v = new DataView(save().buffer);
  assert.deepEqual(
    Array.from(
      new Uint32Array(core.memory.buffer, core.audio_events_ptr(), core.audio_events_len()),
    ),
    f.draws.filter((s) => s.op === 'sound').map((s) => s.event * 30 + s.subtype),
    `Native gate sound order ${f.tick}`,
  );
  const displayed = frame();
  if (sample.frame === awardFrame) {
    const checkpoint = save();
    new Uint8Array(core.memory.buffer, core.load_buffer(checkpoint.length), checkpoint.length).set(
      checkpoint,
    );
    assert.equal(core.restore(), 1);
    assert.deepEqual(frame(), displayed, 'Payout resume preserves the pre-ejection drawing');
    assert.equal(displayed[6075], 8);
    assert.equal(d[20], 9);
  }
  if (previous[15] >= 0) {
    assert.deepEqual(
      Array.from(displayed.slice(6075, 6087)),
      Array.from(previous.slice(20, 32)),
      'Gate retains its pre-update captive pose',
    );
    if (previous[20] === 9 && previous[22] < 180)
      assert.equal(
        displayed[15],
        -1,
        'Gate releases the already-drawn skeleton before ordinary actor drawing',
      );
  } else assert.equal(displayed[6075], 0);
  if (sample.frame === awardFrame)
    assert.equal(v.getFloat32(48232, true), 6, 'Native gate screen shake');
  assert.equal(d[13], sample.opening, `Gate opening ${sample.frame}`);
  for (const [offset, key] of [
    [4, 'amplitude'],
    [8, 'burst_y'],
  ])
    assert.ok(
      Math.abs(v.getFloat32(32304 + offset, true) - sample[key]) < 1e-6,
      `Gate ${key} ${sample.frame}`,
    );
  assert.equal(
    Boolean(v.getUint32(32304 + 28, true)),
    !!sample.burst,
    `Gate burst ${sample.frame}`,
  );
  if (sample.frame < awardFrame) {
    assert.equal(d[22], sample.y);
    assert.equal(d[6], 0);
  } else assert.equal(d[6], 1);
  const sounds = new Uint32Array(core.memory.buffer, core.sound_events_ptr(), 5);
  assert.equal(sounds[0] & 1, sample.frame === 35 ? 1 : 0, 'One floor-impact sound');
  assert.equal(Boolean(events & 64), sample.frame === awardFrame, 'One payout sound');
  const amplitude = v.getFloat32(32308, true),
    burst = v.getFloat32(32312, true);
  assert.ok(Math.abs(d[3697]) <= 0.05 * amplitude + 1e-7, 'Native digestion angle range');
  if (amplitude === 0 || (!sample.digestion && sample.frame !== awardFrame))
    assert.equal(d[3696], sample.lid_y, `Gate lid ${sample.frame}`);
  else
    assert.ok(
      d[3696] >= 227 + opening + burst - 0.0001 &&
        d[3696] <= 227 + opening + burst + 5 * amplitude + 0.0001,
      `Native digestion jitter range ${sample.frame}`,
    );
  opening = d[13];
}
const savedGate = save();
const savedFrame = frame();
const legacy = savedGate.slice(0, 60900);
new DataView(legacy.buffer).setUint32(4, 16, true);
new Uint8Array(core.memory.buffer, core.load_buffer(legacy.length), legacy.length).set(legacy);
assert.equal(core.restore(), 1, 'Version16 remains readable');
new Uint8Array(core.memory.buffer, core.load_buffer(savedGate.length), savedGate.length).set(
  savedGate,
);
assert.equal(core.restore(), 1);
assert.deepEqual(frame(), savedFrame, 'Current saves preserve the gate drawing pass');
for (const [offset, value] of [
  [60900, 12],
  [60904, NaN],
  [60920, -1],
]) {
  const bad = savedGate.slice();
  const view = new DataView(bad.buffer);
  view.setFloat32(offset, value, true);
  if (offset === 60920) view.setFloat32(60900, 8, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
  assert.equal(core.restore(), 0, `Reject corrupt gate pose ${offset}`);
  assert.deepEqual(save(), savedGate);
}
const corpse = JSON.parse(fs.readFileSync('research/gate-corpse.json'));
const animations = JSON.parse(fs.readFileSync('build/web/game-data.json')).enemyAnimations;
captured(true);
const checkpoint = save(),
  view = new DataView(checkpoint.buffer),
  initial = corpse.initial;
view.setInt32(33 * 4, -1, true);
view.setUint32(235 * 4, 9, true);
for (const [word, value] of [
  [242, initial.x],
  [243, initial.y],
  [244, 265],
  [245, initial.vx],
  [246, initial.vy],
  [253, 0],
  [258, initial.alpha / 255],
])
  view.setFloat32(word * 4, value, true);
new Uint8Array(core.memory.buffer, core.load_buffer(checkpoint.length), checkpoint.length).set(
  checkpoint,
);
assert.equal(core.restore(), 1);
for (const [frame, sample] of corpse.frames.entries()) {
  core.step();
  const d = state();
  assert.equal(d[20] !== 0, !!sample.active, `Skeleton lifetime frame ${frame}`);
  if (!sample.active) continue;
  assert.equal(d[20], 9, 'landed skeleton never turns into a bloody knight');
  assert.equal(d[21], sample.x);
  assert.equal(d[22], sample.y);
  assert.equal(d[29], sample.angle, `Native skeleton rotation frame ${frame}`);
  assert.ok(Math.abs(d[26] - sample.alpha / 255) < 0.00001, `Skeleton fade frame ${frame}`);
  assert.equal(enemySprite(animations, d[23], d[20], d[24], d[28]), 'skeleton.png');
  if (frame === 30 || (sample.dead && !corpse.frames[frame - 1].dead)) {
    const current = save(),
      rendered = new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
    core.step();
    const next = save();
    new Uint8Array(core.memory.buffer, core.load_buffer(current.length), current.length).set(
      current,
    );
    assert.equal(core.restore(), 1);
    assert.deepEqual(
      new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()),
      rendered,
    );
    core.step();
    assert.deepEqual(save(), next, 'Skeleton rotation survives replay in flight and after landing');
    new Uint8Array(core.memory.buffer, core.load_buffer(current.length), current.length).set(
      current,
    );
    assert.equal(core.restore(), 1);
  }
}
const rotated = save();
for (const value of [NaN, Infinity, 1e7]) {
  const bad = rotated.slice();
  new DataView(bad.buffer).setFloat32(60948, value, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
  assert.equal(core.restore(), 0, 'Reject corrupt rotation without replacing live state');
  assert.deepEqual(save(), rotated);
}
const v17 = rotated.slice(0, 60948);
new DataView(v17.buffer).setUint32(4, 17, true);
new DataView(v17.buffer).setFloat32(50092 + 8 + 9 * 4, 1, true);
new DataView(v17.buffer).setFloat32(60900 + 9 * 4, 1, true);
new Uint8Array(core.memory.buffer, core.load_buffer(v17.length), v17.length).set(v17);
assert.equal(core.restore(), 1, 'Version17 remains readable');
assert.equal(state()[29], 0, 'Old save has no live rotation history');
assert.equal(frame()[29], 0, 'Old captured direction is not interpreted as an angle');
assert.equal(frame()[6084], 0, 'Old gate direction is not interpreted as an angle');
console.log(
  'Sacrifices: 300 integrated native altar frames, 450 gate frames, separate captive draw pass, v16/v17 migration/replay/rejection, 181 skeleton flight/rotation/fade frames and exactly-once rewards/sounds pass. Random jitter is range-checked.',
);
