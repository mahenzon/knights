"""Execute original font parsing/rendering; intercept only file, OS and draw calls."""
import hashlib
import json
import re
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, STACK, Probe, f32
from probe_scene import unf

FONT = SELF + 0x20000
TEXT = SELF + 0x30000


class FontProbe(Probe):
    def __init__(self):
        super().__init__()
        self.source = (ROOT / 'dist/assets/font_interface.fnt').read_bytes()
        self.cursor = 0
        self.heap = SELF + 0x40000
        self.draws = []
        self.u.hook_add(UC_HOOK_CODE, self.surface, begin=0x8ffc, end=0x8ffc)
        self.u.hook_add(UC_HOOK_CODE, self.draw, begin=0x7bf4, end=0x7bf4)

    def ret(self, u):
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def string(self, ptr):
        return bytes(self.u.mem_read(ptr, 2048)).split(b'\0')[0]

    def surface(self, u, *args):
        u.mem_write(u.reg_read(UC_ARM_REG_R0) + 4, struct.pack('<I', SELF + 0x80000))
        self.ret(u)

    def draw(self, u, *args):
        a = [u.reg_read(r) for r in REGS]
        stack = struct.unpack('<4I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 16))
        self.draws.append({'x': unf(a[1]), 'y': unf(a[2]),
                          'rect': list(struct.unpack('<4h', u.mem_read(stack[0], 8))),
                          'scale': [unf(stack[2]), unf(stack[3])]})
        self.ret(u)

    def import_hook(self, u, address, size, context):
        name = META['imports'][address]
        a = [u.reg_read(r) for r in REGS]
        result = 0
        if name in ('__Unwind_SjLj_Register', '__Unwind_SjLj_Unregister', '__ZdaPv',
                    '_fclose', '_fseek', '_glBindTexture'):
            pass
        elif name in ('__Znam', '__Znwm'):
            result = self.heap
            self.heap += (a[0] + 15) & ~15
        elif name == '_memset':
            u.mem_write(a[0], bytes([a[1] & 255]) * a[2])
            result = a[0]
        elif name == '_objc_msgSend':
            result = TEXT
        elif name == '_fopen':
            result = 1
        elif name == '_feof':
            result = int(self.cursor >= len(self.source))
        elif name == '_fgetc':
            result = self.source[self.cursor]
            self.cursor += 1
        elif name == '_strcpy':
            u.mem_write(a[0], self.string(a[1]) + b'\0')
            result = a[0]
        elif name in ('_strrchr', '_strchr'):
            value = self.string(a[0])
            index = value.rfind(bytes([a[1]])) if name == '_strrchr' else value.find(bytes([a[1]]))
            result = a[0] + index if index >= 0 else 0
        elif name in ('_strcmp', '_strncmp'):
            left, right = self.string(a[0]), self.string(a[1])
            if name == '_strncmp':
                left, right = left[:a[2]], right[:a[2]]
            result = int(left != right)
        elif name == '_sscanf':
            value, fmt = self.string(a[0]), self.string(a[1])
            if b'%s' in fmt:
                u.mem_write(a[2], value.split(b'=', 1)[1].strip() + b'\0')
                result = 1
            else:
                numbers = [int(v) for v in re.findall(rb'-?\d+', value)]
                pointers = a[2:] + list(struct.unpack('<4I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 16)))
                for ptr, number in zip(pointers, numbers):
                    u.mem_write(ptr, struct.pack('<i', number))
                result = len(numbers)
        else:
            raise RuntimeError(f'Unhandled font import {name}')
        u.reg_write(UC_ARM_REG_R0, result)
        self.ret(u)


def main():
    p = FontProbe()
    p.u.mem_write(TEXT, b'font_interface.fnt\0')
    p.call(0x8820, [FONT, TEXT])
    # The application aliases all three fonts and assigns tracking after construction.
    p.u.reg_write(UC_ARM_REG_SP, STACK)
    p.u.mem_write(STACK + 4, struct.pack('<I', FONT))
    p.u.emu_start(0x7188, 0x71c4, count=100)
    tracking = unf(struct.unpack('<I', p.u.mem_read(FONT + 0x1414, 4))[0])
    glyphs = []
    for char in range(32, 127):
        rect = list(struct.unpack('<4h', p.u.mem_read(FONT + 0x404 + char * 8, 8)))
        before = unf(struct.unpack('<I', p.u.mem_read(FONT + 0xc04 + char * 4, 4))[0])
        after = unf(struct.unpack('<I', p.u.mem_read(FONT + 0x1004 + char * 4, 4))[0])
        glyphs.append({'char': chr(char), 'rect': rect, 'before': before, 'after': after})
    samples = []
    for text, x, y, size in [('0', 22, 294, .75), ('10000', 22, 294, .75),
                              ('100', 133, 294, .75), ('Campaign', 245, 81, 1),
                              ('A\nAA', 100, 10, .5), ('A A', 100, 20, .6),
                              ('Saved game detected.\nLoad and continue?', 240, 120, .6)]:
        for align in range(3):
            p.u.mem_write(TEXT, text.encode() + b'\0')
            p.u.mem_write(FONT + 0x1408, struct.pack('<f', size))
            p.draws = []
            p.call(0x850c, [FONT, f32(x), f32(y), align], [TEXT])
            samples.append({'text': text, 'x': x, 'y': y, 'size': size, 'align': align, 'draws': p.draws[:]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'tracking': tracking,
              'glyphs': glyphs, 'samples': samples}
    (ROOT / 'research/font-layout.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'glyphs': len(glyphs), 'tracking': tracking, 'zero_bearings': all(g['before'] == g['after'] == 0 for g in glyphs),
                      'samples': len(samples), 'first': samples[0]}, indent=2))


if __name__ == '__main__':
    main()
