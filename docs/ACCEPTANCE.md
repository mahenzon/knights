# Restoration acceptance — 17 October 2026

**In progress. Do not label this a finished1:1 restoration or begin HD yet.**
This records the established behavior and remaining acceptance checks. Test
counts and build sizes below describe the recorded 17 October build, not a
validation of the current checkout.

After the 22 October repository cleanup, raw captures and `artifacts/` reports
and screenshots are local, ignored evidence. Historical commit IDs refer to
the history before it was rewritten. Fresh checkouts retain focused regressions;
exhaustive comparisons require the [optional native replay checks](DEVELOPMENT.md#optional-native-replay-checks).

[Original bugs and quirks](ORIGINAL-QUIRKS.md) records confirmed native behavior,
deliberate browser adaptations and unresolved remake reports. The optional
`fixBallistaGate=1` correction is outside the default original-behavior path.

**iPadOS16.6.1:** user reports general play works, with movable/dismissible viewport and delayed Help. Apple fullscreen routing/page guards and startup Help decoding are updated and desktop-tested; physical retest pending. No installed-offline or iPhone pass inferred.

**Open iPad performance report:** level11/day1 barrels visibly slow down on an M1 iPad, iPadOS16.6.1. Two muted desktop campaign replays stay near60draws/s; no local reproduction or fix is claimed. `perf=1` provides device CPU/frame measurements; result pending. See [rendering measurements](RENDERING.md).

**Latest Android report:** three minutes with `mute=1` stayed silent. Ordinary Chrome after removing the flag has no reported periodic click and no notification/lock-screen player. Latest installed-app behavior is not rechecked; original click cause remains unconfirmed. A first Campaign Continue returned to the main menu, then succeeded on retry; warm-cache and controlled cold-audio desktop replays do not reproduce it. Shop EXIT now requires Down and Up on EXIT, an explicit user-requested adaptation from native release-point routing.

| Requirement | Verified evidence | Still to establish |
| --- | --- | --- |
| Completable campaign | All12 castles/193 days ×3 difficulties complete at full duration in Wasm:579 battles/2,869,669frames with continuous setup/combat RNG, ordinary health,30 earned door purchases and72 fresh-engine save resumes. Native day setup, progression, purchases and save migration compared. | Physical touch playthrough and human difficulty/balance. Synthetic defense is not a human completion claim. |
| Stable Endless/Madness | All60,000 progression transitions,48 natural battle/results, five-minute soaks and full hard/day10000 soaks (50044s/50079s); bounded memory, finite state and replay. | Sustained phone temperature, battery and real-device crash checks. |
| Working original controls | Native layout/animation fixtures; desktop/touch event ordering across10 panels; browser navigation through Options/Credits/Play/map/Help/scores/pause/shop/results. User confirms Galaxy Options→Done, purchase confirmations, pause menu, removed bottom bar and Help. | Complete physical-device acceptance remains. OpenFeint is discontinued; Global explains this and local scores work. Historical Visit opens its original URL, now a parked domain. |
| Original battlefield and sound | Native actor/weapon/effect traces plus528 combined scenes; original artwork,4 OST tracks. Ordered actor, weapon and sacrifice audio requests match native fixtures, including repeated events. Browser decoding/order and Resume-click regressions pass. Random-call scheduling matches2,160 world frames and88 enemy initializers; shared setup/scenery/combat sequence matches five two-day sessions/4,500frames. Background pause/save and muted development checks pass. | Historical OS sound mixing; exact historical RNG algorithm/session seeding and tie sorting; unspecified old GPU shake-edge behavior. No claim of framebuffer equality. |
| Installable static browser game |116 files/~23.1MiB; no emulator/backend/runtime npm dependencies. Browser server-off reload, Help, battle, music/ranges and update-recovery checks passed. Galaxy S24 Ultra/Chrome installation and installed-icon airplane-mode relaunch confirmed by user after closing Chrome and the app: music/gameplay work, no browser chrome or system status bar. Earlier shortcut saved-battle resume also passed. | iOS installed airplane-mode/audio and iPhone acceptance; iPad gesture/Help fixes require retest. Latest ordinary-browser report has no media card; installed-app follow-up remains open. A stable HTTPS origin is needed for lasting saves/install identity. |

Recorded build: snapshot22 (63,652bytes), migration from2–21, Wasm136,746bytes
with no imports. Build and check stages pass74 Rust tests,62 Node/Wasm suites,
10 Python tests, TypeScript, Biome, rustfmt and Clippy.

Desktop browser rendering now has direct day10000 evidence. The initial
60FPS cap delivered about52.5FPS because refresh jitter repeatedly reset its
deadline. The corrected clock preserves phase; the same one-minute Endless
and Madness trials deliver60.0FPS, and the30FPS case retains the same
simulation state fields. No missing artwork or extra resource requests
appeared during these trials. This is muted desktop evidence, not mobile
battery/thermal or GPU-completion measurement. See [rendering measurements](RENDERING.md).

Remaining audio limit: [sound dispatch evidence](../research/sound-dispatch-notes.md).
Current renderer evidence and limitations: [development notes](DEVELOPMENT.md#combined-battlefield-comparison).
Full dated receipts: [progress](PROGRESS.md).
The 116-file ZIP is historical release evidence.

Wave scheduling additionally matches2,510 integrated native frames: ordinary,
triple and forced waves, prefix growth, crowd limits including corpses,
between-day countdowns and save/replay. Native randomness is supplied as a
legal31-bit stream; the historical libc generator/session seeding remains
unproven. Synthetic campaign kills changed with the corrected
wave scheduling; the duration/difficulty data and completion criteria did not.

New days share their procedural, scenery and combat stream; fresh entropy is
no longer injected every day. Native InitMode initializes the stars twice
(120 calls). Saves retain the star initialization seed separately from the
current stream; restoring scenery cannot consume combat randomness. Older
saves keep their existing scenery. This establishes the supplied-stream
sequence across consecutive gameplay segments, not historical menu-time RNG.

The loading audit restored one additional native draw before each day:
`ClearLoadUpdateFuction` selects a loading hint before new-game initialization.
The former probe had incorrectly bypassed it. The corrected five-session
comparison includes this call, the actual background-loader arguments, and
preload/retry invariance. See [menu randomness](../research/menu-random-notes.md).
Apple's published iPhone/ARM source configuration was also researched, but
its exact historical shipped library version is not established. The saved
upstream qsort file is not Apple's patched final source; no speculative
generator or equal-depth ordering replacement was made. See
[historical libc evidence](../research/historical-libc-notes.md).

Full unshortened sessions additionally match158,105 native frames across47
battles: opening sessions and final days in all12 castles, two opening Endless
days, a Madness defeat, and both modes at days100 and10,000, through natural
result transitions. All use normal HP and unshortened timers. Inputs use
actual original pointer callbacks; comparisons include
actor sprites/positions/animation/HP/speed, projectiles, rewards, RNG and fades.
This caught off-centre drag velocity, the carrier’s first held retreat step,
ballista random-value ordering, immediate post-shield wizard attacks and defeat
wave spawning. Later-castle coverage also corrected dying-actor movement after
a breach, a terminal-frame auto-release and the platform flight-pose transition.
Late-day comparisons also corrected five disabled-platform days, retained-pose
abilities/held attacks, retreat culling, two same-frame barrel impacts and a
corpse wall-impact pose. Late campaign fixtures execute all preceding setups
but skip their gameplay; default equipment is retained. Eight added battles
win and eight lose naturally. This does not establish human completion.
Six further Machinery days with seeded tier0/1/2 equipment add20,940frames
and526 gestures, including all weapons, both sacrificers and consecutive-day
equipment state. These fixtures compare ordered audio, gate smoke/hover,
missiles and rewards, and exposed five corrected native differences. Their
inventory is seeded; earned human purchasing remains a separate acceptance.
Native day banners/fades also match1,960 renderer frames across
all modes. See [full-day evidence](../research/full-days-notes.md).

Battle entry now waits for49 decoded effects and both native soundtrack groups
to download. A controlled browser test held one effect/track and verified loading
continued until release; actual pickup/throw then started both samples while
music played from a Blob URL. The browser output was silenced. Original click
WAVs are byte-identical to the IPA; interrupted effects now fade for5ms instead
of freezing mid-waveform. The user confirmed day-one music, pickup/throw sound,
acceptable loading and disappearance of the reported click/crackle on the S24
Ultra. This confirms that phone check, not historical mixer equivalence.

Original soundtrack dispatch is now executed and compared: menu/map/shop/results
use `knights_gameplay_02.mp3`; battle uses `knights_gameplay_03.mp3`, each with100
repeats. Same-group requests preserve position; group changes restart. Ordinary
Pause emits the original click and leaves music running. Options switches to the
menu group; returning restarts the battle group. Default volume is0.5; explicit
saved settings remain unchanged. All four recovered MP3s remain packaged, but
the executable does not select `knights_mainmenu` or `knights_gameplay_01` here.
The browser deliberately retains working music unmute instead of reproducing
the verified native stop/same-group defect. See
[native soundtrack evidence](../research/music-transition-notes.md) and
silent browser receipt (local `artifacts/native-music-browser-check.json`).

Delayed audio callbacks cannot suspend an unfinished interruption fade or lose
a final-frame sound solely because the results screen appeared. Loading that
finishes after pagehide remains paused until Resume. Regression tests cover
these production paths. Background output still stops fully.

Audio effects currently download concurrently as individual files; artwork is
already packed. Bundling audio downloads is explicitly deferred until the
original-experience fidelity gate, as requested. The offline allowlist retains
all effects and music regardless of download grouping.

Faithful HD remains unstarted. It must remain optional and off by default when
the original-experience acceptance gate is met.

Map animation/input now matches930 original frames across fresh entry, victory,
manual and locked selection, blank-space deselection, drag, interrupted auto-pan,
hint dialogs and the last castle. Shield growth/pulse, completion glow/burst,
sliding panels, delayed next-castle selection and the one-time congratulations
dialog are restored. All three buttons follow their original moving y270+panel
position; animation updates retain their DOM nodes so a live press is not lost.
Both effect images preload with the map. See
[native map evidence](../research/animation-coverage-notes.md) and
browser checks (local `artifacts/map-browser-check.json`).

The global visual-clock gap is corrected. The browser performs two separately
rounded additions per battlefield tick and one per menu tick; physics/day
clocks still advance once. All three battlefield sprite/glow readers use the
continuous application clock, shared with the map, instead of per-day time.
Regression matches336 original outer-renderer frames and540 production renderer
inputs, including pauses, host-delta limiting, three day initializations and
menu/map switches. Actual browser verification observed998 battlefield ticks
with zero clock-addition mismatches, stable Pause, Options→Done and Abort→map.

The browser normalizes simulation/visual ticks to60Hz, including lazy virtual
menu ticks while static screens use no animation timer. It does not reproduce
an old device's variable host-frame schedule. Background time is excluded,
including a page initially opened in a hidden tab. See
[clock evidence](../research/app-clock-notes.md) and
muted browser receipt (local `artifacts/app-clock-browser-check.json`).
Audio bundling and HD remain deferred. Physical-device acceptance is still open.

Main-menu presentation now matches25 original entrance frames, six pressed
states,36 native hit boundaries, five gesture traces and Play→Back reentry.
All six original controls are present, including Tell a friend. Help Exit
matches20 native entrance frames. Ordinary buttons share release-point
selection across10 surfaces; fresh pointer generations prevent the same touch
from answering a newly opened dialog. Shop scrolling and Options controls now share the overlay routing described
below. Current map button rectangles follow animated positions.
See [main-menu evidence](../research/main-menu-notes.md),
[input routing audit](../research/menu-input-routing-notes.md), and
browser receipt (local `artifacts/menus-browser-check.json`).

Tell a friend is a user-requested browser adaptation: native Web Share with
the current playable URL, stripped of query/hash/credentials. Unsupported or
failed sharing falls back to an unsent email draft; cancellation stays in the
game. `legacyShare=1` restores the original email subject/body (including its
historical App Store link) through a valid mailto handoff. Button activation,
cancellation, fallback and legacy content pass automated and stubbed desktop
browser checks; actual phone share sheets/mail apps are not device-verified.
Compound map/shop/scores background-to-button releases and Options Down/Move
phases now match executed native sequences.41 native sequences/126 events/430
assertions cover the four compound screens. Production handlers and menu clock
replay122 events, plus12 lifecycle cancellation cases. Shop uses signed net
travel, preserves scrolling beneath modals and separates the last drawn layout
from the lower scroll clamp. Overlapping buttons all highlight; only the first
callback runs. Idle dialogs do not keep scheduling frames.
See [compound evidence](../research/compound-menu-input-notes.md) and
muted browser receipt (local `artifacts/compound-browser-check.json`). Final release
server-off reload starts a cached campaign battle and supports Pause/Options/Done.
Physical-device acceptance and the other limits above remain open; this is not
full1:1 certification.

Save lifecycle now matches the original three independent mode slots and consumed
continue offers. NO keeps the existing map/Play presentation; the submenu is
still drawn behind its dialog. Native serialized-state and UI probes confirm
purchased inventory/result resume and Done-only castle unlock. Browser v2/v3
shared saves are retained, with per-mode overrides preventing stale revival.
Pending defeat is retired before results. Production regression and muted
server-off save/resume checks pass. See
[save lifecycle evidence](../research/save-lifecycle-notes.md).

The opt-in full-day soak uses extra/replenished test HP to reach both day10000
victories, and includes6,093,396 simulation ticks with fixed1,507,328-byte Wasm
memory. This is synthetic stability evidence, not14-hour physical-device or
human-completability validation.


Battlefield input now matches84 native live events across normal/mirrored and
scaled canvases, plus eight original pause traces. Release coordinates reach
weapons without an extra creep Move; empty Down retains its gesture, outside
moves are not clipped, and coordinate truncation precedes mirroring. Pause
shares battlefield routing, including the original mirrored-release quirk.
One active contact matches the original disabled-multitouch view. Cancellation,
keyboard activation and pause-save double-release have regressions. Muted
browser drags and server-off resume pass. See
[touch evidence](../research/battle-input-notes.md) and
browser receipt (local `artifacts/touch-browser-check.json`).

Android Chrome installation is now user-confirmed on Galaxy S24 Ultra: knight
icon, no browser chrome, working music and effects. The original standalone
manifest left the system status bar visible; it now requests fullscreen.
The later Galaxy check confirms no system status bar and successful offline
relaunch with music/gameplay after closing Chrome and the app. Fresh no-cookie browser
requests to Pinggy returned screening HTML for the manifest/icon. Standard
192/512 PNG and180px Apple icons now preserve the original artwork. A clean
Cloudflare preview was explicitly authorized; its nine checked resources return
correct types and match the build, without cookies or bypass headers. This
removes the confirmed transport obstacle; the later phone test verifies installation.
See [installation audit](../research/pwa-install-notes.md) and
public response receipt (local `artifacts/install-public-check.json`). Saves on
other origins remain untouched. HD and audio bundling are still deferred.

The original day-start, Victory and Defeat banners hide while paused, preserve
their animation state and continue on Resume. Three native traces and15
production renderer states confirm the reported behavior is authentic. No
visibility change was made. See [pause evidence](../research/pause-gestures-notes.md).

A background-audio regression also rejects external media-element restarts when
playback is no longer wanted. Normal resume passes with a real muted browser
audio element. The earlier installed-app report showed the media card on the
lock screen/in notifications, with a3:00 duration. A subsequent physical check
confirms that Home stops music, lock-screen Play is stopped again automatically,
and returning to Knights then tapping Resume continues game and music. This
establishes no sustained background restart, not a measured absence of a brief
sound before the guard pauses it. See
Android report (local `artifacts/android-installed-offline-check.json`). Latest ordinary-browser follow-up reports no click or media card; see audio investigation (local `artifacts/periodic-click-investigation.json`). This does not establish the original cause or current installed-app behavior.

The PWA update path now refuses manual activation/reload when saving the live
battle or retiring a defeat fails. A failed update asset download preserves
the active offline version. Actual server-off browser relaunch restored its
saved battle; after retry, closing the last old window activated the new
version, which also reopened offline and resumed the checkpoint. This verifies
service-worker behavior, not physical Android WebAPK shell update timing.

Twelve additional native options-file round trips into fresh runtimes establish
saved-dialog availability after prompt-open/NO and graceful termination. Current
browser reload behavior matches those normal closures. Immediate browser
persistence differs from original Endless/Madness abrupt process loss, where
the offer can return if no later options save occurred. This is an explicit
platform-lifecycle limit; see [evidence](../research/save-prompt-lifecycle-notes.md).

Failed resume downloads now restore availability of the validated checkpoint.
Previously its bytes survived, but closing the page after the failure left the
original one-shot offer consumed and prevented ordinary recovery on reopening.
Artwork, audio and result-art failures are covered across all three modes;
normal successful loads and NO still match the original availability rules.
Metadata/battle consistency is checked before downloading, so a mismatched
checkpoint is not mistaken for a temporary connection problem. This recovery
is a browser adaptation for resources that the original app carried locally.
A real local browser test returned503 for required Madness artwork, closed
without Retry, reopened at the same origin and restored day1 at82seconds/300HP.
See recovery receipt (local `artifacts/resume-recovery-browser.json`). Storage still
must accept writes for availability to survive closure; the existing storage
warning remains in place when it cannot.

Responsive browser checks now cover six observed CSS viewports:360×800,
800×360,414×895,895×414,768×1024 and1024×768. The playfield retains3:2,
stays inside the viewport and produces no page overflow; visible button
centers receive input. Compact Options→Done, Help page5/Exit, gameplay Pause
and portrait/landscape rotation passed. The original Reset rectangle extends
past the logical right edge; its visible center is reachable and its native
geometry remains unchanged. No production change was needed.

A fresh fullscreen trace confirms one trusted click with user activation,
successful entry and a later exit without another game click. The current
test host did not retain fullscreen long enough for a stable-layout claim;
this does not establish a phone regression. The later Galaxy installed-app
check confirms fullscreen without system status bars. Other devices' safe areas,
iOS and touch/keyboard behavior still require device evidence.
See viewport receipt (local `artifacts/viewport-browser-check.json`). The temporary
viewport override was reset and the tracing server stopped.

Movement subdivision now matches576 original held/released states through the
production browser input handlers and Wasm: normal/giant mass, four paths,
1/2/4/8 samples per segment and both mirror settings. Native subdivision itself
has at most0.000396729 float32 velocity drift for identical paths/tick ordering;
no physics adjustment was justified. Hardware event timing/coalescing and touch
latency are not established by these synthetic samples. See
[input evidence](../research/battle-input-notes.md#movement-subdivision--16-october-2026).

iPhone and iPad testing is deferred until the user has those devices later
on16October. This Mac has Xcode/simctl but no installed simulator runtimes
(`xcrun simctl list runtimes -j` returned an empty array). No runtime was
downloaded and no simulator test is claimed. The browser API/source review
found no demonstrated compatibility failure; it does not replace Safari testing.

Long-save scenery reconstruction was also measured locally with the production
`Landscape.advanceTo`: near the end of a50,079-second day, three Node/V8 trials
took26.7–37.9ms and produced equal finite scenery state. No checkpoint/save-format
change was justified. This excludes browser overhead, asset downloads and phone
performance; see receipt (local `artifacts/landscape-restore-cost.json`).

## Recovery while held and difficulty coverage — 16 October 2026

Six additional complete native battles cover Easy/Hard First Encounter days1/2
and Random Skirmish day30:19,031 new frames,53 battles/177,136 frames overall.
They exposed a retained recovery-pose bug: picking up a stunned knight reset
its recovery timer because it shared storage with held duration. Separate held
recovery now matches80 direct native pickup/process states and the full battle
traces. Hooked-save replay, re-pickup, v21 migration and corrupt-timer rejection
pass. An older hooked save lacks this timer; it retains its former pose behavior
until the scared transition. No difficulty or enemy statistics were changed.

The exhaustive579-day campaign test uses instantaneous offscreen synthetic
throws. A separate screen-bounded one-contact defender completed35/36 complete
castle/difficulty runs on the preceding build across recorded strategies;
Hard Random Skirmish remains unproven, with the best attempt reaching day29.
These bots target hidden state perfectly and do not establish human balance.
See `artifacts/campaign-bounded-input-check.json` for the pinned old build and
all attempts. Its losing attempts are not evidence of an original/port mismatch.

## All final-day difficulties — 16 October 2026

The expanded native difficulty capture now includes Easy/Hard final days for
all12 castles plus their First Encounter days1/2:28 complete battles/112,482
frames. Combined with existing Normal/opening/equipped/mode traces,75 complete
battles/270,587frames match the production Wasm. Every castle's final day now
has full-duration native comparison on all three difficulties. Natural defeats
are retained as well as wins; earlier day setup is executed without playing
those earlier battles, and final-day inventory is the starting inventory.
This strengthens simulation fidelity but does not prove a human campaign win.
No new production adjustment was needed; the released build is unchanged.

A single additional screen-bounded Hard Random Skirmish strategy bought the
Cannon with earned gold after the Ultimate door and used its ready shots.
It lost on day21, winning20 days. The report is retained in
`artifacts/campaign-bounded-input-10-gate-gun.json` with the current Wasm hash.
This failed strategy does not close the human-balance gate or establish a port
bug; no enemy/difficulty statistics were altered to make a test win.

Remaining physical checks are staged in [device testing](DEVICE-TESTING.md).
Wait for the user’s iPhone/iPad availability message; Android’s completed
installation/offline/background checks do not need repeating now. The current
requirement audit is recorded in `artifacts/completion-audit.json`.
