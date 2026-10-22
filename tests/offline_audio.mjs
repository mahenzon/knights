import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners = {},
  origin = 'https://knights.example',
  bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
const context = vm.createContext({
  VERSION: 'test',
  FILES: ['assets/music.mp3'],
  URL,
  Headers,
  Response,
  self: {
    registration: { scope: `${origin}/` },
    location: { origin },
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
  },
  caches: {
    async open() {
      return {
        async match() {
          return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } });
        },
      };
    },
  },
});
vm.runInContext(fs.readFileSync('web/sw.js', 'utf8'), context);
async function get(range) {
  let result;
  listeners.fetch({
    request: new Request(`${origin}/assets/music.mp3`, { headers: range ? { Range: range } : {} }),
    respondWith(p) {
      result = p;
    },
  });
  return result;
}
for (const [range, start, end] of [
  ['bytes=0-1', 0, 1],
  ['bytes=70-', 70, 99],
  ['bytes=-10', 90, 99],
  ['bytes=90-1000', 90, 99],
]) {
  const r = await get(range);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), `bytes ${start}-${end}/100`);
  assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes.slice(start, end + 1));
}
for (const range of ['bytes=100-', 'bytes=70-60', 'bytes=-0'])
  assert.equal((await get(range)).status, 416);
for (const range of [null, 'bytes=0-1,5-6', 'invalid']) {
  const r = await get(range);
  assert.equal(r.status, 200);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
}
console.log(
  'Offline OST: cached full responses, Safari-style byte probes, seeking, suffixes and invalid ranges pass.',
);
