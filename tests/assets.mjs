import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ImageLoader, battleAssets, mapAssets, helpAssets } from '../build/web/assets.mjs';
import { createRun, prepareDay, equipment } from '../build/web/campaign.mjs';
import { deviceScene, objectScene, missileScene } from '../web/scene.mjs';
const data = JSON.parse(fs.readFileSync('build/web/game-data.json'));
assert.ok(data.art, 'Build must provide packed artwork');
for (const name of mapAssets)
  assert.notEqual(
    data.art[name]?.[0],
    'extras',
    `Map must preload ${name} without the unused extras pack`,
  );
const packs = new Map();
for (const [name, [pack, offset, length]] of Object.entries(data.art)) {
  if (!packs.has(pack)) packs.set(pack, fs.readFileSync(`build/web/art/${pack}.pack`));
  assert.deepEqual(
    packs.get(pack).subarray(offset, offset + length),
    fs.readFileSync(`dist/assets/${name}`),
    `Unchanged pixels: ${name}`,
  );
}
for (let castle = 0; castle < 12; castle++) {
  const run = prepareDay(data, createRun(data, 'campaign', castle, 'normal', 73));
  for (const item of data.shop.items) {
    run.inventory[item.inventoryIndex] = item.upgradeIndex;
    const names = battleAssets(data, run.config.enemyTypeTable, run);
    for (const name of names) assert.ok(data.art[name], `Pack missing ${name}`);
    for (const name of data.fragmentSprites) {
      assert.ok(names.includes(name), `Day must preload debris ${name}`);
      assert.equal(data.art[name][0], 'effects');
    }
    for (const d of equipment(data, run)) {
      const base = {
        kind: d.typeId,
        tier: d.upgradeIndex,
        x: d.x,
        y: d.y,
        cooldown: 10,
        angle: 0,
        recoil: 0,
        animation: 1,
        pressed: true,
        time: 1,
      };
      for (const elapsed of [0, 11])
        for (const command of deviceScene({ ...base, elapsed }))
          assert.ok(names.includes(command.image), `Day must load ${command.image}`);
      if ([6, 8].includes(d.typeId))
        for (const command of missileScene({
          kind: d.typeId === 8 ? 3 : [0, 2, 1][Math.floor(d.upgradeIndex / 3)],
          tier: d.typeId === 8 ? d.upgradeIndex : 0,
          x: 200,
          y: 150,
          angle: 0,
          time: 1,
        }))
          assert.ok(names.includes(command.image), `Missile must load ${command.image}`);
      if ([2, 4, 5].includes(d.typeId))
        for (const command of objectScene({
          kind: { 2: 0, 4: 1, 5: 2 }[d.typeId],
          tier: d.upgradeIndex,
          x: 150,
          y: 130,
          angle: 0,
          size: 1,
          charge: 1,
          time: 1,
        }))
          assert.ok(names.includes(command.image), `Object must load ${command.image}`);
    }
  }
}
const requests = [],
  decoded = [],
  assets = new Map();
let fail = false;
globalThis.fetch = async (url) => {
  requests.push(url);
  await new Promise((r) => setTimeout(r, 1));
  if (fail) {
    fail = false;
    return new Response('', { status: 503 });
  }
  return new Response(packs.get(url.match(/\/([^/]+)\.pack$/)[1]));
};
const loader = new ImageLoader(data.art, assets, async (name, blob) => {
  decoded.push(name);
  assert.ok(blob.size > 0);
  return { name };
});
const run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73)),
  names = battleAssets(data, run.config.enemyTypeTable, run);
await Promise.all([loader.load(names), loader.load(names), loader.load(mapAssets)]);
assert.equal(
  new Set(requests).size,
  requests.length,
  'Concurrent menu/Play requests share downloads',
);
assert.equal(new Set(decoded).size, decoded.length, 'Concurrent menu/Play requests share decodes');
const before = requests.length;
await loader.load(names);
assert.equal(requests.length, before, 'Prepared Play needs no network');
await Promise.all([loader.load(helpAssets), loader.load(helpAssets)]);
assert.equal(requests.length, before + 1, 'All five help pages share one request');
const decodedBefore = decoded.length;
await loader.load([...helpAssets].reverse());
assert.equal(requests.length, before + 1, 'Help navigation never fetches another image');
assert.equal(decoded.length, decodedBefore, 'Help navigation never waits for image decoding');
const failed = new ImageLoader(data.art, new Map(), async () => ({}));
fail = true;
await assert.rejects(failed.image('sun.png'));
await failed.image('sun.png');
const broken = new ImageLoader({ 'x.png': ['common', 0, 1e9] }, new Map(), async () => ({}));
await assert.rejects(broken.image('x.png'), /Incomplete/);
const groups = [...new Set(names.map((n) => data.art[n][0]))];
assert.ok(
  groups.reduce((size, group) => size + packs.get(group).length, 0) < 2 * 1024 * 1024,
  'First-day effects must not pull in the large unused extras pack',
);
console.log(
  `Artwork: all ${Object.keys(data.art).length} packed images byte-identical; equipped weapons covered, deduplication/retry pass. First day: ${names.length} images in ${groups.length} requests (${(groups.reduce((s, g) => s + packs.get(g).length, 0) / 1024 / 1024).toFixed(2)} MiB).`,
);
