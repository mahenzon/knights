import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  createRun,
  prepareDay,
  startBattle,
  finishDay,
  equipment,
  health,
  buy,
  random,
} from '../build/web/campaign.mjs';
import { Landscape } from '../build/web/scene.mjs';
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
let { instance } = await WebAssembly.instantiate(wasm),
  core = instance.exports;
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
let count = 0;
for (const difficulty of ['easy', 'normal', 'hard'])
  for (let castle = 0; castle < 12; castle++) {
    let run = createRun(data, 'campaign', castle, difficulty, 73);
    for (let day = 1; day <= data.levels[castle].dayCount; day++) {
      run = prepareDay(data, run);
      startBattle(core, data, run, 73);
      core.step();
      const d = state();
      assert.equal(d[3], health(run));
      assert.equal(d[9], 0);
      for (let slot = 0; slot < 25; slot++)
        assert.equal(
          d[2720 + slot * 11],
          (equipment(data, run).find((e) => e.slot === slot)?.typeId ?? -1) + 1,
        );
      const p = core.save_ptr(),
        save = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
      new Uint8Array(core.memory.buffer, core.load_buffer(save.length), save.length).set(save);
      assert.equal(core.restore(), 1);
      finishDay(data, run, { won: true, gold: 10, sacrifices: 1, score: 20, kills: 1 });
      count++;
    }
  }
// Exercise every full-length campaign with synthetic input; this does not measure human balance.
let frames = 0,
  battles = 0,
  kills = 0,
  purchases = 0,
  coldResumes = 0;
for (const difficulty of ['easy', 'normal', 'hard'])
  for (let castle = 0; castle < data.levels.length; castle++) {
    let run = createRun(data, 'campaign', castle, difficulty, 73);
    for (let day = 1; day <= data.levels[castle].dayCount; day++) {
      if (day > 1)
        for (const item of data.shop.items
          .filter((item) => item.inventoryIndex === 0)
          .sort((a, b) => b.upgradeIndex - a.upgradeIndex))
          if (item.upgradeIndex > run.inventory[0] && buy(data, run, item.index)) {
            purchases++;
            break;
          }
      run = prepareDay(data, run);
      for (let i = 0; i < 60; i++) random(run);
      run.landscapeSeed = run.seed;
      new Landscape(run.config.durationSeconds, () => random(run));
      startBattle(core, data, run, run.seed);
      let d = state();
      assert.equal(d[3], health(run), 'Continuous session uses ordinary purchased castle health');
      for (
        let frame = 0;
        frame < Math.ceil(run.config.durationSeconds * 60) + 510 && !d[9];
        frame++
      ) {
        let target = -1,
          right = -Infinity;
        for (let i = 0; i < 200; i++) {
          const p = 20 + i * 12;
          // Platforms launch explosive knights; catch those before they reach the castle.
          const catchable =
            [1, 4, 5, 10, 11].includes(d[p]) ||
            (d[p] === 3 && d[p + 3] === 10 && d[p + 1] > 150 && d[p + 2] > 0);
          if (catchable && d[p + 1] > 0 && d[p + 1] > right && !(d[p + 8] & 1)) {
            target = p;
            right = d[p + 1];
          }
        }
        if (target >= 0 && core.pickup(d[target + 1], d[target + 2])) {
          core.drag(d[target + 3] === 10 ? -100 : d[target + 1], -200);
          core.release();
        }
        core.step();
        d = state();
        frames++;
        if (
          (day === 3 || day === data.levels[castle].dayCount) &&
          frame === Math.floor(run.config.durationSeconds * 30)
        ) {
          const ptr = core.save_ptr(),
            bytes = new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice();
          ({ instance } = await WebAssembly.instantiate(wasm));
          core = instance.exports;
          const buffer = core.load_buffer(bytes.length);
          new Uint8Array(core.memory.buffer, buffer, bytes.length).set(bytes);
          assert.equal(core.restore(), 1, 'Cold instance resumes without setup or extra HP');
          const restored = core.save_ptr();
          assert.deepEqual(new Uint8Array(core.memory.buffer, restored, core.save_len()), bytes);
          d = state();
          coldResumes++;
        }
      }
      assert.equal(
        d[9],
        1,
        `${difficulty}: ${data.levels[castle].name} day ${day} did not complete`,
      );
      run.seed = core.random_state() >>> 0;
      finishDay(data, run, { won: true, gold: d[4], sacrifices: d[6], score: d[5], kills: d[7] });
      battles++;
    }
    assert.equal(run.phase, 'complete');
    kills += run.kills;
  }
assert.equal(battles, 579);
assert.equal(coldResumes, 72);
assert.ok(purchases > 0, 'Earned currency funds actual purchases');
console.log(
  `Campaign Wasm: ${count} setups and all ${battles} full-duration days completed with continuous setup/combat RNG (${frames} frames, ${kills} kills, ${purchases} earned purchases, ${coldResumes} cold resumes). Synthetic input, not human balance validation.`,
);
