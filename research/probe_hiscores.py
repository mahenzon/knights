"""Recover local high-score layout, scrolling and score insertion from original ARM code."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_play_menu import PlayProbe, MENU
from probe_scene import unf


class ScoreProbe(PlayProbe):
    def __init__(self):
        self.translation = [0, 0]
        self.transforms = []
        self.insertions = []
        super().__init__()
        for address in [0xacd0, 0x6a70, 0x1cedc]:
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=address, end=address)
        self.u.hook_add(UC_HOOK_CODE, self.sort_hook, begin=0x22100, end=0x22100)

    def sort_hook(self, u, *args):
        base = META['symbols']['_HiscoreItems']
        self.insertions.append([bytes(u.mem_read(base+i*4040+4000, 40)).hex() for i in range(4)])
        self.ret(u)

    def import_hook(self, u, address, size, context):
        name = META['imports'].get(address)
        if name == '_objc_msgSend':
            self.ret(u)
            return
        if name == '_glPushMatrix':
            self.transforms.append(self.translation[:])
        elif name == '_glPopMatrix':
            self.translation = self.transforms.pop()
        elif name == '_glTranslatef':
            self.translation = [a+unf(u.reg_read(r)) for a,r in zip(self.translation, REGS)]
        elif name == '_strcpy':
            dest, source = [u.reg_read(r) for r in REGS[:2]]
            u.mem_write(dest, self.string(source).encode()+b'\0')
        super().import_hook(u, address, size, context)

    def ignore(self, u, address, size, context):
        super().ignore(u, address, size, context)
        if address == 0x879c:
            self.trace[-1]['x'] += self.translation[0]
            self.trace[-1]['y'] += self.translation[1]

    def dialog_hook(self, u, address, size, context):
        super().dialog_hook(u, address, size, context)
        if address == 0x850c:
            self.trace[-1]['x'] += self.translation[0]
            self.trace[-1]['y'] += self.translation[1]


def main():
    p = ScoreProbe()
    player = META['symbols']['_Player']
    p.call(0x19b60, [player])
    default_name = p.string(player)
    p.controls = []
    p.call(0x222f8, [MENU])
    controls = p.controls[:]
    for symbol in ['_FontLarge', '_FontInterface']:
        font = struct.unpack('<I', p.u.mem_read(META['symbols'][symbol],4))[0]
        p.u.mem_write(font+0x1408, struct.pack('<f',1))
    table = META['symbols']['_HiscoreItems']
    entries = []
    for mode in range(2):
        for rank in range(5):
            name = f'Knight {mode+1}/{rank+1}'
            score = (5-rank)*11111 + mode*3
            highlighted = rank == 2
            row = struct.pack('<B31sIB3x', 1, name.encode(), score, highlighted)
            p.u.mem_write(table+mode*4040+rank*40, row)
            entries.append({'mode': mode, 'rank': rank, 'name': name, 'score': score, 'highlighted': highlighted})
    scenes = []
    for offset in [0,-70,-300,-450]:
        p.u.mem_write(MENU+0x20, struct.pack('<f', offset))
        p.trace = []
        p.call(0x23df0, [MENU, f32(0)])
        scenes.append({'offset': offset, 'draws': p.trace[:]})
    motion=[]
    p.u.mem_write(MENU+0x20,bytes(24))
    for frame in range(1,65):
        if frame in [1,2,3,4]:
            x,y=[(240,220),(240,190),(240,150),(240,150)][frame-1]
            p.u.mem_write(SELF+0x74000,struct.pack('<2i',x,y))
            p.call([0x1dc44,0x1db64,0x1db64,0x1dc20][frame-1],[MENU,SELF+0x74000,0])
        p.call(0x23df0,[MENU,f32(1/60)])
        motion.append({'frame':frame,'offset':struct.unpack('<f',p.u.mem_read(MENU+0x20,4))[0], 'velocity':struct.unpack('<f',p.u.mem_read(MENU+0x28,4))[0]})
    p.u.mem_write(player, b'Player\0')
    p.u.mem_write(player+0x64, struct.pack('<I', 123456))
    p.call(0x22178, [1])
    p.u.mem_write(player+0x88, b'\1\0')
    p.u.mem_write(player+0x130, struct.pack('<2I',3,10000))
    p.u.mem_write(META['symbols']['_Land']+0x2dc,b'\0\1')
    p.call(0x20458,[MENU])
    p.trace=[]
    p.call(0x224c4,[MENU,f32(0)])
    result_draws=p.trace[:]
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'default_name': default_name,
              'controls': controls, 'entries': entries, 'scenes': scenes, 'insertions': p.insertions, 'result_draws': result_draws, 'motion':motion}
    (ROOT/'research/hiscores.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'default_name': default_name, 'controls': controls,
                      'scenes': len(scenes), 'motion':len(motion)}, indent=2))


if __name__ == '__main__':
    main()
