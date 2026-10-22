import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mainControls, mainAssets, mainScene, PlayMotion, tellFriend } from '../build/web/play.mjs';

const native = JSON.parse(fs.readFileSync('tests/fixtures/main-menu.json'));
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
assert.deepEqual(
  mainControls.map(({ rect, text, normal = null, pressed }) => ({ rect, text, normal, pressed })),
  native.controls.map(({ rect, text, normal, pressed }) => ({ rect, text, normal, pressed })),
);
for (const asset of mainAssets) assert.equal(data.art[asset][0], 'menu');
const visible = (commands) =>
  JSON.parse(JSON.stringify(commands))
    .filter((c) => c.image !== '0x0' && !(c.op === 'text' && c.text === ''))
    .map(({ frame: _frame, radians: _radians, ...c }) => c);
const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
function fixture() {
  const menu = {
    style: {},
    children: [],
    setAttribute() {},
    replaceChildren() {
      this.children = [];
    },
    append(child) {
      this.children.push(child);
    },
    hasPointerCapture: () => false,
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const calls = [],
    sounds = [],
    draws = [],
    shares = [];
  const context = vm.createContext({
    cancelMenuInput() {},
    mainControls,
    mainScene,
    mainAssets,
    PlayMotion,
    tellFriend,
    mainMotion: null,
    screen: 'menu',
    settings: {},
    castleButtons: [],
    pressedButton: -1,
    data,
    menu,
    pauseButton: {},
    audioUnlocked: false,
    backgrounded: false,
    clock: { stop() {} },
    hidePanels() {
      menu.hidden = true;
    },
    prepareAudio() {},
    location: { href: 'https://example.test/knights/index.html?mute=1&dev=1#debug' },
    navigator: {
      async share(data) {
        shares.push(data);
      },
    },
    playMenu() {
      calls.push('0x20324');
      sounds.push('menu_buble_open.wav');
    },
    highScores() {
      calls.push('0x1d80c');
    },
    options() {
      calls.push('0x1d7e4');
    },
    showHelp() {
      calls.push('0x1d820');
    },
    credits() {
      calls.push('0x1d7f8');
    },
    sound(name) {
      sounds.push(name);
    },
    menuCommands(commands) {
      draws.push(...commands);
    },
    render() {
      context.renderMain();
    },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 320 }) },
    document: {
      hidden: false,
      createElement: () => ({ style: {}, setAttribute() {} }),
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
      section('function toMenu()', 'function playMenu(') +
      section('function castleControls(', 'async function newDay(') +
      `function renderMain() { ${section("  if (screen === 'menu') {\n    menuCommands", "  if (screen === 'credits') {\n    menuCommands")} }`,
    context,
  );
  context.toMenu();
  const clock = vm.runInContext('menuClock', context);
  function event(point, pointerId = 7) {
    return {
      clientX: point[0],
      clientY: point[1],
      pointerId,
      button: 0,
      detail: 1,
      preventDefault() {},
    };
  }
  function input(kind, point) {
    menu[`onpointer${kind}`](event(point));
  }
  function output() {
    draws.length = 0;
    context.renderMain();
    return visible(draws);
  }
  return { context, menu, clock, calls, sounds, shares, event, input, output };
}
const f = fixture();
assert.equal(f.menu.children.length, 6);
assert.equal(f.menu.hidden, false);
for (const frame of native.entrance) {
  f.clock.step();
  assert.deepEqual(f.output(), visible(frame.draws), `native main entrance frame ${frame.frame}`);
}
assert.equal(f.clock.running, false, 'Main menu must stop scheduling once entrance settles');
for (const sample of native.pressed) {
  f.input('down', sample.down.point);
  assert.equal(f.context.pressedButton, sample.index);
  assert.deepEqual(f.output(), visible(sample.drawing.draws));
  f.input('up', sample.up.point);
  if (sample.index === 0)
    assert.equal(f.shares.length, 1, 'Share must open synchronously during the button gesture');
  f.menu.children[sample.index].onclick(f.event(sample.up.point));
  assert.equal(f.context.pressedButton, -1);
}
assert.deepEqual(f.sounds, [
  'menu_click_button.wav',
  'menu_click_button.wav',
  'menu_buble_open.wav',
  ...Array(4).fill('menu_click_button.wav'),
]);
assert.deepEqual(
  f.calls,
  native.controls.slice(1).map((b) => b.callback),
);
assert.deepEqual(f.shares, [{ title: 'Knights Onrush', url: 'https://example.test/knights/' }]);
assert.equal(f.context.location.href, 'https://example.test/knights/index.html?mute=1&dev=1#debug');
// Native boundaries and retargeting operate on the release point; real browser sequences start with Down.
for (const sample of native.boundaries) {
  const b = fixture();
  b.context.castleButtons.forEach((button, i) => {
    button.action = () => b.calls.push(native.controls[i].callback);
  });
  b.input('down', sample.point);
  b.input('up', sample.point);
  assert.deepEqual(b.calls, sample.callbacks, `boundary ${sample.index}: ${sample.point}`);
}
for (const sample of native.gestures) {
  const g = fixture();
  g.context.castleButtons.forEach((button, i) => {
    button.action = () => g.calls.push(native.controls[i].callback);
  });
  if (sample.steps[0].kind === 'up') g.input('down', sample.steps[0].point);
  for (const step of sample.steps) {
    g.calls.length = 0;
    g.input(step.kind, step.point);
    assert.deepEqual(g.calls, step.callbacks, sample.case);
    assert.equal(
      g.context.pressedButton,
      step.state.buttons.findIndex((b) => b.pressed),
    );
  }
}
for (const cancel of ['cancel', 'lostpointercapture']) {
  const c = fixture();
  c.input('down', [380, 41]);
  c.menu[cancel === 'cancel' ? 'onpointercancel' : 'onlostpointercapture'](c.event([380, 41]));
  c.input('up', [380, 41]);
  assert.deepEqual(c.calls, []);
  assert.equal(c.context.pressedButton, -1);
  c.menu.children[1].onclick({ detail: 0 });
  assert.deepEqual(c.calls, ['0x20324'], 'Keyboard and assistive activation stays available');
}
const otherPointer = fixture();
otherPointer.input('down', [380, 41]);
otherPointer.menu.onpointerup(otherPointer.event([385, 101], 8));
assert.deepEqual(otherPointer.calls, []);
otherPointer.input('up', [380, 41]);
assert.deepEqual(otherPointer.calls, ['0x20324']);
f.context.toMenu();
assert.equal(f.context.mainMotion.buttonScale, 0);
f.clock.step();
assert.deepEqual(f.output(), visible(native.play_back_transition.main.draw.draws));
f.context.document.hidden = true;
f.clock.step();
assert.equal(f.clock.running, false);
console.log(
  'Main menu: 25 native entrance frames, six pressed states, 36 boundaries, five gestures, reentry and synchronous share activation pass.',
);
