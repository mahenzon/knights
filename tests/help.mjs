import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { helpControls, PlayMotion } from '../build/web/play.mjs';
import { helpAssets } from '../build/web/assets.mjs';
import { buttonScene } from '../build/web/shop.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/ui-fidelity.json')).help;
assert.deepEqual(
  helpControls.map(({ text, rect }) => ({ text, rect })),
  native.controls.map(({ text, rect }) => ({ text, rect })),
);
assert.deepEqual(
  helpAssets,
  native.pages.map((page) => page.draws[0].image),
);
for (const sample of native.buttons) {
  assert.deepEqual(
    buttonScene(helpControls[0], sample.pressed).map(({ alpha = 1, ...draw }) => ({
      ...draw,
      alpha,
    })),
    sample.draws,
  );
}
const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const draws = [];
const context = vm.createContext({
  helpControls,
  helpAssets,
  PlayMotion,
  buttonScene,
  screen: 'menu',
  helpMotion: null,
  helpPage: 0,
  pressedButton: -1,
  document: { hidden: false },
  backgrounded: false,
  assets: new Map(helpAssets.map((name) => [name, {}])),
  imageLoader: { load: async () => {} },
  hidePanels() {},
  image() {},
  $: () => ({ setAttribute() {} }),
  show() {
    assert.fail('Preloaded Help must open without a loader');
  },
  toMenu() {
    context.screen = 'menu';
  },
  castleControls(buttons) {
    context.castleButtons = buttons;
  },
  menuCommands(commands) {
    draws.push(...JSON.parse(JSON.stringify(commands)));
  },
  render() {
    context.renderHelp();
  },
  FixedClock: class {
    running = false;
    constructor(step) {
      this.step = step;
    }
    start() {
      this.running = true;
    }
    stop() {
      this.running = false;
    }
  },
});
vm.runInContext(
  section('const menuClock =', 'function message(') +
    section('async function showHelp()', 'function credits()') +
    `function renderHelp() {
      ${section("  if (screen === 'help') {", "  if (screen === 'scores') {")}
    }`,
  context,
);
await context.showHelp();
const clock = vm.runInContext('menuClock', context);
for (const frame of native.entrance) {
  clock.step();
  draws.length = 0;
  context.renderHelp();
  assert.deepEqual(draws, frame.draws, `Production Help entrance frame ${frame.frame}`);
}
assert.equal(clock.running, false, 'Settled Help must stop its animation timer');
for (let i = 1; i < context.castleButtons.length; i++) {
  context.castleButtons[i].action();
  assert.equal(context.helpPage, i - 1);
  assert.equal(clock.running, false, 'Preloaded page changes do not restart entrance animation');
}
context.castleButtons[0].action();
assert.equal(context.screen, 'menu');

// The first Help tap must not race the background warmup on a fresh launch.
let releaseHelp,
  menuOpened = false,
  loaded = [];
const waiting = new Promise((resolve) => {
  releaseHelp = resolve;
});
const bootContext = vm.createContext({
  URLSearchParams,
  location: { search: '' },
  prepareAudio() {},
  mainAssets: [],
  playAssets: [],
  optionAssets: [],
  helpAssets,
  fetch: async () => ({
    ok: true,
    json: async () => ({ art: {} }),
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => '',
  }),
  WebAssembly: {
    instantiate: async () => ({ instance: { exports: { fix_ballista_gate: () => 1 } } }),
  },
  ImageLoader: class {},
  assets: new Map(),
  decodeImage() {},
  parseFont() {},
  async loadImages(names) {
    loaded = names;
    if (helpAssets.every((name) => names.includes(name))) await waiting;
  },
  resize() {},
  toMenu() {
    menuOpened = true;
  },
  navigator: {},
  setTimeout() {},
  warmMenu() {},
  show(title, error) {
    assert.fail(`${title}: ${error}`);
  },
});
vm.runInContext(section('async function boot()', 'async function loadBattleImages('), bootContext);
const booted = bootContext.boot();
await new Promise(setImmediate);
assert.ok(
  helpAssets.every((name) => loaded.includes(name)),
  'All Help pages must decode during initial loading',
);
assert.equal(menuOpened, false, 'Main menu must wait for Help decoding');
releaseHelp();
await booted;
assert.equal(menuOpened, true);

const startupFailure = new Error('Unexpected WebAssembly instruction at offset 17'),
  diagnostics = [];
let failurePanel,
  reloads = 0;
Object.assign(bootContext, {
  fetch: async () => {
    throw startupFailure;
  },
  console: { error: (...args) => diagnostics.push(args) },
  show: (...args) => {
    failurePanel = args;
  },
});
bootContext.location.reload = () => reloads++;
await bootContext.boot();
assert.equal(diagnostics[0][1], startupFailure, 'Keep the original error available for diagnosis');
assert.ok(
  !failurePanel[1].includes(startupFailure.message),
  'Do not show engine errors to players',
);
failurePanel[2].find(([label]) => label === 'Try again')[1]();
assert.equal(reloads, 1, 'Startup failures still offer a working retry');
console.log(
  'Help: five preloaded pages/tabs, Exit appearance and20 original entrance frames match; startup retry works.',
);
