# Original bugs, quirks and deliberate differences

Last reviewed: 17 October 2026. This register collects the surprising behavior
identified so far. It is not a claim that every original bug has been found, or
that the remake has passed complete 1:1 acceptance.

**Default: preserve the original rules.** Change a confirmed defect separately,
with a named opt-in and a regression that still checks the original path. Do not
silently bundle balance changes into a general “fix all bugs” switch. Existing
user-requested browser adaptations are listed below; they are not reverted by
an authenticity flag. HD remains deferred and is unrelated to these choices.

Evidence comes from the supplied original ARM executable, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Native probes execute original routines with intercepted platform services and,
where necessary, supplied state/randomness. They establish the stated behavior,
not the developers' intent, historical GPU/audio output or every possible touch
sequence. Older research notes may describe discrepancies that have since been
fixed; the **remake policy** column records the current decision.

## Available switches

| URL parameter | Effect | Default |
| --- | --- | --- |
| `fixBallistaGate=1` | At Hell Gate ejection, put the arrow machine's remains at the gate mouth's horizontal center. Applies only to ballista enemy kind 5, in either world orientation. | Off: preserve the displaced original ejection. |
| `legacyShare=1` | Tell a friend opens an unsent email draft with the original subject/body and historical App Store link. Uses valid `mailto` syntax. | Modern system sharing, with current-site email fallback. |

Use `?fixBallistaGate=1`, or append `&fixBallistaGate=1` to an existing query.
Development example: `http://127.0.0.1:8875/?mute=1&fixBallistaGate=1`.
Neither flag writes a preference. Ordinary Home Screen launches use the manifest
URL, without these flags; a flagged browser visit does not permanently change
the installed app. Shared links strip query parameters.

The gate flag survives day changes and loading a save **within that page**.
Snapshots remain version 22. An existing captive is corrected when it next
ejects; already airborne remains are not moved on reload. Removing the flag
restores original rules for future ejections, not past events. Same-flag replays
remain deterministic. The correction changes the subsequent horizontal flight
path, but does not change digestion, reward, ejection velocity, sound requests,
artwork, clipping or other enemy kinds. No general `originalBugs` switch exists.

## Confirmed original defects

| ID | Observable behavior and cause | Remake policy | Evidence |
| --- | --- | --- | --- |
| B01 — Ballista emerges beside Hell Gate | A captive arrow machine can recover/move while hidden. The native example moves from logical x233 to about x129.57 before ejection; with the castle on the left, the visible remains appear near the dragon hook on the right. Original mirroring is correct; the captive's x has drifted. | Preserve by default; `fixBallistaGate=1` recenters x only at ejection. | [Mirrored native replay](../research/mirrored-gate-notes.md), recorded matrices (local `artifacts/mirrored-gate-original.json`), [gate regression](../tests/gate_wasm.mjs). |
| B02 — Freezing Bolt reaches effectively the whole battlefield | The code compares truncated **distance** with 14400, rather than squared distance with 14400. Native distance14399 freezes and14400 does not. Eligible enemies across a480px-wide scene therefore freeze; held/flying/protected enemies are still excluded. | Preserved. No smaller-radius fix enabled: it would change weapon balance. | [Weapon rules](../research/weapon-rules.md#fireball-and-freezing-bolt--dragobject-type2), [native weapon probe](../research/probe_weapons.py). |
| B03 — Repeat death rewards and machine debris | An actor killed in midair can continue flying, then run death handling again at a wall/ground impact. Gold/score/kills can be credited again, and a machine can emit debris again. | Preserved; no reward/economy fix enabled. | [Corpse probe](../research/probe_corpses.py), [corpse regression](../tests/native/corpses_wasm.mjs), [fragment regression](../tests/fragments_wasm.mjs). |
| B04 — Music stays silent after unmute | Stop request10 leaves the current track ID unchanged. Requesting that same group again returns before `play`, sometimes with no player after a muted group change. | Already corrected: unmute must work. There is no switch to reintroduce silent music. | [Soundtrack transitions](../research/music-transition-notes.md#mute-edge-case-in-the-executable), [audio tests](../tests/audio.mjs). |
| B05 — Broken legacy mail fallback | The fallback joins `mailto:&subject=Knights Onrush` and body text without `?` or `&body=`. The body also contains historical ID297805402, different from the supplied game listing312494232. The ID discrepancy is established; its intended destination is not. | Modern sharing by default. `legacyShare=1` preserves text/link, not malformed URI construction. | [Original mail callbacks](../research/main-menu-notes.md#tell-a-friend), [sharing regression](../tests/sharing.mjs). |

## Input and menu quirks

These behaviors are verified. Calling them quirks does not establish that each
was unintended by the original developers.

| ID | Original behavior | Remake policy | Evidence |
| --- | --- | --- | --- |
| I01 — Release-point activation | An ordinary button can activate where the finger lifts, even after starting elsewhere. A long shop swipe ending over Exit leaves the shop. Bare Up can also activate a button without a preceding Down. | Ordinary within-gesture retargeting is preserved. **Shop Exit requires Down and Up on Exit**, as requested. Bare releases and stale browser compatibility clicks cannot activate new controls. No legacy override for these safeguards. | [Main menu](../research/main-menu-notes.md), [compound gestures](../research/compound-menu-input-notes.md#compound-release-routing), [input tests](../tests/shop_input.mjs). |
| I02 — Mirrored Pause has two release regions | In mirrored battles, both physical lower-left and lower-right release regions activate Pause, although its artwork stays lower-right. Only the left region receives original Down highlight. | Preserved; do not move the visible Pause icon. | [Native mirrored input](../research/battle-input-notes.md#pause-geometry-mirroring-and-the-native-quirk), [battle input tests](../tests/battle_input.mjs). |
| I03 — Backtracking shop swipe counts as a tap | Selection uses signed net horizontal displacement, accepting −19…19. A200px out-and-back swipe can open purchase confirmation. A fresh eligible selection opens a dialog before any deduction. | Preserved; it cannot confirm its newly created dialog with the same touch. | [Signed displacement](../research/compound-menu-input-notes.md#shop-selection-uses-signed-displacement), [compound tests](../tests/compound_input.mjs). |
| I04 — Shop scrolling under a modal and asymmetric edge clamp | Shop Down/Move updates scrolling before dialog dispatch; consumed Up can leave its drag bit set. The rightmost/lower scroll bound clamps after item layout, unlike the opposite bound, allowing a one-frame overshoot. | Recovered layout/input retained. Browser stops scheduling idle frames and requires fresh input after control replacement/backgrounding. | [Dialog ordering](../research/compound-menu-input-notes.md#dialog-order-and-original-quirks), [shop layout/clamp](../research/compound-menu-input-notes.md#shop-selection-uses-signed-displacement). |
| I05 — Overlapping buttons and Options phases | Cheat/Reset and Play/Info hit rectangles overlap. Both can highlight, but pool order selects one callback. Options toggles mutate on Down; volume changes on Move and ignores out-of-range moves rather than clamping to the nearest endpoint. | Preserved, including original priority and control phases. | [Overlap and Options cases](../research/compound-menu-input-notes.md), [compound tests](../tests/compound_input.mjs). |

## Combat and presentation quirks

| ID | Original behavior | Remake policy | Evidence |
| --- | --- | --- | --- |
| C01 — Exactly zero HP survives | Both enemies and the castle die/break only below zero. The health bar retains its24px cap at zero. | Preserved; changing to `<=0` changes combat outcomes. | [Enemy damage](../research/enemy-rules.md#flight-impact-and-survival), [castle tests](../tests/castle_wasm.mjs), [HUD tests](../tests/hud.mjs). |
| C02 — Blackened enemies can survive an explosion | Entry platforms grant one-hit immunity. A blast consumes protection without HP loss but still applies scorch tint. A seeded assassin remains black and resumes walking; a barrel can die later on landing. | Preserved mechanic, not evidence of a broken death animation. | Native iPad-report replay (local `artifacts/ipad-original-findings.json`), [probe](../research/probe_ipad_findings.py). |
| C03 — Instant thaw and repeating missile contacts | Timer-based thaw removes ice immediately; landing/death have fragment effects. Piercing Flame/Ballista apply damage each overlapping simulation step, without a per-target cooldown; Freezer refreshes its freeze timer on contact. | Preserved; do not invent a thaw animation or cooldown. | [Weapon rules](../research/weapon-rules.md), [ice tests](../tests/ice_fragments_wasm.mjs), [missile tests](../tests/weapons_wasm.mjs). |
| C04 — Throwing has unusual arithmetic | The release adjustment really contains `y−targetY+30`, while dragging follows `targetY+30`. Velocity is clamped before gravity, allowing the final downward value to exceed900. Ordinary initializer masses are overwritten to0.9; Titans double that. | Preserved because these details determine the original feel. | [Pickup/flight and initialization](../research/enemy-rules.md). |
| C05 — Fireball and weapon boundaries | Fireball does not collide with enemies in flight: it explodes on ground/expiry. Its bounce reactivation does not reset age, so expiry can cause another blast on the next tick. Column permits2/3/4 impacts; release/readiness boundaries are asymmetric. | Preserved; none is evidence of a missing collision effect. | [Weapon rules](../research/weapon-rules.md), [drag follow-up](../research/probe_drag_followup.py). |

| ID | Original behavior | Remake policy | Evidence |
| --- | --- | --- | --- |
| P01 — Dragon Altar shop image has no hook | Shop draws `altar_dragon.png`, without a separate `altar_hook.png` draw. | Preserved; the battlefield hook still exists. | Native shop draw (local `artifacts/ipad-original-findings.json`), [probe](../research/probe_ipad_findings.py). |
| P02 — Banners disappear while paused | Day-start, Victory and Defeat banners skip drawing/update while paused, then continue from their saved phase. | Preserved. | [Pause/banner replay](../research/pause-gestures-notes.md#banners-disappear-during-pause-in-the-original). |
| P03 — Blue full health, regardless of door material | Color follows remaining HP fraction: blue at≥75%, yellow at40–75%, red below40%. It does not start yellow merely because the door is wooden. | Preserved. | [Native HUD comparison](../tests/hud.mjs), [HUD implementation](../web/hud.mts). |
| P04 — Fixed fragment pools and residual shake | Ice/debris share150 slots; a large Boulder attempts160 allocations, so some cannot appear. Debris drawing ignores its stored angle. Smoke/fragments subtract retained shake offsets even after active shaking ends. | Preserved; missing excess debris or unrotated fragments alone is not a port defect. | [Fragments](../tests/fragments_wasm.mjs), [world shake](../research/probe_trembling.py), [development evidence](DEVELOPMENT.md#shared-fragment-pool-and-castle-destruction). |
| P05 — Only two of the four packaged songs are selected | This build selects track02 for menus and03 for battle, with100 repeats/101 total plays each. Same group continues; changing groups restarts. Foreground Pause leaves music playing; Options changes group. | Preserved selection/repeats. Background suspension and reliable unmute are browser exceptions. | [All native soundtrack call sites](../research/music-transition-notes.md). |

## Economy, progression and save quirks

| ID | Original behavior | Remake policy | Evidence |
| --- | --- | --- | --- |
| E01 — Paid downgrades and spell replacement | Affordable, non-current items require confirmation. Buying a lower tier or switching Fireball↔Freezing Bolt pays full price and replaces the same inventory slot, with no refund. Prior tiers are not prerequisites. | Preserved; confirmation/input defects in earlier remake builds were fixed separately. | [Shop economy](../research/campaign-rules.md#shop-and-castle), [92 native purchase cases](../research/probe_ui_fidelity.py), [purchase tests](../tests/shop_input.mjs). |
| E02 — Terminal score converts in oversized chunks | At a completed/failed run, positive gold converts in2000 chunks and sacrifices in2-point chunks, which can make native counters negative. Even a small positive remainder earns the whole chunk; this is not a daily reward. | Original score conversion/animation retained; browser metadata normalizes exhausted balances to0 and saves the full result immediately. | [Campaign results](../research/campaign-rules.md#shop-and-castle), [menu animation tests](../tests/menu-motion.mjs). |
| E03 — Victory is not an immediate stop | Combat, existing offscreen enemies, sacrifices and presentation continue through the≈8.17s transition. **New wave generation stops on Victory** in the measured original; Defeat continues generating waves during its transition. | Preserved. Earlier recollection of new victory waves does not override executed original evidence. | [Full-day original execution](../research/full-days-notes.md), [integrated comparison](../tests/native/full_days_wasm.mjs), [development notes](DEVELOPMENT.md). |
| E04 — Stateful day setup and finite “Endless” | Initializers partially overwrite enemy tables, retaining older entries; repeated device slots replace one another. Secret Spells forces Steel Door every day; Madness enforces a minimum Steel tier. Endless/Madness have an original10000-day limit. Triple waves can exceed the usual20-active threshold because it is checked before the formation. | Preserved; do not clear retained tails, add duplicate devices or invent infinite progression. | [Campaign setup/progression](../research/campaign-rules.md), [endless tests](../tests/endless_wasm.mjs). |
| E05 — Save offers are consumed; Options can lose a native run | Native save flags are per mode and consumed by the offer/load flow. SaveGame is called on app termination; the original eligibility predicate does not retain a live run while in Options. Done commits campaign records/unlocks. Finished defeats are not resumable battles. | Offer/navigation semantics retained; browser keeps a retryable payload, checkpoints on lifecycle/purchases, and protects the run during Options. | [Native save lifecycle](../research/save-lifecycle-notes.md), [save-prompt lifecycle](../research/save-prompt-lifecycle-notes.md). |

## Browser adaptations already accepted

| Area | Current difference from the old app | Reason |
| --- | --- | --- |
| Lifecycle, audio and saves | Backgrounding fully pauses/saves, silences audio, releases transient pointer capture and requires Resume. Saves are validated/versioned; failed loading keeps progress. Working unmute is retained. | Modern mobile lifecycle, offline use and explicit user requests. |
| Touch and accessibility | Ignore canceled/stale releases and synthetic compatibility clicks; shop Exit requires a matching press. Provide keyboard/screen-reader controls. Apple touch fullscreen uses page expansion. | Prevent accidental purchases/navigation and Safari swipe dismissal without altering ordinary artwork. |
| Hosting/loading/install | Static PWA, packed original images, preloading, offline worker/cache, original-art app icons, loading/retry/update controls and external fullscreen control. | Browser delivery; these are not claims about the original loading UI. |
| Sharing and retired services | Modern share sheet; optional original email text via valid URI. Local scores work; Global explains the retired OpenFeint service. Visit retains its historical URL, now a parked domain. | User-requested sharing and unavailable original infrastructure. |
| Development and optional corrections | `dev=1`, `mute=1`, `perf=1`, `perf=1&perfScale=1`, and the specific gate fix. Diagnostic sampling stays local. | Testing/performance investigation; no default HD, balance rewrite or blanket bug mode. |

## Open issues: do not call these original bugs

| Report/limit | Current evidence and next check |
| --- | --- |
| iPad busy-scene slowdown | User reports41–43Draws/s with1–2ms CPU readings. Equipped desktop replays sustain60. GPU/compositor/scheduling cause remains unproven;480×320 comparison and browser-callback measurement pending. See [rendering investigation](RENDERING.md). |
| First Campaign Continue occasionally returns to menu | User reported a successful second attempt. Local warm/cold-audio checks did not reproduce the first failure; no confirmed cause/fix. |
| Android periodic click/media card | User's later ordinary Chrome check had neither click nor player card. Root cause remains unconfirmed; latest installed-app follow-up is not established. |
| Physical Apple and sustained-play acceptance | iPad general play works. Map/viewport/Help fixes require device retest; Apple installed-offline/audio, iPhone, thermal/battery and human full-campaign acceptance remain open. |
| Historical platform fidelity | Exact historical libc RNG/session seeding, equal-depth sort behavior, GPU edges and sound mixing remain bounded uncertainties. They are not proven original defects. See [acceptance](ACCEPTANCE.md). |

Earlier remake defects—missing audio/effects, reversed walking artwork,
gate layering, wrong corpse artwork, overlapping shop numbers, stale hit regions,
instant purchases, inert buttons, and map animation stopping during a drag—belong
in [progress](PROGRESS.md), not in an original-bug compatibility switch.
