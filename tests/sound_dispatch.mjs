import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function fixture(deferEnd = false) {
  const played = [],
    endings = [],
    downloads = new Map();
  const context = vm.createContext({
    visualTime: { step() {} },
    settings: { sound: true },
    previewMuted: false,
    screen: 'game',
    document: { hidden: false },
    backgrounded: false,
    audioEpoch: 0,
    audioPending: Promise.resolve(),
    audioSources: new Map(),
    audioWanted: true,
    data: { assets: ['first.wav', 'second.wav'] },
    core: { clear_audio_events() {}, clear_sound_events() {}, weapon_sounds() {} },
    music: { pause() {} },
    audioContext: {
      state: 'running',
      destination: {},
      currentTime: 10,
      createGain() {
        return {
          connect() {},
          disconnect() {},
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime(value, time) {
              assert.equal(value, 0);
              assert.equal(time, 10.005);
            },
          },
        };
      },
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      },
      createBufferSource() {
        return {
          connect() {},
          start() {
            played.push(this.buffer);
          },
          stop(time) {
            assert.equal(time, 10.005, 'stop follows the short transition fade');
            this.stopped = true;
            if (deferEnd) endings.push(() => this.onended());
            else this.onended();
          },
        };
      },
    },
    loadSound(name) {
      if (!downloads.has(name)) downloads.set(name, Promise.withResolvers());
      return downloads.get(name).promise;
    },
  });
  vm.runInContext(
    section('function stopAudio()', 'function loadSound(') +
      section('async function sound(', 'async function offline('),
    context,
  );
  return {
    context,
    played,
    endings,
    downloads,
    play: (name, menu = false) => vm.runInContext(`sound('${name}', ${menu})`, context),
  };
}
const ordered = fixture();
const first = ordered.play('first.wav'),
  second = ordered.play('second.wav');
assert.equal(ordered.downloads.size, 2, 'downloads start concurrently');
ordered.downloads.get('second.wav').resolve('second');
await new Promise(setImmediate);
assert.deepEqual(ordered.played, [], 'later decode must not overtake earlier sound');
ordered.downloads.get('first.wav').resolve('first');
await Promise.all([first, second]);
assert.deepEqual(ordered.played, ['first', 'second']);
await Promise.all([ordered.play('first.wav'), ordered.play('first.wav')]);
assert.deepEqual(ordered.played, ['first', 'second', 'first', 'first'], 'duplicates survive');
const active = [...ordered.context.audioSources.keys()];
vm.runInContext('stopAudio()', ordered.context);
assert.ok(
  active.every((source) => source.stopped),
  'pause must stop effects, not freeze their tails',
);
assert.equal(ordered.context.audioSources.size, 0);

const failed = fixture();
const bad = failed.play('first.wav'),
  good = failed.play('second.wav');
failed.downloads.get('first.wav').reject(new Error('decode failed'));
failed.downloads.get('second.wav').resolve('second');
await Promise.all([bad, good]);
assert.deepEqual(failed.played, ['second'], 'a failed decode cannot poison subsequent sounds');

for (const screen of ['paused', 'result']) {
  const transition = fixture();
  let effect;
  if (screen === 'result') {
    Object.assign(transition.context, {
      draw: [1, 30, 100, 100, 10, 20, 0, 1, 0, 1],
      lastAnnouncedSecond: 1,
      run: { mode: 'campaign', phase: 'battle' },
      best: 0,
      clock: { stop() {} },
      state() {},
      render() {},
      finishDay(_data, run) {
        run.phase = 'shop';
        run.score = 20;
      },
      storageSet() {},
      save() {},
      drainSounds() {
        effect = transition.play('first.wav');
      },
      resultScreen() {
        transition.context.screen = 'result';
      },
    });
    transition.context.core.step = () => {};
    vm.runInContext(section('function tick()', 'function save()'), transition.context);
    vm.runInContext('tick()', transition.context);
  } else {
    effect = transition.play('first.wav');
    transition.context.screen = screen;
  }
  transition.downloads.get('first.wav').resolve('last-frame');
  await effect;
  assert.deepEqual(
    transition.played,
    ['last-frame'],
    `entering ${screen} must not discard a sound already requested by the original game`,
  );
}

const background = fixture();
const stale = background.play('first.wav');
vm.runInContext('stopAudio()', background.context);
background.context.audioContext.state = 'running';
background.context.audioWanted = true;
const fresh = background.play('second.wav');
background.downloads.get('second.wav').resolve('fresh');
await new Promise(setImmediate);
assert.deepEqual(background.played, ['fresh'], 'resume cannot wait behind an old download');
background.downloads.get('first.wav').resolve('stale');
await Promise.all([stale, fresh]);
assert.deepEqual(background.played, ['fresh'], 'suspended-generation sounds stay canceled');

const waking = fixture(),
  wake = Promise.withResolvers();
waking.context.audioContext.state = 'suspended';
waking.context.audioContext.resume = () =>
  wake.promise.then(() => {
    waking.context.audioContext.state = 'running';
  });
const wakeClick = waking.play('first.wav', true);
vm.runInContext('stopAudio()', waking.context);
waking.downloads.get('first.wav').resolve('late');
wake.resolve();
await wakeClick;
assert.deepEqual(waking.played, []);
assert.equal(
  waking.context.audioContext.state,
  'suspended',
  'late context resume must not wake background audio',
);

for (const prepare of [false, true]) {
  const fading = fixture(true),
    resume = Promise.withResolvers();
  const first = fading.play('first.wav');
  fading.downloads.get('first.wav').resolve('first');
  await first;
  fading.context.audioContext.state = 'suspended';
  fading.context.audioContext.resume = () =>
    resume.promise.then(() => {
      fading.context.audioContext.state = 'running';
    });
  if (prepare) {
    fading.context.music.play = () => Promise.resolve();
    fading.context.$ = () => ({});
    vm.runInContext(
      section('function prepareAudio(', 'function resumeAudioOnGesture('),
      fading.context,
    );
    vm.runInContext("prepareAudio('game')", fading.context);
  } else fading.play('second.wav', true);
  vm.runInContext('stopAudio()', fading.context);
  resume.resolve();
  fading.downloads.get('second.wav')?.resolve('stale');
  await new Promise(setImmediate);
  assert.equal(
    fading.context.audioContext.state,
    'running',
    `late ${prepare ? 'preparation' : 'effect'} resume must let the scheduled fade finish`,
  );
  assert.deepEqual(fading.played, ['first'], 'stale sounds remain canceled');
  for (const end of fading.endings) end();
  assert.equal(fading.context.audioSources.size, 0);
  assert.equal(fading.context.audioContext.state, 'suspended', 'fade completion suspends audio');
}

const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const requests = [],
  buffer = new Uint32Array([34, 65, 60, 68, 35, 30, 450, 450, 124, 64, 511]);
let cleared = false;
const bridge = vm.createContext({
  data,
  sound: (name) => requests.push(name),
  core: {
    memory: { buffer: buffer.buffer },
    audio_events_ptr: () => 0,
    audio_events_len: () => (cleared ? 0 : buffer.length),
    clear_audio_events() {
      cleared = true;
    },
  },
});
vm.runInContext(section('function drainSounds()', 'function tick()'), bridge);
vm.runInContext('drainSounds();drainSounds()', bridge);
assert.deepEqual(
  requests,
  [
    'catapult_deathcrash.wav',
    'knightlite_fly.wav',
    'jumper_fly.wav',
    'catapult_deathcrash.wav',
    'knightlite_deathcrash.wav',
    'explosion.wav',
    'explosion.wav',
    'catapult_fire.wav',
    'ice_destroy.wav',
  ],
  'browser preserves native death-chain order/duplicates and skips empty sound-table slots',
);

const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
bridge.core = core;
[120, -1000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((value, i) => {
  core.configure(i, value);
});
core.enemy_type(0, 0);
core.start(73, 100000, 0, 0, 0);
core.equip(5, 6, 0, 392, 237);
for (let i = 0; i < 901; i++) core.step();
core.clear_audio_events();
requests.length = 0;
assert.equal(core.pickup(427, 254), 1);
core.drag(200, 237);
core.release();
vm.runInContext('drainSounds()', bridge);
assert.deepEqual(
  requests,
  ['gun_gun_fire.wav'],
  'input sound drains before another simulation step',
);
assert.equal(core.audio_events_len(), 0);
assert.equal(core.weapon_sounds(), 0, 'legacy mask also drains');
core.step();
vm.runInContext('drainSounds()', bridge);
assert.deepEqual(requests, ['gun_gun_fire.wav'], 'step must not replay drained input');
console.log(
  'Sound dispatch: concurrent decoding, native request order, duplicates, failure and background recovery pass.',
);
