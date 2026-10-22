"""Full native battles with owned equipment and the original global touch dispatcher."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, ROOT, SELF, REGS
from probe_full_days import FullDayProbe, ACTOR_KEYS, DRAG_SCHEMA
from probe_session_random import PLAYER
from probe_sacrifices import ART
from probe_weapons import DRAG

POINT = SELF + 0x96000
DEVICE_KEYS = [('kind',12,'I'), ('tier',16,'I'), ('x',4,'i'), ('y',8,'i'),
               ('elapsed',0x28,'f'), ('pressed',0x34,'B'), ('angle',0x38,'f'),
               ('recoil',0x8c,'i'), ('animation',0x90,'f')]


class EquippedProbe(FullDayProbe):
    def __init__(self, tier):
        self.tier = tier
        self.gestures = 0
        self.weapon = 0
        self.visits = 0
        super().__init__()
        for literal in (0x69bc, 0x69c0):
            ptr = self.get_at(self.get_at(literal,0,'I'),0,'I')
            self.u.mem_write(ptr, struct.pack('<f',1))
        self.u.hook_add(UC_HOOK_CODE, lambda u,*args:self.ret(u), begin=0x1cedc, end=0x1cedc)

    def effect_hook(self, u, address, *args):
        # The enemy-only ancestor intercepts this dispatcher; equipment input must execute it.
        if address == 0x2d4b4:
            return
        super().effect_hook(u, address, *args)

    def setup_day(self):
        previous = self.get_at(PLAYER,0x130,'I')
        if self.visits > 1:
            # Go Next is a completed tap: release the previous battlefield pointer first.
            self.input('up',30,285)
        if previous >= 1:
            inventory = [3,0,0,*([-1]*5),self.tier,self.tier,
                         3 if previous >= 2 else self.tier,self.tier,self.tier]
            assert len(inventory) == 13
            self.u.mem_write(PLAYER+0x8c, struct.pack('<13i',*inventory))
        initial = super().setup_day()
        initial['inventory'] = list(struct.unpack('<13i',self.u.mem_read(PLAYER+0x8c,52)))
        initial['between_day_release'] = self.visits > 1
        self.gestures = 0; self.weapon = 0; self.visits += 1
        return initial

    def input(self, op, x, y):
        inverted = self.get_at(self.get_at(self.get_at(0x69c4,0,'I'),0,'I'),0,'B')
        self.u.mem_write(POINT,struct.pack('<2i',480-x if inverted else x,y))
        self.call({'press':0x6914,'move':0x69c8,'up':0x6840}[op],[POINT,0])
        assert struct.unpack('<2i',self.u.mem_read(POINT,8)) == (x,y), 'Logical input must survive native screen conversion'
        return [op,x,y]

    def controls(self, actors, plan):
        if plan:
            sx,sy,tx,ty,age,kind = plan
            if kind == 'column' and age == 1:
                return [self.input('up',sx,sy)], (sx,sy,tx,ty,2,kind)
            if kind == 'column' and age == 2:
                return [self.input('press',200,10)], (200,10,200,230,3,kind)
            x=round(sx+(tx-sx)*min(age,12)/12)
            y=round(sy+(ty-sy)*min(age,12)/12)
            if age == 30:
                return [self.input('up',tx,ty)], None
            return [self.input('move',x,y)], (sx,sy,tx,ty,age+1,kind)
        if self.frame // 120 > self.weapon:
            slot = self.weapon % 5;self.weapon += 1
            x,y = [(344,76),(438,51),(447,163),(427,254),(432,106)][slot]
            return [self.input('press',x,y)], (x,y,200,240,1,'column' if slot==1 else 'weapon')
        available=[a for a in actors if not any(a[k] for k in
                    ('dead','sacrifice','flying','dragging','shield')) and 25<a['x']<300 and 50<a['y']<300]
        if not available:return [],None
        a=max(available,key=lambda a:a['x']); x,y=int(a['x'])+8,int(a['y'])-12
        tx,ty=[(120,60),(235,120),(x,10)][self.gestures%3];self.gestures+=1
        return [self.input('press',x,y)],(x,y,tx,ty,1,'actor')

    def equipment_frame(self):
        return {'devices':[[slot,*[self.get_at(ART+slot*0x98,off,fmt) for _,off,fmt in DEVICE_KEYS]]
                          for slot in range(25) if self.get_at(ART+slot*0x98,0,'B')],
                'gate':[self.get_at(ART+0x98,off) for off in (0x64,0x80)],
                'missiles':self.missiles(),
                'sounds':[[s['event'],s['subtype']] for s in self.trace if s.get('op')=='sound']}


def main():
    result=dict(binary_sha256=hashlib.sha256(IMAGE).hexdigest(),actor_keys=ACTOR_KEYS,
                object_keys=[key for key,_,_ in DRAG_SCHEMA],device_keys=[key for key,_,_ in DEVICE_KEYS],
                cases=[],scope='Full natural Machinery days2/3 with seeded owned equipment, '
                'real input dispatcher and native cold-start cooldowns. Day1 setup only; no menu dwell. '
                'Tier0/1/2 gear with both sacrificers and magic door; day3 switches spell to Freezing Bolt. '
                'Owned inventory is a fixture, not purchases earned by human play. Other full-day limits apply.')
    for tier in range(3):
        c=EquippedProbe(tier).run('campaign',2,True,2,2);c['equipment_tier']=tier
        result['cases'].append(c)
        (ROOT/'research/equipped-days.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    assert len(result['cases'])==3
    assert any(s[0]==11 for c in result['cases'] for d in c['days']
               for f in d['frames'] for s in f['sounds']), 'Gate input must reach native capture'


if __name__=='__main__':main()
