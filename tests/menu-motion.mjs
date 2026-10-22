import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PurchaseMotion, ResultScore, buttonScene, purchaseScene } from '../build/web/shop.mjs';
import { createRun, prepareDay, finishDay } from '../build/web/campaign.mjs';

const native = JSON.parse(fs.readFileSync('tests/fixtures/menu-motion.json'));
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
for (const sequence of native.results) {
  const run = prepareDay(
    data,
    createRun(data, 'campaign', 0, ['easy', 'normal', 'hard'][sequence.difficulty], 73),
  );
  finishDay(data, run, { ...sequence, kills: 0, won: false });
  const saved = JSON.stringify(run);
  const score = new ResultScore(
    sequence.score,
    sequence.gold,
    sequence.sacrifices,
    sequence.difficulty,
  );
  for (const frame of sequence.frames) {
    score.step();
    assert.deepEqual(
      { score: score.score, gold: score.gold, sacrifices: score.sacrifices },
      { score: frame.score, gold: frame.gold, sacrifices: frame.sacrifices },
    );
  }
  assert.equal(score.active, false, 'settled score counting stops requesting frames');
  assert.equal(run.score, score.score, 'saved total matches the completed original animation');
  assert.equal(JSON.stringify(run), saved, 'animation never changes saved rewards');
}

const motion = new PurchaseMotion();
for (const frame of native.purchase) {
  motion.step();
  assert.equal(motion.elapsed, frame.elapsed);
  assert.equal(motion.scale, frame.scale);
  const commands = [
    ...purchaseScene('Steel Door', motion),
    ...buttonScene({ text: 'NO', rect: [125, 160, 115, 61] }, false, motion),
    ...buttonScene({ text: 'YES', rect: [252, 160, 115, 61] }, false, motion),
  ];
  assert.deepEqual(commands, frame.draws, `native purchase frame ${frame.frame}`);
}
assert.equal(motion.active, false, 'settled dialog stops requesting frames');
for (const button of native.buttons.filter((b) => b.type < 2)) {
  const motion = new PurchaseMotion();
  for (const scale of button.scales) {
    motion.step();
    const commands = buttonScene(
      { text: 'Go Next', rect: [14, 256, 115, 61] },
      false,
      button.type ? motion : undefined,
    );
    assert.equal(commands[0].sx, scale);
    assert.equal(commands[1].size, scale);
  }
}
console.log(
  'Native menus: 260 score frames, 45 dialog frames and normal/dialog button sizes match.',
);
