# Complete original battles — 16 October 2026

Source: research/Knights, SHA256 recorded in full-days.json and start-day.json.
No original executable is distributed in the browser build.

- normalGame::InitMode0x20e1c sets entrance fade255; normalGame::Draw0x20728
  decrements170/s and uses the native result transition, captured at0x1d780.
- CreepStylusDown0x26674 / StartDrag0x26528 stores previous contact globally but
  initializes the held target from the actor centre. CreepStylusMove0x26250
  calculates velocity from contact delta. The browser previously used target
  delta, so off-centre grabs added an unintended impulse.
- Process0x283ec handles held easing, then the disarmed branch0x2890c. A carrier
  still in pose0/1 switches to8 and moves at negative doubled speed for that
  frame. Held processing clears speed on the following frame.
- Attack0x2823c allocates a ballista projectile (its random target first), then
  0x28264 draws its vertical velocity. The port reversed the values while
  consuming the right count; damage first diverged at Madness frame354.
- Animation wrap at0x28a80 turns shield pose10 into0 and continues to the
  attack-range check at0x28ad0 within the same call. Port reset too early and
  missed this check; native Madness wizard slot2 enters attack at frame480.
- ProcessWave0x191bc checks land victory byte+0x2dc, not defeat+0x2dd. The native
  no-input Madness trace spawns a new enemy on frame711 after defeat frame710.
- DrawFlag0x1e2fc type0 prints yellow DAY text at175,y+150, white GET READY!
  at180,y+185, centred; campaign includes total days. InitMode supplies y−600,
  amplitude20, direction1, remaining4, phase0. Existing flag movement reused.

Full traces: Campaign day1=2290frames/score3150/gold270; day2=2770/7810/870.
Endless day1=3490/4442/380; day2=3730/9438/890. Madness=1199frames/defeat.
13479 total frames,148 synthetic pickup gestures. Native text/GPU/audio/HUD
are intercepted in the world probe; the day-banner probe separately executes
actual text calls. Normal difficulty/HP/full durations; no purchases or menu
dwell between days. Supplied legal xorshift stream and stable host qsort do not
prove exact historical library output. Idle native vx/vy slots can retain stale
unused values; comparisons require velocity equality while flying or held.

Tests: full_days_wasm.mjs, scene.mjs; focused Rust tests cover off-centre input,
held carrier behavior and shield-to-attack. Legacy/ending-only fixtures now
explicitly set a steady-state fade instead of accidentally relying on no intro.

## All castle opening sessions

`probe_campaign_sessions.py` reuses the exact full-day harness for castles1–11,
with up to two natural days per castle and early termination on defeat. Its
complete fixture has20 days/67,296 frames/1,056 pickup gestures, including
18 victories and two defeats (Jumpers Coming and Jumpers Return). Combined
with the earlier fixture, the Wasm comparison covers25 battles/80,775 frames
and1,204 gestures. Fixture hashes/schemas and all11 added castle indexes are
asserted before replay. No shortened timers or extra HP are used.

Three further differences were exposed and fixed:

- Original Process0x28a00 adds walk-speed movement before the animation update
  even for dying ground actors. The early fade exit0x28440 stops that motion.
  After a breach DrawAfter supplies speed100 to every slot; the port omitted
  this movement in DEAD. First divergence: castle4/day1/frame1404/slot3.
  A focused Rust regression checks movement and its cessation on fading.
- normalGame's inherited DeInitMode0x7ac0 is a no-op. The result initializer
  interLevel::InitMode0x20458 sets up buttons/music and does not release actors.
  Removed the port's unconditional release on the terminal simulation frame,
  which changed held velocity and emitted an extra throw event at defeat.
  Browser save/input cancellation still releases transient pointer state.
  First divergence: castle4/day1/frame1892/slot7, while dragging.
- Platform Process0x2f084 sets flying independently of the current pose. The
  next creep Process switches to flight pose3 at0x28608 before advancing its
  animation. Store the previous pose when launching from the platform, as
  other external launches already do. First divergence: Secret Spells
  castle7/day1/frame480/slot1. No launch velocities or balance data changed.

All earlier source, random-stream, renderer and synthetic-defense limitations
still apply. These opening sessions do not claim native comparison of every
late campaign day or a physical phone playthrough.

## Final campaign days and high-level modes

`probe_late_sessions.py` adds 16 complete battles / 56,390 frames / 1,906
synthetic pickup gestures. It executes every preceding campaign day setup
without playing those earlier battles, preserving partially overwritten enemy
tables. Endless/Madness initialize day 1 and advance the counter to day 100 or
10,000. Starting equipment, normal HP/difficulty and full durations are kept;
eight battles win and eight naturally lose. Combined coverage is 41 battles /
137,165 frames / 3,110 gestures. This is not an equipped human playthrough.

The first late harness incorrectly skipped preceding campaign initializers.
That left Land of Titans' enemy-table tail wrong. The corrected fixture runs
all earlier setups; production was not changed to match that invalid capture.
`full_days_wasm.mjs` also checks the enemy table and 12 engine configuration
values before every battle and warmup setup.

The corrected replay exposed these differences:

- Explosion knockback must retain the pre-disarm visual pose. Dropping the
  carrier's barrel changes its inventory state, not its current animation.
- UpdateAbilities at 0x2720c tests pose (+0x50), independently of the flying
  flag (+0xa9). A newly knocked-back jumper can jump on its retained walking
  frame. Native bounded probes cover rider, wizard, assassin, jumper and frog;
  the frog's already-flying guard at 0x27498 preserves its existing velocity.
- Animation-wrap attack/cast transitions check pose while a knight is held;
  they do not cancel the grab. First held catapult mismatch: castle 6, day 14,
  frame 360. Its next drag tick changes to the scared animation normally.
- InitLevel_11 creates slot 6 early but 0x36b28 explicitly disables it on
  days 6–8 and 19–20. The extractor used to retain every initializer call.
  It now filters by the final active byte and asserts the last call for each
  active slot agrees with the final native coordinates/type/tier. All 579
  campaign records and procedural validations were regenerated; only those
  five days on three difficulties changed. Repeated calls to an active slot
  retain their original order; equipment() already keeps the last one.
- Retreat culling at 0x2893c checks X after flight integration but before the
  common walk-speed movement at 0x28a00. First mismatch: Endless day 100,
  frame 471, slot 2. The port previously removed it one frame early.
- Barrel/stone ProcessCustom resolves ground bounce/death before the castle
  test (barrel 0x2b1b4–0x2b25c; stone 0x2b320–0x2b3c8). Both deaths can run
  within the same frame, and the first may allocate a new barrel in the freed
  slot. A native day-10,000 trace at frame 560 shows slot 1 dying at (2426,258),
  being replaced, then dying again at (2546,258). Extracted shared death logic
  preserves the existing synchronous explosion callbacks. The bounce uses
  the original double-precision 0.4 multiplication before rounding to f32.
- Wall impact at 0x286c8 checks the existing dead flag, not whether this Hit
  newly killed the actor. At frame 751, a corpse's HP becomes exactly zero
  after the castle-side HP reset; it still resets to death pose 6. This gives
  no extra kill/reward and returns to flight pose on the following frame.

The full validation suite passes after these changes (71 Rust tests and all
51 Node/Wasm suites). Research scratch traces remain excluded from the build.
Historical-library, GPU/audio and physical-device limits remain unchanged.

## Equipment across consecutive days

`probe_equipped_days.py` adds Machinery days 2 and 3 with each equipment tier
0/1/2: six complete victories, 20,940 frames and 526 input gestures. Inventory
is explicitly seeded (magic door, both sacrificers, boulder, column, gun and
ballista), not earned in a human purchase session. Day 2 has the tier's fireball;
day 3 switches to Freezing Bolt. Day 1 setup runs but its gameplay is skipped.
Normal HP, full timers, original global Down/Move/Up dispatchers and the same
supplied-stream/host-sort limits apply. Combined coverage is now 47 battles,
158,105 frames and 3,636 gestures.

Two harness errors were corrected before changing production: mirrored input
must convert physical X through `_g_stylusOrientationInvertX`, and the inherited
enemy-only interceptor must allow `ArtefactsStylusMove` at 0x2d4b4 to execute.
Between days, a completed Go Next tap releases the previous pointer. The first
capture without these conditions was invalid and is not retained as evidence.

Valid native comparisons exposed five production differences:

- Gate smoke at 0x30050–0x300f4: when opening exceeds 1, decrement the timer;
  below zero reset to 0.15s, draw one rand for X+15+rand%100 and create smoke at
  Y+20, vy−120, size1.1, growth0.4, alpha300, fade−800. The existing unused gate
  cooldown field stores this timer. First mismatch: day2/frame356 RNG.
- Ejected skeletons keep their final animation at landing and stop advancing
  while fading. First mismatch: day2/frame867. The focused Rust regression
  includes a horse's explicit ground coordinate because spawning offsets it.
- `artefact::Init` 0x2ce80–0x2d0f8 leaves aiming, pressed/recoil, drag linkage
  and animating state intact between days. Core start now accepts a sixth
  `next_day` flag (0/1); the campaign passes it for days after the first.
  Fresh starts still reset everything. Re-equipping retains only the native
  fields; gate opening/smoke countdown survive, gate pressed is reset by Init.
- Gate hover is latched by StylusMove (0x2d314–0x2d370). It cannot become
  eligible in the same draw that releases an ejected captive. First mismatch:
  day3/frame932, followed by RNG drift at971. Its pressed field also represents
  autonomous opening for a captive; restore preserves that state while still
  releasing orphaned pointers. All 18,315 captive replay frames pass unchanged.
- Repeated freezer contact resets the pose/animation of flying or held enemies
  too. First mismatch: tier1/day3/frame1133. Existing repeated-contact native
  fixtures and full-battle event comparisons remain unchanged.

Every equipped frame compares actor state, all projectile/missile slots,
equipment state, gate opening/smoke timer, ordered sound requests, RNG, rewards
and ending transitions. Snapshot remains version21 / 62,852bytes, reads2–20.
The extra start argument is the only public ABI change. Old five-argument
Wasm calls supply zero for the omitted argument. Native capture session53323
exited0; final complete check session81276 exited0.

## Easy and Hard complete battles — 16 October 2026

`probe_difficulty_days.py` adds four cases/six natural battles/19,031frames:
Easy and Hard First Encounter days1/2 and Random Skirmish day30. Ordinary
starting equipment/HP/full durations are retained; day30 executes earlier day
setup without playing earlier battles. Player difficulty is read from+0x70,
not hardcoded in the fixture. Combined coverage is53 battles/177,136frames.

Easy Random Skirmish day30 frame4358 slot7 first diverged when Down picked up
a recovering Dark Knight with517HP. Original pose4 changes to0 while remaining
held; the old remake stayed in4. The minimized pickup probe independently
identified separate+0xb8 recovery and+0x9c held-duration timers. Snapshot22
preserves held recovery and all six battles now match through natural result.
No bot victory or native human-balance claim is inferred from these comparisons.

## Final days on every difficulty — 16 October 2026

The Easy/Hard probe now captures all12 final campaign days, plus two opening
First Encounter days per difficulty.26 cases/28 battles/112,482frames, comprising
Easy14 battles/61,306frames/11wins/3defeats and Hard14 battles/51,176frames/10wins/
4defeats. Previous19,031frames are included, not counted twice. Earlier setup
executes without earlier gameplay; starting inventory is preserved. Capture
session16049 exited0. The completed fixture replaces its predecessor atomically;
partial capture never overwrites accepted evidence.

`tests/full_days_wasm.mjs` requires the exact26-case matrix from the12 recovered
castle day counts, labels failures with difficulty, and compares all75 total
battles/270,587frames through their natural result. Session13263 exited0;
`/private/tmp/knights-difficulty-finals-check.log`. No production change resulted.
Historical random-library, GPU/audio and human-balance limits still apply.
