import sys,struct,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from macho import parse
from unicorn import *
from unicorn.arm_const import *
b=Path('research/Knights').read_bytes();meta=parse(b);u=Uc(UC_ARCH_ARM,UC_MODE_ARM)
u.mem_map(0x1000,0x1ff000);u.mem_map(0x1000000,0x100000)
for seg in meta['segments']:
 if seg['fileSize']:u.mem_write(seg['address'],b[seg['fileOffset']:seg['fileOffset']+seg['fileSize']])
u.reg_write(UC_ARM_REG_C1_C0_2,0xf<<20);u.reg_write(UC_ARM_REG_FPEXC,0x40000000)
seen={};records=[]
def hook(uc,a,size,ctx):
 if a==0x2ce80:
  regs=[uc.reg_read(i) for i in [UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3]]
  records.append(regs);uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR));return
 if a in meta['imports']:
  name=meta['imports'][a];seen[name]=seen.get(name,0)+1
  if name=='_rand':uc.reg_write(UC_ARM_REG_R0,123456)
  elif name=='_strcpy':
   d=uc.reg_read(UC_ARM_REG_R0);s=uc.reg_read(UC_ARM_REG_R1);bb=bytes(uc.mem_read(s,500)).split(b'\0')[0]+b'\0';uc.mem_write(d,bb)
  else:raise RuntimeError(f'Unhandled {name} at {a:x}')
  uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
u.hook_add(UC_HOOK_CODE,hook,begin=0x2ce80,end=0x2ce80)
u.hook_add(UC_HOOK_CODE,hook,begin=0xaa0b8,end=0xaa9b8)
def call(addr,args):
 u.reg_write(UC_ARM_REG_SP,0x10f0000);u.reg_write(UC_ARM_REG_LR,0x10ff000)
 for r,v in zip([UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3],args):u.reg_write(r,v)
 try:u.emu_start(addr,0x10ff000,count=1000000)
 except Exception:
  print('PC',hex(u.reg_read(UC_ARM_REG_PC)));raise
 assert u.reg_read(UC_ARM_REG_PC)==0x10ff000,'instruction limit'
player=meta['symbols']['_Player'];call(0x19b60,[player])
print('Level records',[(bytes(u.mem_read(0xf8380+i*244+4,70)).split(b'\0')[0],struct.unpack('<I',u.mem_read(0xf8380+i*244+224,4))[0]) for i in range(12)])
for level in range(3):
 records.clear();call(0x379d4,[level,0]);p=bytes(u.mem_read(player,0x23c))
 print('Level',level,'fields',[hex(x) for x in struct.unpack_from('<40I',p,0x130)],'artefacts',records)
print('Calls',seen)
Path('research/player-after-init.bin').write_bytes(u.mem_read(player,0x23c))
