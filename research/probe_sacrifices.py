"""Bounded original ARM sacrifice probes; renderer/audio calls are stubbed."""
import json
import math
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_PC, UC_ARM_REG_LR

from extract_enemies import Probe, META, SELF, f32

ART = SELF + 0x1000


class SacrificeProbe(Probe):
    def __init__(self):
        super().__init__()
        self.u.mem_map(0, 4096)
        self.u.mem_write(0xC7528, struct.pack("<I", SELF))
        for address in (0x7BF4, 0x7FEC, 0x8188, 0x19304, 0x28C70, 0x1A090):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)
        self.call(0x19B60, [META["symbols"]["_Player"]])

    def ignore(self, u, address, size, context):
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def import_hook(self, u, address, size, context):
        name = META["imports"].get(address, "")
        if name.startswith("_gl"):
            self.ignore(u, address, size, context)
            return
        if name in ("_sin", "_cos"):
            value = struct.unpack("<d", struct.pack("<II", u.reg_read(UC_ARM_REG_R0), u.reg_read(UC_ARM_REG_R1)))[0]
            answer = (math.sin if name == "_sin" else math.cos)(value)
            lo, hi = struct.unpack("<II", struct.pack("<d", answer))
            u.reg_write(UC_ARM_REG_R0, lo); u.reg_write(UC_ARM_REG_R1, hi)
            self.ignore(u, address, size, context)
            return
        super().import_hook(u, address, size, context)

    def art_get(self, offset, kind="f"):
        return struct.unpack("<" + kind, self.u.mem_read(ART + offset, struct.calcsize(kind)))[0]

    def init_art(self, kind, x, y):
        self.u.mem_write(ART, bytes(0x98))
        self.call(0x2CE80, [ART, x, y, kind], [0])

    def balances(self):
        return [struct.unpack("<i", self.u.mem_read(META["symbols"]["_Player"] + o, 4))[0] for o in (0x64, 0x80, 0x84)]

    def tick(self, dt):
        if self.get(0, "B"):
            self.call(0x283EC, [SELF, f32(dt)])
        self.call(0x2F084, [ART, f32(dt)])
        self.call(0x2F2FC, [ART, f32(dt)])
        self.call(0x2E8A0, [ART, f32(dt)])


def main():
    p = SacrificeProbe()
    results = {}
    capture = []
    for x, y, vx, frozen, expected in ((120, 75, 0, 0, True), (160, 75, 0, 0, True),
                                      (161, 75, 0, 0, False), (120, 75, 350, 0, True),
                                      (120, 75, 351, 0, False), (120, 75, 0, 1, False)):
        p.init(0); p.init_art(0, 35, 30)
        p.put(8, x); p.put(12, y); p.put(0x1C, vx); p.put(0xD0, frozen, "B")
        p.call(0x2D140, [ART, 0, 0, 0])
        attached = bool(p.art_get(1, "B"))
        assert attached == expected, (x, y, vx, frozen, attached)
        capture.append({"x": x, "y": y, "vx": vx, "frozen": frozen, "attached": attached})
    results["altar_capture_boundaries"] = capture

    p.init(0); p.init_art(0, 35, 30); p.put(8, 120); p.put(12, 75)
    p.call(0x2D140, [ART, 0, 0, 0])
    assert (p.get(8), p.get(12)) == (120, 90)
    initial = p.balances(); consumed = awarded = ready = None
    for frame in range(1, 361):
        p.tick(1 / 60)
        if consumed is None and not p.get(0, "B"):
            consumed = frame
        if awarded is None and p.balances()[2] > initial[2]:
            awarded = frame
        if not p.art_get(1, "B"):
            ready = frame; break
    assert consumed == awarded and awarded and ready > awarded
    delta = [after - before for after, before in zip(p.balances(), initial)]
    assert delta == [0, 0, 1], delta
    results["altar_60hz"] = {"consumed_frame": consumed, "award_frame": awarded, "ready_frame": ready,
                           "balance_delta_score_gold_sacrifice": delta}

    gate_bounds = []
    for x, y, expected in ((193, 100, False), (194, 179, True), (272, 179, True),
                           (273, 100, False), (233, 180, False)):
        p.init_art(3, 173, 210)
        p.call(0x2D254, [ART, x, y, 0])
        hover = bool(p.art_get(0x70, "B"))
        assert hover == expected, (x, y, hover)
        gate_bounds.append({"x": x, "y": y, "hover": hover})
    results["gate_hover_boundaries"] = gate_bounds

    p.init(0); p.init_art(3, 173, 210)
    p.put(8, 233); p.put(12, 130); p.put(0x88, 0, "i"); p.put(0x98, 1, "B")
    p.call(0x2D254, [ART, 233, 100, 0])
    open_frame = None
    for frame in range(1, 61):
        p.call(0x2F2FC, [ART, f32(1 / 60)])
        if p.art_get(0x71, "B"):
            open_frame = frame; break
    assert open_frame == 27, open_frame
    p.call(0x2D698, [ART, 0])
    assert p.art_get(1, "B") and p.get(2, "B") and p.get(3, "B")
    initial = p.balances(); digestion = awarded = ready = None
    for frame in range(1, 601):
        p.tick(1 / 60)
        if digestion is None and p.art_get(0x72, "B"):
            digestion = frame
        if awarded is None and p.balances()[2] > initial[2]:
            awarded = frame
        if not p.art_get(1, "B"):
            ready = frame; break
    delta = [after - before for after, before in zip(p.balances(), initial)]
    assert delta == [0, 0, 1], delta
    assert digestion and awarded and ready > awarded
    results["gate_60hz"] = {"opening_frames": open_frame, "digestion_frame": digestion,
                          "award_frame": awarded, "ready_frame": ready,
                          "balance_delta_score_gold_sacrifice": delta}
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
