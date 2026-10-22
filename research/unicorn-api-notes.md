# Unicorn.js 2.1.4: exact published API

Inspected `research/unicorn-js.tgz` and the matching source commit `560284c59c11c8d6c94d537f4354339f069ddcdf`. Examples below are source-derived execution checks for the main task to run; this research task did not execute them.

## Node: complete ARM smoke check

Install `@alexaltea/unicorn-js@2.1.4`, save as a `.cjs` file, and run with Node. Alternatively replace `require(...)` with an absolute path to the extracted `package/dist/unicorn_arm.js` file; no npm install is required for that standalone artifact.

```js
const MUnicorn = require('@alexaltea/unicorn-js/arm');

(async () => {
  const uc = await MUnicorn();
  const e = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM | uc.MODE_ARM1176);
  const address = 0x10000;
  // mov r0, #0x37 ; sub r1, r2, r3
  const code = Uint8Array.from([0x37, 0x00, 0xa0, 0xe3, 0x03, 0x10, 0x42, 0xe0]);
  let hook;
  try {
    e.mem_map(address, 4096, uc.PROT_ALL);
    e.mem_write(address, code);
    e.reg_write_i32(uc.ARM_REG_R2, 0x6789);
    e.reg_write_i32(uc.ARM_REG_R3, 0x3333);
    let hits = 0;
    hook = e.hook_add(uc.HOOK_CODE, (engine, pc, size, data) => {
      if (typeof pc !== 'bigint') throw new Error('Hook PC must be BigInt');
      hits++;
    }, null, address, address + code.length - 1);
    e.emu_start(address, address + code.length, 0, 10);
    const r0 = e.reg_read_i32(uc.ARM_REG_R0) >>> 0;
    const r1 = e.reg_read_i32(uc.ARM_REG_R1) >>> 0;
    if (r0 !== 0x37 || r1 !== 0x3456 || hits !== 2) {
      throw new Error(JSON.stringify({r0, r1, hits}));
    }
    console.log('ARM1176 + code hooks: PASS');
  } finally {
    if (hook) e.hook_del(hook);
    e.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
```

`MODE_ARM1176` is exported by this package and selects the upstream ARM1176 model; it does not require the unavailable `ctl()` API. The upstream JS test uses default `MODE_ARM`, so the ARM1176-specific combination should be verified with this check.

## Browser: complete loader and smoke check

Copy the published `dist/unicorn_arm.js` into the static site as `vendor/unicorn_arm.js`. It is 837,008 bytes, contains its own WASM payload, and defines global `MUnicorn` when loaded as an ordinary script. Do **not** use `type="module"` for that vendor script if expecting the global factory. No `locateFile` or separate WASM URL is needed.

```html
<!doctype html>
<meta charset="utf-8">
<title>ARM browser check</title>
<pre id="result">Loading ARM runtime…</pre>
<script src="./vendor/unicorn_arm.js"></script>
<script>
MUnicorn().then(uc => {
  const e = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM | uc.MODE_ARM1176);
  try {
    const address = 0x10000;
    e.mem_map(address, 4096, uc.PROT_ALL);
    e.mem_write(address, [0x37, 0x00, 0xa0, 0xe3]); // mov r0, #0x37
    e.emu_start(address, address + 4, 0, 10);
    if (e.reg_read_i32(uc.ARM_REG_R0) !== 0x37) throw new Error('Wrong result');
    document.querySelector('#result').textContent = 'ARM1176 in WASM: PASS';
  } finally {
    e.close();
  }
}).catch(error => {
  document.querySelector('#result').textContent = String(error);
  console.error(error);
});
</script>
```

The artifact also detects classic Web Workers, where it can be loaded using `importScripts('./vendor/unicorn_arm.js')`. A Worker is preferable for game experiments so bounded guest execution cannot freeze input/rendering. Keep per-call instruction counts finite and add a host watchdog that can terminate the Worker.

## Types that matter

| Call / value | Published 2.1.4 behavior |
| --- | --- |
| `await MUnicorn()` | Resolves to `uc`; do not construct the engine before resolution. |
| `new uc.Unicorn(architecture, mode)` | Architecture/mode are Numbers. |
| `mem_map(address, size, permissions)` | Address and size accept Numbers or BigInts; wrapper converts them internally. Use page-aligned addresses/sizes (4096-byte pages). |
| `mem_write(address, bytes)` | `Uint8Array` or byte array. |
| `mem_read(address, size)` | Returns a new `Uint8Array` copy. |
| `reg_write_i32(reg, value)` | JS Number; writes the 32-bit bit pattern. |
| `reg_read_i32(reg)` | Signed JS Number; use `>>> 0` for guest addresses/unsigned integers. |
| `reg_write_i64(reg, value)` / `reg_read_i64(reg)` | Input converted to BigInt; output BigInt. Usually unnecessary for ARM general registers, useful for raw D-register bits. |
| `reg_write_float` / `reg_read_float` | JS Number to/from 32-bit floating register. |
| `reg_write_double` / `reg_read_double` | JS Number to/from 64-bit floating register. |
| `emu_start(begin, until, timeout, count)` | Begin/until/timeout converted to BigInt internally. **Count is a Number. Use timeout `0`.** |
| `hook_add(...)` | Returns a hook object; pass the object to `hook_del(hook)`. |
| `context_alloc/save/restore/free` | Saves/restores CPU context, not a complete copy of all guest memory. |

Avoid passing arbitrary untrusted JS Numbers above 2^53; this game's 32-bit addresses fit exactly. Preserve Thumb bit 0 on guest function/return addresses when passing an execution entry point.

## VFP initialization

The underlying Unicorn regression enables VFP as follows. This initializes access; execute a known game VFP function to verify the browser build's real instruction behavior.

```js
const cpacr = e.reg_read_i32(uc.ARM_REG_C1_C0_2);
e.reg_write_i32(uc.ARM_REG_C1_C0_2, cpacr | (0xf << 20));
e.reg_write_i32(uc.ARM_REG_FPEXC, 0x40000000);

// Examples only; use the original function's actual ABI/register contract.
e.reg_write_float(uc.ARM_REG_S0, 1.25);
e.reg_write_double(uc.ARM_REG_D1, 2.5);
```

Do not assume VFP registers are used for function arguments merely because VFP instructions occur in the body. Match the original iOS ARM calling convention and inspected call site.

## Callback signatures and a host-function boundary

```js
e.hook_add(uc.HOOK_CODE,  (engine, addressBigInt, sizeNumber, userData) => {}, userData, begin, end);
e.hook_add(uc.HOOK_BLOCK, (engine, addressBigInt, sizeNumber, userData) => {}, userData, begin, end);
e.hook_add(uc.HOOK_INTR,  (engine, interruptNumber, userData) => {}, userData);
e.hook_add(uc.HOOK_MEM_READ, (engine, type, addressBigInt, sizeNumber, valueBigInt, userData) => {}, userData);
e.hook_add(uc.HOOK_MEM_UNMAPPED, (engine, type, addressBigInt, sizeNumber, valueBigInt, userData) => {
  return false; // true only if the handler has actually made the access valid
}, userData);
```

Code-hook return values do not change execution. For an initial robust bridge, stop at an exact imported-function address, process the call outside the hook, and restart at the guest return address. This avoids relying on nested emulation from a hook.

```js
let pendingHostCall = null;
const hostHook = e.hook_add(uc.HOOK_CODE, (engine, address, size, data) => {
  pendingHostCall = {
    address: Number(address),
    r0: engine.reg_read_i32(uc.ARM_REG_R0) >>> 0,
    r1: engine.reg_read_i32(uc.ARM_REG_R1) >>> 0,
    lr: engine.reg_read_i32(uc.ARM_REG_LR) >>> 0,
  };
  engine.emu_stop();
}, null, hostFunctionAddress, hostFunctionAddress);

// In the outer driver:
e.emu_start(guestEntry, guestReturnSentinel, 0, instructionBudget);
if (pendingHostCall) {
  const call = pendingHostCall;
  pendingHostCall = null;
  const result = handleHostFunction(call); // synchronous, validated host service
  e.reg_write_i32(uc.ARM_REG_R0, result);
  e.emu_start(call.lr, guestReturnSentinel, 0, instructionBudget);
}
```

The final snippet is a boundary pattern, not a complete driver: `hostFunctionAddress`, `guestEntry`, `guestReturnSentinel`, `instructionBudget`, and `handleHostFunction` come from the game's loader. Real driver code must bound repeated host calls, retain a total frame budget, handle more than one return register/stack argument when required, and distinguish instruction-budget exhaustion from reaching a return. Do not discard LR's Thumb bit when restarting. Verify PC/LR behavior with a tiny native-reference case before using it for all imports.

## Known package limits

1. **Nonzero timeout can abort WASM.** Issue #48 reports unsupported `qemu_thread_create` even with `count=1`. Use zero timeout plus instruction bounds/Worker watchdog.
2. **No high-level `ctl()` in npm 2.1.4.** Current repository master is newer than the package. `MODE_ARM1176` is available.
3. **Not every exported hook constant is implemented by the JS wrapper.** In particular, do not infer support for `HOOK_INSN_INVALID`, `HOOK_EDGE_GENERATED`, `HOOK_TLB_FILL`, or `HOOK_TCG_OPCODE` solely from the constants. The wrapper throws on unsupported types. `HOOK_CODE`, `HOOK_BLOCK`, `HOOK_INTR`, and the memory paths above are implemented.
4. **TCI interpreter, not guest-to-WASM JIT.** Native Python Unicorn speed is not representative. Benchmark game update and rendering-boundary frequency in the browser.

Sources:
- Published source/API: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/src/unicorn-wrapper.js>
- Published build flags: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/build.py>
- ARM hook smoke test: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/tests/test_arch_arm.js>
- VFP enable regression: <https://github.com/unicorn-engine/unicorn/blob/8028ec436f2d9376525352dd38ed9ed6b9f6be10/tests/regress/arm_enable_vfp.c>
- Timeout failure: <https://github.com/AlexAltea/unicorn.js/issues/48>

No code from these examples was executed by this research task. The main task owns package setup, original-game function tests, Android measurement, and browser validation.
