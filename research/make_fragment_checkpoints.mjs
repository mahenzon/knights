// Disposable visual states; never included in the public build.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data=JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native=JSON.parse(fs.readFileSync('research/fragments.json'));
const {instance:{exports:core}}=await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const states={};
for(const [name,source,kind,tier,frame] of [['machine','creep',4,0,12],['boulder','projectile',0,2,10],['door','castle',11,0,10]]) {
 const run=prepareDay(data,createRun(data,'campaign',0,'normal',73));startBattle(core,data,run,73);
 const p=core.save_ptr(),bytes=new Uint8Array(core.memory.buffer,p,core.save_len()).slice(),v=new DataView(bytes.buffer);
 v.setFloat32(25*4,12,true);v.setFloat32(27*4,9999,true);
 const c=native.cases.find(c=>c.source===source&&c.kind===kind&&c.tier===tier);
 for(const s of c.frames[frame-1].shards) {
  const at=41560+s.slot*28;
  [1,s.kind,s.x,s.y].forEach((n,i)=>v.setInt32(at+i*4,n,true));
  [s.vx,s.vy,s.size].forEach((n,i)=>v.setFloat32(at+16+i*4,n,true));
 }
 if(name==='door') {v.setUint32(48208,1,true);v.setFloat32(23*4,0,true);v.setUint32(32340,2,true);}
 new Uint8Array(core.memory.buffer,core.load_buffer(bytes.length),bytes.length).set(bytes);assert.equal(core.restore(),1);
 states[name]={version:3,run,state:Buffer.from(bytes).toString('base64')};
}
fs.writeFileSync('research/fragment-qa-saves.json',JSON.stringify(states));
