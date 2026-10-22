import assert from 'node:assert/strict';
import { friendMail, tellFriend } from '../build/web/play.mjs';

const title = 'Knights Onrush';
const current = 'https://example.test/knights/index.html?mute=1&dev=1#debug';
const historical =
  'http://itunes.apple.com/WebObjects/MZStore.woa/wa/viewSoftware?id=297805402&mt=8';
function checkMail(href, link) {
  const mail = new URL(href);
  assert.equal(mail.protocol, 'mailto:');
  assert.equal(mail.pathname, '', 'Draft has no recipient');
  assert.equal(mail.searchParams.get('subject'), title);
  assert.equal(mail.searchParams.get('body'), `\nKnights Onrush:\n${link}\n`);
}

for (const [href, url] of [
  [current, 'https://example.test/knights/'],
  ['https://example.test/?legacyShare=0&mute=1', 'https://example.test/'],
  ['https://example.test/index.html#test', 'https://example.test/'],
  [
    'https://draft:placeholder@example.test/knights/?token=placeholder',
    'https://example.test/knights/',
  ],
]) {
  checkMail(friendMail(href), url);
  const page = { href },
    calls = [];
  const device = {
    async share(data) {
      assert.equal(this, device, 'Native API retains its navigator receiver');
      calls.push(data);
    },
  };
  const result = tellFriend(page, device);
  assert.deepEqual(calls, [{ title, url }], 'No await before invoking share');
  await result;
  assert.equal(page.href, href, 'Successful share does not navigate');

  await tellFriend(page, {});
  checkMail(page.href, url);
}

const legacy = { href: `${current.split('#')[0]}&legacyShare=1#debug` };
await tellFriend(legacy, {
  share() {
    assert.fail('Legacy flag must bypass the modern share sheet');
  },
});
checkMail(legacy.href, historical);
const legacyUnsupported = { href: 'https://example.test/?legacyShare=1' };
await tellFriend(legacyUnsupported, {});
checkMail(legacyUnsupported.href, historical);

for (const name of ['AbortError', 'NotAllowedError', 'TypeError']) {
  const page = { href: current };
  await tellFriend(page, {
    async share() {
      throw new DOMException('Test rejection', name);
    },
  });
  if (name === 'AbortError') assert.equal(page.href, current, 'Cancellation never opens email');
  else checkMail(page.href, 'https://example.test/knights/');
}

const page = { href: current };
let finish;
const pending = tellFriend(page, {
  share: () => new Promise((resolve) => (finish = resolve)),
});
await tellFriend(page, {
  share() {
    assert.fail('Repeated tap must not open another sheet');
  },
});
assert.equal(page.href, current);
finish();
await pending;
let reopened = false;
await tellFriend(page, {
  async share() {
    reopened = true;
  },
});
assert.equal(reopened, true, 'Closing the first sheet permits sharing again');
console.log(
  'Sharing: clean URL, native gesture, legacy draft, fallback, cancel and repeated taps pass.',
);
