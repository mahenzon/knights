"""Original enemy sprite bindings and ability timelines; research only."""
import hashlib
import json
import re
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, NAMES, REGS, ROOT, SELF, f32
from probe_weapon_followup import WeaponScene


class EnemyProbe(WeaponScene):
    def __init__(self):
        self.heap=SELF+0x30000
        super().__init__()
        for address in (0x8ffc,0x8e40):
            self.u.hook_add(UC_HOOK_CODE,self.loader_hook,begin=address,end=address)

    def string(self,ptr):
        return bytes(self.u.mem_read(ptr,512)).split(b'\0')[0].decode()

    def loader_hook(self,u,address,size,context):
        if address==0x8ffc:
            pointer=struct.unpack('<I',u.mem_read(u.reg_read(REGS[1])+8,4))[0]
            self.surfaces[u.reg_read(REGS[0])]=self.string(pointer)+'.png'
        self.ret(u)

    def import_hook(self,u,address,size,context):
        name=META['imports'].get(address,'')
        if name=='__Znwm':
            count=u.reg_read(REGS[0]);u.reg_write(REGS[0],self.heap)
            self.heap+=(count+15)//16*16;assert self.heap<SELF+0x70000
            self.ret(u)
        elif name in ('__Unwind_SjLj_Register','__Unwind_SjLj_Unregister','__ZdlPv'):
            self.ret(u)
        elif name=='_sprintf':
            target=u.reg_read(REGS[0]);fmt=self.string(u.reg_read(REGS[1]))
            args=[u.reg_read(REGS[2]),u.reg_read(REGS[3])]+list(struct.unpack('<8I',u.mem_read(u.reg_read(UC_ARM_REG_SP),32)))
            tokens=re.findall(r'%(?:0?\d*)[sdiu]',fmt)
            values=tuple(self.string(v) if t.endswith('s') else v for t,v in zip(tokens,args))
            result=(fmt%values).encode()+b'\0';u.mem_write(target,result);u.reg_write(REGS[0],len(result)-1);self.ret(u)
        else:super().import_hook(u,address,size,context)

    def load_enemies(self):
        player=META['symbols']['_Player']
        self.u.mem_write(player+0x1d4,struct.pack('<I',11))
        self.u.mem_write(player+0x184,struct.pack('<11I',*range(11)))
        self.call(0xea64,[])
        pointer=META['symbols']['_g_creeps']
        return [[[self.surfaces.get(struct.unpack('<I',self.u.mem_read(pointer+4*(kind*180+anim*15+frame),4))[0])
                  for frame in range(15)] for anim in range(12)] for kind in range(11)]

    def actor(self):
        return {name:self.get(offset,fmt) for name,offset,fmt in (
            ('active',0,'B'),('dead',1,'B'),('x',8,'f'),('y',12,'f'),('vx',0x1c,'f'),('vy',0x20,'f'),
            ('animation',0x50,'I'),('frame',0x4c,'f'),('speed',0x88,'i'),('saved_speed',0x8c,'i'),
            ('shield',0xa8,'B'),('flying',0xa9,'B'),('immunity',0xaa,'B'),('alpha',0xbc,'f'),
            ('ability_delay',0xe0,'f'),('ability_active',0xe4,'B'),('ability_remaining',0xe8,'f'),('ability_done',0xec,'B'))}


def main():
    p=EnemyProbe();bindings=p.load_enemies()
    assert bindings[0][0][0]=='knight_lite_go_0001.png',bindings[0][0]
    timelines=[]
    for kind in (1,6,7,8,9):
        p.init(kind);p.put(8,-500);p.put(0xe0,-1)
        initial=p.actor()
        states=[]
        for frame in range(1,481):
            p.call(0x283ec,[SELF,f32(1/60)])
            states.append({'tick':frame,**p.actor()})
        timelines.append({'kind':kind,'initial':initial,'frames':states})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'animation_bindings':bindings,'abilities':timelines}
    (ROOT/'research/enemy-followup.json').write_text(json.dumps(result,indent=2)+'\n')
    wizard=next(t['frames'] for t in timelines if t['kind']==6)
    print('Native sprites:',sum(bool(n) for k in bindings for a in k for n in a))
    for t in timelines:
        previous=None;changes=[]
        for s in t['frames']:
            status=(s['animation'],s['shield'],s['ability_active'],s['ability_done'])
            if status!=previous:changes.append((s['tick'],status));previous=status
        print(NAMES[t['kind']],changes[:16])
    assert not wizard[0]['shield'] and wizard[0]['animation']==10


if __name__=='__main__':main()
