"""Record native random-call sites; distinguish game call scheduling from libc RNG choice."""
import hashlib
import json
import struct
from unicorn.arm_const import UC_ARM_REG_LR
from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_world_scene import WorldSceneProbe
from probe_land import LandProbe
from probe_sacrifices import ART
from probe_weapons import CREEP, DRAG, MISSILE


class RandomProbe(WorldSceneProbe):
    def __init__(self):
        self.random_calls = []
        self.random_values = None
        super().__init__()

    def import_hook(self, u, address, *args):
        if META['imports'].get(address) == '_rand':
            self.random_calls.append(hex(u.reg_read(UC_ARM_REG_LR)-4))
            u.reg_write(REGS[0], next(self.random_values) if self.random_values is not None else 123456)
            self.ret(u)
            return
        super().import_hook(u, address, *args)

    def clean(self):
        self.reset()
        for ptr, size in [(ART, 25*0x98), (MISSILE, 100*500),
                          (META['symbols']['_Smokes'], 50*56),
                          (META['symbols']['_Fragments'], 150*56)]:
            self.u.mem_write(ptr, bytes(size))
        self.call(0x19b60, [META['symbols']['_Player']])
        for off in (0x64, 0x80, 0x84):
            self.u.mem_write(META['symbols']['_Player']+off, bytes(4))
        self.call(0x17020, [0])
        LandProbe.init_land(self, 120)
        self.put_land(0x28c, 100000)
        for name in ('_g_trembling', '_g_shiftX', '_g_shiftY'):
            self.u.mem_write(META['symbols'][name], bytes(4))


def main():
    p = RandomProbe()
    cases = []
    for kind in [-1, *range(11)]:
        p.clean()
        p.random_calls = []
        if kind >= 0:
            p.init(kind)
            p.put(0xe0, 0.25)
            p.put(0xc4, -10000)
            p.u.mem_write(CREEP, bytes(p.u.mem_read(SELF, 256)))
        initial_calls = p.random_calls[:]
        initial = p.actor_state() if kind >= 0 else None
        frames = []
        for tick in range(1, 181):
            p.random_calls = []; p.actor_draws = []; p.commands = []
            p.step_frame()
            frames.append({'tick': tick, 'calls': p.random_calls[:],
                           'actor': p.actor_state() if kind >= 0 else None})
        cases.append({'kind':kind, 'initial_calls': initial_calls, 'initial':initial, 'frames':frames})
        print(kind, 'init', initial_calls, 'frame sites', sorted({x for f in frames for x in f['calls']}),
              'count', sum(len(f['calls']) for f in frames), flush=True)
    initializers = []
    seeds = []
    for seed in range(1, 100):
        value = seed; values = []
        for _ in range(3):
            value = (value ^ value << 13) & 0xffffffff
            value ^= value >> 17
            value = (value ^ value << 5) & 0xffffffff
            values.append(value)
        if all(v <= 0x7fffffff for v in values):
            seeds.append((seed,values))
        if len(seeds) == 4: break
    for seed, values in seeds:
        for kind in range(11):
            for speed_range in (0,12):
                p.random_values = None
                p.clean(); p.random_calls = []
                p.u.mem_write(META['symbols']['_Player']+0x14c,struct.pack('<i',speed_range))
                p.random_values = iter(values)
                p.init(kind)
                p.u.mem_write(CREEP,bytes(p.u.mem_read(SELF,256)))
                initializers.append({'seed':seed,'kind':kind,'speed_range':speed_range,
                                     'calls':p.random_calls[:],'actor':p.actor_state()})
    result = {'binary_sha256':hashlib.sha256(IMAGE).hexdigest(), 'cases':cases, 'initializers':initializers,
              'scope':'Native integrated world with empty or one-actor pools; real castle, actor, '
                      'projectile and effect phases; waves/HUD intercepted. rand returns123456. '
                      'Initializers use four supplied xorshift streams whose values satisfy RAND_MAX. '
                      'This records call scheduling, not the historical libc generator algorithm.'}
    (ROOT/'research/random-calls.json').write_text(json.dumps(result,separators=(',',':'))+'\n')


if __name__ == '__main__':
    main()
