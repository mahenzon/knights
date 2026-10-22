import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRun, prepareDay, startBattle, finishDay, random } from '../build/web/campaign.mjs';
import { Landscape } from '../build/web/scene.mjs';
import { enemySprite } from '../build/web/enemies.mjs';

const native = JSON.parse(fs.readFileSync('research/full-days.json'));
const castles = JSON.parse(fs.readFileSync('research/campaign-sessions.json'));
const late = JSON.parse(fs.readFileSync('research/late-sessions.json'));
const equipped = JSON.parse(fs.readFileSync('research/equipped-days.json'));
for (const fixture of [castles, late, equipped])
  for (const key of ['binary_sha256', 'actor_keys', 'object_keys'])
    assert.deepEqual(fixture[key], native[key], `battle fixture ${key}`);
assert.deepEqual(
  castles.cases.map((c) => [c.mode, c.level]),
  Array.from({ length: 11 }, (_, i) => ['campaign', i + 1]),
);
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
let frames = 0;
for (const c of equipped.cases) {
  const {
    instance: { exports: core },
  } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
  let run = createRun(data, c.mode, c.level, 'normal', c.seed);
  const save = () => {
    const p = core.save_ptr();
    return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  };
  function setupDay(initial) {
    if (initial.between_day_release) core.release();
    if (initial.inventory) run.inventory = initial.inventory.slice();
    run = prepareDay(data, run);
    for (let i = 0; i < 60; i++) random(run);
    const land = new Landscape(run.config.durationSeconds, () => random(run));
    assert.deepEqual(land.stars, initial.land.stars);
    assert.equal(run.seed, initial.rng);
    assert.equal(run.background, initial.background);
    assert.deepEqual(run.config.enemyTypeTable, initial.table, 'day enemy table');
    startBattle(core, data, run, run.seed);
    assert.deepEqual([...new Float32Array(save().buffer, 8, 12)], initial.config, 'day rules');
  }
  for (const initial of c.warmup ?? []) {
    setupDay(initial);
    run.phase = 'shop';
  }
  if (c.warmup?.length) run.day = c.start_day - 1;
  for (const day of c.days) {
    setupDay(day.initial);
    assert.equal(run.day, day.day);
    for (const f of day.frames) {
      const label = `${c.mode}/${c.level}/day${day.day}/frame${f.tick}`;
      for (const [op, x, y, result] of f.inputs) {
        if (op === 'pickup') assert.equal(core.pickup(x, y), result, `${label} pickup`);
        else if (op === 'press') core.pickup(x, y);
        else if (op === 'drag' || op === 'move') core.drag(x, y);
        else core.release();
      }
      core.step();
      const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()).slice();
      const state = new DataView(save().buffer);
      if (day.day===3 && f.tick>=969 && f.tick<=974) console.log(label,core.random_state()>>>0,"want",f.rng);
      if (f.devices) {
        assert.deepEqual(
          [
            ...new Uint32Array(
              core.memory.buffer,
              core.audio_events_ptr(),
              core.audio_events_len(),
            ),
          ],
          f.sounds.map(([event, subtype]) => event * 30 + subtype),
          `${label} ordered audio requests`,
        );
        for (let slot = 0; slot < 25; slot++) {
          const device = f.devices.find((d) => d[0] === slot),
            p = 2720 + slot * 11;
          assert.equal(draw[p] !== 0, Boolean(device), `${label}/device${slot} active`);
          if (!device) continue;
          const d = Object.fromEntries(
            equipped.device_keys.map((name, i) => [name, device[i + 1]]),
          );
          assert.equal(draw[p], d.kind + 1, `${label}/device${slot} kind`);
          for (const [index, field] of [
            [1, 'x'],
            [2, 'y'],
            [3, 'tier'],
            [4, 'elapsed'],
            [6, 'angle'],
            [7, 'pressed'],
            [8, 'recoil'],
            [9, 'animation'],
          ]) {
            // Sacrificers use separate actor/gate state, not the weapon cooldown fields.
            if ([0, 3].includes(d.kind) && index >= 4) continue;
            assert.ok(
              Math.abs(draw[p + index] - d[field]) < 0.001,
              `${label}/device${slot} ${field}: ${draw[p + index]} vs ${d[field]}`,
            );
          }
        }
        for (let slot = 0; slot < 100; slot++) {
          const m = f.missiles.find((m) => m.slot === slot),
            p = 27480 + slot * 40;
          assert.equal(
            state.getUint32(p, true) !== 0,
            Boolean(m),
            `${label}/missile${slot} active`,
          );
          if (!m) continue;
          assert.equal(state.getUint32(p + 4, true), m.type, `${label}/missile${slot} kind`);
          for (const [off, field] of [
            [12, 'x'],
            [16, 'y'],
            [20, 'vx'],
            [24, 'vy'],
            [28, 'age'],
          ])
            assert.ok(
              Math.abs(state.getFloat32(p + off, true) - m[field]) < 0.001,
              `${label}/missile${slot} ${field}`,
            );
        }
      }
      for (let slot = 0; slot < 30; slot++) {
        const object = f.objects.find((a) => a[0] === slot),
          p = (5835 + slot * 17) * 4;
        assert.equal(
          state.getUint32(p, true) !== 0,
          Boolean(object),
          `${label}/object${slot} active`,
        );
        if (!object) continue;
        const a = Object.fromEntries(native.object_keys.map((name, i) => [name, object[i + 1]]));
        assert.equal(state.getUint32(p + 4, true), a.type, `${label}/object${slot} kind`);
        for (const [word, name] of [
          [4, 'lifetime'],
          [5, 'gravity'],
          [6, 'x'],
          [7, 'y'],
          [8, 'vx'],
          [9, 'vy'],
          [14, 'scale'],
        ]) {
          const actual = state.getFloat32(p + word * 4, true);
          assert.ok(
            Math.abs(actual - a[name]) < 0.001,
            `${label}/object${slot} ${name}: ${actual} vs ${a[name]}`,
          );
        }
      }
      for (const [index, expected, name] of [
        [0, f.time, 'elapsed'],
        [2, f.hp, 'door HP'],
        [4, f.balances[1], 'gold'],
        [5, f.balances[0], 'score'],
        [6, f.balances[2], 'sacrifices'],
        [7, f.kills, 'kills'],
        [9, f.status, 'result transition'],
        [3699, f.ending, 'ending'],
        [3700, f.fade, 'fade'],
      ])
        assert.equal(draw[index], expected, `${label} ${name}`);
      for (let slot = 0; slot < 200; slot++) {
        const actor = f.actors.find((a) => a[0] === slot),
          p = (235 + slot * 27) * 4;
        assert.equal(state.getUint32(p, true) !== 0, Boolean(actor), `${label}/${slot} active`);
        if (!actor) continue;
        const a = Object.fromEntries(native.actor_keys.map((name, i) => [name, actor[i + 1]]));
        assert.equal(state.getUint32(p + 4, true), a.kind, `${label}/${slot} kind`);
        const dp = 20 + slot * 12;
        assert.equal(
          enemySprite(data.enemyAnimations, a.kind, draw[dp], draw[dp + 4], draw[dp + 8]),
          data.enemyAnimations[a.kind][a.pose][Math.floor(a.frame)] ?? null,
          `${label}/${slot} sprite`,
        );
        for (const [off, name] of [
          [28, 'x'],
          [32, 'y'],
          [40, 'vx'],
          [44, 'vy'],
          [48, 'hp'],
          [52, 'speed'],
          [72, 'frame'],
          [88, 'cooldown'],
        ]) {
          // Hooked captives retain unused native drag velocities while fixed to the altar.
          if ((name === 'vx' || name === 'vy') && !a.flying && (!a.dragging || a.sacrifice))
            continue;
          assert.ok(
            Math.abs(state.getFloat32(p + off, true) - a[name]) < 0.001,
            `${label}/${slot} ${name}: ${state.getFloat32(p + off, true)} vs ${a[name]}`,
          );
        }
      }
      frames++;
    }
    const draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
    run.seed = core.random_state() >>> 0;
    finishDay(data, run, {
      won: draw[9] === 1,
      gold: draw[4],
      sacrifices: draw[6],
      score: draw[5],
      kills: draw[7],
    });
  }
}
assert.deepEqual(
  late.cases.map((c) => [c.mode, c.level, c.start_day]),
  [
    ...data.levels.map((level, i) => ['campaign', i, level.dayCount]),
    ...['endless', 'madness'].flatMap((mode) => [100, 10000].map((day) => [mode, 0, day])),
  ],
);
assert.deepEqual(
  equipped.cases.map((c) => [c.mode, c.level, c.start_day, c.equipment_tier]),
  [0, 1, 2].map((tier) => ['campaign', 2, 2, tier]),
);
console.log(
  `Full days: ${frames} native frames match complete battles, pointer gestures, rewards, victory/defeat transitions and consecutive-day setup.`,
);
