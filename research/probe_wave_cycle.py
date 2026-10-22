"""Run native wave scheduling inside DrawNormalGame with a supplied legal rand stream."""
import hashlib
import json
import struct
from unicorn.arm_const import UC_ARM_REG_LR
from extract_enemies import IMAGE, META, ROOT, REGS, f32
from probe_random_calls import RandomProbe
from probe_weapons import CREEP

WAVE = META['symbols']['_Wave']
SKIP = 0xe23a0
PLAYER = META['symbols']['_Player']


class WaveProbe(RandomProbe):
    def __init__(self):
        self.stream = None
        super().__init__()

    def phase(self, u, address, *args):
        if address == 0x19104:
            self.phases.append('wave')
            return
        super().phase(u, address, *args)

    def import_hook(self, u, address, *args):
        if META['imports'].get(address) == '_rand' and self.stream is not None:
            self.stream = (self.stream ^ self.stream << 13) & 0xffffffff
            self.stream ^= self.stream >> 17
            self.stream = (self.stream ^ self.stream << 5) & 0xffffffff
            self.random_calls.append(hex(u.reg_read(UC_ARM_REG_LR)-4))
            u.reg_write(REGS[0], self.stream & 0x7fffffff)
            self.ret(u)
            return
        super().import_hook(u, address, *args)

    def wave(self):
        return {**{name:self.get_at(WAVE, off) for name,off in
                   [('pressure',0),('elapsed',16),('delay',20),('forced',72)]},
                'skip':max(0,self.get_at(SKIP,0,'i')),
                'count':self.get_at(WAVE,12,'i'),
                'prefix':self.get_at(PLAYER,0x15c)}

    def setup(self, config, table, initial=()):
        self.stream = None
        self.clean()
        self.put_land(0x2dc,0,'B')
        self.u.mem_write(WAVE,bytes(0x50))
        self.u.mem_write(SKIP,bytes(4))
        for index,offset,fmt in [(1,0x144,'f'),(2,0x140,'f'),(3,0x148,'f'),
                                 (4,0x14c,'i'),(6,0x168,'f'),(7,0x15c,'f'),
                                 (8,0x178,'f'),(9,0x160,'f'),(10,0x13c,'B')]:
            self.u.mem_write(PLAYER+offset,struct.pack('<'+fmt,config[index]))
        self.u.mem_write(PLAYER+0x164,struct.pack('<f',config[5]))
        self.u.mem_write(PLAYER+0x1d4,struct.pack('<I',len(table)))
        self.u.mem_write(PLAYER+0x184,struct.pack('<'+'I'*len(table),*table))
        self.call(0x18f48,[WAVE])
        for slot,dead in initial:
            self.init(0)
            from extract_enemies import SELF
            self.u.mem_write(CREEP+slot*256,bytes(self.u.mem_read(SELF,256)))
            self.u.mem_write(CREEP+slot*256+8,struct.pack('<f',-500.))
            if dead:
                self.call(0x27534,[CREEP+slot*256])
                self.call(0x26d44,[CREEP+slot*256,6])
        self.stream = 73
        self.random_calls = []

    def run(self, name, config, table, ticks, initial=(), immediate=False, restart=None):
        self.setup(config,table,initial)
        if immediate:
            self.u.mem_write(WAVE+20,struct.pack('<f',-1.))
        actors = [{'slot':i,**self.actor_state(i)} for i,_ in initial]
        beginning = self.wave()
        frames=[]
        for tick in range(1,ticks+1):
            if restart == tick:
                self.reset()
                self.call(0x18f48,[WAVE])
                self.u.mem_write(PLAYER+0x15c,struct.pack('<f',config[7]))
                self.stream=73
            self.random_calls=[];self.actor_draws=[];self.commands=[]
            before=self.stream
            self.step_frame()
            active=[{'slot':i,**self.actor_state(i)} for i in range(200)
                    if self.get_at(CREEP+i*256,0,'B')]
            frames.append({'tick':tick,'rng_before':before,'rng':self.stream,
                           'calls':self.random_calls[:],'wave':self.wave(),'actors':active})
        print(name,len(frames),'actors',len(frames[-1]['actors']),
              'rand sites',sorted({s for f in frames for s in f['calls']}),flush=True)
        return dict(name=name,config=config,table=table,initial=actors,wave=beginning,
                    restart=restart,frames=frames)


def main():
    p=WaveProbe()
    config=[120,300,4,0,12,1,.25,4,.5,-1,0,1]
    cases=[p.run('mixed',config,list(range(11)),900),
           p.run('triple',config[:10]+[1,1],list(range(11)),600),
           p.run('forced',[120,-1000,0,0,12,1,.2,11,0,.5,0,1],list(range(11)),650,restart=324),
           p.run('empty-probability',[120,-1000,0,0,0,1,0,1,0,-1,0,1],[0],240)]
    for name,initial in [('nineteen',[(i,0) for i in range(19)]),
                         ('twenty',[(i,0) for i in range(20)]),
                         ('corpses',[(i,1) for i in range(20)]),
                         ('second-half',[(i,0) for i in range(100,120)])]:
        cases.append(p.run(name,[120,1000,0,0,0,1,0,1,0,-1,1,1],[0],30,initial,True))
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
            'scope':'Original ProcessWave and AddOneMonster inside DrawNormalGame, real actor/weapon/effect '
                    'processing. Supplied xorshift state with nonnegative31-bit rand results; not a claim '
                    'about historical libc RNG. Stable host qsort, intercepted HUD/audio/GPU.'}
    (ROOT/'research/wave-cycle.json').write_text(json.dumps(result,separators=(',',':'))+'\n')


if __name__=='__main__':main()
