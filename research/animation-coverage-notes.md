# Animation coverage audit — 16 October 2026

Three **confirmed missing map-animation groups** were found in the inspected
production state. No additional missing battlefield emitter was established.
This is a scoped source/ARM audit, not a claim that every game pixel is correct.

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Addresses below are ARM virtual addresses in this binary.

## Why the existing checks did not cover them

- `probe_world_scene.py` executes battlefield DrawNormalGame, including live
  smoke/fragment allocation and drawing, but does not execute mapMode.
- `probe_map.py` intercepts ProcessLevels at `0x196cc`, sets every marker's scale
  to 1, supplies time/delta 0, and terminates map drawing at `0x235b0` before
  the map smoke phase. Its static geometry results remain valid.
- `probe_map_details.py` also intercepts ProcessLevels and map smoke drawing
  `0x1a304`. It checks captions/records/hints, not animated map transitions.
- `web/map.mts::mapScene` used fixed `(1,-1)` marker scales and static panel
  positions. `web/game.mjs::castleMenu` selected/centered the first incomplete
  castle immediately and did not retain the just-completed map transition.

## Confirmed missing groups

| Group | Original path and assets | Production path at audit time |
| --- | --- | --- |
| Marker growth/pulse and deselection shrink | ProcessLevels `0x196cc–0x198e0`; map draw `0x23160–0x2327c`; `point_capture.png`, `point_open.png`, `point_defending.png`, `point_fx.png` | `web/map.mts::mapScene` fixed scale; `web/game.mjs` map selection immediately re-renders without animated state |
| Victory marker glow/burst and delayed next-castle camera movement | Record callback `0x1995c–0x199fc`; InitMode emitters `0x1f3f8`, `0x1f708`, `0x1f8dc`, `0x1faac`; draw `0x23280–0x233c8`, `0x233e8–0x23488`; `freeze_gun_fx_flash.png` and `flamer_gun_fx_flash.png` | No corresponding map effect or transition state; finishRun/map entry discarded the prior camera context |
| Map panel entrance/hide/reappearance, with moving captions/buttons | Init `0x1f2f8–0x1f304`; update `0x23488–0x234dc`; draw `0x23530–0x235ac`; button positioning `0x23a00–0x23ab8`; `map_interface.png`, `map_interface_up.png` | Static panels/text/control positions |

The new read-only harness is `probe_animation_map.py`; evidence is
`animation-map.json`. It captures **930 frames in five cases**, plus a separate
150-frame repeat-victory equality check. Every captured marker scale also
passes an independent formula assertion: **11,160 exact comparisons**.
All **930 panel steps** were independently compared against float32 ±350/s;
both show and hide use 350/s.

The five cases are fresh entry, completed castle0 auto-transition, manual
selection/locked selection/blank selection/drag/hint dialog, interruption of
the victory auto-transition, and final castle11 victory. `beforeInit`,
`initialState`, each frame's `before`, `state`, `time`, `actions`, and complete
native draw commands are retained. Map pointer and dialog processing execute
the original routines. OS/file calls, graphics output, and global map-button
drawing are intercepted; dialog-button drawing is live.

## Equations and draw order for integration

`f(x)` below means IEEE float32 rounding; `dt=f(1/60)` in these captures.

1. Native map Draw first draws tiles at the **old camera**. It then calls
   ProcessLevels (`0x23154`): each selected marker base scale is
   `clamp(f(base+dt),1,1.5)`; each unselected marker uses
   `clamp(f(base-dt),1,1.5)`. A fresh native table has scale0, so every marker
   becomes1 on its first processing frame. The first castle is initially
   selected in the extracted original LevelData; the probe retains that flag.
2. Marker draw follows processing, still at the old camera. For selected
   markers, `s=f(base + sin(f(appTime*16))*0.10000000149011612)`; unselected
   markers use `s=base`. Both shield and selected `point_fx.png` draw at
   `(level.x+camera.x+14, level.y+camera.y+8)` with scales `(s,-s)`.
3. Completion flash flag LevelData `+0xf0` has a countdown at `+0xec`.
   ProcessLevels decrements it by dt and clears only when `<0`. While active,
   draw `freeze_gun_fx_flash.png` at the same marker anchor, screen blend,
   `sx=s`, `sy=f(-s + sin(f(appTime*10))*0.3)`. It is drawn after that marker's
   shield/selection overlay. The victory callback writes countdown1.
4. After all markers, decrement map `+0x34` delay. When `+0x31` manualCamera is
   false and delay<0, ease each camera coordinate with
   `f(camera + f(dt*10)*f(target-camera))`. Native VFP multiply/add follows
   the binary's rounding; preserve separate float32 operations as required
   by comparison. There is no additional `+0x32` guard. If `+0x30`
   pending_selection is true, clear it, clear marker selections, increment
   Player.selected, and select that next marker **on the first easing frame**.
5. Update panel offset `+0x40`: `f(panel + f(dt*(-350)))` when `+0x44` is1,
   otherwise `f(panel + f(dt*350))`; clamp to `[0,128]`. Despite the old
   fixture key `panel_hidden`, `+0x44=1` means move the panel into view.
6. Clamp the new camera to `x∈[-540,-420]`, `y∈[-430,0]`. Draw panels with the
   **new panel offset**: bottom at `192+panel`, top at `-panel`. Bottom text
   and buttons add panel; top records/stars subtract it. Button y is
   `trunc(f(270+panel))` for **all three map buttons**, including Info.
   Info's initialization y265 is overwritten on the first Draw: the common
  270.0 constant at `0x23af8` feeds setters `0x23a24`, `0x23a44`, `0x23a60`,
   and the active-Play setter `0x23ab8`. SetPos `0x1cb08` has no per-button
   correction. No camera inertia is present in these paths.
7. Draw/process the live map smoke pool at `0x23abc–0x23ac0`, followed by
   dialog processing/drawing and global buttons. Thus a victory burst is
   above the map panels, but below the hint/congratulations dialog.

## Initialization and victory context

- InitMode writes panel128, manualCamera1 (`0x1f2f8–0x1f304`). It preserves
  per-level scale values. Ordinary return preserves per-level selection;
  it does not derive the selection from "first incomplete".
- Init's final camera centering (`0x1f4d4–0x1f534`) uses the retained
  Player.selected index and `(240-level.x,160-level.y)`, **without clamping**.
  Fresh castle0 therefore starts at `[-391,-180]`; its first marker draws
  at `[254,168]`; the after-state clamps to `[-420,-180]`. The following
  marker draws at `[225,168]`. This difference is original phase ordering,
  not a fixture corruption.
- The winning record callback sets completion, opens the next castle, and
  sets the completed marker's flash flag/countdown unconditionally
  (`0x199cc–0x199f8`). A repeat victory at an already completed castle was
  executed separately and is **exactly equal** to the first victory's
  150 captured frames.
- A victory flash in Init is emitted **before final camera centering**. It
  uses the previous map camera plus completed level coordinates plus `(16,6)`.
  Smoke kind3 = `flamer_gun_fx_flash.png`, `vx=vy=0`, size `f(0.2)`, growth7,
  alpha255, fade−120, additive1. Smoke processing precedes its drawing;
  first captured size is `0.3166666626930237`, alpha253/255; blend is lighter.
  Its terminal alpha0 still draws once (frame128); removal follows.
  Do not filter the terminal draw solely because it is transparent.
- If a next active castle exists, Init retains the completed marker selection,
  sets pending_selection1, manualCamera0, delay1.5, and target center of the
  next castle (`0x1f440–0x1f4a0`, unrolled equivalents). The captured transition
  begins frame91. Its first camera after-state is
  `[-431.3333435058594,-213.33334350585938]`.
- Pointer down immediately sets manualCamera1, so a touch interrupts auto-pan
  even before its delay expires. It does **not** clear pending_selection;
  that flag remains inert while manualCamera is true (captured case3).
- Winning final castle11 does not increment to12. It clears marker selection,
  keeps Player.selected11, and opens dialog3 if Player `+0x8a` was false,
  setting that latch so the congratulations dialog is shown once. Exact text
  includes the original spelling: `   Contratulations!\n You have defended all\n     castles.`
  The final-castle fixture captures this original dialog while map effects
  continue beneath it. This fixture starts with the latch false.

## Manual selection, dragging, and dialogs

- Map down `0x1de4c` sets manualCamera1 before calling dialog input. If a dialog
  consumes the input, map selection/pointer coordinates remain unchanged.
- Otherwise, it records pointer coordinates, dispatches global button input,
  and for y<260 tests active markers in table order. Squared distance is
  computed from **integer-truncated** `(pointer-levelPosition-camera)` and
  must be≤2499 (literal `0x1e2f4`). The hit center is the raw map position;
  it does not include the drawn `(14,8)` offset.
- A marker down clears all previous selected flags, selects the marker,
  assigns Player.selected, sets panel-visible direction `+0x44=1`, and emits
  click event9 (`0x1df24–0x1df5c`), **`menu_buble_open.wav`** (event8 is
  `menu_click_button.wav`; source: native LoadAllSounds table retained in
  `scene-data.json::sounds.other`). Locked castles can be selected; Play remains
  unavailable. This happens on down, not on up or only after a no-drag test.
- A blank down clears marker selection and sets panel direction0, but retains
  Player.selected (captured frames91+). Thus captions/selected index and
  highlighted marker are distinct state.
- Move `0x1dc7c` first lets dialogs consume input. Otherwise it adds current
  minus stored pointer coordinates to camera, immediately clamps, then stores
  the new pointer coordinates. No release velocity/inertia. The captured
  `[-40,-40]` move changes camera `[-420,-180]→[-460,-220]`.
- Up `0x1dd64` dispatches dialog/global-button input; it does not change map
  selection, camera, or panel motion. Hint callback `0x1eaac` invokes original
  AddHelpDialog(1). The captured real hint dialog blocks marker selection and
  dragging, while marker pulse/map processing continues underneath. Its actual
  OK button is pressed through map down/up at `(217,230)` and closes it.

## App-time discovery and remaining coverage limits

The pulse reads `_g_timef` at `0xe2360` via pointer `0xc73c8`. It is **not**
map-local elapsed time. `-[CrashLandingAppDelegate renderScene]` increments it
at `0x5254–0x5264` before mode->Draw dispatch `0x5294–0x52a4`. The map fixture
supplies that app clock independently, including nonzero starts17.25/29.5/42.

There is a second increment in DrawNormalGame `0x6ec8–0x6edc`. Existing
battlefield probes execute DrawNormalGame without the outer Obj-C renderer.
That difference is a **new, concrete coverage gap** for global-clock-driven
visual phase; it does not imply simulation/day timers advance twice. Verify
the full outer mode path before changing battle clock semantics. No production
change or complete outer-clock comparison was made in the initial map audit.
The subsequent scoped `app-clock-notes.md` / `app-clock.json` now resolves
that gap: real outer dispatch proves two global-clock additions during battle
and one on map, with unchanged paired simulation/day/land state. See that
report for exact readers, paused behavior, initializer continuity and limits.

A static scan of direct ARM calls finds **57 AddSmoke sites**: missile Die3 /
Process9, map Init4, creep Die7 / Attack1, dragobjects Die14 / ProcessCustom11,
artefact StylusUp2 / Draw3 / DrawBefore3. The **11 AddFragment sites** are creep
SwitchAnimation4 / Die4, dragobjects Die2, land HitCastle1. Other than the four
map emitters, all source function groups have existing production counterparts
and bounded native fixtures. This grouping is not per-branch exhaustiveness.

The combined-world interception of legacy Particles/FlyText/Powerups/perk paths
is not itself evidence of missing effects: existing `legacy-effect-pools.json`
finds only clear/process/draw references; DrawPerkPanel is `bx lr`. Rain assets
are not selected by the inspected land path. No speculative particles, floating
reward text, rain, or perk overlay should be invented from asset names alone.

Production files/tests were not edited by this audit. No UI was opened and no
sound played. Native capture/independent assertions succeeded; no framebuffer,
physical-device, historical OS mixing, or complete whole-game equality claim.
