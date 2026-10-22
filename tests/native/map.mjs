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
  MapMotion,
  campaignCompleteText,
} from '../../build/web/map.mjs';
import { mapAssets } from '../../build/web/assets.mjs';
import { dialogScene, PurchaseMotion, buttonScene } from '../../build/web/shop.mjs';
const data = JSON.parse(fs.readFileSync('web/game-data.json'));
const native = JSON.parse(fs.readFileSync('research/map-data.json'));
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
  });
}
const details = JSON.parse(fs.readFileSync('research/map-details.json'));
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
const animations = JSON.parse(fs.readFileSync('research/animation-map.json'));
assert.equal(
  animations.binary_sha256,
  'a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1',
);
function motionState(m) {
  return {
    camera: m.camera,
    target: m.target,
    panel: m.panel,
    panel_hidden: Number(m.panelOpen),
    camera_delay: m.delay,
    pending_selection: Number(m.pendingSelection),
    manualCamera: Number(m.manualCamera),
    selected: m.selected,
    markers: m.markers.map((marker, i) => ({
      x: data.levels[i].mapPosition[0],
      y: data.levels[i].mapPosition[1],
      selected: Number(marker.selected),
      scale: marker.scale,
      flash: Number(marker.flash),
      flash_time: marker.flashTime,
    })),
  };
}
function compareDraws(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} draw count`);
  actual.forEach((draw, i) => {
    const normalized = { alpha: 1, blend: 'source-over', ...draw };
    for (const [key, value] of Object.entries(expected[i])) {
      if (key === 'frame' || (key === 'radians' && draw.op === 'blit')) continue;
      if (typeof value === 'number')
        assert.ok(
          Math.abs(normalized[key] - value) < 0.00002,
          `${label} draw${i} ${key}: ${normalized[key]} != ${value}`,
        );
      else assert.deepEqual(normalized[key], value, `${label} draw${i} ${key}`);
    }
  });
}
for (const c of animations.cases) {
  const motion = new MapMotion(data.levels),
    completed = {};
  motion.markers.forEach((m, i) => {
    m.selected = i === c.selected;
    if (c.won) m.scale = i === c.selected ? 1.5 : 1;
  });
  for (let i = 0; i < c.selected + Number(c.won); i++) completed[`normal:${i}`] = true;
  motion.enter(c.selected, c.won);
  const { dialogs: _, ...initial } = c.initialState;
  assert.deepEqual(motionState(motion), initial);
  let dialog = c.initialState.dialogs.some(Boolean);
  for (const row of c.frames) {
    for (const [action, x, y] of row.actions) {
      if (action === 'hint') dialog = true;
      if (action === 'down') motion.down(x, y, dialog);
      if (action === 'move') motion.move(x, y, dialog);
      if (action === 'up') motion.up();
    }
    dialog = row.before.dialogs.some(Boolean);
    motion.step(row.time);
    const { dialogs: _, ...expected } = row.state;
    assert.deepEqual(
      motionState(motion),
      expected,
      `map state ${c.won}/${c.manual}/${c.selected} frame${row.frame}`,
    );
    const actual = [
      ...mapScene(data.levels, completed, motion.frameCamera, motion.selected, motion.frame),
      ...mapDetails(
        data.levels[motion.selected],
        motion.selected,
        Boolean(completed[`normal:${motion.selected}`]),
        { last: 0, best: 0 },
        motion.panel,
      ),
      ...motion.effects(),
    ];
    const expectedDraws = row.draws.slice(
      0,
      row.draws.findIndex((d) => d.op === 'fill') < 0
        ? undefined
        : row.draws.findIndex((d) => d.op === 'fill'),
    );
    compareDraws(actual, expectedDraws, `map ${c.won}/${c.manual}/${c.selected} frame${row.frame}`);
    for (const d of actual.filter((d) => d.image))
      assert.ok(mapAssets.includes(d.image), `Map must preload ${d.image}`);
  }
}
const finalCastle = animations.cases.find((c) => c.selected === 11),
  dialogMotion = new PurchaseMotion();
for (const row of finalCastle.frames) {
  dialogMotion.step();
  const draws = [
    ...dialogScene(campaignCompleteText, dialogMotion),
    ...buttonScene({ text: 'OK', rect: [160, 200, 115, 61] }, false, dialogMotion),
  ];
  compareDraws(
    draws,
    row.draws.slice(row.draws.findIndex((d) => d.op === 'fill')),
    `campaign complete dialog frame${row.frame}`,
  );
}
console.log(
  'Map: 930 native animation/input frames, completion flash/pan, panel motion, marker pulses, final-castle dialog, captions, scores and all 12 hints pass.',
);
