"""Bounded original ballista sacrifice in normal and mirrored battlefield transforms."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, REGS, ROOT
from probe_captive_pose import CaptiveProbe


class MirroredGateProbe(CaptiveProbe):
    def __init__(self, reverse):
        self.reverse = reverse
        self.matrix = [1, 0, 0, 1, 0, 0]
        self.matrices = []
        self.recorded = []
        super().__init__()

    def call(self, address, args, stack=()):
        result = super().call(address, args, stack)
        if address == 0x19b60:
            self.u.mem_write(META['symbols']['_Player'] + 0x12c, bytes([self.reverse]))
        return result

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        values = [u.reg_read(r) for r in REGS]
        if name == '_glPushMatrix':
            self.matrices.append(self.matrix[:])
        elif name == '_glPopMatrix':
            self.matrix = self.matrices.pop()
        elif name in ('_glTranslatef', '_glScalef'):
            x, y = [struct.unpack('<f', struct.pack('<I', v))[0] for v in values[:2]]
            a, b, c, d, e, f = self.matrix
            self.matrix = ([a, b, c, d, e + a*x + c*y, f + b*x + d*y]
                           if name == '_glTranslatef' else [a*x, b*x, c*y, d*y, e, f])
        super().import_hook(u, address, *args)

    def ignore(self, u, address, *args):
        before = len(self.trace)
        super().ignore(u, address, *args)
        if len(self.trace) > before and self.trace[-1].get('image'):
            command = self.trace[-1]
            command['matrix'] = self.matrix[:]
            if 'x' in command and 'y' in command:
                a, b, c, d, e, f = self.matrix
                command['screen'] = [a*command['x'] + c*command['y'] + e,
                                     b*command['x'] + d*command['y'] + f]

    def step_frame(self):
        row = super().step_frame()
        if 332 <= self.frame <= 338:
            self.recorded.append({'tick': self.frame, 'draws': row['draws']})
        return row


def main():
    results = []
    for reverse in (0, 1):
        p = MirroredGateProbe(reverse)
        case = p.run_captive(5, 3, 0, pickup=True)
        eject = next(f for f in case['frames'] if f['sacrifices'])
        assert eject['tick'] == 334
        commands = p.recorded[3]['draws']  # first frame with the ejected pose
        body = next(d for d in commands if d.get('image') == p.bindings[5][5][0])
        result = dict(reverse=reverse, initial=case['initial'], ejection=eject,
                      visible_ejection=body, frames=p.recorded)
        results.append(result)
        print('Original mirrored=', reverse, 'logical x=', body['x'], 'screen=', body['screen'])
    a, b = [r['visible_ejection'] for r in results]
    assert a['x'] == b['x']
    assert abs(a['screen'][0] + b['screen'][0] - 480) < 0.001
    (ROOT/'artifacts/mirrored-gate-original.json').write_text(json.dumps(dict(
        binary_sha256=hashlib.sha256(IMAGE).hexdigest(), cases=results,
        scope='Original ARM world/captive processing and GL matrix calls; seeded isolated ballista, no GPU rasterization.'
    ), indent=2, allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
