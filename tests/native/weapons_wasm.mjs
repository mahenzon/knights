import fs from 'node:fs';
import assert from 'node:assert/strict';
import { deviceScene } from '../../web/scene.mjs';

const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const fixtures = JSON.parse(fs.readFileSync('research/weapon-followup.json'));
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
const cycles = JSON.parse(fs.readFileSync('research/gun-cycle.json')).cases;
let cycleFrames = 0;
for (const c of cycles) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  core.equip(5, c.kind, c.tier, c.x, c.y);
  const initial = save(),
    seed = new DataView(initial.buffer);
  seed.setFloat32(108, 9999, true);
  seed.setUint32(80, 0, true);
  restore(initial);
  for (const frame of c.frames) {
    const label = `${c.kind}/${c.tier}/${frame.tick}`;
    core.clear_sound_events();
    for (const [action, x, y, accepted] of frame.actions) {
      if (action === 'press') assert.equal(core.pickup(x, y), accepted, `${label} press`);
      else if (action === 'move') core.drag(x, y);
      else core.release();
    }
    core.step();
    assert.deepEqual(
      Array.from(
        new Uint32Array(core.memory.buffer, core.audio_events_ptr(), core.audio_events_len()),
      ),
      frame.sounds.map((s) => s.event * 30 + s.subtype),
      `Native sound order ${c.kind}/${frame.tick}`,
    );
    let expectedSounds = 0;
    for (const sound of frame.sounds) {
      if (sound.event === 16) expectedSounds |= 1 << (sound.subtype === 0 ? 0 : 5);
      else if (sound.event === 17) expectedSounds |= 1 << 2;
      else if (sound.event === 18) expectedSounds |= 1 << 1;
      else if (sound.event === 4 && sound.subtype === 4) expectedSounds |= 1 << 3;
      else assert.fail(`${label} unrecognized sound ${JSON.stringify(sound)}`);
    }
    assert.equal(core.weapon_sounds(), expectedSounds, `${label} sound events`);
    const bytes = save(),
      state = new DataView(bytes.buffer),
      d = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice(),
      p = 2720 + 5 * 11;
    for (const [index, field] of [
      [4, 'elapsed'],
      [6, 'angle'],
      [7, 'pressed'],
      [8, 'recoil'],
      [9, 'animation'],
    ])
      assert.ok(
        Math.abs(d[p + index] - frame.after[field]) < 0.0001,
        `${label} ${field}: ${d[p + index]} vs ${frame.after[field]}`,
      );
    for (let slot = 0; slot < 100; slot++) {
      const m = frame.missiles.find((m) => m.slot === slot),
        offset = 27480 + slot * 40;
      assert.equal(state.getUint32(offset, true), m ? 1 : 0, `${label} missile${slot} active`);
      if (!m) continue;
      assert.equal(state.getUint32(offset + 4, true), m.type, `${label} missile${slot} kind`);
      for (const [delta, expected] of [
        [12, m.x],
        [16, m.y],
        [20, m.vx],
        [24, m.vy],
        [28, m.age],
      ])
        assert.ok(
          Math.abs(state.getFloat32(offset + delta, true) - expected) < 0.0001,
          `${label} missile${slot} field${delta}`,
        );
    }
    const presentation = new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len());
    if (presentation[p + 10] & 2 && frame.after.elapsed > d[p + 5]) {
      assert.equal(frame.smokes.length, 3, `${label} recharge flash emissions`);
      for (const smoke of frame.smokes) {
        let found = false;
        for (let i = 0; i < 256; i++) {
          const at = 32344 + i * 36;
          if (!state.getUint32(at, true) || state.getUint32(at + 4, true) !== smoke.kind) continue;
          if (state.getFloat32(at + 20, true) !== smoke.growth) continue;
          if (state.getFloat32(at + 8, true) !== smoke.x) continue;
          if (state.getFloat32(at + 12, true) !== smoke.y) continue;
          assert.ok(
            Math.abs(state.getFloat32(at + 16, true) - (smoke.size + smoke.growth / 60)) < 0.0001,
          );
          assert.ok(
            Math.abs(state.getFloat32(at + 24, true) - (smoke.alpha + smoke.fade / 60)) < 0.0001,
          );
          assert.equal(state.getUint32(at + 32, true), smoke.additive);
          found = true;
          break;
        }
        assert.ok(found, `${label} recharge flash ${smoke.growth}`);
      }
    }
    const commands = deviceScene({
      kind: c.kind,
      tier: c.tier,
      x: c.x,
      y: c.y,
      elapsed: d[p + 4],
      cooldown: d[p + 5],
      angle: d[p + 6],
      pressed: !!d[p + 7],
      recoil: d[p + 8],
      animation: presentation[p + 9],
      timerVisible: !!(presentation[p + 10] & 2),
    });
    assert.equal(commands.length, frame.draws.length, `${label} draw count`);
    commands.forEach((actual, i) => {
      const expected = frame.draws[i];
      for (const field of ['op', 'image']) assert.equal(actual[field], expected[field], label);
      for (const field of ['x', 'y', 'radians'])
        assert.ok(
          Math.abs((actual[field] ?? 0) - (expected[field] ?? 0)) < 0.0002,
          `${label}/${i} ${field}: ${actual[field]} vs ${expected[field]}`,
        );
    });
    if (!frame.after.pressed && [1, 30, 360, 600, 901, 916, 1800].includes(frame.tick)) {
      core.step();
      const future = save();
      restore(bytes);
      core.step();
      assert.deepEqual(save(), future, `${label} replay`);
      restore(bytes);
    }
    cycleFrames++;
  }
}
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
console.log(
  `Wasm guns: ${cycleFrames} native input, recharge, aiming, drawing and missile frames pass.`,
);
