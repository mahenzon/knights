// Disposable, local-only visual checkpoints. Never included in build/web.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
const checkpoints = {};
for (const [name, kind, tier, ticks] of [['cannon',0,0,24],['flame',1,0,12],['freezer',2,0,12],['ballista',3,2,29]]) {
  const run = prepareDay(data, createRun(data,'campaign',0,'normal',73));
  run.inventory[11] = kind === 1 ? 2 : kind === 2 ? 1 : 0;
  run.inventory[12] = 2;
  startBattle(core,data,run,73);
  let bytes = save();
  const v = new DataView(bytes.buffer), at=27480;
  v.setFloat32(27*4,9999,true);
  v.setUint32(at,1,true);v.setUint32(at+4,kind,true);v.setUint32(at+8,tier,true);
  for (const [i,value] of [[3,400],[4,150],[5,-600],[6,100],[8,kind===0?1200:kind===3?600:0],[9,kind===0?.6:kind===3?10:1.4]]) v.setFloat32(at+i*4,value,true);
  const p=core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer,p,bytes.length).set(bytes);
  assert.equal(core.restore(),1);
  for (let i=0;i<ticks;i++) core.step();
  bytes=save();new DataView(bytes.buffer).setFloat32(25*4,12,true);
  checkpoints[name]={version:3,run,state:Buffer.from(bytes).toString('base64')};
}
fs.writeFileSync('research/missile-qa-saves.json',JSON.stringify(checkpoints));
