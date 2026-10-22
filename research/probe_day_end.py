"""Execute original normalGame transition, flag and land victory logic; research only."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_PC, UC_ARM_REG_LR, UC_ARM_REG_SP
from extract_enemies import META, IMAGE, ROOT, SELF, REGS, f32
from probe_land import LandProbe, LAND
from probe_scene import unf

GAME = SELF + 0x70000
NATIVE_LAND = META['symbols']['_Land']


class EndProbe(LandProbe):
    def __init__(self):
        super().__init__()
        self.frame = 0
        self.world_frames = 0
        self.switches = []
        self.advance_land = True
        for address in (0x6d68, 0x1e6c8, 0x1d780, 0x7b98, 0x879c, 0x31a7c):
            self.u.hook_add(UC_HOOK_CODE, self.end_hook, begin=address, end=address)
        self.u.mem_write(0xf5450, bytes(4))  # current mode index
        self.u.mem_write(0xf53fc, struct.pack('<I', GAME))  # mode table
        self.u.mem_write(META['symbols']['_FontInterface'], struct.pack('<I', SELF+0x80000))
        flag = SELF+0x90000
        self.surfaces[flag] = 'flag.png'
        self.u.mem_write(META['symbols']['_g_flag'], struct.pack('<I', flag))

    def end_hook(self, u, address, size, context):
        if address == 0x6d68:
            self.world_frames += 1
            if self.advance_land:
                u.reg_write(REGS[1], u.reg_read(REGS[0]))
                u.reg_write(REGS[0], NATIVE_LAND)
                u.reg_write(UC_ARM_REG_PC, 0x303a8)
                return
        elif address == 0x1d780:
            self.switches.append({'frame': self.frame, 'mode': u.reg_read(REGS[0])})
        elif address == 0x879c:
            ptr = struct.unpack('<I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 4))[0]
            self.trace.append({'op':'text', 'text':bytes(u.mem_read(ptr, 100)).split(b'\0')[0].decode(),
                               'x':unf(u.reg_read(REGS[1])), 'y':unf(u.reg_read(REGS[2]))})
        self.ret(u)

    def start(self, duration=30):
        self.init_land(duration)
        self.put_land(0x2dc, 0, 'B')
        self.u.mem_write(NATIVE_LAND, bytes(self.u.mem_read(LAND, 0x300)))
        self.u.mem_write(GAME, bytes(0x40))
        self.u.mem_write(GAME+8, struct.pack('<f', -600))
        self.u.mem_write(GAME+0x1c, struct.pack('<I', 3))
        self.u.mem_write(GAME+0x28, struct.pack('<f', -400))

    def value(self, address, fmt='f'):
        return struct.unpack('<'+fmt, self.u.mem_read(address, struct.calcsize(fmt)))[0]


def main():
    p = EndProbe(); p.start()
    samples=[]; end_frame=None
    for frame in range(1, 2500):
        p.frame=frame; p.trace=[]
        p.call(0x20728, [GAME, f32(1/60)])
        if p.value(NATIVE_LAND+0x2dc,'B'):
            if end_frame is None:end_frame=frame
            samples.append({'frame':frame-end_frame+1, 'fade':p.value(GAME+0x28),
                            'flag':p.trace, 'elapsed':p.value(NATIVE_LAND+4)})
        if p.switches:break
    assert p.world_frames==frame
    assert p.switches==[{'frame':frame,'mode':9}]
    assert len(samples)>450
    p.u.mem_write(NATIVE_LAND+0x28c,struct.pack('<f',100))
    p.call(0x308e8,[NATIVE_LAND,20])
    assert p.value(NATIVE_LAND+0x28c)==100, 'Victory protects castle HP'
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(), 'end_frame':end_frame,
            'switch_frame':frame,'transition_frames':len(samples),'world_calls':p.world_frames,
            'post_victory_hp':100,'samples':samples}
    p=EndProbe();p.start()
    p.u.mem_write(NATIVE_LAND+0x28c,struct.pack('<f',100))
    p.call(0x308e8,[NATIVE_LAND,101])
    assert p.value(NATIVE_LAND+0x2dd,'B')==1
    defeat=[]
    for frame in range(1,600):
        p.frame=frame;p.trace=[]
        p.call(0x20728,[GAME,f32(1/60)])
        defeat.append({'frame':frame,'fade':p.value(GAME+0x28),'flag':p.trace})
        if p.switches:break
    assert frame==len(samples) and p.world_frames==frame
    result['defeat']={'transition_frames':frame,'samples':defeat}
    (ROOT/'research/day-end-data.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('samples','defeat')}))


if __name__=='__main__':main()
