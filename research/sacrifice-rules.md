# Original sacrifices: capture, timing, rewards

These rules come from the supplied original ARM binary, with addresses below. `research/probe_sacrifices.py` executes the original functions using bounded Unicorn probes; rendering/audio are stubbed. Run `.venv/bin/python research/probe_sacrifices.py` in the same research environment as `extract_enemies.py` (Unicorn JIT requires host execution). The script asserts capture boundaries and award balances, and prints measured timings. No emulator is required by the browser implementation.

Campaign/shared shop investigation confirms artefact **type0 = Dragon Altar**, **type3 = Hell Gate**. Player **+0x84 = sacrifice points**, **+0x80 = gold**, **+0x64 = score**; purchase code `GoPurchaseItem` at `0x31d64` subtracts shop gold from +0x80 and sacrifice cost from +0x84.

## Rules needed for the first playable day

| | Dragon Altar | Hell Gate |
|---|---|---|
| Scripted position | `(35,30)` | `(173,210)` |
| Capture trigger | Release a gently held creep near the hook | Hover a held creep over the opening until open, then release |
| Region | Circle around **creep center** `(120,75)`, radius40 inclusive | **Pointer** `193 < x < 273`, `y <= 179` |
| Additional eligibility | Post-release integer speed magnitude≤350; not frozen; altar not busy | Lid fully open; gate not busy; a held creep ID exists |
| Award | **+1 sacrifice point**, regardless of type/large variant | **+1 sacrifice point**, regardless of type/large variant |
| Gold/score | Neither increases | Neither increases |
| First award timing | ~2.617s after capture at60Hz | 5s after creep falls belowY290, subject to closed lid |
| Reuse timing | ~4.4s after capture at60Hz | When the ejected corpse rises aboveY180 |

The ordinary creep `Die` routine is not called by either sacrifice award, so do not also grant kill gold/score. The direct reward increment is exactly one; these routines do not multiply it for Titan variants or enemy type.

## Event ordering and capture

`CreepStylusUp` (`0x264ac`) first calls creep `StopDrag`, **then** calls `ArtefactsStylusUp(pointerX,pointerY,creepID)`. Artefact `StylusUp` (`0x2d7e0`) calls `ConnectCreep` for type0 and `ThrowCreep` for type3. Altar capture therefore evaluates the velocity *after* the release adjustment described in `enemy-rules.md`.

### Dragon Altar

`artefact::Init` (`0x2ce80`, type0 branch `0x2cefc`) sets:

```text
hookOffsetX = 85      # artefact +0x14
hookOffsetY = 60      # +0x18
captureRadius = 40   # +0x1c, square stored at +0x20
initialDelay = 1.0   # +0x24
busy = false         # byte +1
```

`ConnectCreep` (`0x2d140`) ignores its supplied pointer coordinates and uses creep center and velocity:

```text
anchorX = altar.x + 85
anchorY = altar.y + 60
dx = trunc(anchorX - creep.x)
dy = trunc(anchorY - creep.y - 15)
if busy: reject
if dx*dx + dy*dy > 40*40: reject
if trunc(creep.vx)^2 + trunc(creep.vy)^2 > 122500: reject
if creep.frozen: reject              # byte +0xd0
```

Thus the circle center is `(altar.x+85,altar.y+45)`, **not the displayed hanging position**. Both radius40 and speed350 boundaries are accepted; 41/351 are rejected by the probe. Fractional coordinates/velocities are truncated before squaring.

On acceptance (`0x2d208`–`0x2d240`), the altar stores creep ID, resets its elapsed timer to zero and becomes busy. The creep snaps to `(anchorX,anchorY)`, remains in held state, clears flying, sets its linked/protected byte+2 and unpickable flag+a8, and sets pointer target `(anchorX,anchorY-30)` so the normal held spring keeps it stationary. Its held countdown+b4 becomes zero.

### Hell Gate

Hover detection is in `artefact::StylusMove` (`0x2d314`–`0x2d370`): when type3, creepID≥0 and not busy, set hovering to:

```text
pointerX > gate.x + 20
and pointerX < gate.x + 100
and pointerY <= 179
```

The vertical limit is the original literal **179**, not a formula using gateY. There is no lower pointerY bound in this code. At gateX173, x193/x273 fail, x194/x272 succeed; y179 succeeds, y180 fails.

The lid is updated in `DrawBefore` (`0x2ffe4`–`0x30048`):

```text
lidOffset += (hovering ? 50 : -50) * dt
if lidOffset > 22:
    lidOffset = 22
    releaseCaptureReady = true
else:
    releaseCaptureReady = false
lidOffset = max(0, lidOffset)
```

At60Hz a closed gate becomes ready after **27 frames / 0.45s**. Note the strict `>22`: merely reaching exactly22 without overshooting does not arm capture on that update.

`ThrowCreep` (`0x2d698`) checks not busy, ready flag+0x71, and creepID≥0. It **does not retest a circle or pointer position on release**. If ready, it stores the creep ID, marks itself busy/containing, clears creep.dragged, sets creep.flying, marks its special-render byte+3, sets groundY=300, zeros vx/vy, and sets linked/protected byte+2 and unpickable+a8. If not ready it clears hover and captures nothing. There is no additional frozen/type/HP eligibility test in this function.

## Dragon Altar reward timing

`artefact::Process` increments elapsed time each update (`0x2f094`). Type0 logic lives in `DrawProcessCustom` (`0x2e8d0`–`0x2eb90`), so a headless rewrite must move this gameplay work into simulation rather than omitting it as “just drawing.”

While busy, nothing happens until **elapsed >1.0**. Then initialize dragonX to the absolute value **360**, and move it **-180*dt** each update. Other sinusoidal motion is decorative.

When `dragonX < altar.x+35` (`0x2eaf8`):

```text
if stored creep exists, is active, and is both linked and held:
    creep.active = false
    player.sacrificePoints += 1
```

When `dragonX < -250` (`0x2eb6c`), clear altar.busy and flightStarted; the next creep can be captured. This continues after the creep has already been consumed.

For altarX35, continuous-time estimates are `1+(360-70)/180 = 2.611...s` to consumption and `1+(360+250)/180 = 4.388...s` to readiness. Native60Hz probe records **frame157** consumption/reward and **frame264** readiness. Reward balances change `[score,gold,sacrifice]` by **[0,0,1]**.

## Hell Gate reward timing

The full gate sequence lives in `DrawBefore` (`0x2f9a4`–`0x30108`), including gameplay, not solely visuals.

1. Captured creep falls normally with gravity1000 toward groundY300. Gate code forces walkSpeed=0 and sets creep protection byte+0x24. When creepY **>290** (or the creep becomes inactive), and digestion has not started, set digestion=true, digestTimer=**5.0**, hover=false, and initialize closing/effect state (`0x2fa68`–`0x2fab4`).
2. Subtract dt from digestTimer on every containing update. The actual completion code is gated by **lidOffset <=1** (`0x2fb10`) and **digestTimer <0** (`0x2fbd4`). Closing from22 to1 takes0.42s, normally well inside the five-second wait.
3. Complete the sacrifice: clear digestion, start ejection visuals, switch creep to falling-death animation5, set `vy=(rand()%100)-850`, `vx=-40-(rand()%40)`, groundY265 and alpha655. Play sound group11/index2; **add1 to Player+0x84** (`0x2fcd8`–`0x2fce8`). These velocities throw the corpse back into view.
4. Once animation5's creep rises to **y<180**, clear its special-render flag and the gate's containing/busy flags (`0x2fad8`–`0x2fb00`). The gate can accept another creep while the corpse finishes its visual trajectory.

The type3 Init field+0x24 is3.0, but **it is not the digestion/reward delay**. The five-second timer above determines the award.

Native60Hz probe, starting the captured creep at `(233,130)` with zero velocity: opening27frames, digestion starts34frames after release, award on frame333, reusable on frame344. Award occurs **5.55s after release**, reuse **5.733s**. A different release height changes the initial fall time. The probe uses creepProcess → artefactProcess → DrawBefore → DrawProcessCustom each step; original call-order differences can shift boundaries by one simulation step.

## Verified scope and remaining work

Capture boundary, speed boundary, frozen rejection, lid-open boundary, consume/readiness transitions, and balance deltas were checked against original ARM execution. Decorative dragon trajectories, gate particles and corpse rendering were stubbed during timing probes; their gameplay state updates ran unchanged. Projectile weapon impacts are outside this note. The evidence supports these sacrifice mechanics, not a claim that the entire browser game is already behaviorally identical.
