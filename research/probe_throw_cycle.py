"""Native input release, flight, landing and recovery through DrawNormalGame."""
import hashlib,json
from extract_enemies import IMAGE,META,ROOT,SELF,f32
from probe_captive_pose import CaptiveProbe,CREEP
from probe_sacrifices import ART

class ThrowProbe(CaptiveProbe):
 def actor_state(self):
  result=super().actor_state()
  result['min_y']=self.get_at(CREEP,0xdc,'i')
  return result
 def run_throw(self,kind,scenario):
  self.reset();self.u.mem_write(ART,bytes(25*0x98))
  self.call(0x19b60,[META['symbols']['_Player']])
  for off in (0x64,0x80,0x84):self.u.mem_write(META['symbols']['_Player']+off,bytes(4))
  self.init(kind);self.put(0xe0,99)
  x,y,vx,vy,hold={
   'tap':(170,130,40,-100,0), 'gentle':(170,130,40,-100,7),
   'wall':(340,150,600,0,7), 'high':(170,-100,-120,100,7),
   'left':(-100,130,-400,-100,7),
   'left-fatal':(-100,200,-900,900,7), 'wall-ground':(340,240,900,900,7),
   'velocity-limit':(170,130,1200,-1200,7),
   'long-left':(-100,-100,-900,-500,7),
  }[scenario]
  self.put(8,x);self.put(12,y)
  self.call(0x26528,[SELF]);self.put(0xa4,y-30,'i')
  for _ in range(hold):self.call(0x283ec,[SELF,f32(1/60)])
  self.put(0x1c,vx);self.put(0x20,vy)
  self.call(0x26378,[SELF])
  self.u.mem_write(CREEP,bytes(self.u.mem_read(SELF,256)))
  initial=self.actor_state();frames=[]
  for tick in range(1,361):
   self.frame=tick;self.actor_draws=[]
   row=self.step_frame()
   frames.append({'tick':tick,'actor':row['after']['actor'],'drawn':self.actor_draws[:],
                  'balances':self.balances(),
                  'sounds':[d for d in row['draws'] if d.get('op')=='sound']})
  return {'kind':kind,'scenario':scenario,'initial':initial,'frames':frames}

def main():
 p=ThrowProbe()
 cases=[p.run_throw(kind,s) for kind in range(11) for s in
        ('tap','gentle','wall','high','left','left-fatal','wall-ground','velocity-limit','long-left')]
 result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
         'scope':'Native StartDrag/StopDrag and integrated DrawNormalGame. Abilities delayed99s; '
                 'constant rand123456; external effects, castle hits, projectile allocation intercepted. '
                 'Host qsort uses stable ties. Tap releases immediately; other cases process7 held frames.'}
 (ROOT/'research/throw-cycle.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
 for c in cases:
  landed=next((f['tick'] for f in c['frames'] if not f['actor']['flying']),None)
  recovery=next((f['tick'] for f in c['frames'] if f['actor']['pose'] in (0,8)),None)
  print(c['kind'],c['scenario'],'land',landed,'recover',recovery,'final',c['frames'][-1]['actor']['active'])
if __name__=='__main__':main()
