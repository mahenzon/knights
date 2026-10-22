import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock } from 'node:test';
import { Soundtrack } from '../build/web/audio.mjs';
const pending = [],
  events = {},
  calls = [];
const audio = {
  currentTime: 0,
  source: '',
  get src() {
    return this.source;
  },
  set src(value) {
    this.source = value;
    this.currentTime = 0;
    this.metadataPending = true;
  },
  paused: true,
  addEventListener(name, callback) {
    events[name] = callback;
  },
  play() {
    calls.push(this.src);
    this.paused = false;
    return new Promise((resolve, reject) =>
      pending.push({
        resolve() {
          if (audio.metadataPending) {
            audio.metadataPending = false;
            audio.onloadedmetadata?.();
          }
          resolve();
        },
        reject,
      }),
    );
  },
  pause() {
    this.paused = true;
  },
  removeAttribute(name) {
    assert.equal(name, 'src');
    this.source = '';
    this.metadataPending = false;
  },
  load() {
    this.currentTime = 0;
    this.paused = true;
    this.error = null;
    this.metadataPending = Boolean(this.src);
  },
};
let blocked = 0;
const music = new Soundtrack(audio, () => blocked++);
const native = JSON.parse(fs.readFileSync('tests/fixtures/music-transitions.json'));
assert.equal(
  native.binary_sha256,
  'a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1',
);
const menuTrack = native.cases.find((c) => c.request === 0).state.file;
const gameTrack = native.cases.find((c) => c.request === 1).state.file;
assert.equal(audio.volume, native.cases[0].state.volume, 'original initial soundtrack volume');
let playing = music.play('menu');
assert.equal(calls.length, 1, 'play must run synchronously inside the gesture');
assert.equal(audio.src, `./assets/${menuTrack}`);
assert.equal(audio.loop, false, 'native finite loop count is handled by ended events');
pending.shift().resolve();
await playing;
audio.onloadedmetadata();
audio.currentTime = 12;
playing = music.play('game');
assert.equal(audio.src, `./assets/${gameTrack}`);
assert.equal(audio.loop, false);
pending.shift().resolve();
await playing;
audio.onloadedmetadata();
audio.currentTime = 23;
music.pause();
assert.equal(audio.src, '', 'pause must release the OS media player, not leave a resumable source');
assert.equal(audio.muted, true, 'OS playback cannot emit a transient before a JS event handler');
playing = music.play('game');
pending.shift().resolve();
await playing;
audio.onloadedmetadata();
assert.equal(audio.currentTime, 23, 'resume must keep the song position');
playing = music.play('menu');
pending.shift().resolve();
await playing;
audio.onloadedmetadata();
assert.equal(audio.currentTime, 0, 'native group switch replaces the player and restarts music');
playing = music.play('game');
pending.shift().resolve();
await playing;
audio.onloadedmetadata();
assert.equal(audio.currentTime, 0, 'battle music restarts after a different group');
for (let i = 0; i < native.cases[0].state.loops; i++) {
  events.ended();
  assert.equal(audio.src, `./assets/${gameTrack}`, 'native repeats one track, never cycles files');
  pending.shift().resolve();
  await Promise.resolve();
  audio.onloadedmetadata();
  assert.equal(audio.currentTime, 0);
}
const exhausted = calls.length;
events.ended();
await music.play('game');
assert.equal(calls.length, exhausted, '100 repeats means 101 total plays, not endless looping');
playing = music.play('menu');
pending.shift().resolve();
await playing;
playing = music.play('game');
music.pause();
pending.shift().resolve();
await playing;
assert.equal(audio.paused, true, 'a late play promise must not restart background audio');
// OS media controls can start the element without calling Soundtrack.play().
const externalPlay = audio.play();
events.playing();
pending.shift().resolve();
await externalPlay;
assert.equal(audio.paused, true, 'external media controls must not restart background audio');
const before = calls.length;
events.ended();
assert.equal(calls.length, before, 'background ended event must not advance playback');
playing = music.play('game');
music.pause();
pending.shift().reject();
await playing;
assert.equal(blocked, 0, 'ignore stale errors');
playing = music.play('game');
pending.shift().reject();
await playing;
assert.equal(blocked, 1, 'report real playback failure');
playing = music.play('game');
pending.shift().resolve();
await playing;
assert.equal(audio.paused, false, 'first gesture retries browser-blocked autoplay');
events.playing();
assert.equal(audio.paused, false, 'wanted music still plays after returning to the game');
let reloads = 0;
audio.error = { code: 2 };
audio.currentTime = 17;
audio.load = () => {
  if (audio.src) reloads++;
  audio.error = null;
  audio.currentTime = 0;
  audio.paused = true;
  audio.metadataPending = Boolean(audio.src);
};
playing = music.play('game');
assert.equal(reloads, 1, 'a failed download must be reloaded before retrying playback');
audio.onloadedmetadata();
assert.equal(audio.currentTime, 17, 'network recovery preserves the track position');
pending.shift().resolve();
await playing;
music.pause();
assert.equal(reloads, 1, 'background pause must not trigger a media retry');
// A 503 before metadata is MEDIA_ERR_SRC_NOT_SUPPORTED in Chromium, not NETWORK.
audio.error = { code: 4 };
playing = music.play('game');
assert.equal(reloads, 2, 'a failed first download must recover even when reported as code 4');
pending.shift().resolve();
await playing;
mock.timers.enable({ apis: ['setTimeout'] });
audio.error = { code: 4 };
events.error();
assert.equal(reloads, 2);
mock.timers.tick(500);
assert.equal(reloads, 3, 'a first-download failure retries without another tap');
pending.shift().resolve();
await Promise.resolve();
events.playing();
audio.error = { code: 2 };
events.error();
music.pause();
mock.timers.tick(5000);
assert.equal(reloads, 3, 'background pause cancels pending retries');
for (let attempt = 0; attempt < 4; attempt++) {
  if (attempt === 0) {
    playing = music.play('game');
    pending.shift().resolve();
    await playing;
    events.playing();
  }
  audio.error = { code: 4 };
  events.error();
  const before = reloads;
  mock.timers.tick(4000);
  assert.equal(reloads, before + (attempt < 3 ? 1 : 0), 'automatic retries are bounded');
  if (attempt < 3) {
    pending.shift().resolve();
    await Promise.resolve();
  }
}
assert.equal(blocked, 2, 'a persistent download failure is reported after three retries');
music.pause();
mock.timers.reset();
playing = music.play('game');
pending.shift().resolve();
await playing;
let assigned = 0,
  started = 0;
const prefetched = {
  get src() {
    return `https://private.example/assets/${menuTrack}`;
  },
  set src(_value) {
    assigned++;
  },
  addEventListener() {},
  play() {
    started++;
    return Promise.resolve();
  },
  pause() {},
};
await new Soundtrack(prefetched).play('menu');
assert.equal(started, 1);
assert.equal(assigned, 0, 'Autoplay must reuse the soundtrack already loading from HTML');
const html = fs.readFileSync('web/index.html', 'utf8');
assert.match(html, /<audio[^>]*preload="auto"[^>]*src="\.\/assets\/knights_gameplay_02.mp3"/);
assert.ok(!html.includes('loading-music'), 'No separate soundtrack permission button');

const downloads = new Map(),
  requested = [];
globalThis.fetch = (url) => {
  requested.push(url);
  const pending = Promise.withResolvers();
  downloads.set(url, pending);
  return pending.promise;
};
const warm = Promise.all([music.preload('game'), music.preload('menu')]);
let ready = false;
warm.then(() => {
  ready = true;
});
assert.equal(downloads.size, 2, 'preload both native soundtrack groups');
for (const [url, pending] of [...downloads].slice(0, 1)) {
  pending.resolve(new Response('compressed music', { headers: { 'Content-Type': 'audio/mpeg' } }));
  downloads.delete(url);
}
await new Promise(setImmediate);
assert.equal(ready, false, 'music readiness waits for complete downloads');
[...downloads.values()][0].resolve(new Response('last track'));
await warm;
assert.equal(ready, true);
await music.preload('game');
assert.equal(requested.length, 2, 'preloading reuses complete downloads');
audio.error = null;
audio.currentTime = 19;
playing = music.play('game');
assert.match(audio.src, /^blob:/, 'ready music cannot depend on another network request');
audio.onloadedmetadata();
assert.equal(audio.currentTime, 19, 'switching streaming to fully downloaded music keeps position');
pending.shift().resolve();
await playing;
for (let i = 0; i < 3; i++) {
  events.ended();
  assert.match(audio.src, /^blob:/, 'playlist advancement uses downloaded tracks too');
  pending.shift().resolve();
  await Promise.resolve();
}
music.pause();
const afterPause = calls.length;
await music.ready('game');
assert.equal(
  calls.length,
  afterPause,
  'finishing a preload in the background must not restart music',
);
playing = music.play('game');
pending.shift().resolve();
await playing;
audio.currentTime = 37.5;
music.pause();
music.pause();
assert.equal(audio.src, '', 'duplicate background events keep the source detached');
playing = music.play('game');
const lateMetadata = audio.onloadedmetadata;
music.pause();
lateMetadata();
pending.shift().reject();
await playing;
assert.equal(audio.src, '', 'late metadata cannot reattach background media');
assert.equal(audio.muted, true);
playing = music.play('game');
pending.shift().resolve();
await playing;
assert.equal(audio.currentTime, 37.5, 'pause during metadata loading preserves the saved position');
assert.equal(audio.muted, false, 'explicit in-game resume restores sound');
music.pause();
const sleepingCalls = calls.length;
mock.timers.enable({ apis: ['setTimeout'] });
mock.timers.tick(180000);
assert.equal(calls.length, sleepingCalls, 'three background minutes schedule no music playback');
assert.equal(audio.src, '');
mock.timers.reset();
const failing = new Soundtrack(prefetched);
const interrupted = failing.preload('game');
for (const item of downloads.values()) item.resolve(new Response('failed', { status: 503 }));
await assert.rejects(interrupted, /download failed/);
assert.equal(failing.downloads.size, 0, 'failed downloads remain retryable');
const recovered = failing.preload('game');
for (const item of downloads.values()) item.resolve(new Response('recovered'));
await recovered;
assert.equal(failing.sources.size, 1);
for (const url of [...music.sources.values(), ...failing.sources.values()])
  URL.revokeObjectURL(url);
console.log(
  'OST: native track selection, finite loops, group restart, gesture timing, cached resume and background races pass.',
);
