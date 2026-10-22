"""Native InitMode -> world -> InitMode random continuity; research only."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, ROOT, SELF, REGS
from probe_wave_cycle import WaveProbe, PLAYER, WAVE, SKIP
from probe_land import LandProbe
from probe_weapons import CREEP


class SessionProbe(WaveProbe):
    def __init__(self):
        super().__init__()
        self.background=None
        self.u.hook_add(UC_HOOK_CODE,lambda u,*args:setattr(self,'background',u.reg_read(REGS[0])),
                        begin=0x17020,end=0x17020)
        # Keep ClearLoadUpdateFuction: its loading-hint selection consumes rand.
        for address in (0x38164,0xea64,0x18208,0xacd4,0x1cb44,0x1d5f4):
            self.u.hook_add(UC_HOOK_CODE,lambda u,*args:self.ret(u),begin=address,end=address)

    def config(self):
        f=lambda off:self.get_at(PLAYER,off)
        i=lambda off:self.get_at(PLAYER,off,'i')
        return {'config':[i(0x138),f(0x144),f(0x140),f(0x148),i(0x14c),f(0x164),
                          f(0x168),f(0x15c),f(0x178),f(0x160),self.get_at(PLAYER,0x13c,'B'),i(0x70)],
                'table':[i(0x184+j*4) for j in range(i(0x1d4))]}

    def session(self,mode,level):
        self.stream=None;self.clean()
        # load_enemies temporarily populated this table solely to bind all artwork.
        self.u.mem_write(PLAYER+0x184,bytes(80))
        self.u.mem_write(WAVE,bytes(0x50));self.u.mem_write(SKIP,bytes(4))
        self.u.mem_write(PLAYER+0x234,struct.pack('<I',level))
        self.u.mem_write(PLAYER+0x88,bytes([mode!='campaign',mode=='madness']))
        new_game=self.get_at(0xc7574,0,'I')
        self.u.mem_write(new_game,b'\1')
        self.stream=73;days=[]
        for day in (1,2):
            before=self.stream;self.random_calls=[]
            self.call(0x20e1c,[SELF+0x95000])
            self.put_land(0x28c,100000)
            initial={'rng_before':before,'rng':self.stream,'calls':self.random_calls[:],
                     'background':self.background,'land':LandProbe.state(self),
                     'wave':self.wave(),**self.config()}
            assert initial['calls'][0]=='0x6a90', initial['calls'][:3]
            frames=[]
            for tick in range(1,451):
                self.random_calls=[];self.actor_draws=[];self.commands=[]
                self.step_frame()
                frames.append({'tick':tick,'rng':self.stream,'calls':self.random_calls[:],
                               'actors':[{'slot':i,**self.actor_state(i)} for i in range(200)
                                         if self.get_at(CREEP+i*256,0,'B')]})
            days.append({'day':day,'initial':initial,'frames':frames})
            print(mode,level,day,'init calls',len(initial['calls']),'state',initial['rng'],
                  'star calls',len([c for c in initial['calls'] if c.startswith('0x31')]),flush=True)
        return dict(mode=mode,level=level,seed=73,days=days)


def main():
    cases=[]
    for mode,level in [('campaign',0),('campaign',9),('campaign',11),('endless',0),('madness',0)]:
        cases.append(SessionProbe().session(mode,level))
    (ROOT/'research/session-random.json').write_text(json.dumps({
        'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
        'scope':'Original normalGame::InitMode and two450-frame world segments separated by the '
                'next-day setup. Day is advanced early by the harness; no menu/result timing claim. '
                'Asset loaders, external audio and UI setup intercepted. Supplied legal31-bit '
                'xorshift stream and stable host qsort, not historical libc algorithm evidence.'
    },separators=(',',':'))+'\n')


if __name__=='__main__':main()
