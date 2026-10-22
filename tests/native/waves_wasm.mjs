import fs from 'node:fs';
import assert from 'node:assert/strict';

const native = JSON.parse(fs.readFileSync('research/wave-cycle.json'));
const wasm = fs.readFileSync('build/web/knights_core.wasm');
let frames = 0;
for (const c of native.cases) {
  const {
    instance: { exports: core },
  } = await WebAssembly.instantiate(wasm);
  const save = () => {
    const p = core.save_ptr();
    return new Uint8Array(core.memory.buffer, p, core.save_len()).slice();
  };
  const restore = (bytes) => {
    new Uint8Array(core.memory.buffer, core.load_buffer(bytes.length), bytes.length).set(bytes);
    assert.equal(core.restore(), 1);
  };
  c.config.forEach((value, i) => {
    core.configure(i, value);
  });
  c.table.forEach((kind, i) => {
    core.enemy_type(i, kind);
  });
  core.start(73, 100000, 0, 0, 0);
  const bytes = save(),
    v = new DataView(bytes.buffer);
  v.setFloat32(108, c.wave.delay, true);
  for (const a of c.initial) {
    const word = 235 + a.slot * 27;
    [
      a.dead ? 6 : 1,
      a.kind,
      a.reward,
      a.damage,
      a.ability_done | (a.ability_active << 1),
      a.shield,
      a.immunity,
    ].forEach((n, j) => {
      v.setUint32((word + j) * 4, n, true);
    });
    [
      a.x,
      a.y,
      a.ground,
      a.vx,
      a.vy,
      a.hp,
      a.speed,
      a.saved_speed,
      a.mass,
      a.size,
      a.stun_time,
      a.frame,
      a.target_x,
      a.target_y,
      a.min_y,
      a.cooldown,
      a.alpha / 255,
      a.ability_delay,
      a.ability_remaining,
      a.range,
    ].forEach((n, j) => {
      v.setFloat32((word + 7 + j) * 4, n, true);
    });
    v.setUint32(61748 + a.slot * 4, a.pose, true);
  }
  restore(bytes);
  for (const f of c.frames) {
    if (f.tick === c.restart) core.start(73, 100000, 0, 0, 0);
    core.step();
    const out = new DataView(save().buffer),
      label = `${c.name}/${f.tick}`;
    assert.equal(
      out.getUint32(80, true),
      f.rng,
      `${label} random stream (${f.calls.length} native calls)`,
    );
    for (const [offset, key] of [
      [104, 'pressure'],
      [108, 'delay'],
      [112, 'forced'],
      [116, 'prefix'],
    ])
      assert.equal(out.getFloat32(offset, true), f.wave[key], `${label} wave ${key}`);
    assert.equal(out.getUint32(62848, true), f.wave.skip, `${label} wave countdown`);
    for (let slot = 0; slot < 200; slot++) {
      const a = f.actors.find((a) => a.slot === slot),
        word = 235 + slot * 27;
      assert.equal(out.getUint32(word * 4, true) !== 0, Boolean(a), `${label}/${slot} active`);
      if (!a) continue;
      assert.equal(out.getUint32((word + 1) * 4, true), a.kind, `${label}/${slot} kind`);
      for (const [field, expected] of [
        [0, a.x],
        [1, a.y],
        [2, a.ground],
        [3, a.vx],
        [4, a.vy],
        [5, a.hp],
        [6, a.speed],
        [7, a.saved_speed],
        [8, a.mass],
        [9, a.size],
        [10, a.stun_time],
        [11, a.frame],
        [14, a.min_y],
        [15, a.cooldown],
        [16, a.alpha / 255],
      ]) {
        if (a.dead && (field === 10 || field === 15)) continue; // Dead actors no longer use stun/attack timers.
        const actual = out.getFloat32((word + 7 + field) * 4, true);
        if (a.dead && field === 11)
          assert.equal(
            Math.trunc(actual),
            Math.trunc(expected),
            `${label}/${slot} held death sprite`,
          );
        else
          assert.ok(
            Math.abs(actual - expected) < 0.0001,
            `${label}/${slot} field${field}: ${actual} vs ${expected}`,
          );
      }
    }
    if ([210, 211, 219, 300, 323, 324, 540, 600].includes(f.tick)) {
      const checkpoint = save();
      core.step();
      const expected = save();
      restore(checkpoint);
      core.step();
      assert.deepEqual(save(), expected, `${label} replay`);
      restore(checkpoint);
    }
    frames++;
  }
  const good = save();
  for (const invalid of [11, 0xffffffff]) {
    const bad = good.slice();
    new DataView(bad.buffer).setUint32(62848, invalid, true);
    new Uint8Array(core.memory.buffer, core.load_buffer(bad.length), bad.length).set(bad);
    assert.equal(core.restore(), 0, 'Reject corrupt wave countdown');
    assert.deepEqual(save(), good, 'Reject atomically');
  }
  const old = good.slice(0, 62848);
  new DataView(old.buffer).setUint32(4, 20, true);
  restore(old);
  const migrated = new DataView(save().buffer);
  assert.equal(migrated.getUint32(62848, true), 10 - (migrated.getUint32(76, true) % 10));
  assert.deepEqual(save().slice(8, 62848), good.slice(8, 62848), 'Version20 preserves game state');
}
console.log(
  `Waves: ${frames} native world frames match spawning, crowd limits, random scheduling, actor state and save/replay.`,
);
