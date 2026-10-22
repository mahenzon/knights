import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { healthBar, hudBackdrop } from '../build/web/hud.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/hud-data.json'));
for (const sample of native.samples) {
  assert.deepEqual(hudBackdrop, sample.draws[0]);
  const expected = sample.draws[2];
  assert.deepEqual(healthBar(sample.hp, sample.max_hp), {
    op: 'blit',
    image: expected.image,
    x: expected.x,
    y: expected.y,
    crop: [expected.crop[0], expected.crop[1], expected.crop[3], expected.crop[2]],
  });
}
const source = fs.readFileSync('web/game.mjs', 'utf8');
const draws = [];
const draw = new Float32Array(7);
draw[2] = draw[3] = 100;
draw[4] = 1234;
draw[6] = 56;
vm.runInNewContext(
  source.slice(
    source.indexOf('  sceneImage(hudBackdrop);'),
    source.indexOf('  menuCommands(buttonScene(pauseControl'),
  ),
  {
    hudBackdrop,
    healthBar,
    draw,
    image: (image, x, y) => draws.push({ op: 'blit', image, x, y }),
    sceneImage: (command) => draws.push(command),
    text: (text, x, y, size, align, rgb) =>
      draws.push({
        op: 'text',
        text: String(text),
        x,
        y,
        size,
        align: ['left', 'right', 'center'].indexOf(align),
        rgb: Array.from(rgb),
      }),
  },
);
const expected = JSON.parse(fs.readFileSync('tests/fixtures/ui-fidelity.json')).hud.map(
  ({ frame, radians, alpha, ...command }) => {
    if (command.crop)
      command.crop = [command.crop[0], command.crop[1], command.crop[3], command.crop[2]];
    return command;
  },
);
assert.deepEqual(draws, expected, 'HUD drawing order, text colors and gradient match original');
console.log('HUD: original health-bar colors, coordinates and crop match all 9 boundary samples.');
