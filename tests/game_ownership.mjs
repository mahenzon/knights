import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRun, prepareDay, startBattle } from '../build/web/campaign.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8'),
  section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to)),
  wasm = new WebAssembly.Module(fs.readFileSync('build/web/knights_core.wasm')),
  data = JSON.parse(fs.readFileSync('build/web/game-data.json')),
  stored = new Map(),
  key = 'save-campaign',
  flush = () => new Promise(setImmediate);

// Model the browser's atomic grant; a held callback owns the lock until it settles.
class Locks {
  held = false;
  async request(name, options, callback) {
    assert.equal(name, 'save');
    assert.equal(options.ifAvailable, true);
    await Promise.resolve();
    if (this.held) return callback(null);
    this.held = true;
    try {
      return await callback({ name });
    } finally {
      this.held = false;
    }
  }
}
function tab(locks, failBoot = false) {
  const core = new WebAssembly.Instance(wasm).exports,
    run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73)),
    events = new Map(),
    notices = [];
  startBattle(core, data, run, 73);
  let boots = 0,
    reloads = 0,
    writable = true;
  const context = vm.createContext({
    navigator: { locks },
    SAVE_KEY: 'save',
    SETTINGS_KEY: 'settings',
    core,
    run,
    screen: 'game',
    optionReturnToGame: false,
    activePointer: null,
    pausePressed: false,
    shopScroll: null,
    scoreScroll: null,
    clock: { stop() {} },
    menuClock: { stop() {} },
    state: () => new Float32Array(core.memory.buffer, core.draw_ptr(), core.draw_len()),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    settings: {},
    currentDifficulty: 'normal',
    best: 0,
    readSettings: (raw) => JSON.parse(raw || '{"difficulty":"normal"}'),
    powerLabel() {},
    localStorage: {
      getItem: (name) => stored.get(name) ?? null,
      setItem(name, value) {
        if (!writable) throw Error('Storage unavailable');
        stored.set(name, value);
      },
    },
    message: (text) => notices.push({ text }),
    show: (title, body, actions) => notices.push({ title, body, actions }),
    window: {
      addEventListener(name, listener) {
        if (!events.has(name)) events.set(name, []);
        events.get(name).push(listener);
      },
    },
    location: { reload: () => reloads++ },
    cancelMenuInput() {},
    pauseScreen() {},
    stopAudio() {},
    async boot() {
      boots++;
      if (failBoot) throw Error('Failed startup');
      const saved = JSON.parse(stored.get(key) ?? 'null');
      if (!saved) return;
      context.run = saved.run;
      const bytes = Buffer.from(saved.state, 'base64'),
        ptr = core.load_buffer(bytes.length);
      new Uint8Array(core.memory.buffer, ptr, bytes.length).set(bytes);
      assert.ok(core.restore());
    },
  });
  vm.runInContext(
    section('function storageSet(', 'function image(') +
      section('function clearRunSave()', 'function finishRun()') +
      section('function save()', 'async function resumeSaved(') +
      section('function pause(', 'function pauseScreen(') +
      section("window.addEventListener('pagehide',", "window.addEventListener('blur',") +
      section(
        'function resumeAudioOnGesture()',
        "document.addEventListener('pointerdown', resumeAudioOnGesture",
      ) +
      source.slice(source.indexOf('let saveSession =')),
    context,
  );
  return {
    context,
    notices,
    boots: () => boots,
    reloads: () => reloads,
    writable: (value) => {
      writable = value;
    },
    event(name, value = {}) {
      for (const listener of events.get(name) ?? []) listener(value);
    },
    advance(ticks) {
      for (let i = 0; i < ticks; i++) core.step();
    },
  };
}
const locks = new Locks(),
  first = tab(locks),
  blocked = tab(locks);
stored.set('knights-best', '1234');
stored.set('settings', '{"difficulty":"hard"}');
await flush();
assert.equal(first.boots(), 1);
assert.equal(first.context.best, 1234, 'Read shared progress only after ownership is granted');
assert.equal(first.context.currentDifficulty, 'hard');
assert.equal(blocked.boots(), 0, 'Concurrent game tabs cannot both boot');
assert.equal(blocked.notices.at(-1).title, 'Game already open');
assert.equal(blocked.context.storageSet('knights-best', '0'), false);
assert.equal(stored.get('knights-best'), '1234', 'Blocked tabs cannot change shared progress');
blocked.context.resumeAudioOnGesture();
first.advance(60);
assert.equal(first.context.save(), true);
const old = stored.get(key);
assert.equal(blocked.context.save(), false);
assert.equal(blocked.context.clearRunSave(), false);
assert.equal(stored.get(key), old, 'Blocked writes and Abort leave the owner checkpoint intact');
first.advance(120);
first.event('pagehide');
await flush();
const final = stored.get(key);
assert.notEqual(final, old, 'The owner saves its final frame before releasing its lock');
assert.equal(locks.held, false);
blocked.notices.find((notice) => notice.title === 'Game already open').actions[0][1]();
assert.equal(blocked.reloads(), 1, 'Retry reloads code and state instead of reusing an old tab');
const next = tab(locks);
await flush();
assert.equal(next.boots(), 1, 'Closing the first window lets a fresh page acquire ownership');
assert.equal(Math.round(next.context.state()[0]), 3, 'The new owner restores the final checkpoint');
next.advance(60);
assert.equal(next.context.save(), true);
const newer = stored.get(key);
assert.notEqual(newer, final);
assert.equal(first.context.save(), false);
assert.equal(first.context.clearRunSave(), false);
assert.equal(
  stored.get(key),
  newer,
  'Late callbacks and Abort cannot replace or delete newer progress',
);
first.event('pageshow', { persisted: true });
assert.equal(first.reloads(), 1, 'BFCache restoration reloads before using an obsolete game');
assert.equal(first.context.save(), false, 'A restored document stays read-only until reloaded');
next.writable(false);
assert.equal(next.context.save(), false);
assert.equal(stored.get(key), newer, 'Storage failure retains the last checkpoint');
next.writable(true);
assert.equal(next.context.clearRunSave(), true);
assert.equal(stored.get(key), 'null');
assert.equal(first.context.save(), false);
assert.equal(stored.get(key), 'null', 'An old document cannot resurrect a retired run');
next.event('pagehide');
await flush();

const closing = tab(locks);
closing.event('pagehide');
await flush();
assert.equal(closing.boots(), 0, 'A page closed during acquisition must never start the game');
assert.equal(locks.held, false);
const unsupported = tab(undefined);
assert.equal(unsupported.boots(), 0);
assert.equal(unsupported.notices.at(-1).title, 'Browser update needed');
assert.equal(unsupported.context.save(), false);
const rejected = tab({ request: async () => Promise.reject(Error('Locks unavailable')) });
await flush();
assert.equal(rejected.boots(), 0);
assert.equal(rejected.notices.at(-1).title, 'Could not protect your save');
const failed = tab(locks, true);
await flush();
assert.equal(failed.notices.at(-1).title, 'Could not load the game');
failed.event('pagehide');
await flush();
assert.equal(locks.held, false, 'Failed startup still releases ownership on navigation');
console.log(
  'Game ownership: one writer, final save before handoff, stale writes/deletes, retry, BFCache and failures pass.',
);
