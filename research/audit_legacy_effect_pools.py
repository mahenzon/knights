"""Read-only ARM literal-reference audit of dormant legacy effect pools."""
import bisect
import hashlib
import json
import re
import struct
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM

root=Path(__file__).resolve().parents[1]
image=(root/'research/Knights').read_bytes()
meta=json.loads((root/'research/macho.json').read_text())
symbols={v:k for k,v in meta['symbols'].items()}
addresses=sorted(symbols)
text=next(s for s in meta['sections'] if s['name']=='__text')
cs=Cs(CS_ARCH_ARM,CS_MODE_ARM);cs.skipdata=True
code=list(cs.disasm(image[text['fileOffset']:text['fileOffset']+text['size']],text['address']))
def literal_refs(value):
    refs=[]
    for op in code:
        if op.mnemonic!='ldr' or '[pc' not in op.op_str:continue
        match=re.search(r'\[pc(?:, #(-?0x[0-9a-f]+|-?\d+))?\]',op.op_str)
        if not match:continue
        at=op.address+8+int(match[1] or '0',0)
        if not 0x1000<=at<len(image)+0x1000:continue
        if struct.unpack_from('<I',image,at-4096)[0]==value:
            refs.append({'address':hex(op.address),'function':symbols[addresses[bisect.bisect_right(addresses,op.address)-1]]})
    return refs
result={'binary_sha256':hashlib.sha256(image).hexdigest(),'references':{
    'particle_pool':literal_refs(meta['symbols']['_Particles']),
    'flying_text_pointer':literal_refs(0xc745c),
    'particle_art_pointer':literal_refs(0xc7538),
    'powerup_pool':literal_refs(meta['symbols']['_Powerups']),
    'landobject_pool':literal_refs(meta['symbols']['_LandObjects']),
    'landobject_pointer':literal_refs(0xc73ec)}}
expected={
 'particle_pool':{'__Z16ParticlesProcessf','__Z13ParticlesDrawP7Displayb'},
 'flying_text_pointer':{'__Z13ClearFlyTextsv','__Z12DrawFlyTextsP7Display','__Z15ProcessFlyTextsf'},
 'particle_art_pointer':{'__Z13ParticlesDrawP7Displayb'},
 'powerup_pool':{'__Z22ProcessAndDrawPowerupsf'},
 'landobject_pool':set(),
 'landobject_pointer':{'__Z14DrawNormalGamef'}}
for name,refs in result['references'].items():assert {r['function'] for r in refs}==expected[name],refs
result['conclusion']='No emitter references found: pool accesses are limited to clear/process/draw. This static reference audit is not a proof against every possible computed address.'
assert struct.unpack_from('<I',image,meta['symbols']['__Z13DrawPerkPanelf']-4096)[0]==0xe12fff1e
result['perk_panel']='DrawPerkPanel consists of bx lr (immediate return). Powerup loop only invokes Process and contains no drawing calls.'
(root/'research/legacy-effect-pools.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
