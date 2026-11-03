import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { waitForOfflineReady } from '../build/web/offline.mjs';

const source = fs.readFileSync('web/game.mjs', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
for (const phase of ['battle', 'failed', 'menu']) {
  const stored = new Map([['save-campaign', 'previous checkpoint']]),
    requests = [],
    controls = { '#offline': {}, '#update': {} },
    worker = Object.assign(new EventTarget(), {
      state: 'activated',
      postMessage: ({ type }) => {
        requests.push(type);
        if (type === 'status')
          queueMicrotask(() => {
            serviceWorker.dispatchEvent(
              Object.assign(new Event('message'), {
                data: { type: 'offline-ready' },
                source: worker,
              }),
            );
          });
      },
    }),
    registration = { active: worker, waiting: worker },
    serviceWorker = Object.assign(new EventTarget(), {
      controller: worker,
      register: async () => registration,
    });
  let writable = false,
    reloads = 0,
    stops = 0;
  const context = vm.createContext({
    core: {
      memory: { buffer: new Uint8Array([1, 2, 3, 4]).buffer },
      save_ptr: () => 0,
      save_len: () => 4,
    },
    run: phase === 'menu' ? null : { mode: 'campaign', phase },
    screen: phase === 'menu' ? 'menu' : 'game',
    optionReturnToGame: false,
    activePointer: null,
    pausePressed: false,
    state: () => [],
    SAVE_KEY: 'save',
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    storageSet(key, value) {
      if (!writable) return false;
      stored.set(key, value);
      return true;
    },
    clock: { stop() {} },
    pauseScreen() {},
    stopAudio: () => stops++,
    location: { reload: () => reloads++ },
    offlineTask: null,
    preparingOffline: false,
    isSecureContext: true,
    navigator: { serviceWorker },
    waitForOfflineReady,
    $: (selector) => controls[selector],
  });
  vm.runInContext(
    section('function clearRunSave()', 'function finishRun()') +
      section('function save()', 'async function resumeSaved(') +
      section('function pause(', 'function pauseScreen(') +
      section('async function offline()', 'navigator.serviceWorker?.addEventListener'),
    context,
  );
  await context.offline();
  assert.equal(controls['#update'].hidden, false);
  requests.length = 0;
  controls['#update'].onclick();
  if (phase !== 'menu') {
    assert.equal(context.screen, 'paused');
    assert.deepEqual(requests, [], 'Storage failure must not activate a new worker');
    assert.equal(reloads, 0, 'Storage failure must not discard the current game');
    assert.equal(stops, 0);
    assert.equal(stored.get('save-campaign'), 'previous checkpoint');
    writable = true;
    controls['#update'].onclick();
    const saved = JSON.parse(stored.get('save-campaign'));
    if (phase === 'failed') assert.equal(saved, null, 'Retire defeat before updating');
    else assert.equal(saved.state, 'AQIDBA==', 'Save the live engine before updating');
  }
  assert.deepEqual(requests, ['activate-update']);
  assert.equal(stops, 1);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1, 'One successful update causes one reload');
}
console.log('Update: failed battle/defeat saves block activation; retry and menu update succeed.');
