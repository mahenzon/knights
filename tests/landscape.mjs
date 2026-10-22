import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Landscape, landscapeScene } from '../web/scene.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/landscape-clock.json'));
assert.throws(() => new Landscape(0));
assert.throws(() => new Landscape(Infinity));
const replay = new Landscape(30, 73);
for (let i = 0; i < 600; i++) replay.step();
const restored = new Landscape(30, 73);
restored.advanceTo(replay.elapsed);
assert.deepEqual(restored, replay, 'Restore reaches the same visual frame');
restored.advanceTo(replay.elapsed);
assert.deepEqual(restored, replay, 'Repeated renders do not advance time');
restored.advanceTo(Infinity);
assert.deepEqual(restored, replay, 'Malformed time cannot loop forever');
// Drive the actual Wasm day clock; render frequency must not create extra sun cycles.
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
for (const fps of [30, 60]) {
  [30, -1000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    core.configure(i, v);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const land = new Landscape(30),
    phases = [];
  let previous = 3;
  for (let frame = 1; frame <= 1800; frame++) {
    core.step();
    const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    const expected = native.gameplay_draw_timeline.find((s) => s.frame === frame);
    if (frame % (60 / fps) === 0 || expected) {
      land.advanceTo(draw[0]);
      if (land.next !== previous) {
        phases.push(land.next);
        previous = land.next;
      }
      if (expected) {
        assert.equal(draw[0], expected.elapsed);
        assert.equal(land.current, expected.current);
        assert.equal(land.next, expected.next);
        const sun = landscapeScene(land, 0).find((d) => d.image === 'sun.png');
        assert.equal(sun.x, expected.sun.x);
        assert.equal(sun.y, expected.sun.y);
      }
    }
  }
  assert.deepEqual(
    phases,
    [0, 1, 2],
    `${fps} FPS: one dawn/day/evening sequence in First Encounter`,
  );
}
console.log(
  'Landscape: sparse native day-clock samples, 30/60fps phase consistency, replay and malformed input pass.',
);
