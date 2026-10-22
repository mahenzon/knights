import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ShopScroll, shopLayout, shopHit } from '../build/web/shop.mjs';
import { ScoreScroll } from '../build/web/scores.mjs';
import { MapMotion } from '../build/web/map.mjs';
import { optionInput } from '../build/web/options.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native = JSON.parse(fs.readFileSync('tests/fixtures/compound-menu-input.json'));
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const pointer = ([clientX, clientY], pointerId = 1) => ({
  clientX,
  clientY,
  pointerId,
  preventDefault() {},
});
function fixture(sample) {
  const overlay = {
    children: [],
    setAttribute() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
    replaceChildren() {
      this.children = [];
    },
    append(child) {
      this.children.push(child);
    },
  };
  const state = sample.initial;
  let options = {
    difficulty: state.difficulty,
    reverse: state.reverse,
    muted: state.muted,
    volume: state.volume,
  };
  const actions = [],
    created = [];
  const motion = new MapMotion(data.levels);
  if (sample.mode === 'map') {
    motion.camera = [...state.camera];
    motion.panel = state.panel;
    motion.panelOpen = state.panel_open;
    motion.select(state.selected);
  }
  const scroll = new ShopScroll(state.width ?? 0);
  Object.assign(scroll, {
    offset: state.offset,
    frameOffset: state.offset,
    velocity: state.velocity,
    dragging: state.dragging,
  });
  const scores = new ScoreScroll();
  const context = vm.createContext({
    data,
    shopLayout,
    shopHit,
    optionInput,
    run: {
      phase: 'shop',
      gold: 100000,
      sacrifices: 1000,
      inventory: Array(13).fill(-1),
      config: { disabledShopCategories: [] },
    },
    screen: sample.mode,
    purchase: state.dialogs.length ? {} : null,
    optionDialog: state.dialogs.length ? 'cheat' : null,
    optionState: () => options,
    updateOptions(next) {
      options = next;
    },
    cancelMenuInput() {},
    castleButtons: [],
    pressedButton: -1,
    mapPointer: null,
    mapView: { motion, selected: state.selected },
    updateMap() {
      context.castleControls(context.castleButtons);
    },
    shopScroll: scroll,
    scoreScroll: scores,
    settings: {},
    menuClock: { start() {} },
    render() {},
    sound() {},
    $: () => overlay,
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 320 }) },
    document: { createElement: () => ({ style: {}, setAttribute() {}, append() {} }) },
  });
  vm.runInContext(
    section('function castleControls(', 'async function newDay(') +
      section('function applyOptionPoint(', 'function options()'),
    context,
  );
  Object.assign(context, {
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
    document: { ...context.document, hidden: false },
    backgrounded: false,
    visualTime: { read: () => 0 },
    purchaseMotion: { step() {}, active: false },
    optionMotion: { step() {}, active: false },
    mapHintMotion: { step() {}, active: false },
  });
  vm.runInContext(section('const menuClock =', 'function message('), context);
  context.menuClock = vm.runInContext('menuClock', context);
  if (sample.mode === 'shop') {
    Object.assign(context, {
      ctx: { clearRect() {} },
      menuCommands() {},
      buttonScene: () => [],
      purchaseScene: () => [],
      shopScene(_data, _run, offset) {
        context.drawnOffset = offset;
        return [];
      },
    });
    vm.runInContext(
      `function render() { ${section("  if (screen === 'result' || screen === 'shop') {", "  if (screen === 'loading') {")} }`,
      context,
    );
  }
  function controls(buttons) {
    return buttons
      .filter((b) => b.active && !b.disabled)
      .map((b) => {
        const [top, left, bottom, right] = b.rect;
        return {
          text: b.text,
          rect: [left, top, right - left, bottom - top],
          action: () => actions.push(b.callback),
        };
      });
  }
  const dialogButtons = [
    { text: 'NO', rect: [125, 160, 115, 61], action: () => actions.push('0x358b8') },
    { text: 'YES', rect: [252, 160, 115, 61], action: () => actions.push('0x358d0') },
  ];
  context.confirmPurchase = (item) => {
    created.push({ kind: 0, text: item.description });
    context.purchase = item;
    context.castleControls(dialogButtons);
  };
  if (state.dialogs.length && sample.mode === 'map') context.screen = 'map-hint';
  context.castleControls(controls(state.dialogs.length ? state.dialogs[0].buttons : state.buttons));
  return { context, overlay, motion, scroll, scores, actions, created, options: () => options };
}

let events = 0;
for (const sample of native.cases) {
  // These native callbacks execute real dialog constructors, covered by the production screen tests.
  if (sample.case === 'info_opens_one_dialog' || sample.case === 'cheat_opens_one_dialog') continue;
  const f = fixture(sample);
  let hasDown = false;
  for (const event of sample.events) {
    const label = `${sample.mode}/${sample.case}/${events++}`;
    f.actions.length = 0;
    f.created.length = 0;
    f.overlay[`onpointer${event.kind}`](pointer(event.point));
    const bareUp = event.kind === 'up' && !hasDown;
    if (event.kind === 'down') hasDown = true;
    if (event.kind === 'up') hasDown = false;
    const swipeToExit =
      sample.mode === 'shop' && ['strip_to_exit', 'long_strip_to_exit'].includes(sample.case);
    // User-requested mobile adaptation: EXIT requires Down on EXIT, unlike the native game.
    assert.deepEqual(f.actions, bareUp || swipeToExit ? [] : event.actions, `${label}: callbacks`);
    if (sample.mode === 'shop')
      assert.deepEqual(f.created, event.created, `${label}: confirmation creation`);
    const buttons =
      (sample.mode === 'shop' || sample.initial.dialogs.length) && event.after_input.dialogs.length
        ? event.after_input.dialogs[0].buttons
        : event.after_input.buttons;
    if (!bareUp)
      assert.deepEqual(
        Array.from(f.context.castleButtons, (b) => b.highlighted),
        buttons.filter((b) => b.active && !b.disabled).map((b) => b.pressed),
        `${label}: all overlapping highlights`,
      );
    for (const [phase, state] of [
      ['input', event.after_input],
      ['draw', event.after_draw],
    ]) {
      if (!state) continue;
      if (phase === 'draw') {
        f.context.menuClock.step();
        f.context.render();
        if (sample.mode === 'map') {
          for (const b of f.context.castleButtons)
            b.rect[1] = Math.trunc(Math.fround(270 + f.motion.panel));
        }
      }
      if (sample.mode === 'options') {
        const { difficulty, reverse, muted, volume } = state;
        assert.deepEqual(
          { ...f.options() },
          { difficulty, reverse, muted, volume },
          `${label}/${phase}`,
        );
      } else if (sample.mode === 'shop') {
        const { offset, velocity, dragging, displacement } = state;
        assert.deepEqual(
          [f.scroll.offset, f.scroll.velocity, f.scroll.dragging, f.scroll.travel],
          [offset, velocity, dragging, displacement],
          `${label}/${phase}: shop state`,
        );
        const medium = shopLayout(data, f.context.run).items.find((r) => r.index === 101);
        assert.equal(
          Math.trunc(f.scroll.frameOffset) + medium.left + medium.x,
          state.medium_center,
          `${label}/${phase}: last drawn item center`,
        );
        if (phase === 'draw')
          assert.equal(
            f.context.drawnOffset,
            f.scroll.frameOffset,
            'Production renderer uses the last layout offset',
          );
      } else if (sample.mode === 'scores') {
        assert.deepEqual(
          [f.scores.offset, f.scores.velocity, f.scores.dragging],
          [state.offset[1], state.velocity, state.dragging],
          `${label}/${phase}: score scroll`,
        );
      } else {
        assert.deepEqual(f.motion.camera, state.camera, `${label}/${phase}: map camera`);
        assert.equal(f.motion.selected, state.selected, `${label}/${phase}: selected castle`);
        assert.equal(f.motion.panelOpen, state.panel_open, `${label}/${phase}: map panel`);
        assert.equal(f.motion.panel, state.panel, `${label}/${phase}: moving panel`);
      }
    }
  }
}
console.log(`Compound input: ${events} original events replayed through production handlers.`);
for (const mode of ['shop', 'scores', 'map', 'options']) {
  for (const lifecycle of ['visibilitychange', 'pagehide', 'blur']) {
    const sample = native.cases.find((s) => s.mode === mode);
    const f = fixture(sample),
      listeners = {};
    Object.assign(f.context, {
      document: {
        ...f.context.document,
        hidden: true,
        addEventListener(name, fn) {
          listeners[name] = fn;
        },
      },
      window: {
        addEventListener(name, fn) {
          listeners[name] = fn;
        },
      },
      backgrounded: false,
      pause() {},
      stopAudio() {},
      save() {},
    });
    f.context.menuClock.stop = () => {};
    vm.runInContext(
      section("document.addEventListener('visibilitychange'", 'function resize()'),
      f.context,
    );
    const point = sample.events.at(-1).point;
    f.overlay.onpointerdown(pointer(point));
    f.overlay.onpointercancel(pointer(point, 2));
    assert.ok(f.context.pressedButton >= 0, 'A different finger cannot cancel this press');
    listeners[lifecycle]();
    f.overlay.onpointerup(pointer(point));
    assert.deepEqual(f.actions, [], `${mode}/${lifecycle}: stale release cannot act`);
    assert.equal(f.context.pressedButton, -1);
    assert.equal(f.scroll.dragging, false);
    assert.equal(f.scores.dragging, false);
    assert.equal(f.motion.pointer, null);
    f.overlay.onpointerdown(pointer(point));
    f.overlay.onpointerup(pointer(point));
    assert.deepEqual(
      f.actions,
      sample.events.at(-1).actions,
      `${mode}/${lifecycle}: fresh press recovers`,
    );
  }
}
console.log(
  'Compound input: background, pagehide and blur cancel all four menu gestures; fresh input recovers.',
);
const idle = fixture(native.cases.find((s) => s.case === 'dialog_shop_movement'));
idle.overlay.onpointerdown(pointer([240, 100]));
idle.overlay.onpointermove(pointer([140, 100]));
idle.overlay.onpointerup(pointer([140, 100]));
for (let frame = 0; frame < 300; frame++) idle.context.menuClock.step();
assert.equal(idle.scroll.dragging, true, 'Preserve native consumed-Up state beneath a dialog');
assert.equal(idle.context.menuClock.running, false, 'Settled dialog must stop requesting frames');
idle.overlay.onpointerdown(pointer([240, 100]));
idle.overlay.onpointermove(pointer([140, 100]));
assert.equal(idle.context.menuClock.running, true, 'Moving again wakes shop animation');
