# Original weapon and projectile rules

Source: unencrypted ARM executable `research/Knights`, SHA-256 `a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`. Addresses are original virtual addresses. `probe_weapons.py` executes bounded original functions in native Unicorn and writes `weapon-data.json`; math imports are implemented, graphics/audio/particles are stubbed, and enemy death is normally recorded rather than executed. Knockback/damage calls are captured for most weapon probes, then executed in separate boundary probes. The cannon cascade test specifically enables real ordinary-creep death. This research dependency is not part of the Rust/browser runtime.

Coordinates are the original 480×320 landscape units, positive Y down. `trunc` means round toward zero. Computation is predominantly float32; trigonometry and some constants use doubles.

## Artefacts and controls

`artefact::Init` at `0x2ce80`; pointer handlers `0x2e084`, `0x2d254`, `0x2d7e0`.

| Inventory | Type | Position | Pointer circle center | Radius | Cooldown seconds | Upgrade argument |
|---:|---:|---|---|---:|---:|---|
|8|2 Boulder|(315,63)|(344,76)|40 inclusive|25|tier0–2|
|9|4 Column|(405,38)|(438,51)|50 strict|30|tier0–2|
|10|5 Fireball / Freezing Bolt|(408,150)|(447,163)|42 inclusive|12|tier0–3|
|11|6 Gun|(392,237)|(427,254)|50 strict|15|tier×3:0,3,6|
|12|8 Ballista|(432,142)|(432,106)|42 strict|10−2×tier|tier0–2|

Elapsed readiness starts at0 in Init; Process adds dt. Press rejects elapsed<cooldown, so equality works. Boulder and fireball reset elapsed on pickup; gun and ballista reset it on release. Column release requires elapsed>cooldown and an inclusive radius check after the strict press check. Column's pressed bit is not explicitly cleared by its release branch; the cooldown prevents immediate repeat activation.

Gun and ballista **aim toward the finger**, within a cone facing left. Their angle uses the reversed vector and their projectile velocity reverses it again:

```text
angle = float32(atan2(artefactY-pointerY, artefactX-pointerX))
gun: clamp angle to [-0.4,0.45]
ballista: clamp angle to [-0.8,0.85]
vx = trunc(-600*cos(angle)); vy = trunc(-600*sin(angle))
gun origin = (x+18,y+20)
ballista origin = (x+14,y-50)
```

The global input-up sequence (`0x6840`) is creep release → artefact release → dragobject release. This matters for Column: ActivateColumn spawns its object held, then the same global input-up makes it unheld. Global dragobject release skips objects with byte+0x64 set (the fireball uses this flag).

Input-down (`0x6914`) calls the button handler, then selects a creep; if successful it returns immediately. Otherwise it selects a dragobject, returning on success; only then does it try an artefact. Dragobjects are scanned in ascending slot order, selecting the **first** hittable eligible object. The creep picker instead leaves the **last** eligible matching creep selected (see enemy rules).

`ArtefactsStylusDown` at `0x2e1cc` chooses the nearest **active** artefact among25 slots using squared distance to `(x+anchorDx,y+anchorDy)`. Ties retain the lowest slot index. Readiness, device type and radius are **not** filters during this selection; only the chosen artefact receives StylusDown. A nearer cooling device can therefore block a nearby ready device. Ballista selection uses its normal `(x,y)` anchor, even though its actual press circle is centered36 pixels higher. Native equal-distance gun tests verify both first-index selection and the cooling-device block. Native overlapping barrel tests select only slot0.

## Common dragobject processing

`dragobjects::Init` at `0x29bb0`, `Process` at `0x2c4e4`, custom movement at `0x2ae54`, held custom processing at `0x2bc00`. Pool stride0x74;30 slots. Relevant fields: type+8, age+c, lifetime+10, gravity+14, position+18/+1c, velocity+20/+24, shape/charge+28/+2c, target+30/+34, groundY+38, rotation+3c, radius+40, counter+5c, travelCharge+60, upgrade+68, visual scale+6c, followRate+70. Bytes: active+0, landed+2, held+3, pressed+48, finished+58, skip-global-input+64.

At the beginning of Process, y<−140 deactivates an object **without Die/explosion**. Held objects follow the target by `(target-position)*followRate*dt`, then call ProcessCustomStatic five times with dt/5. Unheld objects add dt to age; if age>lifetime, Die runs before movement. Otherwise:

```text
vy += gravity*dt
x += vx*dt
y += vy*dt
ProcessCustom(dt)
```

There is no common velocity cap. A hit test based on a distance normally truncates dx/dy separately, computes their Euclidean length, then truncates that length.

## Boulder — dragobject type0

Gravity600, lifetime3, initial velocity0, radius32+16×tier, groundY290, followRate20. Pickup creates it at the finger. Moving changes its target; **Boulder has no fling-momentum accumulation**. On release its initial velocities are still zero. While held its visual scale rises from0.7 toward1 at3/s; while released it rises at1/s.

Ground impact requires vy>0 and y>290−radius. On the **first** impact only, before snapping Y, call:

```text
CreepExplode(trunc(x), trunc(y+radius),
             vy*(0.002+0.001*tier), 260+35*tier, 0.5, 1)
```

There is **no direct HP splash** for this impact; the impulse causes subsequent fall/collision damage. Every impact snaps y=290−radius and changes vy to−0.4×vy. After landing, abs(vy)<10 calls Die, which produces fragments but no additional HP blast. Lifetime expiry also creates fragments.

## Column / squasher — dragobject type1

Created at(200,−70), width94, height230, radius128, gravity−3000, lifetime10, followRate20. On unheld custom processing while not finished, Y is clamped to at least−45 and upward velocity to at least−350 (the velocity clamp also applies after finished). Thus it hovers at the top until pulled down, despite its negative gravity.

Column pickup rectangle is `[trunc(x−47),trunc(x+47)) × [trunc(y−115),trunc(y+115+400))` (the extra400 is intentional). Original coordinate conversion goes through signed16-bit integers. Pickup zeros velocities and sets the pressed flag; it becomes held on pointer movement. Each move adds the pointer displacement to target position and **adds10×deltaY to vy**. Held movement uses normal20/s following; column has no additional held custom physics. Release clears pressed and held.

On descending below y=162 (290−128), snap y=162 and call:

```text
CreepExplode(trunc(x),290,0.3,150+50*tier,0.5,1)
CreepHitSplash(trunc(x),290,800,70+30*tier,-1)
```

Then increment counter, set finished if counter>tier+1, and rebound vy=−0.6×vy. Native probes confirm **2/3/4 permitted impacts** for tiers0/1/2. After finished, the top clamp is removed; a later y<−140 deactivates it. A later pickup can zero the velocity and another downward drag can generate the next impact. Do not model this as a single freely falling stone.

## Fireball and Freezing Bolt — dragobject type2

Gravity0, lifetime3, radius0, groundY285, followRate8, initial shape/charge0.5, counter3. Held movement follows the finger; each artefact pointer move adds `abs(trunc(deltaX))+abs(trunc(deltaY))` to travelCharge. The previous pointer starts at the artefact base position, not necessarily at the press position. Held custom processing does:

```text
travelCharge = max(0,travelCharge−500*dt)
charge = clamp(travelCharge*0.0015,0.4,0.8)
```

The five substeps mean charge decay covers the full step. Release resets age and sends it toward its last target at speed**420**: `d=position−target; velocity=−420*d/length(d)`. If length≤1, replace d with(0,−1), length1, so a stationary release shoots downward. It explodes when descending below y285 (snap to285 first) or age>3. The unheld process has **no creep-contact collision loop**.

Follow-up `probe_drag_followup.py` verifies angles: held `atan2(targetY−y,targetX−x)−π/2`; release `atan2(dy,dx)+π/2`; each moving step `atan2(vy,vx)−π/2`. Native π/2 literal is1.57079632675. Ten complete input traces,30 object poses and30 device poses are compared with the browser implementation. Four expiry traces confirm1/2/3 blasts for tiers0/1/2, with sound event16/subtype1 (`gun_gun_impact.wav`); Freezing Bolt's death itself emits no sound.

For tiers0–2, Die does:

```text
CreepExplode(trunc(x),trunc(y),0.8,trunc(charge*240),0.5,1)
CreepHitSplash(trunc(x),trunc(y),1900,trunc(charge*160),2)
```

Effect type2 marks non-frozen victims burning. Damage is1900 independent of charge; charge changes radius.

- Tier0 deactivates on its first explosion.
- Tier1 decrements counter; while counter>1 it reactivates, sets vx0, vy−800, gravity1200, rotation0. Thus **two explosions** are possible.
- Tier2 decrements counter; while counter>0 it reactivates with vy−600, gravity1200, retaining vx. Thus **three explosions** are possible.
- The age is **not reset** on these Die reactivations; expiry-triggered reactivation can therefore explode again on the following simulation step. The y<−140 early deactivation can also end an upward bounce without another blast.

Tier3 is the Freezing Bolt. It produces no HitSplash or CreepExplode; it freezes eligible creeps for**4.5s**, sets frozen animation7, and disables wizard shielding. Its eligibility excludes dead, held, already flying, and protected(+2/+0x24) creeps. A literal bug compares **truncated Euclidean distance against14400**, rather than comparing squared distance to14400. Native tests confirm distance14399 freezes,14400 does not. Preserve the effectively battlefield-wide effect for fidelity.

## Gun and ballista missiles

Init `0x1ab18`, ProcessLinear `0x1ada8`, Process `0x1b75c`, Die `0x1b5c8`. Pool stride500. Types produced by guns: Cannon0, Freezer2, Flamethrower1; Ballista3. Velocity and origin are above.

| Type | Gravity toward bottom | Lifetime | Contact behavior |
|---:|---:|---:|---|
|0 Cannon|1200|0.6s|Calls Die on contact; no separate direct300 hit|
|1 Flame|0|1.4s|Hit300 and burning flag; projectile persists|
|2 Freezer|0|1.4s|Hit0 and freeze3.5s; projectile persists|
|3 Ballista|600|10s|Hit300; projectile persists|

Process increments age by the full dt, but uses min(dt,0.03) for movement. It does nothing until age≥0.01 and age≥start delay. Age>lifetime calls Die before movement. Integration updates vy before x/y. The field called negative_gravity in the JSON is subtracted; the table above expresses physical gravity in screen coordinates.

Contacts scan200 creep slots and skip inactive, dead, and protected+0x24 creeps. The hit condition is `trunc(creepX−missileX)^2 + trunc(creepY−missileY)^2 < creep.pickupRadiusSquared+100`. Piercing missiles apply their hit **on every overlapping simulation step**, without a per-target cooldown. Native stationary tests give knight HP600→300→0 over two ticks for Flame and Ballista. `Hit` itself additionally ignores protected+2, and exactly zero HP survives. Freezer refreshes its3.5s timer each contact and switches animation7; wizard shielding is disabled.

**Every missile type0–3 has the same generic death splash**, even when dying from lifetime expiry offscreen:

```text
CreepExplode(trunc(x),trunc(y+16),1.7,220,0,5)
CreepHitSplash(trunc(x),trunc(y+16),800,130,-1)
```

Cannon calls Die once y>285. Ballista tiers0/1 have no ground-death branch; they can continue below the screen until lifetime expiry. Ballista tier2 additionally explodes at y>270:

```text
CreepExplode(trunc(x),trunc(y),0.8,180,0.5,1)
CreepHitSplash(trunc(x),trunc(y),1000,80,2)
Die()  # also applies the generic 800 splash centered16 pixels lower
```

Tier1 otherwise changes Ballista cooldown10→8; tier2 cooldown6 plus the ground explosion. Visual differences are separate.

The cannon's contact loop does not break after Die. With multiple overlapping survivors, each later survivor can trigger the generic blast again in the **same** Process call. A native probe with real ordinary-creep deaths verifies two co-located600HP knights die from one800-damage blast (the second is then skipped as dead); two co-located3000HP knights trigger **two** blasts and each ends at1400HP. This repeats damage, while the second knockback call skips already flying victims. Preserve slot iteration and state mutation order rather than unconditionally deduplicating the blast per tick.

Explosive enemy deaths are synchronous and can nest inside that damage scan. Real-death probes verify a catapult at(200,200) → enemy ballista at(250,200) → knight at(300,200) chain: both machines call impulse0.8/radius180 then damage1000/radius80, all three die, and exactly110 gold is awarded. The knight is outside the first damage radius and dies from the second machine's blast. Death sets the dead flag **before** the nested blast, preventing recursion back into that same dead unit. A large-barrel enemy dying at(350,200) first damages the castle25, then blasts a knight50 units away; both deaths award exactly60 gold. JSON contains the call order, so a deferred/batched death implementation can be checked against the original synchronous behavior.

## Shared splash damage and knockback

`CreepHitSplash(int x,int y,float damage,int radius,int effectType)` at `0x27cc4` uses **constant damage**, with no distance falloff. It excludes inactive, dead, held(+0x98), and protected+2/+0x24 creeps, but allows already flying creeps. Truncate dx/dy separately, then truncate sqrt(dx²+dy²); hit if distance<radius. Native radius130 tests:129 hits,130 and131 do not. Call `Hit(trunc(damage))`; effectType2 then sets burning unless frozen.

`CreepExplode(int x,int y,float factor,int radius,float randomization,float xScale)` at `0x26b3c` excludes the same protected states **and already flying(+0xa9)**. Within the strict radius:

```text
dx=trunc(explosionX−creepX); dy=trunc(explosionY−creepY)
distance=trunc(sqrt(dx*dx+dy*dy))
base=trunc((radius−distance)*factor)
strength=trunc(base + base*((rand()%100)/99.0)*randomization)
angle=float32(atan2(dy,dx))
GoFly()  # also drops an exploman's carried barrel
vx=float32(−cos(angle)*strength*0.4*xScale)
vy=float32(−abs(sin(angle))*strength*3−60)
```

Native cannon impulse tests validate distance falloff and velocity components (e.g. explosion(200,290), knight(200,240) → approximately vx0,vy−927). Boundary distance220 is excluded. There is no HP subtraction here; ground/wall impacts later apply velocity damage.

## Enemy projectiles — dragobject types4–7

The original `creep::Attack` at `0x28010` creates the following projectiles. All inherit the enemy render scale; their positions and initial velocity components are float32 values converted from the integer arguments. Native attack probes in `weapon-data.json` use enemy position(100,240) and rand123456.

| Enemy | Object type | Spawn position | Initial velocity | Gravity | Lifetime |
|---|---:|---|---|---:|---:|
|Exploman2|4 barrel|(trunc(x−17),trunc(y−20))|(350,−200−rand()%100)|400|30s|
|Catapult4|5 stone|(trunc(x−10),trunc(y−23))|(350,−400−rand()%100)|1050|3s|
|Ballista5|7 arrow|(trunc(x−5),trunc(y−17))|(450,−170−rand()%60)|500|3s|
|Wizard6|6 spell|(trunc(x),trunc(y−16))|(360,−30)|0|3s|

Types5/6/7 set skip-global-input+0x64, so player drag input does not catch them. Exploman's type4 barrel is draggable: a40×40 rectangle centered on it, inclusive minimum edges and exclusive maximum edges. Pickup zeros vx/vy and makes it held; pointer movement adds displacement to its target, and it follows at20/s. Its age pauses while held. On release it drops from zero velocity; holding it does not accumulate throw momentum.

The castle tests in ProcessCustom are independent of Y:

| Object | Hit condition | Castle damage | Result |
|---|---|---:|---|
|Barrel4|x>390|25|Die/explode|
|Catapult stone5|x>373|15|Die/fragments|
|Wizard spell6|x>355|2|Die/visual effect|
|Ballista arrow7|x>impactX|20|Set x=impactX,vx=vy=0; remains active until lifetime expires|

Arrow impactX is initialized to `320+rand()%28` (range320–347), stored in targetX+0x30. Rotation tracks atan2(vy,vx) while x<impactX. Equality at impactX is not a hit, so an embedded arrow does not repeatedly damage the castle. Gravity continues after embedding, while X remains fixed.

Barrels and catapult stones bounce when vy>0 and y>258: snap y258, set vy=−0.4×vy, mark landed. If abs(newVy)<10, call Die. Barrel Die always applies `CreepExplode(x,y,0.8,180,0.5,1)` then `CreepHitSplash(x,y,1000,80,2)`, including natural expiry and ground rest; only its x>390 branch damages the castle. Catapult stone Die produces fragments without a creep HP splash. Wizard/arrow Die has no damage call. There is no generic creep contact collision for these projectiles.

## Campaign jump platform — artefact type7

The type7 device is independent of dragobject type7. Process at `0x2f084` scans every time elapsed>**0.4s**, then resets elapsed0 whether or not anyone is launched. Its capture circle is centered at the **artefact base(x,y)** with radius30, not at the pointer anchor(x+55,y+17). Test is `trunc(dx)^2+trunc(dy)^2 < 900`.

It skips inactive, dead, held(+0x98), protected+2, already flying(+0xa9), and **Exploman type2** creeps. Other eligible creeps receive:

```text
tier0: vx=200−rand()%50; vy=−370−rand()%120
tier1: vx=100−rand()%50; vy=−670−rand()%120
flying(+0xa9)=true
firstHitImmunity(+0xaa)=true
```

It sets the platform activation-animation flag and plays sound12. It does **not** use GoFly, so these are the explicit side effects; the creep's existing walk speed is not zeroed here. Flag+0xaa is the same first-hit immunity used by frogs, rather than an unpickable flag. Native test: a platform-launched ordinary knight survives the first500-damage Hit at unchanged600HP, consuming that immunity. Grabbing a creep clears immunity through StartDrag.

The JSON tests both tiers, radius29 versus30, Exploman exclusion, elapsed equality0.4 versus0.401, and immunity consumption. This fills the special-device behavior used by Secret Spells, Random Skirmish and Explosive Round.

## Unplaced dragobject types11/12

The executable contains implementations for two long-lived draggable objects, and raw initializers are saved under `enemy_projectiles.initializers`. A direct ARM call-site scan found **nine** calls to AddDragObject: two barrel-drop paths, four enemy Attack paths, and the three purchased object creation paths. None creates11/12; the recovered full campaign initializer tables also contain no such creations. They are therefore **not established campaign requirements**. Their user-facing identity and an indirect activation route, if any, remain unconfirmed. Do not invent campaign placements for them.

## Verification and remaining limits

Native self-checks cover artifact press boundaries, aiming limits, fireball follow/charge/release, freeze bug boundaries, splash radius, persistent missile contacts, missile ground thresholds, Column2/3/4 impacts, all four enemy projectile castle boundaries, native Attack spawns, enemy stone/barrel bounces, campaign platform behavior, control selection ties, and multi-target cannon cascades with actual ordinary-creep death. Raw initializers for every purchased tier and exact float32 outputs are saved in JSON. Probes use rand123456 and do not substitute an emulator for browser gameplay.

Visual particle placement, complete sound selection, and all protected-state names are not fully cataloged here. Ordinary-cannon cascades and representative machine/barrel death chains are verified; this is not an exhaustive enumeration of every enemy/weapon combination. Types11/12 are described separately above because no campaign spawning route has been found. The original render/input/update ordering still matters; this document does not establish Android/iOS parity by itself.
