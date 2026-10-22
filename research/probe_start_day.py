"""Original day announcement, using actual InitMode state and DrawFlag."""
import hashlib
import json
import struct
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, ROOT, REGS, f32
from probe_session_random import SessionProbe, PLAYER
from probe_full_days import GAME as INIT_GAME
from probe_day_end import EndProbe, GAME
from probe_enemy_followup import EnemyProbe

class StartProbe(EndProbe):
    string = EnemyProbe.string
    def import_hook(self,u,address,*args):
        if META['imports'].get(address)=='_sprintf':
            return EnemyProbe.import_hook(self,u,address,*args)
        super().import_hook(u,address,*args)
    def end_hook(self,u,address,*args):
        if address==0x879c:
            values=struct.unpack('<4I',u.mem_read(u.reg_read(UC_ARM_REG_SP),16))
            super().end_hook(u,address,*args)
            self.trace[-1].update(rgb=list(values[1:]),align=u.reg_read(REGS[3]))
            return
        super().end_hook(u,address,*args)

def main():
    cases=[]
    for mode,level,day in [('campaign',0,1),('campaign',11,7),('endless',0,10000),('madness',0,2)]:
        setup=SessionProbe();setup.clean()
        setup.u.mem_write(PLAYER+0x234,struct.pack('<I',level))
        setup.u.mem_write(PLAYER+0x88,bytes([mode!='campaign',mode=='madness']))
        setup.u.mem_write(setup.get_at(0xc7574,0,'I'),b'\1')
        setup.stream=73
        setup.call(0x20e1c,[INIT_GAME])
        p=StartProbe();p.start();p.advance_land=False
        p.u.mem_write(GAME,bytes(setup.u.mem_read(INIT_GAME,0x40)))
        p.u.mem_write(PLAYER,bytes(setup.u.mem_read(PLAYER,0x250)))
        p.u.mem_write(PLAYER+0x130,struct.pack('<I',day))
        frames=[]
        for frame in range(1,491):
            p.trace=[];p.call(0x20728,[GAME,f32(1/60)])
            frames.append(dict(frame=frame,fade=p.value(GAME+0x28),draws=p.trace))
        row=dict(mode=mode,level=level,day=day,max_days=p.value(PLAYER+0x134,'I'),frames=frames)
        cases.append(row)
        print(mode,level,day,'max',row['max_days'],next(f for f in frames if any(d.get('image')=='flag.png' for d in f['draws'])),flush=True)
    (ROOT/'research/start-day.json').write_text(json.dumps(dict(binary_sha256=hashlib.sha256(IMAGE).hexdigest(),cases=cases),separators=(',',':'))+'\n')

if __name__=='__main__':main()
