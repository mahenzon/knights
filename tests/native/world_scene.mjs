import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../../web/scene.mjs';
import * as enemies from '../../build/web/enemies.mjs';
import { healthBar, hudBackdrop, pauseControl } from '../../build/web/hud.mjs';
const native = JSON.parse(fs.readFileSync('research/world-scene.json'));
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
let core;
const source = fs.readFileSync('web/game.mjs', 'utf8');
const code =
  source.slice(source.indexOf('function image('), source.indexOf('function text(')) +
  source.slice(source.indexOf('function renderUnit('), source.indexOf('function unlockAudio('));
const assets = new Map(
  data.assets
    .filter((name) => name.endsWith('.png'))
    .map((name) => {
      const bytes = fs.readFileSync(`dist/assets/${name}`);
      return [name, { name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }];
    }),
);
const calls = [],
  stack = [];
let matrix = [1, 0, 0, 1, 0, 0],
  clipping = null,
  rect;
const point = (x, y, m = matrix) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const viewport = (x, y, w, h) => [
  Math.max(0, x),
  Math.max(0, y),
  Math.min(480, x + w) - Math.max(0, x),
  Math.min(320, y + h) - Math.max(0, y),
];
const ctx = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  save() {
    stack.push([matrix.slice(), clipping, this.globalAlpha, this.globalCompositeOperation]);
  },
  restore() {
    [matrix, clipping, this.globalAlpha, this.globalCompositeOperation] = stack.pop();
  },
  translate(x, y) {
    [matrix[4], matrix[5]] = point(x, y);
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
  rect(x, y, w, h) {
    const p = point(x, y),
      q = point(x + w, y + h);
    rect = viewport(
      Math.min(p[0], q[0]),
      Math.min(p[1], q[1]),
      Math.abs(q[0] - p[0]),
      Math.abs(q[1] - p[1]),
    );
  },
  clip() {
    clipping = rect;
  },
  fillRect() {},
  drawImage(image, ...args) {
    const crop = args.length === 8 ? args.splice(0, 4) : undefined;
    const [x, y, w = image.width, h = image.height] = args;
    calls.push({
      image: image.name,
      alpha: this.globalAlpha,
      blend: this.globalCompositeOperation,
      tint: image.tint ?? 255,
      clip: clipping,
      crop,
      corners: [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(([x, y]) => point(x, y)),
    });
  },
};
const draw = new Float32Array(6087);
const renderer = vm.createContext({
  // These earlier native fixtures supply the inner renderer's captured global clock.
  visualTime: { read: () => draw[0] },
  ctx,
  draw,
  data,
  assets,
  ...scenes,
  ...enemies,
  healthBar,
  hudBackdrop,
  pauseControl,
  pausePressed: false,
  screen: 'game',
  dev: false,
  sequences: new Map(),
  pauseButton: { matches: () => false },
  buttonScene: () => [],
  menuCommands() {},
  text() {},
  tintEnemySprite: (image, tint) => ({ ...image, tint }),
  state() {
    draw.set(new Float32Array(core.memory.buffer, core.frame_ptr(), core.draw_len()));
  },
});
vm.runInContext(code, renderer);
let compared = 0;
for (const c of native.cases) {
  core = (await WebAssembly.instantiate(wasm)).instance.exports;
  [30, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((value, index) => {
    core.configure(index, value);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  for (const d of c.devices) assert.equal(core.equip(d.slot, d.kind, d.tier, d.x, d.y), 1);
  const ptr = core.save_ptr(),
    bytes = new Uint8Array(core.memory.buffer, ptr, core.save_len()).slice(),
    v = new DataView(bytes.buffer);
  v.setUint32(80, 0, true);
  v.setFloat32(108, 9999, true);
  v.setFloat32(48232, 4, true);
  for (const d of c.devices) v.setFloat32(26180 + d.slot * 52 + 20, d.elapsed, true);
  for (const [i, a] of c.actors.entries()) {
    const word = 235 + i * 27;
    [
      1,
      a.kind,
      a.reward,
      a.damage,
      a.ability_done | (a.ability_active << 1),
      a.shield,
      a.immunity,
    ].forEach((n, j) => {
      v.setUint32((word + j) * 4, n, true);
    });
    [
      a.x,
      a.y,
      a.ground,
      a.vx,
      a.vy,
      a.hp,
      a.speed,
      a.saved_speed,
      a.mass,
      a.size,
      a.stun_time,
      a.frame,
      a.target_x,
      a.target_y,
      a.min_y,
      a.cooldown,
      a.alpha / 255,
      a.ability_delay,
      a.ability_remaining,
      a.range,
    ].forEach((n, j) => {
      v.setFloat32((word + 7 + j) * 4, n, true);
    });
    v.setUint32(61748 + i * 4, a.pose, true);
    v.setUint32(22540 + i * 4, a.burning * 2, true);
  }
  for (const p of c.objects) {
    const at = 23340 + p.slot * 68;
    v.setUint32(at, 1, true);
    v.setUint32(at + 4, p.kind, true);
    [
      0,
      p.lifetime,
      p.gravity,
      p.x,
      p.y,
      p.vx,
      p.vy,
      p.target_x,
      p.target_y,
      0,
      0,
      p.size,
      0,
    ].forEach((n, j) => {
      v.setFloat32(at + 12 + j * 4, n, true);
    });
    v.setUint32(31480 + p.slot * 24, p.tier, true);
    v.setFloat32(31484 + p.slot * 24, p.kind === 2 ? p.charge : 0, true);
    v.setInt32(31492 + p.slot * 24, p.counter, true);
  }
  new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
  assert.equal(core.restore(), 1);
  renderer.run = { background: c.theme, config: { mirrorLevel: !!c.reverse }, inventory: [0] };
  const land = new scenes.Landscape(30);
  land.stars = c.land.stars;
  renderer.landscape = land;
  const emissions = c.frames.flatMap((f) => f.emissions);
  for (const caller of [
    '0x2b014',
    '0x2b0ac',
    '0x2b144',
    '0x2b668',
    '0x2b700',
    '0x2b798',
    '0x2b830',
    '0x2b8c8',
    '0x2b960',
    c.theme === 3 ? '0x2ba3c' : '0x2b9e8',
  ])
    assert.ok(
      emissions.some((e) => e.caller === caller),
      `Fixture must exercise impact/trail emitter ${caller}`,
    );
  for (let tick = 1; tick <= 450; tick++) {
    core.step();
    const f = c.frames.find((f) => f.tick === tick);
    if (!f) continue;
    const saved = core.save_ptr(),
      current = new DataView(core.memory.buffer, saved, core.save_len());
    for (let slot = 0; slot < 50; slot++) {
      const smoke = f.smokes.find((s) => s.slot === slot),
        offset = 32344 + slot * 36;
      assert.equal(
        current.getUint32(offset, true),
        smoke ? 1 : 0,
        `${c.theme}/${c.reverse}/${tick}/smoke${slot} active`,
      );
      if (!smoke) continue;
      assert.equal(current.getUint32(offset + 4, true), smoke.kind, `${tick}/smoke${slot} kind`);
      for (const [delta, key] of [
        [8, 'x'],
        [12, 'y'],
        [16, 'size'],
        [20, 'growth'],
        [24, 'alpha'],
        [28, 'fade'],
      ])
        assert.ok(
          Math.abs(current.getFloat32(offset + delta, true) - smoke[key]) < 0.001,
          `${tick}/smoke${slot}/${key}: ${current.getFloat32(offset + delta, true)} vs ${smoke[key]}`,
        );
    }
    calls.length = 0;
    vm.runInContext('render()', renderer);
    const actual = calls
      .slice(
        0,
        calls.findIndex((d) => d.image === hudBackdrop.image),
      )
      .filter((d) => d.alpha > 0 && (d.blend !== 'lighter' || d.tint > 0));
    // Native effect managers also draw the just-expired, fully transparent slot.
    const expected = f.draws.filter(
      (d) => d.color[3] > 0 && (d.blend !== 'lighter' || d.color[0] > 0),
    );
    const label = `theme${c.theme}/reverse${c.reverse}/tick${tick}`;
    assert.equal(actual.length, expected.length, `${label} visible draw count`);
    for (let i = 0; i < actual.length; i++) {
      const a = actual[i],
        e = expected[i],
        key = `${label}/${i}/${e.image}`;
      assert.equal(a.image, e.image, key);
      if (e.blend === 'lighter')
        assert.ok(
          Math.abs((a.alpha * a.tint) / 255 - (e.color[3] * e.color[0]) / (255 * 255)) < 1e-6,
          `${key}/additive intensity`,
        );
      else {
        assert.ok(Math.abs(a.alpha - Math.min(1, e.color[3] / 255)) < 1e-6, `${key}/alpha`);
        if (e.blend_factors[0] === 1) {
          // Cloud fades modulate premultiplied RGB and alpha together.
          assert.ok(
            Math.abs((a.alpha * a.tint) / 255 - e.color[0] / 255) < 1e-6,
            `${key}/premultiplied intensity`,
          );
        } else assert.equal(a.tint, e.color[0], `${key}/tint`);
      }
      assert.equal(a.blend, e.blend, `${key}/blend`);
      const nativeClip = e.clip
        ? viewport(480 - e.clip[1] - e.clip[3], 320 - e.clip[0] - e.clip[2], e.clip[3], e.clip[2])
        : null;
      assert.deepEqual(a.clip, nativeClip, `${key}/clip`);
      assert.deepEqual(a.crop, e.crop, `${key}/crop`);
      const { width, height } = assets.get(e.image);
      let corners;
      if (e.op === 'blit') {
        const w = e.crop?.[2] ?? width,
          h = e.crop?.[3] ?? height;
        corners = [
          [e.x, e.y],
          [e.x + w, e.y],
          [e.x, e.y + h],
          [e.x + w, e.y + h],
        ];
      } else if (e.op === 'stretch')
        corners = [
          [e.x, e.y2],
          [e.x2, e.y2],
          [e.x, e.y],
          [e.x2, e.y],
        ];
      else {
        const sx = e.sx ?? 1,
          sy = e.sy === undefined ? 1 : -e.sy,
          s = Math.sin(e.radians ?? 0),
          k = Math.cos(e.radians ?? 0);
        corners = [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [-width / 2, height / 2],
          [width / 2, height / 2],
        ].map(([x, y]) => [e.x + k * sx * x - s * sy * y, e.y + s * sx * x + k * sy * y]);
      }
      corners = corners.map(([x, y]) => point(x, y, e.matrix));
      for (let j = 0; j < 4; j++)
        for (let axis = 0; axis < 2; axis++)
          assert.ok(
            Math.abs(a.corners[j][axis] - corners[j][axis]) < 0.001,
            `${key}/corner${j}/${axis}: ${a.corners[j][axis]} vs ${corners[j][axis]}`,
          );
    }
    if (tick === 40 || tick === 421) {
      const before = structuredClone(calls),
        saved = core.save_ptr();
      const checkpoint = new Uint8Array(core.memory.buffer, saved, core.save_len()).slice();
      new Uint8Array(
        core.memory.buffer,
        core.load_buffer(checkpoint.length),
        checkpoint.length,
      ).set(checkpoint);
      assert.equal(core.restore(), 1);
      renderer.landscape = new scenes.Landscape(30);
      renderer.landscape.stars = c.land.stars;
      calls.length = 0;
      vm.runInContext('render()', renderer);
      assert.deepEqual(calls, before, `${label}/restored drawing`);
    }
    compared++;
  }
}
console.log(
  `World renderer: ${compared} combined native scenes across four landscapes and both orientations pass.`,
);
