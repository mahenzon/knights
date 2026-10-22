import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('web/game.mjs', 'utf8');
const start = source.indexOf('const previewMuted'),
  flag = source.slice(start, source.indexOf(';', start) + 1);
for (const [search, expected] of [
  ['?mute=1', true],
  ['?dev=1&mute=1', true],
  ['?mute=0', false],
  ['', false],
]) {
  assert.equal(
    vm.runInNewContext(`${flag}\npreviewMuted`, { URLSearchParams, location: { search } }),
    expected,
  );
}
const settings = { sound: true },
  context = vm.createContext({
    settings,
    previewMuted: true,
    document: { hidden: false },
    backgrounded: true,
    screen: 'game',
  });
const prepare = source.slice(
  source.indexOf('function prepareAudio('),
  source.indexOf('function resumeAudioOnGesture('),
);
const sound = source.slice(
  source.indexOf('async function sound('),
  source.indexOf('async function offline('),
);
vm.runInContext(prepare + sound, context);
vm.runInContext("prepareAudio('menu');prepareAudio('game');", context);
await vm.runInContext("sound('red_drake.wav')", context);
assert.equal(settings.sound, true, 'URL mute must not overwrite saved sound settings');
console.log(
  'URL mute: music, effects and audio-context creation suppressed; saved sound preference unchanged.',
);
