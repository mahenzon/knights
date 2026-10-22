"""Execute original day/night, cloud and landscape drawing routines; research only."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_sacrifices import SacrificeProbe
from probe_scene import unf
from probe_weapon_followup import surface_bindings

LAND = SELF + 0x20000


class LandProbe(SacrificeProbe):
    def __init__(self):
        self.surfaces = {}
        self.trace = []
        self.color = [255]*4
        self.blend = 'source-over'
        self.alloc = SELF + 0x60000
        self.seed = 73
        super().__init__()
        for address in (0x8ffc, 0x8e40, 0x7b10, 0x7dc4, 0x7fc8, 0x306e8):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)
        for name, values in surface_bindings().items():
            if name not in ('_g_sun','_g_star'):continue
            for i, asset in values.items():
                ptr=self.alloc;self.alloc+=256;self.surfaces[ptr]=asset
                self.u.mem_write(META['symbols'][name]+4*i,struct.pack('<I',ptr))
        # Land uses the same global display indirection as the other isolated probes.
        self.u.mem_write(LAND, bytes(0x300))

    def ret(self,u):
        u.reg_write(UC_ARM_REG_PC,u.reg_read(UC_ARM_REG_LR))

    def import_hook(self,u,address,size,context):
        name=META['imports'].get(address,'')
        if name=='_rand':
            self.seed=(self.seed*1103515245+12345)&0x7fffffff
            u.reg_write(UC_ARM_REG_R0,self.seed);self.ret(u)
        elif name=='__Znwm':
            u.reg_write(UC_ARM_REG_R0,self.alloc);self.alloc+=256;self.ret(u)
        elif name in ('__Unwind_SjLj_Register','__Unwind_SjLj_Unregister','__ZdlPv'):
            self.ret(u)
        elif name=='_glBlendFunc':
            src,dst=[u.reg_read(r) for r in REGS[:2]]
            assert (src,dst) in [(1,0x301),(1,0x303),(0x302,0x303)]
            self.blend='screen' if (src,dst)==(1,0x301) else 'source-over';self.ret(u)
        elif name=='_glColor4ub':
            self.color=[u.reg_read(r)&255 for r in REGS];self.ret(u)
        else:super().import_hook(u,address,size,context)

    def ignore(self,u,address,size,context):
        args=[u.reg_read(r) for r in REGS]
        stack=struct.unpack('<4I',u.mem_read(u.reg_read(UC_ARM_REG_SP),16))
        if address==0x8ffc:
            ptr=struct.unpack('<I',u.mem_read(args[1]+8,4))[0]
            self.surfaces[args[0]]=bytes(u.mem_read(ptr,200)).split(b'\0')[0].decode()+'.png'
        elif address==0x7fc8:self.color=[255,255,255,args[1]&255]
        elif address in (0x7bf4,0x7b10,0x7dc4):
            ptr=args[3] if address==0x7bf4 else stack[1]
            draw={'op':{0x7bf4:'blit',0x7b10:'stretch',0x7dc4:'scaled'}[address],
                  'image':self.surfaces.get(ptr,hex(ptr)), 'x':unf(args[1]), 'y':unf(args[2]),
                  'color':self.color[:], 'blend':self.blend}
            if address==0x7b10:draw.update(x2=unf(args[3]),y2=unf(stack[0]))
            if address==0x7dc4:draw.update(sx=unf(args[3]),sy=unf(stack[0]))
            if address==0x7bf4 and stack[1]:draw['crop']=list(struct.unpack('<4h',u.mem_read(stack[0],8)))
            self.trace.append(draw)
        self.ret(u)

    def put_land(self,offset,value,fmt='f'):
        self.u.mem_write(LAND+offset,struct.pack('<'+fmt,value))

    def get_land(self,offset,fmt='f'):
        return struct.unpack('<'+fmt,self.u.mem_read(LAND+offset,struct.calcsize(fmt)))[0]

    def state(self):
        return {**{name:self.get_land(off,fmt) for name,off,fmt in (
            ('duration',0,'f'),('elapsed',4,'f'),('remaining',8,'f'),('theme',12,'i'),
            ('current',16,'i'),('next',20,'i'),('fadeOut',24,'f'),('fadeIn',28,'f'),
            ('angle',40,'f'),('targetAngle',44,'f'))},
            'clouds':[[self.get_land(0x30+i*20,'B')]+[self.get_land(0x34+i*20+j*4) for j in range(4)] for i in range(10)],
            'stars':[[self.get_land(0xf8+i*8+j*4,'i') for j in range(2)] for i in range(30)]}

    def init_land(self,duration):
        self.u.mem_write(LAND,bytes(0x300));self.seed=73
        self.u.mem_write(META['symbols']['_Player']+0x138,struct.pack('<i',duration))
        self.call(0x312b8,[LAND])
        self.put_land(0x2dc,1,'B') # suppress menu transition only, keep original land timer

    def draws(self):
        self.trace=[];self.color=[255]*4;self.blend='source-over'
        self.call(0x30bbc,[LAND]);self.call(0x305ac,[LAND])
        return self.trace[:]


def main():
    p=LandProbe();themes=[]
    for theme in range(4):
        p.call(0x17020,[theme])
        bindings={name:{str(i):p.surfaces.get(struct.unpack('<I',p.u.mem_read(address+4*i,4))[0]) for i in range(n)}
                  for name,n in [('_g_backgroundBack',24),('_g_clouds',4),('_g_background',4),('_g_backgroundFront',4),('_g_sun',1),('_g_star',1)]
                  if (address:=META['symbols'].get(name))}
        p.init_land(50)
        draws=[]
        for state in range(4):
            for fade in (0,128,255):
                p.put_land(40,[2.1991147994995117,3.1415927410125732,4.263589859008789,6.2831854820251465][state]);p.put_land(16,state,'i');p.put_land(20,state if fade==0 else (state+1)%4,'i');p.put_land(28,fade)
                draws.append({'current':state,'next':p.get_land(20,'i'),'fadeIn':fade,'state':p.state(),'draws':p.draws()})
        themes.append({'theme':theme,'bindings':bindings,'drawings':draws})
    timelines=[];gameplay_draw_timeline=[]
    for duration in (30,50,90,300):
        p.init_land(duration);initial=p.state();samples=[{'frame':0,'state':initial}];transitions=[]
        for frame in range(1,duration*60+1):
            before=(p.get_land(16,'i'),p.get_land(20,'i'))
            p.call(0x303a8,[LAND,f32(1/60)])
            after=(p.get_land(16,'i'),p.get_land(20,'i'))
            if duration==30:
                state=p.state();draws=p.draws()
                assert p.state()==state, 'Draw must not advance the original day clock or sun'
                if frame%60==0 or before!=after:
                    sun=next(d for d in draws if d['image']=='sun.png')
                    gameplay_draw_timeline.append({'frame':frame,'elapsed':state['elapsed'],
                                                   'current':state['current'],'next':state['next'],
                                                   'sun':{k:sun[k] for k in ('x','y')}})
            if before!=after:transitions.append({'frame':frame,'from':list(before),'to':list(after)})
            if frame%120==0 or before!=after or frame in (119,120,121,122):samples.append({'frame':frame,'state':p.state()})
        timelines.append({'duration':duration,'initial':initial,'transitions':transitions,'samples':samples})
    assert all(len(t['drawings'])==12 for t in themes)
    assert timelines[1]['transitions'][0]['frame']==420
    assert all(d['image']!='0x0' for t in themes for fixture in t['drawings'] for d in fixture['draws'])
    out={'rng':'Supplied deterministic 31-bit LCG stream, initial seed73; not historical RNG recovery','source_sha256':hashlib.sha256(IMAGE).hexdigest(),'themes':themes,'timelines':timelines,'gameplay_draw_timeline':gameplay_draw_timeline}
    (ROOT/'research/land-data.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({'themes':len(themes),'drawings':sum(len(t['drawings']) for t in themes),
                      'transitions':[{k:t[k] for k in ('duration','transitions')} for t in timelines]},indent=2))


if __name__=='__main__':main()
