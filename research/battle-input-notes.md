# Battlefield touch dispatch and UIKit input bridge

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Bounded original execution: `probe_battle_input.py`; evidence:
`battle-input.json`. Production was inspected read-only before the parent's
dispatcher changes. Existing equipment/creep probes were reused; no full
battles or individual physics routines were recaptured.

## Confirmed production differences

1. **The release point matters without being a Move.** Native ready Column
   Down(438,51), Up(200,200), with no intervening Move, creates no object and
   leaves the column armed. Up at(438,51) creates the column. Browser
   `web/game.mjs::releasePointer` calls `core.release()` without coordinates;
   `engine/src/weapons.rs::release_devices` instead tests the last stored
   pointer, so the first sequence activates incorrectly. Pass actual Up
   coordinates to release handling. Do **not** synthesize a final Move: native
   CreepStylusUp does not change the previous contact, target, or accumulated
   drag velocity before StopDrag. `live_sequences` records both column cases
   and a creep whose Up coordinates differ from its last Move.
2. **An empty Down still begins a gesture.** After the canceled column release
   above, native fresh Down(200,200), Move(438,51), Up(438,51) activates it.
   All top-level Move/Up events reach the world systems even after unsuccessful
   pickup. The inspected canvas handlers set `activePointer` only when pickup
   succeeds, dropping those subsequent events. Empty Down→Move over an ordinary
   knight does not pick it up; preserving gestures must not add hover pickup.
3. **Pause uses release-point routing across the battlefield.** Native
   Down(200,200), Move(460,305), Up(460,305) highlights then activates Pause.
   Down on Pause followed by Move/Up outside does not pause. Browser's separate
   DOM onclick and successful-pickup canvas capture cannot perform the first
   gesture. Native Pause down also forwards to world pickup; the button does
   not consume it. Buttons run before world handlers on every phase.
4. **Out-of-bounds Move is not clipped.** Actual native Down(100,200),
   Move(-600,900) sets the knight target to(-600,900), vx to
   -1944.4444580078125 and vy to2800 before any world tick. Browser Game::drag
   clamps X to[-100,580] and Y to[-400,400]. This changes the throw input.
   Finite-input validation is still an appropriate browser boundary.
5. **Integer conversion precedes mirror.** UIKit location(12.75,123.875)
   becomes integer logical(123,307), then mirrored(357,307). Browser point()
   mirrors its fractional normalized X before core truncates it, producing
   356 in the equivalent case. Normalize device coordinates, truncate, then
   mirror. This is a one-pixel difference for ordinary fractional contacts.

## Original routing and priority

Normal-game vtable methods Down/Move/Up (`0x20710/0x206e0/0x206f8`) delegate to
`GameStylusDownMultiDown/Move/Up` (`0x6914/0x69c8/0x6840`). The wrappers read
only the first point and ignore their count parameter. The fixture verifies
that the second point remains untouched.

| Phase | Actual order |
| --- | --- |
| Down | Buttons(x,y,false), Creeps; if no creep picked, DragObjects; if no object picked, Artefacts |
| Move | Buttons(x,y,false), Creeps, Artefacts(x,y,-1), DragObjects |
| Up | Buttons(x,y,true), Creeps, Artefacts(x,y,-1), DragObjects; then an additional mirrored Buttons call when Player+0x12c is set |

Buttons return value does not stop world dispatch. CreepMove itself calls
Artefacts(x,y,selected creep) when dragging, before the wrapper's second
Artefacts call with-1. CreepUp similarly forwards its selected creep for
sacrifice before the wrapper's general release. Existing sacrifice/device
logic already combines these effects; this note does not propose blindly
duplicating those Rust calls.

The Rust Game::drag inspected here orders projectile movement before device
movement; native orders device movement first. This is a confirmed order
difference, but no visible difference was observed in the bounded ordinary
boulder/fireball device gestures: object.pressed stays false while the device
owns it. Fireball also has skip_global_input=1. These cases are in
`live_sequences`; no additional observable mismatch is claimed for this order.

## Pause geometry, mirroring, and the native quirk

Pause remains visually at rectangle[446,291,34,29]. normalGame::InitMode
unconditionally allocates it at `0x20f68–0x20f78`. Original button input includes
left/top edges and excludes right/bottom edges. Executed boundary cases confirm
(446,291) activates, (480,300) and(460,320) do not. Activation emits event8/0,
then actual InitPauseGame changes the pause flag; world Up still executes.

DrawNormalGame tests Player+0x12c and mirrors the world at
`0x6d88–0x6dc0`. It pops that transform at `0x6fac`, before DrawInterface,
DrawPauseGame and ButtonsDraw at `0x6fb4/0x6fbc/0x6fc8`. Do not mirror or move
the visible Pause control with the castle.

Input has an original inconsistency: Down/Move mirror X before Buttons, while
Up performs Buttons at mirrored X and then, when Player+0x12c is true, calls
Buttons again with480−X (`0x68d8–0x68fc`). In mirrored mode both physical
(20,305) and(460,305) activate Pause. Only the physical left region sets
Pause's pressed state on Down. This exact behavior is captured in the two
`pause` cases starting with `mirrored_`; it is native behavior, not a suggested
visual relocation. Here Player+0x12c is the active world mirror, not the user's
Reverse option at Player+0x238. DrawNormalGame synchronizes the global
`_g_stylusOrientationInvertX` to the active world mirror.

## UIKit bridge and multi-touch limits

Actual `MyEAGLView` methods are touchesBegan `0x61e4`, touchesMoved `0x5ec0`,
touchesEnded `0x6508`. They enumerate the supplied touch set, call
locationInView, convert each CGPoint to logical X=trunc(uiY),
Y=trunc(float32(320−uiX)), then dispatch the array and count to the current
mode's virtual method. The top-level game wrapper multiplies by the float
FlipX/FlipY globals, truncates again, then conditionally applies480−X.
No bounds clip occurs. Browser CSS/device-pixel normalization replaces the
historical portrait-to-landscape UIKit conversion; do not literally rotate
already-normalized browser coordinates.

`view_init` executes actual initWithCoder with framework methods mocked and
confirms **setMultipleTouchEnabled:NO** at `0x5c14`. Keeping one active browser
pointer is therefore consistent with the initialized original view. The bridge
can enumerate multiple supplied touches, but its downstream game ignores all
except the first. The 2/4-contact fixtures test that code path; they do not
claim UIKit delivered simultaneous gameplay contacts. No MyEAGLView
touchesCancelled override appears among the binary's methods. Browser
pointercancel/lost capture/background cleanup remains a platform adaptation;
the correct OS cancellation behavior was not inferred from that absence.

## Evidence and limits

`battle-input.json` contains `routing` (18), `pause` (8), `UIKit_bridge` (10),
`view_init` (nine intercepted Objective-C messages), `live_sequences` (7),
and `sampling_sequences` (32).
Routing cases stub individual leaf systems to prove priority/arguments.
Pause cases execute actual button routing and InitPauseGame. Live cases execute
the original creep/object/device input with supplied state and no world ticks.
Framework input sets/locations are mocks; audio, GPU, OS navigation and file
work are intercepted. All assertions and Python compilation passed.

The production handlers are exercised by `tests/battle_input.mjs` with actual
Wasm, scaled/mirrored coordinates, pointer cancellation and pause dispatch.
No browser event coalescing, real UIKit cancellation or physical multi-touch
session is claimed by these synthetic fixtures.

## Movement subdivision — 16 October 2026

Thirty-two additional native sequences test mass0.9/1.8, upward/downward/
horizontal/reversing paths, and1/2/4/8 movement samples per straight segment.
Each sequence starts with real top-level Down, executes eight bursts of real
top-level Move callbacks, runs creep::Process (`0x283ec`) once at1/60 second
after each burst, and finishes with real top-level Up at a different coordinate.
The isolated original actor is compared with the actual browser handlers and
Wasm simulation:576 held/released states across mirrored/unmirrored canvases
at CSS scale2.5; x/y, vx/vy and pointer targets match within0.0001.

Subdividing the same native path without changing simulation timing changes
velocity by at most0.000396729; positions/targets and held/flying state remain
consistent. The discrepancy is float32 accumulation. Do not time-normalize
input or discard reversals: upward/downward impulses use different formulas.
No production change was needed. This verifies the same path and tick ordering,
not equivalence of different hardware event timing/coalescing or touch latency.

## Picking up a recovering knight — 16 October 2026

`recovery_pickups` executes actual top-level Down followed by nine creep::Process
calls for kinds0/3/10 and recovery timers−1/.001/.2/2. Native StartDrag0x26528
resets held duration at+0x9c but preserves recovery at+0xb8. While pose4 remains,
Process decrements recovery, switches to pose0 on expiry and restores saved
speed. The common movement tail advances once even while dragging; subsequent
held processing clears speed. Scared pose2 replaces the retained pose after0.1s
and stops further recovery countdown. The castle-range tail0x289b0–0x28a0c
clears speed after its retreat step before applying ordinary speed movement.

The production browser handlers and Wasm match all80 picked/tick states for
kinds0/3, including both timers, pose, fractional frame, position, velocities
and targets. Kind10's forced pose4 evidence remains research-only because its
armed/disarmed setup is not representative of a normal landing. First focused
red: recovery/0/−1/first tick expected pose0, got4. Snapshot22 preserves the
new held timer through hooks and v21 migrations are explicitly tested.
