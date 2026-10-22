"""Recover original object depth keys and sort scheduling; no host qsort assumptions."""
import bisect
import hashlib
import json
import struct
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0
from extract_enemies import IMAGE, META, REGS, ROOT, SELF
from probe_weapons import WeaponProbe, CREEP, DRAG

POOL = META['symbols']['_GlobalObjects']
COUNT = META['symbols']['_globalObjectsCount']
TIMER = META['symbols']['_g_timeToUpdateSort']

class OrderProbe(WeaponProbe):
    def __init__(self):
        self.sort_calls = []
        self.draw_calls = []
        super().__init__()
        self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=0x2c760, end=0x2c760)

    def ignore(self,u,address,size,context):
        if address == 0x18e10: return # Execute ForceResort instead of the weapon probe's stub.
        if address in (0x28c70,0x2c760):
            ptr = u.reg_read(UC_ARM_REG_R0)
            self.draw_calls.append({'kind':3 if address==0x28c70 else 1,
                                    'slot':(ptr-(CREEP if address==0x28c70 else DRAG))//(256 if address==0x28c70 else 116)})
        super().ignore(u,address,size,context)

    def import_hook(self,u,address,size,context):
        if META['imports'].get(address)=='_qsort':
            self.sort_calls.append([u.reg_read(r) for r in REGS])
            super().ignore(u,address,size,context)
        else:super().import_hook(u,address,size,context)

    def records(self):
        return [dict(zip(('kind','x','depth','slot','priority'),
                    struct.unpack('<4iB',self.u.mem_read(POOL+i*20,17))))
                for i in range(self.read(COUNT,0,'i'))]

def main():
    p=OrderProbe();cases=[]
    initial_timer=p.read(TIMER,0,'i')
    assert initial_timer==30
    first_ticks=[]
    for tick in range(1,30):
        before=len(p.sort_calls);p.call(0x18dd8,[])
        if len(p.sort_calls)>before:first_ticks.append(tick)
    assert first_ticks==[1,14,27],first_ticks
    for y in (100.75,240.75):
        p.u.mem_write(CREEP,bytes(256*200));p.u.mem_write(DRAG,bytes(116*30))
        for kind in range(11):
            p.init(kind);p.put(8,200.75);p.put(12,y)
            p.u.mem_write(CREEP+kind*256,bytes(p.u.mem_read(SELF,256)))
        objects=[]
        for kind in (0,1,2,4,5,6,7):
            for held,byte4 in [(False,False),(True,False),(False,True)]:
                p.drag(kind,0,200,100)
                p.write(DRAG,0x1c,y);p.write(DRAG,3,int(held),'B');p.write(DRAG,4,int(byte4),'B')
                objects.append(bytes(p.u.mem_read(DRAG,116)))
        p.u.mem_write(DRAG,b''.join(objects))
        p.call(0x188a0,[])
        records=p.records();assert len(records)==32
        pairs=[]
        for a,b in [(0,1),(1,0),(4,5),(11,12),(12,13)]:
            p.call(0x18848,[POOL+a*20,POOL+b*20])
            actual=struct.unpack('<i',struct.pack('<I',p.u.reg_read(UC_ARM_REG_R0)))[0]
            expected=(records[a]['depth']>records[b]['depth'])-(records[a]['depth']<records[b]['depth'])
            assert actual==expected
            pairs.append({'a':a,'b':b,'result':actual})
        cases.append({'y':y,'records':records,'comparisons':pairs})
    p.sort_calls=[];p.write(TIMER,0,0,'i');ticks=[]
    for tick in range(1,30):
        before=len(p.sort_calls);p.call(0x18dd8,[])
        if len(p.sort_calls)>before:ticks.append(tick)
    assert ticks==[13,26],ticks
    p.call(0x18e10,[]);assert p.read(TIMER,0,'i')==0 and len(p.sort_calls)==3
    # Prove dispatch/skip rules independently of the unresolved external qsort.
    rows=list(reversed(p.records()))
    p.u.mem_write(POOL,b''.join(struct.pack('<4iB3x',*[r[k] for k in ('kind','x','depth','slot','priority')]) for r in rows))
    p.write(CREEP,0,0,'B');p.write(CREEP+256,3,1,'B');p.write(DRAG,0,0,'B')
    p.draw_calls=[];p.call(0x18ce4,[])
    expected=[{'kind':r['kind'],'slot':r['slot']} for r in rows
              if not (r['kind']==3 and r['slot'] in (0,1) or r['kind']==1 and r['slot']==0)]
    assert p.draw_calls==expected,(p.draw_calls,expected)
    draws=p.draw_calls[:]
    # Clear pools and reset day/player state: the global order and its timer survive.
    p.write(TIMER,0,7,'i');before=bytes(p.u.mem_read(POOL,20*len(rows)))
    for address,args in [(0x257a0,[]),(0x292bc,[]),(0x19548,[META['symbols']['_Player']]),
                         (0x19a88,[META['symbols']['_Player']])]:
        p.call(address,args)
        assert p.read(TIMER,0,'i')==7 and p.read(COUNT,0,'i')==len(rows)
        assert bytes(p.u.mem_read(POOL,20*len(rows)))==before
    p.draw_calls=[];p.call(0x18ce4,[]);assert not p.draw_calls
    # Direct caller audit identifies events that bypass the periodic refresh.
    symbols={v:k for k,v in META['symbols'].items()};addresses=sorted(symbols)
    section=next(s for s in META['sections'] if s['name']=='__text')
    cs=Cs(CS_ARCH_ARM,CS_MODE_ARM);cs.skipdata=True;callers=[]
    for op in cs.disasm(IMAGE[section['fileOffset']:section['fileOffset']+section['size']],section['address']):
        if op.mnemonic in ('b','bl') and op.op_str=='#0x18e10':
            callers.append({'address':hex(op.address),'function':symbols[addresses[bisect.bisect_right(addresses,op.address)-1]]})
    result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,'periodic_ticks':ticks,
            'initial_timer':initial_timer,'initial_ticks':first_ticks,'draw_dispatch':draws,
            'reset_preserves_order':True,'force_callers':callers,
            'scope':'Native SetObjectsToSort, compare, Resort/ForceResort and DrawAllObjects dispatch executed. Pool clears and player/day resets preserve the timer/list. Host qsort is stubbed; historical equal-key order remains unverified. Dragobject byte4 adds250 but no live writer has been found; its purpose is unknown.'}
    (ROOT/'research/global-order.json').write_text(json.dumps(result,indent=2)+'\n')
    print('Captured',len(cases),'mixed depth scenes; periodic sorts',ticks,'force callers',callers)
    print(cases[0]['records'])

if __name__=='__main__':main()
