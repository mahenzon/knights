import sys,json
from pathlib import Path
from capstone import *
b=Path('research/Knights').read_bytes();m=json.loads(Path('research/macho.json').read_text());names={v:k for k,v in m['symbols'].items()};md=Cs(CS_ARCH_ARM,CS_MODE_ARM);md.skipdata=True
for arg in sys.argv[1:]:
 if ':' in arg:a,e=[int(x,16) for x in arg.split(':')]
 else:
  a=int(arg,16);e=min(x for x in names if x>a)
 print('\nFUNCTION',hex(a),names.get(a),hex(e))
 for i in md.disasm(b[a-0x1000:e-0x1000],a):
  op=i.op_str
  if i.mnemonic in ['bl','b'] and op.startswith('#0x'):
   v=int(op[1:],16);op+=' '+names.get(v,m['imports'].get(str(v),''))
  print(f'{i.address:08x} {i.mnemonic:8s} {op}')
