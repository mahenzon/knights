"""Execute native device/actor callbacks through DrawNormalGame, in its own order."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_frame_phase import FrameProbe, LIVE, PHASES
from probe_sacrifices import ART
from probe_weapons import CREEP


class DeviceFrameProbe(FrameProbe):
    def __init__(self):
        self.actor_draws = []
        super().__init__()
        pointer = self.get_at(0x302c0, 0, 'I')
        self.u.mem_write(pointer, struct.pack('<I', ART))

    def phase(self, u, address, *args):
        self.phases.append(PHASES[address])
        if address not in LIVE | {0x3010c, 0x2eee8}:
            self.ret(u)

    def actor_state(self):
        result = super().actor_state()
        result.update({key: self.get_at(CREEP, off, fmt) for key, off, fmt in [
            ('vx', 0x1c, 'f'), ('vy', 0x20, 'f'), ('hp', 0x94, 'f'),
            ('speed', 0x88, 'i'), ('saved_speed', 0x8c, 'i'),
            ('sacrifice', 2, 'B'), ('hidden', 3, 'B'), ('flying', 0xa9, 'B')]})
        return result

    def ignore(self, u, address, *args):
        if address == 0x28c70:
            assert u.reg_read(REGS[0]) == CREEP
            self.actor_draws.append(self.actor_state())
        super().ignore(u, address, *args)

    def device_state(self):
        return {key: self.get_at(ART, off, fmt) for key, off, fmt in [
            ('occupied', 1, 'B'), ('elapsed', 0x28, 'f'), ('alpha', 0x60, 'f'),
            ('opening', 0x64, 'f'), ('burst_y', 0x68, 'f'), ('amplitude', 0x6c, 'f'),
            ('digestion', 0x72, 'B'), ('remaining', 0x78, 'f'), ('burst', 0x7c, 'B'),
            ('captive_draw', 0x84, 'B'), ('animation', 0x90, 'f'), ('animating', 0x94, 'B')]}

    def run(self, kind, frames):
        self.reset()
        self.u.mem_write(ART, bytes(25 * 0x98))
        self.call(0x19b60, [META['symbols']['_Player']])
        for offset in (0x64, 0x80, 0x84):
            self.u.mem_write(META['symbols']['_Player'] + offset, bytes(4))
        self.init(0)
        self.put(0xe0, 99)
        x, y = {0: (120, 75), 3: (233, 130), 7: (50, 247)}[kind]
        self.put(8, x); self.put(12, y)
        self.u.mem_write(CREEP, bytes(self.u.mem_read(SELF, 256)))
        ax, ay = {0: (35, 30), 3: (173, 210), 7: (50, 247)}[kind]
        self.init_art(kind, ax, ay)
        if kind == 0:
            self.call(0x2d140, [ART, 0, 0, 0])
        elif kind == 3:
            self.u.mem_write(CREEP+0x88, bytes(4))
            self.u.mem_write(CREEP+0x98, b'\1')
            self.call(0x2d254, [ART, 233, 100, 0])
            for _ in range(27):
                self.call(0x2f2fc, [ART, f32(1 / 60)])
            self.call(0x2d698, [ART, 0])
        initial = {'actor': self.actor_state(), 'device': self.device_state()}
        result = []
        for tick in range(1, frames + 1):
            self.frame = tick
            self.actor_draws = []
            row = self.step_frame()
            row.update(tick=tick, actor_draws=self.actor_draws[:], device=self.device_state(),
                       balances=self.balances())
            result.append(row)
        assert self.phases.index('artefacts_before') < self.phases.index('objects_draw')
        assert self.phases.index('artefacts_after') < self.phases.index('creeps_process')
        return {'kind': kind, 'initial': initial, 'frames': result}


def main():
    p = DeviceFrameProbe()
    cases = [p.run(3, 450), p.run(0, 300), p.run(7, 60)]
    for case in cases:
        awards = [f['tick'] for f in case['frames'] if f['balances'][2]]
        print('Device', case['kind'], 'frames', len(case['frames']),
              'first sacrifice', awards[0] if awards else None)
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Native DrawNormalGame including DrawArtefacts and DrawArtefactsAfter, '
                       'actor Draw/Process and object sorting. Scenery, wave generation, missiles '
                       'and effect pools intercepted. rand=123456; host qsort uses stable ties.'}
    (ROOT / 'research/device-phase.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
