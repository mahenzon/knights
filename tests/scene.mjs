import { enemyScene } from '../build/web/enemies.mjs';
import { healthBar, hudBackdrop, pauseControl } from '../build/web/hud.mjs';
import { buttonScene } from '../build/web/shop.mjs';
import { createRun, prepareDay, dayCount } from '../build/web/campaign.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  dragonPose,
  deviceScene,
  objectScene,
  missileScene,
  Landscape,
  landscapeScene,
  endFlagY,
  castleScene,
} from '../web/scene.mjs';
const original = JSON.parse(fs.readFileSync('tests/fixtures/scene-data.json'));
for (const frame of original.altar_capture.dragon_frames) {
  const pose = dragonPose(frame.frame / 60);
  if (frame.frame <= 60 || frame.frame >= 264) {
    assert.equal(pose, null);
    continue;
  }
  for (const [key, native] of [
    ['x', 'x'],
    ['y', 'y'],
    ['jaw', 'jaw_angle'],
  ])
    assert.ok(
      Math.abs(pose[key] - frame[native]) < 0.0002,
      `Frame ${frame.frame} ${key}: ${pose[key]} vs ${frame[native]}`,
    );
}
const game = JSON.parse(fs.readFileSync('web/game-data.json'));
assert.deepEqual(game.sounds, original.sounds);
assert.deepEqual(game.scene.altar, original.altar_idle);
assert.deepEqual(
  game.scene.gate,
  original.gate_idle.filter((draw) => draw.image),
);
for (const name of new Set(original.sounds.creeps.flat().filter(Boolean)))
  assert.ok(fs.existsSync(`dist/assets/${name}`), `Missing original sound ${name}`);
const weaponOriginal = JSON.parse(fs.readFileSync('tests/fixtures/weapon-followup.json'));
for (const fixture of weaponOriginal.drawings) {
  const kind = fixture.device,
    tier = fixture.tier,
    elapsed = fixture.elapsed;
  const cooldown = kind === 6 ? 15 : kind === 8 ? 10 - tier * 2 : 0.4;
  const commands = deviceScene({
    kind,
    tier,
    x: kind === 6 ? 392 : kind === 8 ? 432 : 50,
    y: kind === 6 ? 237 : kind === 8 ? 142 : 247,
    elapsed,
    cooldown,
    angle: Math.fround(0.2),
    recoil: elapsed > cooldown ? 5 : 0,
    animation: kind === 8 ? 3 : 1,
  });
  assert.equal(commands.length, fixture.draws.length, `Native device ${kind}/${tier} draw count`);
  for (let i = 0; i < commands.length; i++) {
    const actual = commands[i],
      expected = fixture.draws[i];
    for (const key of ['op', 'image']) assert.equal(actual[key], expected[key]);
    for (const key of ['x', 'y', 'radians'])
      assert.ok(
        Math.abs(actual[key] - expected[key]) < 0.0001,
        `${kind} ${key}: ${actual[key]} vs ${expected[key]}`,
      );
    if (actual.op === 'scaled')
      for (const key of ['sx', 'sy', 'flip']) assert.equal(actual[key], expected[key]);
    assert.ok(fs.existsSync(`dist/assets/${actual.image}`));
  }
}
const dragOriginal = JSON.parse(fs.readFileSync('tests/fixtures/drag-followup.json'));
function compareDraws(actual, expected, label) {
  expected = expected.filter((c) => c.image !== '0x0');
  assert.equal(actual.length, expected.length, label);
  for (let i = 0; i < expected.length; i++)
    for (const [key, value] of Object.entries(expected[i])) {
      if (typeof value === 'number')
        assert.ok(
          Math.abs((actual[i][key] ?? 1) - value) < 0.0002,
          `${label} ${i} ${key}: ${actual[i][key]} vs ${value}`,
        );
      else assert.equal(actual[i][key], value, `${label} ${i} ${key}`);
    }
}
for (const fixture of dragOriginal.drawings) {
  const s = fixture.state;
  compareDraws(
    objectScene({
      kind: fixture.kind,
      tier: fixture.tier,
      x: s.x,
      y: s.y,
      angle: s.angle,
      size: s.scale,
      charge: s.unknown28,
      time: fixture.time,
    }),
    fixture.draws,
    `Object ${fixture.kind}/${fixture.tier}`,
  );
}
for (const fixture of dragOriginal.devices) {
  const kind = fixture.kind,
    x = kind === 2 ? 315 : kind === 4 ? 405 : 408,
    y = kind === 2 ? 63 : kind === 4 ? 38 : 150;
  compareDraws(
    deviceScene({
      kind,
      tier: fixture.tier,
      x,
      y,
      elapsed: fixture.elapsed,
      cooldown: kind === 2 ? 25 : kind === 4 ? 30 : 12,
      recoil: 0,
      time: 0.8,
    }),
    fixture.draws,
    `Device ${kind}/${fixture.tier}`,
  );
}
// Exercise the production renderer without a browser or the audio/input shell.
const source = fs.readFileSync('web/game.mjs', 'utf8');
const drawing =
  source.slice(source.indexOf('function image('), source.indexOf('function text(')) +
  source.slice(source.indexOf('function renderUnit('), source.indexOf('function unlockAudio('));
const calls = [],
  clips = [],
  scales = [],
  styles = [];
let clip = null,
  rect = null,
  translation = [0, 0];
const ctx = {
  save() {
    clips.push(clip);
    styles.push([this.globalAlpha, this.globalCompositeOperation, translation.slice()]);
  },
  restore() {
    clip = clips.pop();
    [this.globalAlpha, this.globalCompositeOperation, translation] = styles.pop();
  },
  beginPath() {},
  rect(...args) {
    rect = args;
  },
  clip() {
    clip = rect;
  },
  translate(x, y) {
    translation[0] += x;
    translation[1] += y;
  },
  rotate() {},
  scale(...args) {
    scales.push(args);
  },
  fillRect() {},
  drawImage(image, ...args) {
    calls.push({
      name: image.name,
      clip,
      alpha: this.globalAlpha ?? 1,
      blend: this.globalCompositeOperation ?? 'source-over',
      args,
      translation: translation.slice(),
    });
  },
};
const draw = new Float32Array(6087);
draw.set([1, 2], 5845);
draw[5839] = 331;
draw[5840] = 162;
draw[3] = 100;
draw[15] = 1;
draw[17] = 30;
draw[18] = 25;
draw[2720] = 1;
draw[2731] = 4;
draw[3695] = 1;
draw[3696] = 227;
draw.set([1, 230, 250, 0, 0, 1, 1, 0, 0, 0, 0, 250], 20);
draw.set([8, 233, 248, 0, 0, 1, 1, 0, 0, 0, 0, 248], 32);
draw.set(draw.slice(32, 44), 6075);
const renderer = vm.createContext({
  // These earlier native fixtures supply the inner renderer's captured global clock.
  visualTime: { read: () => draw[0] },
  ctx,
  draw,
  data: game,
  run: null,
  landscape: new Landscape(50),
  screen: 'game',
  sequences: new Map(),
  assets: new Map(game.assets.map((name) => [name, { name, width: 64, height: 64 }])),
  state(presentation) {
    assert.equal(presentation, true, 'Battle renderer must request the original captured poses');
  },
  text() {},
  dragonPose() {
    return null;
  },
  deviceScene,
  objectScene,
  missileScene,
  landscapeScene,
  endFlagY,
  dayCount,
  castleScene,
  enemyScene,
  tintEnemySprite: (image) => image,
  healthBar,
  hudBackdrop,
  pauseControl,
  pausePressed: false,
  buttonScene,
  menuCommands(commands) {
    for (const command of commands.filter((c) => c.op !== 'text')) renderer.sceneImage(command);
  },
  pauseButton: { matches: () => false },
  dev: false,
});
vm.runInContext(drawing, renderer);
// Match texture corners, not just Display arguments: drawInRect has inverted UVs.
for (const fixture of original.texture_anchor_fixture.drawInRect) {
  const [width, height] = original.texture_anchor_fixture.content_size;
  renderer.assets.set('texture-fixture', { name: 'texture-fixture', width, height });
  renderer.fixture = fixture;
  vm.runInContext(
    "sceneImage({op:'scaled',image:'texture-fixture',x:0,y:0,radians:0,sx:fixture.sx,sy:fixture.sy})",
    renderer,
  );
  const [sx, sy] = scales.pop();
  for (let i = 0; i < 4; i++) {
    const [u, v] = fixture.uv.slice(i * 2, i * 2 + 2);
    assert.equal((u * 2 - 0.5) * width * sx, fixture.xyz[i * 3]);
    assert.equal((v * 2 - 0.5) * height * sy, fixture.xyz[i * 3 + 1]);
  }
}
calls.length = 0;
vm.runInContext('render()', renderer);
const at = (name) => calls.findIndex((call) => call.name === name);
const walker = game.assets.filter((name) => name.startsWith('knight_lite_go_')).sort()[0];
const captive = game.assets.filter((name) => name.startsWith('knight_lite_fly_')).sort()[0];
assert.ok(at('hole_zad.png') < at(captive));
assert.ok(at(captive) < at('hole_krishka.png'));
assert.ok(at('hole_krishka.png') < at('hole_per.png'));
assert.ok(at('hole_per.png') < at(walker), 'Walking knights must draw in front of the gate');
const order = draw.slice(5845, 6075);
const gatePose = draw.slice(6075);
draw.set([8, 233, 248, 6, 1, 1, 1, 600, 1, 1, 1, 248], 6075);
draw.set(
  Array.from({ length: 230 }, (_, i) => i + 1),
  5845,
);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.equal(
  calls.filter((c) => c.name === walker).length,
  1,
  'A full actor list must not read the appended gate pose as IDs',
);
draw.set(order, 5845);
draw.set(gatePose, 6075);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.equal(
  calls.filter((call) => call.name === captive).length,
  1,
  'Gate captive must not draw twice',
);
assert.deepEqual(calls[at(captive)].clip, [0, 0, 480, 253]);
assert.equal(calls[at(walker)].clip, null);
draw.set([5, 230, 240, 0, 1], 2420);
draw.set([201, 1, 2], 5845);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(
  at('barrel.png') < at(walker),
  'Shared native order puts a rear projectile behind a knight',
);
draw.set([1, 201, 2], 5845);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(
  at('barrel.png') > at(walker),
  'Shared native order can place the same projectile in front',
);
draw[2420] = 0;
draw.set([1, 2, 0], 5845);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(at('castle_enter_rez.png') < at(walker));
draw[5838] = 1;
calls.length = 0;
vm.runInContext('render()', renderer);
assert.deepEqual(
  calls.filter((c) => c.name === 'castle_door_1_default.png').map((c) => c.blend),
  ['source-over', 'lighter'],
);
draw[5837] = 1;
draw[5838] = 2;
calls.length = 0;
vm.runInContext('render()', renderer);
assert.equal(at('castle_door_1_default.png'), -1);
assert.ok(at('castle_enter_rez.png') > at(walker), 'Breached arch occludes advancing knights');
draw[5837] = 0;
draw[5838] = 0;
draw.set([1, 200, 220, 1], 5237);
draw.set([1, 180, 210, 1, 1, 0], 3701);
draw.set([5, -2, 5, -2], 5841);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.deepEqual(calls[at('castle_1.png')].translation, [5, -2]);
assert.deepEqual(calls[at('castle_progressbar.png')].translation, [0, 0]);
assert.deepEqual(calls[at(game.fragmentSprites[0])].translation, [200, 220]);
assert.deepEqual(calls[at(game.smokeSprites[0])].translation, [180, 210]);
assert.deepEqual(calls[at('hole_krishka.png')].clip, [-5, 2, 480, 253]);
draw.set([5, 405, 38, 0, 31, 30, 0, 0, -20, 0, 0], 2742);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.deepEqual(calls[at('tower_pod_column_button.png')].clip, [-5, 2, 480, 58]);
assert.deepEqual(calls[at('tower_pod_column_button.png')].args.slice(0, 2), [420, 28]);
assert.equal(calls[at('tower_pod_column_front.png')].clip, null);
draw.set([3, 315, 63, 0, 26, 25, 0, 0, 0, 0, 0], 2742);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(at('tower_pod_stones.png') < at(walker));
assert.ok(at('stone_64.png') > at(walker), 'Ready weapons draw after the shared actor pass');
draw.fill(0, 2742, 2753);
draw.set([0, 0, 5, -2], 5841);
calls.length = 0;
vm.runInContext('render()', renderer);
assert.deepEqual(calls[at(game.fragmentSprites[0])].translation, [195, 222]);
draw.set([1, 200, 220, 1, 1, 0], 3701);
for (const sample of JSON.parse(fs.readFileSync('tests/fixtures/trembling.json')).compensated) {
  draw.set([0, 0, ...sample.shift], 5841);
  calls.length = 0;
  vm.runInContext('render()', renderer);
  const name = sample.kind === 'fragment' ? game.fragmentSprites[0] : game.smokeSprites[0];
  assert.deepEqual(calls[at(name)].translation, [sample.draw.x, sample.draw.y]);
}
draw.fill(0, 5841, 5845);
draw[5237] = 0;
draw[3701] = 0;
draw[32] = 9;
draw[6075] = 9;
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(at('skeleton.png') < at('hole_per.png'));
assert.deepEqual(calls[at('skeleton.png')].clip, [0, 0, 480, 253]);
draw[15] = -1;
calls.length = 0;
vm.runInContext('render()', renderer);
assert.equal(
  calls.filter((c) => c.name === 'skeleton.png').length,
  2,
  'Native release frame draws in both gate and ordinary passes',
);
draw[6075] = 0;
calls.length = 0;
vm.runInContext('render()', renderer);
assert.ok(at('skeleton.png') > at('hole_per.png'));
assert.equal(calls[at('skeleton.png')].clip, null);
assert.ok(
  at('back_1_night.png') < at('castle_1.png'),
  'Native night opening renders behind the castle',
);
assert.deepEqual(calls[at('back_1_night.png')].args, [-240, -160, 480, 320]);
const stars = calls.filter((c) => c.name === 'star.png');
assert.equal(stars.length, 30);
assert.equal(stars[0].args.length, 4);
assert.deepEqual(stars[1].args.slice(0, 4), [0, 0, 8, 8]);
calls.length = 0;
vm.runInContext("sceneImage({op:'blit',image:'star.png',x:4,y:5,alpha:.5})", renderer);
assert.equal(calls[0].alpha, 0.5, 'Star fades survive the production blit path');
assert.equal(ctx.globalAlpha, undefined, 'Scene commands restore alpha for actors and HUD');
calls.length = 0;
vm.runInContext(
  "sceneImage({op:'blit',image:'flamer_gun_fx_flash.png',x:4,y:5,blend:'screen'})",
  renderer,
);
assert.equal(calls[0].blend, 'screen', 'Cannon glow survives the production blit fast path');
assert.equal(ctx.globalCompositeOperation, undefined, 'Scene commands restore blending');
calls.length = 0;
draw.set([6, 200, 240, 0, 4, 1, 0.5, -1, 0, 1, 1.2, 240], 20);
renderer.renderUnit(0);
assert.equal(calls[0].alpha, 127 / 255, 'Corpse opacity uses the native integer alpha conversion');
const starts = JSON.parse(fs.readFileSync('tests/fixtures/start-day.json'));
const bannerText = [],
  fades = [];
renderer.text = (text, x, y, _size, align, rgb = [255, 255, 255]) => {
  if (typeof text === 'string') bannerText.push({ text, x, y, rgb: Array.from(rgb), align });
};
ctx.fillRect = (...rect) => {
  if (ctx.fillStyle.startsWith('rgba(0,0,0,')) fades.push({ style: ctx.fillStyle, rect });
};
for (const c of starts.cases) {
  renderer.run = prepareDay(game, createRun(game, c.mode, c.level, 'normal', 73));
  renderer.run.day = c.day;
  assert.equal(dayCount(game, renderer.run), c.max_days);
  for (const f of c.frames) {
    draw[0] = f.frame / 60;
    draw[3700] = f.fade;
    calls.length = bannerText.length = fades.length = 0;
    renderer.render();
    const flag = f.draws.find((d) => d.image === 'flag.png');
    assert.deepEqual(
      calls.filter((d) => d.name === 'flag.png').map((d) => d.args.slice(0, 2)),
      flag ? [[flag.x, flag.y]] : [],
    );
    assert.deepEqual(
      bannerText,
      flag
        ? f.draws
            .filter((d) => d.op === 'text')
            .map(({ text, x, y, rgb }) => ({ text, x, y, rgb, align: 'center' }))
        : [],
    );
    assert.deepEqual(
      fades,
      f.fade > 0
        ? [{ style: `rgba(0,0,0,${Math.trunc(f.fade) / 255})`, rect: [0, 0, 480, 320] }]
        : [],
    );
  }
}
// Original normalGame::Draw skips day/Victory/Defeat banners while paused.
const pauseBanners = JSON.parse(fs.readFileSync('tests/fixtures/pause-gestures.json')).banners;
renderer.$ = () => ({ hidden: true });
renderer.run = prepareDay(game, createRun(game, 'campaign', 0, 'normal', 73));
draw[3700] = 0;
for (const sample of pauseBanners) {
  draw[3699] = ['day_start', 'victory', 'defeat'].indexOf(sample.kind);
  for (const frame of [sample.before, ...sample.paused, sample.resumed]) {
    renderer.screen = frame.paused ? 'paused' : 'game';
    draw[0] = draw[3698] = frame.animation_frame / 60;
    calls.length = bannerText.length = 0;
    renderer.render();
    assert.deepEqual(
      calls
        .filter((command) => command.name === 'flag.png')
        .map((command) => command.args.slice(0, 2)),
      frame.commands.filter((command) => command.image === 'flag.png').map(({ x, y }) => [x, y]),
      `${sample.kind}: native pause/resume flag visibility and position`,
    );
    assert.equal(
      bannerText
        .map(({ text }) => text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      frame.commands
        .filter((command) => command.op === 'text')
        .map(({ text }) => text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      `${sample.kind}: native pause/resume banner text`,
    );
  }
}
console.log(
  'Scene: native dragon, weapon poses/UVs, landscape layers/star crops, sounds and gate/captive/walker draw order pass.',
);
