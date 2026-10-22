"""Native creep::Draw colors, blending, transforms, shield predicates and scissors."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, ROOT, SELF, REGS
from probe_frame_phase import FrameProbe


class EnemyDrawProbe(FrameProbe):
    def __init__(self):
        self.color = [255] * 4
        self.blend = 'source-over'
        self.scissor = None
        self.scissor_enabled = False
        super().__init__()
        self.land = SELF + 0x80000
        pointer = self.get_at(0x28fc0, 0, 'I')
        self.u.mem_write(pointer, struct.pack('<I', self.land))

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        values = [u.reg_read(r) for r in REGS]
        if name == '_glColor4ub':
            self.color = [v & 255 for v in values]
        elif name == '_glBlendFunc':
            assert values[:2] in ([1, 0x301], [1, 0x303], [0x302, 0x303])
            self.blend = 'screen' if values[:2] == [1, 0x301] else 'source-over'
        elif name == '_glScissor':
            self.scissor = values
        elif name in ('_glEnable', '_glDisable') and values[0] == 0xc11:
            self.scissor_enabled = name == '_glEnable'
        super().import_hook(u, address, *args)

    def extra_hook(self, u, address, *args):
        if address == 0x7fc8:
            self.color = [255, 255, 255, u.reg_read(REGS[1]) & 255]
        super().extra_hook(u, address, *args)

    def ignore(self, u, address, *args):
        super().ignore(u, address, *args)
        if address == 0x8188:
            self.trace[-1].update(color=self.color[:], blend=self.blend,
                                 clip=self.scissor[:] if self.scissor_enabled else None)

    def draw_case(self, kind, dead=0, burning=0, shield=0, ability=0,
                  broken=0, reverse=0, alpha=127.8, size=1.3, clipped=False, pose=None, angle=0):
        self.init(kind)
        if pose is None:
            pose = 6 if dead else 0
        for off, value, fmt in [(8, 400.25, 'f'), (12, 240.5, 'f'), (0xbc, alpha, 'f'),
                                (0xf8, size, 'f'), (1, dead, 'B'), (4, burning, 'B'),
                                (0xa8, shield, 'B'), (0xe4, ability, 'B'), (0x50, pose, 'I'),
                                (0x44, angle, 'f')]:
            self.put(off, value, fmt)
        self.u.mem_write(self.land+0x2bc, bytes([broken]))
        self.u.mem_write(META['symbols']['_Player']+0x12c, bytes([reverse]))
        self.color = [255]*4; self.blend = 'source-over'; self.alpha = 255
        self.scissor = [67, 0, 320, 480] if clipped else None
        self.scissor_enabled = clipped
        self.trace = []
        self.call(0x28c70, [SELF])
        return {'kind': kind, 'dead': dead, 'burning': burning, 'shield': shield,
                'state': 9 if pose == 5 else 6 if dead else 1,
                'ability': ability, 'broken': broken, 'reverse': reverse, 'clipped': clipped,
                'alpha': self.get(0xbc), 'size': self.get(0xf8), 'angle': self.get(0x44),
                'draws': [d for d in self.trace if d.get('image')],
                'scissor_enabled_after': self.scissor_enabled}


def main():
    p = EnemyDrawProbe()
    cases = [p.draw_case(kind, dead, burning) for kind in range(11)
             for dead in (0, 1) for burning in (0, 1)]
    cases += [p.draw_case(6, dead, shield=shield, ability=ability, size=size)
              for dead in (0, 1) for shield in (0, 1) for ability in (0, 1) for size in (.8, 1.3)]
    cases += [p.draw_case(6, shield=1, ability=1, broken=broken, reverse=reverse, clipped=clipped)
              for broken in (0, 1) for reverse in (0, 1) for clipped in (False, True)]
    cases += [p.draw_case(7, alpha=alpha, size=1) for alpha in range(256)]
    cases += [p.draw_case(0, dead=f['dead'], alpha=f['alpha'], size=1, pose=5, angle=f['angle'])
              for f in json.loads((ROOT/'research/gate-corpse.json').read_text())['frames']]
    for c in cases:
        assert len(c['draws']) == 1 + int(c['kind'] == 6 and c['shield'] and c['ability'] and not c['dead'])
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Native creep::Draw and Display blending functions execute; texture blits and GL calls are recorded. Display debug crosses disabled as in InitGame.'}
    (ROOT/'research/enemy-drawing.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print('Captured', len(cases), 'native drawing cases')
    print('Shield:', next(c['draws'] for c in cases if len(c['draws']) == 2))
    print('Clips:', [(c['reverse'], c['draws'][0]['clip']) for c in cases if c['broken'] and not c['clipped']])


if __name__ == '__main__':
    main()
