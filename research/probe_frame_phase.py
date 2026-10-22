"""Execute the original world loop with isolated actor pools and intercepted scenery."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_enemy_followup import EnemyProbe
from probe_weapons import CREEP, DRAG, DRAG_SCHEMA

PHASES = {
    0x19104: 'wave', 0x30bbc: 'land_draw', 0x3010c: 'artefacts_before',
    0x18dd8: 'sort', 0x18ce4: 'objects_draw', 0x1c5fc: 'powerups',
    0x2eee8: 'artefacts_after', 0x1c310: 'missiles_process', 0x1b28c: 'missiles_draw',
    0x28b38: 'creeps_process', 0x2c604: 'dragobjects_process',
    0x305ac: 'land_after', 0x303a8: 'land_process', 0x1a540: 'particles_process',
    0x1a82c: 'particles_draw', 0xaba0: 'text_process', 0xa944: 'text_draw',
    0x31758: 'fragments', 0x1a304: 'smoke', 0x6acc: 'interface',
    0x1c7b8: 'pause', 0x19a84: 'perk_panel', 0x1d2a8: 'buttons',
}
LIVE = {0x18dd8, 0x18ce4, 0x28b38, 0x2c604}


class FrameProbe(EnemyProbe):
    def __init__(self):
        self.phases = []
        super().__init__()
        self.bindings = self.load_enemies()
        self.u.mem_write(0xc7528, struct.pack('<I', CREEP))
        # InitGame 0x7130–0x7140 sets Display byte0 to1, disabling debug crosses.
        self.u.mem_write(META['symbols']['_display'], struct.pack('<I', SELF+0x90000))
        self.u.mem_write(SELF+0x90000, b'\1')
        for address in PHASES:
            self.u.hook_add(UC_HOOK_CODE, self.phase, begin=address, end=address)
        self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=0x7e98, end=0x7e98)

    def phase(self, u, address, *args):
        self.phases.append(PHASES[address])
        if address not in LIVE:
            self.ret(u)

    def ignore(self, u, address, *args):
        if address == 0x28c70:
            return
        if address == 0x7e98:
            if self.get_at(u.reg_read(REGS[0]),0,'B'):
                self.ret(u)
                return
            x, y, x2 = [u.reg_read(r) for r in REGS[1:]]
            y2, color = struct.unpack('<2I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 8))
            self.trace.append({'op': 'line', 'points': [x, y, x2, y2], 'color': color})
            self.ret(u)
            return
        super().ignore(u, address, *args)

    def import_hook(self, u, address, *args):
        if META['imports'].get(address) == '_qsort':
            base, count, size, _ = [u.reg_read(r) for r in REGS]
            rows = [bytes(u.mem_read(base + i * size, size)) for i in range(count)]
            rows.sort(key=lambda r: (r[16], struct.unpack_from('<i', r, 8)[0]))
            if rows:
                u.mem_write(base, b''.join(rows))
            self.ret(u)
        else:
            super().import_hook(u, address, *args)

    def get_at(self, base, offset, kind='f'):
        return struct.unpack('<' + kind, self.u.mem_read(base + offset, struct.calcsize(kind)))[0]

    def actor_state(self):
        return {key: self.get_at(CREEP, offset, fmt) for key, offset, fmt in [
            ('active', 0, 'B'), ('dead', 1, 'B'), ('x', 8, 'f'), ('y', 12, 'f'),
            ('frame', 0x4c, 'f'), ('pose', 0x50, 'I'), ('alpha', 0xbc, 'f')]}

    def object_state(self):
        return {key: self.get_at(DRAG, offset, fmt) for key, offset, fmt in [
            ('active', 0, 'B'), ('x', 0x18, 'f'), ('y', 0x1c, 'f'),
            ('angle', 0x3c, 'f'), ('age', 0xc, 'f')]}

    def reset(self):
        self.u.mem_write(CREEP, bytes(200 * 256))
        self.u.mem_write(DRAG, bytes(30 * 116))
        self.u.mem_write(META['symbols']['_g_timeToUpdateSort'], struct.pack('<I', 30))
        self.u.mem_write(META['symbols']['_g_timef'], bytes(4))

    def step_frame(self):
        self.trace = []; self.phases = []
        before = {'actor': self.actor_state(), 'object': self.object_state()}
        self.call(0x6d68, [f32(1 / 60)])
        return {'before': before, 'draws': self.trace[:],
                'after': {'actor': self.actor_state(), 'object': self.object_state()}}


def main():
    p = FrameProbe(); cases = []
    for kind in range(11):
        p.reset(); p.init(kind); p.put(8, 100); p.put(12, 240)
        p.put(0xf0, 100); p.put(0xe0, 100)
        initial = p.actor()
        p.u.mem_write(CREEP, bytes(p.u.mem_read(SELF, 256)))
        frames = [p.step_frame() for _ in range(30)]
        for frame in frames:
            a = frame['before']['actor']; draw = frame['draws'][0]
            assert draw['x'] == a['x'] and draw['y'] == a['y']
            assert draw['image'] == p.bindings[kind][a['pose']][int(a['frame'])]
        cases.append({'kind': kind, 'initial': initial, 'frames': frames})
    objects = []
    for kind in (0, 1, 2, 4, 5, 6, 7):
        p.reset(); p.call(0x29bb0, [DRAG, 180, 100, kind], [0])
        p.u.mem_write(DRAG + 3, b'\0')
        p.u.mem_write(DRAG + 0x20, struct.pack('<2f', 30, 60))
        initial = {key: p.get_at(DRAG, off, fmt) for key, off, fmt in DRAG_SCHEMA}
        initial.update(target_x=p.get_at(DRAG,0x30), target_y=p.get_at(DRAG,0x34))
        frames = [p.step_frame() for _ in range(30)]
        for frame in frames:
            if frame['before']['object']['active']:
                assert frame['draws'], (kind, frame)
        objects.append({'kind': kind, 'initial': initial, 'frames': frames})
    assert p.phases.index('objects_draw') < p.phases.index('missiles_process') < p.phases.index('creeps_process') < p.phases.index('dragobjects_process')
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'phases': p.phases,
              'creeps': cases, 'objects': objects,
              'scope': 'Native DrawNormalGame, object sorting/dispatch, creep and dragobject Draw/Process execute. Other phase calls are recorded then intercepted. Host qsort uses stable ties; this does not prove historical libc tie order.'}
    (ROOT / 'research/frame-phase.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('Captured', len(cases) * 30, 'enemy and', len(objects) * 30, 'object before/draw/after frames')
    print('Native phases:', p.phases)


if __name__ == '__main__':
    main()
