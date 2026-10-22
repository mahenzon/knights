import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Landscape, landscapeScene } from '../../web/scene.mjs';
const native = JSON.parse(fs.readFileSync('research/land-data.json'));
let samples = 0;
for (const timeline of native.timelines) {
  const land = new Landscape(timeline.duration, 73);
  let frame = 0;
  for (const sample of timeline.samples) {
    while (frame < sample.frame) {
      land.step();
      frame++;
    }
    for (const key of [
      'duration',
      'elapsed',
      'remaining',
      'current',
      'next',
      'fadeOut',
      'fadeIn',
      'angle',
      'targetAngle',
    ])
      assert.equal(land[key], sample.state[key], `${timeline.duration}s frame${frame} ${key}`);
    assert.deepEqual(
      land.clouds,
      sample.state.clouds.slice(0, 5).map((c) => c.slice(1)),
    );
    assert.deepEqual(land.stars, sample.state.stars);
    samples++;
  }
  const restored = new Landscape(timeline.duration, 73);
  restored.advanceTo(land.elapsed);
  assert.deepEqual(restored, land, 'Restore reaches the same visual frame');
  restored.advanceTo(land.elapsed);
  assert.deepEqual(restored, land, 'Repeated renders do not advance time');
  restored.advanceTo(Infinity);
  assert.deepEqual(restored, land, 'Malformed time cannot loop forever');
}
for (const theme of native.themes)
  for (const sample of theme.drawings) {
    const land = {
      ...sample.state,
      clouds: sample.state.clouds.slice(0, 5).map((c) => c.slice(1)),
    };
    const actual = landscapeScene(land, theme.theme),
      expected = sample.draws.slice(0, -1);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      const a = actual[i],
        e = expected[i];
      for (const key of ['op', 'image', 'x', 'y', 'x2', 'y2', 'sx', 'sy', 'crop'])
        assert.deepEqual(
          a[key],
          e[key],
          `${theme.theme} ${sample.current} ${sample.fadeIn} ${i} ${key}`,
        );
      assert.equal(a.alpha ?? 1, e.color[3] / 255);
      assert.equal(a.blend ?? 'source-over', e.blend);
      assert.ok(fs.existsSync(`dist/assets/${a.image}`));
    }
  }
assert.throws(() => new Landscape(0));
assert.throws(() => new Landscape(Infinity));
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
  `Landscape: ${samples} native timeline samples, 48 scenes across all four themes, cloud wraps, star crops and restore replay pass.`,
);
