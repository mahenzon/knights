"""Execute original shutdown-save eligibility and result Done callbacks; no host files changed."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_LR, UC_ARM_REG_PC
from extract_enemies import Probe, META, IMAGE, ROOT


class SaveProbe(Probe):
    def __init__(self):
        super().__init__()
        self.calls = []
        for address in [0x2516c, 0x254f4, 0x1d780, 0x22178, 0x1995c]:
            self.u.hook_add(UC_HOOK_CODE, self.record, begin=address, end=address)

    def record(self, u, address, size, context):
        arg = u.reg_read(UC_ARM_REG_R0)
        if address == 0x2516c:
            arg = bytes(u.mem_read(arg, 50)).split(b'\0')[0].decode()
        self.calls.append({'function': hex(address), 'argument': arg})
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '_objc_msgSend':
            u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))
        else:
            super().import_hook(u, address, size, context)


def main():
    p = SaveProbe()
    player, land = [META['symbols'][n] for n in ['_Player', '_Land']]
    mode_ptr = struct.unpack('<I', p.u.mem_read(0xc73b0, 4))[0]
    cases = []
    for game, flags in [('campaign', [0, 0]), ('endless', [1, 0]), ('madness', [1, 1])]:
        p.u.mem_write(player + 0x88, bytes(flags))
        for ui, number in [('menu', 0), ('battle', 1), ('shop', 8), ('result', 9), ('map', 10)]:
            for defeated in [False, True]:
                p.calls = []
                p.u.mem_write(mode_ptr, struct.pack('<I', number))
                p.u.mem_write(land + 0x2dd, bytes([defeated]))
                p.call(0x4508, [])
                saves = [c['argument'] for c in p.calls if c['function'] == '0x2516c']
                available = bool(p.u.mem_read(META['symbols'][{
                    'campaign': '_g_gameSavedCampaign', 'endless': '_g_gameSavedEndless',
                    'madness': '_g_gameSavedMadness'}[game]], 1)[0])
                assert available == bool(saves)
                assert available == (ui == 'shop' or (not defeated and ui in ['battle', 'result']))
                cases.append({'mode': game, 'ui': ui, 'defeated': defeated,
                              'available': available, 'saved_files': saves})
    done = []
    for game, flags in [('campaign', [0, 0]), ('endless', [1, 0]), ('madness', [1, 1])]:
        p.calls = []
        p.u.mem_write(player + 0x88, bytes(flags))
        p.call(0x22274, [])
        done.append({'mode': game, 'calls': p.calls[:]})
    assert done[0]['calls'][-1] == {'function': '0x1d780', 'argument': 10}
    assert all(d['calls'][0] == {'function': '0x1d780', 'argument': 5} for d in done[1:])
    (ROOT/'research/save-lifecycle.json').write_text(json.dumps({
        'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases, 'done': done}, indent=2)+'\n')
    print('Verified 30 native save cases: defeat is not resumable; campaign Done returns to map.')


if __name__ == '__main__':
    main()
