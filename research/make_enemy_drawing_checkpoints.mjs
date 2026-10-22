// Disposable browser scenes for the production enemy renderer, never published.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const states = {};
for (const name of ['enemy-effects', 'breached-castle', 'mirrored-breach']) {
  const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  run.config.enemyTypeTable = [0, 6];
  run.config.mirrorLevel = name === 'mirrored-breach';
  startBattle(core, data, run, 73);
  const p = core.save_ptr();
  const bytes = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  const v = new DataView(bytes.buffer);
  v.setFloat32(25 * 4, 12, true);
  v.setFloat32(27 * 4, 9999, true);
  v.setFloat32(48216, 12, true);
  if (name !== 'enemy-effects') v.setUint32(48208, 1, true);
  for (const [slot,kind,state,x,burning,shield] of [[0,6,1,200,0,1],[1,0,6,90,1,0],[2,0,6,125,0,0],[3,6,1,390,0,1]]) {
    const base = 235+slot*27;
    [state,kind,10,4,shield ? 2 : 0,shield,0].forEach((n,j) => v.setUint32((base+j)*4,n,true));
    [x,245,245,0,0,600,0,0,1,1,0,2,x,245,245,100,1,100,10,0]
      .forEach((n,j) => v.setFloat32((base+7+j)*4,n,true));
    v.setUint32(22540+slot*4,burning ? 2 : 0,true);
  }
  new Uint8Array(core.memory.buffer,core.load_buffer(bytes.length),bytes.length).set(bytes);
  assert.equal(core.restore(),1);
  core.step();
  const savedAt=core.save_ptr();
  const saved=new Uint8Array(core.memory.buffer,savedAt,core.save_len()).slice();
  states[name]={version:3,run,state:Buffer.from(saved).toString('base64')};
}
fs.writeFileSync('research/enemy-drawing-qa-saves.json',JSON.stringify(states));
