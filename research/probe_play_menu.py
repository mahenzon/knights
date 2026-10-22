"""Recover the active Play menu and saved-game dialog, not the unused newGame carousel."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_menu_motion import MenuMotionProbe

MENU = SELF + 0x71000


class PlayProbe(MenuMotionProbe):
    def __init__(self):
        super().__init__()
        self.controls = []
        self.call(0xb0b8, [])
        for address in [0x1d2a8, 0x33df0, 0x34834]:
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=address, end=address)
        self.u.hook_add(UC_HOOK_CODE, self.fill, begin=0x7f28, end=0x7f28)

    def fill(self, u, *args):
        a = [u.reg_read(r) for r in REGS]
        h, r, g, b = struct.unpack('<4I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 16))
        self.trace.append({'op': 'fill', 'rect': [a[2], a[1], a[2] + h, a[1] + a[3]], 'rgba': [r, g, b, self.alpha]})
        self.ret(u)

    def shop_hook(self, u, address, size, context):
        if address == 0x1d5f4:
            stack = struct.unpack('<5I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 20))
            self.controls.append({'rect': [u.reg_read(r) for r in REGS], 'type': stack[0],
                                  'text': self.string(stack[1]), 'normal': self.surfaces.get(stack[2]),
                                  'pressed': self.surfaces.get(stack[3]), 'callback': hex(stack[4])})
        super().shop_hook(u, address, size, context)


def pause_fixture(p):
    buttons = []

    def hook(u, address, size, context):
        args = [u.reg_read(r) for r in REGS]
        stack = struct.unpack('<5I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 20))
        if address == 0x1d534:
            buttons.append({'pointer': args[0], 'text': p.string(stack[2])})
        else:
            p.trace.append({'op': 'fill', 'rect': [args[2], args[1], args[2] + stack[0], args[1] + args[3]], 'rgba': p.tint[:]})
            p.ret(u)

    p.u.hook_add(UC_HOOK_CODE, hook, begin=0x1d534, end=0x1d534)
    p.u.hook_add(UC_HOOK_CODE, hook, begin=0x7b98, end=0x7b98)
    p.call(0x1c934, [])
    p.u.mem_write(0xe23a4, struct.pack('<f', -350))
    frames = []
    for frame in range(1, 21):
        p.trace = []
        p.call(0x1c7b8, [f32(1 / 60)])
        for button in buttons:
            p.call(0x1d084, [button['pointer']])
        frames.append({'frame': frame, 'y': struct.unpack('<f', p.u.mem_read(0xe23a4, 4))[0], 'draws': p.trace[:]})
    return frames


def main():
    p = PlayProbe()
    p.call(0x21f50, [MENU])
    p.controls = []
    p.call(0x20324, [])
    controls = p.controls[:]
    backdrop = []
    for frame in range(1, 21):
        p.trace = []
        p.call(0x21aec, [MENU, f32(1 / 60)])
        backdrop.append({'frame': frame, 'draws': p.trace[:]})
    surfaces = {name: ptr for ptr, name in p.surfaces.items()}
    buttons = []
    for control in controls:
        text = SELF + 0x73000
        p.u.mem_write(text, control['text'].encode() + b'\0')
        p.call(0x1d534, [MENU, *control['rect'][:3]], [control['rect'][3], control['type'], text,
               surfaces[control['normal']], surfaces[control['pressed']]])
        for frame in range(1, 23):
            pressed = frame > 20
            p.u.mem_write(MENU + 6, bytes([pressed]))
            p.trace = []
            p.call(0x1d084, [MENU])
            buttons.append({'text': control['text'], 'frame': frame, 'pressed': pressed, 'draws': p.trace[:]})
    p.call(0x3499c, [MENU, 4])
    dialog = []
    for frame in range(1, 46):
        p.call(0x33d30, [MENU, f32(1 / 60)])
        p.trace = []
        p.call(0x345a8, [MENU, 0])
        dialog.append({'frame': frame, 'draws': p.trace[:]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'controls': controls,
              'backdrop': backdrop, 'buttons': buttons, 'saved_game': dialog, 'pause': pause_fixture(p)}
    (ROOT / 'research/play-menu.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'controls': controls, 'backdrop': backdrop[-1], 'buttons': buttons[:2],
                      'saved_game_final': dialog[-1]}, indent=2))


if __name__ == '__main__':
    main()
