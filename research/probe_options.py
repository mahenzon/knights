"""Recover the original Options screen, input bounds and exit behavior."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_play_menu import PlayProbe, MENU


class OptionsProbe(PlayProbe):
    def __init__(self):
        super().__init__()
        self.events = []
        for address in [0x7b98, 0x254f4, 0x37b50, 0x1cedc, 0x33f84, 0x1d780, 0x1d7d0]:
            self.u.hook_add(UC_HOOK_CODE, self.option_hook, begin=address, end=address)

    def ignore(self, u, address, size, context):
        super().ignore(u, address, size, context)
        if address == 0x7bf4 and self.tint[:3] != [255,255,255]:
            self.trace[-1]['tint'] = self.tint[:3]

    def option_hook(self, u, address, size, context):
        a = [u.reg_read(r) for r in REGS]
        if address == 0x7b98:
            height = struct.unpack('<I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 4))[0]
            self.trace.append({'op': 'fill', 'rect': [a[2], a[1], a[2]+height, a[1]+a[3]], 'rgba': self.tint[:]})
        else:
            self.events.append({'function': hex(address), 'args': a[:2]})
        if address == 0x33f84:
            u.reg_write(REGS[0], 0)
        self.ret(u)


def main():
    p = OptionsProbe()
    player = META['symbols']['_Player']
    def set_state(difficulty=1, reverse=True, muted=False, volume=.5, paused=False):
        p.u.mem_write(player+0x70, struct.pack('<I', difficulty))
        p.u.mem_write(player+0x238, bytes([reverse]))
        p.u.mem_write(META['symbols']['_g_muteMusic'], bytes([muted]))
        p.u.mem_write(META['symbols']['_g_musicVolume'], struct.pack('<f', volume))
        p.u.mem_write(META['symbols']['_g_optionsMustReturnToGame'], bytes([paused]))
    def state():
        return {'difficulty': struct.unpack('<I', p.u.mem_read(player+0x70, 4))[0],
                'reverse': bool(p.u.mem_read(player+0x238, 1)[0]),
                'muted': bool(p.u.mem_read(META['symbols']['_g_muteMusic'], 1)[0]),
                'volume': struct.unpack('<f', p.u.mem_read(META['symbols']['_g_musicVolume'], 4))[0],
                'paused': bool(p.u.mem_read(META['symbols']['_g_optionsMustReturnToGame'], 1)[0])}
    screens = []
    for paused in [False, True]:
        for difficulty in range(3):
            set_state(difficulty, difficulty != 0, difficulty == 2, difficulty/2, paused)
            p.controls = []
            p.call(0x2012c, [MENU])
            p.trace = []
            p.call(0x24214, [MENU, f32(1/60)])
            screens.append({'state': state(), 'controls': p.controls[:], 'draws': p.trace[:]})
    inputs = []
    for fn in [0x24a5c, 0x249c4]:
        for x, y in [(-1,0),(0,0),(159,99),(160,99),(319,99),(320,99),(479,99),(480,99),(100,100),
                     (24,116),(25,116),(149,154),(150,154),(23,156),(149,195),(149,196),
                     (69,210),(70,210),(210,230),(350,254),(359,254),(360,254),(210,255)]:
            set_state()
            p.u.mem_write(SELF+0x74000, struct.pack('<2i', x,y))
            p.call(fn, [MENU, SELF+0x74000, 0])
            inputs.append({'function': hex(fn), 'point': [x,y], 'state': state()})
    exits = []
    for paused in [False,True]:
        set_state(paused=paused)
        p.events = []
        p.call(0x20238, [])
        exits.append({'paused_before': paused, 'state': state(), 'events': p.events[:]})
    dialogs = []
    for kind in [2,6]:
        p.call(0x3499c, [MENU, kind])
        frames = []
        for frame in range(1,46):
            p.call(0x33d30, [MENU, f32(1/60)])
            p.trace = []
            p.call(0x345a8, [MENU, 0])
            frames.append({'frame': frame, 'draws': p.trace[:]})
        dialogs.append({'kind': kind, 'frames': frames})
    actions = []
    level_data = META['symbols']['_LevelData']
    for action, address in [('cheat', 0x353b4), ('reset', 0x35758)]:
        set_state(difficulty=2, reverse=True)
        p.u.mem_write(player+0x64, struct.pack('<I', 123456))
        p.call(address, [])
        actions.append({'action': action, 'state': state(), 'score': struct.unpack('<I', p.u.mem_read(player+0x64,4))[0], 'levels': [list(p.u.mem_read(level_data+i*0xf4+0xd4,2)) for i in range(30)]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'screens': screens, 'inputs': inputs, 'exits': exits, 'dialogs': dialogs, 'actions': actions}
    (ROOT/'research/options.json').write_text(json.dumps(result, indent=2)+'\n')
    print('Recovered 6 Options scenes, 46 input cases, 90 dialog frames and both exit paths.')


if __name__ == '__main__':
    main()
