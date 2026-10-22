from probe_equipped_days import EquippedProbe, ART, REGS
from unicorn import UC_HOOK_CODE
class Debug(EquippedProbe):
 def __init__(self):
  super().__init__(0)
  self.u.hook_add(UC_HOOK_CODE,self.observe,begin=0x2d254,end=0x2d254)
  self.u.hook_add(UC_HOOK_CODE,self.observe,begin=0x2d698,end=0x2d698)
 def observe(self,u,address,*args):
  p=u.reg_read(REGS[0])
  if self.frame<350 or self.get_at(p,12,'I')!=3:return
  print('call',self.frame,hex(address),[u.reg_read(r) for r in REGS[:4]],'flags',[self.get_at(p,o,'B') for o in [1,0x70,0x71,0x72,0x84]],'open',self.get_at(p,0x64),flush=True)
 def equipment_frame(self):
  if self.frame==358:raise SystemExit()
  if 350<=self.frame<=357:
   p=ART+0x98
   print('end',self.frame,'flags',[self.get_at(p,o,'B') for o in [1,0x70,0x71,0x72,0x84]],'open',self.get_at(p,0x64),'rand',self.random_calls,flush=True)
  return super().equipment_frame()
Debug().run('campaign',2,True,1,2)
