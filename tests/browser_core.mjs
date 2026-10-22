import fs from 'node:fs';
import assert from 'node:assert/strict';
import { FixedClock } from '../build/web/lifecycle.mjs';

let callback,
  steps = 0,
  draws = 0,
  cancelled = 0;
const clock = new FixedClock(
  () => steps++,
  () => draws++,
  (cb) => {
    callback = cb;
    return 1;
  },
  () => cancelled++,
);
clock.start();
callback(0);
for (let i = 1; i <= 120; i++) callback((i * 1000) / 120);
assert.ok(Math.abs(steps - 60) <= 1, `120Hz stepped ${steps}`);
clock.stop();
const before = steps;
callback(80000);
assert.equal(steps, before);
clock.start();
callback(90000);
assert.equal(steps, before, 'resume catches up hidden time');
assert.ok(cancelled > 0);
clock.stop();
// Display jitter must not accumulate into a lower render rate on90/120/144Hz screens.
for (const refresh of [60, 90, 120, 144])
  for (const fps of [30, 60]) {
    let frame,
      rendered = 0,
      simulated = 0;
    const paced = new FixedClock(
      () => simulated++,
      () => rendered++,
      (cb) => {
        frame = cb;
        return 1;
      },
      () => {},
    );
    paced.fps = fps;
    paced.start();
    frame(0);
    for (let i = 1; i <= refresh * 10; i++) {
      const jitter = i % 3 === 0 ? -0.4 : i % 3 === 1 ? 0.4 : 0;
      frame((i * 1000) / refresh + jitter);
    }
    assert.ok(
      Math.abs(rendered - (fps * 10 + 1)) <= 1,
      `${refresh}Hz/${fps}FPS with jitter rendered ${rendered} times in10s`,
    );
    assert.ok(Math.abs(simulated - 600) <= 1, 'Draw pacing does not change physics');
    const beforeGap = rendered;
    frame(20000);
    assert.equal(rendered, beforeGap + 1, 'A delayed frame renders once');
    frame(20000);
    assert.equal(rendered, beforeGap + 1, 'No drawing catch-up burst');
    paced.stop();
    paced.start();
    frame(90000);
    assert.equal(rendered, beforeGap + 2, 'Resume renders immediately');
    paced.stop();
  }
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
[30, 180, 0, 0, 0, 0, 0, 20, 0, -1, 0, 1].forEach((v, i) => {
  assert.equal(core.configure(i, v), 1);
});
core.enemy_type(0, 0);
assert.equal(core.start(73, 100, 0, 0, 0), 1);
for (let i = 0; i < 420; i++) core.step();
const view = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
assert.ok(view[8] > 0, 'wave should spawn knights');
assert.equal(view[9], 0);
const ptr = core.save_ptr(),
  saved = new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice();
for (let i = 0; i < 300; i++) core.step();
const ptrA = core.save_ptr(),
  future = new Uint8Array(core.memory.buffer, ptrA, core.save_len()).slice();
const buffer = core.load_buffer(saved.length);
new Uint8Array(core.memory.buffer, buffer, saved.length).set(saved);
assert.equal(core.restore(), 1);
for (let i = 0; i < 300; i++) core.step();
const ptrB = core.save_ptr();
assert.deepEqual(
  new Uint8Array(core.memory.buffer, ptrB, core.save_len()),
  future,
  'Wasm save restores deterministic state',
);
assert.equal(core.load_buffer(1e9), 0);
assert.equal(core.configure(13, 1), 0);
assert.equal(core.configure(0, NaN), 0);
console.log(
  'Browser core: fixed timestep, background halt, no catch-up, Wasm spawn/save/replay and input bounds pass.',
);
