// Disposable browser checkpoints; never included in the static build.
import fs from 'node:fs';
const { instance: { exports: core } } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const template = JSON.parse(fs.readFileSync('research/enemy-cycle-qa-saves.json'))['winding-up'];
const saves = {};
for (const [name, ticks] of [['aim', 420], ['ready', 360]]) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((n, i) => core.configure(i, n));
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  core.equip(5, 8, 2, 432, 142);
  for (let i = 0; i < ticks; i++) core.step();
  const run = structuredClone(template.run);
  run.inventory[12] = 2;
  run.config.durationSeconds = 120;
  const p = core.save_ptr();
  saves[name] = { ...template, run, state: Buffer.from(core.memory.buffer, p, core.save_len()).toString('base64') };
}
fs.writeFileSync('research/gun-qa-saves.json', JSON.stringify(saves));
console.log('Created ready-flash and aiming browser checkpoints.');
