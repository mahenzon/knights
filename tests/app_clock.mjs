import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const first = {
  app: { clock: Math.fround(2 / 60) },
  outer: { land: { elapsed: Math.fround(1 / 60) } },
};
const draw = new Float32Array(6087);
draw[0] = first.outer.land.elapsed;
draw[2420] = 3;
const times = [];
const context = vm.createContext({
  draw,
  visualTime: { read: () => first.app.clock },
  objectScene(input) {
    times.push(input.time);
    return [];
  },
  sceneImage() {},
});
vm.runInContext(section('function renderObject(', 'function render()'), context);
context.renderObject(0);
assert.equal(
  times[0],
  first.app.clock,
  'Held fireball must use the original outer application clock',
);

const { ApplicationTime, FixedClock } = await import('../build/web/lifecycle.mjs');
for (const hidden of [false, true]) {
  assert.equal(
    vm.runInNewContext(`${section('const visualTime =', 'const SAVE_KEY =')}\nvisualTime.active`, {
      ApplicationTime,
      document: { hidden },
    }),
    !hidden,
    'A page initially opened in a hidden tab starts with its visual clock suspended',
  );
}
vm.runInContext(
  `function renderClockScenes() {
    const deviceStart = 2430, dragon = null;
    ${section('  const deviceAfter = [];', '  if (draw[5837])')}
  }`,
  context,
);
for (const name of ['deviceScene', 'missileScene']) context[name] = context.objectScene;
draw[17] = draw[18] = draw[19] = 1;
draw[2430] = 6;
draw[2441] = 2;
times.length = 0;
context.renderObject(0);
context.renderClockScenes();
assert.deepEqual(times, Array(3).fill(first.app.clock), 'All three production clock readers');
const capped = new ApplicationTime(() => 0);
capped.setMode('battle');
capped.step(0.5);
assert.equal(capped.read(), Math.fround(Math.fround(0.05) + Math.fround(0.05)));

// Exercise actual production mode transitions, including idle menus and a backgrounded battle.
let now = 1000,
  steps = 0;
const visualTime = new ApplicationTime(() => now);
const lifecycle = vm.createContext({
  cancelMenuInput() {},
  visualTime,
  screen: 'menu',
  menuClock: { stop() {}, start() {} },
  clock: { stop() {}, start() {} },
  mapView: null,
  mapPointer: null,
  shopPointer: null,
  scorePointer: null,
  panel: {},
  menu: {},
  pauseButton: {},
  document: { hidden: false, hasFocus: () => true },
  $: () => ({ setAttribute() {} }),
  settings: {},
  audioUnlocked: false,
  backgrounded: false,
  unlockAudio() {},
  resize() {},
  render() {},
  save() {},
  PauseMotion: class {},
  pauseControls: () => [],
  castleControls() {},
  mainControls: [],
  PlayMotion: class {},
  mainMotion: null,
  playMenu() {},
  highScores() {},
  showHelp() {},
  credits() {},
  options() {},
  core: { step: () => steps++ },
  drainSounds() {},
  state() {},
  draw: new Float32Array(10),
  lastAnnouncedSecond: 0,
});
vm.runInContext(
  section('function hidePanels(', 'function playMenu(') +
    section('function startPlay(', 'function drainSounds()') +
    section('function tick()', 'function save()') +
    section('function pause(reason =', 'function optionState()'),
  lifecycle,
);
let expected = 0;
const advance = (count) => {
  for (let i = 0; i < count; i++) expected = Math.fround(expected + Math.fround(1 / 60));
};
now += 2500;
advance(150);
lifecycle.startPlay();
assert.equal(visualTime.read(), expected, 'Static menus accrue time without animation callbacks');
assert.equal(visualTime.mode, 'battle');
lifecycle.tick();
advance(2);
assert.equal(visualTime.read(), expected);
assert.equal(steps, 1, 'Visual double-add must not step physics twice');
lifecycle.pause();
now += 10000;
assert.equal(visualTime.read(), expected, 'Ordinary Pause freezes global visual phase');
visualTime.pause();
now += 10000;
visualTime.pause();
visualTime.resume();
assert.equal(visualTime.read(), expected, 'Touching a paused menu cannot resume its battlefield');
lifecycle.startPlay();
lifecycle.tick();
advance(2);
assert.equal(visualTime.read(), expected, 'No paused/background catch-up');
lifecycle.toMenu();
now += 501;
advance(30);
assert.equal(
  visualTime.read(),
  expected,
  'Battle→menu preserves phase and returns to single speed',
);
visualTime.pause();
now += 60000;
assert.equal(visualTime.read(), expected, 'Background menus do not accrue time');
visualTime.resume();
lifecycle.startPlay();
assert.equal(visualTime.read(), expected, 'A new day does not reset visual time');

// 30/60fps rendering and120Hz displays must all use the same60Hz simulation/visual timeline.
for (const fps of [30, 60]) {
  const time = new ApplicationTime(() => 0);
  time.setMode('battle');
  let callback,
    ticks = 0;
  const clock = new FixedClock(
    () => {
      time.step();
      ticks++;
    },
    () => {},
    (cb) => {
      callback = cb;
      return 1;
    },
    () => {},
  );
  clock.fps = fps;
  clock.start();
  for (let i = 0; i <= 120; i++) callback((i * 1000) / 120);
  let phase = 0;
  for (let i = 0; i < ticks * 2; i++) phase = Math.fround(phase + Math.fround(1 / 60));
  assert.equal(time.read(), phase);
  assert.ok(Math.abs(ticks - 60) <= 1);
}
console.log(
  'Application clock: renderer inputs, mode continuity, pause/background freeze and render-rate independence pass.',
);
