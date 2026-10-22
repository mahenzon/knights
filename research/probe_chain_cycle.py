"""Integrated native explosions with several live enemies; research only."""
import hashlib,json,struct
from extract_enemies import IMAGE,META,ROOT,SELF,REGS,f32
from unicorn.arm_const import UC_ARM_REG_SP
from probe_scene import unf
from probe_captive_pose import CaptiveProbe,CREEP
from probe_sacrifices import ART
from probe_weapons import DRAG,DRAG_SCHEMA,MISSILE,MISSILE_SCHEMA

FIELDS = [
 ('active',0,'B'),('dead',1,'B'),('sacrifice',2,'B'),('burning',4,'B'),
 ('x',8,'f'),('y',12,'f'),('ground',0x10,'f'),('vx',0x1c,'f'),('vy',0x20,'f'),
 ('angle',0x44,'f'),('kind',0x48,'I'),('frame',0x4c,'f'),('pose',0x50,'I'),
 ('speed',0x88,'i'),('saved_speed',0x8c,'i'),('damage',0x90,'i'),('hp',0x94,'f'),
 ('dragging',0x98,'B'),('target_x',0xa0,'i'),('target_y',0xa4,'i'),
 ('shield',0xa8,'B'),('flying',0xa9,'B'),('immunity',0xaa,'B'),
 ('stun_time',0xb8,'f'),('alpha',0xbc,'f'),('mass',0xc0,'f'),('range',0xc4,'f'),
 ('disarmed',0xc9,'B'),('freeze_time',0xcc,'f'),('frozen',0xd0,'B'),
 ('reward',0xd8,'i'),('min_y',0xdc,'i'),('ability_delay',0xe0,'f'),
 ('ability_active',0xe4,'B'),('ability_remaining',0xe8,'f'),('ability_done',0xec,'B'),
 ('cooldown',0xf0,'f'),('size',0xf8,'f')]

class ChainProbe(CaptiveProbe):
 def phase(self,u,address,*args):
  if address==0x1c310:
   self.phases.append('missiles_process');return
  super().phase(u,address,*args)
 def effect_hook(self,u,address,*args):
  if address==0x29ed4:return
  super().effect_hook(u,address,*args)
 def import_hook(self,u,address,*args):
  if META['imports'].get(address)=='_rand':
   u.reg_write(REGS[0],0);self.ret(u)
  else:super().import_hook(u,address,*args)
 def actor_state(self,slot=0):
  return {key:self.get_at(CREEP+slot*256,off,fmt) for key,off,fmt in FIELDS}
 def objects(self):
  return [{'slot':i,**{key:self.get_at(DRAG+i*116,off,fmt) for key,off,fmt in [
    ('kind',8,'I'),('x',0x18,'f'),('y',0x1c,'f'),('angle',0x3c,'f'),
    ('age',0xc,'f'),('size',0x6c,'f'),('held',3,'B'),('tier',0x68,'I'),('charge',0x28,'f')]}}
    for i in range(30) if self.get_at(DRAG+i*116,0,'B')]
 def missiles(self):
  return [{'slot':i,**{key:self.get_at(MISSILE+i*500,off,fmt) for key,off,fmt in MISSILE_SCHEMA},
    'smoke_timer':self.get_at(MISSILE+i*500,0x1e8)} for i in range(100) if self.get_at(MISSILE+i*500,0,'B')]
 def extra_hook(self,u,address,*args):
  if address in (0x26b3c,0x27cc4):return
  if address==0x31a7c:
   a=[u.reg_read(r) for r in REGS]+list(struct.unpack('<8I',u.mem_read(u.reg_read(UC_ARM_REG_SP),32)))
   self.fragments.append(dict(zip(['kind','x','y','vx','vy'],[v if v<0x80000000 else v-0x100000000 for v in a[:5]]))|{'size':unf(a[7])})
  super().extra_hook(u,address,*args)
 def ignore(self,u,address,*args):
  if address==0x1a090:
   a=[u.reg_read(r) for r in REGS]+list(struct.unpack('<6I',u.mem_read(u.reg_read(UC_ARM_REG_SP),24)))
   self.smokes.append({k:unf(v) if 5<=i<=8 else v if v<0x80000000 else v-0x100000000
    for i,(k,v) in enumerate(zip(['kind','x','y','vx','vy','size','growth','alpha','fade','additive'],a))})
  if address==0x28c70:
   slot=(u.reg_read(REGS[0])-CREEP)//256
   assert 0<=slot<200
   self.actor_draws.append({'slot':slot,**self.actor_state(slot)})
   return
  super().ignore(u,address,*args)
 def run_chain(self,name,kinds,source,giants=(),frozen=(),projectile=None,missiles=()):
  self.reset();self.u.mem_write(ART,bytes(25*0x98))
  self.u.mem_write(MISSILE,bytes(100*500))
  self.call(0x19b60,[META['symbols']['_Player']])
  for off in (0x64,0x80,0x84):self.u.mem_write(META['symbols']['_Player']+off,bytes(4))
  for i,(kind,x) in enumerate(kinds):
   self.init(kind,i in giants);self.put(8,x);self.put(0xe0,99)
   if i==source:
    self.put(12,self.get(0x10)-1);self.put(0x20,800);self.put(0xa9,1,'B')
    self.put(0x50,3,'I');self.put(0x88,0,'i')
   if i in frozen:
    self.put(0xcc,3.5);self.put(0xd0,1,'B');self.call(0x26d44,[SELF,7])
   self.u.mem_write(CREEP+i*256,bytes(self.u.mem_read(SELF,256)))
  initial_projectile=None
  if projectile is not None:
   kind,tier=projectile
   self.call(0x29bb0,[DRAG,200,240,kind],[tier])
   self.u.mem_write(DRAG+3,b'\0')
   self.u.mem_write(DRAG+0xc,struct.pack('<f',self.get_at(DRAG,0x10)-0.01))
   if kind==2:
    self.u.mem_write(DRAG+0x3c,struct.pack('<f',0.7))
    self.u.mem_write(DRAG+0x20,struct.pack('<f',50))
   initial_projectile={key:self.get_at(DRAG,off,fmt) for key,off,fmt in DRAG_SCHEMA}
   initial_projectile.update(age=self.get_at(DRAG,0xc),angle=self.get_at(DRAG,0x3c),target_x=self.get_at(DRAG,0x30),target_y=self.get_at(DRAG,0x34))
  for slot,(kind,tier,x,y,vx,vy) in enumerate(missiles):
   self.call(0x1ab18,[MISSILE+slot*500,x,y,0],[vx&0xffffffff,vy&0xffffffff,0,f32(20),0,kind,tier])
  initial_missiles=self.missiles()
  initial=[self.actor_state(i) for i in range(len(kinds))];frames=[]
  for tick in range(1,361):
   self.frame=tick;self.actor_draws=[];self.smokes=[];self.fragments=[]
   objects_before=self.objects()
   row=self.step_frame()
   actors=[{'slot':i,**self.actor_state(i)} for i in range(12) if self.get_at(CREEP+i*256,0,'B')]
   assert not any(self.get_at(CREEP+i*256,0,'B') for i in range(12,200))
   frames.append({'tick':tick,'actors':actors,'drawn':self.actor_draws[:],
    'objects_before':objects_before,'objects_after':self.objects(),
    'missiles':self.missiles(),
    'smokes':self.smokes[:],'fragments':self.fragments[:],
    'balances':self.balances(),'sounds':[d for d in row['draws'] if d.get('op')=='sound']})
  return {'name':name,'source':source,'giants':giants,'frozen':frozen,'initial':initial,'projectile':initial_projectile,'missiles':initial_missiles,'frames':frames}

def main():
 p=ChainProbe();p.smokes=[];p.fragments=[]
 cases=[p.run_chain('early-machine',[(4,200),(5,250),(0,300),(8,360)],0),
        p.run_chain('late-machine',[(0,300),(5,250),(4,200),(8,360)],2),
        p.run_chain('exploman',[(10,200),(0,230),(8,320)],0),
        p.run_chain('giant-exploman',[(10,200),(0,230),(8,320)],0,(0,)),
        p.run_chain('giant-in-chain',[(4,200),(10,250),(0,300),(8,360)],0,(1,)),
        p.run_chain('recursive-giants',[(10,200),(10,250),(0,300),(8,360)],0,(0,1)),
        p.run_chain('frozen-machine',[(4,200),(5,250),(0,300),(8,360)],0,(),(0,)),
        p.run_chain('frozen-victims',[(4,200),(5,250),(0,300),(8,360)],0,(),(1,2,3)),
        p.run_chain('frozen-giant',[(10,200),(0,230),(8,320)],0,(0,),(0,)),
        p.run_chain('frozen-giant-victim',[(4,200),(10,250),(0,300),(8,360)],0,(1,),(1,)),
        p.run_chain('frozen-recursive-giants',[(10,200),(10,250),(0,300),(8,360)],0,(0,1),(0,1)),
        p.run_chain('frozen-source-giant-neighbor',[(4,200),(10,250),(0,300),(8,360)],0,(1,),(0,)),
        p.run_chain('barrel-machine',[(4,200),(5,250),(0,300),(8,360)],-1,(),(),(4,0)),
        p.run_chain('fireball-giants',[(10,200),(10,250),(0,300),(8,360)],-1,(0,1),(),(2,0)),
        p.run_chain('freezing-bolt',[(0,200),(2,250),(8,300),(10,360)],-1,(),(),(2,3)),
        p.run_chain('barrel-carriers',[(2,200),(2,250),(0,300),(8,360)],-1,(),(),(4,0)),
        p.run_chain('fireball-carriers',[(2,200),(2,250),(0,300),(8,360)],-1,(),(),(2,0)),
        p.run_chain('medium-fireball-carriers',[(2,200),(2,250),(0,300),(8,360)],-1,(),(),(2,1)),
        p.run_chain('large-fireball-carriers',[(2,200),(2,250),(0,300),(8,360)],-1,(),(),(2,2))]
 for kind,tier in [(0,0),(1,0),(2,0),(3,0),(3,1),(3,2)]:
  for frozen in [(),(0,1,2,3)]:
   cases.append(p.run_chain(f'missile-{kind}-{tier}-'+('frozen' if frozen else 'crowd'),
    [(0,190),(2,210),(8,240),(4,260),(10,300)],-1,(4,),frozen,
    missiles=[(kind,tier,215,240,-70,0)]))
 cases.append(p.run_chain('ballista-ground-giants',[(10,220),(10,250),(0,280),(8,310)],-1,(0,1),
   missiles=[(3,2,275,269,-120,100)]))
 cases.append(p.run_chain('mixed-volley',[(0,190),(2,210),(8,240),(4,260),(10,300)],-1,(4,),
   missiles=[(kind,0,215,240,-70,0) for kind in (2,1,1,0,3)]))
 cases.append(p.run_chain('flame-two-hits',[(0,200)],-1,missiles=[(1,0,200,244,0,0)]))
 result={'binary_sha256':hashlib.sha256(IMAGE).hexdigest(),'cases':cases,
  'scope':'Native DrawNormalGame, all creep processing/Hit/Die/Explode/HitSplash and creep allocation execute. '
          'Missile manager with its three substeps, projectile allocation and processing execute. '
          'Abilities delayed99s; rand0. Particle allocation, missile drawing and castle hits intercepted. '
          'Host qsort uses stable ties. Source starts one pixel above ground at vy800.'}
 (ROOT/'research/chain-cycle.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
 for c in cases:print(c['name'],c['frames'][0]['balances'],[(a['slot'],a['kind'],a['hp']) for a in c['frames'][0]['actors']])
if __name__=='__main__':main()
