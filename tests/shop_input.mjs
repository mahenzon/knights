import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buy, prepareDay, createRun, canBuy } from '../build/web/campaign.mjs';
import { shopLayout, shopHit, ShopScroll, PurchaseMotion } from '../build/web/shop.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native = JSON.parse(fs.readFileSync('tests/fixtures/ui-fidelity.json'));
for (const sample of native.purchases) {
  const item = data.shop.items.find((i) => i.index === sample.item);
  const inventory = Array(13).fill(-1);
  if (sample.scenario === 'owned') inventory[item.inventoryIndex] = item.upgradeIndex;
  assert.equal(
    canBuy(
      data,
      {
        phase: 'shop',
        inventory,
        config: { disabledShopCategories: [] },
        gold: sample.scenario === 'no_gold' ? 0 : 100000,
        sacrifices: sample.scenario === 'no_sacrifices' ? 0 : 1000,
      },
      item.index,
    ),
    sample.dialogs.length > 0,
  );
}

function fixture() {
  const overlay = {
    style: {},
    hasPointerCapture: () => false,
    setPointerCapture() {},
    releasePointerCapture() {},
    children: [],
    setAttribute() {},
    replaceChildren() {
      this.children = [];
    },
    append(child) {
      this.children.push(child);
    },
  };
  const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  run.phase = 'shop';
  run.gold = 100000;
  run.sacrifices = 1000;
  const context = vm.createContext({
    cancelMenuInput() {},
    applyOptionPoint() {},
    optionDialog: null,
    mapPointer: null,
    mapView: { selected: 0, motion: { down() {}, move() {}, up() {}, selected: 0 } },
    updateMap() {},
    scoreScroll: { down() {}, move() {}, up() {} },
    data,
    run,
    menu: overlay,
    buy,
    prepareDay,
    shopLayout,
    shopHit,
    ShopScroll,
    PurchaseMotion,
    shopScroll: new ShopScroll(shopLayout(data, run).width),
    purchase: null,
    purchaseMotion: null,
    castleButtons: [],
    pressedButton: -1,
    screen: 'shop',
    settings: {},
    menuClock: { start() {}, stop() {} },
    imageLoader: { async load() {} },
    shopAssets: () => [],
    prepareAudio() {},
    warmBattle() {},
    save() {},
    sound() {},
    render() {},
    resultScreen() {},
    hidePanels() {
      context.cancelMenuInput();
    },
    $: () => overlay,
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 320 }) },
    document: {
      createElement: () => ({
        style: {},
        children: [],
        setAttribute() {},
        append(child) {
          this.children.push(child);
        },
        getBoundingClientRect() {
          const values = [...this.style.cssText.matchAll(/:([\d.]+)%/g)].map((m) => Number(m[1]));
          const [x, y, w, h] = values;
          return { left: x * 4.8, top: y * 3.2, right: (x + w) * 4.8, bottom: (y + h) * 3.2 };
        },
        setPointerCapture() {},
        releasePointerCapture() {},
      }),
    },
  });
  vm.runInContext(
    source.slice(source.indexOf('async function shop()'), source.indexOf('async function newDay(')),
    context,
  );
  return { context, overlay };
}
const pointer = (x, y, id = 1) => ({
  clientX: x,
  clientY: y,
  pointerId: id,
  detail: 1,
  preventDefault() {
    this.defaultPrevented = true;
  },
});
const click = (overlay, b, event) => {
  overlay.onpointerdown(event);
  overlay.onpointerup(event);
  b.onclick(event);
};
for (const gesture of ['swipe', 'release-only', 'cancel', 'leave', 'tap', 'keyboard']) {
  const f = fixture();
  let exits = 0;
  f.context.resultScreen = () => exits++;
  await f.context.shop();
  const exit = f.overlay.children.find((b) => b.textContent === 'EXIT');
  const end = pointer(400, 285);
  if (gesture === 'keyboard') exit.onclick({ detail: 0 });
  else {
    f.overlay.onpointerdown(gesture === 'swipe' ? pointer(160, 180) : end);
    if (gesture === 'swipe') f.overlay.onpointermove(end);
    if (gesture === 'cancel') f.overlay.onpointercancel(end);
    if (gesture === 'release-only') {
      f.overlay.onpointercancel(end);
      f.overlay.onpointerdown(pointer(400, 230));
    }
    f.overlay.onpointerup(gesture === 'leave' ? pointer(240, 180) : end);
    exit.onclick(end);
  }
  assert.equal(exits, ['tap', 'keyboard'].includes(gesture) ? 1 : 0, `Shop EXIT: ${gesture}`);
}
// Replay the production button handlers for desktop and both mobile event orderings.
for (const screen of [
  'menu',
  'options',
  'credits',
  'play',
  'paused',
  'result',
  'help',
  'map',
  'continue',
  'shop',
]) {
  for (const leaveAfterUp of [false, true]) {
    const f = fixture();
    f.context.screen = screen;
    f.context.purchase = {};
    let activated = 0;
    f.context.castleControls([
      { text: 'Done', rect: [25, 265, 100, 48], action: () => activated++ },
    ]);
    const b = f.overlay.children.find((b) => b.textContent === 'Done');
    const e = { ...pointer(50, 280, 9), pointerType: leaveAfterUp ? 'touch' : 'mouse' };
    const tap = () => {
      f.overlay.onpointerdown(e);
      f.overlay.onpointerup(e);
      if (leaveAfterUp) b.onpointerleave?.(e);
      b.onclick(e);
    };
    tap();
    assert.equal(activated, 1, `${screen}: touch release → leave → click must activate the button`);
    b.onclick(e);
    assert.equal(activated, 1, 'one press cannot activate twice');
    f.overlay.onpointerdown(e);
    b.onpointerleave?.(e);
    f.overlay.onpointerup(pointer(450, 50, 9));
    b.onclick(e);
    assert.equal(activated, 1, 'a drag out cannot activate');
    tap();
    assert.equal(activated, 2, 'a drag out cannot leave the button stuck');
    f.overlay.onpointerdown(e);
    f.overlay.onpointerup(pointer(450, 50, 9));
    b.onclick(e);
    assert.equal(activated, 2, 'implicit capture cannot activate outside the button');
    f.overlay.onpointerdown(e);
    f.overlay.onpointerup(pointer(50, 280, 10));
    b.onclick(pointer(50, 280, 10));
    assert.equal(activated, 2, 'another finger cannot complete the press');
    f.overlay.onpointercancel(e);
    b.onpointerleave?.(e);
    b.onclick(e);
    assert.equal(activated, 2, 'cancelled touch cannot activate');
    tap();
    assert.equal(activated, 3, 'a cancelled touch cannot leave the button stuck');
    b.onclick({ detail: 0 });
    assert.equal(activated, 4, 'keyboard/accessibility activation still works');
  }
  const crossed = fixture();
  crossed.context.screen = screen;
  crossed.context.purchase = {};
  const actions = [];
  crossed.context.castleControls([
    { text: 'NO', rect: [125, 160, 115, 61], action: () => actions.push('NO') },
    { text: 'YES', rect: [252, 160, 115, 61], action: () => actions.push('YES') },
  ]);
  crossed.overlay.onpointerdown(pointer(180, 185));
  assert.equal(crossed.context.pressedButton, 0);
  crossed.overlay.onpointermove(pointer(300, 185));
  assert.equal(crossed.context.pressedButton, 1);
  crossed.overlay.onpointerup(pointer(300, 185));
  crossed.overlay.children[1].onclick(pointer(300, 185));
  assert.deepEqual(actions, ['YES'], `${screen}: release-point retargeting acts once`);
  crossed.overlay.onpointerdown(pointer(100, 100));
  crossed.overlay.onpointerup(pointer(180, 185));
  assert.deepEqual(actions, ['YES', 'NO'], `${screen}: control routing uses release position`);
  for (const event of [{ ...pointer(180, 185), target: { closest: () => ({}) } }]) {
    crossed.overlay.onpointerdown(event);
    crossed.overlay.onpointerup(event);
  }
  assert.deepEqual(actions, ['YES', 'NO'], 'Text fields keep ownership');
  const previous = crossed.overlay.onpointerup;
  crossed.overlay.onpointerdown(pointer(300, 185));
  crossed.context.castleControls([
    { text: 'New dialog', rect: [252, 160, 115, 61], action: () => actions.push('NEW') },
  ]);
  previous(pointer(300, 185));
  crossed.overlay.onpointerup(pointer(300, 185));
  crossed.overlay.children[0].onclick(pointer(300, 185));
  assert.deepEqual(
    actions,
    ['YES', 'NO'],
    'A replacement control generation requires a fresh Down',
  );
}
const f = fixture();
await f.context.shop();
const button = (text) => f.overlay.children.find((b) => b.textContent === text);
function choose(index, x = 300) {
  const c = f.context;
  const record = shopLayout(data, c.run).items.find((r) => r.index === index);
  c.shopScroll.offset = x - record.left - record.x;
  c.shopScroll.frameOffset = c.shopScroll.offset;
  c.shopScroll.velocity = 0;
  const strip = f.overlay.children[0],
    event = pointer(x, 180);
  f.overlay.onpointerdown(event);
  f.overlay.onpointerup(event);
  // A compatibility click can be retargeted after pointerup replaces the shop DOM.
  const target = button(x > 250 ? 'YES' : 'NO') ?? strip;
  target.onclick?.(event);
}

choose(101);
assert.equal(f.context.run.inventory[10], -1, 'opening a dialog must not confirm the same touch');
assert.equal(f.context.run.gold, 100000, 'selection must not charge gold');
assert.equal(f.context.purchase?.index, 101, 'dialog remains open for a fresh answer');
click(f.overlay, button('NO'), pointer(180, 185, 2));
assert.equal(f.context.purchase, null);
choose(101, 180);
assert.equal(f.context.purchase?.index, 101, 'opening touch cannot dismiss the new NO button');
click(f.overlay, button('YES'), pointer(300, 185, 3));
assert.equal(f.context.run.inventory[10], 1);
const afterMedium = f.context.run.gold;
for (const index of [100, 101, 103, 102]) {
  f.context.run = prepareDay(data, f.context.run);
  f.context.run.phase = 'shop';
  await f.context.shop();
  const previous = structuredClone(f.context.run);
  choose(index);
  assert.equal(f.context.purchase?.index, index, 'next-day replacement still asks');
  assert.deepEqual(f.context.run, previous, 'selection does not change inventory or currency');
  click(f.overlay, button('YES'), pointer(300, 185, 4));
  const item = data.shop.items.find((i) => i.index === index);
  assert.equal(f.context.run.inventory[10], item.upgradeIndex);
  assert.equal(f.context.run.gold, previous.gold - item.goldCost);
  assert.equal(f.context.run.sacrifices, previous.sacrifices - item.sacrificeCost);
}
assert.ok(f.context.run.gold < afterMedium);
const strip = f.overlay.children[0];
f.overlay.onpointerdown(pointer(300, 180));
f.overlay.onpointermove(pointer(100, 180));
f.overlay.onpointerup(pointer(100, 180));
strip.onclick?.(pointer(100, 180));
assert.equal(f.context.purchase, null, 'swiping cannot open or confirm a purchase');
f.overlay.onpointerdown(pointer(300, 180));
f.overlay.onpointercancel(pointer(200, 180, 2));
assert.equal(f.context.shopScroll.dragging, true, 'another finger cannot cancel the active drag');
f.overlay.onlostpointercapture(pointer(300, 180));
assert.equal(f.context.pressedButton, -1, 'interrupted drag releases the shop for the next tap');
assert.equal(f.context.shopScroll.dragging, false);
choose(102);
assert.equal(f.context.purchase, null, 'owned item is inert');
f.context.run.gold = 0;
choose(101);
assert.equal(f.context.purchase, null, 'unaffordable item is inert');
f.context.run.gold = 100000;
choose(101);
const yes = button('YES');
f.overlay.onpointerdown(pointer(300, 185));
f.overlay.onpointercancel(pointer(300, 185));
yes.onclick(pointer(300, 185));
assert.equal(f.context.purchase?.index, 101, 'cancelled touch cannot confirm');
yes.onclick({ detail: 0 });
assert.equal(f.context.purchase, null, 'keyboard/accessibility can confirm');
const crossArea = fixture();
let exits = 0;
crossArea.context.resultScreen = () => exits++;
await crossArea.context.shop();
// Real bubbling order: the strip sees an event first, followed by the shared overlay.
for (const [kind, x, y] of [
  ['down', 300, 180],
  ['move', 400, 280],
  ['up', 400, 280],
]) {
  const event = pointer(x, y);
  crossArea.overlay.children[0][`onpointer${kind}`]?.(event);
  crossArea.overlay[`onpointer${kind}`](event);
}
assert.equal(exits, 0, 'Requested touch adaptation: scrolling into EXIT keeps the shop open');
console.log(
  'Menu input: desktop/touch/cancel/retry across 10 panels; 92 native shop cases, retargeted clicks and next-day purchases verified.',
);
