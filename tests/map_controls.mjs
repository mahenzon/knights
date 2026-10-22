import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as map from '../build/web/map.mjs';
import { PurchaseMotion, buttonScene } from '../build/web/shop.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const elements = new Map(),
  listeners = new Map(),
  stored = new Map();
function element() {
  return {
    style: {},
    hasPointerCapture: () => false,
    setPointerCapture() {},
    releasePointerCapture() {},
    children: [],
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    append(child) {
      this.children.push(child);
    },
    addEventListener(name, callback) {
      this[name] = callback;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 480, height: 320 };
    },
  };
}
const $ = (id) => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};
const context = vm.createContext({
  ...map,
  cancelMenuInput() {},
  data,
  $,
  PurchaseMotion,
  buttonScene,
  settings: {},
  dev: false,
  mapView: null,
  mapPointer: null,
  mapHintMotion: null,
  mapDialogText: '',
  screen: 'menu',
  castleButtons: [],
  pressedButton: -1,
  currentDifficulty: 'normal',
  menuClock: { start() {}, stop() {} },
  mapAssets: [],
  loadImages: async () => {},
  readCastleRecords: map.readCastleRecords,
  localStorage: { getItem: (k) => stored.get(k) ?? null },
  storageSet(k, v) {
    stored.set(k, v);
    return true;
  },
  document: {
    createElement: element,
    addEventListener(name, fn) {
      const list = listeners.get(name) ?? [];
      list.push(fn);
      listeners.set(name, list);
    },
  },
  canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 320 }) },
  ctx: { fillRect() {} },
  sceneImage() {},
  menuCommands() {},
  sound() {},
  render() {},
  show() {},
  toMenu() {
    context.screen = 'menu';
  },
  playMenu() {},
  beginRun(mode, level) {
    context.launched = { mode, level };
  },
  hidePanels() {
    context.menuClock.stop();
  },
});
vm.runInContext(
  section('function castleControls(', 'async function newDay(') +
    section('async function castleMenu(', 'function beginRun(') +
    section('function renderMap()', 'function renderObject('),
  context,
);
await context.castleMenu();
assert.equal(context.screen, 'map');
const controls = $('#castle-ui').children;
for (let frame = 1; frame <= 60; frame++) {
  context.mapView.motion.step(frame / 60);
  context.renderMap();
  assert.ok(
    context.castleButtons.every(
      (button, i) => button.rect[1] / 3.2 === Number.parseFloat(controls[i].style.top),
    ),
    'Moving map button hit rectangles follow their rendered positions',
  );
}
assert.equal(
  $('#castle-ui').children,
  controls,
  'Animating must not replace a button between pointerdown and click',
);
assert.ok(
  controls.every((b) => b.style.top === '84.375%'),
  'All original map buttons settle at y270, including Info',
);
context.castleButtons.find((b) => b.label === 'Castle hint').action();
assert.equal(context.screen, 'map-hint');
assert.equal(context.mapDialogText, data.levels[0].hint);
context.castleButtons[0].action();
assert.equal(context.screen, 'map');
const event = { clientX: 407, clientY: 179, pointerId: 1, preventDefault() {} };
$('#castle-ui').onpointerdown(event);
assert.equal(context.mapView.selected, 2);
assert.ok(!context.castleButtons.some((b) => b.text === 'Play'), 'Locked selection cannot launch');
$('#castle-ui').onpointerup(event);
$('#map-points').children[0].onclick({ detail: 0 });
context.castleButtons.find((b) => b.text === 'Play').action();
assert.deepEqual({ ...context.launched }, { mode: 'campaign', level: 0 });
const completed = Object.fromEntries(data.levels.map((_, i) => [`normal:${i}`, true]));
stored.set('knights-completed', JSON.stringify(completed));
await context.castleMenu({ level: 11, won: true });
assert.equal(context.screen, 'map-hint');
assert.equal(context.mapDialogText, map.campaignCompleteText);
context.castleButtons[0].action();
assert.equal(context.screen, 'map');
await context.castleMenu({ level: 11, won: true });
assert.equal(context.screen, 'map', 'The original congratulations latch prevents repeat dialogs');
// A slow drag outlasts the panel/marker animations; the camera must keep publishing frames.
const dragEvent = (x, y) => ({
  clientX: x,
  clientY: y,
  pointerId: 2,
  preventDefault() {},
});
for (let frame = 1; frame <= 180; frame++) context.mapView.motion.step(frame / 60);
$('#castle-ui').onpointerdown(dragEvent(20, 100));
for (let frame = 1; frame <= 120; frame++) context.mapView.motion.step(frame / 60);
assert.equal(
  context.mapView.motion.markers.some((m) => m.selected),
  false,
);
assert.equal(context.mapView.motion.panel, 128);
assert.equal(context.mapView.motion.active, true, 'An ongoing drag keeps the map clock awake');
const beforeDrag = [...context.mapView.motion.frameCamera];
$('#castle-ui').onpointermove(dragEvent(20, 150));
context.mapView.motion.step(121 / 60);
assert.notDeepEqual(context.mapView.motion.frameCamera, beforeDrag);
assert.deepEqual(context.mapView.motion.frameCamera, context.mapView.motion.camera);
$('#castle-ui').onpointerup(dragEvent(20, 150));
assert.equal(context.mapView.motion.active, false, 'An idle unselected map stops after release');
context.castleButtons.find((b) => b.text === 'Menu').action();
assert.equal(context.screen, 'menu');
console.log(
  'Map controls: animation retains live buttons; touch/keyboard selection, locked Play, hint Done and one-time campaign congratulations work.',
);
