"""Original Hell Gate corpse through landing and fade; research only."""
import hashlib
import json
from extract_enemies import IMAGE, ROOT, SELF, f32
from probe_sacrifices import SacrificeProbe, ART


def main():
    p = SacrificeProbe()
    p.init(0)
    p.init_art(3, 173, 210)
    p.put(8, 233)
    p.put(12, 130)
    p.put(0x88, 0, 'i')
    p.put(0x98, 1, 'B')
    p.call(0x2d254, [ART, 233, 100, 0])
    for _ in range(27):
        p.call(0x2f2fc, [ART, f32(1 / 60)])
    p.call(0x2d698, [ART, 0])
    for _ in range(400):
        p.tick(1 / 60)
        if p.get(0x50, 'I') == 5:
            break
    else:
        raise AssertionError('No skeleton ejected')

    def state():
        return {name: p.get(offset, fmt) for name, offset, fmt in [
            ('active', 0, 'B'), ('dead', 1, 'B'), ('pose', 0x50, 'I'), ('frame', 0x4c, 'f'),
            ('x', 8, 'f'), ('y', 12, 'f'), ('vx', 0x1c, 'f'), ('vy', 0x20, 'f'),
            ('alpha', 0xbc, 'f'), ('angle', 0x44, 'f')]}

    initial = state()
    frames = []
    for _ in range(181):
        if p.get(0, 'B'):
            p.call(0x283ec, [SELF, f32(1 / 60)])
        frames.append(state())
    assert all(s['pose'] == 5 for s in frames)
    assert any(s['dead'] and s['active'] for s in frames) and not frames[-1]['active']
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'initial': initial, 'frames': frames}
    (ROOT / 'research/gate-corpse.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Native skeleton: stays pose 5 through landing; alpha 655, fades 7.5 per grounded frame.')


if __name__ == '__main__':
    main()
