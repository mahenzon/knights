"""Probe bounded original ARM enemy functions; research only, not a game runtime."""
import hashlib
import json
from pathlib import Path
import struct
import sys

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm_const import *

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from macho import parse

ROOT = Path(__file__).resolve().parents[1]
IMAGE = (ROOT / "research/Knights").read_bytes()
META = parse(IMAGE)
REGS = [UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3]
SELF, STACK, RETURN = 0x1000000, 0x10F0000, 0x10FF000
NAMES = ["knight_lite", "horserider", "exploman", "darkknight", "catapult",
         "ballista", "wizard", "assasin", "jumper", "frog", "bigbarrel"]


def f32(value):
    return struct.unpack("<I", struct.pack("<f", value))[0]


class Probe:
    def __init__(self):
        self.u = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.u.mem_map(0x1000, 0x1FF000)
        self.u.mem_map(0x1000000, 0x100000)
        for segment in META["segments"]:
            if segment["fileSize"]:
                self.u.mem_write(segment["address"], IMAGE[segment["fileOffset"]:segment["fileOffset"] + segment["fileSize"]])
        self.u.reg_write(UC_ARM_REG_C1_C0_2, 0xF << 20)
        self.u.reg_write(UC_ARM_REG_FPEXC, 0x40000000)
        self.u.hook_add(UC_HOOK_CODE, self.import_hook, begin=0xAA0B8, end=0xAA9B8)
        self.effects = []
        for address in (0x37BA8, 0x29ED4, 0x27534, 0x2D4B4):
            self.u.hook_add(UC_HOOK_CODE, self.effect_hook, begin=address, end=address)

    def import_hook(self, u, address, size, context):
        name = META["imports"].get(address)
        if not name:
            raise RuntimeError(f"Unexpected import address {address:x}")
        if name == "_rand":
            u.reg_write(UC_ARM_REG_R0, 123456)
        elif name == "___modsi3":
            u.reg_write(UC_ARM_REG_R0, u.reg_read(UC_ARM_REG_R0) % u.reg_read(UC_ARM_REG_R1))
        elif name == "_strcpy":
            source = u.reg_read(UC_ARM_REG_R1)
            data = bytes(u.mem_read(source, 500)).split(b"\0")[0] + b"\0"
            u.mem_write(u.reg_read(UC_ARM_REG_R0), data)
        else:
            raise RuntimeError(f"Unimplemented import {name}")
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def effect_hook(self, u, address, size, context):
        self.effects.append({"address": hex(address), "args": [u.reg_read(r) for r in REGS]})
        if address == 0x29ED4:
            u.reg_write(UC_ARM_REG_R0, 0)
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def call(self, address, args, stack=()):
        u = self.u
        u.reg_write(UC_ARM_REG_SP, STACK)
        u.reg_write(UC_ARM_REG_LR, RETURN)
        for reg, value in zip(REGS, args):
            u.reg_write(reg, value & 0xFFFFFFFF)
        for index, value in enumerate(stack):
            u.mem_write(STACK + 4 * index, struct.pack("<I", value))
        u.emu_start(address, RETURN, count=1000000)
        assert u.reg_read(UC_ARM_REG_PC) == RETURN, "Instruction limit reached"

    def put(self, offset, value, kind="f"):
        self.u.mem_write(SELF + offset, struct.pack("<" + kind, value))

    def get(self, offset, kind="f"):
        return struct.unpack("<" + kind, self.u.mem_read(SELF + offset, struct.calcsize(kind)))[0]

    def init(self, kind, elite=False):
        self.u.mem_write(SELF, bytes(256))
        self.call(0x25800, [SELF, 100, 240, kind], [int(elite), f32(0)])
        return {hex(offset): self.get(offset, fmt) for offset, fmt in (
            (0x08, "f"), (0x0C, "f"), (0x10, "f"), (0x48, "i"),
            (0x54, "f"), (0x58, "f"), (0x5C, "f"), (0x60, "f"), (0x64, "f"),
            (0x68, "f"), (0x6C, "f"), (0x70, "f"), (0x74, "f"), (0x78, "f"), (0x7C, "f"), (0x80, "f"),
            (0x88, "i"), (0x8C, "i"), (0x90, "i"), (0x94, "f"),
            (0xAC, "i"), (0xB0, "f"), (0xBC, "f"), (0xC0, "f"), (0xC4, "f"),
            (0xC8, "B"), (0xD4, "i"), (0xD8, "i"), (0xE0, "f"), (0xEC, "B"),
            (0xF4, "f"), (0xF8, "f"), (0xFE, "B"))}


def main():
    p = Probe()
    p.call(0x19B60, [META["symbols"]["_Player"]])
    player = META["symbols"]["_Player"]
    for offset in (0x148, 0x14C, 0x154, 0x164):
        p.u.mem_write(player + offset, bytes(4))
    records = [{"type": kind, "sprite_prefix": NAMES[kind], "base_fields": p.init(kind),
                "elite_fields": p.init(kind, True)} for kind in range(11)]
    for record in records:
        fields = record["base_fields"]
        record["base_stats"] = {"hp": fields["0x94"], "walk_speed": fields["0x88"],
                "castle_hit_damage": fields["0x90"], "base_kill_reward": fields["0xd8"],
                "pickup_radius": int(fields["0xac"] ** 0.5), "animation_fps": fields["0x54"],
                "attack_range_offset": fields["0xc4"], "attack_cooldown": fields["0xf4"],
                "gravity": fields["0xb0"], "drag_mass": fields["0xc0"], "render_scale": fields["0xf8"]}
        record["animation_frame_limits"] = [fields[hex(0x58 + 4 * state)] for state in range(11)]
    p.init(0)
    p.put(0x1C, 1000); p.put(0x20, -1000)
    p.call(0x25740, [SELF])
    limit = [p.get(0x1C), p.get(0x20)]
    assert limit == [900.0, -900.0], limit

    p.init(0); p.effects.clear()
    p.call(0x27C44, [SELF, 600])
    zero_survives = p.get(0x94) == 0 and not p.effects
    p.call(0x27C44, [SELF, 1])
    negative_dies = p.get(0x94) == -1 and any(e["address"] == "0x27534" for e in p.effects)
    assert zero_survives and negative_dies

    p.init(9); p.put(0xAA, 1, "B"); p.effects.clear()
    p.call(0x27C44, [SELF, 999])
    frog_immunity = {"hp": p.get(0x94), "immunity_remaining": p.get(0xAA, "B"), "stun": p.get(0xB8)}
    assert frog_immunity == {"hp": 300, "immunity_remaining": 0, "stun": -1}

    p.init(0); p.put(0x08, 100); p.put(0x0C, 100)
    p.put(0x1C, 100); p.put(0x20, -200); p.put(0xA9, 1, "B"); p.put(0x88, 0, "i")
    p.call(0x283EC, [SELF, f32(0.1)])
    flight = {"x": p.get(8), "y": p.get(12), "vx": p.get(0x1C), "vy": p.get(0x20)}
    assert flight == {"x": 110, "y": 90, "vx": 100, "vy": -100}, flight

    p.init(0); p.put(0x0C, 243); p.put(0x20, 700)
    p.put(0xA9, 1, "B"); p.put(0x88, 0, "i"); p.effects.clear()
    p.call(0x283EC, [SELF, f32(0.01)])
    impact = {"hp": p.get(0x94), "ground_y": p.get(12), "stun": p.get(0xB8),
              "death_called": any(e["address"] == "0x27534" for e in p.effects)}
    assert impact["hp"] == -110 and impact["death_called"], impact

    abilities = []
    for kind in (1, 6, 7, 8, 9):
        p.init(kind); p.put(0xE0, -1)
        p.call(0x2720C, [SELF, f32(0.1)])
        abilities.append({"type": kind, "walk_speed": p.get(0x88, "i"), "animation": p.get(0x50, "i"),
                          "vx": p.get(0x1C), "vy": p.get(0x20), "duration": p.get(0xE8),
                          "first_hit_immune": p.get(0xAA, "B")})
    assert abilities[0]["walk_speed"] == 210
    assert abilities[1]["animation"] == 10 and abilities[1]["duration"] == 6
    assert abilities[2]["duration"] == 6
    assert (abilities[3]["vx"], abilities[3]["vy"]) == (200, -500)
    assert (abilities[4]["vx"], abilities[4]["vy"]) == (40, -546)

    p.init(0); p.put(0x1C, 100); p.put(0x20, -100)
    p.put(0xA0, 100, "i"); p.put(0xA4, 214, "i")
    p.call(0x26378, [SELF])
    release = {"vx": p.get(0x1C), "vy": p.get(0x20)}
    assert release == {"vx": 100, "vy": -220}, release

    result = {"source_sha256": hashlib.sha256(IMAGE).hexdigest(),
              "method": "Bounded Unicorn execution of creep::Init; _rand=123456; player difficulty modifiers zeroed; no original OS calls",
              "field_schema": {"0x54": "animation_fps", "0x88": "current_walk_speed", "0x8c": "base_walk_speed",
                               "0x90": "castle_hit_damage", "0x94": "hp", "0xac": "pickup_radius_squared",
                               "0xb0": "gravity", "0xbc": "alpha", "0xc0": "drag_mass",
                               "0xc4": "attack_range_offset", "0xd4": "sprite_anchor_height", "0xd8": "base_kill_reward",
                               "0xe0": "ability_delay", "0xec": "ability_finished_or_disabled",
                               "0xf4": "attack_cooldown", "0xf8": "render_scale"},
              "records": records, "probes": {"velocity_limit": limit, "zero_hp_survives": zero_survives,
                    "negative_hp_dies": negative_dies, "frog_first_hit_immunity": frog_immunity,
                    "flight_0_1_seconds": flight, "ground_impact_0_01_seconds": impact,
                    "ability_activation": abilities, "release_velocity": release}}
    (ROOT / "research/enemy-data.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
