// Static menus accrue virtual60Hz frames lazily; no timer runs while they are idle.
// shortcut: fixed60Hz phase; historical frame replay would need captured device timestamps.
export class ApplicationTime {
  now: () => number;
  value = 0;
  mode: 'menu' | 'battle' | 'paused' = 'menu';
  active = true;
  started: number;
  constructor(now = () => performance.now()) {
    this.now = now;
    this.started = now();
  }
  step(seconds = 1 / 60) {
    if (!this.active || this.mode === 'paused') return;
    const dt = Math.fround(Math.min(0.05, Math.max(0, seconds)));
    this.value = Math.fround(this.value + dt);
    // Native renderScene and DrawNormalGame perform separately rounded additions.
    if (this.mode === 'battle') this.value = Math.fround(this.value + dt);
  }
  read() {
    if (this.active && this.mode === 'menu') {
      const frames = Math.floor(((this.now() - this.started) * 60) / 1000);
      for (let i = 0; i < frames; i++) this.step();
      this.started += (frames * 1000) / 60;
    }
    return this.value;
  }
  setMode(mode: 'menu' | 'battle' | 'paused') {
    if (this.mode === mode) return;
    this.read();
    this.mode = mode;
    this.started = this.now();
  }
  pause() {
    this.read();
    this.active = false;
  }
  resume() {
    if (this.active) return;
    this.active = true;
    this.started = this.now();
  }
}

// The simulation always runs at 60 Hz; screen refresh and render caps do not change throws.
export class FixedClock {
  step: () => void;
  render: () => void;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  running: boolean;
  id: number;
  last: number | null;
  accumulator: number;
  lastDraw: number;
  fps: number;
  constructor(
    step: () => void,
    render: () => void,
    request = (callback: FrameRequestCallback) => requestAnimationFrame(callback),
    cancel = (id: number) => cancelAnimationFrame(id),
  ) {
    this.step = step;
    this.render = render;
    this.request = request;
    this.cancel = cancel;
    this.running = false;
    this.id = 0;
    this.last = null;
    this.accumulator = 0;
    this.lastDraw = -Infinity;
    this.fps = 60;
    this.frame = this.frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = null;
    this.accumulator = 0;
    this.lastDraw = -Infinity;
    this.id = this.request(this.frame);
  }
  stop() {
    this.running = false;
    this.cancel(this.id);
    this.id = 0;
    this.last = null;
    this.accumulator = 0;
  }
  frame(now: number) {
    if (!this.running) return;
    if (this.last !== null) this.accumulator += Math.min(50, Math.max(0, now - this.last));
    this.last = now;
    while (this.running && this.accumulator >= 1000 / 60) {
      this.step();
      this.accumulator -= 1000 / 60;
    }
    const interval = 1000 / this.fps;
    if (this.running && now - this.lastDraw >= interval - 1) {
      this.render();
      // Keep the deadline phase; rebasing to now loses frames to display jitter.
      this.lastDraw = Number.isFinite(this.lastDraw)
        ? this.lastDraw + Math.max(1, Math.floor((now - this.lastDraw + 1) / interval)) * interval
        : now;
    }
    if (this.running) this.id = this.request(this.frame);
  }
}

type FrameSample = {
  fps: number;
  callbacks: number;
  callbackGap: number;
  gap: number;
  drawP95: number;
  drawMax: number;
  stepP95: number;
  stepMax: number;
};

// Opt-in diagnostics only: no extra animation loop, timers, storage or network.
export function measureClock(
  clock: FixedClock,
  report: (sample: FrameSample) => void,
  now = () => performance.now(),
) {
  const step = clock.step,
    render = clock.render,
    request = clock.request;
  let start = 0,
    last: number | null = null,
    frames = 0,
    gap = 0,
    callbacks = 0,
    callbackGap = 0,
    lastCallback: number | null = null;
  const steps: number[] = [],
    draws: number[] = [];
  const p95 = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.95)] ?? 0;
  };
  clock.request = (callback) =>
    request((timestamp) => {
      const before = now();
      callbacks++;
      if (lastCallback !== null) callbackGap = Math.max(callbackGap, before - lastCallback);
      lastCallback = before;
      callback(timestamp);
    });
  clock.step = () => {
    const before = now();
    step();
    if (steps.length < 600) steps.push(now() - before);
  };
  clock.render = () => {
    const before = now();
    if (!Number.isFinite(clock.lastDraw)) {
      start = before;
      last = null;
      lastCallback = null;
      callbacks = callbackGap = 0;
      frames = gap = steps.length = draws.length = 0;
    }
    render();
    if (draws.length < 600) draws.push(now() - before);
    if (last !== null) {
      frames++;
      gap = Math.max(gap, before - last);
    }
    last = before;
    if (before - start < 1000) return;
    report({
      fps: (frames * 1000) / (before - start),
      callbacks: (callbacks * 1000) / (before - start),
      callbackGap,
      gap,
      drawP95: p95(draws),
      drawMax: Math.max(0, ...draws),
      stepP95: p95(steps),
      stepMax: Math.max(0, ...steps),
    });
    start = before;
    frames = gap = steps.length = draws.length = 0;
    callbacks = callbackGap = 0;
  };
}
