import assert from 'node:assert/strict';
import { FixedClock, measureClock } from '../build/web/lifecycle.mjs';

let time = 0,
  ticks = 0,
  draws = 0;
const samples = [];
let pending;
const clock = new FixedClock(
  () => {
    ticks++;
    time += 0.25;
  },
  () => {
    draws++;
    time += 2;
  },
  (callback) => {
    pending = callback;
    return 1;
  },
  () => {},
);
measureClock(
  clock,
  (sample) => samples.push(sample),
  () => time,
);
clock.start();
for (let i = 0; i <= 120; i++) {
  time = (i * 1000) / 60;
  pending(time);
}
assert.ok(samples.length >= 1);
assert.equal(draws, 121, 'Meter does not change rendering frequency');
assert.ok(ticks >= 119 && ticks <= 120, 'Meter preserves fixed-step simulation');
const first = samples[0];
assert.ok(Math.abs(first.fps - 60) < 0.1);
assert.ok(first.gap < 18);
assert.ok(Math.abs(first.callbacks - 60) < 0.1);
assert.ok(first.callbackGap < 18);
assert.equal(first.drawP95, 2);
assert.equal(first.stepP95, 0.25);

// A stalled frame must appear in delivered-frame timing, even with fast CPU work.
time = 2400;
pending(time);
for (let i = 1; i <= 60; i++) {
  time = 2400 + (i * 1000) / 60;
  pending(time);
}
assert.ok(samples.some((sample) => sample.fps < 45 && sample.gap > 350));
assert.ok(samples.some((sample) => sample.callbacks < 45 && sample.callbackGap > 350));

clock.stop();
const count = samples.length;
time = 100000;
clock.frame(time);
assert.equal(samples.length, count, 'No sampling while stopped/backgrounded');
clock.start();
for (let i = 0; i <= 61; i++) {
  time = 100000 + (i * 1000) / 60;
  pending(time);
}
const resumed = samples.at(-1);
assert.ok(Math.abs(resumed.fps - 60) < 0.1);
assert.ok(resumed.gap < 18, 'Background time must not be reported as a dropped frame');
assert.ok(resumed.callbackGap < 18);

clock.stop();
clock.fps = 30;
clock.start();
for (let i = 0; i <= 61; i++) {
  time = 200000 + (i * 1000) / 60;
  pending(time);
}
assert.ok(Math.abs(samples.at(-1).fps - 30) < 0.1);
assert.ok(
  Math.abs(samples.at(-1).callbacks - 60) < 0.1,
  'Distinguish browser scheduling from draw cap',
);
console.log(
  'Performance meter: real clock cadence, CPU timings, stalls and background reset pass.',
);
