import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('web/install.mjs', 'utf8');
function fixture(device = {}, matches = false) {
  const listeners = new Map();
  const button = { hidden: true };
  const steps = {};
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  const mode = {
    matches,
    addEventListener: (type, callback) => listeners.set(`mode:${type}`, callback),
  };
  const document = {
    querySelector: (selector) =>
      ({ '#install': button, '#install-dialog': dialog, '#install-steps': steps })[selector],
    addEventListener: (type, callback) => listeners.set(type, callback),
  };
  vm.runInNewContext(source, {
    navigator: { userAgent: '', platform: '', maxTouchPoints: 0, ...device },
    window: {
      matchMedia: () => mode,
      addEventListener: (type, callback) => listeners.set(type, callback),
    },
    document,
  });
  return { button, dialog, steps, listeners, mode, document };
}
for (const [device, expected] of [
  [{ userAgent: 'iPhone Safari' }, 'Share → Add to Home Screen'],
  [{ platform: 'MacIntel', maxTouchPoints: 5 }, 'Share → Add to Home Screen'],
  [{ userAgent: 'Android Chrome' }, '⋮ menu → Add to home screen'],
  [{ platform: 'MacIntel', userAgent: 'Version/18 Safari' }, 'File → Add to Dock'],
  [{ platform: 'MacIntel', userAgent: 'Chrome Safari' }, 'Chrome or Edge'],
  [{ userAgent: 'Firefox' }, 'Chrome or Edge'],
]) {
  const f = fixture(device);
  assert.equal(f.button.hidden, false);
  await f.button.onclick();
  assert.equal(f.dialog.open, true);
  assert.ok(f.steps.textContent.includes(expected), f.steps.textContent);
  f.document.fullscreenElement = {};
  f.listeners.get('fullscreenchange')();
  assert.equal(f.dialog.open, false, 'Entering fullscreen closes the modal');
}
assert.equal(fixture({}, true).button.hidden, true);
assert.equal(fixture({ standalone: true }).button.hidden, true);
const changed = fixture();
await changed.button.onclick();
changed.mode.matches = true;
changed.listeners.get('mode:change')();
assert.equal(changed.button.hidden, true);
assert.equal(changed.dialog.open, false);
changed.mode.matches = false;
changed.listeners.get('mode:change')();
assert.equal(changed.button.hidden, false);

for (const outcome of ['accepted', 'dismissed', 'error']) {
  const f = fixture();
  let prompted = 0;
  let prevented = false;
  const request = {
    preventDefault() {
      prevented = true;
    },
    async prompt() {
      assert.equal(this, request);
      prompted++;
      if (outcome === 'error') throw new Error('Unavailable');
    },
    userChoice: Promise.resolve({ outcome }),
  };
  f.listeners.get('beforeinstallprompt')(request);
  assert.equal(prevented, true);
  assert.equal(prompted, 0, 'Native prompt waits for a click');
  await f.button.onclick();
  assert.equal(prompted, 1);
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.hidden, outcome === 'accepted');
  assert.equal(f.dialog.open, outcome === 'error');
  if (outcome === 'dismissed') {
    await f.button.onclick();
    assert.equal(prompted, 1, 'Consumed native prompts are not reused');
    assert.equal(f.dialog.open, true);
  }
}
const installed = fixture();
await installed.button.onclick();
installed.listeners.get('appinstalled')();
assert.equal(installed.button.hidden, true);
assert.equal(installed.dialog.open, false);
console.log('Install: device guidance, native prompt, cancellation, errors and app mode pass.');
