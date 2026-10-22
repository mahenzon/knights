// Local acceptance probe: one contact and integer on-screen points.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  createRun, prepareDay, startBattle, finishDay, buy, random, health,
} from '../build/web/campaign.mjs';
import { Landscape } from '../build/web/scene.mjs';

const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
const movementTicks = Number(process.argv[2] ?? 10);
assert.ok([8, 10].includes(movementTicks));
const withGate = process.argv.includes('--gate');
const withGun = process.argv.includes('--gun');
assert.ok(!withGun || withGate, 'The earned-gun strategy builds on the gate strategy');
const failed = withGate
  ? JSON.parse(fs.readFileSync('artifacts/campaign-bounded-input-10.json')).rows.filter((r) => !r.complete)
  : null;
const { instance: { exports: core } } = await WebAssembly.instantiate(wasm);
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
const bounded = (point) => {
  assert.ok(Number.isInteger(point[0]) && point[0] >= 0 && point[0] < 480);
  assert.ok(Number.isInteger(point[1]) && point[1] >= 0 && point[1] < 320);
  return point;
};
const rows = [];
let frames = 0, inputEvents = 0;
for (const difficulty of ['easy', 'normal', 'hard']) {
  for (let castle = 0; castle < data.levels.length; castle++) {
    if (withGun && (difficulty !== 'hard' || castle !== 9)) continue;
    if (failed && !failed.some((r) => r.difficulty === difficulty && r.castle === castle)) continue;
    let run = createRun(data, 'campaign', castle, difficulty, 73);
    const days = [], purchases = [];
    for (let day = 1; day <= data.levels[castle].dayCount; day++) {
      if (day > 1) {
        if (withGate && run.inventory[1] < 0 && buy(data, run, 10)) purchases.push({ day, item: 10 });
        for (const item of data.shop.items.filter((item) => item.inventoryIndex === 0)
          .sort((a, b) => b.upgradeIndex - a.upgradeIndex)) {
          if (item.upgradeIndex > run.inventory[0] && buy(data, run, item.index)) {
            purchases.push({ day, item: item.index });
            break;
          }
        }
        if (withGate && run.inventory[0] >= 3 && run.inventory[10] !== 3 && buy(data, run, 103))
          purchases.push({ day, item: 103 });
        if (withGun && run.inventory[0] >= 4 && run.inventory[11] < 0 && buy(data, run, 110))
          purchases.push({ day, item: 110 });
      }
      run = prepareDay(data, run);
      for (let i = 0; i < 60; i++) random(run);
      run.landscapeSeed = run.seed;
      new Landscape(run.config.durationSeconds, () => random(run));
      startBattle(core, data, run, run.seed);
      assert.equal(state()[3], health(run));
      let contact = null, gestures = 0, d = state(), tick = 0;
      const limit = Math.ceil(run.config.durationSeconds * 70) + 1000;
      for (; tick < limit && !d[9]; tick++) {
        if (contact) {
          if (contact.age > movementTicks &&
            (!contact.gate || d[13] >= 22 || contact.age > movementTicks + 45)) {
            core.release_at(...bounded(contact.target));
            contact = null;
          } else {
            const progress = Math.min(1, contact.age / movementTicks);
            core.drag(...bounded(contact.from.map((v, i) =>
              Math.round(v + (contact.target[i] - v) * progress))));
            contact.age++;
          }
          inputEvents++;
        } else if (withGun && run.inventory[11] === 0 && d[2779] >= d[2780] && d[8] > 5) {
          core.pickup(427, 254);
          contact = { from: [427, 254], target: [200, 275], age: 1, gate: false };
          gestures++;
          inputEvents++;
        } else if (withGate && run.inventory[10] === 3 && d[2768] >= d[2769] && d[8] > 5) {
          core.pickup(447, 163);
          contact = { from: [447, 163], target: [200, 225], age: 1, gate: false };
          gestures++;
          inputEvents++;
        } else {
          let target = -1, right = -Infinity;
          for (let i = 0; i < 200; i++) {
            const p = 20 + i * 12;
            const catchable = [1, 4, 5, 10, 11].includes(d[p]) ||
              (d[p] === 3 && d[p + 3] === 10 && d[p + 1] > 150) ||
              (withGate && d[p] === 3 && d[p + 1] > 290);
            if (catchable && d[p + 1] >= 1 && d[p + 1] < 479 &&
              d[p + 2] >= 1 && d[p + 2] < 319 &&
              d[p + 1] > right && !(d[p + 8] & 1)) {
              target = p;
              right = d[p + 1];
            }
          }
          if (target >= 0) {
            const from = bounded([Math.trunc(d[target + 1]), Math.trunc(d[target + 2])]);
            assert.equal(core.pickup(...from), 1);
            const gate = withGate && run.inventory[0] < 4 && d[2731] === 4 && d[15] < 0 &&
              d[target + 3] !== 3 && right < 230;
            contact = {
              from, target: gate ? [235, 120] : [d[target + 3] === 10 ? 8 : Math.min(280, from[0]), 8],
              age: 1, gate,
            };
            gestures++;
            inputEvents++;
          }
        }
        core.step();
        core.clear_audio_events();
        d = state();
        frames++;
      }
      assert.ok([1, 2].includes(d[9]), 'Natural terminal result within the day bound');
      const result = {
        won: d[9] === 1, gold: d[4], sacrifices: d[6], score: d[5], kills: d[7],
      };
      days.push({ day, ticks: tick, gestures, hp: d[2], maxHp: d[3], ...result });
      run.seed = core.random_state() >>> 0;
      finishDay(data, run, result);
      if (!result.won) break;
    }
    rows.push({ difficulty, castle, name: data.levels[castle].name,
      expectedDays: data.levels[castle].dayCount, complete: run.phase === 'complete', days, purchases });
    console.log(`${difficulty} / ${data.levels[castle].name}: ${run.phase}, day ${run.day}`);
  }
}
const result = {
  wasm_sha256: createHash('sha256').update(wasm).digest('hex'),
  strategy: `Rightmost on-screen unshielded enemy, one contact, ${movementTicks} 60Hz movement ticks to y8, Up on tick${movementTicks + 1}; earned door purchases.${withGate ? ' Intercept airborne enemies near the castle. Buy Hell Gate, guide eligible enemies to (235,120), hold until lid opens and release; earn souls for stronger doors. Stop sacrificing once the Ultimate door is owned. After Magic door buy Freezing Bolt and launch from (447,163) toward (200,225) when ready and more than five actors are active.' : ''}`,
  gunStrategy: withGun ? 'Hard Random Skirmish only. After Ultimate door, buy Cannon with earned gold. When ready and more than five actors are active, press (427,254), aim over the same movement interval at (200,275) and release. Other inputs remain single-contact and screen-bounded.' : null,
  frames, inputEvents, rows,
  limits: 'Automated perfect state-based target selection, including invisible enemies, no human reaction delay. Native gesture rules are covered elsewhere; this probe does not execute the original binary. Failure means this strategy failed, not a gameplay defect.',
};
fs.writeFileSync(`artifacts/campaign-bounded-input-${movementTicks}${withGate ? '-gate' : ''}${withGun ? '-gun' : ''}.json`, JSON.stringify(result, null, 2) + '\n');
console.log({ frames, inputEvents, completed: rows.filter((r) => r.complete).length,
  attempts: rows.length, wonDays: rows.reduce((n, r) => n + r.days.filter((d) => d.won).length, 0) });
