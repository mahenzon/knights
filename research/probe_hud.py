"""Original DrawInterface health thresholds, crop, and positions; research only."""
import hashlib,json,struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE,META,REGS,ROOT,SELF,f32
from probe_scene import unf
from probe_enemy_followup import EnemyProbe

class HudProbe(EnemyProbe):
    def __init__(self):
        super().__init__()
        for symbol,names in [('_g_castleProgressBar',['castle_progressbar.png','castle_progress_blue.png','castle_progress_yellow.png','castle_progress_red.png']),('_g_iconsBar',['icon_gold.png','icon_sacrifice.png']),('_g_gradient',['bottom_podlozhka.png'])]:
            for i,name in enumerate(names):
                ptr=self.heap;self.heap+=32;self.surfaces[ptr]=name
                self.u.mem_write(META['symbols'][symbol]+i*4,struct.pack('<I',ptr))
        for address in (0x7b10,0x879c):self.u.hook_add(UC_HOOK_CODE,self.ignore,begin=address,end=address)
    def ignore(self,u,address,size,context):
        args=[u.reg_read(r) for r in REGS]
        stack=struct.unpack('<5I',u.mem_read(u.reg_read(UC_ARM_REG_SP),20))
        if address==0x879c:
            self.trace.append({'op':'text','text':self.string(stack[0]),'x':unf(args[1]),'y':unf(args[2])})
            self.ret(u)
        elif address==0x7b10:
            self.trace.append({'op':'stretch','image':self.surfaces.get(stack[1]),'x':unf(args[1]),'y':unf(args[2]),'x2':unf(args[3]),'y2':unf(stack[0])})
            self.ret(u)
        else:
            super().ignore(u,address,size,context)
            if address==0x7bf4 and stack[0]:
                self.trace[-1]['crop']=list(struct.unpack('<4h',u.mem_read(stack[0],8)))

def main():
    p=HudProbe();samples=[]
    for hp in [100,76,75,74,50,40,39,1,0]:
        p.u.mem_write(META['symbols']['_Land']+0x28c,struct.pack('<2f',hp,100))
        p.trace=[];p.call(0x6acc,[f32(0)])
        samples.append({'hp':hp,'max_hp':100,'draws':p.trace[:]})
    (ROOT/'research/hud-data.json').write_text(json.dumps({'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'samples':samples},indent=2)+'\n')
    for s in samples:print(s['hp'],s['draws'][2])
if __name__=='__main__':main()
