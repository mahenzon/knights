import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  createRun,
  prepareDay,
  makeDay,
  finishDay,
  health,
  equipment,
  canBuy,
  buy,
  validRun,
} from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const native = JSON.parse(fs.readFileSync('tests/fixtures/campaign-followup.json'));
for (const difficulty of ['easy', 'normal', 'hard']) {
  const run = createRun(data, 'campaign', 10, difficulty, 73);
  run.day = 18;
  assert.equal(equipment(data, prepareDay(data, run))[0].typeId, 7);
  for (const day of [6, 7, 8, 19, 20]) {
    run.day = day;
    assert.deepEqual(
      equipment(data, prepareDay(data, run)),
      [],
      `Explosive Round day ${day} disables its platform`,
    );
  }
}
for (const fixture of native) {
  const run = createRun(data, fixture.mode, 9, fixture.difficulty, fixture.seed);
  Object.assign(run, {
    seed: fixture.seed,
    day: fixture.day,
    enemyTable: fixture.previousTable,
    prefixGrowth: fixture.prefixGrowth,
    mirror: true,
  });
  let calls = 0;
  const actual = makeDay(data, run, () => {
      calls++;
      // This native fixture supplies an LCG stream to isolate procedural formulas.
      run.seed = (Math.imul(run.seed, 1103515245) + 12345) & 0x7fffffff;
      return run.seed;
    }),
    expected = fixture.config;
  for (const key of [
    'dayNumber',
    'durationSeconds',
    'tripleSpawn',
    'mirrorLevel',
    'enemyTypeTable',
    'enemyModifiers',
    'disabledShopCategories',
    'artefactInitializers',
  ])
    assert.deepEqual(
      actual[key],
      expected[key],
      `${fixture.mode}/${fixture.difficulty}/${fixture.day} ${key}`,
    );
  for (const [key, value] of Object.entries(actual.wave))
    assert.ok(
      Math.abs(value - expected.wave[key]) < 0.00001,
      `${fixture.mode}/${fixture.difficulty}/${fixture.day} ${key}: ${value} vs ${expected.wave[key]}`,
    );
  assert.equal(calls, fixture.randomCalls);
  assert.equal(run.seed, fixture.finalSeed);
}
let days = 0;
for (const difficulty of ['easy', 'normal', 'hard'])
  for (let castle = 0; castle < 12; castle++) {
    let run = createRun(data, 'campaign', castle, difficulty, 123);
    for (let day = 1; day <= data.levels[castle].dayCount; day++) {
      run = prepareDay(data, run);
      assert.equal(run.day, day);
      assert.ok(validRun(data, run));
      if (castle !== 9 && castle !== 11)
        assert.deepEqual(run.config, data.levels[castle].difficulties[difficulty][day - 1]);
      assert.equal(
        new Set(equipment(data, run).map((d) => d.slot)).size,
        equipment(data, run).length,
      );
      finishDay(data, run, {
        won: true,
        gold: run.gold + 10,
        sacrifices: run.sacrifices + 1,
        score: run.score + 20,
        kills: 1,
      });
      assert.equal(run.phase, day === data.levels[castle].dayCount ? 'complete' : 'shop');
      assert.ok(validRun(data, run));
      days++;
    }
    assert.equal(run.kills, data.levels[castle].dayCount);
    const saved = structuredClone(run);
    finishDay(data, run, { won: true, gold: 999, sacrifices: 999, score: 999, kills: 999 });
    assert.deepEqual(run, saved);
    assert.throws(() => prepareDay(data, run));
  }
for (const item of data.shop.items) {
  const run = prepareDay(data, createRun(data, 'campaign', 2, 'normal', 73));
  finishDay(data, run, { won: true, gold: 100000, sacrifices: 1000, score: 20, kills: 1 });
  run.inventory[item.inventoryIndex] = -1;
  assert.ok(canBuy(data, run, item.index));
  assert.ok(buy(data, run, item.index));
  assert.equal(run.gold, 100000 - item.goldCost);
  assert.equal(run.sacrifices, 1000 - item.sacrificeCost);
  assert.equal(run.inventory[item.inventoryIndex], item.upgradeIndex);
  assert.equal(buy(data, run, item.index), false);
  const next = prepareDay(data, run);
  assert.ok(validRun(data, next));
  if (item.inventoryIndex === 0)
    assert.equal(health(next), [100, 300, 500, 700, 1080][item.upgradeIndex]);
  else
    assert.ok(
      equipment(data, next).some(
        (d) =>
          d.inventoryIndex === item.inventoryIndex &&
          d.upgradeIndex === item.upgradeIndex * (d.upgradeMultiplier || 1),
      ),
    );
}
let run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
finishDay(data, run, { won: true, gold: 10000, sacrifices: 1000, score: 20, kills: 1 });
assert.equal(buy(data, run, 10), false, 'First Encounter hides Sacrificers');
run.gold = 0;
assert.equal(buy(data, run, 110), false);
run.gold = 500;
run.sacrifices = 0;
assert.equal(buy(data, run, 80), false);
assert.equal(buy(data, run, -1), false);
const intact = structuredClone(run);
for (const damage of [
  (r) => (r.inventory[0] = 8),
  (r) => (r.day = 999),
  (r) => (r.config.wave.initialPressure = NaN),
  (r) => (r.config.enemyTypeTable = [99]),
  (r) => (r.config.artefactInitializers[0].slot = 30),
]) {
  const damaged = structuredClone(intact);
  damage(damaged);
  assert.equal(validRun(data, damaged), false);
}
// Unknown JSON is a boundary: malformed nested structures must reject, never throw.
for (const value of [null, false, 12, 'save', [], {}, { version: 1 }])
  assert.equal(validRun(data, value), false);
for (const damage of [
  (r) => (r.config = null),
  (r) => (r.config = []),
  (r) => (r.config.wave = null),
  (r) => (r.config.wave = []),
  (r) => (r.config.enemyModifiers = null),
  (r) => (r.config.artefactInitializers = [null]),
  (r) => (r.config.artefactInitializers = [42]),
  (r) => (r.config.disabledShopCategories = [null]),
  (r) => (r.config.enemyTypeTable = [null]),
  (r) => (r.inventory = [null]),
  (r) => (r.level = data.levels.length),
  (r) => (r.prefixGrowth = '0.1'),
]) {
  const damaged = structuredClone(intact);
  damage(damaged);
  assert.equal(validRun(data, damaged), false);
}
for (const mode of ['endless', 'madness']) {
  let run = createRun(data, mode, 0, 'easy', 73);
  for (let day = 1; day <= 35; day++) {
    run = prepareDay(data, run);
    assert.ok(validRun(data, run));
    assert.equal(health(run), mode === 'madness' ? 600 : 200);
    finishDay(data, run, { won: true, gold: 10, sacrifices: 1, score: 20, kills: 1 });
  }
}
run = prepareDay(data, createRun(data, 'campaign', 7, 'normal', 73));
assert.equal(health(run), 300, 'Secret Spells forces Steel Door');
finishDay(data, run, { won: true, gold: 10, sacrifices: 1, score: 20, kills: 1 });
run.inventory[0] = 3;
assert.equal(prepareDay(data, run).inventory[0], 1, 'Secret Spells forces tier 1 again every day');
console.log(
  `Campaign: ${native.length} native procedural fixtures, ${days} campaign days, all 23 purchases, progression, restrictions and malformed saves pass.`,
);
