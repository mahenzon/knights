import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { waitForActiveWorker } from '../build/web/offline.mjs';

class Worker extends EventTarget {
  constructor(state) {
    super();
    this.state = state;
  }
  change(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}
const installer = new Worker('installing'),
  registration = { installing: installer, active: null, waiting: null };
const installed = waitForActiveWorker(registration);
let finished = false;
installed.then(() => {
  finished = true;
});
installer.change('installed');
await Promise.resolve();
assert.equal(finished, false, 'downloaded is not yet active');
registration.active = installer;
installer.change('activated');
assert.equal(await installed, installer);
const failed = new Worker('installing');
const interrupted = waitForActiveWorker({ installing: failed });
failed.change('redundant');
await assert.rejects(interrupted, /interrupted/);
await assert.rejects(waitForActiveWorker({}), /did not start/);
assert.equal(
  await waitForActiveWorker({ active: installer, installing: failed }),
  installer,
  'a failed update does not disable the existing offline version',
);

const origin = 'https://knights.example',
  scope = `${origin}/games/knights/`,
  prefix = `knights-web:${scope}:`,
  files = ['index.html', 'game.mjs', 'knights_core.wasm', 'assets/music.mp3'],
  failedPath = `${scope}knights_core.wasm`,
  stores = new Map([
    [`${prefix}old`, new Map()],
    [`knights-web:${origin}/other/:old`, new Map()],
    ['knights-web-legacy', new Map()],
  ]),
  requests = [],
  listeners = {},
  notices = [];
let unavailable = true;
const caches = {
  async open(key) {
    if (!stores.has(key)) stores.set(key, new Map());
    const entries = stores.get(key);
    return {
      async match(url) {
        return entries.get(typeof url === 'string' ? url : url.url)?.clone();
      },
      async put(url, response) {
        entries.set(url, new Response(await response.arrayBuffer()));
      },
      async keys() {
        return [...entries.keys()];
      },
    };
  },
  async keys() {
    return [...stores.keys()];
  },
  async delete(key) {
    return stores.delete(key);
  },
};
const context = vm.createContext({
  VERSION: 'new',
  FILES: files,
  URL,
  Response,
  caches,
  fetch: async (url) => {
    requests.push(url);
    if (unavailable && url === failedPath) return new Response(null, { status: 503 });
    return new Response(`download:${url}`);
  },
  self: {
    location: { origin },
    registration: { scope },
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
    clients: {
      async claim() {},
      async matchAll() {
        return [{ postMessage: (value) => notices.push(value.type) }];
      },
    },
  },
});
vm.runInContext(fs.readFileSync('web/sw.js', 'utf8'), context);
function dispatch(name, fields = {}) {
  let result;
  listeners[name]({
    ...fields,
    waitUntil(promise) {
      result = promise;
    },
  });
  return result;
}
await assert.rejects(dispatch('install'), /Offline download failed/);
assert.ok(stores.has(`${prefix}old`), 'interrupted updates retain the working version');
await dispatch('message', {
  data: { type: 'status' },
  source: { postMessage: (value) => notices.push(value.type) },
});
assert.deepEqual(notices, [], 'an incomplete download must never announce offline readiness');
// Let the independent successful response writes finish before retrying this worker version.
await new Promise((resolve) => setImmediate(resolve));
unavailable = false;
requests.length = 0;
await dispatch('install');
assert.deepEqual(requests, [failedPath], 'retry downloads only the missing file');
assert.ok(stores.has(`${prefix}old`), 'installation alone does not evict the active version');
await dispatch('activate');
assert.deepEqual(notices, ['offline-ready']);
assert.equal(stores.has(`${prefix}old`), false);
assert.equal(stores.get(`${prefix}new`).size, files.length);
assert.ok(
  stores.has(`knights-web:${origin}/other/:old`),
  'other installation caches are preserved',
);
assert.ok(stores.has('knights-web-legacy'), 'unscoped legacy caches have unknown ownership');

let offlinePage;
listeners.fetch({
  request: { method: 'GET', url: `${scope}?mute=1`, mode: 'navigate', headers: new Headers() },
  respondWith(result) {
    offlinePage = result;
  },
});
assert.equal(await (await offlinePage).text(), `download:${scope}index.html`);
const manifest = JSON.parse(fs.readFileSync('build/web/manifest.webmanifest'));
assert.equal(manifest.display, 'fullscreen', 'Installed game requests hidden system bars');
const packed = JSON.parse(fs.readFileSync('build/web/sw.js', 'utf8').match(/const FILES=(.*);/)[1]);
for (const icon of [
  ...manifest.icons,
  { src: './apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
]) {
  const png = fs.readFileSync(`build/web/${icon.src}`);
  assert.equal(icon.type, 'image/png');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  assert.deepEqual(png, fs.readFileSync(`web/${icon.src}`), 'packaged icon matches the source');
  assert.ok(packed.includes(icon.src.slice(2)), 'icon is in the offline allowlist');
}
assert.deepEqual(
  manifest.icons.map((icon) => icon.sizes),
  ['192x192', '512x512'],
);
assert.ok(
  fs.readFileSync('build/web/index.html', 'utf8').includes('href="./apple-touch-icon.png"'),
);
console.log(
  'Offline: failed first install reports failure, retry reuses files, updates are atomic, subpath launch works.',
);
