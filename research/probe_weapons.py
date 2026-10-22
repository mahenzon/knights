"""Bounded original ARM weapon research. Never used by the delivered game."""
import hashlib
import json
import math
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3, UC_ARM_REG_PC, UC_ARM_REG_LR, UC_ARM_REG_SP
from extract_enemies import Probe, META, IMAGE, REGS, ROOT, SELF, f32

ART = SELF + 0x1000
DRAG = META["symbols"]["_DragObjects"]
MISSILE = META["symbols"]["_Missiles"]
CREEP = META["symbols"]["_Creeps"]
ARTIFACTS = META["symbols"]["_Artefacts"]


class WeaponProbe(Probe):
    def __init__(self):
        super().__init__()
        self.u.mem_map(0, 4096)
        self.log_calls = []
        self.capture_splash = True
        self.real_creep_death = False
        for address in (0x18E10, 0x1A090, 0x31A7C, 0x7BF4, 0x7FEC, 0x8188, 0x19304, 0x28C70):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)
        for address in (0x26B3C, 0x27CC4, 0x1ADEC, 0x27C44, 0x308E8):
            self.u.hook_add(UC_HOOK_CODE, self.record, begin=address, end=address)
        self.call(0x19B60, [META["symbols"]["_Player"]])

    def ignore(self, u, address, size, context):
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def effect_hook(self, u, address, size, context):
        if address == 0x29ED4 or (address == 0x27534 and self.real_creep_death):
            return
        super().effect_hook(u, address, size, context)

    def record(self, u, address, size, context):
        self.log_calls.append({"address": hex(address), "args": [u.reg_read(r) for r in REGS],
                               "stack": list(struct.unpack("<8I", u.mem_read(u.reg_read(UC_ARM_REG_SP), 32)))})
        if address == 0x308E8 or (self.capture_splash and address in (0x26B3C, 0x27CC4)):
            self.ignore(u, address, size, context)

    def import_hook(self, u, address, size, context):
        name = META["imports"].get(address, "")
        if name.startswith("_gl"):
            self.ignore(u, address, size, context)
            return
        if name in ("_sin", "_cos", "_atan2", "_sqrt", "_pow"):
            a = struct.unpack("<d", struct.pack("<II", u.reg_read(UC_ARM_REG_R0), u.reg_read(UC_ARM_REG_R1)))[0]
            b = struct.unpack("<d", struct.pack("<II", u.reg_read(UC_ARM_REG_R2), u.reg_read(UC_ARM_REG_R3)))[0]
            answer = {"_sin": lambda: math.sin(a), "_cos": lambda: math.cos(a),
                      "_atan2": lambda: math.atan2(a, b), "_sqrt": lambda: math.sqrt(a),
                      "_pow": lambda: math.pow(a, b)}[name]()
            lo, hi = struct.unpack("<II", struct.pack("<d", answer))
            u.reg_write(UC_ARM_REG_R0, lo); u.reg_write(UC_ARM_REG_R1, hi)
            self.ignore(u, address, size, context)
            return
        super().import_hook(u, address, size, context)

    def read(self, base, offset, kind="f"):
        return struct.unpack("<" + kind, self.u.mem_read(base + offset, struct.calcsize(kind)))[0]

    def write(self, base, offset, value, kind="f"):
        self.u.mem_write(base + offset, struct.pack("<" + kind, value))

    def fields(self, base, schema):
        return {name: self.read(base, offset, kind) for name, offset, kind in schema}

    def art(self, kind, upgrade=0, x=392, y=237):
        self.u.mem_write(ART, bytes(0x98))
        self.call(0x2CE80, [ART, x, y, kind], [upgrade])

    def drag(self, kind, upgrade=0, x=200, y=100):
        self.u.mem_write(DRAG, bytes(0x74))
        self.call(0x29BB0, [DRAG, x, y, kind], [upgrade])

    def enemy(self, kind=0, x=200, y=200):
        self.u.mem_write(CREEP, bytes(256 * 200))
        self.init(kind)
        self.u.mem_write(CREEP, bytes(self.u.mem_read(SELF, 256)))
        self.write(CREEP, 8, x); self.write(CREEP, 12, y)

    def missile(self, kind=0, upgrade=0, x=200, y=200, vx=0, vy=0):
        self.u.mem_write(MISSILE, bytes(500 * 100))
        self.call(0x1AB18, [MISSILE, x, y, 0], [vx & 0xFFFFFFFF, vy & 0xFFFFFFFF, 0, f32(20), f32(0), kind, upgrade])


ART_SCHEMA = [("type", 0xC, "i"), ("upgrade", 0x10, "i"), ("anchor_dx", 0x14, "i"),
              ("anchor_dy", 0x18, "i"), ("radius", 0x1C, "i"), ("cooldown", 0x24, "f"),
              ("gun_subtype", 0x88, "i")]
DRAG_SCHEMA = [("type", 8, "i"), ("upgrade", 0x68, "i"), ("lifetime", 0x10, "f"),
               ("gravity", 0x14, "f"), ("x", 0x18, "f"), ("y", 0x1C, "f"),
               ("vx", 0x20, "f"), ("vy", 0x24, "f"), ("unknown28", 0x28, "f"),
               ("unknown2c", 0x2C, "f"), ("ground_y", 0x38, "i"), ("radius", 0x40, "i"),
               ("counter", 0x5C, "i"), ("scale", 0x6C, "f"), ("follow_rate", 0x70, "f")]
MISSILE_SCHEMA = [("type", 0x1C, "i"), ("x", 4, "f"), ("y", 8, "f"), ("z", 12, "f"),
                  ("vx", 0x20, "f"), ("vy", 0x24, "f"), ("vz", 0x28, "f"),
                  ("arg_float1", 0x54, "f"), ("age", 0x58, "f"), ("direct_damage", 0x8C, "i"),
                  ("piercing", 0x90, "B"), ("negative_gravity", 0x94, "f"), ("lifetime", 0x98, "f"),
                  ("upgrade", 0x1F0, "i")]


def decoded_call(call):
    values = call["args"] + call["stack"]
    if call["address"] == "0x26b3c":
        return {"function": "CreepExplode", "x": values[0], "y": values[1],
                "impulse_factor": struct.unpack("<f", struct.pack("<I", values[2]))[0],
                "radius": values[3], "extra_floats": [struct.unpack("<f", struct.pack("<I", v))[0] for v in values[4:6]]}
    if call["address"] == "0x27cc4":
        return {"function": "CreepHitSplash", "x": values[0], "y": values[1],
                "damage": struct.unpack("<f", struct.pack("<I", values[2]))[0],
                "radius": values[3], "effect_type": values[4] if values[4] < 0x80000000 else values[4] - 0x100000000}
    if call["address"] == "0x27c44":
        return {"function": "creep::Hit", "creep_index": (values[0] - CREEP) // 256, "damage": values[1]}
    if call["address"] == "0x308e8":
        return {"function": "land::HitCastle", "damage": values[1]}
    return call


def mechanics(p):
    result = {}
    # Hold a charging fireball, then release. Charge is Manhattan pointer travel with linear decay.
    p.drag(2); p.art(5)
    p.write(ART, 0x34, 1, "B"); p.write(ART, 0x30, 0, "i")
    p.write(DRAG, 3, 1, "B"); p.write(DRAG, 0x30, 300); p.write(DRAG, 0x34, 100)
    p.write(DRAG, 0x60, 500)
    p.call(0x2C4E4, [DRAG, f32(0.1)])
    charge = p.fields(DRAG, DRAG_SCHEMA)
    charge["travel_charge"] = p.read(DRAG, 0x60)
    p.call(0x2D7E0, [ART, 300, 100, -1])
    released = p.fields(DRAG, DRAG_SCHEMA)
    assert abs(released["vx"] - 420) < 0.01 and abs(released["vy"]) < 0.01
    result["fireball_hold_0_1_seconds_and_release"] = {"held": charge, "released": released}

    explosions = []
    for level in range(4):
        p.enemy(x=450, y=250); p.drag(2, level, x=100, y=200)
        p.log_calls.clear()
        p.call(0x2A030, [DRAG])
        explosions.append({"upgrade": level, "calls": [decoded_call(c) for c in p.log_calls],
                            "active_after": p.read(DRAG, 0, "B"), "counter": p.read(DRAG, 0x5C, "i"),
                            "vy": p.read(DRAG, 0x24), "gravity": p.read(DRAG, 0x14),
                            "enemy_350px_away_freeze_timer": p.read(CREEP, 0xCC),
                            "enemy_350px_away_frozen": p.read(CREEP, 0xD0, "B")})
    result["fireball_death_at_initial_charge"] = explosions

    hit_probes = []
    for kind in range(4):
        p.enemy(x=200, y=200); p.missile(kind)
        p.write(MISSILE, 0x94, 0)
        p.log_calls.clear()
        hp = []
        for _ in range(2):
            if p.read(MISSILE, 0, "B"):
                p.call(0x1B75C, [MISSILE, f32(1/60)])
            hp.append(p.read(CREEP, 0x94))
        hit_probes.append({"type": kind, "hp_after_each_tick": hp, "burning": p.read(CREEP, 4, "B"),
                           "freeze_timer": p.read(CREEP, 0xCC), "frozen": p.read(CREEP, 0xD0, "B"),
                           "calls": [decoded_call(c) for c in p.log_calls]})
    result["missile_contact_two_ticks"] = hit_probes

    # Ground explosion and generic death are distinct, and can both apply for upgraded ballista.
    impacts = []
    for kind, upgrade in ((0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (3, 2)):
        p.u.mem_write(CREEP, bytes(256 * 200)); p.missile(kind, upgrade, y=271)
        p.write(MISSILE, 0x94, 0); p.log_calls.clear()
        p.call(0x1B75C, [MISSILE, f32(1/60)])
        impacts.append({"type": kind, "upgrade": upgrade, "alive": p.read(MISSILE, 0, "B"),
                        "calls": [decoded_call(c) for c in p.log_calls]})
    result["missile_y271"] = impacts

    # Verify CreepExplode rather than infer its falloff and randomization from weapon call sites.
    p.capture_splash = False
    impulse = []
    for x, y in ((200, 240), (250, 240), (300, 240), (200, 290), (420, 290)):
        p.enemy(x=x, y=y)
        p.call(0x26B3C, [200, 290, f32(1.7), 220], [f32(0), f32(5)])
        impulse.append({"creep": [x, y], "vx": p.read(CREEP, 0x1C), "vy": p.read(CREEP, 0x20),
                        "flying": p.read(CREEP, 0xA9, "B")})
    result["cannon_explosion_impulse"] = impulse
    p.capture_splash = True
    assert hit_probes[1]["hp_after_each_tick"] == [300, 0]
    assert hit_probes[2]["freeze_timer"] == 3.5
    assert explosions[3]["enemy_350px_away_freeze_timer"] == 4.5
    assert explosions[1]["active_after"] == explosions[2]["active_after"] == 1
    return result


def boundaries(p):
    result = {}
    presses = []
    for kind, radius, inclusive in ((2, 40, True), (4, 50, False), (5, 42, True), (6, 50, False), (8, 42, False)):
        for radial_offset, should_work in ((radius-1, True), (radius, inclusive), (radius+1, False)):
            p.art(kind); p.u.mem_write(DRAG, bytes(0x74 * 30))
            p.write(ART, 0x28, p.read(ART, 0x24))
            cx = p.read(ART, 4, "i") + p.read(ART, 0x14, "i")
            cy = p.read(ART, 8, "i") + p.read(ART, 0x18, "i")
            if kind == 8:
                cy -= 36
            p.call(0x2E084, [ART, cx + radial_offset, cy])
            pressed = bool(p.read(ART, 0x34, "B"))
            assert pressed == should_work, (kind, radial_offset, pressed)
            presses.append({"type": kind, "distance": radial_offset, "pressed": pressed})
    result["artifact_press_circle"] = presses
    aims = []
    for kind in (6, 8):
        for pointer in ((200, 0), (200, 500), (1000, 237)):
            p.art(kind); p.write(ART, 0x34, 1, "B")
            p.call(0x2D254, [ART, *pointer, -1])
            aims.append({"type": kind, "pointer": list(pointer), "angle": p.read(ART, 0x38)})
    result["aim_clamps"] = aims
    p.capture_splash = False
    splashes = []
    for distance in (129, 130, 131):
        p.enemy(x=200 + distance, y=200)
        p.call(0x27CC4, [200, 200, f32(50), 130], [0xFFFFFFFF])
        hp = p.read(CREEP, 0x94)
        assert hp == (550 if distance < 130 else 600)
        splashes.append({"distance": distance, "hp": hp})
    result["splash_radius"] = splashes
    freeze = []
    for distance in (14399, 14400, 14401):
        p.enemy(x=200 + distance, y=200); p.drag(2, 3, x=200, y=200)
        p.call(0x2A030, [DRAG])
        frozen = bool(p.read(CREEP, 0xD0, "B"))
        assert frozen == (distance < 14400)
        freeze.append({"distance": distance, "frozen": frozen})
    result["freezing_bolt_radius_bug"] = freeze
    p.capture_splash = True
    impact = []
    for kind, upgrade, y in ((0, 0, 284), (0, 0, 285), (0, 0, 286), (3, 2, 269), (3, 2, 270), (3, 2, 271)):
        p.u.mem_write(CREEP, bytes(256 * 200)); p.missile(kind, upgrade, y=y)
        p.write(MISSILE, 0x94, 0); p.log_calls.clear()
        p.call(0x1B75C, [MISSILE, f32(1/60)])
        impact.append({"type": kind, "upgrade": upgrade, "y": y, "alive": bool(p.read(MISSILE, 0, "B")),
                       "calls": [decoded_call(c) for c in p.log_calls]})
    result["missile_ground"] = impact
    column = []
    for level in range(3):
        p.drag(1, level, y=-70)
        p.call(0x2C4E4, [DRAG, f32(1/60)])
        assert p.read(DRAG, 0x1C) == -45
        p.call(0x28FDC, [DRAG, 200, 10])
        p.call(0x291B0, [DRAG, 200, 100])
        drag_vy = p.read(DRAG, 0x24)
        assert drag_vy == 900, drag_vy
        impacts_to_finished = 0
        while not p.read(DRAG, 0x58, "B"):
            p.write(DRAG, 0x1C, 170); p.write(DRAG, 0x24, 500)
            p.call(0x2AE54, [DRAG, f32(1/60)])
            impacts_to_finished += 1
            assert impacts_to_finished <= 4
        assert impacts_to_finished == level + 2
        column.append({"tier": level, "pointer_delta_y": 90, "vy": drag_vy, "impacts_to_finished": impacts_to_finished})
    result["column_drag_and_bounces"] = column
    return result


def enemy_projectiles(p):
    result = {"initializers": [], "attack_spawns": [], "castle_boundaries": [], "ground_bounces": [], "platform": []}
    for kind in (4, 5, 6, 7, 11, 12):
        p.drag(kind)
        result["initializers"].append(p.fields(DRAG, DRAG_SCHEMA))
    for kind, expected_drag in ((2, 4), (4, 5), (5, 7), (6, 6)):
        p.enemy(kind, x=100, y=240)
        p.u.mem_write(DRAG, bytes(116 * 30))
        p.call(0x28010, [CREEP])
        fields = p.fields(DRAG, DRAG_SCHEMA)
        fields["skip_global_input"] = bool(p.read(DRAG, 0x64, "B"))
        assert fields["type"] == expected_drag
        result["attack_spawns"].append({"enemy_type": kind, "projectile": fields})
    for kind, threshold, damage in ((4, 390, 25), (5, 373, 15), (6, 355, 2), (7, 344, 20)):
        for x in (threshold-1, threshold, threshold+1):
            p.drag(kind, x=x, y=100)
            if kind == 7:
                p.write(DRAG, 0x30, threshold)
            p.log_calls.clear()
            p.call(0x2AE54, [DRAG, f32(1/60)])
            hits = [decoded_call(c) for c in p.log_calls if c["address"] == "0x308e8"]
            assert hits == ([{"function": "land::HitCastle", "damage": damage}] if x > threshold else []), (kind, x, hits)
            result["castle_boundaries"].append({"type": kind, "threshold": threshold, "x": x, "calls": [decoded_call(c) for c in p.log_calls],
                                                "active": bool(p.read(DRAG, 0, "B")), "after_x": p.read(DRAG, 0x18)})
    for kind in (4, 5):
        p.drag(kind, x=200, y=259); p.write(DRAG, 0x24, 500)
        p.call(0x2AE54, [DRAG, f32(1/60)])
        assert p.read(DRAG, 0x1C) == 258 and p.read(DRAG, 0x24) == -200
        result["ground_bounces"].append({"type": kind, "y": p.read(DRAG, 0x1C), "vy": p.read(DRAG, 0x24)})
    # A landed ballista arrow is not destroyed, but setting x to its impact limit prevents another hit.
    p.drag(7, x=345); p.write(DRAG, 0x30, 344); p.log_calls.clear()
    for _ in range(2):
        p.call(0x2AE54, [DRAG, f32(1/60)])
    assert len([c for c in p.log_calls if c["address"] == "0x308e8"]) == 1
    result["arrow_single_impact"] = {"alive": bool(p.read(DRAG, 0, "B")), "vx": p.read(DRAG, 0x20), "vy": p.read(DRAG, 0x24), "x": p.read(DRAG, 0x18)}
    # Type7 artefact checks its base position, not the unrelated pointer anchor offsets.
    for upgrade in (0, 1):
        for kind, distance, expected in ((0, 29, True), (0, 30, False), (2, 0, False)):
            p.art(7, upgrade, x=100, y=236); p.enemy(kind, x=100+distance, y=236)
            p.call(0x2F084, [ART, f32(0.41)])
            flying = bool(p.read(CREEP, 0xA9, "B"))
            assert flying == expected, (upgrade, kind, distance, flying)
            if expected:
                assert p.read(CREEP, 0xAA, "B") == 1
                assert p.read(CREEP, 0x1C) == (194 if upgrade == 0 else 94)
                assert p.read(CREEP, 0x20) == (-466 if upgrade == 0 else -766)
            result["platform"].append({"upgrade": upgrade, "enemy_type": kind, "distance": distance, "flying": flying,
                                       "first_hit_immunity": bool(p.read(CREEP, 0xAA, "B")),
                                       "vx": p.read(CREEP, 0x1C), "vy": p.read(CREEP, 0x20)})
    p.art(7, x=100, y=236); p.enemy(x=100, y=236)
    p.call(0x2F084, [ART, f32(0.4)])
    assert not p.read(CREEP, 0xA9, "B")
    p.call(0x2F084, [ART, f32(0.001)])
    assert p.read(CREEP, 0xA9, "B")
    p.call(0x27C44, [CREEP, 500])
    assert p.read(CREEP, 0x94) == 600 and not p.read(CREEP, 0xAA, "B")
    result["platform_immunity"] = {"first_500_hit_hp": p.read(CREEP, 0x94), "immunity_consumed": not bool(p.read(CREEP, 0xAA, "B"))}
    return result


def selection_and_cascades(p):
    result = {"artifact_selection": []}
    for first_ready in (True, False):
        p.u.mem_write(ARTIFACTS, bytes(152 * 25))
        for i, x in enumerate((100, 120)):
            p.art(6, x=x, y=100)
            p.write(ART, 0x28, 15 if (i or first_ready) else 0)
            p.u.mem_write(ARTIFACTS + 152*i, bytes(p.u.mem_read(ART, 152)))
        p.call(0x2E1CC, [145, 117])
        pressed = [bool(p.read(ARTIFACTS + 152*i, 0x34, "B")) for i in range(2)]
        assert pressed == ([True, False] if first_ready else [False, False]), pressed
        result["artifact_selection"].append({"equidistant_centers": [[135, 117], [155, 117]], "pointer": [145, 117],
                                              "first_ready": first_ready, "pressed": pressed})
    p.u.mem_write(DRAG, bytes(116*30))
    p.drag(4, x=100, y=100)
    p.u.mem_write(DRAG+116, bytes(p.u.mem_read(DRAG, 116)))
    p.call(0x29338, [100, 100])
    selected = [bool(p.read(DRAG+116*i, 0x48, "B")) for i in range(2)]
    assert selected == [True, False]
    result["overlapping_dragobjects_pressed"] = selected
    # Execute real ordinary-enemy death here, while keeping particle/audio calls stubbed.
    p.capture_splash = False; p.real_creep_death = True
    cannon_cases = []
    for hp in (600, 3000):
        p.enemy(x=200, y=200); p.write(CREEP, 0x94, hp)
        p.u.mem_write(CREEP+256, bytes(p.u.mem_read(CREEP, 256)))
        p.missile(0, x=200, y=200); p.write(MISSILE, 0x94, 0)
        p.log_calls.clear()
        p.call(0x1B75C, [MISSILE, f32(1/60)])
        cannon_cases.append({"initial_hp_each": hp, "final_hp": [p.read(CREEP+256*i,0x94) for i in range(2)],
                              "dead": [bool(p.read(CREEP+256*i,1,"B")) for i in range(2)],
                              "explosion_calls": sum(c["address"] == "0x27cc4" for c in p.log_calls)})
    assert cannon_cases[0]["explosion_calls"] == 1 and cannon_cases[0]["dead"] == [True,True]
    assert cannon_cases[1]["explosion_calls"] == 2 and cannon_cases[1]["final_hp"] == [1400,1400]
    result["overlapping_cannon_contacts"] = cannon_cases
    p.capture_splash = True; p.real_creep_death = False
    return result


def explosive_creep_chains(p):
    p.capture_splash = False; p.real_creep_death = True
    result = []
    for kinds, positions in (((4,5,0), ((200,200),(250,200),(300,200))),
                             ((10,0), ((350,200),(300,200)))):
        p.u.mem_write(CREEP, bytes(256*200))
        for i, (kind, (x,y)) in enumerate(zip(kinds,positions)):
            p.init(kind)
            p.u.mem_write(CREEP+256*i, bytes(p.u.mem_read(SELF,256)))
            p.write(CREEP+256*i,8,x); p.write(CREEP+256*i,12,y)
        player = META["symbols"]["_Player"]
        old_gold = p.read(player,0x80,"i")
        p.log_calls.clear()
        p.call(0x27C44,[CREEP,1001])
        dead = [bool(p.read(CREEP+256*i,1,"B")) for i in range(len(kinds))]
        assert all(dead), (kinds,dead)
        gold = p.read(player,0x80,"i") - old_gold
        assert gold == (110 if kinds[0] == 4 else 60), gold
        castle_hits = [decoded_call(c) for c in p.log_calls if c["address"] == "0x308e8"]
        assert castle_hits == ([] if kinds[0] == 4 else [{"function":"land::HitCastle","damage":25}])
        result.append({"enemy_types": kinds,"positions":positions,"dead":dead,"gold_awarded":gold,
                       "calls_in_order":[decoded_call(c) for c in p.log_calls]})
    p.capture_splash = True; p.real_creep_death = False
    return result


def main():
    p = WeaponProbe()
    artifacts = []
    for kind, levels, x, y in ((2, range(3), 315, 63), (4, range(3), 405, 38),
                               (5, range(4), 408, 150), (6, (0, 3, 6), 392, 237), (8, range(3), 432, 142)):
        for upgrade in levels:
            p.art(kind, upgrade, x, y)
            artifacts.append(p.fields(ART, ART_SCHEMA))
    drags = []
    for kind, levels in ((0, range(3)), (1, range(3)), (2, range(4))):
        for upgrade in levels:
            p.drag(kind, upgrade)
            drags.append(p.fields(DRAG, DRAG_SCHEMA))
    projectiles = []
    for kind, upgrade, x, y in ((6, 0, 392, 237), (6, 3, 392, 237), (6, 6, 392, 237),
                               (8, 0, 432, 142), (8, 1, 432, 142), (8, 2, 432, 142)):
        p.u.mem_write(MISSILE, bytes(500 * 100))
        p.art(kind, upgrade, x, y)
        p.write(ART, 0x34, 1, "B")
        p.write(ART, 0x38, 0.0)
        p.call(0x2D7E0, [ART, x + 100, y, -1])
        projectiles.append(p.fields(MISSILE, MISSILE_SCHEMA))
    ground_impacts = []
    for kind, levels in ((0, range(3)), (1, range(3))):
        for upgrade in levels:
            p.drag(kind, upgrade)
            p.write(DRAG, 0x1C, 300)
            p.write(DRAG, 0x24, 600)
            p.log_calls.clear()
            p.call(0x2AE54, [DRAG, f32(1/60)])
            ground_impacts.append({"type": kind, "upgrade": upgrade, "calls": [decoded_call(c) for c in p.log_calls],
                                   "after": p.fields(DRAG, DRAG_SCHEMA)})
    result = {"source_sha256": hashlib.sha256(IMAGE).hexdigest(), "artifact_init": artifacts,
              "dragobject_init": drags, "weapon_projectile_init": projectiles, "ground_impacts": ground_impacts}
    result["mechanics"] = mechanics(p)
    result["boundaries"] = boundaries(p)
    result["enemy_projectiles"] = enemy_projectiles(p)
    result["selection_and_cascades"] = selection_and_cascades(p)
    result["explosive_creep_chains"] = explosive_creep_chains(p)
    (ROOT / "research/weapon-data.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
