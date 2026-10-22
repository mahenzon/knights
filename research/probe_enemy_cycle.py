"""Long native walking/attack cycles through the integrated frame loop; research only."""
import hashlib,json
from extract_enemies import IMAGE,META,ROOT,SELF
from probe_captive_pose import CaptiveProbe,CREEP
from probe_sacrifices import ART

class CycleProbe(CaptiveProbe):
 def actor_state(self):
  result=super().actor_state()
  result.update({key:self.get_at(CREEP,off,fmt) for key,off,fmt in [
   ('ability_delay',0xe0,'f'),('ability_active',0xe4,'B'),
   ('ability_remaining',0xe8,'f'),('ability_done',0xec,'B')]})
  return result
 def run_cycle(self,kind,abilities=False):
  self.reset()
  self.u.mem_write(ART,bytes(25*0x98))
  self.call(0x19b60,[META['symbols']['_Player']])
  self.init(kind)
  self.put(0xe0,0.25 if abilities else 99)
  assert self.get(0xf0)==-1
  self.u.mem_write(CREEP,bytes(self.u.mem_read(SELF,256)))
  initial=self.actor_state()
  frames=[]
  for tick in range(1,601):
   self.frame=tick;self.actor_draws=[]
   row=self.step_frame()
   frames.append({'tick':tick,'actor':row['after']['actor'],
                  'drawn':self.actor_draws[:],
                  'sounds':[d for d in row['draws'] if d.get('op')=='sound']})
  return {'kind':kind,'abilities':abilities,'initial':initial,'frames':frames}

def main():
 p=CycleProbe()
 cases=[p.run_cycle(kind) for kind in range(11)]
 cases += [p.run_cycle(kind,True) for kind in (1,6,7,8,9)]
 result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
         'scope':'Native DrawNormalGame and ordinary creep processing/attacks,600 frames per kind. '
                 'Ordinary abilities delayed99s; five ability cases begin at0.25s. Fixed rand123456; external effects, castle hits '
                 'and projectile allocation intercepted. Host qsort uses stable ties.'}
 (ROOT/'research/enemy-cycle.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
 for c in cases:
  attacks=[f['tick'] for f in c['frames'] if any(s['event']==4 for s in f['sounds'])]
  print(c['kind'],c['abilities'],'attack frames',attacks)
if __name__=='__main__':main()
