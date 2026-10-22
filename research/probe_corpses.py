"""Original enemy death poses, airborne movement and fade lifetime."""
import hashlib
import json
from extract_enemies import IMAGE, META, ROOT, SELF, f32
from probe_enemy_followup import EnemyProbe

def main():
    p=EnemyProbe();cases=[]
    def actor():
        return {**p.actor(), 'gold':int.from_bytes(p.u.mem_read(META['symbols']['_Player']+0x80,4),'little')}
    for kind in range(11):
        scenarios=[(False,200),(True,200)]+([(True,345),(True,410)] if kind in (0,4) else [])
        for flying,x in scenarios:
            p.init(kind);p.put(8,x);p.put(12,100 if flying else 240);p.put(16,240)
            p.u.mem_write(META['symbols']['_Player']+0x80,bytes(4))
            p.put(0xdc,100 if flying else 240,'i')
            if flying:
                p.put(0xa9,1,'B');p.put(0x1c,120);p.put(0x20,-250)
                p.call(0x26d44,[SELF,3])
            before=actor()
            p.call(0x27c44,[SELF,10000])
            initial=actor();frames=[]
            for tick in range(1,241):
                if p.get(0,'B'):p.call(0x283ec,[SELF,f32(1/60)])
                frames.append({'tick':tick,**actor()})
                if not p.get(0,'B'):break
            cases.append({'kind':kind,'flying':flying,'before':before,'initial':initial,'frames':frames})
    (ROOT/'research/corpses.json').write_text(json.dumps({'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases},indent=2)+'\n')
    for c in cases:
        changes=[];prev=None
        for s in [c['initial']]+c['frames']:
            key=(s['active'],s['animation'],s['flying'],s['alpha']<255)
            if key!=prev:changes.append((s.get('tick',0),key,s['alpha']));prev=key
        print(c['kind'],c['flying'],changes,'gold',c['initial']['gold'],c['frames'][-1]['gold'])

if __name__=='__main__':main()
