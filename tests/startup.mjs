import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mapAssets, helpAssets } from '../build/web/assets.mjs';

const source = fs.readFileSync(process.argv[2] || 'web/game.mjs', 'utf8');
const boot = source.slice(
  source.indexOf('async function boot()'),
  source.indexOf('async function loadBattleImages('),
);
const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function launch(installed, waitingUpdate = false) {
  const cache = deferred(),
    images = deferred(),
    panels = [],
    elements = new Map();
  let menus = 0,
    downloads = 0,
    warmed = 0,
    updates = 0,
    requestedImages = [];
  if (waitingUpdate) elements.set('#update', { hidden: false, onclick: () => updates++ });
  const context = vm.createContext({
    URLSearchParams,
    location: { search: '', reload() {} },
    prepareAudio() {},
    mainAssets: [],
    playAssets: [],
    optionAssets: [],
    mapAssets,
    helpAssets,
    navigator: { standalone: installed },
    window: { matchMedia: () => ({ matches: false }) },
    fetch: async () => ({
      ok: true,
      json: async () => ({ art: {} }),
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '',
    }),
    WebAssembly: {
      instantiate: async () => ({ instance: { exports: { fix_ballista_gate() {} } } }),
    },
    ImageLoader: class {},
    assets: new Map(),
    decodeImage() {},
    parseFont() {},
    offline() {
      downloads++;
      return cache.promise;
    },
    loadImages(names) {
      requestedImages = names;
      return images.promise;
    },
    resize() {},
    toMenu() {
      menus++;
    },
    setTimeout(fn) {
      fn();
    },
    warmMenu() {
      warmed++;
    },
    show(...args) {
      panels.push(args);
    },
    $: (selector) => {
      if (!elements.has(selector)) elements.set(selector, { removeAttribute() {} });
      return elements.get(selector);
    },
    console: { error() {} },
  });
  vm.runInContext(boot, context);
  const done = context.boot();
  return {
    cache,
    images,
    panels,
    elements,
    done,
    menus: () => menus,
    downloads: () => downloads,
    warmed: () => warmed,
    updates: () => updates,
    requestedImages: () => requestedImages,
  };
}
for (const installed of [false, true]) {
  const app = launch(installed);
  await flush();
  assert.equal(
    app.downloads(),
    1,
    'A fresh launch starts caching before sound warmup or a controlling worker',
  );
  assert.equal(app.menus(), 0);
  assert.equal(
    app.warmed(),
    0,
    'Bulk audio/battle warmup must not compete with the first full download',
  );
  if (installed) {
    assert.equal(app.panels[0][0], 'Preparing offline play');
    assert.equal(
      app.elements.get('#loading').hidden,
      false,
      'Installed first launch exposes download progress',
    );
    assert.equal(
      app.requestedImages().length,
      0,
      'Installed startup reads artwork after the full offline cache is ready',
    );
    app.cache.resolve(true);
    await flush();
  }
  for (const name of [...mapAssets, ...helpAssets])
    assert.ok(
      app.requestedImages().includes(name),
      `Startup prepares ${name} before enabling Campaign or Help`,
    );
  assert.equal(app.menus(), 0, 'Campaign must not be tappable while map decoding is pending');
  app.images.resolve();
  await app.done;
  assert.equal(app.menus(), 1);
  if (!installed) {
    assert.equal(app.warmed(), 0);
    app.cache.resolve(true);
  }
  await flush();
  assert.equal(app.warmed(), 1);
}
const failed = launch(true);
await flush();
failed.cache.resolve(false);
await failed.done;
assert.equal(failed.menus(), 0, 'An incomplete installed download cannot be presented as ready');
assert.equal(failed.panels.at(-1)[0], 'Offline download incomplete');
assert.equal(failed.panels.at(-1)[2][0][0], 'Try again');
const obsolete = launch(true, true);
await flush();
obsolete.cache.resolve(false);
await obsolete.done;
assert.equal(obsolete.menus(), 0);
const update = obsolete.panels.at(-1)[2].find(([label]) => label === 'Update game');
assert.ok(
  update,
  'A waiting update remains accessible when the old offline cache cannot be repaired',
);
update[1]();
assert.equal(obsolete.updates(), 1);
console.log(
  'Startup: early offline caching, installed readiness gate/progress/retry, map-before-menu and deferred sound warmup pass.',
);
