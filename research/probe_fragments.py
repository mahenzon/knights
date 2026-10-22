"""Execute every original fragment emitter and the shared bounded allocator."""
import hashlib
import json
import struct
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_ice_fragments import IceFragmentsProbe, POOL
from probe_weapons import DRAG
from probe_weapon_followup import surface_bindings
from probe_scene import unf

class FragmentsProbe(IceFragmentsProbe):
    def __init__(self):
        self.emissions=[]
        super().__init__()
        for kind in range(18):
            self.u.mem_write(META['symbols']['_g_fragments']+4*kind,struct.pack('<I',100+kind))

    def ignore(self,u,address,size,context):
        if address==0x31a7c:
            args=[u.reg_read(r) for r in REGS]+list(struct.unpack('<8I',u.mem_read(u.reg_read(UC_ARM_REG_SP),32)))
            self.emissions.append({k:unf(v) if 6<=i<=10 else struct.unpack('<i',struct.pack('<I',v))[0]
                for i,(k,v) in enumerate(zip(['kind','x','y','vx','vy','gravity','spin','size','growth','alpha','fade','blend'],args))})
        super().ignore(u,address,size,context)

    def reset(self):
        self.u.mem_write(POOL,bytes(150*56)); self.emissions=[]; self.effects=[]
        self.rng=73; self.random_calls=0

    def state(self):
        result=self.shards()
        for s in result:
            base=POOL+s['slot']*56
            s.update(gravity=self.read(base,44,'i'),growth=self.read(base,24),alpha=self.read(base,28),
                     fade=self.read(base,32),blend=self.read(base,40,'i'))
        return result

    def record(self,u,address,size,context):
        if address==0x308e8:return
        super().record(u,address,size,context)


def main():
    p=FragmentsProbe();p.real_creep_death=True;cases=[]
    def capture(source,kind,tier=0):
        initial=p.state(); draws=[]
        for s in initial:
            p.draws=[];p.call(0x31648,[POOL+s['slot']*56]); draws+=p.draws
        frames=[]
        for tick in range(1,241):
            for s in p.shards():p.call(0x31584,[POOL+s['slot']*56,f32(1/60)])
            frames.append({'tick':tick,'shards':p.state()})
            if not frames[-1]['shards']:break
        cases.append({'source':source,'kind':kind,'tier':tier,'emissions':[e for e in p.emissions if 'gravity' in e],
            'initial':initial,'draws':draws,'frames':frames,'random_calls':p.random_calls,'rng':p.rng})
    for kind in [4,5,10]:
        p.rng=None;p.init(kind);p.put(8,200.75);p.put(12,240.5);p.reset()
        p.call(0x27534,[SELF]);capture('creep',kind)
    for kind in range(8):
        for tier in range(3 if kind in (0,1) else 1):
            p.rng=None;p.drag(kind,tier,x=200,y=120);p.reset()
            p.call(0x2a030,[DRAG]);capture('projectile',kind,tier)
    land=SELF+0x20000
    for health,damage,destroyed in [(100,10,False),(10,10,False),(10,11,False),(-1,10,True)]:
        p.u.mem_write(land,bytes(0x300));p.write(land,0x28c,health);p.write(land,0x2bc,int(destroyed),'B');p.reset()
        p.call(0x308e8,[land,damage]);capture('castle',damage,int(destroyed))
    sprites=surface_bindings()['_g_fragments']
    for c in cases:
        for s in c['initial']:
            assert (s['gravity'],s['growth'],s['alpha'],s['fade'],s['blend'])==(1000,0,255,0,0),s
    assert len(sprites)==18
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'sprites':sprites,'cases':cases}
    (ROOT/'research/fragments.json').write_text(json.dumps(result,indent=2)+'\n')
    print('sprites',sprites)
    for c in cases: print(c['source'],c['kind'],c['tier'],'count',len(c['initial']),'rng',c['random_calls'],'frames',len(c['frames']),'first',c['emissions'][:1])

if __name__=='__main__':main()
