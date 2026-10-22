// Injected only by the localhost QA server. Test HP/inventory never enters a release.
const qaOutput = document.createElement('pre');
qaOutput.id = 'render-receipt';
qaOutput.style = 'position:fixed;top:0;left:0;z-index:100;background:#fff;color:#111;font:11px monospace;max-width:100%;max-height:25vh;overflow:auto;pointer-events:none';
document.body.append(qaOutput);
let qaTrial = null;
const qaResults = [], qaCanvases = [], qaMissing = new Set();
const qaCreate = document.createElement.bind(document);
document.createElement = function(name, ...args) {
  const result = qaCreate(name, ...args);
  if (name === 'canvas') qaCanvases.push(new WeakRef(result));
  return result;
};
const qaGet = assets.get.bind(assets);
assets.get = function(name) {
  const result = qaGet(name);
  if (qaTrial && screen === 'game' && !result) qaMissing.add(name);
  return result;
};
function qaMemory() {
  const surfaces = qaCanvases.map(c => c.deref()).filter(Boolean);
  return {
    wasm: core.memory.buffer.byteLength,
    images: assets.size,
    imageRgbaBytes: [...assets.values()].reduce((n, a) => n + a.width * a.height * 4, 0),
    generatedSurfaces: surfaces.length,
    generatedRgbaBytes: surfaces.reduce((n, a) => n + a.width * a.height * 4, 0),
    canvasBytes: canvas.width * canvas.height * 4,
    heap: performance.memory?.usedJSHeapSize ?? null,
    pendingImages: imageLoader.pending.size,
    packs: imageLoader.packs.size,
    resources: performance.getEntriesByType('resource').length,
  };
}
function qaSummary(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * .95)],
    p99: sorted[Math.floor(sorted.length * .99)],
    max: sorted.at(-1),
  };
}
function qaPublish() {
  const active = qaTrial && {
    mode: qaTrial.mode, fps: qaTrial.fps, ticks: qaTrial.ticks,
    render: qaSummary(qaTrial.render), tick: qaSummary(qaTrial.tick),
    actors: qaTrial.maxActors, smoke: qaTrial.maxSmoke, fragments: qaTrial.maxFragments,
    objects: qaTrial.maxObjects, missiles: qaTrial.maxMissiles,
    memory: qaMemory(), missing: [...qaMissing],
  };
  qaOutput.textContent = JSON.stringify({ status: active ? 'running' : 'ready', active, results: qaResults }, null, 2);
}
function render() {
  const started = performance.now();
  originalRender();
  if (qaTrial && screen === 'game') {
    qaTrial.render.push(performance.now() - started);
    if (qaTrial.lastRender) qaTrial.intervals.push(started - qaTrial.lastRender);
    qaTrial.lastRender = started;
  }
}
function tick() {
  const trial = qaTrial;
  if (trial && trial.ticks % 120 === 0) {
    // Real weapon input paths generate fire, fragments, tints and projectile effects.
    for (const [x, y] of [[420, 165], [420, 50], [325, 75]]) {
      core.pickup(x, y);
      core.drag(240, 160);
      core.release_at(240, 160);
    }
  }
  const started = performance.now();
  originalTick();
  if (!trial) return;
  trial.tick.push(performance.now() - started);
  trial.ticks++;
  if (trial.ticks % 60 === 0) {
    if (!draw.every(Number.isFinite)) throw Error('Non-finite browser draw state');
    const active = (start, count, stride) => Array.from({length:count}, (_, i) => draw[start+i*stride]).filter(Boolean).length;
    trial.maxActors = Math.max(trial.maxActors, active(20, 200, 12));
    trial.maxSmoke = Math.max(trial.maxSmoke, active(3701, 256, 6));
    trial.maxFragments = Math.max(trial.maxFragments, active(5237, 150, 4));
    trial.maxObjects = Math.max(trial.maxObjects, active(2420, draw[17], 10));
    trial.maxMissiles = Math.max(trial.maxMissiles, active(2420 + draw[17]*10 + draw[18]*11, draw[19], 7));
    trial.samples.push(qaMemory());
    qaPublish();
  }
  if (trial.ticks === 3600) {
    clock.stop();
    qaResults.push({
      mode: trial.mode, fps: trial.fps, ticks: trial.ticks,
      elapsedMs: performance.now() - trial.started,
      render: qaSummary(trial.render), tick: qaSummary(trial.tick),
      intervals: qaSummary(trial.intervals),
      maxActors: trial.maxActors, maxSmoke: trial.maxSmoke, maxFragments: trial.maxFragments,
      maxObjects: trial.maxObjects, maxMissiles: trial.maxMissiles,
      first: trial.samples[0], last: qaMemory(),
      missing: [...qaMissing], simulationSeconds: draw[0], health: draw[2],
      terminal: draw[9], finite: draw.every(Number.isFinite), canvas: [canvas.width, canvas.height],
    });
    qaTrial = null;
    qaPublish();
    $('#qa-actions').hidden = false;
  }
}
async function qaStart(mode, fps) {
  if (!previewMuted) throw Error('QA must use mute=1');
  clock.stop(); menuClock.stop();
  $('#qa-actions').hidden = true;
  const previous = createRun(data, mode, 0, 'hard', 42);
  previous.day = 10000;
  for (const item of data.shop.items)
    previous.inventory[item.inventoryIndex] = Math.max(previous.inventory[item.inventoryIndex], item.upgradeIndex);
  previous.inventory[10] = 2;
  run = prepareDay(data, previous);
  qaOutput.textContent = 'Loading late-game artwork…';
  await loadBattleImages(run.config.enemyTypeTable, run);
  for (let i = 0; i < 60; i++) random(run);
  run.landscapeSeed = run.seed;
  landscape = new Landscape(run.config.durationSeconds, () => random(run));
  startBattle(core, data, run, run.seed);
  const savePointer = core.save_ptr();
  const bytes = new Uint8Array(core.memory.buffer, savePointer, core.save_len()).slice();
  const view = new DataView(bytes.buffer);
  view.setFloat32(23*4, 1000000, true); view.setFloat32(24*4, 1000000, true);
  const loadPointer = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, loadPointer, bytes.length).set(bytes);
  if (core.restore() !== 1) throw Error('Invalid soak snapshot');
  for (let i = 0; i < 18000; i++) { core.step(); core.clear_audio_events(); }
  state();
  if (draw[9]) throw Error('Warmup ended before the rendering trial');
  landscape.advanceTo(draw[0], true);
  settings.power = fps === 30;
  qaMissing.clear();
  startPlay();
  qaTrial = { mode, fps, ticks:0, started:performance.now(), render:[], tick:[], intervals:[], samples:[], lastRender:0,
    maxActors:0, maxSmoke:0, maxFragments:0, maxObjects:0, maxMissiles:0 };
  qaPublish();
}
boot().then(() => {
  const actions = document.createElement('div');
  actions.id = 'qa-actions';
  actions.style = 'position:fixed;bottom:0;left:0;z-index:100';
  for (const [mode, fps] of [['endless', 60], ['madness', 60], ['madness', 30]]) {
    const button = document.createElement('button');
    button.textContent = `Measure ${mode} ${fps} FPS`;
    button.onclick = () => qaStart(mode, fps).catch(error => { qaOutput.textContent = String(error.stack); actions.hidden = false; });
    actions.append(button);
  }
  document.body.append(actions);
  qaPublish();
});
