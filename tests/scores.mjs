import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  ScoreScroll,
  scoreScene,
  scoreButtons,
  readScores,
  addScore,
  scoreName,
} from '../build/web/scores.mjs';
import { resultScene } from '../build/web/shop.mjs';
const native = JSON.parse(fs.readFileSync('tests/fixtures/hiscores.json'));
const tables = [[], []];
for (const { mode, rank, ...entry } of native.entries) tables[mode][rank] = entry;
for (const scene of native.scenes)
  assert.deepEqual(
    scoreScene(tables, scene.offset),
    scene.draws.map(({ frame: _frame, radians: _radians, ...d }) => d),
  );
assert.deepEqual(
  scoreButtons,
  native.controls.map(({ text, rect }) => ({ text, rect })),
);
const scroll = new ScoreScroll();
for (const frame of native.motion) {
  if (frame.frame === 1) scroll.down(220);
  if (frame.frame === 2) scroll.move(190);
  if (frame.frame === 3) scroll.move(150);
  if (frame.frame === 4) scroll.up();
  scroll.step();
  assert.equal(scroll.offset, frame.offset);
  assert.equal(scroll.velocity, frame.velocity);
}
for (let i = 0; i < 100; i++) scroll.step();
assert.equal(scroll.active, false, 'idle score lists stop requesting frames');
assert.deepEqual(
  resultScene({ mode: 'endless', phase: 'failed', day: 3, kills: 0, score: 123456 }, 10000, 0),
  native.result_draws.map(({ frame: _frame, radians: _radians, alpha: _alpha, ...d }) => d),
);
for (const bad of [null, 'oops', '{}', '[null,null]', '[[null,0,{}],[]]'])
  assert.deepEqual(readScores(bad), [[], []]);
assert.equal(scoreName(''), 'PLAYER');
assert.equal(scoreName('123456789012345'), '12345678901234');
assert.ok(new TextEncoder().encode(scoreName('👑'.repeat(14))).length <= 14);
let scores = [[], []];
for (let i = 0; i < 105; i++) scores = addScore(scores, 'endless', 'PLAYER', i);
assert.equal(scores[0].length, 100);
assert.equal(scores[0][0].score, 104);
assert.equal(scores[0][99].score, 5);
assert.equal(scores[0].filter((s) => s.highlighted).length, 1);
const previous = structuredClone(scores);
scores = addScore(scores, 'madness', 'Friend', 999);
assert.equal(scores[0].filter((s) => s.highlighted).length, 0);
assert.equal(scores[1][0].name, 'Friend');
assert.equal(previous[0][0].highlighted, true, 'writing another list does not mutate stored input');
assert.deepEqual(readScores(JSON.stringify(scores)), scores);
for (const invalid of [-1, NaN, 2 ** 32, 1.5])
  assert.throws(() => addScore(scores, 'endless', '', invalid));
console.log(
  'Scores: native columns, 25 rows, 4 scroll views, 64 inertia frames, result name frame and bounded persistence pass.',
);
