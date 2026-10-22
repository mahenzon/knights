"""Bounded native shot-count, sound and weapon-render fixtures; research only."""
import json
import struct
import re

from extract_enemies import IMAGE, META, ROOT, REGS, f32
from probe_scene import SceneProbe, unf
from probe_weapons import WeaponProbe, ART, MISSILE, MISSILE_SCHEMA
from unicorn.arm_const import UC_ARM_REG_SP
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM


def surface_bindings():
    def read(address, count):
        segment = next(s for s in META['segments'] if s['address'] <= address < s['address'] + s['fileSize'])
        offset = address - segment['address'] + segment['fileOffset']
        return IMAGE[offset:offset+count]
    def word(address):
        return struct.unpack('<I', read(address, 4))[0]
    symbols = {address: name for name, address in META['symbols'].items() if name.startswith('_g_')}
    slots = {address: symbols[word(address)] for address in range(0xc7400,0xc7600,4) if word(address) in symbols}
    decoder = Cs(CS_ARCH_ARM, CS_MODE_ARM); decoder.skipdata = True
    code = list(decoder.disasm(read(0xb3e8,0xea64-0xb3e8),0xb3e8))
    result = {}
    for i, op in enumerate(code[:-3]):
        literal = re.search(r'\[pc, #(-?0x[0-9a-f]+)\]', op.op_str)
        if op.mnemonic != 'ldr' or not literal:
            continue
        slot = word(op.address+8+int(literal[1],16))
        if slot not in slots or code[i+3].mnemonic != 'str':
            continue
        constructor = next((j for j in range(i-1,-1,-1) if code[j].mnemonic=='bl' and code[j].op_str=='#0x8ffc'),None)
        if constructor is None:
            continue
        name = None
        for load in code[max(0,constructor-3):constructor]:
            pointer = re.search(r'r1, \[pc, #(-?0x[0-9a-f]+)\]',load.op_str)
            if pointer:
                string = word(load.address+8+int(pointer[1],16))
                name = read(word(string+8),100).split(b'\0')[0].decode()+'.png'
        offset = re.search(r', #(0x[0-9a-f]+|\d+)\]',code[i+3].op_str)
        if name:
            result.setdefault(slots[slot],{})[(int(offset[1],0) if offset else 0)//4] = name
    assert result['_g_guns']=={0:'upgrade_window_gun.png',1:'upgrade_window_freezer.png',2:'upgrade_window_flamer.png'}
    assert result['_g_artefacts'][71]=='jump_platform_0000.png'
    assert result['_g_artefacts'][83]=='tower_pod_ballista3.png'
    return result


class WeaponScene(SceneProbe):
    def __init__(self):
        super().__init__()
        for symbol, names in surface_bindings().items():
            for i, name in names.items():
                ptr = 0x1080000 + len(self.surfaces) * 32
                self.surfaces[ptr] = name
                self.u.mem_write(META['symbols'][symbol] + i * 4, struct.pack('<I', ptr))

    def import_hook(self,u,address,size,context):
        if META['imports'].get(address) in ('_atan2','_sqrt','_pow'):
            WeaponProbe.import_hook(self,u,address,size,context)
        else:
            super().import_hook(u,address,size,context)

    def ignore(self, u, address, size, context):
        if address == 0x8188:
            args = [u.reg_read(r) for r in REGS]
            sx, sy, ptr, flip = struct.unpack('<4I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 16))
            self.trace.append({'op': 'scaled', 'image': self.surfaces.get(ptr, hex(ptr)),
                               'x': unf(args[1]), 'y': unf(args[2]), 'radians': unf(args[3]),
                               'sx': unf(sx), 'sy': unf(sy), 'flip': flip})
            self.ret(u)
        else:
            super().ignore(u, address, size, context)


def main():
    p = WeaponProbe()
    volleys = []
    for kind, tier, x, y in [(6,0,392,237),(6,3,392,237),(6,6,392,237),
                             (8,0,432,142),(8,1,432,142),(8,2,432,142)]:
        p.u.mem_write(MISSILE, bytes(500 * 100))
        p.art(kind, tier, x, y)
        p.write(ART, 0x34, 1, 'B'); p.write(ART, 0x38, 0)
        p.effects.clear(); p.call(0x2d7e0, [ART, x+100, y, -1])
        shots = [p.fields(MISSILE+i*500, MISSILE_SCHEMA) for i in range(100) if p.read(MISSILE+i*500, 0, 'B')]
        assert len(shots) == 1
        volleys.append({'device': kind, 'tier': tier, 'shots': shots,
                        'sounds': [e['args'][:2] for e in p.effects if e['address']=='0x37ba8']})
    scene = WeaponScene()
    drawings = []
    for kind, tier, x, y in [(6,0,392,237),(6,3,392,237),(6,6,392,237),
                             (8,0,432,142),(8,1,432,142),(8,2,432,142),(7,0,50,247),(7,1,50,247)]:
        for elapsed in (0., 7.5, 30.):
            scene.u.mem_write(ART, bytes(0x98)); scene.call(0x2ce80, [ART,x,y,kind], [tier])
            scene.art_put(0x28,elapsed); scene.art_put(0x38,0.2)
            scene.trace.clear()
            scene.call(0x2f2fc, [ART,f32(0)])
            scene.call(0x2e3b0, [ART])
            drawings.append({'device':kind,'tier':tier,'elapsed':elapsed,'draws':scene.trace[:]})
    missile_draws=[]
    for kind in range(4):
        scene.u.mem_write(MISSILE,bytes(500))
        scene.call(0x1ab18,[MISSILE,200,150,0],[(-600)&0xffffffff,0,0,f32(20),f32(0),kind,0])
        scene.trace.clear();scene.call(0x1afe8,[MISSILE])
        missile_draws.append({'type':kind,'draws':scene.trace[:]})
    (ROOT/'research/weapon-followup.json').write_text(json.dumps({'volleys':volleys,'drawings':drawings,'missile_draws':missile_draws,'surface_bindings':surface_bindings()},indent=2)+'\n')
    print(f'Verified {len(volleys)} single-shot weapon configurations and captured {len(drawings)} native weapon scenes.')


if __name__ == '__main__':
    main()
