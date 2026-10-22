import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as campaign from '../../build/web/campaign.mjs';
import { Landscape } from '../../build/web/scene.mjs';

const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native = JSON.parse(fs.readFileSync('research/session-random.json'));
const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const legacyZero = { seed: 0 },
  newOne = { seed: 1 };
assert.equal(campaign.random(legacyZero), campaign.random(newOne));
assert.deepEqual(legacyZero, newOne, 'Legacy zero seed follows the core.start normalization');
let frames = 0;
for (const c of native.cases) {
  const {
    instance: { exports: core },
  } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
  let stored;
  const context = vm.createContext({
    ...campaign,
    Landscape,
    data,
    core,
    crypto: webcrypto,
    run: campaign.createRun(data, c.mode, c.level, 'normal', c.seed),
    landscape: null,
    screen: 'menu',
    currentDifficulty: 'normal',
    lastAnnouncedSecond: -1,
    activePointer: null,
    optionReturnToGame: false,
    SAVE_KEY: 'test',
    resultAssets: [],
    hidePanels() {},
    prepareAudio() {},
    show(title) {
      assert.notEqual(title, 'Save could not be opened');
    },
    toMenu() {},
    $: () => ({}),
    loadBattleImages: async () => {},
    loadBattleAudio: async () => {},
    imageLoader: { load: async () => {} },
    shopAssets: () => [],
    startPlay() {
      context.screen = 'game';
    },
    storageSet(key, value) {
      assert.equal(key, `test-${context.run.mode}`);
      stored = value;
    },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: () => stored },
    state() {
      context.draw = new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len());
      return context.draw;
    },
    stopAudio() {},
    pauseButton: {},
    menu: {},
    playMenu() {},
    pauseScreen() {
      context.screen = 'paused';
    },
    clearRunSave() {},
  });
  vm.runInContext(
    section('async function newDay(', 'function startPlay(') +
      section('function readRunSave(', 'function clearRunSave()') +
      section('function save()', 'function pause('),
    context,
  );
  const save = () => {
    const ptr = core.save_ptr();
    return new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice();
  };
  for (const day of c.days) {
    const before = JSON.stringify(context.run);
    const preview = campaign.prepareDay(data, context.run);
    assert.equal(JSON.stringify(context.run), before, 'Asset warming cannot consume the saved RNG');
    assert.deepEqual(
      campaign.prepareDay(data, context.run),
      preview,
      'Retry repeats the same setup',
    );
    await vm.runInContext('newDay()', context);
    const label = `${c.mode}/${c.level}/day${day.day}`;
    assert.equal(
      new DataView(save().buffer).getUint32(80, true),
      day.initial.rng,
      `${label} shared setup RNG`,
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.landscape.stars)),
      day.initial.land.stars,
      `${label} native starfield`,
    );
    assert.deepEqual(context.run.config.enemyTypeTable, day.initial.table, `${label} enemy table`);
    assert.equal(context.run.config.durationSeconds, day.initial.config[0], `${label} duration`);
    assert.equal(context.run.background, day.initial.background, `${label} background`);
    const bytes = save(),
      v = new DataView(bytes.buffer);
    v.setFloat32(92, 100000, true);
    v.setFloat32(96, 100000, true);
    new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
    assert.equal(core.restore(), 1);
    for (const f of day.frames) {
      core.step();
      const state = new DataView(save().buffer);
      assert.equal(state.getUint32(80, true), f.rng, `${label}/${f.tick} world RNG`);
      for (let slot = 0; slot < 200; slot++) {
        const actor = f.actors.find((a) => a.slot === slot),
          p = (235 + slot * 27) * 4;
        assert.equal(
          state.getUint32(p, true) !== 0,
          Boolean(actor),
          `${label}/${f.tick}/${slot} active`,
        );
        if (!actor) continue;
        assert.equal(state.getUint32(p + 4, true), actor.kind, `${label}/${f.tick}/${slot} kind`);
        for (const [offset, key] of [
          [28, 'x'],
          [32, 'y'],
          [48, 'hp'],
        ])
          assert.ok(
            Math.abs(state.getFloat32(p + offset, true) - actor[key]) < 0.0001,
            `${label}/${f.tick}/${slot} ${key}`,
          );
      }
      frames++;
    }
    vm.runInContext('save()', context);
    const persisted = JSON.parse(stored);
    assert.equal(persisted.run.seed, day.frames.at(-1).rng, `${label} saved RNG handoff`);
    assert.ok(campaign.validRun(data, persisted.run));
    const checkpoint = save();
    context.run = null;
    await vm.runInContext(`resumeSaved('${c.mode}')`, context);
    assert.equal(context.screen, 'paused');
    assert.deepEqual(save(), checkpoint, `${label} restoring scenery cannot consume game RNG`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.landscape.stars)),
      day.initial.land.stars,
      `${label} same stars after restore`,
    );
    campaign.finishDay(data, context.run, {
      won: true,
      gold: 0,
      sacrifices: 0,
      score: 0,
      kills: 0,
    });
  }
  const legacy = JSON.parse(stored);
  delete legacy.run.landscapeSeed;
  legacy.run.seed = 73;
  stored = JSON.stringify(legacy);
  const checkpoint = save();
  await vm.runInContext(`resumeSaved('${c.mode}')`, context);
  assert.equal(context.screen, 'paused');
  assert.deepEqual(save(), checkpoint, 'Legacy scenery restore preserves the engine state');
  assert.deepEqual(
    context.landscape.stars,
    new Landscape(legacy.run.config.durationSeconds, 73).stars,
    'Legacy saves preserve their original starfield',
  );
  vm.runInContext('save()', context);
  assert.equal(
    JSON.parse(stored).run.seed,
    73,
    'Legacy pause/save does not overwrite the scenery seed',
  );
  for (const invalid of [-1, 0x100000000, 1.5, '73', null]) {
    const bad = structuredClone(legacy.run);
    bad.landscapeSeed = invalid;
    assert.equal(campaign.validRun(data, bad), false, 'Reject malformed star seed');
  }
}
console.log(
  `Shared random sequence: ${native.cases.length} native two-day sessions/${frames} world frames match day setup, starfields, enemies and saved RNG handoff through the production newDay/save functions.`,
);
