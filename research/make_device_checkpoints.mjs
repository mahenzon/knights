// Disposable visual review of the production renderer; never shipped.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const states = {};
for (const [name, y] of [['gate-skeleton-clipped', 190], ['gate-skeleton-released', 172]]) {
  const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  startBattle(core, data, run, 73);
  const p = core.save_ptr();
  const bytes = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  const v = new DataView(bytes.buffer);
  v.setFloat32(25 * 4, 12, true);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(48216, 12, true);
  v.setInt32(33 * 4, 0, true);
  v.setFloat32(32312, -130, true);
  v.setUint32(32332, 1, true);
  [9, 0, 10, 4, 0, 0, 0].forEach((n, j) => v.setUint32((235 + j) * 4, n, true));
  [225, y, 265, -56, -620, 600, 0, 60, 1, 1, 0, 0, 225, y, y, 0, 655/255, 100, 0, 0]
    .forEach((n, j) => v.setFloat32((242 + j) * 4, n, true));
  [1, 0, 10, 4, 0, 0, 0].forEach((n, j) => v.setUint32((262 + j) * 4, n, true));
  [230, 250, 250, 0, 0, 600, 0, 0, 1, 1, 0, 0, 230, 250, 250, 100, 1, 100, 0, 0]
    .forEach((n, j) => v.setFloat32((269 + j) * 4, n, true));
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  core.step();
  const frame = core.frame_ptr();
  const draw = new Float32Array(core.memory.buffer, frame, core.draw_len());
  assert.equal(draw[6075], 9);
  assert.equal(draw[15], y < 180 ? -1 : 0);
  const savedAt = core.save_ptr();
  const saved = new Uint8Array(core.memory.buffer, savedAt, core.save_len()).slice();
  states[name] = { version: 3, run, state: Buffer.from(saved).toString('base64') };
}
fs.writeFileSync('research/device-qa-saves.json', JSON.stringify(states));
