"""Native barrel/machine blast emitters and smoke animation; research only."""
import hashlib,json,struct
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE,META,REGS,ROOT,SELF,f32
from probe_scene import unf
from probe_weapons import WeaponProbe,DRAG
from probe_weapon_followup import surface_bindings

class SmokeProbe(WeaponProbe):
    def ignore(self,u,address,size,context):
        if address==0x1a090:
            args=[u.reg_read(r) for r in REGS]+list(struct.unpack('<6I',u.mem_read(u.reg_read(UC_ARM_REG_SP),24)))
            self.emissions.append({k:(unf(v) if i in range(5,9) else struct.unpack('<i',struct.pack('<I',v))[0]) for i,(k,v) in enumerate(zip(['kind','x','y','vx','vy','size','growth','alpha','fade','additive'],args))})
        super().ignore(u,address,size,context)

def main():
    p=SmokeProbe();emitters=[]
    for kind in [4,5,6]:
        p.emissions=[];p.drag(kind,x=200,y=240);p.call(0x2a030,[DRAG])
        emitters.append({'source':'projectile','kind':kind,'smokes':p.emissions[:]})
    for tier in range(4):
        for charge in [.4,.5,.8]:
            p.emissions=[];p.drag(2,tier,x=200,y=240);p.write(DRAG,0x28,charge)
            p.call(0x2a030,[DRAG])
            emitters.append({'source':'fireball','kind':tier,'charge':charge,'smokes':p.emissions[:]})
    p.real_creep_death=True
    for kind in [4,5,10]:
        p.init(kind);p.put(8,200);p.put(12,240);p.emissions=[]
        p.call(0x27534,[SELF])
        emitters.append({'source':'creep','kind':kind,'smokes':p.emissions[:]})
    timelines=[]
    for e in emitters:
        for initial in e['smokes']:
            p.call(0x19fb0,[SELF,initial['kind'],initial['x'],initial['y']],
                   [initial['vx'],initial['vy']]+[f32(initial[k]) for k in ['size','growth','alpha','fade']]+[initial['additive']])
            states=[]
            for frame in range(1,241):
                p.call(0x1a004,[SELF,f32(1/60)])
                state={'tick':frame,'active':p.get(0,'B'),'x':p.get(4,'i'),'y':p.get(8,'i'),
                       'size':p.get(0x14),'alpha':p.get(0x1c)}
                states.append(state)
                if not state['active']:break
            timelines.append({'initial':initial,'frames':states})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'sprites':surface_bindings()['_g_smoke'],'emitters':emitters,'timelines':timelines}
    (ROOT/'research/smoke-data.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(emitters,indent=2));assert emitters[0]['smokes']
if __name__=='__main__':main()
