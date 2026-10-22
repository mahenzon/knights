import fs from 'node:fs';
import assert from 'node:assert/strict';
import { endFlagY, Landscape } from '../web/scene.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/day-end-data.json'));
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm')),
  core = instance.exports;
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice();
for (const sample of native.samples) {
  const y = endFlagY(sample.frame / 60),
    flag = sample.flag.find((d) => d.image === 'flag.png');
  assert.equal(flag?.y, y > -256 ? y : undefined, `Native banner frame ${sample.frame}`);
}
[30, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
  assert.equal(core.configure(i, v), 1);
});
core.enemy_type(0, 0);
assert.equal(core.start(73, 100000, 0, 0, 0), 1);
let d;
for (let frame = 1; frame <= native.switch_frame; frame++) {
  core.step();
  d = state();
  assert.equal(d[9], frame === native.switch_frame ? 1 : 0, `Results frame ${frame}`);
  if (frame >= native.end_frame) {
    assert.equal(d[3699], 1);
    assert.equal(
      d[3700],
      native.samples[frame - native.end_frame].fade,
      `Native fade frame ${frame}`,
    );
  }
}
const land = new Landscape(30);
land.advanceTo(d[0]);
assert.equal(land.elapsed, d[0], 'Landscape keeps advancing during the victory transition');
console.log(
  `Day end: ${native.transition_frames} native fade/banner frames; results wait while the world and landscape advance.`,
);
