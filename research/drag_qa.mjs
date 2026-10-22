// Disposable browser checkpoints; excluded from the static build.
import fs from 'node:fs';
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const template = JSON.parse(fs.readFileSync('research/enemy-cycle-qa-saves.json'))['winding-up'];
const saves = {};
for (const [name, ticks] of [['cooling', 120], ['ready', 1850]]) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((n, i) => core.configure(i, n));
  core.enemy_type(0, 0); core.start(73, 100000, 0, 0, 0);
  core.equip(2, 2, 2, 315, 63); core.equip(3, 4, 2, 405, 38); core.equip(4, 5, 2, 408, 150);
  for (let i = 0; i < ticks; i++) core.step();
  const run = structuredClone(template.run);
  run.inventory[8] = 2; run.inventory[9] = 2; run.inventory[10] = 2;
  run.config.durationSeconds = 120;
  const p = core.save_ptr();
  saves[name] = { ...template, run, state: Buffer.from(core.memory.buffer, p, core.save_len()).toString('base64') };
}
fs.writeFileSync('research/drag-qa-saves.json', JSON.stringify(saves));
console.log('Created cooling/ready purchased-device browser checkpoints.');
