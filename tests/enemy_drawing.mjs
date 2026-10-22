import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as enemies from '../build/web/enemies.mjs';

const native = JSON.parse(fs.readFileSync('tests/fixtures/enemy-drawing.json'));
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const {
  instance: { exports: core },
} = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
[120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((value, index) => {
  core.configure(index, value);
});
core.enemy_type(0, 0);
core.start(73, 100000, 0, 0, 0);
const savePointer = core.save_ptr();
const emptySave = new Uint8Array(core.memory.buffer, savePointer, core.save_len()).slice();
const source = fs.readFileSync('web/game.mjs', 'utf8');
const code =
  source.slice(source.indexOf('function image('), source.indexOf('function text(')) +
  source.slice(source.indexOf('function renderUnit('), source.indexOf('function renderMap('));
const calls = [],
  stack = [];
let matrix = [1, 0, 0, 1, 0, 0],
  clip = null,
  rect;
const ctx = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  save() {
    stack.push([matrix.slice(), clip, this.globalAlpha, this.globalCompositeOperation]);
  },
  restore() {
    [matrix, clip, this.globalAlpha, this.globalCompositeOperation] = stack.pop();
  },
  translate(x, y) {
    matrix[4] += matrix[0] * x + matrix[2] * y;
    matrix[5] += matrix[1] * x + matrix[3] * y;
  },
  scale(x, y) {
    matrix[0] *= x;
    matrix[1] *= x;
    matrix[2] *= y;
    matrix[3] *= y;
  },
  rotate(angle) {
    const [a, b, c, d] = matrix,
      s = Math.sin(angle),
      k = Math.cos(angle);
    matrix.splice(0, 4, a * k + c * s, b * k + d * s, c * k - a * s, d * k - b * s);
  },
  beginPath() {},
  rect(...values) {
    rect = values;
  },
  clip() {
    clip = rect;
  },
  drawImage(image, x, y, w = image.width, h = image.height) {
    calls.push({
      image: image.name,
      color: image.tint ?? 255,
      alpha: this.globalAlpha,
      blend: this.globalCompositeOperation,
      clip,
      corners: [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(([x, y]) => [
        matrix[0] * x + matrix[2] * y + matrix[4],
        matrix[1] * x + matrix[3] * y + matrix[5],
      ]),
    });
  },
};
const assets = new Map(data.assets.map((name) => [name, { name, width: 64, height: 80 }]));
const draw = new Float32Array(6087);
const renderer = vm.createContext({
  ctx,
  draw,
  data,
  assets,
  ...enemies,
  tintEnemySprite: (image, tint) => ({ ...image, tint }),
});
vm.runInContext(code, renderer);
for (const [index, c] of native.cases.entries()) {
  calls.length = 0;
  const saved = emptySave.slice(),
    view = new DataView(saved.buffer);
  [c.state, c.kind, 10, 10, c.ability ? 2 : 0, c.shield, 0].forEach((n, j) => {
    view.setUint32((235 + j) * 4, n, true);
  });
  [
    400.25,
    240.5,
    240.5,
    0,
    0,
    600,
    0,
    0,
    1,
    c.size,
    0,
    0,
    400,
    240,
    240,
    0,
    c.alpha / 255,
    99,
    10,
    0,
  ].forEach((n, j) => {
    view.setFloat32((242 + j) * 4, n, true);
  });
  view.setUint32(22540, c.burning ? 2 : 0, true);
  view.setFloat32(60948, c.angle, true);
  new Uint8Array(core.memory.buffer, core.load_buffer(saved.length), saved.length).set(saved);
  assert.equal(core.restore(), 1, `Case ${index} restores`);
  const pointer = core.draw_ptr();
  draw.set(new Float32Array(core.memory.buffer, pointer + 20 * 4, 12), 20);
  draw[5837] = c.broken;
  draw[5838] = c.broken * 2;
  vm.runInContext(`renderUnit(0, ${c.clipped})`, renderer);
  const visible = c.draws.filter((d) => d.image !== '0x0');
  assert.equal(calls.length, visible.length, `Case ${index} draw count`);
  for (const [j, expected] of visible.entries()) {
    const actual = calls[j],
      label = `Case ${index}, drawing ${j}`;
    assert.equal(actual.image, expected.image, label);
    assert.equal(actual.color, expected.color[0], `${label} tint`);
    assert.equal(actual.alpha, expected.color[3] / 255, `${label} alpha`);
    assert.equal(actual.blend, expected.blend, `${label} blend`);
    let nativeClip = null;
    if (expected.clip) {
      const [x, y, w, h] = expected.clip;
      const left = c.reverse ? y : 480 - y - h,
        top = 320 - x - w;
      nativeClip = [
        Math.max(0, left),
        Math.max(0, top),
        Math.min(480, left + h) - Math.max(0, left),
        Math.min(320, top + w) - Math.max(0, top),
      ];
    }
    assert.deepEqual(actual.clip, nativeClip, `${label} native viewport scissor`);
    const s = Math.sin(expected.radians),
      k = Math.cos(expected.radians);
    const corners = [
      [-32, -40],
      [32, -40],
      [-32, 40],
      [32, 40],
    ].map(([x, y]) => [
      expected.x + k * expected.sx * x + s * expected.sy * y,
      expected.y + s * expected.sx * x - k * expected.sy * y,
    ]);
    for (let k = 0; k < 4; k++)
      for (let axis = 0; axis < 2; axis++)
        assert.ok(
          Math.abs(actual.corners[k][axis] - corners[k][axis]) < 0.0001,
          `${label} texture corner ${k}/${axis}`,
        );
  }
  assert.equal(ctx.globalAlpha, 1, 'Actor drawing restores alpha');
  assert.equal(ctx.globalCompositeOperation, 'source-over', 'Actor drawing restores blend');
}
calls.length = 0;
draw[5837] = 1;
draw[5838] = 0;
vm.runInContext('renderUnit(0)', renderer);
assert.equal(calls[0].clip, null, 'This frame was drawn before the castle broke');
calls.length = 0;
draw[5838] = 2;
draw[5841] = 5;
draw[5842] = -2;
vm.runInContext('renderUnit(0,true)', renderer);
assert.deepEqual(
  calls[0].clip,
  [-5, 2, 390, 320],
  'Viewport clipping cancels world shake and replaces the gate scissor after breach',
);

let allocations = 0;
globalThis.document = {
  createElement() {
    allocations++;
    const canvas = { width: 0, height: 0, pixels: null };
    const context = {
      drawImage(image) {
        this.image = image;
      },
      getImageData() {
        return { data: new Uint8ClampedArray(this.image.pixels) };
      },
      putImageData(pixels) {
        canvas.pixels = Array.from(pixels.data);
      },
    };
    canvas.getContext = () => context;
    return canvas;
  },
};
const sprite = { width: 1, height: 1, pixels: [255, 128, 64, 127] };
const tinted = enemies.tintEnemySprite(sprite, 70);
assert.deepEqual(tinted.pixels, [70, 35, 18, 127], 'Burn tint multiplies RGB and retains alpha');
assert.equal(
  enemies.tintEnemySprite(sprite, 70),
  tinted,
  'Repeated frames reuse the tinted bitmap',
);
assert.equal(enemies.tintEnemySprite(sprite, 255), sprite);
assert.deepEqual(enemies.tintEnemySprite(sprite, 170).pixels, [170, 85, 43, 127]);
assert.equal(allocations, 2, 'One allocation per distinct sprite/tint');
assert.deepEqual(sprite.pixels, [255, 128, 64, 127], 'Original artwork remains unchanged');
delete globalThis.document;
console.log(
  `Enemy drawing: ${native.cases.length} native color/alpha, shield predicates/transforms/blending, breached/gate clipping, cached RGB multiplication and unchanged originals pass.`,
);
