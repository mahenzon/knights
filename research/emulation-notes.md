# Original-game emulation research

Checked 2026-10-15. This is source research, not a local execution or full-game compatibility result.

## Recommended first test

Run the supplied decrypted Knights Onrush 1.2.0 IPA in official touchHLE v0.3.0, then test that same release on the target Android phone. This keeps the original game code, art, physics, levels and progression. Browser packaging is a separate engineering project; there is no verified ready browser runtime in the sources checked.

## Exact game/version evidence

Source: <https://appdb.touchhle.org/apps/115>

| Game version | Emulator | Host | Report | Meaning and limits |
| --- | --- | --- | --- | --- |
| 1.1.0, `com.chillingo.Knights`, minimum iOS 2.2 | `v0.2.3-432-g3f30a46b` | Windows 11, NVIDIA RTX 2050 | 2026-06-21, 4/5 stars | Reporter passed the first 2–3 days in campaign, reports all modes work; global score uploads fail. This is not evidence of campaign completion. |
| 1.1.0 | `v0.2.2-479-gbddbb9c` | Android, Mali-G71 | 2024-12-10, 2/5 stars | Only menu/intro level of compatibility, with no explanatory remarks. Old emulator build. |
| 1.2.0, `com.chillingo.Knights`, minimum iOS 2.2 | `v0.2.1-77-gcee97a7` | Windows 10, Intel Graphics 520 | 2023-11-19, 1/5 stars | Missing `UITextView` class caused startup failure. Old emulator build. |
| 1.2.0 | `v0.2.0` | macOS Ventura, Intel Iris Plus | 2023-11-08, 1/5 stars | No detailed remarks. Old emulator build. |

The supplied IPA's CFBundleVersion is 1.2.0 (parent-agent inspection); do not apply the 1.1.0 success rating directly to this IPA. Its CFBundleShortVersionString of 2.2.0 is a different metadata field.

The old missing-class failure is plausibly fixed: official v0.3.0 includes a substantial `UITextView` implementation. That proves the class exists, not that every call from this game works.

Source: <https://github.com/touchHLE/touchHLE/blob/v0.3.0/src/frameworks/uikit/ui_view/ui_scroll_view/ui_text_view.rs>

## Release and Android setup

Official v0.3.0 was published 2026-10-01. GitHub's comparison confirms it contains the June report's `3f30a46b` revision: 82 commits ahead, zero behind.

- Release: <https://github.com/touchHLE/touchHLE/releases/tag/v0.3.0>
- Ancestry: <https://github.com/touchHLE/touchHLE/compare/3f30a46b...v0.3.0>
- Android ARM64 archive: <https://github.com/touchHLE/touchHLE/releases/download/v0.3.0/touchHLE_v0.3.0_Android_AArch64.zip>
- macOS x64 archive: <https://github.com/touchHLE/touchHLE/releases/download/v0.3.0/touchHLE_v0.3.0_macOS_x86_x64.zip>
- Official instructions: <https://github.com/touchHLE/touchHLE/blob/v0.3.0/README.md>

Android build requires ARM64 application support, not merely a 64-bit processor. Official Gradle source sets minimum API 21 (Android 5), target API 31, and `arm64-v8a` only. Actual graphics/performance still needs target-phone testing.

Source: <https://github.com/touchHLE/touchHLE/blob/v0.3.0/android/app/build.gradle.kts>

1. Install the APK from the official archive and launch touchHLE once.
2. Copy the IPA into `touchHLE_apps` through its file-manager integration. Android may expose touchHLE as a document provider in Files. The direct path is `/sdcard/Android/data/org.touchhle.android/files/touchHLE_apps`, but modern Android restricts access.
3. Select the IPA in the emulator's app picker. Touchscreen input is supported.
4. Check campaign, endless/challenge modes, sound, drag/fling input, and save/relaunch. Saves reside in `touchHLE_sandbox`; preserve them when replacing the emulator.

ADB is an official fallback for file copying. Desktop command-line launches are supported; Android uses the app picker. No game backend is needed for local emulation, but the old online leaderboard service is not restored by an emulator.

## Browser/WASM investigation

The official Emscripten/WASM request remains open: <https://github.com/touchHLE/touchHLE/issues/129>

The original maintainer identified three major pieces: replace the Dynarmic CPU translator (native x64/AArch64), translate OpenGL ES 1.1 to browser graphics APIs, and adapt scheduling/main-loop behavior. It is not an IPA-to-WASM file conversion.

Source: <https://github.com/touchHLE/touchHLE/issues/129#issuecomment-1593302581>

There is newer positive evidence: in June 2026 `rebelle3` demonstrated a work-in-progress browser build reaching the Touch and Go splash screen at about 15 FPS, with graphical artifacts. The author describes Unicorn plus QEMU TCI for CPU execution, Emscripten fibers, a minimal GLES1→GLES2 translator, and Emscripten SDL2/OpenAL. They said they would share the fork after fixing issues and reaching gameplay. This is not Knights Onrush compatibility evidence.

Sources:
- Demo report: <https://github.com/touchHLE/touchHLE/issues/129#issuecomment-4642176736>
- Architecture details: <https://github.com/touchHLE/touchHLE/issues/129#issuecomment-4642376435>
- Author's public repositories checked: <https://github.com/rebelle3?tab=repositories>

No public touchHLE fork appeared in that author's repository inventory on the check date, and GitHub repository search for `touchhle wasm` returned zero results. These bounded checks do not prove no browser fork exists anywhere; they establish no ready implementation was verified here. Do not promise a faithful browser restoration on the basis of the splash-screen demo.

Upstream explicitly does not accept AI-generated contributions; a local experimental fork must not be represented as an upstream-ready contribution.

Source: <https://github.com/touchHLE/touchHLE/issues/129#issuecomment-4647651884>

## iOS limitation

The official FAQ, updated 2026-10-01, explicitly says touchHLE does not run on iOS and does not officially support it. JIT restrictions are among the technical obstacles. The Android emulator route therefore does not automatically produce an installable iPhone app. A browser reimplementation or separately developed emulator port would need its own Safari/device tests.

Source: <https://touchhle.org/faq.html>

## Not verified here

No emulator executable or APK was downloaded or executed by this research task. No phone was tested. Current-version 1.2.0 gameplay, campaign completion, save persistence, performance and browser feasibility remain execution tests for the main task.

## Follow-up: a usable ARM/WASM CPU component exists

Checked 2026-10-15. Parent task subsequently reported that the supplied IPA starts at 60 FPS in touchHLE v0.3.0. This follow-up investigates browser CPU execution only; it does not replace the main task's gameplay checks.

### Preferred package: `@alexaltea/unicorn-js@2.1.4`

Unlike the unpublished whole-touchHLE browser fork, **Unicorn.js has a current published browser distribution**. npm reports version 2.1.4, published 2026-06-19, from Git commit `560284c59c11c8d6c94d537f4354339f069ddcdf`. Its pinned native Unicorn submodule is `8028ec436f2d9376525352dd38ed9ed6b9f6be10`. The repository was last pushed 2026-06-25 when checked.

- Project: <https://github.com/AlexAltea/unicorn.js>
- Package metadata: <https://registry.npmjs.org/@alexaltea%2Funicorn-js>
- Exact npm archive: <https://registry.npmjs.org/@alexaltea/unicorn-js/-/unicorn-js-2.1.4.tgz>
- Browser artifact URL: <https://cdn.jsdelivr.net/npm/@alexaltea/unicorn-js@2.1.4/dist/unicorn_arm.js>
- Exact source: <https://github.com/AlexAltea/unicorn.js/tree/560284c59c11c8d6c94d537f4354339f069ddcdf>

The npm archive was inspected in memory without executing or installing it. It contains `dist/unicorn_arm.js`, **837,008 bytes**, plus GPL-2.0 LICENSE; all-architecture `dist/unicorn.js` is 9,260,121 bytes. No separate `.wasm` file is required: the build sets Emscripten `SINGLE_FILE=1`. The artifact detects browser, Worker, and Node contexts. Requirements are WebAssembly and BigInt support. Use only the ARM artifact for this game.

The install and module entry point are:

```sh
npm install --save-exact @alexaltea/unicorn-js@2.1.4
```

```js
const MUnicorn = require('@alexaltea/unicorn-js/arm');
const uc = await MUnicorn();
const engine = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM | uc.MODE_ARM1176);
```

For a plain browser script, loading the ARM file defines `MUnicorn`. These snippets describe the published API; they were not executed in this research task.

### ARMv6, VFP, and host-function hooks

Verified in source, with remaining execution limits clearly separated:

- The JS wrapper exposes ARM/Thumb modes and `MODE_ARM1176`. The pinned native source selects `UC_CPU_ARM_1176` from that flag and implements ARM1176 with ARMv6K features. This is more specific than relying on the default Cortex-A15 CPU model.
- The wrapper exposes general registers, S/D floating-point registers, `ARM_REG_C1_C0_2`, `ARM_REG_FPEXC`, `ARM_REG_FPSCR`, and float/double register read/write helpers. Upstream native VFP regression code enables coprocessor access with `C1_C0_2 |= 0xf << 20` and `FPEXC = 0x40000000`. **This establishes available functionality, not proof that Knights Onrush's VFP instruction mix works in the browser build.** Run original isolated functions against native Unicorn reference outputs first.
- `hook_add(type, callback, userData, begin, end, extra)` supports `HOOK_CODE`, `HOOK_BLOCK`, `HOOK_INTR`, and memory read/write/fetch/error hooks. Exact/ranged code hooks can stop execution at imported or platform-function entry points, inspect guest parameters, supply return values, and resume at LR. Hook addresses arrive in JavaScript as **BigInt**. All game addresses fit in 32 bits, but avoid comparing a callback BigInt directly with a Number.
- Available core APIs include memory map/read/write/protect/unmap, register read/write, `emu_start`, `emu_stop`, and CPU context save/restore. The published build exports `_uc_mem_map_ptr` and batch register C functions but does not wrap them in its high-level JS API; do not assume a JS zero-copy helper exists.
- **npm 2.1.4 does not include the newer `ctl()` APIs visible on current master.** The package was inspected: no `this.ctl` implementation. ARM1176 can be selected using the constructor mode above without rebuilding.

Sources:
- Published JS wrapper: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/src/unicorn-wrapper.js>
- Published ARM smoke/hook test: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/tests/test_arch_arm.js>
- ARM CPU selection and implementation: <https://github.com/unicorn-engine/unicorn/blob/8028ec436f2d9376525352dd38ed9ed6b9f6be10/qemu/target/arm/cpu.c>
- Native VFP enable regression: <https://github.com/unicorn-engine/unicorn/blob/8028ec436f2d9376525352dd38ed9ed6b9f6be10/tests/regress/arm_enable_vfp.c>

### Critical execution limit: use instruction bounds, not timeouts

An open report dated 2026-10-13 reproduces a **WASM abort when `emu_start` receives a nonzero timeout**, through unsupported `qemu_thread_create`. It was reported on the AArch64 variant, but the timeout mechanism is shared. Safe initial usage is `emu_start(begin, until, 0, instructionCount)` with a nonzero bounded instruction count. A Worker allows the host to terminate an unresponsive execution attempt. Do not rely on the timeout argument for safety or UI responsiveness.

Source: <https://github.com/AlexAltea/unicorn.js/issues/48>

The browser build restores QEMU's **TCI interpreter**. It does not dynamically compile guest ARM code into WebAssembly. Thus native Python Unicorn speed is not a browser performance estimate; full-game performance requires a browser benchmark. Avoid an instruction-by-instruction JS callback over the whole binary when only a few host-function addresses need interception.

Sources:
- Build and TCI patches: <https://github.com/AlexAltea/unicorn.js/blob/560284c59c11c8d6c94d537f4354339f069ddcdf/build.py>
- Still-open WASM JIT request: <https://github.com/AlexAltea/unicorn.js/issues/16>

### Fit for an original-logic browser bridge

This supplies the missing **CPU execution component**, not an IPA loader or iOS environment. A small game-specific bridge could keep ARM C++ logic and emulate only required platform services. Its concrete remaining work is:

1. Load Mach-O code/data at their expected guest addresses, set stack/heap, resolve imports/stubs, and run required static initialization.
2. Enter identified game-update/input functions with the original ARM calling convention and valid game objects. Keep game logic, tables, and state in guest memory.
3. Hook rendering/audio/file/time/allocation boundaries and map them to Canvas/WebGL, WebAudio, and local browser storage. Preserve data layout, float behavior, ordering, and callback semantics.
4. Compare outputs of original functions with the native reference before integrating full frames; measure a representative campaign frame on Android before committing to whole-game interpreted execution.

This architecture is an engineering inference from the verified APIs. It is viable to prototype; it is not yet proven for this game. C++ symbols reduce discovery work but do not remove static initialization, Objective-C references, libc/libgcc dependencies, allocator behavior, or the original ABI. If the game depends on guest threads or calls a guest callback from a host hook, explicit scheduling/re-entry behavior must be tested.

### Alternatives and build cost

`petabyt/unicorn-wasm` is an older source fork: last pushed 2025-08-27 when checked; CMake version declares Unicorn **1.0.3**; repository description says TCI patches and backported `uc_mmio_map`. It has **no GitHub releases** in the release API. It can be useful for C/C++ linkage into an Emscripten program but is a less direct starting point than the published JS package for a JavaScript game-specific bridge.

Sources: <https://github.com/petabyt/unicorn-wasm>, <https://github.com/petabyt/unicorn-wasm/blob/master/CMakeLists.txt>

The preferred npm artifact requires **no compiler or local native build**. Rebuilding/customizing Unicorn.js requires Python 3, CMake, Emscripten SDK, and a recursive clone; `python3 build.py arm` builds just ARM. Source patching restores TCI and corrects indirect-call signatures for WebAssembly. Build duration was not measured. Both compared projects identify GPL-2.0 licensing; preserve license notices and exact corresponding source/version when packaging a browser distribution. This note does not settle licensing of the recovered game or broader combined works.

No emulator code, tests, or application implementation was written in this follow-up. The package was inspected but not executed; VFP correctness, hooks changing PC/LR, browser speed, Android behavior, and Safari behavior remain explicit tests for the main task.
