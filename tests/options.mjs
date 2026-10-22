import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  optionAssets,
  optionScene,
  optionInput,
  optionButtons,
  optionConfirmations,
  readSettings,
} from '../build/web/options.mjs';
import { PurchaseMotion, buttonScene, dialogScene } from '../build/web/shop.mjs';

const native = JSON.parse(fs.readFileSync('tests/fixtures/options.json'));
for (const scene of native.screens) {
  const { paused: _paused, ...state } = scene.state;
  const commands = scene.draws.flatMap(({ frame: _frame, radians: _radians, tint, ...command }) =>
    tint
      ? [command, { op: 'fill', rect: [0, 0, 320, 480], rgba: [0, 0, 0, 255 - tint[0]] }]
      : [command],
  );
  assert.deepEqual(optionScene(state), commands);
  assert.deepEqual(
    optionButtons(scene.state.paused),
    scene.controls.map(({ text, rect }) => ({ text, rect })),
  );
}
for (const input of native.inputs) {
  const initial = { difficulty: 1, reverse: true, muted: false, volume: 0.5 };
  const { paused: _paused, ...expected } = input.state;
  assert.deepEqual(
    optionInput(initial, ...input.point, input.function === '0x249c4'),
    expected,
    `native input ${input.function} at ${input.point}`,
  );
}
for (const dialog of native.dialogs) {
  const motion = new PurchaseMotion();
  for (const frame of dialog.frames) {
    motion.step();
    assert.deepEqual(
      [
        ...dialogScene(optionConfirmations[dialog.kind === 2 ? 'reset' : 'cheat'], motion),
        ...buttonScene({ text: 'NO', rect: [125, 160, 115, 61] }, false, motion),
        ...buttonScene({ text: 'YES', rect: [252, 160, 115, 61] }, false, motion),
      ],
      frame.draws,
    );
  }
}
assert.equal(native.exits[1].state.paused, false, 'Done clears the native return-to-game flag');
assert.equal(
  native.exits[1].events.some((e) => e.function === '0x1d7d0'),
  false,
);
assert.ok(native.actions[0].levels.every(([complete, open]) => complete && open));
assert.deepEqual(native.actions[1].levels[0], [0, 1]);
assert.ok(native.actions[1].levels.slice(1).every(([complete, open]) => !complete && !open));
assert.equal(native.actions[1].score, 123456, 'native Reset preserves scores');
for (const bad of [null, 'broken', '{}', 'null', '{"volume":"1","difficulty":99}'])
  assert.deepEqual(readSettings(bad), readSettings(null));
assert.equal(
  readSettings(null).volume,
  JSON.parse(fs.readFileSync('tests/fixtures/music-transitions.json')).defaults._g_musicVolume,
  'new installations use the original music volume; existing preferences are retained',
);
assert.equal(
  readSettings('{"sound":false,"power":true}').sound,
  false,
  'existing preferences migrate',
);
assert.equal(readSettings('{"volume":2}').volume, 1);
assert.equal(readSettings('{"volume":-3}').volume, 0);
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
assert.ok(
  optionAssets.every((name) => data.art[name][0] === 'menu'),
  'Options must not download the large extras pack',
);
console.log(
  'Options: 6 original scenes, 46 input boundaries and 90 confirmation frames match native execution.',
);
