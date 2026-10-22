"""Execute original result counting and purchase-dialog entry; research only."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_interlevel import InterlevelProbe
from probe_shop import SHOP


class MenuMotionProbe(InterlevelProbe):
    def __init__(self):
        self.tint = [255] * 4
        super().__init__()

    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '_glColor4ub':
            self.tint = [u.reg_read(r) & 255 for r in REGS]
        super().import_hook(u, address, size, context)

    def dialog_hook(self, u, address, size, context):
        if address == 0x82a0:
            rect = list(struct.unpack('<4h', u.mem_read(u.reg_read(REGS[1]), 8)))
            self.trace.append({'op': 'fill', 'rect': rect, 'rgba': self.tint[:]})
        super().dialog_hook(u, address, size, context)
        if address == 0x850c:
            self.trace[-1]['alpha'] = self.alpha / 255

    def ignore(self, u, address, size, context):
        super().ignore(u, address, size, context)
        if address == 0x879c:
            self.trace[-1]['alpha'] = self.alpha / 255


def main():
    p = MenuMotionProbe()
    p.u.hook_add(UC_HOOK_CODE, lambda u, *args: p.ret(u), begin=0x1d2a8, end=0x1d2a8)
    player, land = (META['symbols'][s] for s in ['_Player', '_Land'])
    p.u.mem_write(player + 0x88, b'\0')
    results = []
    for difficulty, gold, sacrifices in [(0, 1, 1), (1, 2468, 12), (2, 120001, 31), (1, 0, 0)]:
        p.u.mem_write(land + 0x2dc, b'\0\1')
        p.u.mem_write(player + 0x64, struct.pack('<4I', 12345, 53, 7, difficulty))
        p.u.mem_write(player + 0x80, struct.pack('<2I', gold, sacrifices))
        p.u.mem_write(player + 0x130, struct.pack('<2I', 3, 8))
        p.call(0x20458, [SHOP])
        frames = []
        for frame in range(1, 66):
            p.trace = []
            p.call(0x224c4, [SHOP, f32(1 / 60)])
            score = struct.unpack('<i', p.u.mem_read(player + 0x64, 4))[0]
            balance = struct.unpack('<2i', p.u.mem_read(player + 0x80, 8))
            frames.append({'frame': frame, 'score': score, 'gold': balance[0], 'sacrifices': balance[1]})
        results.append({'difficulty': difficulty, 'gold': gold, 'sacrifices': sacrifices, 'score': 12345, 'frames': frames})

    dialog = SELF + 0x71000
    p.call(0x3499c, [dialog, 0])
    p.u.mem_write(dialog + 0x2ca, b'Steel Door\0')
    frames = []
    for frame in range(1, 46):
        p.call(0x33d30, [dialog, f32(1 / 60)])
        p.trace = []
        p.call(0x345a8, [dialog, 0])
        elapsed, scale = struct.unpack('<2f', p.u.mem_read(dialog + 0x14, 8))
        frames.append({'frame': frame, 'elapsed': elapsed, 'scale': scale, 'draws': p.trace[:]})

    buttons = []
    text_ptr = SELF + 0x72000
    p.u.mem_write(text_ptr, b'Go Next\0')
    surfaces = {name: address for address, name in p.surfaces.items()}
    for kind in [0, 1, 2]:
        ptr = SELF + 0x73000
        p.call(0x1d534, [ptr, 14, 256, 115], [61, kind, text_ptr, surfaces['shop_button_pas.png'], surfaces['shop_button_act.png']])
        initial = struct.unpack('<f', p.u.mem_read(ptr + 0x28, 4))[0]
        scales = []
        for frame in range(20):
            p.trace = []
            p.call(0x1d084, [ptr])
            scales.append(struct.unpack('<f', p.u.mem_read(ptr + 0x28, 4))[0])
        buttons.append({'type': kind, 'initial': initial, 'scales': scales})

    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'results': results, 'purchase': frames, 'buttons': buttons}
    (ROOT / 'research/menu-motion.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'result_sequences': len(results), 'dialog_frames': len(frames), 'button_scales': buttons}, indent=2))


if __name__ == '__main__':
    main()
