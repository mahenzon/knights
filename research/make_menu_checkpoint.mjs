import fs from 'node:fs';
import { createRun, prepareDay, startBattle, finishDay } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
startBattle(core, data, run, 73);
let draw;
for (let tick=0;tick<4000;tick++) {
  draw = new Float32Array(core.memory.buffer,core.draw_ptr(),core.draw_len());
  if (draw[9]) break;
  for (let i=0;i<200;i++) {
    const p=20+i*12;
    if ([1,4,5,10,11].includes(draw[p]) && draw[p+1]>0 && core.pickup(draw[p+1],draw[p+2])) {
      core.drag(draw[p+1],-200);core.release();break;
    }
  }
  core.step();
}
if (draw[9]!==1) throw Error('Checkpoint must be an actual completed day');
const score=draw[5], kills=draw[7];
const ptr=core.save_ptr(), bytes=new Uint8Array(core.memory.buffer,ptr,core.save_len()).slice();
new DataView(bytes.buffer).setUint32(15*4,100000,true);
new DataView(bytes.buffer).setUint32(16*4,1000,true);
finishDay(data,run,{won:true,gold:100000,sacrifices:1000,score,kills});
fs.writeFileSync('research/menu-qa-save.json',JSON.stringify({version:3,run,state:Buffer.from(bytes).toString('base64')}));
