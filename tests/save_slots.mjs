import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as campaign from '../build/web/campaign.mjs';
import { savedMode, PlayMotion, playControls, playScene } from '../build/web/play.mjs';
import { Landscape } from '../build/web/scene.mjs';
import { readCastleRecords, recordCastleScore } from '../build/web/map.mjs';
import { PurchaseMotion, dialogScene, buttonScene } from '../build/web/shop.mjs';

const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const source = fs.readFileSync('web/game.mjs', 'utf8');
const native = JSON.parse(fs.readFileSync('tests/fixtures/save-roundtrip.json'));
const ui = JSON.parse(fs.readFileSync('tests/fixtures/save-ui.json'));
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const stored = new Map(),
  controls = [],
  notices = [];
let writable = true,
  loadsFail = false,
  starts = 0;
const key = (mode) => `save-${mode}`;
const context = vm.createContext({
  ...campaign,
  data,
  core,
  savedMode,
  Landscape,
  PurchaseMotion,
  PlayMotion,
  playControls,
  playMotion: new PlayMotion(),
  purchase: null,
  toMenu() {},
  SAVE_KEY: 'save',
  run: null,
  screen: 'play',
  panel: { hidden: true },
  optionReturnToGame: false,
  continueBackdrop: '',
  continueMotion: null,
  activePointer: null,
  landscape: null,
  currentDifficulty: 'normal',
  resultAssets: [],
  menu: {},
  pauseButton: {},
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  localStorage: { getItem: (key) => stored.get(key) ?? null },
  storageSet(key, value) {
    if (!writable) {
      notices.push('storage failed');
      return false;
    }
    stored.set(key, value);
    return true;
  },
  castleControls(buttons) {
    controls.splice(0, controls.length, ...buttons);
  },
  castleMenu() {
    context.screen = 'map';
  },
  updateMap() {},
  playMenu() {
    context.screen = 'play';
  },
  beginRun() {
    starts++;
  },
  hidePanels() {},
  prepareAudio() {},
  stopAudio() {},
  sound() {},
  render() {},
  menuClock: { start() {} },
  show(title, _description, buttons) {
    notices.push({ title, buttons });
  },
  $: () => ({}),
  loadBattleImages: async () => {
    if (loadsFail === 'artwork') throw Error('offline');
  },
  loadBattleAudio: async () => {
    if (loadsFail === 'audio') throw Error('audio download interrupted');
  },
  imageLoader: {
    load: async (names) => {
      if (loadsFail === 'results' && names === context.resultAssets)
        throw Error('results artwork unavailable');
    },
  },
  shopAssets: () => [],
  pauseScreen() {
    context.screen = 'paused';
  },
  resultScreen() {
    context.screen = 'result';
  },
  state() {
    const p = core.draw_ptr();
    context.draw = new Float32Array(core.memory.buffer, p, core.draw_len());
    return context.draw;
  },
});
vm.runInContext(
  section('function playMenu(', 'async function castleMenu(') +
    section('function readRunSave(', 'function finishRun()') +
    section('function save()', 'function pause('),
  context,
);
const call = (code) => vm.runInContext(code, context);
const snapshots = new Map();
for (const [index, mode] of campaign.modes.entries()) {
  context.run = campaign.prepareDay(data, campaign.createRun(data, mode, 0, 'normal', 73 + index));
  campaign.startBattle(core, data, context.run, 73 + index);
  for (let t = 0; t < 120 + index * 60; t++) core.step();
  context.screen = 'game';
  call('save()');
  snapshots.set(mode, stored.get(key(mode)));
  assert.equal(savedMode(stored.get(key(mode))), mode);
}
assert.equal(stored.size, 3, 'All modes retain independent checkpoints');
for (const mode of campaign.modes) {
  context.screen = 'play';
  await call(`chooseMode('${mode}')`);
  assert.equal(context.screen, 'continue');
  assert.equal(savedMode(stored.get(key(mode))), null, 'Opening the prompt consumes availability');
  assert.equal(JSON.parse(stored.get(key(mode))).state, JSON.parse(snapshots.get(mode)).state);
  await controls.find((b) => b.text === 'YES').action();
  assert.equal(context.screen, 'paused');
  assert.equal(context.run.mode, mode);
  const p = core.save_ptr();
  assert.equal(
    Buffer.from(core.memory.buffer, p, core.save_len()).toString('base64'),
    JSON.parse(snapshots.get(mode)).state,
  );
  call('save()');
  assert.equal(
    savedMode(stored.get(key(mode))),
    mode,
    'Pausing/backgrounding offers a fresh checkpoint',
  );
  for (const other of campaign.modes.filter((m) => m !== mode))
    assert.equal(stored.get(key(other)), snapshots.get(other));
}
for (const { mode, after_choice, after_no, after_second_choice } of native.no_resume_choices) {
  for (const other of campaign.modes) stored.set(key(other), snapshots.get(other));
  context.screen = 'play';
  await call(`chooseMode('${mode}')`);
  const before = starts,
    motion = context.playMotion;
  assert.deepEqual(
    campaign.modes.map((m) => Number(savedMode(stored.get(key(m))) !== null)),
    after_choice.flags,
  );
  await controls.find((b) => b.text === 'NO').action();
  assert.equal(context.screen, mode === 'campaign' ? 'map' : 'play');
  assert.equal(starts, before, 'NO only dismisses the original prompt');
  assert.equal(context.playMotion, motion, 'NO does not restart the submenu entrance');
  assert.equal(after_no.mode, mode === 'campaign' ? 10 : 0);
  assert.deepEqual(after_no.flags, after_choice.flags);
  assert.equal(after_second_choice.created.length, 0);
  await call(`chooseMode('${mode}')`);
  assert.notEqual(context.screen, 'continue', 'Declined checkpoint is not offered repeatedly');
  assert.equal(starts, before + (mode === 'campaign' ? 0 : 1));
}
// Old shared saves are read without deletion; a new per-mode slot takes precedence, even when retired.
for (const mode of campaign.modes) {
  stored.clear();
  stored.set('save', snapshots.get(mode));
  assert.equal(call(`readRunSave('${mode}')`), snapshots.get(mode));
  for (const other of campaign.modes.filter((m) => m !== mode))
    assert.equal(call(`readRunSave('${other}')`), null);
  context.screen = 'play';
  await call(`chooseMode('${mode}')`);
  await controls.find((b) => b.text === 'YES').action();
  assert.equal(context.screen, 'paused');
  assert.equal(stored.get('save'), snapshots.get(mode), 'Migration keeps the legacy source intact');
  call('clearRunSave()');
  assert.equal(call(`readRunSave('${mode}')`), 'null', 'Retired legacy data cannot resurrect');
}
stored.clear();
const legacy = {
  version: 2,
  difficulty: 'normal',
  state: JSON.parse(snapshots.get('campaign')).state,
};
stored.set('save', JSON.stringify(legacy));
await call("chooseMode('campaign')");
await controls.find((b) => b.text === 'YES').action();
assert.equal(context.screen, 'paused');
assert.equal(context.run.mode, 'campaign');
assert.equal(stored.get('save'), JSON.stringify(legacy));
for (const mode of campaign.modes) stored.set(key(mode), snapshots.get(mode));
context.run = JSON.parse(snapshots.get('endless')).run;
context.run.phase = 'failed';
context.screen = 'result';
call('save()');
assert.equal(stored.get(key('endless')), 'null');
for (const mode of ['campaign', 'madness'])
  assert.equal(stored.get(key(mode)), snapshots.get(mode));
// Storage failure cannot consume a prompt or rewrite another mode. An asset retry captures its mode.
writable = false;
context.screen = 'play';
await call("chooseMode('madness')");
assert.equal(context.screen, 'play');
assert.equal(stored.get(key('madness')), snapshots.get('madness'));
writable = true;
loadsFail = 'artwork';
await call("chooseMode('madness')");
await controls.find((b) => b.text === 'YES').action();
assert.equal(notices.at(-1).title, 'Save could not be opened');
assert.equal(
  JSON.parse(stored.get(key('madness'))).state,
  JSON.parse(snapshots.get('madness')).state,
);
assert.equal(
  savedMode(stored.get(key('madness'))),
  'madness',
  'A failed asset download must leave the checkpoint offered after reopening',
);
loadsFail = false;
await notices
  .at(-1)
  .buttons.find(([label]) => label === 'Retry')[1]();
assert.equal(context.screen, 'paused');
assert.equal(context.run.mode, 'madness');
// A fresh mode choice must also recover after a download failure, without relying on Retry's closure.
for (const mode of campaign.modes) {
  for (const other of campaign.modes) stored.set(key(other), snapshots.get(other));
  loadsFail = mode === 'campaign' ? 'artwork' : mode === 'endless' ? 'audio' : 'results';
  context.screen = 'play';
  await call(`chooseMode('${mode}')`);
  await controls.find((b) => b.text === 'YES').action();
  assert.equal(notices.at(-1).title, 'Save could not be opened');
  for (const other of campaign.modes.filter((m) => m !== mode))
    assert.equal(stored.get(key(other)), snapshots.get(other));
  loadsFail = false;
  context.run = null;
  context.screen = 'play';
  await call(`chooseMode('${mode}')`);
  assert.equal(context.screen, 'continue', `${mode}: recovered offer after reload`);
  await controls.find((b) => b.text === 'YES').action();
  assert.equal(context.screen, 'paused');
  assert.equal(context.run.mode, mode);
  const ptr = core.save_ptr();
  assert.equal(
    Buffer.from(core.memory.buffer, ptr, core.save_len()).toString('base64'),
    JSON.parse(snapshots.get(mode)).state,
    'Asset failure cannot advance or replace the checkpoint',
  );
}
const mismatched = JSON.parse(snapshots.get('campaign'));
mismatched.run.phase = 'shop';
mismatched.available = false;
stored.set(key('campaign'), JSON.stringify(mismatched));
loadsFail = 'artwork';
await call("resumeSaved('campaign')");
assert.equal(notices.at(-1).title, 'Save could not be opened');
assert.equal(
  stored.get(key('campaign')),
  JSON.stringify(mismatched),
  'Invalid checkpoint metadata cannot be reoffered as a download failure',
);
loadsFail = false;
stored.set(key('campaign'), snapshots.get('madness'));
await call("resumeSaved('campaign')");
assert.equal(
  notices.at(-1).title,
  'Save could not be opened',
  'Reject a checkpoint for the wrong mode',
);
for (const original of ui.saved_dialog_backdrops) {
  const draws = [],
    playMotion = new PlayMotion(),
    continueMotion = new PurchaseMotion();
  for (let frame = 0; frame < 60; frame++) {
    playMotion.step();
    continueMotion.step();
  }
  vm.runInNewContext(
    `(function () {${section("  if (screen === 'play' || screen === 'continue')", "  if (screen === 'result' || screen === 'shop')")}})()`,
    {
      screen: 'continue',
      continueBackdrop: 'play',
      playMotion,
      continueMotion,
      playScene,
      playControls,
      buttonScene,
      dialogScene,
      castleButtons: [
        { text: 'NO', rect: [125, 160, 115, 61] },
        { text: 'YES', rect: [252, 160, 115, 61] },
      ],
      menuCommands: (commands) => draws.push(...commands),
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(draws)),
    original.dialog_draws.map(({ frame: _frame, radians: _radians, ...draw }) => draw),
  );
  assert.deepEqual(original.before, original.after_no);
}
const nativeVictory = ui.terminal_acknowledgement.find((c) => c.won);
assert.equal(nativeVictory.after_result_draws.completed, false);
assert.equal(nativeVictory.after_done.completed, true);
// Actual terminal Wasm snapshots resume directly into results, preserving shop purchases.
Object.assign(context, {
  readCastleRecords,
  recordCastleScore,
  best: 0,
  lastAnnouncedSecond: -1,
  visualTime: { step() {} },
  clock: { stop() {} },
  drainSounds() {},
  canvas: { setAttribute() {} },
});
vm.runInContext(
  section('function tick()', 'function save()') +
    section('function finishRun()', 'function highScores()'),
  context,
);
for (const [mode, final] of [
  ['campaign', false],
  ['endless', false],
  ['madness', false],
  ['campaign', true],
]) {
  let run = campaign.createRun(data, mode, 0, 'normal', 73);
  if (final) run.day = data.levels[0].dayCount;
  context.run = run = campaign.prepareDay(data, run);
  campaign.startBattle(core, data, run, 73);
  const p = core.save_ptr(),
    bytes = new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  const view = new DataView(bytes.buffer);
  view.setFloat32(92, 1000000, true);
  view.setFloat32(96, 1000000, true);
  const load = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, load, bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  for (let tick = 0; tick < 60000; tick++) {
    core.step();
    context.state();
    if (context.draw[9]) break;
  }
  assert.equal(context.draw[9], 1);
  context.screen = 'game';
  call('tick()');
  assert.equal(context.screen, 'result');
  assert.equal(run.phase, final ? 'complete' : 'shop');
  assert.equal(stored.has('knights-completed'), false, 'Victory alone cannot unlock the map');
  if (!final) {
    run.gold = 100000;
    run.sacrifices = 1000;
    const item = data.shop.items.find(
      (item) => item.goldCost > 0 && campaign.canBuy(data, run, item.index),
    );
    assert.equal(campaign.buy(data, run, item.index), true);
    context.screen = 'shop';
    call('save()');
  }
  const saved = stored.get(key(mode));
  context.run = null;
  await call(`resumeSaved('${mode}')`);
  assert.equal(context.screen, 'result', 'No repeated victory drain or extra gameplay tick');
  assert.deepEqual(JSON.parse(stored.get(key(mode))), JSON.parse(saved));
  if (final) {
    writable = false;
    call('finishRun()');
    assert.equal(context.run.phase, 'complete');
    assert.equal(stored.has('knights-completed'), false);
    writable = true;
    call('finishRun()');
    assert.equal(context.screen, 'map');
    assert.equal(JSON.parse(stored.get('knights-completed'))['normal:0'], true);
    assert.equal(stored.get(key('campaign')), 'null');
  }
}
context.run = campaign.prepareDay(data, campaign.createRun(data, 'madness', 0, 'normal', 73));
campaign.startBattle(core, data, context.run, 73);
context.screen = 'game';
call('save()');
const otherSave = stored.get(key('endless'));
for (let tick = 0; tick < 10000; tick++) {
  core.step();
  context.state();
  if (context.draw[3699] === 2) break;
}
assert.equal(context.draw[3699], 2);
assert.equal(context.draw[9], 0, 'Defeat flag precedes the result screen');
assert.equal(context.run.phase, 'battle');
call('save()');
assert.equal(
  stored.get(key('madness')),
  'null',
  'Defeat retires the checkpoint during its transition',
);
assert.equal(stored.get(key('endless')), otherSave);
console.log(
  'Original per-mode saves: three live Wasm roundtrips, one-shot YES/NO routing, legacy v2/v3 preservation, isolated retirement, failed storage, asset retry, shop/result resume and Done-only castle unlock.',
);
