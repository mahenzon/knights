import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const code = source.slice(
  source.indexOf('function fullscreenChanged()'),
  source.indexOf('function point('),
);
for (const [platform, userAgent, maxTouchPoints, native] of [
  [
    'MacIntel',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/16.6 Safari/605.1.15',
    5,
    false,
  ],
  ['iPad', 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)', 5, false],
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)', 5, false],
  ['MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0, true],
  ['Linux aarch64', 'Mozilla/5.0 (Linux; Android 14)', 5, true],
  ['Win32', 'Mozilla/5.0 (Windows NT 10.0)', 10, true],
]) {
  let requests = 0;
  const classes = new Set(),
    listeners = new Map();
  const stage = {
    addEventListener: (type, callback, options) => listeners.set(type, { callback, options }),
  };
  const button = { setAttribute() {} };
  const root = {
    classList: {
      contains: (name) => classes.has(name),
      toggle(name) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
    },
    async requestFullscreen() {
      requests++;
      document.fullscreenElement = root;
    },
  };
  const document = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: root,
    addEventListener() {},
    async exitFullscreen() {
      document.fullscreenElement = null;
    },
  };
  const context = vm.createContext({
    navigator: { platform, userAgent, maxTouchPoints },
    document,
    fullscreenButton: button,
    $: () => stage,
    resize() {},
    screen: 'menu',
    pause() {},
    show() {},
    startPlay() {},
    message(text) {
      assert.fail(text);
    },
  });
  vm.runInContext(code, context);
  await button.onclick();
  assert.equal(
    requests,
    Number(native),
    `${platform}/${maxTouchPoints}: avoid Apple's swipe-dismiss controller`,
  );
  assert.equal(classes.has('immersive'), !native);
  await button.onclick();
  assert.equal(document.fullscreenElement, null);
  assert.equal(classes.has('immersive'), false, 'Expanded view can be exited');
  for (const type of ['touchmove', 'dragstart']) {
    const handler = listeners.get(type);
    assert.ok(handler, `${type} must be guarded on the playfield`);
    if (type === 'touchmove') assert.equal(handler.options.passive, false);
    for (const [cancelable, editable, expected] of [
      [true, false, true],
      [false, false, false],
      [true, true, false],
    ]) {
      let prevented = false;
      handler.callback({
        cancelable,
        target: { closest: () => editable },
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, expected, `${type}: preserve editable/scrollable controls`);
    }
  }
}
const resizeCode = source.slice(
  source.indexOf('function resize()'),
  source.indexOf("window.addEventListener('resize'"),
);
for (const [search, power, width] of [
  ['', false, 960],
  ['?perf=1', false, 960],
  ['?perfScale=1', false, 960],
  ['?perf=1&perfScale=1', false, 480],
  ['?perf=1&perfScale=2', false, 960],
  ['', true, 480],
]) {
  const canvas = { getBoundingClientRect: () => ({ width: 1200 }) },
    settings = { power },
    transforms = [];
  const context = vm.createContext({
    canvas,
    settings,
    URLSearchParams,
    location: { search },
    ctx: { setTransform: (...values) => transforms.push(values) },
    render() {},
  });
  vm.runInContext(resizeCode, context);
  context.resize();
  assert.equal(canvas.width, width, search);
  assert.equal(canvas.height, (width * 2) / 3);
  assert.equal(
    settings.power,
    power,
    'Resolution probe does not change battery/frame-rate setting',
  );
  assert.deepEqual(transforms[0], [width / 480, 0, 0, width / 480, 0, 0]);
}
console.log(
  'Viewport: Apple touch uses page expansion; desktop/Android retain fullscreen; playfield guards preserve forms.',
);
