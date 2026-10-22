// Muted, disposable checkpoints produced through real pickup/release and simulation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';
const data=JSON.parse(fs.readFileSync('build/web/game-data.json'));
const {instance:{exports:core}}=await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const run=prepareDay(data,createRun(data,'campaign',0,'normal',73));
run.config.enemyTypeTable=[3];
startBattle(core,data,run,73);
function save(){const p=core.save_ptr();return new Uint8Array(core.memory.buffer,p,core.save_len()).slice();}
const b=save(),v=new DataView(b.buffer);
v.setFloat32(25*4,12,true);v.setFloat32(27*4,9999,true);v.setFloat32(28*4,9999,true);
v.setFloat32(48216,12,true);
[1,3,25,3,1,0,0].forEach((n,j)=>v.setUint32((235+j)*4,n,true));
[120,75,238,0,0,600,50,50,.9,.8,0,.75,120,75,75,-1,1,99,0,10]
 .forEach((n,j)=>v.setFloat32((242+j)*4,n,true));
new Uint8Array(core.memory.buffer,core.load_buffer(b.length),b.length).set(b);
assert.equal(core.restore(),1);
assert.equal(core.pickup(120,75),1);core.release();
const result={};
for(let tick=1;tick<=157;tick++){
 core.step();
 const name={35:'hooked-knight',45:'escaped-knight',157:'empty-dragon'}[tick];
 if(name)result[name]={version:3,run,state:Buffer.from(save()).toString('base64')};
}
fs.writeFileSync('research/hook-qa-saves.json',JSON.stringify(result));
