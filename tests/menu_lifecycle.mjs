import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { optionDifficulties } from '../build/web/options.mjs';
import { addScore, readScores, scoreName } from '../build/web/scores.mjs';
import { readCastleRecords, recordCastleScore } from '../build/web/map.mjs';
import { mainControls, PlayMotion } from '../build/web/play.mjs';
const source = fs.readFileSync('web/game.mjs', 'utf8');
function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}
const audio =
  section('function stopAudio()', 'function loadSound(') +
  section('async function sound(', 'async function offline(');
const menus =
  section('function toMenu()', 'function playMenu(') +
  section('function clearRunSave()', 'async function shop()');
function fixture() {
  let played = 0;
  let cleared = 0;
  const context = vm.createContext({
    settings: { sound: true },
    previewMuted: false,
    audioEpoch: 0,
    audioPending: Promise.resolve(),
    audioSources: new Map(),
    audioWanted: true,
    audioUnlocked: true,
    backgrounded: false,
    document: { hidden: false },
    screen: 'result',
    optionReturnToGame: false,
    SAVE_KEY: 'save',
    best: 123,
    run: { mode: 'campaign', phase: 'failed', level: 0, score: 123 },
    readCastleRecords,
    recordCastleScore,
    storageSet(key, value) {
      if (key.startsWith('save-')) {
        assert.equal(value, 'null');
        cleared++;
      }
      return true;
    },
    localStorage: {
      removeItem(key) {
        assert.equal(key, 'save');
        cleared++;
      },
    },
    core: { clear_audio_events() {} },
    music: { pause() {} },
    clock: { stop() {} },
    data: { assets: ['menu_click_button.wav'] },
    audioContext: {
      state: 'running',
      destination: {},
      createGain() {
        return { connect() {}, disconnect() {} };
      },
      resume() {
        this.state = 'running';
        return Promise.resolve();
      },
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      },
      createBufferSource() {
        return {
          connect() {},
          stop() {},
          start() {
            played++;
          },
        };
      },
    },
    loadSound: () => Promise.resolve({}),
    prepareAudio() {
      context.audioContext.state = 'running';
    },
    hidePanels() {},
    render() {},
    pauseButton: {},
    menu: {},
    mainControls,
    PlayMotion,
    mainMotion: null,
    menuClock: { start() {} },
    castleControls() {},
    playMenu() {},
    highScores() {},
    options() {},
    showHelp() {},
    credits() {},
    castleMenu() {
      context.screen = 'map';
    },
    show() {},
    message() {},
  });
  vm.runInContext(audio + menus, context);
  return { context, played: () => played, cleared: () => cleared };
}
// Exercise the actual async sound + synchronous button action, not only Soundtrack in isolation.
for (const action of ['toMenu()', 'finishRun()']) {
  const f = fixture();
  const pending = vm.runInContext("sound('menu_click_button.wav', true)", f.context);
  vm.runInContext(action, f.context);
  await pending;
  assert.equal(f.played(), 1, `${action} must not cancel the pending menu click`);
  if (action === 'finishRun()') {
    assert.equal(f.context.screen, 'map');
    assert.equal(f.context.run, null);
    assert.equal(f.cleared(), 1);
  }
}
const background = fixture();
const pending = vm.runInContext("sound('menu_click_button.wav', true)", background.context);
vm.runInContext('stopAudio()', background.context);
await pending;
assert.equal(background.played(), 0, 'background suspension still cancels pending sounds');
const resume = fixture();
resume.context.screen = 'paused';
resume.context.audioContext.state = 'suspended';
resume.context.audioWanted = false;
resume.context.backgrounded = true;
resume.context.menuClock = { start() {} };
vm.runInContext(
  section(
    'function resumeAudioOnGesture()',
    "document.addEventListener('pointerdown', resumeAudioOnGesture",
  ),
  resume.context,
);
vm.runInContext('resumeAudioOnGesture()', resume.context);
assert.equal(
  resume.context.backgrounded,
  false,
  'pause-menu gesture can release background suspension',
);
await vm.runInContext("sound('menu_click_button.wav', true)", resume.context);
assert.equal(resume.played(), 1, 'Resume click must wake the effect context before decoding');
const paused = fixture();
let musicStops = 0;
Object.assign(paused.context, {
  screen: 'game',
  pauseButton: {},
  save() {},
  pauseScreen() {},
});
paused.context.music.pause = () => musicStops++;
vm.runInContext(
  section('function pause(reason =', 'function pauseScreen(') +
    section('pauseButton.onclick =', 'function fullscreenChanged()'),
  paused.context,
);
vm.runInContext('pauseButton.onclick({ detail: 0 })', paused.context);
await new Promise(setImmediate);
assert.equal(paused.context.screen, 'paused');
assert.equal(paused.played(), 1, 'the original pause button plays its click');
assert.equal(musicStops, 0, 'ordinary native pause leaves the soundtrack playing');
const failed = fixture();
vm.runInContext(section('function save()', 'async function resumeSaved('), failed.context);
vm.runInContext('save()', failed.context);
assert.equal(failed.cleared(), 1, 'defeat must retire the previous live checkpoint');
const slowMap = fixture();
Object.assign(slowMap.context, {
  dev: false,
  loadImages: () => new Promise(() => {}),
  mapAssets: [],
});
slowMap.context.localStorage.getItem = () => null;
slowMap.context.document.querySelectorAll = () => [];
vm.runInContext(section('async function castleMenu(', 'function updateMap()'), slowMap.context);
vm.runInContext('finishRun()', slowMap.context);
assert.equal(
  slowMap.context.screen,
  'loading',
  'pointer-leave/resize during map loading must not render a retired result run',
);
const native = JSON.parse(fs.readFileSync('tests/fixtures/save-lifecycle.json'));
assert.ok(native.cases.filter((c) => c.ui === 'result' && c.defeated).every((c) => !c.available));
assert.equal(
  native.done[0].calls.at(-1).argument,
  10,
  'campaign Done returns to the native map mode',
);
for (const writable of [false, true]) {
  const end = fixture();
  let records;
  end.context.storageSet = (key, value) => {
    if (key.startsWith('save-')) return writable;
    assert.equal(key, 'knights-castle-records');
    if (writable) records = JSON.parse(value);
    return writable;
  };
  end.context.localStorage.getItem = () => '[{"last":10,"best":999}]';
  vm.runInContext('finishRun()', end.context);
  if (writable) {
    assert.equal(records[0].last, 123);
    assert.equal(records[0].best, 999);
    assert.equal(end.context.run, null);
  } else {
    assert.equal(end.context.run.score, 123);
    assert.equal(end.cleared(), 0);
  }
}
for (const writable of [false, true]) {
  const end = fixture(),
    stored = new Map();
  Object.assign(end.context, {
    run: { mode: 'endless', phase: 'failed', score: 123456 },
    addScore,
    readScores,
    scoreName,
    $: () => ({ value: 'Birthday' }),
    storageSet(key, value) {
      if (writable) stored.set(key, value);
      return writable;
    },
    highScores() {
      end.context.screen = 'scores';
    },
  });
  end.context.localStorage.getItem = () => null;
  vm.runInContext('finishRun()', end.context);
  if (writable) {
    assert.equal(JSON.parse(stored.get('knights-scores'))[0][0].score, 123456);
    assert.equal(stored.get('knights-player-name'), 'Birthday');
    assert.equal(end.context.screen, 'scores');
    assert.equal(end.context.run, null);
  } else {
    assert.equal(
      end.context.run.score,
      123456,
      'a storage failure keeps the result available for retry',
    );
    assert.equal(end.cleared(), 0);
  }
}
const options = fixture();
const stored = new Map();
const media = { paused: false, volume: 0 };
Object.assign(options.context, {
  settings: { sound: true, muted: false, volume: 0.35, reverse: false },
  currentDifficulty: 'normal',
  optionDifficulties,
  optionReturnToGame: true,
  run: { mode: 'endless', phase: 'battle', difficulty: 'normal', mirror: false },
  screen: 'options',
  SETTINGS_KEY: 'settings',
  $: () => media,
  syncOptionControls() {},
  save() {
    stored.set('run', { ...options.context.run });
  },
  storageSet(key, value) {
    stored.set(key, value);
  },
});
vm.runInContext(
  section('function optionState()', 'function options()') +
    section('function applyMusicSettings()', 'function resumeAudioOnGesture()'),
  options.context,
);
vm.runInContext(
  'updateOptions({ difficulty: 2, reverse: true, muted: true, volume: 0.8 })',
  options.context,
);
assert.equal(options.context.run.difficulty, 'hard');
assert.equal(options.context.run.mirror, true);
assert.equal(stored.get('run').difficulty, 'hard', 'a paused Options edit remains recoverable');
assert.equal(media.volume, 0.8);
assert.equal(options.context.audioContext.state, 'running', 'music mute must not silence effects');
assert.equal(options.context.settings.sound, true);
assert.equal(JSON.parse(stored.get('settings')).muted, true);
options.context.settings.sound = false;
vm.runInContext(
  'updateOptions({ difficulty: 1, reverse: false, muted: false, volume: 0.35 })',
  options.context,
);
assert.equal(
  options.context.settings.sound,
  true,
  'Mute Music can release an older global-mute preference',
);
console.log(
  'Menu lifecycle: Done/Back clicks survive transitions; defeat is not resumable; Done retires save.',
);
