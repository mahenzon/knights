// Disposable visual checkpoints assembled with the independently verified native-scene setup.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const native = JSON.parse(fs.readFileSync('research/world-scene.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
const template = JSON.parse(fs.readFileSync('research/enemy-cycle-qa-saves.json'))['winding-up'];
const saves = {};
for (const [name, theme, reverse, ticks] of [['fire-dust',0,0,40],['ice-dust',3,1,40],['dawn',0,0,450]]) {
  const c = native.cases.find(c=>c.theme===theme&&c.reverse===reverse);
  const core = (await WebAssembly.instantiate(wasm)).instance.exports;
  [30, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((value, index) => {
    core.configure(index, value);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  for (const d of c.devices) assert.equal(core.equip(d.slot, d.kind, d.tier, d.x, d.y), 1);
  const ptr = core.save_ptr(),
    bytes = new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice(),
    v = new DataView(bytes.buffer);
  v.setUint32(80, 0, true);
  v.setFloat32(108, 9999, true);
  v.setFloat32(48232, 4, true);
  for (const d of c.devices) v.setFloat32(26180 + d.slot * 52 + 20, d.elapsed, true);
  for (const [i, a] of c.actors.entries()) {
    const word = 235 + i * 27;
    [
      1,
      a.kind,
      a.reward,
      a.damage,
      a.ability_done | (a.ability_active << 1),
      a.shield,
      a.immunity,
    ].forEach((n, j) => {
      v.setUint32((word + j) * 4, n, true);
    });
    [
      a.x,
      a.y,
      a.ground,
      a.vx,
      a.vy,
      a.hp,
      a.speed,
      a.saved_speed,
      a.mass,
      a.size,
      a.stun_time,
      a.frame,
      a.target_x,
      a.target_y,
      a.min_y,
      a.cooldown,
      a.alpha / 255,
      a.ability_delay,
      a.ability_remaining,
      a.range,
    ].forEach((n, j) => {
      v.setFloat32((word + 7 + j) * 4, n, true);
    });
    v.setUint32(61748 + i * 4, a.pose, true);
    v.setUint32(22540 + i * 4, a.burning * 2, true);
  }
  for (const p of c.objects) {
    const at = 23340 + p.slot * 68;
    v.setUint32(at, 1, true);
    v.setUint32(at + 4, p.kind, true);
    [
      0,
      p.lifetime,
      p.gravity,
      p.x,
      p.y,
      p.vx,
      p.vy,
      p.target_x,
      p.target_y,
      0,
      0,
      p.size,
      0,
    ].forEach((n, j) => {
      v.setFloat32(at + 12 + j * 4, n, true);
    });
    v.setUint32(31480 + p.slot * 24, p.tier, true);
    v.setFloat32(31484 + p.slot * 24, p.kind === 2 ? p.charge : 0, true);
    v.setInt32(31492 + p.slot * 24, p.counter, true);
  }
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);

  for (let i=0;i<ticks;i++) core.step();
  const run=structuredClone(template.run);
  run.inventory=[0,0,0,-1,-1,-1,-1,-1,2,1,3,0,2];
  run.config.artefactInitializers.push({slot:6,x:180,y:260,typeId:7,upgradeIndex:1});
  run.background=theme;run.mirror=!!reverse;run.config.mirrorLevel=!!reverse;
  run.enemyTable=Array.from({length:20},(_,i)=>i%11);
  run.config.enemyTypeTable=run.enemyTable.slice();
  const p=core.save_ptr();
  saves[name]={...template,run,state:Buffer.from(core.memory.buffer,p,core.save_len()).toString('base64')};
}
fs.writeFileSync('research/world-qa-saves.json',JSON.stringify(saves));
console.log('Saved fire/ice dust and dawn browser checkpoints.');
