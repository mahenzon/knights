# Browser rendering measurements — 16 October 2026

## Open iPad barrel slowdown — 17 October 2026

Follow-up device report:41–43draws/s during day2 with Hell Gate/Dragon Altar,
including barrels, an assassin on the hook, dragon arrival and active dragging;
day4 also slows. User reports CPU lines around1/1 or1/2ms (which individual
line was not distinguished). Sustained CPU simulation cost is therefore not
demonstrated. Browser callback cadence and a native-resolution comparison are
the next measurements; no root-cause or fix claim yet.

The expanded desktop day2 replay equips both upgrades and drives13 real
pickup/drag/release gestures. It covers1107hook-active frames,1158gate-active
frames, up to11actors and17smoke effects. At960×640,2400draws in40.004s,
render p95/max0.2/1.6ms, step p95/max0.1/0.6ms. At480×320,2400draws in40.003s,
render p95/max0.4/6.1ms, step p95/max0.1/0.2ms. Neither desktop run exceeds a
25ms draw gap; the smaller buffer is not a demonstrated desktop CPU speedup.
Both display the same final health999709, gold1290 and7sacrifices, and identical
gesture/actor/effect/captive-frame counts; full-state parity is not inferred.
Evidence: `artifacts/equipped-barrel-browser.json`. Both are muted and use
test-only castle HP, not exact user touches or real iPad acceptance.

Raw browser callback rate now appears in `perf=1`. A tested
`perf=1&perfScale=1` comparison lowers only the backing resolution to480×320,
retaining the60FPS target and simulation. The user requested keeping `perf=1`.
The iPad comparison result is pending. Do not treat either diagnostic option
as the reported FPS defect being repaired.

User reports visible FPS drops on Explosive Round (level11), day1, on an
M1 iPad with iPadOS16.6.1. No physical-device trace is available yet.
Two new muted desktop replays use the actual normal-difficulty day1 spawning,
seed42 and production rendering:40seconds walking,40seconds with synthetic
pickup/drop every90ticks. Only castle HP is inflated to keep the replay alive.
Both deliver2,400draws in about40.01seconds; no frame gap exceeds25ms.
Walking CPU render p95/max is0.3/0.7ms; throw replay0.5/0.6ms. Simulation p95
is0.1ms in both. The trials reach6actors,16/20smoke effects and8/10additive
effects. They do **not** reproduce the reported iPad slowdown. Silent output
also excludes actual audio processing, and CPU submission excludes GPU work.

Reproduce locally with `python3 research/render_browser_qa.py 8948
research/barrel_perf_qa.mjs`, then open `http://127.0.0.1:8948/?mute=1` and
select a measurement. Evidence: `artifacts/barrel-browser-baseline.json`.
The initial harness memory view was detached by save allocation; pointer
evaluation was corrected before the reported trials. No production defect
is inferred from that harness error.

`perf=1` now enables a battle-clock readout on the real game to measure the
failing iPad. Its cadence and CPU timings are checked against the real
FixedClock, including injected stalls and pause/resume. Desktop integration:
`artifacts/barrel-meter-browser-check.json`. It does not upload telemetry or
persist a setting. No speculative gameplay, rendering-quality or physics
change has been made; the root cause and fix remain pending device evidence.

The actual production renderer exposed a frame-limiter defect that the
simulation-only soaks could not detect. Small refresh jitter made the limiter
reset its deadline too late on each draw. A scene requiring less than1ms of
CPU submission time usually drew only52.5 times per second at the60FPS setting.

`FixedClock` now keeps its deadline phase, permits1ms of scheduling jitter,
and skips missed deadlines without drawing a catch-up burst. The simulation
step, physics constants, animation rules and save format are unchanged.
The regression first failed at201 draws in10seconds for a30FPS cap; it now
checks30/60FPS on60/90/120/144Hz timestamps, delayed frames and stop/resume.

## Actual browser comparison

The localhost-only harness injects counters around the existing `tick` and
`render` functions. It uses hard/day10000 Endless and Madness, purchased
equipment,300 simulated seconds of warmup and60 seconds of real-time play.
Only test HP is inflated to1,000,000 to keep castle attacks running. Every
two seconds synthetic weapon input exercises the normal production paths.
All browser URLs use `mute=1`; sound decoding/playback is therefore excluded.

| Workload | Before, draws/s | After, draws/s | After CPU render p95 |
| --- | ---: | ---: | ---: |
| Endless,60FPS |52.519|60.008|0.60ms|
| Madness,60FPS |52.546|60.011|0.70ms|
| Madness,30FPS |Not measured|29.999|0.60ms|

Each trial completed3,600 simulation ticks. Mode, elapsed simulation time,
castle health, terminal status and sampled actor/object maxima agree before
and after the change; the two Madness render caps also agree on their final
state fields. Full-state fidelity remains covered separately by the native
and Wasm regression suites, rather than inferred from these few fields.

The samples include20 actors, up to30 objects and150 debris fragments.
Those are observed one-second samples, not guaranteed per-frame maxima.
No missing images, browser warnings/errors or new resource requests appeared.
Wasm memory remained1,507,328bytes;319 decoded source images and16 loaded
packs stayed constant. Generated tint surfaces stabilized at23 after their
first uses, with no increase across the later Madness trials.

## Memory scope and limits

The319 loaded source images represent22,169,224 nominal RGBA bytes; generated
surfaces add2,375,680. The960×640 canvas is2,457,600bytes, or614,400bytes for
the480×320 battery-saver buffer. These are surface-size calculations, not
total process/GPU memory: browser copies, compressed blobs, audio, compositor
buffers and allocation overhead are separate.

All655 packed original images, including unused extras, total45,060,832
nominal RGBA bytes. The inventory reads PNG/JPEG dimensions from the original
files; it does not force every image into memory during normal play. The
bounded existing loader and tint caches need no eviction system based on
these measurements.

These are single desktop trials in Codex's Chromium browser on macOS.
Synchronous Canvas submission time does not measure GPU completion or
end-to-end touch/display latency. Short heap samples do not prove absence of
long-term leaks. Physical low-end Android, iOS, sustained temperature and
battery tests remain open. No new renderer, worker, dependency or HD artwork
was added.

Evidence: `artifacts/render-browser-before.json`, `render-browser-after.json`,
`render-browser-check.json`, `artwork-memory-inventory.json`. Reproduce with
`python3 research/render_browser_qa.py 8941`, open
`http://127.0.0.1:8941/?mute=1`, and use the three measurement buttons. The
local harness is excluded from the static release.
