"""Purchased Boulder/Column/Fireball cycles in the original world loop."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE

from extract_enemies import IMAGE, META, ROOT
from probe_gun_cycle import GunProbe
from probe_sacrifices import ART
from probe_weapons import DRAG, MISSILE


class DragCycleProbe(GunProbe):
    def __init__(self):
        self.blend = 'source-over'
        super().__init__()
        for address in (0x7d40, 0x7d20):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)

    def ignore(self, u, address, *args):
        if address in (0x7d40, 0x7d20):
            self.blend = 'screen' if address == 0x7d40 else 'source-over'
        start = len(self.trace)
        super().ignore(u, address, *args)
        for item in self.trace[start:]:
            if item.get('image'):
                item['phase'] = self.phases[-1] if self.phases else 'input'
                item['alpha'] = self.alpha / 255
                item['blend'] = self.blend

    def release(self, x, y):
        self.call(0x2d7e0, [ART, x, y, -1])
        for slot in range(30):
            ptr = DRAG + slot * 116
            if self.get_at(ptr, 0, 'B') and not self.get_at(ptr, 0x64, 'B'):
                self.call(0x291a0, [ptr, x, y])

    def run_cycle(self, kind, tier):
        self.reset()
        self.u.mem_write(ART, bytes(25 * 0x98))
        self.u.mem_write(MISSILE, bytes(100 * 500))
        x, y, px, py = {2: (315,63,344,76), 4: (405,38,438,51), 5: (408,150,447,163)}[kind]
        self.call(0x2ce80, [ART, x, y, kind], [tier])
        cooldown = self.get_at(ART, 0x24)
        self.u.mem_write(ART + 0x28, struct.pack('<f', cooldown - 0.25))
        frames = []; held_since = None; releases = 0
        for tick in range(1, 2101):
            self.frame = tick; self.trace = []; actions = []
            if held_since is None and tick % 30 == 1:
                accepted = self.get_at(ART, 0x28) >= cooldown
                self.call(0x2e084, [ART, px, py])
                actions.append(['press', px, py, int(accepted)])
                if accepted:
                    held_since = tick
            if held_since is not None:
                age = tick - held_since
                if kind == 4 and age == 1:
                    self.release(px, py); actions.append(['release'])
                if kind == 4 and age == 2:
                    self.call(0x28fdc, [DRAG, 200, 10])
                    actions.append(['press', 200, 10, self.get_at(DRAG, 0x48, 'B')])
                if age in ((2, 7, 12) if kind == 4 else (0, 5, 10)):
                    mx, my = (200, 100) if age < 10 else (260, 160)
                    self.call(0x2d254, [ART, mx, my, -1])
                    for slot in range(30):
                        ptr = DRAG + slot * 116
                        if self.get_at(ptr, 0, 'B') and not self.get_at(ptr, 0x64, 'B'):
                            self.call(0x291b0, [ptr, mx, my])
                    actions.append(['move', mx, my])
                if age == 18:
                    self.release(mx, my); actions.append(['release'])
                    held_since = None; releases += 1
            sounds = [d for d in self.trace if d.get('op') == 'sound']
            self.actor_draws = []; self.smokes = []; self.fragments = []
            before = self.objects()
            row = self.step_frame()
            time = self.get_at(META['symbols']['_g_timef'], 0)
            frames.append({'tick': tick, 'time': time, 'actions': actions,
                           'after': self.gun_state(), 'objects_before': before, 'objects': self.objects(),
                           'draws': [d for d in row['draws'] if d.get('image')],
                           'scissors': [d['rect'] for d in row['draws'] if d.get('op') == 'scissor'],
                           'sounds': sounds + [d for d in row['draws'] if d.get('op') == 'sound']})
        assert releases >= 2, (kind, tier, releases)
        return {'kind': kind, 'tier': tier, 'x': x, 'y': y, 'initial_elapsed': cooldown-0.25,
                'releases': releases, 'frames': frames}


def main():
    p = DragCycleProbe()
    cases = []
    for kind, tiers in [(2,3),(4,3),(5,4)]:
        for tier in range(tiers):
            case = p.run_cycle(kind, tier); cases.append(case)
            print(kind, tier, 'releases', case['releases'], flush=True)
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Native device/object pointer callbacks and integrated DrawNormalGame. '
                       'Empty enemy pool, rand0, initial cooldown0.25s from ready; '
                       'wave/scenery/effect allocation intercepted; stable host qsort.'}
    (ROOT/'research/drag-cycle.json').write_text(json.dumps(result, separators=(',', ':'), allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
