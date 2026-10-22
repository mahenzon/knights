# Original application clock — 16 October 2026

**The original global visual clock advances twice per active battlefield frame,
while simulation/day/wave/land clocks advance once.** Map and main-menu frames
advance the global clock once. This is confirmed by executing the outer
application renderer and native virtual mode dispatch, not inferred from two
static writers.

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Probe: `research/probe_app_clock.py`. Evidence: `research/app-clock.json`.

## What executed

- **180 paired battlefield frames**: two starting global clocks (0 and17.25),
  each90 frames. One side executes
  `-[CrashLandingAppDelegate renderScene] (0x51bc)` → actual C++ vtable dispatch
  → `normalGame::Draw (0x20728)` → `DrawNormalGame (0x6d68)`.
  The other side executes the same native `normalGame::Draw` directly with
  **the exact dt supplied by the outer renderer**, excluding only the outer
  clock addition. The pair includes six paused frames and a0.5s host gap.
- **30 outer-renderer map frames**, including three paused frames, and two
  map initializations.
- **90 outer-renderer battlefield frames across three native day setups**:
  real `normalGame::InitMode` / `SetupNewLevel`, actual wave generation and
  actual land processing. The harness requests the next day after30 frames;
  it does not claim these days were completed.
- **36 outer-renderer main-menu/map frames** across real
  `SwitchMode (0x1d780)` → virtual DeInit/Init transitions: main→map→main.

Thus **336 outer-renderer frames**, plus180 paired inner-only frames. Native
capture and all embedded assertions pass. No audio is played.

## Exact clock behavior

Let `f` denote float32 rounding and `t` the current `_g_timef` at `0xe2360`
(nonlazy pointer `0xc73c8`). The native renderer obtains the host time through
`CFAbsoluteTimeGetCurrent`.

1. If `_g_paused (0xe235d)` is set, it supplies **dt=0**. Otherwise dt is the
   float32 difference from `_lastTime (0xe1d58)`, upper-bounded by
   `f(0.05)`. This path is `0x5210–0x5250`; the0.05 literal is at `0x52fc`.
2. At `0x5264`, it writes `t=f(t+dt)`.
3. It updates `_lastTime` even when paused, then dispatches the current mode
   through its actual vtable at `0x5294–0x52a4`, passing the same dt in r1.
4. Only normalGame's Draw calls DrawNormalGame (`0x20758`). That function
   writes **a second** `t=f(t+dt)` at `0x6edc`, before wave/land/object/device
   processing and drawing. Preserve these as **two separately rounded adds**;
   `f(t+2*dt)` or `2*dayElapsed` is not generally float32-equivalent.
5. Wave, device, missile, creep, drag-object, and land calls receive the
   original dt, not `2*dt`. Their timing uses per-object/per-level fields.

The supplied0.5s host gap yields dt=`0.05000000074505806`, adding this twice to
visual time but once to the day. Resuming after the paused sequence yields a
normal1/60 dt; paused time does not accumulate into the next frame's delta.

At the first battle frame from t=0:

| Value | Full original outer path | Earlier inner-only path |
| --- | ---: | ---: |
| `_g_timef` after frame |0.03333333507180214|0.01666666753590107|
| Land elapsed |0.01666666753590107|0.01666666753590107|
| Held fireball image |`fireball_0002.png`|`fireball_0001.png`|
| Ready tower fireball glow scale |0.6654389500617981|0.633179247379303|
| Flamethrower glow x scale |−0.6805649995803833|−0.3450639545917511|

The paired actor, device, missile, drag-object and land projections match
exactly in all180 frames. SHA-256 over complete native land/creep/drag-object/
artefact/missile memory pools also matches at every frame. **Draw streams
are different in all180 frames**, specifically due to fireball image selection
and glow scales. Paused frame differences persist because the two timelines
already have different visual phases before pause; their clocks remain frozen.

## Readers and what actually changes

A bounded complete direct PC-relative reference scan of the ARM image code
finds seven `_g_timef` indirection references: outer writer `0x5254`, inner
writer `0x6ec8`, and five reader sites. Some readers reuse the loaded pointer.
The dynamic memory-access trace confirms the actual read addresses below.

| Native reader | Effect using global visual time |
| --- | --- |
| Missile Draw `0x1b0ac` | Flamethrower missile halo uses `sin(f(t*10))` |
| Map Draw `0x231b0` | Selected shield/point overlay scale uses `sin(f(t*16))` |
| Map Draw `0x23374` | Completion marker glow uses `sin(f(t*10))` |
| Drag-object Draw `0x2c9f4`, `0x2ca64` | Held/thrown fireball or freezing-bolt six-image loop uses `trunc(f(t*34)) % 6`; halo uses `sin(f(t*10))` |
| Artefact DrawProcessCustom `0x2edd4`, `0x2ee4c` | Ready tower fireball/freezing-bolt six-image loop uses `trunc(f(t*8)) % 6`; halo uses `sin(f(t*10))` |

At normal continuously active battlefield timing, the image-selection clocks
therefore run at approximately68 and16 image steps/second, respectively;
actual drawing still samples the selected frame at the display rate. The
sinusoidal halo phase advances at20 radians/second. Map's clock still advances
at one dt, so map pulse/glow rates remain16/10 radians per second there.

There is **no global-clock reader in the inspected simulation Process paths**.
This audit gives no reason to double movement, projectile physics, attacks,
spawning, recharge, dragon/gate timing, day length, sky progression, or result
transition timing. Those use dt or their own accumulated fields. Existing
inner-world fixtures remain valid for these fields; their global-time-driven
rendered phases alone omitted the outer increment.

## Resets, menus, and pause

- The binary's initial global clock is0. The direct-reference scan finds the
  two additions above and no direct reset writer.
- Native map Init/reinit preserves17.25 exactly.
- Real main-menu→map→main `SwitchMode` calls preserve global time through
  native DeInit/Init; each subsequent menu/map frame adds one dt.
- Three actual `normalGame::InitMode`/`SetupNewLevel` calls preserve global
  clocks17.25,18.249984741210938,19.249969482421875, respectively. There are
  **no clock reads or writes during those initializer calls**. Their day/wave
  clocks reset to0, while global visual time remains continuous.
- Thirty battlefield frames after each initializer advance global time by
  approximately1second and wave/land elapsed by approximately0.5second.
- Native `_g_paused` freezes global time and dt-driven simulation. The pause
  overlay has its own frame-based movement (`DrawPauseGame` at `0x1c7b8`);
  frozen global time does not mean its panel must stop animating.
- The prior browser render calls feed `draw[0]` (per-day Rust time, incremented
  once in `Game::step` and reset in day initialization) into `missileScene`,
  `objectScene`, and `deviceScene`. That source cannot reproduce the native
  global phase. Supply a distinct continuous visual clock to those helpers;
  retain the existing simulation/day clock. Do not reset the visual clock at
  map entry or day start.

## Limits

`CFAbsoluteTimeGetCurrent` is supplied deterministically; platform framebuffer
presentation and accelerometer drawing are intercepted. Paired battle uses
the established world-scene harness: waves/HUD/legacy generic pools are
intercepted there, but actor/object/device/missile/land processing is live.
Separate native day-setup cases also execute real wave generation. End-flag
and result-panel drawing are intercepted. Assets, audio services and GL are
handled by existing read-only harness adapters; no GPU rasterization or
historical iPhone frame scheduling is emulated.

This resolves the global-clock coverage gap. It does not establish framebuffer
equality or exact historical timing under every display/load condition, and it
does not require replacing the browser's fixed-step simulation architecture.
No production or test files were edited.

## Browser correction — 16 October 2026

`web/lifecycle.mts::ApplicationTime` now owns the visual phase. Battle ticks
perform two float32 additions before the single Wasm step. `hidePanels(mode)`
selects menu/battle/paused timing at mode transitions. All three production
battle renderers read this clock; map effects share it. Day setup never resets
it. Static menus accrue virtual60Hz ticks lazily with no repeating timer;
ordinary Pause and background suspension freeze it. Initial hidden documents
also start suspended.

`tests/app_clock.mjs` first failed on the actual held-object renderer reading
0.0166666675 instead of the outer path's0.0333333351. It now compares336
captured native clock frames and540 production reader inputs. It also executes
production battle/menu/pause transitions and checks60Hz simulation with30/60fps
rendering on120Hz callbacks. Existing inner-world fixtures inject their captured
global clock explicitly; their expectations were not rewritten.

Browser QA recorded998 actual battle ticks with zero double-add mismatches,
unchanged phase/ticks through Pause, continuous phase through Options→Done,
and Abort→map. Diagnostic source is local-only `clock_browser_qa.py`; receipt
is `artifacts/app-clock-browser-check.json`. Development output remained muted.

This uses the existing fixed60Hz browser simulation contract. The numeric
clock rule matches supplied native frame deltas; browser frame scheduling and
lazy menu timing do not recreate historical device jitter or GPU presentation.
No physics/day/wave changes, new asset, Wasm or save-format change was needed.

Ordinary-pause flag cross-check: executing InitPauseGame0x1c934 changes
`_g_paused`0→1; ResumeGamePress0x1ca54 changes1→0. The original instructions
at0x1ca80–0x1ca8c (Abort) and0x1cad0–0x1cadc (Options) clear that same flag
before SwitchMode. This confirms that foreground Pause freezes phase, while
Options and the returned map resume menu time.
