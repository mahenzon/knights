import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { waitForOfflineReady } from '../build/web/offline.mjs';

class TrackedTarget extends EventTarget {
  listeners = new Set();
  addEventListener(type, listener) {
    super.addEventListener(type, listener);
    this.listeners.add(listener);
  }
  removeEventListener(type, listener) {
    super.removeEventListener(type, listener);
    this.listeners.delete(listener);
  }
}
class Worker extends TrackedTarget {
  sent = [];
  constructor(state = 'installing') {
    super();
    this.state = state;
  }
  change(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
  postMessage(data) {
    this.sent.push(data);
    this.reply?.(data);
  }
}
function fixture(state = 'installing') {
  const worker = new Worker(state),
    container = new TrackedTarget(),
    registration = {
      active: state === 'activated' ? worker : null,
      installing: state === 'activated' ? null : worker,
      waiting: null,
    },
    progress = [];
  const message = (data, source = worker) => {
    container.dispatchEvent(Object.assign(new Event('message'), { data, source }));
  };
  const wait = () =>
    waitForOfflineReady(container, registration, (...values) => progress.push(values));
  const clean = () => {
    assert.equal(container.listeners.size, 0, 'message listener is removed');
    assert.equal(worker.listeners.size, 0, 'activation listener is removed');
  };
  return { worker, container, registration, progress, message, wait, clean };
}
const flush = () => new Promise(setImmediate);
mock.timers.enable({ apis: ['setTimeout'] });
try {
  const delayed = fixture();
  let ready = false;
  const waiting = delayed.wait().then(() => {
    ready = true;
  });
  delayed.message({ type: 'offline-ready' }, new Worker('activated'));
  delayed.message({ type: 'offline-progress', completed: 4, total: 7 });
  delayed.message({ type: 'offline-progress', completed: 8, total: 7 });
  assert.deepEqual(delayed.progress, [[4, 7]], 'only valid progress is forwarded');
  mock.timers.tick(120_000);
  await flush();
  assert.equal(ready, false, 'a slow initial download has no arbitrary deadline');
  delayed.registration.active = delayed.worker;
  delayed.worker.change('activated');
  await flush();
  assert.deepEqual(delayed.worker.sent, [{ type: 'status' }]);
  assert.equal(ready, false, 'activation alone cannot open the first menu');
  delayed.message({ type: 'offline-ready' }, new Worker('activated'));
  mock.timers.tick(9_999);
  await flush();
  assert.equal(ready, false, 'another registration cannot acknowledge readiness');
  delayed.message({ type: 'offline-ready' });
  await waiting;
  delayed.clean();

  const activating = fixture();
  const duringActivation = activating.wait();
  activating.worker.change('activating');
  activating.message({ type: 'offline-ready' });
  activating.registration.active = activating.worker;
  activating.worker.change('activated');
  await duringActivation;
  activating.clean();

  const compatible = fixture('activated');
  compatible.worker.reply = () => compatible.message({ type: 'offline-ready' });
  await compatible.wait();
  assert.deepEqual(compatible.progress, [], 'older workers need no progress-message support');
  compatible.clean();

  const incomplete = fixture('activated');
  incomplete.worker.reply = ({ type }) => {
    if (type === 'status') incomplete.message({ type: 'offline-error' });
    else incomplete.message({ type: 'offline-repairing' });
  };
  let repaired = false;
  const repair = incomplete.wait().then(() => {
    repaired = true;
  });
  await flush();
  assert.deepEqual(incomplete.worker.sent, [{ type: 'status' }, { type: 'repair-offline' }]);
  mock.timers.tick(120_000);
  await flush();
  assert.equal(repaired, false, 'an acknowledged repair can download on a slow connection');
  incomplete.message({ type: 'offline-progress', completed: 7, total: 7 });
  incomplete.message({ type: 'offline-ready' });
  await repair;
  incomplete.clean();

  const retry = fixture('activated');
  let repairWorks = false;
  retry.worker.reply = ({ type }) => {
    if (type === 'status') retry.message({ type: 'offline-error' });
    else {
      retry.message({ type: 'offline-repairing' });
      retry.message({ type: repairWorks ? 'offline-ready' : 'offline-error' });
    }
  };
  await assert.rejects(retry.wait(), /Reconnect and try again/);
  retry.clean();
  repairWorks = true;
  await retry.wait();
  retry.clean();

  const unsupported = fixture('activated');
  unsupported.worker.reply = ({ type }) => {
    if (type === 'status') unsupported.message({ type: 'offline-error' });
  };
  const noRepair = assert.rejects(unsupported.wait(), /timed out/);
  await flush();
  mock.timers.tick(10_000);
  await noRepair;
  unsupported.clean();

  const silent = fixture('activated');
  const timeout = assert.rejects(silent.wait(), /timed out/);
  await flush();
  mock.timers.tick(10_000);
  await timeout;
  silent.clean();

  const failed = fixture();
  const interrupted = assert.rejects(failed.wait(), /interrupted/);
  failed.worker.change('redundant');
  await interrupted;
  failed.clean();

  const update = fixture('activated'),
    updating = new Worker('installing');
  update.registration.installing = updating;
  update.worker.reply = () => update.message({ type: 'offline-ready' });
  const activeCache = update.wait();
  update.message({ type: 'offline-error' }, updating);
  await activeCache;
  update.clean();

  const missing = fixture();
  missing.registration.installing = null;
  await assert.rejects(missing.wait(), /did not start/);
  missing.clean();

  const broken = fixture('activated');
  broken.worker.reply = () => {
    throw Error('Worker stopped');
  };
  await assert.rejects(broken.wait(), /Worker stopped/);
  broken.clean();
} finally {
  mock.timers.reset();
}
console.log(
  'Offline readiness: verified acknowledgement, activation races, progress, active-cache repair/retry, old workers, timeout and cleanup pass.',
);
