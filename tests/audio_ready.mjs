import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function battleFixture() {
  const audio = Promise.withResolvers(),
    panels = [],
    starts = [];
  const context = vm.createContext({
    run: {},
    data: {},
    core: {},
    screen: 'menu',
    hidePanels() {},
    prepareAudio() {},
    loadBattleAudio: () => audio.promise,
    prepareDay: () => ({ config: { enemyTypeTable: [0], durationSeconds: 60 }, seed: 73 }),
    show: (...args) => panels.push(args),
    $: () => ({}),
    loadBattleImages: async () => {},
    imageLoader: { load: async () => {} },
    resultAssets: [],
    shopAssets: () => [],
    toMenu() {},
    random() {},
    landscape: null,
    Landscape: class {},
    startBattle: () => starts.push('initialized'),
    startPlay: () => starts.push('playing'),
    currentDifficulty: 'normal',
    lastAnnouncedSecond: -1,
    save() {},
  });
  vm.runInContext(section('async function newDay(', 'function startPlay('), context);
  return { context, audio, panels, starts, start: () => vm.runInContext('newDay()', context) };
}

const slow = battleFixture();
const day = slow.start();
await new Promise(setImmediate);
assert.deepEqual(slow.starts, [], 'battle must wait for decoded effects and downloaded OST');
slow.audio.resolve();
await day;
assert.deepEqual(slow.starts, ['initialized', 'playing']);

const hidden = battleFixture();
let pagehide;
Object.assign(hidden.context, {
  backgrounded: false,
  pauseButton: {},
  document: { hidden: false, hasFocus: () => true },
  settings: { power: false },
  clock: { start: () => hidden.starts.push('playing') },
  cancelMenuInput() {},
  shopScroll: null,
  scoreScroll: null,
  menuClock: { stop() {} },
  unlockAudio() {},
  resize() {},
  stopAudio() {},
  pause() {
    if (hidden.context.screen !== 'game') return;
    hidden.context.screen = 'paused';
    hidden.starts.push('paused');
  },
  window: {
    addEventListener(name, callback) {
      assert.equal(name, 'pagehide');
      pagehide = callback;
    },
  },
});
vm.runInContext(
  section('function startPlay(', 'function drainSounds()') +
    section("window.addEventListener('pagehide'", "window.addEventListener('blur'"),
  hidden.context,
);
const hiddenDay = hidden.start();
pagehide();
hidden.audio.resolve();
await hiddenDay;
assert.deepEqual(
  hidden.starts,
  ['initialized', 'paused'],
  'a page restored while audio finishes loading must wait for a Resume gesture',
);

const failed = battleFixture();
const retry = failed.start();
failed.audio.reject(new Error('Audio download failed'));
await retry;
assert.deepEqual(failed.starts, [], 'failed audio must keep the player out of a silent battle');
assert.ok(failed.panels.at(-1)[2].some(([label]) => label === 'Retry'));

const requests = [],
  loaded = Promise.withResolvers(),
  effects = new Map();
const loader = vm.createContext({
  settings: { sound: true, muted: false },
  previewMuted: false,
  audioContext: {},
  data: { sounds: { creeps: [['throw.wav']], other: { 11: ['gate.wav'] } } },
  loadSound(name) {
    requests.push(name);
    if (!effects.has(name)) effects.set(name, Promise.withResolvers());
    return effects.get(name).promise;
  },
  music: { ready: () => loaded.promise, preload: () => loaded.promise },
});
vm.runInContext(section('async function loadBattleAudio(', 'function prepareAudio('), loader);
const loading = vm.runInContext('loadBattleAudio(true)', loader);
assert.deepEqual(requests, [
  'menu_click_button.wav',
  'menu_buble_open.wav',
  'throw.wav',
  'gate.wav',
]);
let completed = false;
loading.then(() => {
  completed = true;
});
for (const effect of effects.values()) effect.resolve({ decoded: true });
await new Promise(setImmediate);
assert.equal(completed, false);
loaded.resolve();
await loading;
assert.equal(completed, true);
loader.previewMuted = true;
await vm.runInContext('loadBattleAudio(true)', loader);
assert.equal(requests.length, 4, 'muted development does not need audio downloads');
loader.previewMuted = false;
loader.loadSound = async () => null;
await assert.rejects(
  vm.runInContext('loadBattleAudio(true)', loader),
  /effects could not be loaded/,
);
console.log('Battle loading: waits for audio and offers retry instead of silent gameplay.');
