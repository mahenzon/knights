import fs from 'node:fs';
import assert from 'node:assert/strict';
import { missileScene } from '../../web/scene.mjs';
const native = JSON.parse(fs.readFileSync('research/missile-effects.json'));
const { instance } = await WebAssembly.instantiate(fs.readFileSync('build/web/knights_core.wasm'));
const core = instance.exports;
const save = () => {
  const p = core.save_ptr();
  return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
};
function restore(bytes) {
  const p = core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer, p, bytes.length).set(bytes);
  return core.restore();
}
const missile = 27480,
  smoke = 32344,
  velocity = 45760;
let frames = 0;
for (const fixture of native.cases) {
  [120, -10000, 0, 0, 0, 0, 0, 1, 0, -1, 0, 1].forEach((v, i) => {
    assert.equal(core.configure(i, v), 1);
  });
  core.enemy_type(0, 0);
  core.start(73, 100000, 0, 0, 0);
  const bytes = save(),
    view = new DataView(bytes.buffer);
  view.setFloat32(27 * 4, 9999, true);
  view.setUint32(missile, 1, true);
  view.setUint32(missile + 4, fixture.kind, true);
  view.setUint32(missile + 8, fixture.tier, true);
  for (const [i, value] of [
    [3, 400],
    [4, 150],
    [5, -600],
    [6, 100],
    [8, fixture.kind === 0 ? 1200 : fixture.kind === 3 ? 600 : 0],
    [9, fixture.kind === 0 ? 0.6 : fixture.kind === 3 ? 10 : 1.4],
  ])
    view.setFloat32(missile + i * 4, value, true);
  assert.equal(restore(bytes), 1);
  for (const frame of fixture.frames) {
    core.step();
    const actual = new DataView(save().buffer),
      label = `missile ${fixture.kind}/${fixture.tier}, frame ${frame.tick}`;
    assert.equal(actual.getUint32(missile, true), frame.active, label);
    const active = [];
    for (let i = 0; i < 256; i++) {
      const at = smoke + i * 36;
      if (!actual.getUint32(at, true)) continue;
      const s = {
        slot: i,
        kind: actual.getUint32(at + 4, true),
        additive: actual.getUint32(at + 32, true),
      };
      for (const [j, name] of ['x', 'y', 'size', 'growth', 'alpha', 'fade'].entries())
        s[name] = actual.getFloat32(at + 8 + j * 4, true);
      s.vx = actual.getFloat32(velocity + i * 8, true);
      s.vy = actual.getFloat32(velocity + i * 8 + 4, true);
      active.push(s);
    }
    assert.deepEqual(active, frame.smokes, label);
    assert.ok(active.length <= native.capacity);
    if (frame.tick === 12) {
      const checkpoint = save();
      core.step();
      const after = save();
      assert.equal(restore(checkpoint), 1);
      core.step();
      assert.deepEqual(save(), after, `${label}: save/replay`);
      assert.equal(restore(checkpoint), 1);
      for (const offset of [velocity, velocity + 256 * 8]) {
        const bad = checkpoint.slice();
        new DataView(bad.buffer).setFloat32(offset, NaN, true);
        assert.equal(restore(bad), 0, 'Reject malformed motion without replacing the battle');
        assert.deepEqual(save(), checkpoint);
      }
      const old = checkpoint.slice(0, velocity);
      new DataView(old.buffer).setUint32(4, 10, true);
      assert.equal(restore(old), 1, 'Existing version10 saves remain readable');
      assert.equal(restore(checkpoint), 1);
    }
    frames++;
  }
}
for (const fixture of native.drawings) {
  const commands = missileScene({ ...fixture, x: 200, y: 150, angle: Math.atan2(150, -580) });
  assert.equal(commands.length, fixture.draws.length);
  for (const [i, expected] of fixture.draws.entries())
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(
          Math.abs(commands[i][key] - value) < 0.000001,
          `missile ${fixture.kind}/${fixture.time}/${key}: ${commands[i][key]} vs ${value}`,
        );
      else assert.equal(commands[i][key], value);
    }
}
console.log(
  `Missiles: ${frames} exact native effect frames, ${native.drawings.length} draw fixtures, 50-slot pool, save replay/migration and corruption rejection pass.`,
);
