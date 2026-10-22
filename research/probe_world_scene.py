"""Combined native battlefield draw stream; excludes HUD, waves and legacy particles/text."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR
from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_drag_cycle import DragCycleProbe
from probe_frame_phase import PHASES
from probe_land import LandProbe, LAND
from probe_scene import unf
from probe_sacrifices import ART
from probe_weapons import CREEP, DRAG, MISSILE


class WorldSceneProbe(DragCycleProbe):
    get_land = LandProbe.get_land
    put_land = LandProbe.put_land

    def __init__(self):
        self.commands = []; self.emissions = []; self.matrix = [1,0,0,1,0,0]; self.matrices = []
        self.color = [255]*4; self.clip = None; self.clipping = False
        self.blend_factors = [0x302,0x303]
        super().__init__()
        pointer = self.get_at(0x28fc0, 0, 'I')
        self.u.mem_write(pointer, struct.pack('<I', LAND))
        for addr in (0x7b10, 0x7dc4):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=addr, end=addr)

    def phase(self, u, address, *args):
        if address in (0x30bbc,0x305ac,0x303a8,0x1b28c,0x31758,0x1a304):
            self.phases.append(PHASES[address]); return
        super().phase(u,address,*args)

    def extra_hook(self,u,address,*args):
        if address in (0x31a7c,0x308e8): return
        if address == 0x7fc8:
            self.color = [255,255,255,u.reg_read(REGS[1])&255]
        super().extra_hook(u,address,*args)

    def import_hook(self,u,address,*args):
        name = META['imports'].get(address)
        values = [u.reg_read(r) for r in REGS]
        if name == '_glColor4ub': self.color = [v&255 for v in values]
        if name == '_glBlendFunc':
            pair = values[:2]
            self.blend_factors = pair
            assert pair in ([1,0x301],[1,0x303],[0x302,0x303],[0x302,1]), pair
            self.blend = 'screen' if pair==[1,0x301] else 'lighter' if pair==[0x302,1] else 'source-over'
        if name == '_glScissor': self.clip = values
        if name in ('_glEnable','_glDisable') and values[0]==0xc11:
            self.clipping = name=='_glEnable'
        if name == '_glPushMatrix': self.matrices.append(self.matrix[:])
        if name == '_glPopMatrix': self.matrix = self.matrices.pop()
        if name == '_glTranslatef':
            x,y = map(unf,values[:2]); a,b,c,d,e,f = self.matrix
            self.matrix = [a,b,c,d,e+a*x+c*y,f+b*x+d*y]
        if name == '_glScalef':
            x,y = map(unf,values[:2]); a,b,c,d,e,f = self.matrix
            self.matrix = [a*x,b*x,c*y,d*y,e,f]
        super().import_hook(u,address,*args)

    def ignore(self,u,address,*args):
        if address in (0x7d40,0x7d20):
            self.blend_factors = [1,0x301] if address==0x7d40 else [0x302,0x303]
        if address == 0x1a090:
            a=[u.reg_read(r) for r in REGS]+list(struct.unpack('<6I',u.mem_read(u.reg_read(UC_ARM_REG_SP),24)))
            self.emissions.append({k:unf(v) if 5<=i<=8 else v if v<0x80000000 else v-0x100000000
                for i,(k,v) in enumerate(zip(['kind','x','y','vx','vy','size','growth','alpha','fade','additive'],a))}
                | {'caller':hex(u.reg_read(UC_ARM_REG_LR)-4)})
            return
        if address in (0x7bf4,0x7fec,0x8188,0x7b10,0x7dc4):
            a = [u.reg_read(r) for r in REGS]
            s = struct.unpack('<4I',u.mem_read(u.reg_read(UC_ARM_REG_SP),16))
            op = {0x7bf4:'blit',0x7fec:'rotated',0x8188:'scaled',0x7b10:'stretch',0x7dc4:'scaled'}[address]
            ptr = a[3] if address==0x7bf4 else s[0] if address==0x7fec else s[2] if address==0x8188 else s[1]
            if ptr:
                command = {'op':op,'image':self.surfaces[ptr], 'x':unf(a[1]),'y':unf(a[2]),
                           'color':self.color[:], 'blend':self.blend, 'blend_factors':self.blend_factors[:],
                           'clip':self.clip[:] if self.clipping else None,
                           'matrix':self.matrix[:], 'phase':self.phases[-1]}
                if address in (0x7fec,0x8188): command['radians'] = unf(a[3])
                if address == 0x8188: command.update(sx=unf(s[0]),sy=unf(s[1]))
                if address == 0x7dc4: command.update(sx=unf(a[3]),sy=unf(s[0]),radians=0)
                if address == 0x7b10: command.update(x2=unf(a[3]),y2=unf(s[0]))
                if address == 0x7bf4 and s[1]: command['crop'] = list(struct.unpack('<4h',u.mem_read(s[0],8)))
                self.commands.append(command)
        super().ignore(u,address,*args)

    def setup(self, theme, reverse, ready):
        self.reset(); self.commands=[]; self.phases=[]
        self.u.mem_write(ART,bytes(25*0x98)); self.u.mem_write(MISSILE,bytes(100*500))
        self.u.mem_write(META['symbols']['_Smokes'],bytes(50*56))
        self.u.mem_write(META['symbols']['_Fragments'],bytes(150*56))
        self.call(0x19b60,[META['symbols']['_Player']])
        for off in (0x64,0x80,0x84): self.u.mem_write(META['symbols']['_Player']+off,bytes(4))
        self.u.mem_write(META['symbols']['_Player']+0x12c,bytes([reverse]))
        self.call(0x17020,[theme])
        LandProbe.init_land(self,30)
        self.put_land(0x28c,100000)
        initial_land = LandProbe.state(self)
        devices = []
        for slot,kind,tier,x,y in [(0,0,0,35,30),(1,3,0,173,210),(2,2,2,315,63),
                                  (3,4,1,405,38),(4,5,3,408,150),(5,6,0,392,237),
                                  (6,7,1,180,260),(10,8,2,432,142)]:
            ptr = ART+slot*0x98
            self.call(0x2ce80,[ptr,x,y,kind],[tier])
            elapsed = 31. if ready else max(0,self.get_at(ptr,0x24)-.25)
            self.u.mem_write(ptr+0x28,struct.pack('<f',elapsed))
            devices.append(dict(slot=slot,kind=kind,tier=tier,x=x,y=y,elapsed=elapsed))
        for kind in range(11):
            self.init(kind); self.put(8,170+kind*19); self.put(12,225+kind*3); self.put(16,225+kind*3)
            self.put(0x88,0,'i'); self.put(0x8c,0,'i'); self.put(0xc4,-10000); self.put(0xe0,99)
            self.put(4,kind%2,'B')
            self.u.mem_write(CREEP+kind*256,bytes(self.u.mem_read(SELF,256)))
        initial_actors = [self.actor_state(i) for i in range(11)]
        for slot,kind,tier,x,y in [(0,0,theme%3,325,120),(1,1,theme%3,260,120),
                                 (2,2,theme,340,130),(3,4,0,220,250)]:
            ptr=DRAG+slot*116
            self.call(0x29bb0,[ptr,x,y,kind],[tier]); self.u.mem_write(ptr+3,b'\0')
            if kind==1: self.u.mem_write(ptr+0x24,struct.pack('<f',1000.))
        initial_objects = [dict(slot=i,**{key:self.get_at(DRAG+i*116,off,fmt) for key,off,fmt in [
            ('kind',8,'I'),('tier',0x68,'I'),('x',0x18,'f'),('y',0x1c,'f'),('vx',0x20,'f'),('vy',0x24,'f'),
            ('lifetime',0x10,'f'),('gravity',0x14,'f'),('size',0x6c,'f'),('charge',0x28,'f'),('counter',0x5c,'i'),
            ('target_x',0x30,'f'),('target_y',0x34,'f')]}) for i in range(4)]
        self.u.mem_write(META['symbols']['_g_trembling'],struct.pack('<f',4.))
        self.u.mem_write(META['symbols']['_g_shiftX'],bytes(4))
        self.u.mem_write(META['symbols']['_g_shiftY'],bytes(4))
        frames=[]
        for tick in range(1,451):
            self.commands=[]; self.emissions=[]; self.actor_draws=[]; self.smokes=[]; self.fragments=[]
            self.step_frame()
            if tick <= 60 or tick in (120,240,419,420,421,450):
                smokes = [dict(slot=i,**{key:self.get_at(META['symbols']['_Smokes']+i*44,off,fmt)
                          for key,off,fmt in [('kind',0x24,'I'),('x',4,'i'),('y',8,'i'),('size',20,'f'),
                                              ('growth',24,'f'),('alpha',28,'f'),('fade',32,'f')]})
                          for i in range(50) if self.get_at(META['symbols']['_Smokes']+i*44,0,'B')]
                frames.append({'tick':tick,'draws':self.commands[:],'land':LandProbe.state(self),'smokes':smokes,'emissions':self.emissions[:]})
        return dict(theme=theme,reverse=reverse,ready=ready,land=initial_land,devices=devices,
                    actors=initial_actors,objects=initial_objects,frames=frames)


def main():
    p=WorldSceneProbe(); cases=[]
    for theme in range(4):
        for reverse in (0,1):
            c=p.setup(theme,reverse,theme%2);cases.append(c)
            print(theme,reverse,len(c['frames']),len(c['frames'][0]['draws']),flush=True)
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
            'scope':'Native world loop, landscape/castle/devices/actors/objects/missiles/fragments/smoke drawing and processing. '
                    'Wave generation, HUD, legacy generic particles/text and external audio intercepted. '
                    'rand0 and stable host qsort; no GPU framebuffer/rasterization emulation.'}
    (ROOT/'research/world-scene.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')


if __name__=='__main__': main()
