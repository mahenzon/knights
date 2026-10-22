"""Execute original missile/smoke animation, bounded allocator and rendering."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_SP
from extract_enemies import IMAGE, META, ROOT, REGS, f32
from probe_drag_followup import DragProbe
from probe_weapons import ART, MISSILE, MISSILE_SCHEMA
from probe_scene import unf

SMOKES = META['symbols']['_Smokes']

class MissileProbe(DragProbe):
    def __init__(self):
        self.rng = 73
        self.emissions = []
        super().__init__()
        for address in (0x8dfc, 0x8e04, 0x7d5c):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)

    def random(self):
        self.rng ^= (self.rng << 13) & 0xffffffff
        self.rng ^= self.rng >> 17
        self.rng ^= (self.rng << 5) & 0xffffffff
        return self.rng & 0x7fffffff

    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '_rand':
            u.reg_write(UC_ARM_REG_R0, self.random())
            super().ignore(u, address, size, context)
        else:
            super().import_hook(u, address, size, context)

    def ignore(self, u, address, size, context):
        args = [u.reg_read(r) for r in REGS]
        if address == 0x1a090:
            values = args + list(struct.unpack('<6I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 24)))
            self.emissions.append({k: unf(v) if i in range(5, 9) else struct.unpack('<i', struct.pack('<I', v))[0]
                for i, (k, v) in enumerate(zip(('kind','x','y','vx','vy','size','growth','alpha','fade','additive'), values))})
            return # Execute the real 50-slot allocator.
        if address in (0x8dfc, 0x8e04):
            image = (ROOT / 'dist/assets' / self.surfaces[args[0]]).read_bytes()
            width, height = struct.unpack('>II', image[16:24])
            u.reg_write(UC_ARM_REG_R0, width if address == 0x8dfc else height)
        if address == 0x7d5c:
            self.trace.append({'op':'blit', 'image':self.surfaces[args[3]],
                               'x':unf(args[1]), 'y':unf(args[2]), 'radians':0, 'blend':'screen'})
        super().ignore(u, address, size, context)

    def smokes(self):
        result = []
        for i in range(50):
            at = SMOKES + i * 44
            if not self.read(at, 0, 'B'): continue
            result.append({'slot':i, **{name:self.read(at, offset, fmt) for name, offset, fmt in
                [('x',4,'i'),('y',8,'i'),('vx',12,'f'),('vy',16,'f'),('size',20,'f'),
                 ('growth',24,'f'),('alpha',28,'f'),('fade',32,'f'),('kind',36,'i'),('additive',40,'i')]}})
        return result

def main():
    p = MissileProbe()
    for i in range(60):
        p.call(0x1a090, [6, i, 100, 0], [0, f32(1), f32(0), f32(255), f32(0), 0])
    assert len(p.smokes()) == 50 and [s['x'] for s in p.smokes()] == list(range(50))
    p.u.mem_write(SMOKES + 7 * 44, b'\0')
    p.call(0x1a090, [6, 999, 100, 0], [0, f32(1), f32(0), f32(255), f32(0), 0])
    assert p.smokes()[7]['x'] == 999
    cases = []
    for kind, tier in [(0,0), (1,0), (2,0), (3,0), (3,1), (3,2)]:
        p.u.mem_write(SMOKES, bytes(50 * 44))
        p.missile(kind, tier, 400, 150, -600, 100)
        p.rng = 73
        p.write(META['symbols']['_g_trembling'], 0, 0)
        frames = []
        for tick in range(1, 121):
            strength = p.read(META['symbols']['_g_trembling'], 0)
            if strength > 0:
                p.random();p.random() # Original world transform precedes DrawCastle.
                p.write(META['symbols']['_g_trembling'], 0, strength - unf(f32(unf(f32(1/60))*10)))
            p.random();p.random() # DrawCastle precedes missiles.
            p.emissions.clear()
            p.call(0x1c310, [f32(1/60)])
            for s in p.smokes(): p.call(0x1a004, [SMOKES + s['slot'] * 44, f32(1/60)])
            frames.append({'tick':tick, 'active':p.read(MISSILE,0,'B'),
                'missile':p.fields(MISSILE,MISSILE_SCHEMA), 'timer':p.read(MISSILE,0x1e8),
                'emissions':p.emissions[:], 'smokes':p.smokes()})
        cases.append({'kind':kind, 'tier':tier, 'frames':frames})
    drawings = []
    for kind, tier in [(0,0), (1,0), (2,0), (3,0), (3,1), (3,2)]:
        for time in (0, .1, .8):
            p.missile(kind, tier, 200, 150, -580, 150)
            p.write(META['symbols']['_g_timef'], 0, time)
            p.trace.clear()
            p.call(0x1afe8, [MISSILE])
            drawings.append({'kind':kind, 'tier':tier, 'time':time,
                             'angle':p.read(MISSILE,0x64), 'draws':p.trace[:]})
    aimed = []
    for tier in (0,3,6):
        p.u.mem_write(MISSILE, bytes(500*100))
        p.art(6,tier,392,237)
        p.write(ART,0x28,31.);p.write(ART,0x34,1,'B');p.write(ART,0x38,.35)
        p.call(0x2d7e0,[ART,200,200,-1])
        aimed.append({'tier':tier,'angle':p.read(MISSILE,0x64), 'vx':p.read(MISSILE,0x20),'vy':p.read(MISSILE,0x24)})
    assert all(s['angle']==0 for s in aimed)
    result = {'binary_sha256':hashlib.sha256(IMAGE).hexdigest(), 'capacity':50,
              'rng':'Supplied xorshift stream, seed73; active world trembling and two door calls precede missiles. Native random-calls probe confirms empty creep slots consume no RNG. This is not the historical libc generator.',
              'cases':cases, 'drawings':drawings, 'aimedShots':aimed}
    (ROOT / 'research/missile-effects.json').write_text(json.dumps(result, indent=2)+'\n')
    print(f'Captured {len(cases)*120} missile/effect frames, {len(drawings)} drawings; native pool saturates at50 and reuses slot7.')

if __name__ == '__main__': main()
