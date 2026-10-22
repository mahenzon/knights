import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CreditsMotion, creditsControls, creditsScene } from '../build/web/play.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/credits.json'));
const motion = new CreditsMotion(() => 1 / 5);
assert.deepEqual(motion.scales, native.initial);
assert.deepEqual(
  creditsControls,
  native.controls.map(({ text, rect }) => ({ text, rect })),
);
for (const frame of native.frames) {
  motion.step();
  assert.deepEqual(motion.scales, frame.scales);
  assert.deepEqual(
    creditsScene(motion.scales),
    frame.draws.map(({ frame, radians, ...command }) => command),
  );
}
assert.equal(motion.active, false, 'idle credits stop requesting animation frames');
const source = fs.readFileSync('web/game.mjs', 'utf8');
for (const screen of ['menu', 'credits', 'help']) {
  let starts = 0;
  let audio = 0;
  const context = vm.createContext({
    screen,
    backgrounded: true,
    document: { hidden: true },
    settings: { sound: true },
    music: { group: 'menu' },
    $: () => ({ paused: true }),
    menuClock: {
      start() {
        starts++;
      },
    },
    prepareAudio() {
      if (!context.document.hidden) audio++;
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf('function resumeAudioOnGesture()'),
      source.indexOf("document.addEventListener('pointerdown', resumeAudioOnGesture"),
    ),
    context,
  );
  context.resumeAudioOnGesture();
  assert.equal(starts, 0);
  assert.equal(audio, 0, 'hidden menu/help/credits cannot resume audio');
  context.document.hidden = false;
  context.resumeAudioOnGesture();
  assert.equal(starts, 1, 'Returning to Main/Help/Credits can finish an interrupted entrance');
  assert.equal(audio, 1, 'returning to Main/Help/Credits can resume menu music');
}
console.log(
  'Credits: original names, wording, colors, buttons and 180 native entrance frames match.',
);
