import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRun, prepareDay, startBattle, finishDay, validRun } from '../build/web/campaign.mjs';
import { Landscape, landscapeScene } from '../build/web/scene.mjs';

const fullDay = process.argv.includes('--full-day');

const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const state = () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  const p = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, p, bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
}
function checkpoint(label) {
  assert.ok(state().every(Number.isFinite), `${label}: finite draw buffer`);
  const before = save();
  core.step();
  const after = save();
  restore(before);
  core.step();
  assert.deepEqual(save(), after, `${label}: deterministic resume`);
}

let transitions = 0,
  frames = 0,
  stressCases = 0;
for (const mode of ['endless', 'madness'])
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let run = createRun(data, mode, 0, difficulty, 73);
    // The original LevelData[29] ends at day 10000. Exercise every metadata/save boundary.
    for (let day = 1; day <= 10000; day++) {
      run = prepareDay(data, run);
      assert.equal(run.day, day);
      assert.ok(validRun(data, run), `${mode}/${difficulty}/${day}: battle metadata`);
      finishDay(data, run, { won: true, gold: 1000, sacrifices: 10, score: day * 1000, kills: 1 });
      assert.equal(run.phase, day === 10000 ? 'complete' : 'shop');
      assert.ok(validRun(data, run));
      transitions++;
    }
    assert.throws(() => prepareDay(data, run));
    for (const day of [1, 10, 15, 30, 100, 1000, 9999, 10000]) {
      run = createRun(data, mode, 0, difficulty, 73);
      run.day = day;
      run = prepareDay(data, run);
      startBattle(core, data, run, 73);
      // Natural unassisted defeats must remain finite, saveable, and terminal at high levels.
      for (let tick = 0; tick < 36000 && !state()[9]; tick++) {
        core.step();
        frames++;
        if (tick % 120 === 0) checkpoint(`${mode}/${difficulty}/${day}/${tick}`);
      }
      assert.ok([1, 2].includes(state()[9]), `${mode}/${difficulty}/${day}: terminal state`);
      checkpoint(`${mode}/${difficulty}/${day}/result`);
      const terminal = save();
      for (let tick = 0; tick < 60; tick++) core.step();
      assert.deepEqual(save(), terminal, 'Acknowledgement wait cannot keep mutating a result');
      stressCases++;
    }
  }

// A sustained high-pressure soak uses extra test HP only, so it outlives natural defeat.
// No production difficulty, speed, wave limit, or collision rule is changed for this check.
for (const mode of ['endless', 'madness']) {
  let run = createRun(data, mode, 0, 'hard', 42);
  run.day = 10000;
  run = prepareDay(data, run);
  startBattle(core, data, run, 42);
  function replenish() {
    const bytes = save(),
      view = new DataView(bytes.buffer);
    view.setFloat32(23 * 4, 1000000, true);
    view.setFloat32(24 * 4, 1000000, true);
    restore(bytes);
  }
  replenish();
  checkpoint(`${mode}/warmup`);
  const memory = core.memory.buffer.byteLength,
    landscape = new Landscape(run.config.durationSeconds, 73),
    limit = fullDay ? Math.ceil(run.config.durationSeconds * 70) + 10000 : 18000;
  let ticks = 0,
    sustainedDamage = false;
  for (; ticks < limit && !state()[9]; ticks++) {
    core.step();
    core.clear_audio_events();
    frames++;
    if (ticks % (fullDay ? 600 : 120) === 0) {
      sustainedDamage ||= state()[2] < 1000000;
      checkpoint(`${mode}/soak/${ticks}`);
      if (fullDay && !state()[9]) replenish();
      landscape.advanceTo(state()[0]);
      assert.ok(landscapeScene(landscape, run.background).length > 0);
    }
    assert.equal(core.memory.buffer.byteLength, memory, 'Fixed pools must bound Wasm memory');
  }
  assert.equal(state()[9], fullDay ? 1 : 0, 'Full final day wins; five-minute soak stays active');
  assert.ok(sustainedDamage, 'Soak must actually sustain castle attacks');
  if (fullDay) {
    const replay = new Landscape(run.config.durationSeconds, 73);
    replay.advanceTo(state()[0]);
    landscape.advanceTo(state()[0]);
    assert.deepEqual(
      landscapeScene(replay, run.background),
      landscapeScene(landscape, run.background),
    );
    checkpoint(`${mode}/full-day-result`);
    finishDay(data, run, {
      won: true,
      gold: state()[4],
      sacrifices: state()[6],
      score: state()[5],
      kills: state()[7],
    });
    assert.equal(run.phase, 'complete');
    assert.ok(validRun(data, run));
    console.log(
      `${mode}: full day 10000, ${run.config.durationSeconds}s, ${ticks} ticks, ${memory} bytes Wasm memory, scenery replay and terminal save verified.`,
    );
  }
}
console.log(
  `Endless/Madness: ${transitions} progression transitions, ${stressCases} natural battles/results, ${frames} simulation ticks, two ${fullDay ? 'full final-day' : 'five-minute late-game'} soaks; finite state, bounded memory and deterministic save/replay. Synthetic checks, not human balance or phone performance.`,
);
