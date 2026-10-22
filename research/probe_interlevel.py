"""Original between-day screens and purchase-dialog drawing; research only."""
import hashlib,json,struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE,META,ROOT,SELF,REGS,f32
from probe_shop import ShopProbe,SHOP

class InterlevelProbe(ShopProbe):
    def __init__(self):
        super().__init__()
        self.u.mem_write(SELF+0x80000+0x1408,struct.pack('<f',1))
        for address in [0x850c,0x82a0]:self.u.hook_add(UC_HOOK_CODE,self.dialog_hook,begin=address,end=address)
    def dialog_hook(self,u,address,size,context):
        if address==0x850c:
            a=[u.reg_read(r) for r in REGS];ptr=struct.unpack('<I',u.mem_read(u.reg_read(UC_ARM_REG_SP),4))[0]
            from probe_scene import unf
            self.trace.append({'op':'text','text':self.string(ptr),'x':unf(a[1]),'y':unf(a[2]),'align':a[3],'rgb':[255,255,255],'size':unf(struct.unpack('<I',u.mem_read(a[0]+0x1408,4))[0])})
        self.ret(u)
    def import_hook(self,u,address,size,context):
        if META['imports'].get(address)=='_memcpy':
            dest,source,count=[u.reg_read(r) for r in REGS[:3]]
            u.mem_write(dest,bytes(u.mem_read(source,count)));self.ret(u)
        else:super().import_hook(u,address,size,context)

def main():
    p=InterlevelProbe();player=META['symbols']['_Player'];land=META['symbols']['_Land']
    p.u.hook_add(UC_HOOK_CODE,lambda u,*args:p.ret(u),begin=0x1d2a8,end=0x1d2a8)
    for ptr,name in list(p.surfaces.items()):
        if not (ROOT/'dist/assets'/name).exists() and (ROOT/'dist/assets'/name.replace('.png','.jpg')).exists():p.surfaces[ptr]=name.replace('.png','.jpg')
    p.u.mem_write(player+0x88,b'\0')
    screens=[]
    for phase,day in [('shop',1),('complete',8),('failed',3)]:
        p.u.mem_write(land+0x2dc,bytes([int(phase!='failed')]))
        p.u.mem_write(land+0x2dd,bytes([int(phase=='failed')]))
        p.u.mem_write(player+0x130,struct.pack('<2I',day,8))
        p.u.mem_write(player+0x80,struct.pack('<2I',2468,12))
        p.u.mem_write(player+0x64,struct.pack('<3I',12345,53,7))
        p.buttons=[];p.call(0x20458,[SHOP]);p.trace=[]
        p.call(0x224c4,[SHOP,f32(0)])
        screens.append({'phase':phase,'day':day,'kills':53,'day_kills':7,'buttons':p.buttons[:],'draws':p.trace[:]})
    dialog=SELF+0x71000
    p.call(0x3499c,[dialog,0]);p.u.mem_write(dialog+0x14,struct.pack('<2f',1,1))
    p.u.mem_write(dialog+0x2ca,b'Steel Door\0')
    for offset in [0x4c4,0x548]:p.u.mem_write(dialog+offset+0x28,struct.pack('<f',1))
    p.trace=[];p.call(0x345a8,[dialog,0])
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'screens':screens,'purchase':p.trace}
    (ROOT/'research/interlevel-data.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'screens':len(screens),'purchase':p.trace},indent=2))
if __name__=='__main__':main()
