// Matched Float64 simulation, not recovered game logic. No rendering or energy measurement.
const body = new Float64Array(512 * 6);
let count = 0, tick = 0;
function reset(n, seed) {
  count = n; tick = 0;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const p = i * 6;
    body[p] = random() * 480; body[p + 1] = random() * 240;
    body[p + 2] = 20 + random() * 70; body[p + 3] = -random() * 200;
    body[p + 4] = 600; body[p + 5] = random();
  }
}
function step(frames) {
  const dt = 1 / 60;
  for (let f = 0; f < frames; f++) {
    tick = (tick + 1) >>> 0;
    for (let i = 0; i < count; i++) {
      const p = i * 6;
      body[p + 5] -= dt; body[p] += body[p + 2] * dt; body[p + 1] += body[p + 3] * dt;
      if (body[p + 1] < 260) body[p + 3] += 900 * dt;
      else { body[p + 4] -= Math.abs(body[p + 3]) * 0.7; body[p + 1] = 260; body[p + 3] = 0; }
      if (body[p] > 390 && body[p + 5] <= 0) { body[p + 4] -= 2; body[p + 5] = 0.7; body[p + 2] = 0; }
      if (((tick + i) >>> 0) % 97 === 0) { body[p + 3] = -350; body[p + 2] = -50; }
      if (body[p + 4] < 0 || body[p] < -80) { body[p + 4] = 600; body[p] = 0; body[p + 1] = 260; body[p + 2] = 40; }
    }
    for (let j = 0; j < 32; j++) {
      const x = ((Math.imul(tick, 3) + j * 31) >>> 0) % 480, y = 180 + j % 80;
      for (let i = 0; i < count; i++) {
        const p = i * 6, dx = body[p] - x, dy = body[p + 1] - y;
        if (dx * dx + dy * dy < 400) body[p + 4] -= dt * 4;
      }
    }
  }
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 6;
    sum += body[p] + body[p + 1] + body[p + 4] + body[p + 2] + body[p + 3] + body[p + 5];
  }
  return sum;
}
function drawStateChecksum(state, n) {
  let value = 0;
  for (let i = 0; i < n; i++) value += state[i * 6] + state[i * 6 + 1];
  return value;
}
function equal(a, b, label) { if (a !== b) throw new Error(`${label}: ${a} != ${b}`); }
export async function runBenchmark(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes);
  const rust = instance.exports, results = [];
  let checkedOutput = 0;
  for (const n of [32, 128, 512]) {
    const native = new Float64Array(rust.memory.buffer, rust.state_ptr(), n * 6);
    reset(n, 73); rust.reset(n, 73);
    equal(step(600), rust.step(600), 'simulation checksum');
    for (let i = 0; i < n * 6; i++) equal(body[i], native[i], `state[${i}]`);
    reset(n, 7); rust.reset(n, 7);
    for (let i = 0; i < 1200; i++) { step(1); rust.step(1); }
    const js = [], wasm = [], frames = 3600;
    function measure(kind) {
      let sum = 0;
      if (kind === 'js') {
        reset(n, 99);
        const start = performance.now();
        for (let i = 0; i < frames; i++) sum += step(1) + drawStateChecksum(body, n);
        js.push((performance.now() - start) / frames);
      } else {
        rust.reset(n, 99);
        const start = performance.now();
        for (let i = 0; i < frames; i++) sum += rust.step(1) + drawStateChecksum(native, n);
        wasm.push((performance.now() - start) / frames);
      }
      checkedOutput += sum;
      return sum;
    }
    for (let repeat = 0; repeat < 9; repeat++) {
      const order = repeat % 2 ? ['rust', 'js'] : ['js', 'rust'];
      equal(measure(order[0]), measure(order[1]), 'timed output');
    }
    js.sort((a, b) => a - b); wasm.sort((a, b) => a - b);
    results.push({ entities: n, areaChecksPerTick: n * 32,
      jsMedianMs: js[4], rustWasmMedianMs: wasm[4], ratio: js[4] / wasm[4],
      jsTrialMeansMs: js, rustWasmTrialMeansMs: wasm });
  }
  return { description: 'One call per tick plus JS draw-state scan; Float64 state checked exactly; 9 alternating trials of 3600 ticks; CPU-only, no rendering or battery measurement',
    checkedOutput, wasmBytes: bytes.byteLength, results };
}
