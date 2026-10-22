"""Original castle drawing, hit flash/shake and post-breach enemy behavior."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_land import LandProbe, LAND
from probe_weapon_followup import surface_bindings

CREEPS=META['symbols']['_Creeps']
class CastleProbe(LandProbe):
    def __init__(self):
        self.random_calls=0
        super().__init__()
        self.call(0x17020,[0])
        for addr in [0x7d20,0x31a7c]:self.u.hook_add(UC_HOOK_CODE,self.ignore,begin=addr,end=addr)
        for symbol in ['_g_castle','_g_castleArc','_g_door']:
            for i,asset in surface_bindings()[symbol].items():
                ptr=self.alloc;self.alloc+=256;self.surfaces[ptr]=asset
                self.u.mem_write(META['symbols'][symbol]+4*i,struct.pack('<I',ptr))

    def import_hook(self,u,address,size,context):
        name=META['imports'].get(address,'')
        if name=='_rand':
            x=self.seed;x=(x^(x<<13))&0xffffffff;x^=x>>17;x=(x^(x<<5))&0xffffffff
            self.seed=x;self.random_calls+=1;u.reg_write(UC_ARM_REG_R0,x&0x7fffffff);self.ret(u)
        elif name=='_glBlendFunc' and [u.reg_read(r) for r in REGS[:2]]==[0x302,1]:
            self.blend='lighter';self.ret(u)
        else:super().import_hook(u,address,size,context)

    def ignore(self,u,address,size,context):
        if address==0x306e8:return
        if address==0x7d20:self.blend='source-over'
        super().ignore(u,address,size,context)

    def door(self):
        return {k:self.get_land(off,fmt) for k,off,fmt in [('shake',0x20,'f'),('age',0x24,'f'),('hp',0x28c,'f'),('broken',0x2bc,'B'),('immune',0x2bd,'B')]}

    def setup(self,tier,immune=False):
        self.init_land(60)
        for i in range(10):self.put_land(0x30+i*20,0,'B')
        self.u.mem_write(META['symbols']['_Player']+0x8c,struct.pack('<I',tier))
        self.put_land(0x28c,100);self.put_land(0x2bd,int(immune),'B')
        self.seed=73;self.random_calls=0

    def castle_draw(self):
        self.trace=[];self.color=[255]*4;self.blend='source-over'
        self.call(0x306e8,[LAND]);return self.trace[:]


def main():
    p=CastleProbe();cases=[]
    for tier in range(5):
        for immune in [False,True]:
            p.setup(tier,immune);initial=p.door();frames=[]
            for tick in range(1,121):
                draws=p.castle_draw();before=p.door()
                hits=[10] if tick in [1,2,4,20] else [31,40] if tick==30 else []
                for damage in hits:p.call(0x308e8,[LAND,damage])
                after_hit=p.door()
                p.trace=[];p.call(0x305ac,[LAND]);after=p.trace[:]
                p.call(0x303a8,[LAND,f32(1/60)])
                frames.append({'tick':tick,'draws':draws,'before':before,'hits':hits,'after_hit':after_hit,'after_draws':after,'state':p.door(),'rng':p.seed,'random_calls':p.random_calls})
            cases.append({'tier':tier,'immune':immune,'initial':initial,'frames':frames})
    # DrawAfter changes all 200 slots after the door breaks, then living enemies enter.
    p.setup(0)
    slots=[]
    for index,kind in enumerate([0,2,4,5,6,7,8,9,10]):
        p.init(kind);p.put(8,340);p.put(12,240);p.put(16,240);p.put(0xe0,100)
        p.u.mem_write(CREEPS+index*256,bytes(p.u.mem_read(SELF,256)))
        slots.append(index)
    p.u.mem_write(0xc7528,struct.pack('<I',CREEPS))
    p.put_land(0x2bc,1,'B');p.trace=[];p.call(0x305ac,[LAND])
    actors=[]
    for i in slots:
        base=CREEPS+i*256
        def read(off,fmt='f'):return struct.unpack('<'+fmt,p.u.mem_read(base+off,struct.calcsize(fmt)))[0]
        initial={'x':read(8),'speed':read(0x88,'i'),'range':read(0xc4)}
        p.call(0x283ec,[base,f32(1/60)])
        actors.append({'kind':read(0x48,'I'),'initial':initial,'x':read(8),'speed':read(0x88,'i'),'range':read(0xc4),'animation':read(0x50,'I')})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,'breach':{'draws':p.trace,'actors':actors}}
    (ROOT/'research/castle.json').write_text(json.dumps(result,indent=2)+'\n')
    print('cases',len(cases),'frames',sum(len(c['frames']) for c in cases),'initial',cases[0]['initial'])
    print('first draws',cases[0]['frames'][0]['draws']);print('hit draws',cases[0]['frames'][1]['draws']);print('breach',actors)

if __name__=='__main__':main()
