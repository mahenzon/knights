"""Original frozen-enemy shatter emission, fragment flight and drawing."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_smoke import SmokeProbe
from probe_scene import unf
from probe_weapon_followup import surface_bindings

POOL = META['symbols']['_Fragments']


class IceFragmentsProbe(SmokeProbe):
    def __init__(self):
        self.rng = None
        self.random_calls = 0
        self.draws = []
        super().__init__()
        for address in [0x7dc4, 0x7fc8, 0x7d20]:
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)
        for kind in range(3):
            self.u.mem_write(META['symbols']['_g_fragments'] + 4 * kind, struct.pack('<I', 100 + kind))

    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '_rand' and self.rng is not None:
            x = self.rng
            x = (x ^ (x << 13)) & 0xffffffff
            x ^= x >> 17
            x = (x ^ (x << 5)) & 0xffffffff
            self.rng = x
            self.random_calls += 1
            u.reg_write(UC_ARM_REG_R0, x & 0x7fffffff)
            super().ignore(u, address, size, context)
        else:
            super().import_hook(u, address, size, context)

    def ignore(self, u, address, size, context):
        if address == 0x31a7c:
            return  # Execute real allocation and initialization.
        if address == 0x7dc4:
            a = [u.reg_read(r) for r in REGS]
            sy, image = struct.unpack('<2I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 8))
            self.draws.append({'kind': image - 100, 'x': unf(a[1]), 'y': unf(a[2]),
                               'sx': unf(a[3]), 'sy': unf(sy)})
        super().ignore(u, address, size, context)

    def shards(self):
        result = []
        for slot in range(150):
            base = POOL + slot * 56
            if not self.read(base, 0, 'B'):
                continue
            result.append({'slot': slot, 'kind': self.read(base, 0x24, 'I'),
                           'x': self.read(base, 4, 'i'), 'y': self.read(base, 8, 'i'),
                           'vx': self.read(base, 12), 'vy': self.read(base, 16),
                           'size': self.read(base, 20)})
        return result


def main():
    p = IceFragmentsProbe()
    cases = []
    for giant in [False, True]:
        for animation in [4, 6]:
            p.rng = None
            p.init(0, giant)
            p.put(8, 200.75); p.put(12, 240.5)
            p.put(0xcc, 3.5); p.put(0xd0, 1, 'B')
            p.u.mem_write(POOL, bytes(150 * 56))
            p.rng, p.random_calls = 73, 0
            p.call(0x26d44, [SELF, animation])
            initial = p.shards()
            assert len(initial) == 16 and p.get(0, 'B') == 0
            p.draws = []
            for shard in initial:
                p.call(0x31648, [POOL + shard['slot'] * 56])
            cases.append({'giant': giant, 'animation': animation, 'seed': 73, 'final_rng': p.rng,
                          'random_calls': p.random_calls, 'initial': initial, 'draws': p.draws[:]})
    timelines = []
    for frame in range(1, 121):
        for s in p.shards():
            p.call(0x31584, [POOL + s['slot'] * 56, f32(1 / 60)])
        timelines.append({'frame': frame, 'shards': p.shards()})
        if not p.shards():
            break
    assert not timelines[-1]['shards']
    landings = []
    p.real_creep_death = True
    for velocity in [100, 700]:
        p.rng = None
        p.init(0);p.put(8, 200);p.put(12, 240);p.put(0x10, 240)
        p.put(0x20, velocity);p.put(0xa9, 1, 'B');p.put(0x88, 0, 'i')
        p.put(0xcc, 3.5);p.put(0xd0, 1, 'B');p.put(0x50, 7, 'I')
        p.u.mem_write(POOL, bytes(150 * 56))
        player = META['symbols']['_Player']
        p.u.mem_write(player+0x80, bytes(4))
        p.effects = []
        p.call(0x283ec, [SELF, f32(1/60)])
        landings.append({'velocity': velocity, 'active': p.get(0,'B'), 'hp': p.get(0x94),
                         'gold': p.read(player, 0x80, 'I'), 'fragments':len(p.shards()),
                         'sounds': [s['args'][:2] for s in p.effects if s['address']=='0x37ba8']})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'sprites': {i:surface_bindings()['_g_fragments'][i] for i in range(3)},
              'cases': cases, 'timelines': timelines, 'landings': landings}
    (ROOT/'research/ice-fragments.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'cases':len(cases),'frames':len(timelines),'landings':landings,'first':cases[0]['initial'][0]}))


if __name__ == '__main__':
    main()
