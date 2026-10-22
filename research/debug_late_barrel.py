from unicorn import UC_HOOK_CODE
from extract_enemies import REGS
from probe_full_days import FullDayProbe
from probe_weapons import DRAG

class Debug(FullDayProbe):
    def __init__(self):
        self.tick = 0
        super().__init__()
        self.u.hook_add(UC_HOOK_CODE, self.death, begin=0x2a030, end=0x2a030)
    def death(self, u, *args):
        if self.tick == 560:
            p = u.reg_read(REGS[0])
            print('death', (p-DRAG)//116, {name:self.get_at(p,off,fmt) for name,off,fmt in [('active',0,'B'),('kind',8,'I'),('x',0x18,'f'),('y',0x1c,'f'),('vy',0x24,'f')]}, flush=True)
    def call(self, address, args, stack=()):
        if address == 0x20728:
            self.tick += 1
        super().call(address, args, stack)
        if self.tick == 560:
            self.switched = True

Debug().run('endless',0,True,1,10000)
