import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PlayMotion,
  PauseMotion,
  playAssets,
  playControls,
  playScene,
  pauseControls,
  pauseShade,
  savedMode,
} from '../build/web/play.mjs';
import { PurchaseMotion, buttonScene, dialogScene } from '../build/web/shop.mjs';

const native = JSON.parse(fs.readFileSync('tests/fixtures/play-menu.json'));
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const packs = new Set(playAssets.map((name) => data.art[name][0]));
assert.deepEqual([...packs].sort(), ['menu', 'shop'], 'opening Play needs only small menu packs');
assert.ok(
  [...packs].reduce((size, pack) => size + fs.statSync(`build/web/art/${pack}.pack`).size, 0) <
    600000,
);
const motion = new PlayMotion();
for (const frame of native.backdrop) {
  motion.step();
  assert.deepEqual(
    playScene(motion.fade),
    frame.draws.map(({ frame: _frame, radians: _radians, ...draw }) => draw),
    `original Play backdrop frame ${frame.frame}`,
  );
}
assert.equal(motion.active, false, 'idle Play menu stops requesting animation frames');
const pause = new PauseMotion();
for (const frame of native.pause) {
  pause.step();
  assert.equal(pause.y, frame.y);
  assert.deepEqual(
    [pauseShade, ...pauseControls(pause.y).flatMap((button) => buttonScene(button))],
    frame.draws,
  );
}
assert.equal(pause.active, false, 'idle pause menu stops requesting animation frames');
for (const control of native.controls) {
  const button = playControls.find((button) => button.text === control.text);
  assert.deepEqual(button.rect, control.rect);
  const motion = new PlayMotion();
  for (const frame of native.buttons.filter((frame) => frame.text === button.text)) {
    motion.step();
    assert.deepEqual(buttonScene(button, frame.pressed, motion), frame.draws);
  }
}
const dialog = new PurchaseMotion();
for (const frame of native.saved_game) {
  dialog.step();
  assert.deepEqual(
    [
      ...dialogScene('  Saved game detected.\n   Load and continue?', dialog),
      ...buttonScene({ text: 'NO', rect: [125, 160, 115, 61] }, false, dialog),
      ...buttonScene({ text: 'YES', rect: [252, 160, 115, 61] }, false, dialog),
    ],
    frame.draws,
  );
}
for (const mode of ['campaign', 'endless', 'madness'])
  assert.equal(savedMode(JSON.stringify({ version: 3, run: { mode } })), mode);
for (const mode of ['campaign', 'endless', 'madness']) {
  assert.equal(savedMode(JSON.stringify({ version: 3, run: { mode, phase: 'failed' } })), null);
  for (const phase of ['battle', 'shop', 'complete'])
    assert.equal(savedMode(JSON.stringify({ version: 3, run: { mode, phase } })), mode);
}
assert.equal(savedMode('{"version":2}'), 'campaign');
for (const raw of [null, 'oops', '{}', '{"version":3}', '{"version":3,"run":{"mode":"oops"}}'])
  assert.equal(savedMode(raw), null);
console.log(
  'Original Play: 20 backdrop frames, 88 button frames and 45 saved-game dialog frames match.',
);
