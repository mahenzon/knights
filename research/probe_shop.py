"""Original shop layout, item sprites, scrolling draw calls and controls; research only."""
import hashlib,json,struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE,META,REGS,ROOT,SELF,f32
from probe_hud import HudProbe
from probe_scene import unf

SHOP=SELF+0x70000
class ShopProbe(HudProbe):
    def __init__(self):
        super().__init__();self.buttons=[]
        self.u.mem_write(META['symbols']['_FontInterface'],struct.pack('<I',SELF+0x80000))
        for a in (0x1cb44,0x1d5f4,0x38164,0x7dc4):self.u.hook_add(UC_HOOK_CODE,self.shop_hook,begin=a,end=a)
        for ptr,name in self.surfaces.items():
            if name=='shop_background.png':self.surfaces[ptr]='shop_background.jpg'
    def shop_hook(self,u,address,size,context):
        a=[u.reg_read(r) for r in REGS];stack=list(struct.unpack('<5I',u.mem_read(u.reg_read(UC_ARM_REG_SP),20)))
        if address==0x1d5f4:self.buttons.append({'rect':a,'text':self.string(stack[1]),'normal':self.surfaces.get(stack[2]),'pressed':self.surfaces.get(stack[3])})
        if address==0x7dc4:self.trace.append({'op':'scaled','image':self.surfaces.get(stack[1],hex(stack[1])),'x':unf(a[1]),'y':unf(a[2]),'sx':unf(a[3]),'sy':unf(stack[0]),'alpha':self.alpha/255})
        self.ret(u)
    def ignore(self,u,address,size,context):
        if address==0x879c:
            a=[u.reg_read(r) for r in REGS];stack=list(struct.unpack('<4I',u.mem_read(u.reg_read(UC_ARM_REG_SP),16)))
            self.trace.append({'op':'text','text':self.string(stack[0]),'x':unf(a[1]),'y':unf(a[2]),'align':a[3],'rgb':stack[1:],'size':unf(struct.unpack('<I',u.mem_read(a[0]+0x1408,4))[0])});self.ret(u)
        else:super().ignore(u,address,size,context)

def main():
    p=ShopProbe();player=META['symbols']['_Player'];p.u.mem_write(player+0x22c,bytes(6))
    p.u.mem_write(player+0x8c,struct.pack('<20i',0,*([-1]*19)));p.call(0x32cfc,[SHOP])
    layout=[]
    for i in range(200):
        a=META['symbols']['_ShopItems']+i*0x164
        active=p.u.mem_read(a,1)!=b'\0'
        values=struct.unpack('<9I',p.u.mem_read(a+0x13c,36))
        if not active and not values[2]:continue
        layout.append({'index':i,'active':active,'x':values[0],'y':values[1],'width':values[2],'height':values[3],
                       'scale':unf(values[5]),'bounce':unf(values[6]),'image':p.surfaces.get(values[8],hex(values[8]))})
    states=[]
    for disabled in [False,True]:
        p.u.mem_write(player+0x22d,bytes([int(disabled)]));p.call(0x32cfc,[SHOP])
        for gold in [0,10000]:
            p.u.mem_write(player+0x80,struct.pack('<2I',gold,100))
            for offset in [0,-300,-650,-1000]:
                p.u.mem_write(SHOP+0x20,struct.pack('<f',offset));p.trace=[]
                p.call(0x32760,[SHOP,f32(0)])
                positions={v['index']:struct.unpack('<i',p.u.mem_read(META['symbols']['_ShopItems']+v['index']*0x164+0x14c,4))[0] for v in layout if v['active']}
                states.append({'sacrificers_disabled':disabled,'gold':gold,'offset':offset,'positions':positions,'draws':p.trace[:]})
    restrictions=[]
    for mask in [0,1,2,4,8,16,32,63]:
        p.u.mem_write(player+0x22c,bytes((mask>>i)&1 for i in range(6)));p.call(0x32cfc,[SHOP])
        records=[]
        for i in range(200):
            a=META['symbols']['_ShopItems']+i*0x164
            active=p.u.mem_read(a,1)!=b'\0';width=struct.unpack('<I',p.u.mem_read(a+0x144,4))[0]
            if active or width:records.append({'index':i,'active':active,'width':width})
        p.u.mem_write(SHOP+0x20,bytes(4));p.trace=[];p.call(0x32760,[SHOP,f32(0)])
        restrictions.append({'mask':mask,'records':records,'headings':[d for d in p.trace if d['op']=='text' and d['y']==48]})
    p.u.mem_write(player+0x22c,bytes(6));p.call(0x32cfc,[SHOP])
    motion=[]
    for frame in range(1,121):
        p.trace=[];p.call(0x32760,[SHOP,f32(1/60)])
        motion.append({'frame':frame,'offset':unf(struct.unpack('<I',p.u.mem_read(SHOP+0x20,4))[0]),'velocity':unf(struct.unpack('<I',p.u.mem_read(SHOP+0x30,4))[0])})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'layout':layout,'buttons':p.buttons[:1],'states':states,'restrictions':restrictions,'motion':motion}
    (ROOT/'research/shop-layout.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'buttons':result['buttons'],'records':len(layout),'active':sum(v['active'] for v in layout)}))
    assert sum(v['active'] for v in layout)==23 and all(not v['image'].startswith('0x') for v in layout if v['active'])
if __name__=='__main__':main()
