"""Recover campaign initialization data offline; never shipped in the web game."""
import hashlib
import json
import struct
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from macho import parse
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm_const import (
    UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3,
    UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC,
    UC_ARM_REG_C1_C0_2, UC_ARM_REG_FPEXC,
)

REGS = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
EXPECTED_DAYS = [8, 7, 10, 7, 12, 16, 14, 20, 24, 30, 20, 25]
FLOAT_FIELDS = {
    0x140: "pressureGrowthPerSecond", 0x144: "initialPressure",
    0x148: "additiveWalkSpeed", 0x158: "unknown_0x158",
    0x15c: "allowedEnemyPrefix", 0x160: "forcedSpawnInterval",
    0x164: "hpMultiplierMinusOne", 0x168: "giantProbability",
    0x16c: "nextDayPressureGrowth", 0x170: "nextDayAdditiveWalkSpeed",
    0x174: "nextDayDuration", 0x178: "enemyPrefixGrowthPerSecond",
}
INTEGER_FIELDS = {
    0x14c: "randomWalkSpeedRange", 0x150: "unknown_0x150",
    0x154: "attackRangeOffset", 0x17c: "unknown_0x17c", 0x180: "unknown_0x180",
}
RESTRICTIONS = {
    0x22c: "Door Upgrades", 0x22d: "Sacrificers", 0x22e: "Tower Upgrades 1",
    0x22f: "Tower Upgrades 2", 0x230: "Tower Upgrades 3", 0x231: "Gun Weapon",
}


class Probe:
    def __init__(self, image, meta, random_fixture=123456):
        self.meta = meta
        self.u = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.u.mem_map(0x1000, 0x1ff000)
        self.u.mem_map(0x1000000, 0x100000)
        for seg in meta["segments"]:
            if seg["fileSize"]:
                self.u.mem_write(seg["address"], image[seg["fileOffset"]:seg["fileOffset"] + seg["fileSize"]])
        self.u.reg_write(UC_ARM_REG_C1_C0_2, 0xf << 20)
        self.u.reg_write(UC_ARM_REG_FPEXC, 0x40000000)
        self.random_fixture = random_fixture
        self.random_values = []
        self.imports = Counter()
        self.artefacts = []
        self.u.hook_add(UC_HOOK_CODE, self.hook, begin=0x2ce80, end=0x2ce80)
        self.u.hook_add(UC_HOOK_CODE, self.hook, begin=0xaa0b8, end=0xaa9b8)

    def read(self, addr, size):
        return bytes(self.u.mem_read(addr, size))

    def integer(self, addr):
        return struct.unpack("<i", self.read(addr, 4))[0]

    def floating(self, addr):
        return struct.unpack("<f", self.read(addr, 4))[0]

    def put(self, addr, value):
        self.u.mem_write(addr, struct.pack("<i", value))

    def cstring(self, addr, limit=1024):
        return self.read(addr, limit).split(b"\0", 1)[0]

    def hook(self, uc, address, size, context):
        r = [uc.reg_read(reg) for reg in REGS]
        if address == 0x2ce80:
            base = self.meta["symbols"]["_Artefacts"]
            assert (r[0] - base) % 0x98 == 0
            self.artefacts.append({
                "slot": (r[0] - base) // 0x98,
                "x": struct.unpack("<i", struct.pack("<I", r[1]))[0],
                "y": struct.unpack("<i", struct.pack("<I", r[2]))[0],
                "typeId": r[3],
                "upgradeIndex": self.integer(uc.reg_read(UC_ARM_REG_SP)),
            })
            return  # Observe the real original initializer; do not skip it.
        name = self.meta["imports"].get(address)
        if not name:
            return
        self.imports[name] += 1
        if name == "_rand":
            value = self.random_fixture() if callable(self.random_fixture) else self.random_fixture
            assert 0 <= value <= 0x7fffffff
            self.random_values.append(value)
            uc.reg_write(UC_ARM_REG_R0, value)
        elif name == "_strcpy":
            uc.mem_write(r[0], self.cstring(r[1]) + b"\0")
        elif name in ("___modsi3", "___divsi3"):
            a, b = (struct.unpack("<i", struct.pack("<I", v))[0] for v in r[:2])
            assert b != 0
            q = abs(a) // abs(b) * (-1 if (a < 0) != (b < 0) else 1)
            uc.reg_write(UC_ARM_REG_R0, (a - q * b if name == "___modsi3" else q) & 0xffffffff)
        else:
            raise RuntimeError(f"Unimplemented import {name} at {address:#x}")
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))

    def call(self, address, *args):
        self.u.reg_write(UC_ARM_REG_SP, 0x10f0000)
        self.u.reg_write(UC_ARM_REG_LR, 0x10ff000)
        for reg, value in zip(REGS, (*args, 0, 0, 0, 0)):
            self.u.reg_write(reg, value)
        self.u.emu_start(address, 0x10ff000, count=1000000)
        assert self.u.reg_read(UC_ARM_REG_PC) == 0x10ff000, f"Execution limit at {self.u.reg_read(UC_ARM_REG_PC):#x}"

    def capture_day(self, player, day_index):
        table_length = self.integer(player + 0x1d4)
        assert 1 <= table_length <= 20, table_length
        assert self.integer(player + 0x130) == day_index + 1
        raw = self.read(player + 0x12c, 0x10c)
        base = self.meta["symbols"]["_Artefacts"]
        # Some day branches disable a device after calling its initializer.
        artefacts = [d for d in self.artefacts if self.read(base + d["slot"] * 0x98, 1)[0]]
        for d in {d["slot"]: d for d in artefacts}.values():
            actual = struct.unpack("<4i", self.read(base + d["slot"] * 0x98 + 4, 16))
            assert actual == (d["x"], d["y"], d["typeId"], d["upgradeIndex"]), (d, actual)
        return {
            "dayIndex": day_index,
            "dayNumber": day_index + 1,
            "durationSeconds": self.integer(player + 0x138),
            "tripleSpawn": bool(self.read(player + 0x13c, 1)[0]),
            "mirrorLevel": bool(self.read(player + 0x12c, 1)[0]),
            "enemyTypeTable": list(struct.unpack(f"<{table_length}i", self.read(player + 0x184, 4 * table_length))),
            "floatFields": {f"0x{offset:x}": self.floating(player + offset) for offset in FLOAT_FIELDS},
            "integerFields": {f"0x{offset:x}": self.integer(player + offset) for offset in INTEGER_FIELDS},
            "wave": {name: self.floating(player + offset) for offset, name in FLOAT_FIELDS.items() if not name.startswith("unknown")},
            "enemyModifiers": {name: self.integer(player + offset) for offset, name in INTEGER_FIELDS.items() if not name.startswith("unknown")},
            "restrictionFlags": {f"0x{offset:x}": self.read(player + offset, 1)[0] for offset in range(0x22c, 0x232)},
            "disabledShopCategories": [name for offset, name in RESTRICTIONS.items() if self.read(player + offset, 1)[0]],
            "artefactInitializers": artefacts,
            "rawPlayerBytes_0x12c_to_0x237": raw.hex(),
        }


def recover(image, meta, level, days, difficulty, random_fixture=123456):
    p = Probe(image, meta, random_fixture)
    player = meta["symbols"]["_Player"]
    p.call(0x19b60, player)
    p.put(player + 0x234, level)
    p.put(player + 0x70, difficulty)
    p.call(0x19a88, player)  # Original InitNewGame baseline, including day-index-0 setup.
    result = []
    for day_index in range(days):
        p.call(0x198f0, player)  # SetupNewLevel increments the displayed day first.
        p.artefacts.clear()
        p.call(0x379d4, level, day_index)
        result.append(p.capture_day(player, day_index))
    return result, dict(p.imports)


def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def random10_expected(day, values):
    """Independent translation of InitLevel_10, before difficulty adjustment."""
    assert len(values) == 205
    r = iter(values)
    duration = 30 + day * 4 + next(r) % 40
    table = list(range(6))
    for _ in range(100):
        a, b = next(r) % 6, next(r) % 6
        table[a], table[b] = table[b], table[a]
    staged_prefix = next(r) % 3 != 0
    artefacts = []
    if next(r) % 4 == 0:
        artefacts.append({"slot": 6, "x": -50, "y": 236, "typeId": 7, "upgradeIndex": 0})
    if next(r) % 3 == 0:
        artefacts.append({"slot": 6, "x": 150, "y": 236, "typeId": 7, "upgradeIndex": 0})
    triple = next(r) % 4 == 0
    return {
        "durationSeconds": duration, "tripleSpawn": triple, "mirrorLevel": day % 2 == 0,
        "enemyTypeTable": table[:4 if day % 2 == 0 else 3],
        "artefactInitializers": artefacts,
        "floatFields": {"0x140": 2.0, "0x144": f32((55 + 30 * day) * (0.4 if triple else 1)),
                        "0x148": float(20 + 9 * day), "0x15c": 0.0 if staged_prefix else 20.0},
        "integerFields": {"0x14c": 9 * day},
        "stagedPrefix": staged_prefix,
    }


def endless_expected(day, madness, values, previous_table):
    """Independent translation of InitLevel_Endless, before difficulty."""
    assert len(values) == 203
    effective_day = day + (7 if madness else 0)
    r = iter(values)
    duration = 30 + effective_day * 5 + next(r) % 40
    unlocked = 11 if effective_day > 10 else min(effective_day + 1, 10)
    table = list(previous_table)
    table[:unlocked] = range(unlocked)
    for _ in range(100):
        a, b = next(r) % unlocked, next(r) % unlocked
        table[a], table[b] = table[b], table[a]
    staged_prefix = next(r) % 4 == 0
    artefacts = []
    if effective_day % 15 == 14:
        artefacts.append({"slot": 6, "x": -150, "y": 236, "typeId": 7, "upgradeIndex": 0})
    if effective_day % 10 == 9:
        artefacts.append({"slot": 6, "x": 20, "y": 236, "typeId": 7, "upgradeIndex": 0})
    triple = next(r) % 4 == 0
    return {
        "durationSeconds": duration, "tripleSpawn": triple,
        "enemyTypeTable": table[:4], "artefactInitializers": artefacts,
        "floatFields": {"0x140": 2.0,
                        "0x144": f32((55 + 30 * effective_day) * (0.33 if triple else 1)),
                        "0x148": float(20 + 12 * effective_day),
                        "0x15c": 0.0 if staged_prefix else 20.0},
        "integerFields": {"0x14c": 12 * effective_day},
        "stagedPrefix": staged_prefix,
    }


def validate_endless_rules(image, meta):
    cases = 0
    for seed in (1, 7, 42, 123456):
        for madness in (False, True):
            for mirror in (False, True):
                for day in (0, 1, 2, 7, 9, 10, 11, 14, 22, 29, 1000):
                    p = Probe(image, meta)
                    player = meta["symbols"]["_Player"]
                    p.call(0x19b60, player)
                    p.put(player + 0x130, day + 1)
                    p.put(player + 0x70, 1)
                    p.u.mem_write(player + 0x88, bytes([1, madness]))
                    p.u.mem_write(player + 0x238, bytes([mirror]))
                    # Deliberately nonzero tails test the partial-table writes.
                    previous = [10 - i % 11 for i in range(20)]
                    p.u.mem_write(player + 0x184, struct.pack("<20i", *previous))
                    state = seed
                    def rng():
                        nonlocal state
                        state = (1103515245 * state + 12345) & 0x7fffffff
                        return state
                    p.random_fixture = rng
                    p.random_values.clear()
                    p.artefacts.clear()
                    p.call(0x379d4, 29, day)
                    actual = p.capture_day(player, day)
                    expected = endless_expected(day, madness, p.random_values, previous)
                    for key in ("durationSeconds", "tripleSpawn", "enemyTypeTable", "artefactInitializers"):
                        assert actual[key] == expected[key], (seed, madness, day, key, actual[key], expected[key])
                    for key in ("floatFields", "integerFields"):
                        for field, value in expected[key].items():
                            assert actual[key][field] == value, (seed, madness, day, field, actual[key][field], value)
                    if expected["stagedPrefix"]:
                        assert actual["floatFields"]["0x178"] == f32(0.1)
                    assert actual["mirrorLevel"] == mirror
                    cases += 1
    return {"endlessAndMadnessInputStreamCases": cases}


def validate_random_rules(image, meta):
    """Use diverse input streams; fixtures are not the original libc RNG algorithm."""
    cases = 0
    for seed in (0, 1, 7, 42, 123456, 0x7fffffff):
        for day in (0, 1, 2, 9, 14, 24, 29):
            p = Probe(image, meta)
            player = meta["symbols"]["_Player"]
            p.call(0x19b60, player)
            p.put(player + 0x130, day + 1)
            p.put(player + 0x70, 1)
            state = seed
            def rng():
                nonlocal state
                state = (1103515245 * state + 12345) & 0x7fffffff
                return state
            p.random_fixture = rng
            p.random_values.clear()
            p.artefacts.clear()
            p.call(0x379d4, 9, day)
            actual = p.capture_day(player, day)
            expected = random10_expected(day, p.random_values)
            for key in ("durationSeconds", "tripleSpawn", "mirrorLevel", "enemyTypeTable", "artefactInitializers"):
                assert actual[key] == expected[key], (seed, day, key, actual[key], expected[key])
            for key in ("floatFields", "integerFields"):
                for field, value in expected[key].items():
                    assert actual[key][field] == value, (seed, day, field, actual[key][field], value)
            if expected["stagedPrefix"]:
                assert actual["floatFields"]["0x178"] == f32(0.1)
            cases += 1
    # Level 12 randomizes only duration. Preserve all previous-day table entries
    # by comparing two complete sequential runs instead of isolated initializers.
    a, _ = recover(image, meta, 11, 25, 1, random_fixture=7)
    b, _ = recover(image, meta, 11, 25, 1, random_fixture=123456)
    for day, (left, right) in enumerate(zip(a, b)):
        assert left["durationSeconds"] == 27 + 3 * day + 7 % 40
        assert right["durationSeconds"] == 27 + 3 * day + 123456 % 40
        for key in ("floatFields", "integerFields", "tripleSpawn", "mirrorLevel", "enemyTypeTable", "artefactInitializers"):
            assert left[key] == right[key], (day, key)
        cases += 1
    return {"level10IndependentInputStreamCases": cases - 25, "level12SequentialDayPairs": 25}


def recover_shop(image, meta):
    """Execute data initialization; replace graphics/button/audio setup only."""
    p = Probe(image, meta)
    # Unloaded Surface pointers are irrelevant to item data. Give their null
    # reads a zero page; never use this research memory layout in a game runtime.
    p.u.mem_map(0, 0x1000)
    skipped = (0x1cb44, 0x1d5f4, 0x38164)  # ClearButtons, AddButtonCustom, SwitchSoundtrack
    def skip_ui(uc, address, size, context):
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))
    for address in skipped:
        p.u.hook_add(UC_HOOK_CODE, skip_ui, begin=address, end=address)
    player = meta["symbols"]["_Player"]
    p.call(0x19b60, player)
    p.u.mem_write(player + 0x22c, bytes(6))  # Include every shop section.
    p.call(0x32cfc, 0x140000)
    categories = {0: "Door Upgrades", 1: "Sacrificers", 2: "Sacrificers",
                  8: "Tower Upgrades 1", 9: "Tower Upgrades 2", 10: "Tower Upgrades 3",
                  11: "Gun Weapon", 12: "Roof Weapon"}
    items = []
    for index in range(200):
        address = meta["symbols"]["_ShopItems"] + index * 0x164
        if not p.read(address, 1)[0]:
            continue
        slot = p.integer(address + 0x138)
        row = {"index": index, "inventoryIndex": slot,
               "upgradeIndex": p.integer(address + 0x160), "category": categories[slot],
               "name": p.cstring(address + 2, 100).decode(),
               "description": p.cstring(address + 0x66, 200).decode(),
               "goldCost": p.integer(address + 0x130),
               "sacrificeCost": p.integer(address + 0x134)}
        assert index == slot * 10 + row["upgradeIndex"]
        items.append(row)
    assert len(items) == 23
    # Validate actual purchase accounting for every recovered item, not just
    # string/offset guesses. The UI affordability gate is separately disassembled.
    selection = p.integer(0x31dd4)
    for row in items:
        p.put(player + 0x80, 100000)
        p.put(player + 0x84, 1000)
        p.put(selection, row["inventoryIndex"])
        p.put(selection + 4, row["upgradeIndex"])
        p.call(0x31d64)
        assert p.integer(player + 0x80) == 100000 - row["goldCost"]
        assert p.integer(player + 0x84) == 1000 - row["sacrificeCost"]
        assert p.integer(player + 0x8c + 4 * row["inventoryIndex"]) == row["upgradeIndex"]
    hp = []
    for difficulty in range(3):
        for upgrade in range(5):
            p.put(player + 0x70, difficulty)
            p.put(player + 0x8c, upgrade)
            p.call(0x312b8, meta["symbols"]["_Land"])
            actual = p.floating(meta["symbols"]["_Land"] + 0x290)
            expected = float(100 + 200 * upgrade)
            if upgrade > 3:
                expected = f32(expected * f32(1.2))
            if difficulty == 0:
                expected *= 2
            assert actual == expected
            assert p.floating(meta["symbols"]["_Land"] + 0x28c) == actual
            hp.append({"difficulty": difficulty, "doorUpgradeIndex": upgrade, "maxHP": actual})
    return {
        "sourceFunctions": {"initialize": "0x32cfc", "purchase": "0x31d64", "castleInit": "0x312b8"},
        "skippedNonDataFunctions": [hex(a) for a in skipped],
        "validation": {"purchaseCases": len(items), "castleHPCases": len(hp)},
        "initialPlayer": {"gold": 0, "sacrifices": 0, "doorUpgradeIndex": 0, "otherInventoryUpgrades": -1},
        "purchaseRule": "Require both currencies and chosen tier != current tier; deduct full listed prices; replace inventory[inventoryIndex] with upgradeIndex. No preceding-tier requirement in original UI.",
        "castleHP": hp,
        "items": items,
        "purchasedArtefactPlacements": [
            {"inventoryIndex": 2, "slot": 0, "typeId": 0, "name": "Dragon Altar", "x": 35, "y": 30},
            {"inventoryIndex": 1, "slot": 1, "typeId": 3, "name": "Hell Gate", "x": 173, "y": 210},
            {"inventoryIndex": 8, "slot": 2, "typeId": 2, "name": "Boulder", "x": 315, "y": 63},
            {"inventoryIndex": 9, "slot": 3, "typeId": 4, "name": "Column", "x": 405, "y": 38},
            {"inventoryIndex": 10, "slot": 4, "typeId": 5, "name": "Fireball / Freezing Bolt", "x": 408, "y": 150},
            {"inventoryIndex": 11, "slot": 5, "typeId": 6, "name": "Gun Weapon", "x": 392, "y": 237, "upgradeMultiplier": 3},
            {"inventoryIndex": 12, "slot": 10, "typeId": 8, "name": "Ballista", "x": 432, "y": 142},
        ],
    }


def main():
    image = (ROOT / "research/Knights").read_bytes()
    meta = parse(image)
    validation = validate_random_rules(image, meta)
    validation.update(validate_endless_rules(image, meta))
    shop = recover_shop(image, meta)
    p = Probe(image, meta)
    p.call(0x19b60, meta["symbols"]["_Player"])
    levels = []
    for index in range(12):
        address = meta["symbols"]["_LevelData"] + index * 244
        count = p.integer(address + 0xe0)
        assert count == EXPECTED_DAYS[index]
        row = {
            "index": index, "number": index + 1,
            "name": p.cstring(address + 12, 200).decode("utf-8"),
            "mapPosition": [p.integer(address + 4), p.integer(address + 8)],
            "backgroundId": p.integer(address + 0xdc),
            "dayCount": count,
            "rawLevelData": p.read(address, 244).hex(),
            "difficulties": {},
        }
        for difficulty, label in enumerate(("easy", "normal", "hard")):
            days, imports = recover(image, meta, index, count, difficulty)
            row["difficulties"][label] = {"value": difficulty, "days": days, "externalCalls": imports}
        reference, _ = recover(image, meta, index, count, 1, random_fixture=7)
        normal = row["difficulties"]["normal"]["days"]
        row["randomFixtureChangesDailyRecords"] = reference != normal
        row["recordKind"] = "random-fixture-snapshot" if row["randomFixtureChangesDailyRecords"] else "deterministic-initializer-result"
        levels.append(row)
    data = {
        "source": {"binary": "research/Knights", "sha256": hashlib.sha256(image).hexdigest(),
                   "method": "Offline execution of original ARM initialization functions with native Unicorn; no emulator in delivered game",
                   "randomFixture": 123456, "comparisonRandomFixture": 7,
                   "caveat": "Levels 10 and 12 use RNG. Their daily records are fixture snapshots; use the documented random rules for production. Extraction does not simulate gameplay or shop purchases between days.",
                   "functions": {"playerInit": "0x19b60", "initNewGame": "0x19a88", "nextDay": "0x198f0", "initLevel": "0x379d4", "artefactInit": "0x2ce80"}},
        "totalCampaignDays": sum(EXPECTED_DAYS),
        "fieldSchema": {"floatFields": {hex(k): v for k, v in FLOAT_FIELDS.items()},
                        "integerFields": {hex(k): v for k, v in INTEGER_FIELDS.items()},
                        "restrictionFlags": {hex(k): v for k, v in RESTRICTIONS.items()}},
        "validation": validation,
        "timing": {
            "timerIntervalSeconds": struct.unpack_from("<d", image, 0x4e54 - 0x1000)[0],
            "timerSource": "applicationDidFinishLaunching 0x4ddc-0x4de4; scheduledTimerWithTimeInterval selector; renderScene callback",
            "dtRule": "paused ? 0 : min(float32(now-lastTime), float32(0.05))",
            "dtSource": "renderScene 0x5210-0x5250; float literals at0x52f8/0x52fc",
            "waveCallsPerTimerCallback": 1, "waveThrottleCalls": 10,
            "gameplayOrder": ["wave.ProcessWave", "artefacts.Process then DrawBefore", "powerups", "artefacts.DrawProcessCustom", "missiles.Process", "creeps.Process", "dragObjects.Process", "land.Process"],
            "orderSource": "DrawNormalGame 0x6ee0-0x6f60; DrawArtefacts 0x3010c; DrawArtefactsAfter 0x2eee8",
            "caveat": "Nominal60Hz repeating NSTimer, not guaranteed actual delivery frequency on old devices. Original uses variable delta capped0.05; fixed60Hz is a deliberate modern engine choice."
        },
        "shop": shop,
        "randomRules": {
            "10": {"function": "0x372ac", "dayIndex": "zero-based",
                   "randomCallsPerInitializer": 205,
                   "durationSeconds": "30 + 4*dayIndex + rand()%40",
                   "pressureGrowthPerSecond": 2, "initialPressure": "55 + 30*dayIndex",
                   "additiveWalkSpeed": "20 + 9*dayIndex", "randomWalkSpeedRange": "9*dayIndex",
                   "enemyTable": "Initialize [0,1,2,3,4,5]; perform 100 swaps at two independent rand()%6 indices per swap; use first 4 on even dayIndex or first 3 on odd dayIndex",
                   "mirrorLevel": "dayIndex%2 == 0",
                   "postShuffleRandomCallsInOrder": [
                       "If rand()%3 != 0: allowedEnemyPrefix=0; enemyPrefixGrowthPerSecond=0.1f; otherwise retain prefix growth and reset prefix20",
                       "If rand()%4 == 0: Init artefact slot6,type7,(-50,236),upgrade0",
                       "If rand()%3 == 0: Init SAME artefact slot6,type7,(150,236),upgrade0; overwrites preceding placement when both trigger",
                       "If rand()%4 == 0: tripleSpawn=true; initialPressure=float32(double(initialPressure)*0.4)"
                   ]},
            "12": {"function": "0x36340", "dayIndex": "zero-based", "randomCallsPerInitializer": 1,
                   "durationSeconds": "27 + 3*dayIndex + rand()%40",
                   "nonrandomFields": "Use extracted daily records, which retain enemy-table entries left untouched by partial original writes"},
            "endlessAndMadness": {"function": "0x37564", "dispatchLevelIndex": 29,
                   "originalTotalDayCount": p.integer(meta["symbols"]["_LevelData"] + 29 * 244 + 0xe0),
                   "effectiveDay": "zeroBasedDayIndex + (madness ? 7 : 0)",
                   "randomCallsPerInitializer": 203,
                   "durationSeconds": "30 + 5*effectiveDay + rand()%40",
                   "pressureGrowthPerSecond": 2, "initialPressure": "55 + 30*effectiveDay",
                   "additiveWalkSpeed": "20 + 12*effectiveDay", "randomWalkSpeedRange": "12*effectiveDay",
                   "enemyTable": "N=effectiveDay>10 ? 11 : min(effectiveDay+1,10). Overwrite first N slots with0..N-1; preserve tail. Perform100 random swaps within first N using two rand()%N per swap. Then tableLength=4 even if N<4.",
                   "postShuffleRandomCallsInOrder": [
                       "If rand()%4==0: allowedEnemyPrefix=0; enemyPrefixGrowthPerSecond=0.1f. Otherwise retain prefix growth and reset prefix20.",
                       "If effectiveDay%15==14: Init slot6,type7,(-150,236),upgrade0. If effectiveDay%10==9: Init SAME slot6 at(20,236), overwriting prior placement.",
                       "If rand()%4==0: tripleSpawn=true; initialPressure=float32(double(initialPressure)*0.33)."
                   ],
                   "mirrorLevel": "Player+0x238 preference copied to mirror flag every initializer",
                   "madnessDoorRule": "SetupNewLevel0x20a54-0x20a6c raises inventory door tier to1 when currently<=0",
                   "newGameBackground": "normalGame::InitMode0x20e98-0x20ebc chooses rand()%4 once for an endless/madness new game"
            }
        },
        "levels": levels,
    }
    output = ROOT / "research/campaign-data.json"
    output.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(output), "levels": len(levels), "daysPerDifficulty": sum(EXPECTED_DAYS),
                      "names": [r["name"] for r in levels],
                      "randomDependentLevels": [r["number"] for r in levels if r["randomFixtureChangesDailyRecords"]]}, indent=2))
    print(json.dumps({"validation": validation}))
    print(json.dumps({"shopValidation": shop["validation"]}))


if __name__ == "__main__":
    main()
