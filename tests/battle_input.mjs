import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pauseControl } from '../build/web/hud.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const native = JSON.parse(fs.readFileSync('tests/fixtures/battle-input.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const save = (core) => {
  const ptr = core.save_ptr();
  return new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice();
};

async function fixture(device = null, mirror = false, scale = 1, mass = 0.9) {
  const {
    instance: { exports: core },
  } = await WebAssembly.instantiate(wasm);
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const bytes = save(core),
    state = new DataView(bytes.buffer);
  // Seed the same isolated original Column or light knight used by the native probe.
  bytes.fill(0, 940, 22540);
  bytes.fill(0, 26180, 27480);
  if (!device) {
    state.setUint32(940, 1, true);
    for (const [word, value] of [
      [7, 100],
      [8, 200],
      [9, 200],
      [12, 600],
      [15, mass],
      [16, 1],
    ])
      state.setFloat32(940 + word * 4, value, true);
  }
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  if (device) {
    core.equip(0, device[0], 0, device[1], device[2]);
    const equipped = save(core);
    new DataView(equipped.buffer).setFloat32(26180 + 20, 100, true);
    new Uint8Array(core.memory.buffer, core.load_buffer(equipped.length), equipped.length).set(
      equipped,
    );
    assert.equal(core.restore(), 1);
  }
  const handlers = new Map(),
    pauses = [],
    sounds = [],
    capture = new Set();
  const canvas = {
    addEventListener: (kind, callback) => handlers.set(kind, callback),
    getBoundingClientRect: () => ({ left: 37, top: 23, width: 480 * scale, height: 320 * scale }),
    setPointerCapture: (id) => capture.add(id),
    hasPointerCapture: (id) => capture.has(id),
    releasePointerCapture: (id) => capture.delete(id),
  };
  const buttonHandlers = new Map();
  const context = vm.createContext({
    core,
    canvas,
    pauseControl,
    activePointer: null,
    pausePressed: false,
    screen: 'game',
    optionReturnToGame: false,
    run: { config: { mirrorLevel: mirror } },
    SAVE_KEY: 'test-save',
    btoa: (text) => Buffer.from(text, 'binary').toString('base64'),
    storageSet: () => true,
    state: () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()),
    pauseButton: { addEventListener: (kind, callback) => buttonHandlers.set(kind, callback) },
    render() {},
    drainSounds() {},
    sound: (name) => sounds.push(name),
    pause() {
      context.screen = 'paused';
      context.save();
      pauses.push(true);
    },
  });
  vm.runInContext(
    section('function point(', "document.addEventListener('visibilitychange'"),
    context,
  );
  vm.runInContext(section('pauseButton.onclick =', 'function fullscreenChanged('), context);
  vm.runInContext(section('function save()', 'async function resumeSaved('), context);
  const event = (kind, point, id = 1, target = handlers) => {
    const [x, y] = point;
    target.get(`pointer${kind}`)?.({
      pointerId: id,
      button: 0,
      clientX: 37 + x * scale,
      clientY: 23 + y * scale,
      preventDefault() {},
    });
  };
  return { core, context, event, handlers, buttonHandlers, pauses, sounds, capture };
}

let events = 0;
for (const sample of native.live_sequences) {
  for (const scale of [1, 2.5]) {
    for (const mirror of [false, true]) {
      const device = sample.case.startsWith('column')
        ? [4, 405, 38]
        : sample.case.startsWith('boulder')
          ? [2, 315, 63]
          : sample.case.startsWith('fireball')
            ? [5, 408, 150]
            : null;
      const f = await fixture(device, mirror, scale);
      for (const e of sample.events) {
        f.core.clear_audio_events();
        f.event(e.kind, [mirror ? 480 - e.point[0] : e.point[0], e.point[1]]);
        const state = new DataView(save(f.core).buffer),
          expected = e.state;
        const label = `${sample.case}/${scale}/${mirror}/${e.kind}`;
        assert.equal(state.getUint32(26180 + 28, true), expected.device_pressed, label);
        assert.equal(state.getFloat32(26180 + 20, true), expected.device_elapsed, label);
        const objects = [];
        for (let slot = 0; slot < 30; slot++) {
          const base = 23340 + slot * 68;
          if (state.getUint32(base, true))
            objects.push({
              slot,
              kind: state.getUint32(base + 4, true),
              held: state.getUint32(base + 8, true),
              pressed: state.getUint32(31480 + slot * 24 + 16, true),
              skip_global_input: state.getUint32(base + 4, true) === 2 ? 1 : 0,
              travel_charge: state.getFloat32(31480 + slot * 24 + 8, true),
              target: [state.getFloat32(base + 40, true), state.getFloat32(base + 44, true)],
            });
        }
        assert.deepEqual(objects, expected.objects, label);
        const unitState = state.getUint32(940, true);
        assert.equal(unitState === 2, !!expected.creep.held, label);
        assert.equal(unitState === 3, !!expected.creep.flying, label);
        for (const [word, field] of [
          [10, 'vx'],
          [11, 'vy'],
          [19, 'target_x'],
          [20, 'target_y'],
        ])
          assert.equal(
            state.getFloat32(940 + word * 4, true),
            expected.creep[field],
            `${label}/${field}`,
          );
        assert.deepEqual(
          [
            ...new Uint32Array(
              f.core.memory.buffer,
              f.core.audio_events_ptr(),
              f.core.audio_events_len(),
            ),
          ],
          expected.sounds.map(([event, subtype]) => event * 30 + subtype),
          label,
        );
        events++;
      }
    }
  }
}

let sampledFrames = 0;
for (const sample of native.sampling_sequences) {
  for (const mirror of [false, true]) {
    const f = await fixture(null, mirror, 2.5, sample.mass);
    const event = (kind, point) => f.event(kind, [mirror ? 480 - point[0] : point[0], point[1]]);
    const compare = (expected) => {
      const state = new DataView(save(f.core).buffer);
      const label = `${sample.mass}/${sample.path}/${sample.samples_per_segment}/${mirror}`;
      assert.equal(state.getUint32(940, true), expected.held ? 2 : 3, label);
      for (const [word, field] of [
        [7, 'x'],
        [8, 'y'],
        [10, 'vx'],
        [11, 'vy'],
        [19, 'target_x'],
        [20, 'target_y'],
      ])
        assert.ok(
          Math.abs(state.getFloat32(940 + word * 4, true) - expected[field]) < 0.0001,
          `${label}/${field}`,
        );
      sampledFrames++;
    };
    event('down', [100, 200]);
    for (const frame of sample.frames) {
      for (const point of frame.moves) event('move', point);
      f.core.step();
      compare(frame.state);
    }
    event('up', sample.up);
    compare(sample.released);
  }
}

let recoveryFrames = 0;
for (const sample of native.recovery_pickups.filter((c) => c.kind === 0 || c.kind === 3)) {
  const f = await fixture();
  const bytes = save(f.core),
    initial = new DataView(bytes.buffer);
  initial.setUint32(940, 4, true);
  initial.setUint32(944, sample.kind, true);
  for (const [word, value] of [
    [8, 240],
    [9, 240],
    [14, sample.kind === 0 ? 60 : 50],
    [17, sample.timer],
  ])
    initial.setFloat32(940 + word * 4, value, true);
  new Uint8Array(f.core.memory.buffer, f.core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(f.core.restore(), 1);
  const compare = (expected) => {
    const state = new DataView(save(f.core).buffer),
      label = `recovery/${sample.kind}/${sample.timer}/${expected.held_time}`;
    assert.equal(state.getUint32(940, true), 2, `${label}/held`);
    assert.equal(state.getUint32(61748, true), expected.pose, `${label}/pose`);
    assert.equal(state.getFloat32(62852, true), expected.stun, `${label}/recovery timer`);
    for (const [word, field] of [
      [7, 'x'],
      [8, 'y'],
      [10, 'vx'],
      [11, 'vy'],
      [13, 'speed'],
      [17, 'held_time'],
      [18, 'frame'],
      [19, 'target_x'],
      [20, 'target_y'],
    ])
      assert.ok(
        Math.abs(state.getFloat32(940 + word * 4, true) - expected[field]) < 0.0001,
        `${label}/${field}`,
      );
    recoveryFrames++;
  };
  f.event('down', [100, 240]);
  compare(sample.picked);
  for (const frame of sample.frames) {
    f.core.step();
    compare(frame);
  }
}

for (const sample of native.pause) {
  const f = await fixture(null, sample.case.startsWith('mirrored'));
  for (const event of sample.events) {
    f.event(event.kind, event.point);
    assert.equal(f.context.pausePressed, !!event.pressed, `${sample.case}/${event.kind} highlight`);
    assert.equal(f.pauses.length, event.paused, `${sample.case}/${event.kind} pause`);
  }
  assert.equal(f.sounds.length, sample.events.at(-1).paused, 'one pause click');
}

for (const cancel of ['cancel', 'lostpointercapture']) {
  const f = await fixture();
  f.event('down', [100, 200]);
  f.event('move', [200, 100], 2);
  f.event('up', [460, 305], 2);
  assert.equal(f.context.activePointer, 1, 'another finger cannot finish the gesture');
  if (cancel === 'cancel') f.event(cancel, [460, 305]);
  else f.handlers.get(cancel)({ pointerId: 1 });
  assert.equal(f.context.activePointer, null);
  assert.equal(f.pauses.length, 0, 'cancellation does not activate Pause');
  f.event('up', [460, 305]);
  assert.equal(f.pauses.length, 0, 'late Up cannot activate a cancelled gesture');
  f.event('down', [460, 305], 3, f.buttonHandlers);
  f.event('up', [460, 305], 3);
  assert.equal(f.pauses.length, 1, 'fresh button-origin gesture works after cancellation');
  f.context.pauseButton.onclick({ detail: 1 });
  assert.equal(f.sounds.length, 1, 'compatibility click cannot activate twice');
}

const columnPause = await fixture([4, 405, 38]);
columnPause.event('down', [438, 51]);
columnPause.event('up', [460, 305]);
assert.equal(columnPause.pauses.length, 1);
assert.equal(
  new DataView(save(columnPause.core).buffer).getUint32(23340, true),
  0,
  'Pause autosave must not release again at the stale Column press position',
);
const keyboard = await fixture();
keyboard.context.pauseButton.onclick({ detail: 0 });
assert.equal(keyboard.pauses.length, 1, 'keyboard Pause remains accessible');
const fractions = await fixture(null, true, 2.5);
assert.deepEqual(
  Array.from(fractions.context.point({ clientX: 37 + 123.875 * 2.5, clientY: 23 + 307.25 * 2.5 })),
  native.UIKit_bridge.find(
    (c) => c.kind === 'mirrored_fractional_down',
  ).dispatch_calls[0].args.slice(0, 2),
  'logical coordinates truncate before mirroring',
);
console.log(
  `Battle input: ${events} native live events, ${sampledFrames} sampled-motion states, ${recoveryFrames} recovery states, ${native.pause.length} pause traces and cancellation pass.`,
);
