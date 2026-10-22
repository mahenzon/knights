# Knights Onrush campaign, waves, and economy

Recovered from the user's unchanged `research/Knights` ARM executable. SHA-256: `a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.

This document describes original behavior established by disassembly and bounded offline execution. The accompanying `campaign-data.json` is research data for a newly written engine. Neither Unicorn nor the original executable belongs in the delivered game.

## Reproduction and evidence

Run `.venv/bin/python research/extract_campaign.py`. It executes the original player/level/artefact/shop initialization methods in native Unicorn with only libc hooks and three irrelevant shop UI calls replaced. It records 12 levels, 193 days for each of easy/normal/hard (579 records), their weighted enemy lists, modifiers, restriction flags, and scripted artefact calls. Raw player bytes remain available in each record for independent interpretation.

Validation in the extractor:

- All 12 exact original day counts and all daily enemy-list lengths are asserted.
- Every call must return to its sentinel within the instruction limit.
- A second random fixture identifies RNG-sensitive levels 10 and 12.
- An independent translation of Random Skirmish matches original execution for 42 varied day/input-stream cases, including all 205 RNG calls per initializer.
- Full Power's 25 sequential day pairs differ only in the expected randomized duration.
- Endless and Madness independently match176 cases covering four input streams, both modes, both mirror preferences, and11 day indices, including unlock boundaries, overlapping artefact days, and day1000. Deliberately nonzero prior enemy-table tails verify the partial writes.
- All 23 shop purchase deductions and inventory writes are checked by executing `GoPurchaseItem`.
- All 15 door-upgrade/difficulty HP combinations match `land::Init`, including current-HP restoration.

**Do not use the random fixture as a canonical campaign.** `_rand=123456` is the extraction fixture; `_rand=7` is a comparison. The original libc random generator and its session seed were not reconstructed. `randomRules` describes the formulas to use in a new engine. Other daily records are deterministic initializer results, not full recordings of gameplay between days.

## Level metadata

`LevelData` begins at `0xf8380`; each record is 244 bytes. Map x/y are signed ints at +4/+8, name is char[200] at **+12**, background ID at +0xdc, days at +0xe0. Map positions are source-map coordinates, not 480×320 screen positions.

| # | Name | Days | Background | Map position | Initializer |
|---|---|---:|---:|---|---|
| 1 | First Encounter | 8 | 0 | 631,340 | 0x36ff8 |
| 2 | Fireball Frenzy | 7 | 2 | 728,540 | 0x36e78 |
| 3 | Marching Knights | 10 | 1 | 827,359 | 0x358e4 |
| 4 | Machinery | 7 | 0 | 698,288 | 0x359c8 |
| 5 | Jumpers Coming | 12 | 3 | 861,98 | 0x35b68 |
| 6 | Covert Ops | 16 | 1 | 900,194 | 0x35cc8 |
| 7 | Land of Titans | 14 | 2 | 861,455 | 0x35f44 |
| 8 | Secret Spells | 20 | 0 | 741,408 | 0x36b7c |
| 9 | Jumpers Return | 24 | 3 | 770,66 | 0x3619c |
| 10 | Random Skirmish | 30 | 1 | 712,195 | 0x372ac |
| 11 | Explosive Round | 20 | 3 | 635,90 | 0x366f4 |
| 12 | Full Power | 25 | 2 | 521,548 | 0x36340 |

The JSON contains every day; repeated enemy IDs are weights, not duplicates to discard. For example, First Encounter day 2 has `[0,0,0,2]` and day 6 `[1,1,1,1,2]`.

Enemy IDs, cross-checked with the separate character extraction: 0 `knight_lite`, 1 `horserider`, 2 `exploman`, 3 `darkknight`, 4 `catapult`, 5 `ballista`, 6 `wizard`, 7 `assasin` (original spelling), 8 `jumper`, 9 `frog`, 10 `bigbarrel`. Titans are the giant initializer flag on an existing enemy type; they are not an extra type ID. Land of Titans sets giant probability to 2.0, guaranteeing this flag on every spawn.

## Player fields needed by the engine

Player begins at `0xe6a70`. Names below appear in the JSON's `wave` and `enemyModifiers` aliases; `floatFields`/`integerFields` retain offsets. Some wave aliases are enemy modifiers stored next to wave data; the grouping does not imply they affect spawning.

| Offset | Type | Name / meaning |
|---|---|---|
| +0x64 | int | Score |
| +0x68 | int | Total kills |
| +0x6c | int | Current-day kills |
| +0x70 | int | Difficulty: easy0, normal1, hard2 |
| +0x80 | int | Gold |
| +0x84 | int | Sacrifices |
| +0x88/+0x89 | byte | Endless mode / Madness mode |
| +0x8c | int[40] | Upgrade inventory, -1 absent; first entry is door tier |
| +0x12c | byte | Mirror the playfield horizontally |
| +0x130 | int | Current **one-based day**, not selected castle |
| +0x134 | int | Days in selected castle |
| +0x138 | int | Day duration, seconds |
| +0x13c | byte | Triple formation |
| +0x140 | float | `pressureGrowthPerSecond` |
| +0x144 | float | `initialPressure`; wave initializes to this **plus 3** |
| +0x148 | float | `additiveWalkSpeed`, added then truncated to creep int +0x88 |
| +0x14c | int | `randomWalkSpeedRange`; add rand()%range when positive |
| +0x154 | int | `attackRangeOffset`, added to creep float +0xc4, clamped ≥0 |
| +0x15c | float | `allowedEnemyPrefix`, initially reset to20; minimum effective prefix1 |
| +0x160 | float | `forcedSpawnInterval`, disabled when ≤0; reset -1 |
| +0x164 | float | `hpMultiplierMinusOne`: creep HP *=1+value |
| +0x168 | float | `giantProbability`: rand()%100 < value*100 |
| +0x16c | float | `nextDayPressureGrowth`, added to +0x140 |
| +0x170 | float | `nextDayAdditiveWalkSpeed`, added to +0x148 |
| +0x174 | float | `nextDayDuration`, added to integer duration then truncated |
| +0x178 | float | `enemyPrefixGrowthPerSecond` |
| +0x184 | int[20] | Weighted enemy-type table |
| +0x1d4 | int | Table length |
| +0x22c..231 | byte[6] | Disabled shop sections |
| +0x234 | int | Selected castle index, zero-based |
| +0x238 | byte | Endless horizontal-mirror preference |

**A previous exploratory interpretation had speed and HP reversed. The table above corrects it.** Direct evidence: 0x25fe0–0x26024 modifies creep int+0x88 with Player+0x148/+0x14c; 0x26028–0x2603c multiplies creep HP float+0x94 with Player+0x164. The numbers in the raw JSON were always unaffected by that interpretation.

Unknown / not needed yet: Player+0x150, +0x158, +0x17c, +0x180. Retained as raw fields; no semantics are claimed. New-game defaults and daily initialization do not clear every field, so retain sequential state if implementing original initializers instead of consuming the deterministic records.

## Day setup and difficulty

`player::InitNewGame` (0x19a88) sets score/kills/gold/sacrifices to0, inventory entries to-1 except door tier0; day0, default duration50, pressure0, growth1.8, walk-speed addition0, random speed range0, next-day pressure growth1.1, next-day speed addition5, next-day duration5. It calls `InitLevel(selectedCastle,0)` once while displayed day is still0.

`SetupNewLevel` (0x209fc) clears actors/artefacts/effects, calls `NextDay`, then `InitLevel(selectedCastle,displayedDay-1)`. `InitLevel` (0x379d4) resets per-day flags/modifiers, reads the castle's day count, calls its initializer, then applies difficulty. `NextDay` (0x198f0) increments the day, clears daily kills, and adds the three next-day modifiers described above. The extractor preserves this sequencing, including the initial day-index0 call.

Difficulty adjustment at 0x195b8 uses **displayed day≤3**, not castle≤3:

| Difficulty | Forced interval multiplier | Initial pressure multiplier | Additive walk speed multiplier | Next-day pressure-growth multiplier |
|---|---:|---:|---:|---:|
| Easy, day≤3 | 1.5 | 0.8 | 0.7 | 0.8 |
| Easy, day>3 | 1.4 | 0.45 | 0.5 | 0.5 |
| Normal | 1 | 1 | 1 | 1 |
| Hard | 0.8 | 1.2 | 1.2 | 1.2 |

These multiply float32 values. Negative disabled intervals remain negative. Per-day JSON already contains difficulty adjustment; **do not apply it twice**. Random-level formulas below describe pre-difficulty values and need this adjustment after generating a day.

## Original timing and simulation order

`applicationDidFinishLaunching` loads the double at0x4e54, **1/60**, into the arguments to `scheduledTimerWithTimeInterval:target:selector:userInfo:repeats:` at0x4de4. The selector reference at0x4ef0 names `renderScene`; repeats=true. This establishes the intended60Hz cadence, not guaranteed timer delivery on original hardware.

`renderScene` (0x51bc) obtains `CFAbsoluteTimeGetCurrent`, then at0x5220–0x5250 uses:

```text
dt = paused ? 0 : min(float32(now-lastTime), float32(0.05))
```

Pause literal is0.0 at0x52f8; maximum-delta literal0.05f at0x52fc. A modern fixed60Hz simulation is a defensible adaptation to preserve intended pacing on60/90/120Hz displays, but it is not literally the original variable-delta implementation. Cap or discard background time deliberately rather than letting a restored tab simulate minutes of unattended play.

`DrawNormalGame` (0x6d68) performs gameplay in this order:

1. Wave.ProcessWave (once per timer callback).
2. Artefact.Process followed by DrawBefore for every active artefact (`DrawArtefacts`0x3010c). These draw functions contain gameplay, including the Hell Gate state machine.
3. Global actor drawing, then powerup processing.
4. Artefact.DrawProcessCustom (`DrawArtefactsAfter`0x2eee8), including Dragon Altar consumption.
5. Missile processing, then creep processing, then drag-object processing.
6. Land.Process, including the day-completion timer; particles and interface follow.

This ordering matters at boundaries: gate/altar logic sees creep positions from the preceding creep update. The independent sacrifice probe originally stepped creep first; its timing results may therefore differ by one step from fully ordered execution. The parent engine should move gameplay out of rendering while preserving its relative order.

## Wave generation

Functions: `wave::InitNextLevel` 0x18f48, `UpdateWaveCurrentPower` 0x18e30, `AddOneMonster` 0x18f8c, `ProcessWave` 0x19104. Wave global is0xf8334.

Initial state: elapsed0, growth=Player+140, pressure=Player+144+3, tierProgress0, initial delay3.5seconds. The forced-countdown field Wave+0x48 is **not reset by InitNextLevel**; no initial countdown value is claimed here.

Each ProcessWave(dt):

```text
elapsed += dt
pressure += dt * growth
tierProgress = float32(double(tierProgress) + double(dt)*0.01)
delay -= dt
player.allowedEnemyPrefix += dt*player.enemyPrefixGrowthPerSecond
if forcedSpawnInterval>0: forcedCountdown -= dt

frameThrottle -= 1
if frameThrottle>0 or delay>0 or dayOver or paused: return
frameThrottle = 10
activeCount = count(active for each of the 100 creep slots)
r = rand()  // consumed even when forced countdown will trigger
if not ((forcedSpawnInterval>0 and forcedCountdown<0)
        or r%1000 < pressure or activeCount<=0): return
if activeCount>19 or delay>=0: return
unusedTier = rand()%min(trunc(tierProgress+1),10)
AddOneMonster(0,unusedTier)
forcedCountdown = forcedSpawnInterval
```

The throttle is **per ProcessWave call**, not per second. At the intended60Hz cadence above, one check occurs approximately every1/6second; rendering at120Hz must not double spawning. The counter resets only after all early gates pass. Global `_skipFrame`0xe23a0 initially contains0. No pressure depletion on a spawn appears in these functions.

`AddOneMonster` ignores the supplied tier arguments. It consumes RNG in this order:

```text
laneRandom = rand()
N = tableLength
if float(tableLength)>allowedEnemyPrefix: N=trunc(allowedEnemyPrefix)
N=max(N,1)
type = enemyTypeTable[rand()%N]
giant = rand()%100 < giantProbability*100
if tripleSpawn:
    spawn(-110,227,type,giant,-1.0)
    spawn(-103,242,type,giant,-1.0)
    spawn(-96,257,type,giant,-1.0)
else:
    spawn(-110,227+laneRandom%40,type,giant,-1.0)
```

The active cap is tested once before a triple, so a formation can take the active count above20. `-1.0` is the no-explicit-scale-override argument, not a negative render scale. Enemy initialization itself consumes more RNG for enemy-specific properties and speed range.

`land::Init` stores duration as float and resets elapsed0. `land::Process` (0x3045c–0x30498) wins the day when **elapsed>duration**, provided not already ended/failed. It does **not** wait for remaining enemies to die.

## Random Skirmish (castle10)

Let d be the zero-based day index. Use exactly this order before difficulty scaling:

1. Set pressureGrowth=2, additiveWalkSpeed=20+9d, randomWalkSpeedRange=9d.
2. duration=30+4d+rand()%40; pressure=55+30d.
3. table=[0,1,2,3,4,5]. Perform100 swaps, each using two independent rand()%6 indices. This is the actual algorithm, not an idealized Fisher–Yates shuffle.
4. If d even: tableLength4 and mirror=true. Otherwise tableLength3 and mirror=false.
5. If rand()%3!=0: allowedPrefix=0 and prefixGrowth=0.1f. Otherwise prefix stays at reset20 and previous prefixGrowth is retained.
6. If rand()%4==0: initialize artefact slot6,type7,(-50,236),upgrade0.
7. If rand()%3==0: initialize **the same slot6** at(150,236),type7,upgrade0. When both branches trigger, the latter overwrites the former; do not create two devices.
8. If rand()%4==0: triple=true and pressure=float32(double(pressure)*0.4).

205 RNG calls total. The JSON's fixed fixture happens to produce an unshuffled table, both artefact calls, and triples; that is not the general behavior.

## Full Power (castle12)

Only duration is random: `27+3d+rand()%40`, one RNG call. Other fields can use the extracted sequential day records.

Base pressureGrowth2, additiveWalkSpeed50+7d, randomWalkSpeedRange5d, initialPressure55+26d. Enemy schedule repeats with d%15; selected entries are overwritten without clearing the full table. In particular phase2 writes first two IDs `[4,0]` but tableLength7, retaining the five1s from phase1. Preserve that weighting. Phase5 doubles additiveWalkSpeed; phase2 doubles pressure; phase13 pressure*=1.4f; phase14 uses only ID1, pressure*=0.5 and giantProbability2.

## Endless Siege and Madness

Both dispatch through `InitLevel(29,dayIndex)` to `InitLevel_Endless`0x37564. `LevelData[29].dayCount` is10000; the name is empty and stored background0 is unused for its random new-game background.

`GoEndlessGame`0x1eb64 sets Player+88=true,+89=false. `GoMadnessGame`0x1eb0c sets both true. Let effective day `d=zeroBasedDayIndex+(madness?7:0)`.

1. Set pressureGrowth2, additiveWalkSpeed20+12d, randomWalkSpeedRange12d.
2. duration=30+5d+rand()%40; initialPressure=55+30d.
3. Let `N = d>10 ? 11 : min(d+1,10)`. Overwrite the firstN enemy table slots with IDs0..N-1 and retain the remainder from prior initialization. Perform100 swaps, each with two rand()%N indices.
4. Set tableLength=4, even when N<4. Fresh player initialization has `[0,0,0,0]` here, so first-day N1 behaves sensibly, but the code really preserves the table tail. This nuance is tested with nonzero tails.
5. If rand()%4==0: allowedPrefix=0 and prefixGrowth=0.1f. Otherwise retain previous prefixGrowth and reset prefix20.
6. If d%15==14: initialize slot6,type7,(-150,236),upgrade0. If d%10==9: initialize the same slot6 at(20,236). The second overwrites the first when both trigger (for example d29).
7. If rand()%4==0: tripleSpawn=true; pressure=float32(double(pressure)*0.33). This differs from Random Skirmish's0.4 multiplier.
8. Copy Player+0x238 into horizontal-mirror flag+0x12c; do not alternate mirroring by day.

203 RNG calls per initializer: one duration,200 swaps,one prefix gate,one triple gate. Then ordinary difficulty scaling applies. Madness's+7 offset affects these formulas; the easy difficulty day≤3 rule still uses the displayed actual day, not effective d.

After initialization, `SetupNewLevel`0x20a54–0x20a6c checks Madness and raises door inventory tier to1 if current tier≤0. This guarantees at least Steel Door each day. At normal difficulty, its base maximum HP is therefore300. The user can still purchase higher tiers normally.

For a new Endless/Madness game, `normalGame::InitMode`0x20e98–0x20ebc chooses `LoadBackground(rand()%4)` once. Ordinary subsequent days do not reroll the background in this function. Initial new-game setup also invokes the selected castle initializer before dispatching the first endless day; preserve original state sequencing when exact RNG-stream reproduction is desired. The formulas above are validated for a supplied RNG stream, not a claim to recover the original seed or complete cross-function RNG consumption.

## Shop and castle

`shop.items` in the JSON is the full23-item catalog, recovered from `shop::InitMode` (0x32cfc). Shop records have stride0x164, name+2, description+0x66, gold cost+0x130, sacrifice cost+0x134, inventory index+0x138, upgrade index+0x160. The source's embedded newlines are preserved in names.

| Inventory index | Upgrade(s) | Gold costs | Sacrifice costs |
|---:|---|---|---|
| 0 | Wooden, Steel, Golden, Magic, Ultimate Door | 500,1000,2000,10000,40000 | 0,0,5,15,30 |
| 1 | Hell Gate | 300 | 0 |
| 2 | Dragon Altar | 1200 | 0 |
| 8 | Small, Medium, Large Boulder | 500,1000,3000 | 5,20,35 |
| 9 | Small, Medium, Large Column | 1000,2000,5000 | 10,20,30 |
| 10 | Small, Medium, Large Fireball, Freezing Bolt | 500,500,500,1500 | 10,20,30,15 |
| 11 | Cannon, Freezer, Flamethrower | 1500,3000,4000 | 0,10,40 |
| 12 | Ballista I, II, III | 2500,4500,8500 | 0,20,50 |

The player starts with Wooden Door tier0 already owned, despite its catalog price. Other inventory entries are-1; gold and sacrifices start0. The UI requires both currencies and disallows purchasing the current selected tier. It does not require the preceding tier. `GoPurchaseItem` (0x31d64) deducts both full listed prices then replaces the inventory tier; no refund/price-difference logic is present.

Restriction bytes hide entire categories when nonzero:

| Player byte | Exact original heading |
|---|---|
| 0x22c | -Door Upgrades- |
| 0x22d | -Sacrificers- |
| 0x22e | -Tower Upgrades 1- |
| 0x22f | -Tower Upgrades 2- |
| 0x230 | -Tower Upgrades 3- |
| 0x231 | -Gun Weapon- |

Restrictions per day are in `disabledShopCategories`. First Encounter disables Sacrificers and provides a free Dragon Altar and Hell Gate. Fireball Frenzy disables all three tower sections and supplies three type5 fireball devices. Machinery and Secret Spells disable Door Upgrades. Explosive Round's restrictions change by day. Other categories stay allowed unless recorded otherwise.

Castle HP from `land::Init` (0x313bc–0x3141c):

```text
maxHP = float32(100+200*doorUpgrade)
if doorUpgrade>3: maxHP *= float32(1.2)
if difficulty==easy: maxHP *= 2
currentHP = maxHP
```

Normal/hard door HP is100,300,500,700,1080; easy200,600,1000,1400,2160. The castle is fully repaired **every day**. The JSON `shop.castleHP` records exact native float results.

Follow-up inventory audit (`probe_campaign_followup.py`, `campaign-inventory.json`) checks all579 daily initializers with nonzero money and purchased equipment. They retain gold, sacrifices and purchases, with one exception: **Secret Spells (castle8) forces door tier1**, at new game and every day, even when a higher tier was supplied. Door purchases are disabled there. This is an unconditional assignment, unlike Madness's minimum-tier rule.

Gold is earned separately from score: creep death adds its base reward to Player+80; `player::KillCreep` scales the score reward easy×1/normal×2/hard×4 and updates total/daily kills. See `enemy-rules.md` for the verified height bonus and kill conditions. A sacrifice increments Player+84 by1; it is not a gold purchase.

No ordinary day-completion currency bonus is present in NextDay, day-transition initialization, or the ordinary inter-level draw path. Keep earned balances between days. On the **terminal** inter-level screen (completed castle or failure), 0x227b0–0x22804 repeatedly subtracts2000 gold if positive and adds2000 score, then subtracts2 sacrifices if positive and adds `difficultyIndex*4000` score. These animation-driven chunks can leave negative balances. This is original legacy behavior, not a recommended new bonus formula.

## Artefact placement and sacrifice scope

Each artefact has stride0x98. Daily JSON `artefactInitializers` records script calls in order; repeated slots overwrite earlier calls. `SetupNewLevel` then applies purchased inventory placements, which can replace a scripted device in the same slot:

| Inventory | Slot | Type | Name | Position | Upgrade argument |
|---:|---:|---:|---|---|---|
| 2 | 0 | 0 | Dragon Altar | 35,30 | inventory tier |
| 1 | 1 | 3 | Hell Gate | 173,210 | inventory tier |
| 8 | 2 | 2 | Boulder | 315,63 | inventory tier |
| 9 | 3 | 4 | Column | 405,38 | inventory tier |
| 10 | 4 | 5 | Fireball/Freezing Bolt | 408,150 | inventory tier |
| 11 | 5 | 6 | Gun | 392,237 | inventory tier×3 |
| 12 | 10 | 8 | Ballista | 432,142 | inventory tier |

The Fireball Frenzy scripted first position is322,63, whereas the purchased Boulder position is315,63; do not normalize the difference. Type7 is the scripted special device used in Secret Spells, Random Skirmish and Explosive Round; its user-facing name is not independently confirmed here.

Dragon Altar(type0) captures via `artefact::ConnectCreep` at0x2d140: it must not be busy; integerized position distance within radius40; squared integer velocity≤122500 (350²); creep+0xd0 (frozen) must be false. The display anchor is artefact(x+85,y+60), with creep vertical distance adjusted by-15 in the check; the effective capture circle center is(120,75) at the standard position. It marks the enemy held/captured. After its dragon animation crosses artefact.x+35, it deactivates the captured active enemy and adds1 sacrifice (0x2eb18–0x2eb68). Capture and currency award are different moments; do not award repeatedly while held. The later independent native boundary/timing probes are documented in `sacrifice-rules.md` and supersede any preliminary sacrifice geometry interpretation here.

Hell Gate(type3) uses the drag-over gate flag (`StylusMove`,0x2d314) then `ThrowCreep`0x2d698 on release. It captures only when the gate flag is true, the device is not busy, and enemy index≥0. `DrawBefore` later launches the sacrificed enemy and adds1 sacrifice at0x2fcd8–0x2fce8. Gate animation/timing and all weapon firing behavior are outside this campaign extraction; an immediate generic sacrifice button would be a replacement mechanic, not the recovered original interaction.

## Remaining boundaries

- Data extraction does not establish complete gameplay fidelity. The intended timer cadence is recovered; actual device timing, floating-point order, input handling, enemy abilities, weapon interactions and visuals still need integration checks.
- Purchased placements and shop prices are recovered; firing/cooldown/damage rules require their own evidence.
- Daily records assume a fresh new game per castle/difficulty and sequential day setup. They do not simulate money, purchases, kills, or frame-driven effects between initializers.
- Original source code was not recovered. All addresses above refer to executable behavior and all raw bytes remain available for verification.
