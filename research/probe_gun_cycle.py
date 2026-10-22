"""Native gun/ballista input, recharge, draw and missile cycles through the world loop."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, ROOT
from probe_chain_cycle import ChainProbe
from probe_sacrifices import ART
from probe_weapons import MISSILE


class GunProbe(ChainProbe):
    def gun_state(self):
        return {key: self.get_at(ART, off, fmt) for key, off, fmt in [
            ('elapsed', 0x28, 'f'), ('pressed', 0x34, 'B'), ('angle', 0x38, 'f'),
            ('recoil', 0x8c, 'i'), ('animation', 0x90, 'f')]}

    def run_gun(self, kind, tier):
        self.reset()
        self.u.mem_write(ART, bytes(25 * 0x98))
        self.u.mem_write(MISSILE, bytes(100 * 500))
        x, y = (392, 237) if kind == 6 else (432, 142)
        px, py = (x + 35, y + 17) if kind == 6 else (x, y - 36)
        self.call(0x2ce80, [ART, x, y, kind], [tier])
        self.u.mem_write(META['symbols']['_g_timef'], bytes(4))
        self.smokes = []; self.fragments = []
        frames = []; held_since = None; releases = 0
        for tick in range(1, 2101):
            self.frame = tick; self.trace = []; actions = []
            if held_since is None and tick % 30 == 1:
                self.call(0x2e084, [ART, px, py])
                accepted = self.get_at(ART, 0x34, 'B')
                actions.append(['press', px, py, accepted])
                if accepted:
                    held_since = tick
            if held_since is not None:
                elapsed = tick - held_since
                if elapsed in (0, 5, 10):
                    mx, my = [(200, y), (200, -100), (200, 320)][(elapsed // 5 + releases) % 3]
                    self.call(0x2d254, [ART, mx, my, -1])
                    actions.append(['move', mx, my])
                if elapsed == 15:
                    self.call(0x2d7e0, [ART, mx, my, -1])
                    actions.append(['release'])
                    held_since = None; releases += 1
            sounds = [d for d in self.trace if d.get('op') == 'sound']
            before = self.gun_state()
            self.actor_draws = []; self.smokes = []; self.fragments = []
            frame = self.step_frame()
            frames.append({'tick': tick, 'actions': actions, 'before': before,
                           'after': self.gun_state(), 'missiles': self.missiles(),
                           'draws': [d for d in frame['draws'] if d.get('image')],
                           'sounds': sounds + [d for d in frame['draws'] if d.get('op') == 'sound'],
                           'smokes': self.smokes[:]})
        assert releases >= 2, (kind, tier, releases)
        return {'kind': kind, 'tier': tier, 'x': x, 'y': y, 'releases': releases, 'frames': frames}


def main():
    p = GunProbe()
    cases = [p.run_gun(kind, tier) for kind, tier in [(6, 0), (6, 3), (6, 6), (8, 0), (8, 1), (8, 2)]]
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Original artefact StylusDown/Move/Up and DrawNormalGame including '
                       'device callbacks and missile manager. Empty enemy pool, rand0. '
                       'Wave/scenery, particle allocation and missile drawing intercepted.'}
    (ROOT / 'research/gun-cycle.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    for c in cases:
        print(c['kind'], c['tier'], 'shots', c['releases'], 'frames', len(c['frames']))


if __name__ == '__main__':
    main()
