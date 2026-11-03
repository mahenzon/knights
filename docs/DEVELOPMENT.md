# Development

This guide covers local setup, diagnostics and implementation details. For player
instructions, start with the [README](../README.md). Release validation is recorded
in [acceptance](ACCEPTANCE.md) and the [physical-device checks](DEVICE-TESTING.md).

## Quick start

Install Node.js 24+, Python 3 and Rust through rustup. The checked-in
[`rust-toolchain.toml`](../rust-toolchain.toml) selects Rust 1.96.0, rustfmt,
Clippy and the WebAssembly target. The npm lockfile pins the development tools;
none of those npm packages ship in the game.

1. From the project root, install dependencies and verify the checkout:

   ```sh
   npm ci
   npm run check
   ```

2. Build and start the local server:

   ```sh
   npm run dev
   ```

3. Open [the local game](http://127.0.0.1:8875/?mute=1). This development URL is
   silent; remove `mute=1` for a deliberate audio check. Stop the server with
   Ctrl+C when finished.

The static website is generated in `build/web/`. The server binds only to this
computer. Phone validation is covered by the [physical-device checks](DEVICE-TESTING.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the static website into `build/web/` |
| `npm run check` | Build, typecheck, lint, check formatting and run all fast tests |
| `npm run dev` | Build and serve only `build/web/` on localhost8875 |
| `npm run format` | Format browser code/tests/config with Biome and Rust with rustfmt |
| `npm run typecheck` | Check TypeScript without writing output |
| `npm test` | Run Rust, Node/Wasm regressions with focused fixtures, and Python tests against the last build |
| `npm run test:native` | Run optional exhaustive native replays against the last build; requires local research captures |

## Development diagnostics

Open development tabs at **`http://127.0.0.1:8875/?mute=1`**. Add `&dev=1` only when the unrestricted castle picker is needed. Keep automated/background browser sessions muted. Remove `mute=1` for a deliberate audio test, then close the unmuted tab. The flag never writes the player's saved sound preference.

Add `&perf=1` for an on-screen battle performance readout: delivered draw
callbacks/target per second, longest gap, CPU draw/step p95 and maximum, plus
actor/effect counts. It measures submission time, not GPU completion. Sampling
uses the existing battle clock, pauses with it and resets across Resume; it
adds no timer, storage or upload. The readout is absent by default. A reported
iPadOS16.6.1 barrel slowdown remains open; use these device measurements before
changing simulation, effects or resolution. See [rendering measurements](RENDERING.md).

The readout also reports raw browser animation callbacks separately from game
draws. `perf=1&perfScale=1` is an opt-in graphics-cost comparison:480×320
backing pixels while preserving the60FPS target, physics and viewport size.
It does not change saved battery settings. `perfScale=1` alone does nothing;
normal rendering remains at its existing resolution.

`fixBallistaGate=1` opts into one correction: enemy kind5 ejects from the Hell
Gate mouth's x center. `core.fix_ballista_gate(0|1)` selects this runtime policy;
other values are rejected. `start` and `restore` preserve the selected policy,
but it is not serialized or persisted in settings. Version22 saves are unchanged.
The normal unflagged URL preserves native captive drift. See the
[quirks register](ORIGINAL-QUIRKS.md) for scope, sources and the other explicit
browser adaptations. The native gate suite still runs with the fix disabled.

`legacyShare=1` makes **Tell a friend** use the original email wording and
historical App Store link. The default shares the current game URL through the
device share sheet, or opens an unsent email draft when Web Share is unavailable.
The flag is not saved or included in shared links.

## Source files and build inputs

The build reads the extracted production inputs in
[`data/game-source.json`](../data/game-source.json), plus the image, audio and
font files under `dist/assets/`. The source data records hashes of the original
captures and executable for provenance; it contains only the fields used to
generate `web/game-data.json` and `engine/src/data.rs`. The PNG app icons are
committed under `web/`. No original executable, IPA or `research/` capture is
needed to build the game.

A clean checkout can run `npm ci && npm run check` with the pinned Rust
toolchain, Node24 and Python3 installed. Normal tests use focused fixtures in
`tests/fixtures/`, alongside Rust, browser, Wasm and Python regressions. The
GitHub Actions workflow runs these checks and deploys only `build/web/` to
Pages.

## Optional native replay checks

Exhaustive frame-by-frame comparisons live in `tests/native/` and run with
`npm run test:native` after `npm run build`. They require the original captures
at their documented paths under `research/` and fail if those captures are
missing. They are separate from `npm test`, `npm run check` and Pages CI.
The detailed native frame counts below describe these optional suites, not
the coverage run by a fresh checkout's default checks.

The capture scripts and research notes remain versioned. Raw research JSON,
disassembly dumps, downloaded upstream source copies, browser reports and
screenshots in `artifacts/` stay local and ignored. Regenerating captures
requires the original executable and the research tools described in
[reverse-engineering tools](reverse-engineering-tools.md). CI does not fetch,
upload or publish those captures.

The history cleanup removes these generated records from the shared Git
history as well as its tracked files. Existing local copies remain available;
the repository is not their backup. References to captures, browser receipts
and screenshots in the research notes and dated progress entries identify
local evidence, not files available in a fresh checkout.

[Acceptance](ACCEPTANCE.md) tracks the remaining release checks;
[progress](PROGRESS.md) preserves dated research and validation receipts.

## Boundaries and file organization

- `engine/src/`: Rust simulation, with focused enemy/projectile/weapon modules. `lib.rs` owns shared state, simulation ordering and the Wasm exports; `snapshot.rs` owns serialization, migrations and state validation. Small unit-test blocks stay inline. The larger root, projectile and weapon test blocks live in `tests.rs`, `projectiles/tests.rs` and `weapons/tests.rs` as private child modules under `#[cfg(test)]`, retaining access to private implementation details. Their shared `game()` fixture lives in test-only `test_support.rs`. Browser integration goes through the public Wasm ABI. Focused native-reference fixtures live in `tests/fixtures/`; optional exhaustive captures stay local in `research/`.
- `web/`: browser input, rendering, audio, loading, campaign state and PWA shell. The audio, offline lifecycle, map, image-loader, enemies, HUD, shop, Play/pause, Options, local scores, campaign/economy and bitmap-font modules are strict TypeScript `.mts` files that compile to `.mjs`. Existing rendering/scene/lifecycle shell modules remain JavaScript; `checkJs` is explicitly off during this incremental migration. New browser modules should use strict TypeScript. There is no claim that the entire shell is typechecked yet.
- `tests/`: runnable integration and regression tests. Test the compiled modules in `build/web/`; native fixtures provide independent expectations. Avoid tests that simply restate implementation formulas.
- `tools/`: build and asset-recovery scripts. `build/` is generated and ignored. `research/` holds original-executable probes, disassembly and evidence; probes are development tools and never enter the published site.

## Conventions

Use named exports, explicit types at module boundaries and small modules with one responsibility. Keep simulation rules in Rust and DOM/audio/storage responsibilities in the browser shell. Do not replace original numeric behavior with a stylistic simplification without a native regression check. Validate saved data and packed-image offsets before use. Preserve existing saves when a restore fails.

Biome enforces the checked-in JavaScript/TypeScript, HTML and CSS rules: two-space indentation, single JS quotes and a100-column line width. Rust uses standard rustfmt plus warning-free Clippy. Generated Rust tables preserve recovered float literals, with a local documented precision/format exception. Do not edit generated files to silence checks; change their generator.

Changes to the Wasm draw layout must reach the renderer and Wasm tests together. Changes to snapshot serialization need versioned migration, malformed-input rejection and deterministic replay coverage. New image-loading behavior needs a retry/deduplication test and inclusion in the static offline allowlist. Rebuild before browser QA, apply the PWA update if offered, and verify the default and muted paths.

## Build and loading

The Rust release binary and TypeScript are compiled before hosting. The browser still instantiates Wasm and decodes images, which is normal browser work. `tools/pack_art.py` groups unchanged PNG/JPEG bytes by scene/enemy, reducing HTTP requests without changing pixels. The loader checks pack boundaries and shares pending fetch/decode work between background preparation and Play. Only equipped devices' artwork is decoded.

The menu prepares the map, first/saved battle, shop and Help. A separate 43,093-byte shop pack provides the original results backdrop/buttons and purchase bubble; these are ready before battle so the end transition never waits on them. Shop item images warm in the background; purchases warm newly equipped devices. Results and shop prepare the next day. Failed background preparation is nonfatal; Play retries with a visible error if necessary. The service worker caches the complete static allowlist once preparation finishes. Await **Ready offline** before disconnecting. The current build is116 files/~23.1MiB; first-day battle artwork is106 images in5 requests/~1.60MiB, including the already-loaded menu/font pack. These are transfer counts, not a measured mobile latency or battery guarantee.

## Current Wasm contract

Snapshot22 is63,652 bytes and reads versions2–21. It appends200 finite held-recovery
floats after the62,852-byte v21 prefix. Pickup from STUN preserves the existing
recovery countdown before resetting held duration; re-pickup and hooking retain
it. While the retained pose is4, recovery runs after the scared-pose check and
before normal movement. Expiry switches the pose and advances one frame at saved
walking speed without releasing the actor. Old held/hooked pose4 saves keep their
previous behavior until the scared transition because their timer was lost.
Snapshot21 appended the wave countdown at62848; all earlier offsets remain fixed.
The public input/draw ABI is unchanged. `tests/battle_input.mjs` compares80 native
states, and Rust checks re-pickup, hooked replay, migration and atomic rejection.

Snapshot20 is62,848 bytes and reads versions2–19. It appends25 device records of3 words (displayed animation, pending recharge flash, displayed timer), validating animation range and boolean values. Older snapshots infer presentation from their live device state. Snapshot19 is62,548 bytes and reads versions2–18. Version19 appends200 retained animation-pose words (0–10, or11 for no override) after the61,748-byte v18 prefix. Older saves infer the previously displayed pose from their state. Snapshot18 is61,748 bytes and reads versions2–17. Version18 appends200 finite validated unit angles after the unchanged60,948-byte v17 prefix. The previously unused unit draw-row9 now carries the rotation angle; earlier captured direction columns migrate to0 because old saves lack rotation history. Snapshot17 is60,948 bytes and reads versions2–16. Version17 appends the12-float gate drawing pose after the unchanged60,900-byte v16 prefix; v16 saves reconstruct that pose from their captured actor row. Version16 appends a captured-frame boolean, gate actor index and2,700 actor-presentation floats to the unchanged50,092-byte v15 prefix. Version15 appends the shared draw-order timer and two230-entry lists (current and captured frame) to the unchanged48,248-byte v14 prefix. Legacy saves reconstruct the list and restart the refresh interval; current saves preserve it exactly. Version14 appends world-shake strength, retained offsets and an active-frame boolean. Version13 is48,232 bytes. Version13 appends door shake, impact age, captured draw coordinates and frame flags; older saves preserve elapsed time without inventing a fresh impact. Version12 appends one validated door-destruction boolean to the48,208-byte v11 prefix; fragment kinds3–14 now share the original150-slot pool with ice kinds0–2. The v10 prefix is45,760 bytes; v9 is41,560 bytes; v7/v8 is32,344 bytes. Version8 changed unit animation from elapsed seconds to a native fractional frame and added the ability-active flag; loaders convert older animation values. Version9 appends256 smoke slots ×9 words. Version10 appends150 ice-fragment slots ×7 words. Version11 appends256 smoke velocity pairs and100 missile trail timers, and adds corpse-flight bit4 to unit ability flags. Old saves default these additions to zero. Smoke allocation now uses the original first50 slots; all256 legacy slots remain readable/serializable. Validate enum/range/finite fields before replacing the live save. Browser envelope3 carries campaign metadata separately.

Draw data is6,087 floats. `draw_ptr()` exposes current simulation state; `frame_ptr()` uses the same layout/buffer but substitutes captured creep/dragobject poses, gate index and the separate gate drawing pass. It also supplies the original pre-update ballista animation in device-row9 and flags in device-row10: bit0 is animating, bit1 is timer-visible. The live getter retains its previous device fields. Call the appropriate getter before reading; the browser uses presentation only while rendering the battlefield. The existing3,701-float prefix includes end-transition fields at3698–3700; smoke records begin3701 and use6 floats each (kind+1, x, y, scale, alpha, additive). Fragment records start5237 and use4 floats (kind+1, x, y, scale); door-destruction state is at5837, captured frame flags at5838 and door x/y at5839–5840. World translation is5841–5842; retained smoke/fragment offset is5843–5844. Shared creep/dragobject IDs occupy5845–6074:1–200 are creep slots,201–230 are dragobjects, zero terminates the list. The gate captive pose occupies6075–6086 and is drawn before the lid, independently of the ordinary actor pass. Native shop and results scenes are browser TypeScript and do not change the save ABI.

`tests/shop.mjs` compares executed original layouts/restrictions,120 entry-animation frames, purchase-dialog artwork and result screens. Shop input retains a swipe threshold and keyboard access; no animation loop runs while idle or backgrounded. `tests/menu-motion.mjs` checks260 native terminal-score frames and45 purchase-dialog frames. Menus use the same60Hz clock, render at the battery-saver cap, and stop when idle/backgrounded. Animated result counters never mutate saved rewards. Defeat-transition snapshots may contain negative HP because actors keep attacking during the transition; the loader accepts this only for defeat states. Finished defeats are not offered for resume. Native save eligibility and Done navigation are captured in `save-lifecycle.json`; ongoing battles and unacknowledged winning results remain recoverable.

The tiny fullscreen control, restoration error dialogs remain browser adaptations. Play, saved-game confirmation and pause controls now use original artwork and recovered animation.

`tests/font.mjs` compares21 native font traces. The original constructor ignores glyph bearings, and application initialization sets tracking to−16; reproducing only the constructor gives incorrect wide lettering. `tests/effects_wasm.mjs` includes all four spell impacts at three charge strengths. Timer thaw is instantaneous in the original; ice shatter on landing/death matches74 native fragment frames in `tests/ice_fragments_wasm.mjs`. A fatal frozen landing emits32 fragments, a nonfatal one16 with no reward.

## Offline lifecycle and icons

`offline.mts` waits for the actual worker to activate and rejects a redundant installer. `navigator.serviceWorker.ready` cannot report a failed first install because its promise never rejects ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/ready)). The page reports an interruption, permits another attempt from normal battle loading, and retries on the browser's `online` event. Cached responses from a failed attempt are reused only within the same content version. A failed update leaves the active version intact.

Cache names include the registration scope, so two installations in separate directories do not delete each other's files. Older unscoped caches are retained because ownership may be shared; they may temporarily consume an extra copy of the game's storage. A future explicit storage cleanup can remove them once other installations are ruled out. The ready indicator is sent only after all allowlisted files are stored and the worker activates.

The original512×512 App Store artwork supplies192/512px PNG manifest icons and a180px Apple touch icon. `research/icon-conversion.json` records conversion provenance. The user confirmed Android Chrome installation on the Galaxy S24 Ultra: knight icon, app window without browser chrome, working audio. The manifest now requests `fullscreen` (standard fallback: standalone, minimal-ui, browser); installed fullscreen and standalone share the3:2 layout with no browser footer. Android must update the installed manifest before its system-bar behavior changes; a page/service-worker update alone does not prove that happened. iOS installation and fullscreen behavior still require physical testing. These are original graphics, not a generated HD remaster.

`tests/offline.mjs` covers worker activation/failure, reuse after an interrupted download, cache-scope isolation, readiness, offline subdirectory navigation and exact icon bytes. Browser fault-injection evidence is recorded in PROGRESS.md.

## Media failure recovery

One streaming media element handles the OST. A failed HTTP response before metadata can surface as media error4/NotSupportedError, not network error2. `Soundtrack` reloads all media-error states, with up to3 background retries while playback is wanted; `pause` cancels pending timers. Autoplay blocking requires an ordinary gesture and does not trigger download retries. Do not suspend the effects AudioContext for a menu-to-menu transition: doing so invalidates the async click that triggered the navigation. `tests/menu_lifecycle.mjs` covers that call chain and map-loading render races.

## Original Options

`web/options.mts` reproduces six native draw states,46 input-boundary cases and90 confirmation animation frames from `research/probe_options.py`. The music slider uses `(x−70)/290`, and its artwork starts at `45+290×volume`. Options artwork is included in the existing menu pack and preloaded at boot. Controls have keyboard/screen-reader equivalents. No animation loop remains active after entrance or confirmation settles.

The original offers difficulty, Reverse Orientation (Siege mode), Mute Music and music volume. Done returns directly to gameplay when opened from Pause; Cheat and Reset are absent there. Orientation changes affect the next Siege/Madness day, while difficulty updates the player's run and subsequent setup. Both preferences persist across reload. Native Cheat marks every castle completed/open; native Reset clears those flags except the first open castle, resets difficulty/orientation, and preserves scores. Both use recovered confirmation wording. Existing resumable checkpoints are not deleted by these actions.

Music mute pauses only the streaming OST, leaving effects available. Legacy global-mute preferences remain muted after migration and can be released with the native music control. The developer-only footer (`?dev=1`) retains the30FPS battery toggle. URL `mute=1` still suppresses all sound without modifying preferences.

Campaign/save boundaries now use explicit DayConfig, Run/SavedRun, ShopItem and Wasm BattleCore types. Shop and asset loading share those contracts. Saved JSON enters as unknown and checks nested objects before dereferencing them. Native procedural fixtures and all579 day/difficulty configurations still pass after the migration.

## Local high scores

`scores.mts` restores the original two-column Endless Siege/Madness table and its first25 visible ranks, recorded in `research/hiscores.json`. Four native scroll views and64 drag/inertia frames are compared in `tests/scores.mjs`. New records highlight the name; each list retains its best100 entries, matching the native100 entries plus temporary insertion slot. Result screens reuse the original `frame_name.png`, Enter your name label and14-byte name limit (empty input becomes PLAYER). Browser text entry preserves valid Unicode when truncating.

Scores save before retiring the result. A storage failure keeps the result available for retry. Campaign finishes still return to the map; Endless/Madness Done returns to the local score list. Records and player name survive reload; music mute does not silence Done effects. Global explains that the retired OpenFeint service is unavailable. The earlier combined `knights-best` value is preserved in storage, but cannot be attributed to either original mode and is not fabricated into a mode record.

## Shop input and original UI verification

`research/probe_ui_fidelity.py` executes92 native purchase cases (23 items × new/owned/no-gold/no-sacrifices). Every affordable non-owned item opens confirmation, without changing gold, sacrifices or inventory. Existing spell replacement fixtures confirm paid downgrades and switching between fire and ice. `tests/shop_input.mjs` replays the production DOM handlers through a compatibility click retargeted onto newly inserted YES/NO controls; it failed before the fix. Modal controls require their own matching pointer release inside the button, while keyboard/accessibility activation remains supported. A touch `pointerleave` after `pointerup` must not revoke that completed press: mobile browsers can emit it before `click`. The prior press/leave boolean guard caused inert buttons across all native menus; replay both desktop and touch event orderings when changing this shared handler. Tests include scrolling, cancellation/lost capture, another finger, repeat entries and purchases across days. This reproduces the hazardous event sequence, not a captured Galaxy S24 touch trace.

Help pages are unchanged JPEGs in one354,385-byte pack; no direct per-page image requests remain. Background warmup and explicit opening share fetch/decode work. All pages are ready before controls appear. Native five-tab hit boxes and Exit artwork/scale are in `ui-fidelity.json` and `tests/help.mjs`. The fullscreen button starts hidden, is revealed after handler installation and lives outside the artwork; actual fullscreen/Home Screen hides browser controls.

Native `_g_gradient` binds `bottom_podlozhka.png`, verified through original `LoadAndInitLevel`; the older fixture name gradient.png was an inaccurate probe label. HUD now uses the original flipped stretch and draw order, yellow gold/cyan sacrifices, HP thresholds and pause sprites. `tests/hud.mjs` executes the production HUD drawing statements against native commands. Extra day/countdown text appears only with `dev=1`.

`research/probe_credits.py` captures original names, text, colors, controls and180 entrance frames. `CreditsMotion` and `creditsScene` in strict `play.mts` reproduce the three scaled groups, stop when settled/backgrounded and resume on a gesture. Original font aliases share the interface atlas. Visit retains the native http://imoregames.com destination; no external site is loaded automatically.

Map records use `knights-castle-records` with twelve validated `{last,best}` entries. Campaign Done saves the record before retiring the run and returns to the map. Native star thresholds, captions, button positions and all twelve hints are compared in `tests/native/map.mjs`. Full campaign synthetic coverage includes all193 days across the12 castles on all three difficulties (579 battles); this remains distinct from physical playthrough/balance QA.

## Long modes and effects audit

`tests/endless_wasm.mjs` exercises every metadata transition through the original10000-day limit for both modes and all difficulties. It checks48 unassisted natural results across early/late boundaries, finite draw buffers and deterministic save/replay. Two five-minute hard/day10000 soaks use elevated test-only castle HP to sustain attacks and verify bounded Wasm memory. They are not claims that those days are human-completable or phone performance measurements. `probe_campaign_followup.py` now captures156 native cases through day10000.

`probe_missile_effects.py` executes the real50-slot smoke allocator, missile routines and smoke ticks. A supplied xorshift stream isolates random effects; historical RNG is still unrecovered. `tests/native/missile_effects_wasm.mjs` compares720 exact effect frames,18 draw fixtures, old-save migration and malformed motion rejection. Renderer and asset-loader tests cover cannon centering/glow, flame pulse, freezer trails and upgraded ballista blasts. Browser checkpoints in `missile_visual_qa.py` stop simulation on a disposable loopback origin, without shipping test saves or handlers. The QA server deliberately disables its service worker, so its offline-status warning is expected.

`probe_corpses.py` captures26 grounded/airborne/wall death cases over2,004 frames. Corpses fade at450 alpha units/second only after the death animation reaches its final integer frame. A dead airborne actor continues falling, returns to its flight pose, and repeats the original death reward on wall/ground impact; this quirk is intentional. Explosive knights disappear on death. Snapshot11 preserves corpse-flight status; draw flag16 selects the airborne corpse sprite. `tests/native/corpses_wasm.mjs` checks positions, poses, alpha, removal, rewards and save replay. Rendering uses core alpha directly. General fragments are now covered below. Remaining presentation fidelity still requires audit before HD work.

## Shared fragment pool and castle destruction

`research/probe_fragments.py` executes19 original emitter cases and575 flight frames: Catapult/Ballista death, all purchased Boulder tiers, enemy catapult stones, non-emitting weapon deaths and castle damage boundaries. `tests/native/fragments_wasm.mjs` compares native state/draw commands, invokes actual Wasm deaths with the same supplied random stream, verifies allocation failure/RNG consumption, preserves checkpoint replay, rejects malformed door state and migrates version11 saves. Original machine corpses can emit debris again on landing, matching the recovered repeated death call.

Native ice and debris share150 first-free slots. Ice gravity is1400; all other observed emitters use1000. Position truncates to integer pixels every tick. Every emitter keeps size/alpha constant, and Draw ignores the stored angle; the port consumes the native initialization RNG without adding rotation. Large Boulder attempts160 allocations, of which150 succeed when empty. Initialization consumes randomness only on success, while emission consumes it on every attempt. Recovered fragment sprites preload with the existing effects pack; their bytes are unchanged.

Castle damage goes through `hit_castle`: the door breaks strictly below zero HP, emits98 wooden fragments and the original explosion sound once, disappears from drawing, and preserves its broken state across checkpoints. Victory immunity does not break the door. Hits add1.5 shake and reset impact age even during victory immunity; shake decays by10% each60Hz tick. DrawCastle captures jitter before attacks and uses additive blending for the first0.1s. It consumes two random values on every intact frame. After breach, DrawAfter overlays the arch on enemies and assigns all creep slots speed100/range−1000. Native fixtures cover all five tiers,1,200 impact/draw frames and nine breached actor types. Exact-zero HP survives until the next damaging hit. `tests/native/castle_wasm.mjs` also covers malformed input, v12 migration and replay; `tests/scene.mjs` verifies production blend/layer order.

`research/audit_legacy_effect_pools.py` checks ARM literal references to `_Particles`, `_FlyText` and their artwork pointer. References are limited to clear/process/draw; no creation path was found. These legacy systems are not a reason to invent floating reward text or extra blood particles. This is a static reference audit, not proof against every possible computed address. Evidence is retained in `legacy-effect-pools.json` and `reward-particles-disassembly.txt`.


## World shake and dormant pools

`research/probe_trembling.py` executes the original DrawNormalGame transform prefix over450 frames and42 impact cases. The active port kinds account for41 cases; native dragobject kind3 has no corresponding live producer. The gate emits strength6 at native tick333. Boulder first impact is4+tier, Column every impact isabs(vy/400), first Fireball/Freezing Bolt ground contact is5, exploding barrel death is5, and upgraded Ballista ground impact is5. These assignments overwrite the previous amplitude; they do not add/max it. Cannon and ordinary projectile expiry do not gain invented shake.

At the start of an active frame, two random calls produce original float32 offsets and strength decreases byDT*10 without clamping. Once strength is nonpositive, world translation stops but stored offsets remain. Smoke/fragment draws subtract those retained offsets (including the original residual after the last shaken frame); six native draw fixtures and production-renderer assertions cover this. World mirroring precedes translation; HUD draws outside it. Version14 checkpoints preserve shake and reject invalid fields atomically; older saves default to zero.

The literal audit now includes `_Powerups` and `_LandObjects`: no creation path was found. Powerup processing has no drawing call; `DrawPerkPanel` is an immediate return. These findings remain bounded static evidence, not proof against all possible computed addresses. Do not add speculative perks or particles.


## Shared object order

`research/probe_global_order.py` executes SetObjectsToSort, the comparator, Resort/ForceResort and DrawAllObjects dispatch. Creeps use truncated(float32(y + type height −110)); dragobjects use truncated(y) plus250 while held. Native byte4 adds another250 but its purpose is unknown and no live writer was found, so no invented flight flag is added. All observed priority bytes are zero. The bounded list holds200 creeps and30 dragobjects.

The original timer starts at30, sorting immediately on the first frame and every13 frames afterward. Object creation, Column activation and Fireball/Rock pickup force a refresh. Pool clears and day/player resets preserve the timer/list. Rust captures the list before creep processing, so a later projectile allocation cannot retroactively change that frame’s order. The renderer interleaves both kinds and skips inactive/captured actors. Tests cover first-frame/periodic/forced ordering, crossing depth, reset continuity, dispatch filtering, replay, malformed lists and old-save migration. Muted browser fixtures verify rear/front barrel overlap.

Historical equal-key ordering remains unverified: the ARM executable imports system qsort. Apple’s public Libc594.1.4 source is retained as `research/apple-qsort-594.c` (https://raw.githubusercontent.com/apple-oss-distributions/Libc/Libc-594.1.4/stdlib/FreeBSD/qsort.c), but this is not proof of the exact iOS library used. Stable pool-order ties remain an explicit shortcut. Version16 restores the pre-physics actor poses described below. The later combined-world comparison covers artefact/gate phases; see Combined battlefield comparison below.


## Actor presentation timing

`research/probe_frame_phase.py` executes the original DrawNormalGame loop, its sort/dispatch, and actual creep/dragobject Draw/Process functions. It intercepts other phase calls and records their order. The540-frame fixture covers11 enemy and7 dragobject kinds. Both native display positions and live positions are compared independently; comparing only the final physics state would miss the prior one-frame presentation error. Normal InitGame sets Display byte0 to1, disabling debug crosses; the probe mirrors that initialization instead of treating uninitialized display output as gameplay.

`engine/src/frame.rs` captures the bounded actor buffer after wave spawning and sorting, before the dragon consumes a captive, missile hits, and actor/projectile physics. The browser calls `frame_ptr()` only for battlefield drawing; input, progression, rewards and save metadata read live `draw_ptr()`. The same frame is retained when rendering at30FPS, pausing or resuming. Two Rust regressions cover same-frame missile death/projectile expiry and the last fading-corpse frame. New-day start clears presentation history while retaining native global sort history.

Snapshot16 validates all frame floats, object/enemy identifiers, flags and gate index before replacing a live save. It fits the existing65,536-byte binary and90,000-character base64 limits. Older saves lack display history and use available live poses until the next simulation frame. A native trace also exposed the catapult stopping a tick early: walking now checks the castle boundary before advancing, then checks attack range after advancing, matching the original process sequence.

Remaining frame audit: the gate and automatic device effects are still consolidated in the port rather than split across all original artefact callbacks. Native creep Draw also reveals burn tint, wizard shield compositing/offset and breached-castle clipping that require full presentation comparison. The540 isolated-pool frames do not prove those whole-scene interactions.

## Integrated device timing

`research/probe_device_phase.py` executes native DrawNormalGame with both artefact passes, sorting, and actor callbacks live. Its810 frames cover the altar, Hell Gate and a jump platform. Earlier scene/sacrifice probes deliberately called creep processing first; their isolated timings do not establish world-loop order. The integrated gate first digests on frame35 and pays out on334 for the captured fixture, one frame later than the old harness. It draws the captive before changing its pose; the release frame draws both the clipped captive and ordinary actor. Device updates follow wave generation and precede sorting/actor drawing. Dragon consumption follows the ordinary actor drawing pass.

The platform advances20 animation frames/second, resets above8.8, and uses all eight original sprites. `tests/native/device_phase_wasm.mjs` compares60 native frames, trigger positions and last-frame save/restore. `tests/native/sacrifices_wasm.mjs` checks300 integrated altar frames,450 gate frames,181 independent skeleton-flight frames, current gate-frame replay and v16 migration/corrupt-pose rejection. Native random jitter is range-checked, not claimed bit-identical. Full actor animation-pose correspondence for captive knights remains a separate audit.

## Native enemy drawing

`research/probe_enemy_drawing.py` records505 native drawing cases. `enemyScene` reproduces original body signed scales and float32(angle+π) rotation, integer opacity for assassins/corpses/burning actors, RGB70 burning tint, and the wizard shield offset(−10,−12), RGB170, signed scales and screen blending. Draw flag1 denotes a living wizard with both ability-active and shield flags. Tint multiplication is cached per image and preserves alpha/original pixels.

`tests/enemy_drawing.mjs` restores Wasm states and calls the production renderer. Gate clipping is logical y≤253; a captured broken-castle flag replaces it with x≤390. These scissor bounds are fixed in the viewport even during world shake and follow orientation mirroring. Skeleton alpha applies after landing while its skeleton pose remains. Skeleton rotation now follows the181 native flight/landing/fade frames in `gate-corpse.json`: advanceDT×3 in flight, set−π/2 on landing, retain it while fading. Current snapshots preserve both live and captured angles. Captive pose history remains incomplete; the44-case `captive-pose.json` probe confirms delayed hook poses, dark-knight escape and gate landing/recovery behavior that still need implementation.

## Hook and held animation history

`tests/native/hook_wasm.mjs` compares3,960 executed native frames, including all11 kinds and two initial poses. Pickup and hook attachment retain the previous animation until drag age exceeds0.1 seconds. Release keeps that pose until flying physics begins. A dark knight starts escaping after0.6 seconds; the original consumes the first animation increment on that frame. The hook no longer holds that actor, but the dragon visit and cooldown continue without a sacrifice award.

`Unit.held_pose` records the independent short-lived animation history without changing gameplay-state identifiers. Draw flag bits5–8 encode pose+1 (zero means infer from state); bits0–4 keep their prior meaning. Frozen artwork takes precedence. Native hook target(120,60), shield changes, smoothing and initial boundary motion are preserved. Save validation accepts only valid pose IDs, rejects corruption atomically, and old snapshots remain readable. The3960-frame test covers replay at capture/escape/release/landing boundaries; a Rust test uses the real input API from pickup through escape. Gate landing/recovery poses remain unfinished.


## Hell Gate captive poses

`probe_captive_pose.py` now records77 cases/27,335 native frames, including StartDrag, disarmed barrel carriers and1s/4.5s freezes. Gate Draw sets creep speed0 and byte0x24=1 after its separate captive drawing call. That byte suppresses Attack and UpdateAbilities, but Process still performs fall, landing, stun, disarmed recovery, thaw, movement and animation transitions. Consequently some captured enemy kinds move before ejection. Kinds8/9 recover immediately on landing. Frozen captives can show landing/recovery art while their freeze timer remains positive; no speculative ice-shatter effects are added.

`tests/native/gate_wasm.mjs` compares55 cases ×333 pre-ejection frames plus their ejection boundaries. It covers live and displayed state, speed, timers, no captive damage/projectiles, the original skeleton sprite and position, and save/replay at six phase boundaries. A Rust regression covers33 real pickup/hover/release paths. Gate uses snapshot19's retained-pose array and existing clock; the binary format remains62,548bytes and draws remain6,087floats. Existing hook, skeleton flight/rotation/fade and integrated device-pass checks remain applicable.


## Ordinary enemy attack cycles

`probe_enemy_cycle.py` executes600 integrated native frames for every enemy kind with abilities delayed99s. Attack/Process are live; castle-hit and projectile-allocation side effects are intercepted. Native constructors initialize attack readiness to−1. Range checks that enter pose1 occur only on animation wrap; completed pose1 executes Attack, switches to pose0 and stops movement. A negative cooldown can immediately reenter pose1. Disarmed carriers switch to pose8 on the following frame and retire when x<−150 before movement. Native boundary pushback also applies during pose1.

`tests/native/enemy_cycle_wasm.mjs` checks6,600 live/displayed frames, exact attack events and replay at8 phase boundaries per kind. Existing castle/debris tests seed the terminal animation frame to hit through the actual attack path. Snapshot19's retained-pose field now covers the carrier's one-frame pose0 between throwing and retreat; no format/size change. Synthetic campaign and late-mode checks must be rerun after timing changes; they do not establish human balance or battery consumption.


### Integrated throw and collision timing

`probe_throw_cycle.py` / `throw-cycle.json` records35,640 native frames (11kinds ×9release scenarios ×360frames). `tests/native/throw_wasm.mjs` compares actual Wasm simulation and separately captured drawing, rewards, sound-event presence and replay. Recovery starts movement on the same frame as the native animation switch; landing starts stun countdown immediately; kinds8/9 skip stun. The two Rust input regressions exercise actual pickup/drag/release rather than only synthetic snapshot states.

`Game::fly` owns the sequential wall/ground physics so `reward` can run synchronously at each impact position, including two native death rewards in one frame. External projectile/splash callers still filter living targets before `Unit::hit`; airborne corpses can invoke Hit again during collision. Disarmed units retire below−150. Ordinary thrown units have no invented screen-edge cutoff: a surviving jumper thrown far left can walk back. Native fixture effects/projectile allocation are intercepted; the Rust regression separately checks the two machine smoke/debris emissions. This does not prove duplicate-sound mixing or historical libc random/tie ordering.


`tests/native/enemy_cycle_wasm.mjs` additionally checks five600-frame ability-enabled scenarios against native integrated DrawNormalGame (9,600 total cycle frames). The fixed native random draw is supplied via the existing snapshot seam before the ability call, accounting for the two door draws and optional screen-shake draws. Assertions cover state, HP/alpha, shield, all five sound-event masks, movement speed and ability flags/timers as well as live/displayed poses and checkpoint replay. This isolates ability behavior; it does not compare whole-scene random sequences.


### Multi-enemy explosion callbacks

`probe_chain_cycle.py` / `tests/native/chain_wasm.mjs` cover six integrated360-frame scenarios with live native Hit/Die/Explode/HitSplash and enemy allocation. Native rand0 and Wasm zero-seed RNG isolate the behavior from differing random streams. Particle emitters are captured; their independent movement tests remain separate. First-frame emissions verify smoke/debris origin, count and pool order. All live/displayed enemy slots, rewards, burning, sound-event presence and seven replay boundaries are compared.

Height bonuses use truncated y recorded before Process, initially the constructor's input ground y. `Game::reward` must preserve native callback order: an explosive enemy becomes inactive before splash damage, and recursive giant deaths can immediately reuse its slot. Read the current slot after the recursive callback before emitting remaining effects or deciding whether another child is needed. Applying splash burning before that callback loses it when the slot is reinitialized. Landing likewise rechecks whether its slot now contains a living child; native recovery can complete in that same frame. `Unit::stun_step` is shared by normal stun and landing to preserve negative-timer recovery.


### Frozen and projectile-triggered chains

The chain fixture now covers19 scenarios/6,840 native frames and executes original dragobject allocation as well as enemy allocation. It compares all30 projectile slots before/after processing and all live/displayed enemies. Preserve native synchronous callback order even when a pool slot changes type during a callback:

- Hit switches animation and shatters before Die, freeing a frozen enemy slot. Machine Die and explosive-enemy Die are sequential checks of the current slot; a nested giant can place a small explosive enemy there between the checks.
- Inactive and dead are distinct native flags. An inactive replacement with positive HP can finish landing/recovery and play its crash sound without becoming active again.
- Fireball bounce reactivation precedes knockback. A non-reactivated fireball can be replaced by a dropped barrel; the later splash reads its new coordinates and native shared field0x28 (barrel radius40 rather than fireball charge). This original interaction is intentionally retained. Barrel smoke follows synchronous splash/chain callbacks.
- Grounded frozen enemies stop moving, but their animation counters and attack cooldowns continue; thaw resumes the original timing.

Particle allocation and missile phases are still intercepted in this fixture. Constant rand0 isolates behavior and does not prove historical RNG. A captured negative-size ice-smoke emission becomes inactive on the first ordinary effect tick; compare emission against the post-tick state accordingly. No snapshot format/size change is needed for these corrections.


### Missile world cadence

Original `ProcessMissiles`0x1c310 performs three complete100-slot passes per world frame, each withDT/3. `Game::step` owns those passes; `Game::process_missiles` is the per-substep loop. Preserve the pass order across all slots, rather than completing three steps on one missile before moving to the next: mixed volleys can alter targets synchronously. The first substep of a newly fired missile is below its0.01s activation threshold, so piercing shots normally get two contact opportunities in that first frame.

`probe_missile_effects.py` now calls the native manager rather than the individual missile Process function. Its old direct-Process fixture verified a local function only and missed this integrated cadence. The chain fixture additionally verifies34 scenarios/12,240 frames, including all gun/ballista types against crowds/frozen targets,100 missile slot states, ground impacts, mixed volleys and an isolated two-hit flame shot. Native drawing/effect-pool tests remain separate; constant RNG and stable host qsort are still explicit limits.


## Integrated gun and ballista cycles — 16 October

`research/probe_gun_cycle.py` records12,600 original world frames across all six gun/ballista configurations. Tests cover recharge rejection, held aiming, repeated shots, missiles, sound masks, every device drawing command and the three ready-flash emissions. Snapshot20 preserves the presented animation and recharge state across save/replay. Native DrawBefore draws the ballista frame before updating it by±11/s; the previous1.6575 value came from an adjacent double literal. Upgraded ballistas draw25 aim dots, adding0.315 to the float32 curvature term per dot. Their artwork preloads with the equipped ballista pack.

Original artefact Draw arms its timer flag while elapsed<cooldown. On the first elapsed>cooldown frame it clears that flag, emits three bright smoke sprites at timer center, and still draws the timer. It disappears next frame. The shared implementation applies this to the five interactive device kinds; jump platforms do not have recharge indicators.

`research/framebuffer-notes.md` records the confirmed EAGL configuration: retained backingNO/RGB565, no game glClear calls. Exposed shake edges depend on unverified historical driver behavior; the port's flat fill remains an approximation. No overscan or framebuffer-retention behavior was invented from this evidence.

## Integrated Boulder, Column and Fireball cycles — 16 October

`research/probe_drag_cycle.py` / `tests/native/drag_cycle_wasm.mjs` compare21,000 native world frames across all ten purchased-object tiers. The fixtures begin0.25s before first recharge and exercise repeated input rejection, pickup/movement/release, recharge and original DrawNormalGame. Device poses, active projectile slots/positions/age/charge, per-phase artwork/transforms/alpha/blending, scissors and sound-event masks are compared. Enemy pools are empty; wave/scenery/effect allocation is intercepted and rand0/stable host qsort remain test limitations. The world loop advances `_g_timef` itself; advancing it again in the harness shifts the glow/animation phase.

Column DrawBefore changes signed field0x8c by±100×DT, truncates each frame and clamps to−20 when ready or20 while cooling. Draw its button at(x+15,y+recoil+10) under the fixed viewport scissor corresponding to native(300−y,0,320,480). Snapshot20 already stores this signed word; accept−20..20 only for Column and retain0..40 validation for other devices. A Rust regression verifies both clamps, negative-position save/restore and atomic rejection outside the range.

Ready Boulder/Fireball artwork belongs to DrawAfter, after the shared actor pass. `deviceScene` marks those commands with `afterActors`; the battlefield renders them after the dragon. Large Fireball and Freezing Bolt rise another3pixels only once their appearing size reaches0.4, not from the first recharge frame. `sceneImage` honors Column's `clipBottom` against the fixed viewport despite world shaking; the Hell Gate lid uses the same fixed scissor convention. Renderer regressions cover clipping, restored drawing state and ready-weapon layering.


## Combined battlefield comparison

`research/probe_world_scene.py` runs450 native world frames for each of eight scenarios (four themes, mirrored/unmirrored), capturing528 complete battlefield draw streams. `tests/native/world_scene.mjs` drives the actual Wasm and production Canvas renderer, comparing visible ordering, image identity, transformed corners, viewport scissors, crop, opacity, tint and blending. Active smoke slots are also compared, and16 checkpoint reloads reproduce identical drawing commands. The fixture exercises all three Boulder/Column tiers and all four spell tiers, all11 enemy kinds and eight devices. Independent cases reset the native sort timer; each Wasm case therefore starts in a fresh instance. Do not accidentally preserve one side's previous scenario history.

Native land Draw precedes Process, so battlefield `advanceTo(time, true)` stops one60Hz frame before the current world clock. Standalone land Process tests still use the default post-tick mode. Cloud transitions use premultiplied ONE/ONE_MINUS_SRC_ALPHA blending with equal RGB and alpha modulation; Canvas alpha already supplies the equivalent fade. Record raw native blend factors rather than treating equal numeric colors as necessary across APIs. The command test excludes fully transparent draws and black additive draws, including the native just-expired smoke slot; it does not emulate GPU rasterization or unspecified framebuffer edges.

An unheld live Fireball/Freezing Bolt emits additive smoke kind3/12 before its ground collision, at integer current coordinates and current charge size, alpha255 and fade−820. Boulder first impact emits three kind2 dusts; Column emits six on every impact. Both use float32 angle constants promoted to double before trigonometry, followed by integer coordinate truncation. Preserve this rounding: cos(float32 π/2) is slightly negative, which shifts the center Boulder dust one pixel left. All original effect assets were already in the preloaded effects pack. Snapshot20 and its validation limits remain unchanged.

The probe executes native castle damage, artefact/object/actor/missile/fragment/smoke phases. Wave generation, HUD, generic legacy particles/text and external audio are intercepted. Fixed rand0 and stable host qsort isolate interactions; passing these scenes does not prove historical random streams, equal-depth libc behavior, physical touchscreen input or phone battery use. `research/world_qa.mjs` and a disposable loopback server provide frozen browser checkpoints, excluded from the static output. The QA server's deliberately disabled service worker explains its offline-status warning.

## Ordered sound dispatch

`engine/src/sound.rs` preserves native `PlaySound(event, subtype)` calls as `event*30+subtype`, including duplicates and cross-category order. The browser reads `audio_events_ptr/len` after each simulation step and pointer operation, resolves the recovered sound table, and calls `clear_audio_events`. That drain also clears legacy masks, which remain available for older fixture comparisons. Undrained completed frames are discarded at the next step; input received between frames is retained. Audio is transient and adds no serialized fields or snapshot migration.

The browser starts decoding concurrently but dispatches playback in request order. A failed decode does not poison later effects. Background suspension changes the epoch, drains events, and detaches the pending chain so old downloads cannot delay resumed audio. Pause-menu clicks wake only the effect context synchronously on the gesture; a late resume after backgrounding re-suspends it. Music keeps its existing independent pause/playlist behavior.

Full ordered arrays now match12,240 combined death-chain frames,21,000 purchased-object frames,12,600 gun frames and the altar/gate fixtures. Enemy-cycle and throw comparisons check actor ordering only because their native probes intentionally intercept projectile processing. Native evidence corrected ice-shatter-before-landing order and the dropped barrel's final `gun_gun_impact.wav`. `tests/sound_dispatch.mjs` tests real production dispatch with reversed decode completion, duplicates, failures, cancellation and Wasm input draining; `tests/menu_lifecycle.mjs` covers the suspended Resume click.

`research/sound_browser_qa.py` is a disposable loopback-only server: it traces production requests and real AudioBufferSource starts, routing effects through gain0 and muting the music element. It does not ship or register a service worker. `artifacts/sound-browser-trace.json` records matching requests/starts, positive decoded durations, the Resume click and duplicate impacts. This verifies browser dispatch, not audible historical mixing. The port still permits overlapping sources; original iPhone OS interruption/rejection behavior is not established. touchHLE0.3.0 uses one OpenAL source per loaded sound ID; its behavior alone cannot prove historical hardware behavior.

## Random-call scheduling

`research/probe_random_calls.py` executes2,160 native integrated world frames
(empty pool plus all11 enemy kinds) and88 initializers (four supplied streams,
11kinds, speed ranges0/12). The native empty world calls rand only twice for
the door at0x30748/0x30794. The previous port unnecessarily drew once for each
of200 enemy slots every frame. Abilities now request a value lazily, only for
horse acceleration at0x273f0 and frog launch at0x274b0. The closure borrows the
existing generator state; no new save field or production injection API.

Native creep::Init makes ability draws before randomized speed. Wizards draw
parity first and a separate delay only on the odd branch; jumpers/frogs draw
a delay then a separate parity override. Ordinary kinds use no ability draw.
These decisions previously shared one draw and speed consumed its value too
early. `tests/native/random_calls_wasm.mjs` now compares the actual Wasm seed
advancement, ability delay and speed against native fixtures. Both parity
branches and speed-range presence are exercised. It uses the existing
snapshot seam, without changing the original probe's expectations to fit
production results.

The isolated missile-effect probe formerly inserted200 artificial draws to
align with the port. Those draws are removed based on the new independent
world evidence, and the native720-frame fixture was regenerated. Fragment
tests now rewind only the two preceding door calls when supplying their
emitter stream. Ability-only fixtures still supply their random value at
the third call (two door draws, then the actual ability).

The xorshift generator itself is unchanged. Apple Libc594.1.4's published
`stdlib/FreeBSD/rand.c`, saved as `research/apple-rand-594.c`, contains
Park–Miller and a conditional weak-seeding LCG branch. This source alone does
not establish which compiled iPhone OS library the game used. Exact libc
generator selection, the shared campaign/land/world stream, and equal-key
qsort behavior remain separate fidelity work. Save20 remains readable from
versions2–19; future randomized outcomes change because the erroneous draws
have been removed.

## Integrated wave scheduling

`research/probe_wave_cycle.py` executes ProcessWave0x19104 and
AddOneMonster0x18f8c inside the native DrawNormalGame loop. Eight cases cover
2,510frames: mixed enemies, triples, forced intervals across a day reset,
empty-field probability and crowds of19/20/dead/second-half-pool actors.
`tests/native/waves_wasm.mjs` compares active slots, movement, HP, rendered death
frame/alpha, wave timers/prefix/pressure, RNG advancement and checkpoint replay.
Inactive corpse stun/attack clocks have different internal representations;
they are excluded, while visible pose/alpha and active lifetime are checked.

The throttle counts down even while initial delay or Victory gates block it;
it resets to10 only on an eligible wave check. Nonpositive counts are stored
as0, which is behaviorally equivalent. InitNextLevel preserves this global
throttle and the forced countdown. The count limit includes all active actors
in the first100 of200 slots, including corpses; triple spawning can therefore
take19 active actors to22. The probability draw occurs even for an empty,
full or forced field. Successful checks consume an unused tier draw followed
by lane, kind and giant draws, in that order; triples still draw a lane.
DrawCastle's two random calls follow the wave phase, before actor processing.

The existing xorshift state is retained, but returned random values are masked
to the original rand ABI's nonnegative31-bit range for every caller. Native
fixtures receive the same supplied legal stream; historical libc selection
and unified campaign/landscape/world randomness are not established by this
comparison. No new production RNG-injection API or dependency was added.

Snapshot21 appends one countdown word at62848 (62,852bytes total), accepts
versions2–20 and rejects values above10 atomically. Older snapshots reconstruct
their former tick-based countdown. Existing fields retain their offsets.
The complete build passes63 Rust tests,49 Node/Wasm suites and10 Python tests,
including all579 full-duration synthetic campaign battles and Endless stress.

## Loading-screen random call audit

`research/menu-random-notes.md` corrects a bypass in the shared-session probe:
native `ClearLoadUpdateFuction` consumes `rand()%12` before each day's setup.
`createRun` now consumes this draw before initial procedural/background setup;
`prepareDay` consumes it on a cloned run when advancing from the shop. Asset
warming and failed-load retries leave the saved run unchanged. The five native
two-day sessions still compare 4,500 world frames, now including that call and
the actual background-loader argument. Snapshot21 is unchanged.

`research/historical-libc-notes.md` records Apple's iPhone/ARM build path and
the missing shipped-library version evidence. The earlier saved qsort file
is unpatched upstream input; Apple's final qsort source has additional
behavior. Stable ties and xorshift remain declared approximations. Credits,
map and menu randomness are not coupled to restored combat state.

## Shared day/scenery/combat random state

`research/probe_session_random.py` runs original normalGame::InitMode0x20e1c,
450world frames, then InitMode and450more frames. Five sessions cover First
Encounter, Random Skirmish, Full Power, Endless and Madness. External asset
loaders/audio/UI setup are intercepted; early next-day entry is a harness
operation, so this does not claim native victory/menu timing. The artwork
binding helper temporarily populated the enemy table; that residue is cleared
before new-game setup. No native expectations are adapted to port results.

SetupNewLevel initializes the landscape at0x20ac0; InitMode repeats it at
0x20f30. Each initialization draws60 coordinates, consuming120 values per
day. This follows procedural level generation and precedes gameplay. The
port now carries one xorshift state through campaign generation, both star
initializations and Wasm combat. `random_state()` exposes the engine state
for save/result handoff; JS converts its signed Wasm return to unsigned32bit.
There is no per-day crypto reseed. New-run entropy and historical libc choice
are still a platform approximation; supplied-stream correspondence alone
does not settle them or random consumption during legacy menu animation.

Run JSON keeps optional `landscapeSeed` (validated unsigned32bit) for restoring
the displayed stars without advancing the combat stream. Missing fields use
the old numeric-seed LCG scenery, preserving existing saves until the next
day. Older zero-seed runs normalize to1 when entering the shared generator,
matching core.start. No binary snapshot change:21 remains62,852bytes.

`tests/native/session_random.mjs` executes the production newDay/save/resumeSaved
functions with actual Wasm. It compares all4,500 native frames, initial stars,
procedural tables/durations, current RNG, active actors/positions/HP,10
save/resume checkpoints and legacy-star migration. Invalid star seeds reject.
The older156-case procedural fixture deliberately supplies its recorded LCG
stream, so it continues testing formulas independently of generator choice.


### Complete natural battles and day introductions

`research/probe_full_days.py` runs original normalGame::Draw and its real mode9
transition for two Campaign days, two Endless days and an unattended Madness
defeat. `tests/native/full_days_wasm.mjs` replays all13,479 frames and original pointer
callbacks against actual Wasm. It checks every live slot’s position, animation,
sprite, speed and HP, flying/held velocity, enemy projectiles, RNG, balances,
ending fade and consecutive-day setup. This goes beyond shortened/no-input
segments. Still a synthetic defender with a supplied RNG and host sort; it does
not establish human balance, historical libc or menu dwell effects.

Off-centre drag velocities use the previous contact, while pickup retains an
actor-centred target. The pointer is transient because snapshot loading releases
held input. A newly disarmed held carrier takes one native retreat step before
its held pose settles. Ballista allocation chooses its impact point before
Attack draws its launch velocity. A wizard may enter attack immediately when
its shield animation wraps. Wave generation stops on victory; defeat continues
spawning during its transition. All are original-code behaviors, not balance
changes. Snapshot21 and the public Wasm ABI remain unchanged.

`research/probe_start_day.py` copies real InitMode state into original DrawFlag.
The production renderer is checked against1,960 native banner/fade frames:
Campaign shows `DAY n of total`; Endless/Madness show `DAY n`, followed by
`GET READY!`. The entrance fade starts at255 and falls170 units/second. Older
isolated fixture tests explicitly start after that fade where the original
probe bypassed normalGame::Draw. The world and inputs remain active underneath.


The same runner now also loads `research/campaign-sessions.json`, captured by
`probe_campaign_sessions.py` using the shared full-day harness. Hashes, schemas
and coverage of castles1–11 must match before replay. The combined25 natural
battles contain80,775 frames and1,204 pickup gestures. Added cases preserve
normal HP/difficulty, ending early on natural defeat where the synthetic
defender loses. They exposed dying-actor movement after breach, an extra
release on the result frame and platform launch-pose preservation. See
`research/full-days-notes.md` for native addresses and first failing frames.
Snapshot21/62,852bytes and save compatibility are unchanged.


The shared full-day runner additionally loads `research/late-sessions.json`:
all 12 final campaign days and Endless/Madness days 100 and 10,000. Campaign
warmup runs every earlier initializer because partial enemy-table writes retain
prior state. It skips preceding gameplay and keeps starting equipment. The
16 added battles contain 56,390 frames and 1,906 gestures (eight victories,
eight defeats); combined coverage is 41 battles / 137,165 frames / 3,110 gestures.
Tests assert the complete target list, fixture schemas/hash, setup tables and
engine configurations before comparing frame state.

These cases corrected retained-pose abilities and held attacks, pre-disarm
knockback artwork, five Explosive Round days whose platform is explicitly
disabled after initialization, retreat culling before walk-speed movement,
ground/castle projectile death ordering with slot reuse, and death-pose resets
on an already-dead wall contact. See `research/full-days-notes.md` for exact
addresses and first failing frames. No save format or public ABI change.

## Battle audio readiness and equipment continuity

The16October audio gate downloads all three compressed gameplay tracks and
decodes all49 effects before `newDay`/`resumeSaved` can enter battle. Menu
warming uses the same deduplicated loaders. Failure offers Retry; `mute=1`
skips audio prerequisites. `Soundtrack.ready` also waits for successful
playback of the active downloaded track. The media element is still unlocked
synchronously by the original menu gesture. Interruptions fade live effect
outputs for5ms, stop them, then suspend the context; they never resume old
tails. Read `research/sound-dispatch-notes.md` for tests, source hashes and
the remaining audible-phone/historical-mixer limits.

The Wasm `start(seed,hp,gold,sacrifices,score,next_day)` ABI now has an optional
sixth0/1 argument. `startBattle` passes1 after day1 so native equipment aiming,
recoil and drag state survive consecutive days. Fresh starts pass0 and reset.
Snapshot21/62,852bytes is unchanged. Gate hover shares the native pressed
field: restore releases abandoned touches but preserves autonomous captive
opening. The supplied-stream comparison now covers47 full battles/158,105
frames, including six equipment-rich consecutive battles. Inventory was seeded
for those six; this is not an earned-purchase or human-balance claim. Exact
native addresses and harness corrections are in `research/full-days-notes.md`.
The regenerated extractor validates final active-device coordinates/type/tier
while retaining repeated initializer ordering for the existing equipment map.


### Full final-day stability check and per-mode persistence

After building, run `node tests/endless_wasm.mjs --full-day` for the explicit
long-session check (about40 seconds on the development Mac). Normal checks keep
the five-minute soaks. This option advances both hard/day10000 battles for their
full generated duration, replenishing test-only HP, checking deterministic
snapshots and scenery replay, fixed Wasm memory and final completion.

`tests/save_slots.mjs` covers the production per-mode persistence and original
continue/Done behavior. New saves use `knights-onrush-save-v2-<mode>`; the old
shared key is a read-only fallback. `available:false` consumes only the offer,
leaving YES/Retry payload intact. JSON null in the new slot retires that run and
prevents fallback resurrection. Other mode slots remain unchanged. Browser
lifecycle autosave/paused restore and preservation through Options remain
intentional platform adaptations. Native evidence is in
`research/save-lifecycle-notes.md`.


### Battlefield pointer contract and install icons

`release_at(x,y)` adds native Up coordinates without synthesizing drag velocity.
`release()` remains the last-contact release for cancellation and legacy tests.
Browser gestures capture every primary Down, including empty space, and route
Pause through the same surface. Pointer cancellation and keyboard activation
remain explicit browser adaptations. Autosave releases only an active gesture,
preventing a second Column activation at a stale Down point after Pause.
Snapshot21 and the draw layout are unchanged. `tests/battle_input.mjs` runs
actual browser handlers with real Wasm against `research/battle-input.json`.

`web/icon-192.png`, `icon-512.png` and `apple-touch-icon.png` are checked-in PNG
conversions/resizes of the original512px `research/itunes-artwork.jpg`. Conversion
used macOS sips; hashes/provenance are in `research/icon-conversion.json`. They
require no new build dependency and enter the offline allowlist. This is original
artwork, not the deferred HD work. Installation tests require a clean HTTPS
origin: Pinggy free screening can intercept browser manifest/icon requests even
when ordinary gameplay and cached offline play work.

## Installed display and pause-banner verification

The manifest requests fullscreen. CSS handles both installed fullscreen and its
standalone fallback, retaining the3:2 stage and hiding the browser footer. A
desktop fullscreen run verified Options→Done and hidden controls; Android system
bars still need a check after the installed manifest updates. This is separate
from the already confirmed Android installation.

`research/pause-gestures.json` executes original normalGame Draw, InitPause and
Resume for day-start, Victory and Defeat. All three skip the banner routine
while paused and retain its position/countdown. `tests/scene.mjs` compares15
production renderer states, including return at the next animation frame.
The existing game-only banner condition stays unchanged. Native direct
callbacks also preserve held actors; keyboard/background gesture cancellation
remains an explicit browser adaptation, as described in
`research/pause-gestures-notes.md`.

`tests/campaign_wasm.mjs` carries the real setup/scenery/combat random state
through579 full-duration battles instead of restarting the combat seed each day.
It uses ordinary purchased health,30 earned door upgrades and72 mid-battle
restores into fresh Wasm instances. The continuous run completed2,869,669frames
and132,107kills. Synthetic high-frequency defense is not human balance evidence.

Android media controls can issue native player RequestPlay without calling our
Soundtrack.play method. The existing playing listener enforces `wanted`: an
external restart after background pause or explicit music mute is paused again.
Normal wanted playback remains unaffected. `tests/audio.mjs` includes the
regression; `artifacts/media-controls-browser.json` records the same sequence
with a real muted audio element. No supported Media Session API hides the card
while HTMLAudio continues; decoded WebAudio would add about98–107MiB for both
selected tracks. See [primary-source media research](../research/media-controls-notes.md).

## Update preservation

`save()` and `clearRunSave()` return storage failure to the manual update
handler. Failed persistence leaves the live game paused and does not activate
the waiting worker or reload. `tests/update_save.mjs` covers battle, defeat,
retry, menu-without-save and a single reload on controller change. Existing
save callers keep their behavior. The storage failure notice remains visible
in the browser where the manual Update control is available.

Fullscreen/installed layouts hide the browser footer, including Update game.
A fully downloaded update also activates normally when all old windows close;
no extra control or forced reload was added to original menus. A controlled
localhost run failed one sound-file download, confirmed old-version offline
resume, retried using the partial cache, closed the last old client and verified
new-version offline resume. See `artifacts/update-lifecycle-browser.json` and
`research/update-lifecycle/server.py`. Keep game updates separate from Android
WebAPK manifest-shell updates, whose timing is controlled by Chrome.
