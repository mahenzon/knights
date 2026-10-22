import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deviceScene, objectScene } from '../../web/scene.mjs';

const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const cases = JSON.parse(fs.readFileSync('research/drag-cycle.json')).cases;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
const restore = (bytes) => {
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
};
let count = 0;
for (const c of cases) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  core.equip(5, c.kind, c.tier, c.x, c.y);
  const initial = save(),
    seed = new DataView(initial.buffer);
  seed.setUint32(80, 0, true);
  seed.setFloat32(108, 9999, true);
  seed.setFloat32(26180 + 5 * 52 + 20, c.initial_elapsed, true);
  restore(initial);
  for (const frame of c.frames) {
    const label = `${c.kind}/${c.tier}/${frame.tick}`;
    const close = (actual, expected, field) =>
      assert.ok(
        Math.abs(actual - expected) < 0.0002,
        `${label} ${field}: ${actual} vs ${expected}`,
      );
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
    const bytes = save(),
      state = new DataView(bytes.buffer);
    const d = new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()).slice();
    const p = 2720 + 5 * 11;
    for (const [offset, field] of [
      [4, 'elapsed'],
      [7, 'pressed'],
      [8, 'recoil'],
    ])
      close(d[p + offset], frame.after[field], field);
    for (let slot = 0; slot < 30; slot++) {
      const object = frame.objects.find((o) => o.slot === slot),
        at = 23340 + slot * 68;
      assert.equal(state.getUint32(at, true), object ? 1 : 0, `${label} object${slot} active`);
      if (!object) continue;
      assert.equal(state.getUint32(at + 4, true), object.kind, label);
      assert.equal(state.getUint32(at + 8, true), object.held, `${label} held`);
      for (const [offset, field] of [
        [12, 'age'],
        [24, 'x'],
        [28, 'y'],
        [56, 'size'],
        [60, 'angle'],
      ])
        close(state.getFloat32(at + offset, true), object[field], `object${slot}/${field}`);
      if (object.kind === 2)
        close(state.getFloat32(31484 + slot * 24, true), object.charge, 'charge');
    }
    const devices = deviceScene({
      kind: c.kind,
      tier: c.tier,
      x: c.x,
      y: c.y,
      elapsed: d[p + 4],
      cooldown: d[p + 5],
      angle: d[p + 6],
      recoil: d[p + 8],
      animation: d[p + 9],
      timerVisible: !!(d[p + 10] & 2),
      time: d[0],
    });
    const actual = devices.map((command) => ({
      ...command,
      phase: command.afterActors ? 'artefacts_after' : 'artefacts_before',
    }));
    for (const id of d.slice(5845, 6075)) {
      if (id < 201) continue;
      const at = 2420 + (id - 201) * 10;
      if (!d[at]) continue;
      actual.push(
        ...objectScene({
          kind: d[at] - 1,
          tier: d[at + 8],
          x: d[at + 1],
          y: d[at + 2],
          angle: d[at + 3],
          size: d[at + 4],
          charge: d[at + 9],
          time: d[0],
        }).map((command) => ({ ...command, phase: 'objects_draw' })),
      );
    }
    for (const phase of ['artefacts_before', 'objects_draw', 'artefacts_after']) {
      const a = actual.filter((v) => v.phase === phase),
        b = frame.draws.filter((v) => v.phase === phase && v.image !== '0x0');
      assert.equal(a.length, b.length, `${label} ${phase} draw count`);
      a.forEach((command, i) => {
        for (const field of ['op', 'image', 'blend'])
          assert.equal(
            command[field] ?? 'source-over',
            b[i][field] ?? 'source-over',
            `${label} ${phase}/${i}/${field}`,
          );
        for (const field of ['x', 'y', 'radians', 'sx', 'sy', 'alpha'])
          close(command[field] ?? 1, b[i][field] ?? 1, `${phase}/${i}/${field}`);
        if (command.clipBottom !== undefined)
          assert.deepEqual(
            frame.scissors,
            [[320 - command.clipBottom, 0, 320, 480]],
            `${label} scissor`,
          );
      });
    }
    let sounds = 0;
    for (const sound of frame.sounds) {
      if (sound.event === 13) sounds |= 1 << 6;
      else if (sound.event === 14) sounds |= 1 << 7;
      else if (sound.event === 16 && sound.subtype === 1) sounds |= 1 << 8;
      else if (sound.event === 4 && sound.subtype === 4) sounds |= 1 << 3;
      else assert.fail(`${label} unknown sound ${JSON.stringify(sound)}`);
    }
    assert.equal(core.weapon_sounds(), sounds, `${label} sound events`);
    if (
      !frame.after.pressed &&
      !frame.objects.some((o) => o.held) &&
      [1, 30, 60, 180, 901, 1800].includes(frame.tick)
    ) {
      core.step();
      const future = save();
      restore(bytes);
      core.step();
      assert.deepEqual(save(), future, `${label} replay`);
      restore(bytes);
    }
    count++;
  }
}
console.log(
  `Wasm purchased objects: ${count} native input, cooldown, draw, projectile and sound frames pass.`,
);
