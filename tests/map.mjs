import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  developerMode,
  castleAvailable,
  mapCamera,
  mapScene,
  mapDetails,
  readCastleRecords,
  recordCastleScore,
  mapControls,
} from '../build/web/map.mjs';
import { mapAssets } from '../build/web/assets.mjs';
import { dialogScene } from '../build/web/shop.mjs';
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const native = JSON.parse(fs.readFileSync('tests/fixtures/map-data.json'));
assert.equal(developerMode(''), false);
assert.equal(developerMode('?dev=0'), false);
assert.equal(developerMode('?dev=1'), true);
assert.equal(castleAvailable({}, 0), true);
assert.equal(castleAvailable({}, 1), false);
assert.equal(castleAvailable({ 'easy:0': true }, 1), true);
assert.equal(castleAvailable({ 'normal:0': true }, 2), false);
assert.equal(
  castleAvailable({ 'normal:4': true }, 4),
  true,
  'Keep already completed castles accessible',
);
assert.deepEqual(mapCamera(0, 300), [-420, 0]);
assert.deepEqual(mapCamera(-900, -900), [-540, -430]);
for (const fixture of native) {
  const completed = Object.fromEntries(fixture.completed.map((i) => [`normal:${i}`, true]));
  const actual = mapScene(data.levels, completed, fixture.camera, fixture.selected);
  assert.equal(actual.length, fixture.draws.length);
  fixture.draws.forEach((expected, i) => {
    for (const key of ['op', 'image', 'x', 'y', 'sx', 'sy'])
      assert.equal(actual[i][key], expected[key], `${i} ${key}`);
    assert.ok(fs.existsSync(`dist/assets/${actual[i].image}`));
    assert.ok(mapAssets.includes(actual[i].image), `Map must preload ${actual[i].image}`);
  });
}
const details = JSON.parse(fs.readFileSync('tests/fixtures/map-details.json'));
for (const fixture of details.fixtures) {
  const actual = mapDetails(
    data.levels[fixture.selected],
    fixture.selected,
    fixture.completed,
    { last: fixture.record, best: fixture.current },
    fixture.panel,
  );
  const expected = fixture.draws.filter((d) => d.op === 'text' || d.image === 'mapstar.png');
  assert.equal(actual.length, expected.length);
  expected.forEach((draw, i) => {
    for (const key of Object.keys(actual[i]))
      assert.deepEqual(actual[i][key], draw[key], `${fixture.selected} ${i} ${key}`);
  });
}
for (const fixture of details.records.filter((r) => !r.endless)) {
  const records = readCastleRecords(null);
  records[0].best = fixture.best;
  const result = recordCastleScore(records, 0, fixture.score);
  assert.deepEqual([result[0].last, result[0].best], fixture.after);
  assert.equal(records[0].best, fixture.best, 'no mutation before successful persistence');
}
for (const value of [
  null,
  'invalid',
  '{}',
  '[null, 1, [], {"last":-1,"best":2}]',
  '[{"last":2,"best":1e99}]',
])
  assert.deepEqual(
    readCastleRecords(value),
    Array.from({ length: 12 }, () => ({ last: 0, best: 0 })),
  );
assert.equal(readCastleRecords('[{"last":42,"best":123}]')[0].best, 123);
assert.throws(() => recordCastleScore(readCastleRecords(null), 12, 10));
assert.throws(() => recordCastleScore(readCastleRecords(null), 0, NaN));
details.controls.forEach((control, i) => {
  assert.deepEqual(
    mapControls[i].rect,
    control.rect.map((n) => n | 0),
  );
  assert.equal(mapControls[i].text, control.text);
});
assert.equal(details.hints.length, 12);
for (const hint of details.hints) {
  const actual = dialogScene(data.levels[hint.selected].hint);
  actual.forEach((draw, i) => {
    for (const key of Object.keys(draw)) assert.deepEqual(draw[key], hint.draws[i][key]);
  });
}
console.log(
  'Map: access, camera bounds, scenes, captions, score validation, controls and all 12 hints pass.',
);
