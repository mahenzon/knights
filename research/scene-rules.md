# Original altar, Hell Gate, dragon and sounds

Source: `research/Knights`, SHA256 `a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`. ARM addresses below are virtual addresses. `probe_scene.py` executes bounded original routines with drawing, audio playback and particle allocation intercepted. It writes native fixtures to `scene-data.json`. The native program remains an offline research input.

## Anchors and rendering order

`Display::Blit` (`0x7bf4`, no crop) selects `BlitAtPoint::` through selector pointer `0xcf544`; `Texture2D::BlitAtPoint` (`0x9934`) uses a **top-left** origin. `Display::BlitRotated` (`0x7fec`) selects `drawAtPoint::` through `0xcf534`; its underlying routine (`0x9a70`) uses **center** ± half content width/height. The probe executes both texture methods with a 64×32 texture at `(10,20)` and checks all four vertices, making this independent of method naming.

`Display::BlitRotatedScale` (`0x8188`) instead invokes `Texture2D::drawInRect` (`0x95a0`). It centers the rectangle using signed width/height, but maps UVs in the opposite vertical direction: `(0,maxT),(maxS,maxT),(0,0),(maxS,0)` instead of the other methods’ `(0,0),(maxS,0),(0,maxT),(maxS,maxT)`. Consequently the Canvas equivalent is `scale(sx,-sy)`. The Ballista’s native `(1,-1)` draws upright. The probe now captures both vertices and UVs for positive/negative scales; the production-renderer regression compares all four texture corners.

Default scene positions, in the original 480×320 logical plane:

| Image | Origin convention | Position | Original source |
| --- | --- | --- | --- |
| `altar_dragon.png` | top-left | `(35,30)` | `artefact::Draw`, `0x2e3ec–0x2e42c` |
| `altar_hook.png` | top-left | `(35+65,30+6) = (100,36)` | `0x2e4b0–0x2e4fc` |
| `hole_zad.png` | top-left | `(173,210)` | `DrawBefore`, `0x2f9a4–0x2f9f4` |
| `hole_krishka.png` | center | `(173+59,210+17+opening+2*jitterY+burstY)` | `0x2ff18–0x2ff88` |
| `hole_per.png` | top-left | `(173−15,210+10) = (158,220)` | `0x2ff94–0x2ffe0` |
| `reddrake_head.png` | top-left | `(dragonX,dragonY)` | `0x2ea48–0x2ea80` |
| `reddrake_jaw.png` | center, rotated | `(dragonX+92,dragonY+80)`, radians=`jawAngle` | `0x2ea84–0x2eab8` |

Global surface pointers: `0xc74b4 → _g_altarHook`, `0xc74bc → _g_holeCap`, `0xc7460 → _g_hole[back,front]`; `_g_dragon[head,jaw]` at `0xe29d4`. The fixtures assign symbolic surface tokens then capture the original drawing calls.

`DrawNormalGame` (`0x6ef4–0x6fa8`) draws land, then `DrawArtefacts`, ordinary sorted creeps/dragobjects, then `DrawArtefactsAfter` (including dragon), missiles, foreground, particles, flying text, fragments and smoke. `DrawArtefacts` (`0x30150–0x3016c`) runs `Process`, `DrawBefore`, `Draw` per active artefact. Default slot order is altar then gate.

Within the gate: **back → enable clip → captive creep → lid → disable clip → front**. The gate captive is excluded from the ordinary creep pass by `creep+3`. Its explicit gate drawing occurs at `0x2fa34`. The gate front is consequently behind ordinary nearby walking creeps, but in front of its captive. The dragon draws above ordinary creeps, after both altar and gate.

This also applies to the **ejected skeleton** while `artefact+0x84` (draw captive) remains set. After that frame's clipped captive draw, `0x2fad8–0x2fb00` checks animation5 and strict `creepY<180`: clear creep+3, artefact+0x84 and occupied. It does not clear the stored captive index there. In the transition frame the subsequent ordinary pass may consequently draw that creep again. JSON `gate_capture.transition_samples` proves flag values around payout/clearance.

Animation5 uses a skeleton image immediately. `creep::Draw` at `0x28dc8–0x28df8` indexes `_g_creeps[(type*180)+(animation*15)+frame]`. `LoadCharacterGFX` loads `skeleton` at `0xf844` and stores it at type0/state5/frame0 (`+0x12c`) at `0xf878`. Horse state5 instead loads `horse_sceleton` at `0x10290`, stores at `+0x3fc`. Types2,3,6,7,8,9 also load `skeleton` into state5: stores `0x11950`, `0x10d10`, `0x12610`, `0x13238`, `0x146dc`, `0x15b38`. Siege and bigbarrel state5 image assignments were not recovered in this scoped follow-up; do not extrapolate their appearance from those ordinary-creep assignments.

Gate GL scissor is `(67,0,320,480)` (`0x2fa00–0x2fa10`). The original projection/rotation at `0x4a48–0x4b78` gives physical framebuffer X=`320−logicalY`; this scissor means **logical Y≤253**, spanning the logical width. Canvas equivalent is a `(0,0,480,253)` clipping rectangle. The gate back and front are outside this clip; only the captive and lid are clipped.

Hook fade (`0x2e43c–0x2e508`): when altar occupied and dragonX≤altarX+20, skip hook drawing and reset alpha to0. Otherwise increase alpha by10 per Draw invocation, clamp255, draw the hook at that alpha, then restore255. This is originally render-frequency dependent.

## Gate opening and digestion movement

There is **no idle wobble** when the gate is unused. At idle the lid is centered at `(232,227)` with angle0. Positive opening offset moves the lid **down**, into its clipped hole.

After drawing a frame (`0x2ffe4–0x30048`), update opening:

```text
opening += (hovering ? 50 : -50) * dt
if opening > 22: opening=22; ready=true
else: ready=false
opening=max(opening,0)
```

The readiness comparison is strict `>22`; at60Hz native readiness arrives after27 ticks. Since the update happens after drawing, the current frame uses the preceding opening offset. JSON includes frames1,13,27.

During digestion, once opening≤1 (`0x2fb04–0x2fbd0`):

```text
amplitude = min(1, amplitude + 0.1f*dt)
jitterY = float32(float32((rand()%1000)/400.0f)*amplitude)
jitterAngle = float32(double(float32((rand()%1000)/1000.0f - 0.5f)) * 0.08 * double(amplitude))
lidCenterY = baseY + 17 + opening + 2*jitterY + burstY
lidAngle = float32(jitterAngle*1.25f)
```

Outside that digestion branch both jitters are0. Two independent random draws are used. Probe rand is always123456, so its deterministic jitter samples are reproducible, not a proposed runtime RNG sequence.

At payout, the burst flag activates. In that same frame, `burstY += -800*dt`; if burstY<−1200 reset it0, clear flag, set opening22 (`0x2fe14–0x2fe54`; velocity literal`0x2fdec`, threshold`0x2fdf0`, reset-opening literal`0x2fdb8`). This lifts the lid well above the screen. The lightning-strength field decreases at300/s and clamps0. Independent lightning/smoke also occur. JSON includes native lid poses at payout and subsequent frames.

## Dragon trajectory: verified against every native frame

The authoritative constants below were checked against their literal addresses, then independently reconstructed in `verify_dragon_equations`. **All264 frames match native x, y, jaw angle, phase and direction exactly, maximum absolute error0.** Full poses are `altar_capture.dragon_frames` in JSON. They include60 waiting frames and the final reset frame; `visible` indicates dragon activation.

When cooldown becomes strictly greater than1s and altar is occupied, `DrawProcessCustom` (`0x2e8a0`) initializes once:

```text
x=360; y=-182; phase=0; direction=1; jaw=.5
```

Every active tick, in this precise order:

```text
x += -180*dt
y += 105*dt*direction + sin(phase)*130*dt
phase += 5*dt
y = min(y,0)
if x < altarX+20: direction=-2       // affects next tick's y update
if x < altarX+180: jaw += -1.1f*dt
if x < altarX+50: jaw += +8.0f*dt   // BOTH jaw branches apply here
jaw = min(jaw,.5)                  // no minimum clamp
```

Literal addresses: velocity−180=`0x2ec7c`, rise105=`0x2ec80`, sine amplitude130 double=`0x2ec84`, phase rate5=`0x2ec8c`, first jaw delta−1.100000023841858=`0x2ec90`, maximum jaw.5=`0x2ec94`, second jaw delta**+8**=`0x2ed0c`, completion threshold**−250**=`0x2eca0`. Earlier informal messages that said−20/−300 were manual address mistakes; these verified values supersede them.

Most math uses float32 rounding after each multiplication/addition. The Y update is mixed precision: compute `float32(float32(dt*105)*direction)`; add the double expression `sin(double(phase))*130*double(dt)`; add double(previousY); convert result to float32. The independent probe implementation documents each rounding point for differential checks.

After drawing:

- First `x<altarX+200`: emit sound `(10,0)` once (`0x2eaf4`). At baseX35, native frame102.
- `x<altarX+35` and captured creep still active with sacrifice/held flags: clear active, increment sacrifices. Native frame157. No ordinary `creep::Die` call or gold reward.
- `x<-250`: clear occupied/dragon-active and reset x1000 (`0x2eb6c–0x2eb90`). Native frame264. The frame264 routine draws at its pre-reset x≈−252 first, then stores x1000; JSON poses describe post-tick state.

## Original sound table and event timing

`LoadAllSounds` (`0x37ce0–0x38090`) calls `LoadSoundAsSystem(baseName,event,subtype)` (`0x37c28`). The probe intercepts each load, writes a unique sound token into `_allSounds2[event*30+subtype]`, then executes all original alias/overwrite assignments. Thus `sounds.creeps[event][enemyType]` contains the **final original table**, not a guessed filename convention. Names have `.wav` appended for browser asset lookup. `PlaySound` (`0x37ba8`) indexes the same matrix.

| Event | Trigger | Native evidence |
| --- | --- | --- |
|0|Surviving ground impact|`Process` calls Hit, then only if alive: animation4 and PlaySound0 at`0x287d8`|
|1|Death, any cause|`creep::Die` at`0x27584`|
|2|Release / enter flight|`StopDrag` at`0x26498`, `GoFly` at`0x26a98`|
|3|Successful pickup|`StartDrag` at`0x265c4`|
|4|Attack|`0x28038`|
|10,0|Dragon approaching|`0x2eaf4`, once x<altarX+200|
|11,0|Gate captures ordinary creep|`0x2d734`|
|11,1|Gate captures creep with+0xfe set|`0x2d724`; catapult, ballista and bigbarrel initialize this flag|
|11,2|Gate payout / skeleton expelled|`0x2fcd4`, same frame sacrifice increments|

**Filename semantics are counterintuitive:** event0 uses `knightlite_death.wav`; event1 uses `knightlite_deathcrash.wav`. Do not swap them based on filenames. Native also overwrites horse event0 with `black_knight_punch.wav`; ballista aliases catapult; frog aliases several jumper sounds; bigbarrel pickup aliases catapult. Null entries are deliberate absent sounds. For example catapult release has no loaded sound, and bigbarrel death instead emits explosion through its specialized death branch.

Fatal ground impact emits **event1 only**, not0+1: the probe compares a100vy surviving impact (HP490, event0) with700vy fatal impact (HP−110,event1). The death routine also awards gold. `player::KillCreep` (`0x19a08–0x19a78`) changes score/counters and contains no sound call, so there is no separate coin sound for ordinary rewards.

Gate fixture (capture at x233,y130): intake atframe0; surviving impact sound0 atframe35 as its captive reaches the gate floor; payout sound11,2 atframe333; readyframe344. Altar fixture: dragon sound10,0 atframe102; sacrifice awardframe157; readyframe264. The native gate floor event is distinct from payout.

`sounds.other` records remaining loaded global sounds (UI, platform, fireball, column, explosion, gun, freezer, flamer). Event17,1 is `ice_destroy.wav`, despite the archive containing other similarly named freezer assets.

## Validation and limits

Run `.venv/bin/python research/probe_scene.py` (native execution/JIT sandbox approval may be needed), then `.venv/bin/python -m py_compile research/probe_scene.py`. Native idle geometry, texture vertices, gate readiness, sound load mapping, impact selection and every dragon pose are asserted. This verifies original call arguments and simulation state, not final browser pixels or audio playback on a physical phone. Texture PNG dimensions, alpha appearance and platform audio activation remain renderer/device validation concerns.


## Day/night landscapes (follow-up)

`probe_land.py` executes `LoadBackground` (0x17020), `land::Init` (0x312b8),
`land::Process` (0x303a8), `land::SwitchDaytime` (0x30304), `land::Draw`
(0x30bbc), `cloud::Process/Draw` and `land::DrawAfter`. Surface construction,
GL calls and the separately drawn castle are intercepted. `land-data.json`
contains four loaded theme bindings, 48 drawing fixtures and 280 timing samples
across 30, 50, 90 and 300-second days.

- Every day initializes at night (phase3), sun angle float32(pi/4), countdown7s.
  When the countdown becomes strictly negative, target phase=(current+1)%4,
  fadeOut=255, fadeIn=0 and countdown=duration/3.5. Fade rates are -190/+190 per
  second; when fadeOut<0, current becomes target. The first switch is tick420
  and completes at tick500 at60Hz. Phase order is night→morning→day→evening→night.
- Sun angle advances by double0.8×float32(dt), rounded to float32, then clamps to
  the phase target. Targets keyed by outgoing phase are pi,4.263589859008789,
  2pi,2.1991147994995117. Position is float32(230+160*sin(angle)),
  float32(285+300*cos(angle)); scale(3,3), screen blend and color(255,255,70,255).
- Five active cloud initializers are (x,y,scale,vx): (490,60,1.2,-60),
  (680,90,1.4,-50), (730,46,1.9,-90), (830,120,1.7,-70), (880,76,1.5,-40).
  X uses float32 fixed-step updates; x<-100*scale wraps to490. Native signed
  scale(scale,-scale) cancels the texture API's reversed vertical UVs.
- There are30 stars, initialized from separate rand()%480 and rand()%140 values.
  Steady night draws the first full texture and remaining29 with crop(0,0,8,8).
  Night transitions draw all full textures, using fadeIn or255-fadeIn alpha.
- Sky is `BlitStretch(0,320,480,0)`, whose inverted rectangle cancels inverted
  texture UVs. Ground remains top-left(0,64), foreground(0,288). Neither is
  tinted at night in this native path. Clouds blend between the matching phase
  textures; native premultiplied RGB/alpha modulation maps to Canvas globalAlpha.
- Each loaded theme supplies exactly morning/day/evening/night sky/cloud slots.
  Rain assets exist in the archive, but this inspected path never selects them.
  Their presence alone is not evidence of an active rain mechanic.

The browser's Landscape is a visual-only fixed60Hz companion to the Rust core.
It catches up to the core's saved float32 battle time, so rendering at30/60Hz,
pause and reload do not change the animation state. Stars use the existing
modern LCG pattern with a separate seed derived from the run; historical libc
seeds/global RNG ordering are not claimed. No additional data is required in
old saves. Very long Endless restores replay the visual ticks once; visual
checkpoints remain an optimization if measurements show this loads slowly.
Sun tint is computed once while loading, not as a per-frame filter.

Run `.venv/bin/python research/probe_land.py`, `node tests/landscape.mjs` and
`node tests/scene.mjs`. Tests compare native timing/cloud/star state exactly,
all48 draw fixtures and production renderer sky orientation/star crops/layering.

`Display::SetAddMode` is misleadingly named: 0x7d40 calls
`glBlendFunc(GL_ONE,GL_ONE_MINUS_SRC_COLOR)` (literal0x301 at0x7d58),
which maps to Canvas `screen`, not `lighter`. This applies to the sun,
ready Fireball glow (0x2ee44), flying Fireball glow (0x2ca58) and cooldown
timer segments (0x2e70c).
The landscape probe captures the actual GL factors; the drag-object probe
now includes blend state in its native drawing fixtures.


## End of day and follow-up scene probes (15 October 2026)

`probe_day_end.py` executes `normalGame::Draw`, `land::Process`, `land::HitCastle` and `DrawFlag` from the original executable. Only rendering/audio/particles and mode switching are intercepted. The world-call wrapper delegates to native land processing. For a 30-second day, victory is flagged at frame1801 and mode9 is selected at frame2290: **490 transition frames / 8.1667 seconds**, counting the detection frame. The world is called on every frame. Castle hits after victory preserve HP. Native defeat sets its separate flag but uses the same490-frame fade.

Fade starts at−400. Each tick subtracts170dt, clamps to−400, then adds250dt when ending. Above255 it clamps and selects results. Flag y starts−600, descends300/s, settles at−70 with a shrinking sine bounce (initial amplitude20, decrease25/s, frequency15), and reverses after its four-second countdown. Native caption/flag coordinates and every fade value are captured in `day-end-data.json`; `tests/day_end.mjs` compares all490 frames. The browser uses the original flag image; its font/multiline layout is still an approximation.

The expanded gate trace captures450 frames. Digestion begins34, floor sound35, jitter60, payout333 and lid reset423. The reset opening is22 (the earlier100 was a literal-reading error). Hook visibility/alpha is captured through291 frames, including the fade back from frame265. `tests/sacrifices_wasm.mjs` checks hook alpha, gate opening/amplitude/burst, payout and sound timing; jitter coordinates are checked against native ranges because the game RNG is not the probe's fixed rand value.

The Rust version7 snapshot stores these visual states and the pending day transition. Both last-second captures are regression-tested through save/replay. New waves stop at victory, while existing actors, sacrifices, weapons and landscape continue until the final fade.
