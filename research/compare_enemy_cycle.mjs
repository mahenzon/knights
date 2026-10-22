// Research discrepancy report; production regressions follow confirmed native behavior.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {enemySprite} from '../build/web/enemies.mjs';
const cases=JSON.parse(fs.readFileSync('research/enemy-cycle.json')).cases;
const enemies=JSON.parse(fs.readFileSync('research/enemy-data.json')).records;
const animations=JSON.parse(fs.readFileSync('build/web/game-data.json')).enemyAnimations;
const {instance:{exports:core}}=await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const results=[];
for(const c of cases){
 [120,-10000,0,0,0,0,0,1,0,-1,0,1].forEach((n,i)=>core.configure(i,n));
 core.enemy_type(0,0);core.start(73,100000,0,0,0);
 const p=core.save_ptr(),b=new Uint8Array(core.memory.buffer,p,core.save_len()).slice(),v=new DataView(b.buffer),a=c.initial,s=enemies[c.kind].base_stats;
 v.setFloat32(27*4,9999,true);
 [1,c.kind,s.base_kill_reward,s.castle_hit_damage,enemies[c.kind].base_fields['0xec'],0,0].forEach((n,i)=>v.setUint32((235+i)*4,n,true));
 [a.x,a.y,a.ground,a.vx,a.vy,a.hp,a.speed,a.saved_speed,s.drag_mass,s.render_scale,a.stun_time,a.frame,a.target_x,a.target_y,a.y,a.cooldown,1,99,0,s.attack_range_offset].forEach((n,i)=>v.setFloat32((242+i)*4,n,true));
 new Uint8Array(core.memory.buffer,core.load_buffer(b.length),b.length).set(b);assert.equal(core.restore(),1);
 let mismatch=null;
 for(const f of c.frames){
  core.step();const d=new Float32Array(core.memory.buffer,core.draw_ptr(),core.draw_len());
  const n=f.actor,actual={x:d[21],y:d[22],frame:d[24],sprite:enemySprite(animations,c.kind,d[20],d[24],d[28])},expected={x:n.x,y:n.y,frame:n.frame,sprite:animations[c.kind][n.pose][Math.floor(n.frame)]??null};
  if(Object.keys(actual).some(k=>typeof actual[k]==='number'?Math.abs(actual[k]-expected[k])>0.0001:actual[k]!==expected[k])){mismatch={tick:f.tick,actual,expected};break;}
 }
 results.push({kind:c.kind,mismatch});
}
fs.writeFileSync('research/enemy-cycle-differences.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
