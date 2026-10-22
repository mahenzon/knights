// Disposable original skeleton flight/landing view; never shipped.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const corpse = JSON.parse(fs.readFileSync('research/gate-corpse.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
startBattle(core, data, run, 73);
const ptr = core.save_ptr();
const b = new Uint8Array(core.memory.buffer,ptr,core.save_len()).slice();
const v = new DataView(b.buffer);
v.setFloat32(25*4,12,true);
v.setFloat32(27*4,9999,true);
v.setFloat32(48216,12,true);
for (const [i,sample] of [corpse.frames[20],corpse.frames[92]].entries()) {
  const base=235+i*27;
  [9,0,10,4,0,0,0].forEach((n,j)=>v.setUint32((base+j)*4,n,true));
  [sample.x+(i?95:0),sample.y,265,sample.vx,sample.vy,600,0,60,1,1,0,sample.frame,
    sample.x,sample.y,80,100,sample.alpha/255,100,0,0]
    .forEach((n,j)=>v.setFloat32((base+7+j)*4,n,true));
  v.setFloat32(60948+i*4,sample.angle,true);
}
new Uint8Array(core.memory.buffer,core.load_buffer(b.length),b.length).set(b);
assert.equal(core.restore(),1);
core.step();
const p=core.save_ptr();
const saved=new Uint8Array(core.memory.buffer,p,core.save_len()).slice();
fs.writeFileSync('research/skeleton-qa-saves.json',JSON.stringify({skeletons:{version:3,run,state:Buffer.from(saved).toString('base64')}}));
