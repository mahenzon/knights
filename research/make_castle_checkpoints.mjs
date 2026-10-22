// Disposable visual states; never included in the public build.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native = JSON.parse(fs.readFileSync('research/castle.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const states = {};
for (const [name, frame] of [['resting', 15], ['impact', 6], ['breached', 32], ['screen-shake', 15]]) {
  const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  startBattle(core, data, run, 73);
  const p = core.save_ptr(), bytes = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  const v = new DataView(bytes.buffer), f = native.cases[0].frames[frame - 1];
  v.setFloat32(25 * 4, 12, true);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(23 * 4, f.state.hp, true);
  v.setUint32(48208, f.state.broken, true);
  v.setFloat32(48212, f.state.shake, true);
  v.setFloat32(48216, f.state.age, true);
  v.setUint32(48228, (f.before.broken << 1) | (f.before.age < 0.1 ? 1 : 0), true);
  const door = f.draws.find(d => d.image.startsWith('castle_door'));
  v.setFloat32(48220, door?.x ?? 331, true);
  v.setFloat32(48224, door?.y ?? 162, true);
  if (f.state.broken) v.setUint32(32340, 2, true);
  if (name === 'screen-shake') {
    const shake = JSON.parse(fs.readFileSync('research/trembling.json')).timelines.find(t => t.initial === 6).frames[0];
    [shake.strength, shake.x, shake.y].forEach((n, j) => v.setFloat32(48232 + j * 4, n, true));
    v.setUint32(48244, 1, true);
    const fragments = JSON.parse(fs.readFileSync('research/fragments.json')).cases.find(c => c.source === 'projectile' && c.kind === 0 && c.tier === 2);
    for (const s of fragments.frames[9].shards) {
      const at = 41560 + s.slot * 28;
      [1,s.kind,s.x,s.y].forEach((n,j)=>v.setInt32(at+j*4,n,true));
      [s.vx,s.vy,s.size].forEach((n,j)=>v.setFloat32(at+16+j*4,n,true));
    }
  }
  for (const [i, x] of [325, 350, 370].entries()) {
    const start = 235 + i * 27;
    [1, 0, 10, 4, 0, 0, 0].forEach((n, j) => v.setUint32((start + j) * 4, n, true));
    [x, 240, 240, 0, 0, 600, 100, 100, 1, 0.8, 0, 0, x, 240, 240, 0.9, 1, 100, 0, -1000]
      .forEach((n, j) => v.setFloat32((start + 7 + j) * 4, n, true));
    v.setUint32(48252 + i * 4, i + 1, true);
    v.setUint32(49172 + i * 4, i + 1, true);
  }
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  states[name] = { version: 3, run, state: Buffer.from(bytes).toString('base64') };
}
fs.writeFileSync('research/castle-qa-saves.json', JSON.stringify(states));
