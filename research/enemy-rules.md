# Original enemy rules recovered from the IPA

Source: `research/Knights`, SHA-256 `a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`. Addresses below are original ARM virtual addresses. Coordinates are the original 480×320 landscape game units; positive Y points down. No emulated game code belongs in the browser build: these are references for a JavaScript implementation.

`research/extract_enemies.py` reproduces numeric initializers and bounded behavior probes with Unicorn. It loads the original Mach-O segments in private emulated memory, initializes Player, zeros four difficulty modifiers, fixes `_rand()` at `123456`, stubs sound/particle/actual death effects, and executes only named game functions. Its self-checks cover velocity cap, exact-zero HP, flight integration, ground impact, frog immunity, ability activation, and release velocity. `enemy-data.json` contains exact float32 results, raw field offsets, and named base stats. Unicorn is a research dependency only.

## Exact creep type mapping and base stats

The sprite-loader selectors at `0xea64` map type IDs to stack flags, then the first `Surface` filename in each block identifies the type. These **are not** the tentative knight/darkknight/horse order: IDs 1 and 3 are horse rider and dark knight respectively. There are 11 ordinary creep IDs, including two jumper variants and the large explosive barrel.

| ID | Sprite prefix | HP | Walk units/s | Castle hit | Base reward | Pickup radius | Animation fps | Attack range offset | Attack cooldown | First sprite load |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | `knight_lite` | 600 | 60 | 2 | 10 | 40 | 16 | 5 | -1 | `0xecac` |
| 1 | `horserider` | 600 | 70 | 4 | 20 | 49 | 16 | 16 | 0.2 | `0xf8b4` |
| 2 | `exploman` | 600 | 43 | 1 | 15 | 40 | 12 | 200 | 0.2 | `0x10da0` |
| 3 | `darkknight` | 600 | 50 | 3 | 25 | 43 | 13 | 10 | -1 | `0x10300` |
| 4 | `catapult` | 300 | 45 | 1* | 50 | 48 | 8 | 210 | 1.2 | `0x13274` |
| 5 | `ballista` | 300 | 45 | 1* | 50 | 43 | 8 | 260 | 1.2 | `0x14718` |
| 6 | `wizard` | 600 | 45 | 2* | 30 | 41 | 12 | 105 | 0.2 | `0x11b84` |
| 7 | `assasin` | 600 | 50 | 7 | 30 | 41 | 12 | 5 | 0.2 | `0x127ac` |
| 8 | `jumper` | 1300 | 55 | 2 | 25 | 43 | 16 | 16 | -1 | `0x13d58` |
| 9 | `frog` | 300 | 55 | 3 | 20 | 43 | 16 | 16 | -1 | `0x15080` |
| 10 | `bigbarrel` | 1 | 45 | 1* | 50 | 45 | 12 | 0 | 1.2 | `0x15b74` |

`*` The table is the stored melee-damage field. Catapult, ballista, wizard and barrel attacks use projectile/explosion paths instead of that direct melee field.

All types initialize gravity to **1000**, render scale to the global **0.8**, and drag mass to **0.9**. Initializer branches temporarily assign different masses but `0x25fa4` overwrites them all with 0.9: do not use the earlier branch values. Base HP is `+0x94`; walk speed is `+0x88`, saved speed `+0x8c`; castle damage is `+0x90`; reward is `+0xd8`. The sprite anchor transforms input ground Y as `groundY = inputY + 55 - spriteAnchorHeight / 2` (`0x25fac`–`0x25fdc`).

## Titan / large-variant flag and difficulty modifiers

`creep::Init(x, y, type, bool, scaleOverride)` at `0x25800` accepts the variant boolean and float as stack arguments. The ordinary type remains unchanged. With the boolean true (`0x26084`–`0x26110`):

- Render scale increases by **0.2**, ground Y decreases **15**.
- Current/saved walk speed becomes `trunc(speed * 0.8)`.
- Castle damage becomes `trunc(damage * 2.5)`; base reward doubles.
- Drag mass doubles to **1.8**; HP multiplies by **1.5**.
- A positive `scaleOverride` replaces the final render scale, without adjusting those other values.

This matches the embedded Titan hint at `0xaed4c`: “Titans are tough. Smash them into the ground or drop them at least twice to kill.” A regular 600 HP creep becomes 900 HP; a simple fall from approximately 240 units gives only ~693 impact speed/damage. The campaign investigator confirmed that **Land of Titans sets Player+0x168=2.0 on all days** at `0x35f98/0x35f9c`; `AddOneMonster` chooses the boolean using `rand()%100 < Player[0x168]*100`, making these spawns always large. `boss1`/`boss2` asset filenames alone do not establish additional creep types.

Before the variant adjustment, Init adds Player `+0x148` (float) to walk speed and truncates; adds `rand() % Player[0x14c]` when that integer is positive; multiplies HP by `1 + Player[0x164]`; and adds Player `+0x154` to attack range offset, clamping the result to zero. The JSON deliberately zeros these modifiers to expose base stats (`0x25fe0`–`0x26068`).

## Pickup, drag and flick

`CreepStylusDown` (`0x26674`) scans **200 slots** of size `0x100`, choosing the last matching active, alive, unshielded creep. It uses `trunc(pointerX-x)^2 + trunc(pointerY-y)^2 < pickupRadiusSquared`. The test is strictly `<`. Wizard shield flag `+0xa8` blocks pickup; invisibility does not.

`StartDrag` (`0x26528`) resets vx/vy to zero, stores the current integer position as pointer target, sets dragging, clears flight and the frog immunity flag, and plays the scared sound. An armed exploman immediately drops its barrel, becomes disarmed/fleeing, and doubles its saved walk speed (`0x265cc`–`0x26648`).

Each pointer move (`0x26250`) adds momentum from **pointer displacement, not pixels divided by event time**:

```text
dx = newPointerX - oldPointerX
dy = newPointerY - oldPointerY
vx += 2.5 * dx / mass
vy += 4 * dy / mass    if dy < 0  # moving upward
vy += 4 * dy           otherwise
targetX, targetY = newPointerX, newPointerY
```

During each Process step while dragged (`0x284d4`–`0x285dc`):

```text
x += (targetX - x) * 20 * dt
y += (targetY + 30 - y) * 20 * dt
heldTime += dt
walkSpeed = 0
vx *= 0.9
vy *= 0.9
```

The original damping is **per simulation update**, not time-normalized; native JS should use a fixed simulation step to avoid refresh-rate-dependent throw strength. After 0.1 s the creep switches to scared animation, except a dark knight starts its escape animation after **0.6 s** and drops the drag flag (`0x2853c`–`0x285b8`). Once that escape animation ends, Process sets `(vx,vy)=(0,-450)` and calls StopDrag (`0x28aa0`–`0x28acc`).

`StopDrag` (`0x26378`) applies a special castle-side rejection before the general release adjustment:

```text
if 344 < trunc(x) < 480 and 99 < trunc(y) < 320:
    vx = 2 * trunc(480 - x) - 420
    vy = 3 * trunc(320 - y) - 400
vx -= 2 * trunc(x - targetX)
vy -= 2 * trunc(y - targetY + 30)
dragging = false
heldTime = 0
flying = true
play flying sound
```

The release expression really contains **+30**, while the drag target is `targetY+30`; this is verified by a native probe (`vx=100, vy=-100, y-targetY=30` produces `vy=-220`). Preserve this quirk rather than “correcting” the signs.

## Flight, impact and survival

Native `creep::Draw` at0x28d88–0x28e10 uses angle+π and signed scale(−size,+size) with the native reversed vertical UVs. It does **not** horizontally mirror according to vx or walking speed. A retained negative flight velocity must not reverse a recovered walking sprite. Exploman's retreat sequence already faces left in the source artwork.

`LimitVelocity` (`0x25740`) independently clamps each component to **[-900,900]**. `Process` calls it **before** adding gravity (`0x28614`):

```text
vx = clamp(vx, -900, 900)
vy = clamp(vy, -900, 900)
vy += gravity * dt
x += vx * dt
y += vy * dt
```

Consequently downward speed can exceed 900 by `gravity*dt` at the end of a step. The separate walking increment later in Process still adds `walkSpeed*dt`; dragging normally made this zero, but special jumps retain it.

When `x>405`, HP becomes **1** and the ground becomes **310**. A rightward collision with `x>350 && y>80` calls `Hit(abs(trunc(vx)))`, then sets `vx=-70, vy=0` (`0x2864c`–`0x286c4`).

Ground collision is `y>groundY && vy>=0`, with strict `>` on Y (`0x286e0`–`0x28740`). It snaps to ground, clears flying, sets stun to `abs(vy/300)+0.2`, calls `Hit(trunc(vy))`, and stops walking. Surviving types 8/9 recover immediately (`stun=-1`, idle animation); others use crash/recovery animation. No damage is derived from height directly.

`Hit(int damage)` at `0x27c44` ignores hits while either byte `+2` or `+0x24` is set (these other subsystem protection states are not fully named here). Otherwise it subtracts damage. Frog flag `+0xaa` cancels **one entire hit**, clears itself, and sets stun to -1. Death occurs only if **HP < 0**: exactly zero HP survives. There is no wizard shield check in Hit; the shield prevents pickup, not all damage.

On death (`0x27534`), Player `+0x80` (gold) increases by base reward. `KillCreep` receives `trunc(baseReward + 0.1*(groundY-minimumYReached))`, so height adds score. `player::KillCreep` (`0x19a08`) multiplies this score by 2 for difficulty value 1, by 4 for value 2, then adds it to Player `+0x64` (score); it increments two kill counters. The campaign investigator confirmed gold `+0x80` and sacrifice points `+0x84` through `GoPurchaseItem` (`0x31d64`), which subtracts the respective item costs from those balances.

## Unique abilities and attack behavior

Abilities update only outside protected byte `+0x24`. They pause while dragging or already marked finished, and activation requires idle animation. `UpdateAbilities` is `0x2720c`; all random ranges below use original integer remainder arithmetic.

| Type | Verified behavior |
|---|---|
| Horse rider (1) | Initial delay `1.6 + (rand()%100)/45`. Ability triples current and saved speed for `0.7 + (rand()%100)/250` seconds, then divides both by 3 and finishes. |
| Exploman (2) | Carries one barrel. Pickup or explosion launch drops it and doubles saved speed. On attack, throws barrel (drag object 4) at `vx=350, vy=-200-(rand()%100)`, then flees left. |
| Dark knight (3) | Breaks free after held longer than 0.6 s, as described above. |
| Catapult (4) | Throws drag object 5 from `(x-10,y-23)` with `vx=350, vy=-400-(rand()%100)`; projectile flag `+0x64=1`. |
| Ballista (5) | Fires drag object 7 from `(x-5,y-17)` with `vx=450, vy=-170-(rand()%60)`; projectile flag `+0x64=1`. |
| Wizard (6) | Initial delay is 3.5 s on an even random draw, otherwise `3+(rand()%100)/25`. Starts animation 10 and a **6 s** ability. When the cast animation finishes, `+0xa8=1` blocks pickup. Expiry clears it. Attack launches drag object 6 from `(x,y-16)`, `vx=360,vy=-30`. |
| Assassin (7) | Initial delay `(rand()%100)/25-1.2`, so some activate immediately. Active duration **6 s**; alpha falls **200/s** toward zero. Outside invisibility it rises **400/s** toward 255. Picking up forces full visibility and cancels active stealth. The picker ignores alpha, matching the original hint about touching hidden assassins. |
| Jumper (8) | Delay either 0.4 s on an even second draw or `2+(rand()%100)/55`. Launches with `vx=200,vy=-500`. Base HP1300. Ability is one-use; landing skips stun. |
| Frog (9) | Same initial-delay selection as jumper. Launches with `vx=40,vy=-450-(rand()%120)`, sets one-hit immunity, active window0.5 s. Can repeat while x<250; landing skips stun. |
| Large barrel (10) | HP1. On attack it dies/explodes. On death, x>300 also causes **25 castle damage**. Its explosion damages nearby creeps for **1000 within radius80** and knocks back within radius180. A large-variant barrel spawns a normal barrel with scale override0.7 on death (`0x27bf8`–`0x27c2c`). |

Catapult and ballista deaths also call `CreepHitSplash(x,y,1000,80,2)` and `CreepExplode(x,y,0.8,180,0.5,1)` (`0x275c0`–`0x27630`). Splash excludes dead, currently held, and protected creeps; it uses truncated Euclidean distance `< radius` (`0x27cc4`). Knockback is separate from damage. Detailed drag-object projectile impacts belong to that subsystem and are not guessed here.

Normal melee attacks call `land::HitCastle(castleDamage)`. Attack scheduling uses the isometric castle-line expression `trunc(x - (y-200) + attackRangeOffset) > 284`, idle animation, and expired cooldown (`0x28ad0`–`0x28b24`). Actual attack occurs when the attack animation completes, not instantly at the line (`0x28a58`–`0x28a7c`). A line value >290 while animation0/1 pushes the unit left at50 units/s and stops walking (`0x289b0`–`0x289fc`).

## Animation and drawing anchors

Frame position is float `+0x4c`, state is int `+0x50`, rate is `+0x54`. Process adds `dt*rate`, selects `trunc(frame)`, and resets frame to zero only when it exceeds the per-state float limit at `+0x58+state*4`. `animation_frame_limits` in the JSON captures all initialized states0–10 for every type; values such as9.9 permit frames0–9. State6 holds its last frame. State1 attacks at completion; state10 finishes the wizard shield cast; state9 completes the dark-knight escape. State map: 0walk, 1attack, 2held/scared, 3flying, 4recover, 5falling death, 6crash death, 7frozen, 8fleeing, 9escape, 10shield cast.

`creep::Draw` (`0x28d88`–`0x28e10`) uses the **sprite center** at `(x,y)`, rotation `angle+pi`, X scale `-renderScale`, Y scale `renderScale`. `Display::BlitRotatedScale` (`0x8188`) translates to that anchor and supplies destination origin `(-0.5*width*scaleX, -0.5*height*scaleY)` with the scaled width/height. The extra rotation/reflection participates in the original OpenGL coordinate/texture convention; compare recovered PNG orientation before copying those final transforms literally into Canvas. The physical anchor Y itself is the exact initializer formula above, not the bottom of the drawn sprite.

## Evidence limits

The five help JPGs show pickup/drop, machines exploding on impact, sacrifices, fireballs, stones, squasher and guns. Enemy-specific facts come from embedded original text and code, not from those pictures. Exact sprite-pointer repetition within animation states and names of protected flags `+2/+0x24` need adjacent investigation. No claim of full behavioral equivalence is made from these isolated probes, and no Android/iOS browser testing is represented here.
