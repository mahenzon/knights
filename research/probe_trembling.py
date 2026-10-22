"""Execute the original world transform and every observed screen-shake writer."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_PC
from extract_enemies import IMAGE, META, ROOT, REGS, RETURN, f32
from probe_missile_effects import MissileProbe
from probe_weapons import DRAG, MISSILE, DRAG_SCHEMA
from probe_sacrifices import SacrificeProbe, ART
from probe_scene import unf
from probe_ice_fragments import IceFragmentsProbe, POOL

STRENGTH = META['symbols']['_g_trembling']
X = META['symbols']['_g_shiftX']
Y = META['symbols']['_g_shiftY']

class TrembleProbe(MissileProbe):
    def __init__(self):
        self.transforms = []
        self.random_calls = 0
        super().__init__()
        self.u.hook_add(UC_HOOK_CODE, self.stop_world, begin=0x6ec8, end=0x6ec8)

    def stop_world(self, u, address, size, context):
        u.reg_write(UC_ARM_REG_PC, RETURN) # Isolate only the original frame transform.

    def random(self):
        self.random_calls += 1
        return super().random()

    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '_glTranslatef':
            self.transforms.append([unf(u.reg_read(r)) for r in REGS[:2]])
        super().import_hook(u, address, size, context)

    def frame(self):
        self.transforms = []
        self.call(0x6d68, [f32(1/60)])
        return {'strength': self.read(STRENGTH, 0), 'x': self.read(X, 0), 'y': self.read(Y, 0),
                'transforms': self.transforms[:], 'random_calls': self.random_calls, 'rng': self.rng}

def main():
    p = TrembleProbe()
    timelines = []
    for strength in (0, .01, 4, 5, 6, 7):
        p.rng = 73; p.random_calls = 0
        p.write(STRENGTH, 0, strength); p.write(X, 0, 0); p.write(Y, 0, 0)
        frames = [p.frame() for _ in range(75)]
        assert frames[-1]['strength'] <= 0 and not frames[-1]['transforms']
        timelines.append({'initial': strength, 'frames': frames})
    triggers = []
    for kind in (0, 1, 2, 4, 5, 6, 7):
        for tier in range(3 if kind in (0, 1) else 4 if kind == 2 else 1):
            for landed in (False, True):
                p.drag(kind, tier, 200, 289)
                p.write(DRAG, 0x24, 700); p.write(DRAG, 2, int(landed), 'B')
                p.write(DRAG, 3, 0, 'B'); p.write(STRENGTH, 0, .75)
                initial = p.fields(DRAG, DRAG_SCHEMA)
                p.call(0x2c4e4, [DRAG, f32(1/60)])
                triggers.append({'source': 'ground', 'kind': kind, 'tier': tier, 'landed': landed,
                                 'initial': initial, 'strength': p.read(STRENGTH, 0)})
    for kind in range(8):
        p.drag(kind, 0, 200, 120); p.write(STRENGTH, 0, .75)
        p.call(0x2a030, [DRAG])
        triggers.append({'source': 'death', 'kind': kind, 'tier': 0, 'strength': p.read(STRENGTH, 0)})
    for kind, tier in [(0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (3, 2)]:
        p.missile(kind, tier, 200, 280, 0, 50); p.write(STRENGTH, 0, .75)
        p.call(0x1b75c, [MISSILE, f32(1/60)])
        triggers.append({'source': 'missile', 'kind': kind, 'tier': tier, 'strength': p.read(STRENGTH, 0)})
    gate = SacrificeProbe()
    gate.init(0); gate.init_art(3, 173, 210)
    gate.put(8, 233); gate.put(12, 130); gate.put(0x88, 0, 'i'); gate.put(0x98, 1, 'B')
    gate.call(0x2d254, [ART, 233, 100, 0])
    for _ in range(27): gate.call(0x2f2fc, [ART, f32(1/60)])
    gate.call(0x2d698, [ART, 0]); gate.u.mem_write(STRENGTH, struct.pack('<f', .75))
    changes = []
    for tick in range(450):
        before = bytes(gate.u.mem_read(STRENGTH, 4)); gate.tick(1/60)
        after = bytes(gate.u.mem_read(STRENGTH, 4))
        if before != after: changes.append({'tick': tick+1, 'strength': struct.unpack('<f', after)[0]})
    assert len(changes) == 1 and changes[0]['strength'] == 6, changes
    effects = IceFragmentsProbe(); compensated = []
    effects.u.mem_write(META['symbols']['_g_smoke'], struct.pack('<I',100))
    effects.u.mem_write(POOL, bytes(56))
    effects.write(POOL,0,1,'B'); effects.write(POOL,4,200,'i'); effects.write(POOL,8,220,'i')
    effects.write(POOL,20,1); effects.write(POOL,28,255)
    for x,y in [(0,0),(5,-2),(.025,-.075)]:
        effects.write(X,0,x); effects.write(Y,0,y)
        for name,address in [('fragment',0x31648),('smoke',0x1a1f4)]:
            effects.draws=[]; effects.call(address,[POOL])
            assert len(effects.draws)==1
            compensated.append({'kind':name,'shift':[x,y],'draw':effects.draws[0]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'timelines': timelines,
              'triggers': triggers, 'gate': changes, 'compensated':compensated,
              'effect_compensation': 'smoke::Draw 0x1a2c8 and fragment::Draw 0x3171c subtract retained g_shiftX/Y, including after trembling reaches zero'}
    (ROOT/'research/trembling.json').write_text(json.dumps(result, indent=2)+'\n')
    print('Captured',len(timelines)*75,'transform frames and',len(triggers),'impact cases; gate',changes)
    print([(t['source'],t['kind'],t['tier'],t.get('landed'),t['strength']) for t in triggers])

if __name__ == '__main__': main()
