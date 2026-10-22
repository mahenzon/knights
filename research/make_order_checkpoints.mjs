// Frozen overlap scenes for disposable local browser QA; never shipped.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const states = {};
for (const [name, y] of [['barrel-behind', 225], ['barrel-in-front', 233]]) {
  const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  startBattle(core, data, run, 73);
  const p = core.save_ptr();
  const bytes = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  const v = new DataView(bytes.buffer);
  v.setFloat32(25 * 4, 12, true);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(48216, 12, true);
  [1, 0, 10, 4, 0, 0, 0].forEach((n, j) => v.setUint32((235 + j) * 4, n, true));
  [180, 240, 240, 0, 0, 600, 0, 0, 1, 0.8, 0, 0, 180, 240, 240, 100, 1, 100, 0, 0]
    .forEach((n, j) => v.setFloat32((242 + j) * 4, n, true));
  v.setUint32(23340, 1, true);v.setUint32(23344, 4, true);
  [0, 30, 0, 180, y, 0, 0, 180, y, 0, 0, 0.8, 0]
    .forEach((n, j) => v.setFloat32(23352 + j * 4, n, true));
  v.setUint32(48248, 12, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  core.step();
  const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
  assert.deepEqual([...draw.slice(5845,5847)], y < 232 ? [201, 1] : [1, 201]);
  const savedAt = core.save_ptr();
  const saved = new Uint8Array(core.memory.buffer, savedAt, core.save_len()).slice();
  states[name] = { version: 3, run, state: Buffer.from(saved).toString('base64') };
}
fs.writeFileSync('research/order-qa-saves.json', JSON.stringify(states));
