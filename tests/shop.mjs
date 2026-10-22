import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  shopScene,
  shopLayout,
  shopHit,
  ShopScroll,
  buttonScene,
  purchaseScene,
  resultScene,
} from '../build/web/shop.mjs';
import { canBuy, buy } from '../build/web/campaign.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
const native = JSON.parse(fs.readFileSync('tests/fixtures/shop-layout.json'));
const between = JSON.parse(fs.readFileSync('tests/fixtures/interlevel-data.json'));
const purchases = JSON.parse(fs.readFileSync('tests/fixtures/shop-purchase-clicks.json'));
const run = {
  phase: 'shop',
  inventory: [0, ...Array(12).fill(-1)],
  gold: 0,
  sacrifices: 100,
  config: { disabledShopCategories: [] },
};
const clean = (commands) => commands.map(({ frame, radians, ...command }) => command);
for (const sample of native.states) {
  run.gold = sample.gold;
  run.config.disabledShopCategories = sample.sacrificers_disabled ? ['Sacrificers'] : [];
  assert.deepEqual(clean(shopScene(data, run, sample.offset)), clean(sample.draws));
  for (const record of shopLayout(data, run).items)
    assert.equal(record.left + record.x + sample.offset, sample.positions[record.index]);
}
const categories = [
  'Door Upgrades',
  'Sacrificers',
  'Tower Upgrades 1',
  'Tower Upgrades 2',
  'Tower Upgrades 3',
  'Gun Weapon',
];
for (const sample of native.restrictions) {
  run.config.disabledShopCategories = categories.filter((_, i) => sample.mask & (1 << i));
  const layout = shopLayout(data, run);
  assert.equal(
    layout.width,
    sample.records.reduce((sum, r) => sum + r.width + (r.active ? 10 : 0), 0),
  );
  assert.deepEqual(
    layout.items.map((r) => r.index),
    sample.records.filter((r) => r.active).map((r) => r.index),
  );
  assert.deepEqual(
    shopScene(data, run, 0).filter((r) => r.op === 'text' && r.y === 48),
    sample.headings,
  );
}
run.config.disabledShopCategories = [];
const scroll = new ShopScroll(shopLayout(data, run).width);
for (const sample of native.motion) {
  scroll.step();
  assert.ok(Math.abs(scroll.offset - sample.offset) < 0.001, `native offset frame ${sample.frame}`);
  assert.equal(scroll.velocity, sample.velocity);
}
scroll.down(300);
scroll.move(100);
assert.equal(scroll.up(), false, 'swipes do not purchase');
scroll.down(100);
scroll.move(110);
assert.equal(scroll.up(), true);
assert.equal(shopHit(data, run, 0, 22, 160), null, 'owned items cannot be purchased again');
run.gold = 1000;
assert.equal(shopHit(data, run, 0, 82, 160)?.index, 1);
assert.equal(shopHit(data, run, 0, 82, 250), null, 'prices and bottom controls do not buy items');
assert.equal(buy(data, run, 1), true);
assert.equal(run.gold, 0);
assert.equal(run.inventory[0], 1);
assert.equal(buy(data, run, 1), false, 'confirmation cannot double-charge');
run.gold = 10000;
run.config.disabledShopCategories = ['Gun Weapon'];
assert.equal(canBuy(data, run, 110), false);
assert.equal(canBuy(data, run, 120), true, 'roof is independently available');
run.config.disabledShopCategories = ['Door Upgrades'];
assert.equal(
  canBuy(data, run, 0),
  true,
  'native shop retains the basic door when upgrades are disabled',
);
assert.equal(canBuy(data, run, 2), false);
for (const sample of purchases.cases) {
  run.config.disabledShopCategories = [];
  run.inventory[10] = sample.owned_tier;
  run.gold = 10000;
  run.sacrifices = 100;
  assert.equal(canBuy(data, run, sample.item), sample.dialogs.length > 0);
  if (sample.dialogs.length) {
    const item = data.shop.items.find((item) => item.index === sample.item);
    assert.equal(buy(data, run, sample.item), true);
    assert.equal(run.inventory[10], item.upgradeIndex, 'original replaces the shared spell slot');
    assert.equal(run.gold, 10000 - item.goldCost);
    assert.equal(run.sacrifices, 100 - item.sacrificeCost);
  }
}
const dialog = [
  ...purchaseScene('Steel Door'),
  ...buttonScene({ text: 'NO', rect: [125, 160, 115, 61] }),
  ...buttonScene({ text: 'YES', rect: [252, 160, 115, 61] }),
];
assert.deepEqual(
  clean(dialog)
    .filter((r) => r.op !== 'fill')
    .map(({ alpha, ...r }) => r),
  clean(between.purchase).map(({ alpha, ...r }) => r),
);
for (const sample of between.screens) {
  const score = sample.draws
    .filter((d) => d.op === 'text')
    .at(-1)
    .text.match(/\d+/)[0];
  assert.deepEqual(
    clean(
      resultScene(
        {
          phase: sample.phase,
          day: sample.day,
          mode: 'campaign',
          kills: sample.kills,
          score: Number(score),
        },
        8,
        sample.day_kills,
      ),
    ),
    clean(sample.draws),
  );
}
console.log(
  'Shop: 16 native drawings, 8 restriction sets, 120 entry frames, purchase dialog and results screens match.',
);
