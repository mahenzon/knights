"""Native purchased-object controls, animation anchors and sound evidence."""
import json
import struct
from extract_enemies import META, ROOT, REGS, f32
from probe_weapons import WeaponProbe, ART, DRAG, DRAG_SCHEMA
from probe_weapon_followup import surface_bindings
from probe_scene import unf
from unicorn.arm_const import UC_ARM_REG_SP
from unicorn import UC_HOOK_CODE


class DragProbe(WeaponProbe):
    def __init__(self):
        self.trace = []
        self.alpha = 1.
        self.blend = 'source-over'
        self.surfaces = {}
        super().__init__()
        for address in (0x7fc8,0x7d40,0x7d20):
            self.u.hook_add(UC_HOOK_CODE,self.ignore,begin=address,end=address)
        for symbol, names in surface_bindings().items():
            for i, name in names.items():
                ptr = 0x1080000 + len(self.surfaces)*32
                self.surfaces[ptr] = name
                self.u.mem_write(META['symbols'][symbol]+4*i, struct.pack('<I',ptr))

    def ignore(self,u,address,size,context):
        args=[u.reg_read(r) for r in REGS]
        stack=struct.unpack('<4I',u.mem_read(u.reg_read(UC_ARM_REG_SP),16))
        if address==0x7fc8:self.alpha=args[1]/255.
        if address==0x7d40:self.blend='screen' # native GL_ONE, GL_ONE_MINUS_SRC_COLOR
        if address==0x7d20:self.blend='source-over'
        if address in (0x7bf4,0x7fec,0x8188):
            ptr=args[3] if address==0x7bf4 else stack[0] if address==0x7fec else stack[2]
            d={'op':{0x7bf4:'blit',0x7fec:'rotated',0x8188:'scaled'}[address],
               'image':self.surfaces.get(ptr,hex(ptr)), 'x':unf(args[1]),'y':unf(args[2]),
               'radians':0 if address==0x7bf4 else unf(args[3])}
            if address==0x8188:d.update(sx=unf(stack[0]),sy=unf(stack[1]),flip=stack[3])
            if self.alpha!=1.:d['alpha']=self.alpha
            if self.blend!='source-over':d['blend']=self.blend
            self.trace.append(d)
        super().ignore(u,address,size,context)

    def state(self):
        return {**self.fields(DRAG,DRAG_SCHEMA),
                **{name:self.read(DRAG,off,fmt) for name,off,fmt in [
                    ('active',0,'B'),('held',3,'B'),('age',12,'f'),('landed',2,'B'),
                    ('target_x',0x30,'f'),('target_y',0x34,'f'),('pressed',0x48,'B'),
                    ('angle',0x3c,'f'),('finished',0x58,'B'),('travel_charge',0x60,'f'),('skip_global_input',0x64,'B')]},
                'device_pressed':self.read(ART,0x34,'B'),'elapsed':self.read(ART,0x28)}

    def release(self,x,y):
        self.call(0x2d7e0,[ART,x,y,-1])
        if self.read(DRAG,0,'B') and not self.read(DRAG,0x64,'B'):
            self.call(0x291a0,[DRAG,x,y])


def main():
    p=DragProbe(); cases=[]
    for kind,tiers,x,y,px,py in [(2,3,315,63,344,76),(4,3,405,38,438,51),(5,4,408,150,447,163)]:
        for tier in range(tiers):
            p.u.mem_write(DRAG,bytes(116*30));p.art(kind,tier,x,y)
            p.write(ART,0x28,31.);p.effects.clear()
            p.call(0x2e084,[ART,px,py]); pressed=p.state()
            if kind==4:
                p.release(px,py)
                p.call(0x2c4e4,[DRAG,f32(1/60)])
                p.call(0x28fdc,[DRAG,200,10]);p.call(0x291b0,[DRAG,200,100])
            else:
                p.call(0x2d254,[ART,200,100,-1])
            moved=p.state()
            for _ in range(6):p.call(0x2c4e4,[DRAG,f32(1/60)])
            held=p.state();p.release(200,100);released=p.state()
            samples=[]
            for frame in range(1,182):
                if p.read(DRAG,0,'B'):p.call(0x2c4e4,[DRAG,f32(1/60)])
                if frame in (1,20,60,120,181):samples.append({'frame':frame,'state':p.state()})
            sounds=[e['args'][:2] for e in p.effects if e['address']=='0x37ba8']
            cases.append({'device':kind,'tier':tier,'pressed':pressed,'moved':moved,'held':held,'released':released,'samples':samples,'sounds':sounds})
    drawings=[]
    for kind,tiers in [(0,3),(1,3),(2,4)]:
        for tier in range(tiers):
            for time in [0.,.1,.8]:
                p.drag(kind,tier);p.write(DRAG,0x3c,.2);p.write(META['symbols']['_g_timef'],0,time)
                p.trace.clear();p.call(0x2c760,[DRAG])
                drawings.append({'kind':kind,'tier':tier,'time':time,'state':p.state(),'draws':p.trace[:]})
    device_drawings=[]
    for kind,tiers,x,y in [(2,3,315,63),(4,3,405,38),(5,4,408,150)]:
        for tier in range(tiers):
            for elapsed in [0.,7.5,31.]:
                p.art(kind,tier,x,y);p.write(ART,0x28,elapsed);p.trace.clear()
                p.call(0x2f2fc,[ART,f32(0)]);p.call(0x2e3b0,[ART]);p.call(0x2e8a0,[ART,f32(0)])
                device_drawings.append({'kind':kind,'tier':tier,'elapsed':elapsed,'draws':p.trace[:]})
    blasts=[]
    for tier in range(4):
        p.drag(2,tier);p.write(DRAG,3,0,'B');p.write(DRAG,12,3.)
        p.effects.clear();samples=[]
        for frame in range(1,4):
            if p.read(DRAG,0,'B'):p.call(0x2c4e4,[DRAG,f32(1/60)])
            samples.append(p.state())
        sounds=[e['args'][:2] for e in p.effects if e['address']=='0x37ba8']
        assert sounds==([] if tier==3 else [[16,1]]*(tier+1)),(tier,sounds)
        blasts.append({'tier':tier,'samples':samples,'sounds':sounds})
    out={'controls':cases,'drawings':drawings,'devices':device_drawings,'blasts':blasts}
    (ROOT/'research/drag-followup.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({'cases':len(cases),'drawings':len(drawings),'devices':len(device_drawings)},indent=2))

if __name__=='__main__':main()
