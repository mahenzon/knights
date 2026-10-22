"""Recover original Credits wording, controls and scaled entrance animation."""
import hashlib
import json
import struct
from extract_enemies import IMAGE, META, REGS, ROOT, f32
from probe_hiscores import ScoreProbe
from probe_play_menu import MENU
from probe_scene import unf


class CreditsProbe(ScoreProbe):
    def __init__(self):
        self.scale=[1,1]
        self.scales=[]
        super().__init__()
        font=struct.unpack('<I',self.u.mem_read(META['symbols']['_FontInterface'],4))[0]
        for name in ['_Font1','_FontLarge']:
            self.u.mem_write(META['symbols'][name],struct.pack('<I',font))

    def import_hook(self,u,address,size,context):
        name=META['imports'].get(address)
        if name=='_glPushMatrix':self.scales.append(self.scale[:])
        elif name=='_glPopMatrix':self.scale=self.scales.pop()
        elif name=='_glScalef':self.scale=[a*unf(u.reg_read(r)) for a,r in zip(self.scale,REGS)]
        super().import_hook(u,address,size,context)

    def ignore(self,u,address,size,context):
        super().ignore(u,address,size,context)
        if address==0x879c:self.trace[-1]['scale']=self.scale[:]


def main():
    p=CreditsProbe()
    p.call(0x208bc,[MENU])
    initial=list(struct.unpack('<3f',p.u.mem_read(MENU+0x20,12)))
    frames=[]
    for frame in range(1,181):
        p.trace=[]
        p.call(0x22a58,[MENU,f32(1/60)])
        frames.append({'frame':frame,'scales':list(struct.unpack('<3f',p.u.mem_read(MENU+0x20,12))),
                       'draws':p.trace[:]})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'controls':p.controls,
            'initial':initial,'frames':frames}
    (ROOT/'research/credits.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'controls':p.controls,'initial':initial,'first':frames[0],'last':frames[-1]}))


if __name__=='__main__':main()
