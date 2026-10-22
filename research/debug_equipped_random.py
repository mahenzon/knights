from probe_equipped_days import EquippedProbe, ART
class Debug(EquippedProbe):
 def equipment_frame(self):
  if self.visits==3 and 965<=self.frame<=974:
   p=ART+0x98
   print(self.frame,'rng',self.stream,'gate',[self.get_at(p,o) for o in [0x64,0x78,0x80]],'rand',self.random_calls,flush=True)
  if self.visits==3 and self.frame==975:raise SystemExit()
  return super().equipment_frame()
Debug(0).run('campaign',2,True,2,2)
