"""Native save/load with in-memory stdio and OS calls; no user save files touched."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_full_days import FullDayProbe, GAME
from probe_session_random import PLAYER, WAVE, SKIP
from probe_save_lifecycle import SaveProbe
from probe_compound_menu_input import CompoundProbe, MENU

CURRENT_MODE = META['symbols']['_g_currentMode']
FLAGS = [META['symbols'][n] for n in ['_g_gameSavedCampaign', '_g_gameSavedEndless', '_g_gameSavedMadness']]
BLOCKS = [('_Player', 0xc73a8, 572), ('_Wave', 0xc7404, 76), ('_Land', 0xc73ac, 736),
          ('_Creeps', 0xc7528, 256 * 200), ('_DragObjects', 0xc7524, 116 * 30),
          ('_Artefacts', 0xc7548, 152 * 25)]
NAME, PATH = SELF + 0x96000, SELF + 0x96100


class RoundtripProbe(FullDayProbe):
    def __init__(self):
        self.files = {}
        self.file_position = 0
        self.filename = None
        self.io = []
        self.lifecycle = []
        self.after_init = None
        super().__init__()
        self.blocks = [(n, self.get_at(ptr, 0, 'I'), size) for n, ptr, size in BLOCKS]
        self.land = self.get_at(0xc73ac, 0, 'I')
        for address in [0x2516c, 0x24b80, 0x254f4, 0x35588]:
            self.u.hook_add(UC_HOOK_CODE, self.save_hook, begin=address, end=address)

    def string(self, address):
        return bytes(self.u.mem_read(address, 512)).split(b'\0')[0].decode()

    def save_hook(self, u, address, *args):
        if address in [0x2516c, 0x24b80]:
            self.filename = self.string(u.reg_read(REGS[0]))
            self.u.mem_write(PATH, ('/memory/' + self.filename).encode() + b'\0')
            self.lifecycle.append({'op': 'save' if address == 0x2516c else 'load', 'file': self.filename})
        elif address == 0x35588:
            self.after_init = self.snapshot()
            self.lifecycle.append({'op': 'after_battle_initializer', 'day': self.after_init['day'],
                                   'elapsed': self.after_init['elapsed']})
        else:
            self.lifecycle.append({'op': 'save_options_intercepted'})
            self.ret(u)

    def change_mode(self, u, *args):
        mode = u.reg_read(REGS[0])
        self.lifecycle.append({'op': 'switch_mode', 'mode': mode})
        self.u.mem_write(CURRENT_MODE, struct.pack('<I', mode))
        if mode == 1:
            # Preserve actual incoming InitMode; outgoing DeInit/GPU are out of scope.
            u.reg_write(REGS[0], GAME)
            u.reg_write(UC_ARM_REG_PC, 0x20e1c)
            return
        if mode == 9:
            self.switched = True
        self.ret(u)

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        a = [u.reg_read(r) for r in REGS]
        if name in ['_NSSearchPathForDirectoriesInDomains', '_objc_msgSend']:
            u.reg_write(REGS[0], PATH)
        elif name == '_fopen':
            mode = self.string(a[1])
            self.file_position = 0
            if mode.startswith('w'):
                self.files[self.filename] = bytearray()
            self.io.append({'op': 'open', 'file': self.filename, 'mode': mode})
            u.reg_write(REGS[0], 1 if self.filename in self.files else 0)
        elif name == '_fseek':
            assert a[1:3] == [0, 0]
            self.file_position = 0
            u.reg_write(REGS[0], 0)
        elif name in ['_fwrite', '_fread']:
            size = a[1] * a[2]
            offset = self.file_position
            block = next((n for n, ptr, _ in self.blocks if ptr == a[0]), 'version')
            self.io.append({'op': 'write' if name == '_fwrite' else 'read',
                            'file': self.filename, 'offset': offset, 'size': size, 'block': block})
            if name == '_fwrite':
                raw = bytes(u.mem_read(a[0], size))
                self.files[self.filename][offset:offset + size] = raw
            else:
                raw = self.files[self.filename][offset:offset + size]
                u.mem_write(a[0], bytes(raw))
            self.file_position += len(raw)
            u.reg_write(REGS[0], len(raw) // a[1])
        elif name == '_fclose':
            self.io.append({'op': 'close', 'file': self.filename})
            u.reg_write(REGS[0], 0)
        elif name == '_memset':
            u.mem_write(a[0], bytes([a[1] & 255]) * a[2])
        else:
            return super().import_hook(u, address, *args)
        self.ret(u)

    def snapshot(self):
        return {'day': self.get_at(PLAYER, 0x130, 'I'),
                'gold': self.get_at(PLAYER, 0x80, 'I'), 'souls': self.get_at(PLAYER, 0x84, 'I'),
                'inventory': list(struct.unpack('<20i', self.u.mem_read(PLAYER + 0x8c, 80))),
                'elapsed': self.get_at(self.land, 4), 'hp': self.get_at(self.land, 0x28c),
                'won': self.get_at(self.land, 0x2dc, 'B'), 'failed': self.get_at(self.land, 0x2dd, 'B'),
                'actors': len(self.actors()), 'rng': self.stream,
                'mode': self.get_at(CURRENT_MODE, 0, 'I'),
                'paused': self.get_at(META['symbols']['_g_paused'], 0, 'B'),
                'hashes': {n: hashlib.sha256(self.u.mem_read(ptr, size)).hexdigest()
                           for n, ptr, size in self.blocks}}

    def setup(self, mode):
        self.stream = None
        self.clean()
        self.u.mem_write(PLAYER + 0x184, bytes(80))
        self.u.mem_write(WAVE, bytes(0x50))
        self.u.mem_write(SKIP, bytes(4))
        self.u.mem_write(PLAYER + 0x234, bytes(4))
        self.u.mem_write(PLAYER + 0x88, bytes([mode != 'campaign', mode == 'madness']))
        self.u.mem_write(self.get_at(0xc7574, 0, 'I'), b'\1')
        self.stream = 73
        self.setup_day()
        for _ in range(360):
            self.call(0x20728, [GAME, f32(1 / 60)])

    def save_file(self, mode):
        filename = f'recent{["campaign", "endless", "madness"].index(mode) + 1}.sav'
        self.u.mem_write(NAME, filename.encode() + b'\0')
        self.call(0x2516c, [NAME])
        return filename


def roundtrip(mode, phase):
    p = RoundtripProbe()
    p.setup(mode)
    if phase != 'battle':
        p.u.mem_write(p.land + 0x2dc, b'\1\0')
        if phase == 'complete':
            p.u.mem_write(PLAYER + 0x130, bytes(p.u.mem_read(PLAYER + 0x134, 4)))
        p.u.mem_write(CURRENT_MODE, struct.pack('<I', 8 if phase == 'shop' else 9))
    if phase == 'shop':
        # Supplied already-purchased state, not an audit of the purchase callback.
        p.u.mem_write(PLAYER + 0x80, struct.pack('<2I', 12345, 67))
        p.u.mem_write(PLAYER + 0x8c + 10 * 4, struct.pack('<i', 2))
    before = p.snapshot()
    p.io = []; p.lifecycle = []
    filename = p.save_file(mode)
    assert len(p.files[filename]) == 59868
    # A poisoned runtime proves all serialized blocks are actually re-read.
    for _, ptr, size in p.blocks:
        p.u.mem_write(ptr, bytes([0x55]) * size)
    p.call(0x24b80, [NAME])
    direct = p.snapshot()
    assert direct['hashes'] == before['hashes']
    # Actual resume clears the matched availability flag and initializes then reloads.
    for flag in FLAGS:
        p.u.mem_write(flag, b'\1')
    p.lifecycle = []
    p.call(0x354f8, [])
    resumed = p.snapshot()
    assert resumed['hashes'] == before['hashes']
    assert [e['op'] for e in p.lifecycle] == ['load', 'switch_mode', 'after_battle_initializer', 'load', 'save_options_intercepted']
    assert resumed['mode'] == 1
    assert p.after_init['day'] == before['day'] + 1
    assert p.after_init['elapsed'] == 0
    flags = [p.get_at(flag, 0, 'B') for flag in FLAGS]
    assert flags == [int(i != ['campaign', 'endless', 'madness'].index(mode)) for i in range(3)]
    p.switched = False
    frames = 0
    while frames < (520 if phase != 'battle' else 1):
        frames += 1
        p.call(0x20728, [GAME, f32(1 / 60)])
        if p.switched:
            break
    if phase != 'battle':
        assert p.switched
    return {'mode': mode, 'phase': phase, 'before': before, 'direct_load': direct,
            'after_initializer_before_second_load': p.after_init, 'resumed': resumed,
            'flags_after_resume': flags, 'native_file_bytes': len(p.files[filename]),
            'stdio': p.io, 'lifecycle': p.lifecycle,
            'after_frames': frames, 'returned_to_result': p.switched, 'after': p.snapshot()}


def eligibility_edges():
    p = SaveProbe()
    result = []
    for mode in range(3):
        p.u.mem_write(PLAYER + 0x88, bytes([mode != 0, mode == 2]))
        for ui, number, paused in [('paused', 1, 1), ('options_from_battle', 3, 0), ('map_after_abort', 10, 0)]:
            for flag in FLAGS:
                p.u.mem_write(flag, b'\1')
            p.u.mem_write(META['symbols']['_g_paused'], bytes([paused]))
            p.u.mem_write(CURRENT_MODE, struct.pack('<I', number))
            p.u.mem_write(META['symbols']['_Land'] + 0x2dd, b'\0')
            p.calls = []
            p.call(0x4508, [])
            flags = [bool(p.u.mem_read(flag, 1)[0]) for flag in FLAGS]
            assert flags == [ui == 'paused' if i == mode else True for i in range(3)]
            result.append({'mode': ['campaign', 'endless', 'madness'][mode], 'ui': ui,
                           'flags_after_terminate': flags, 'calls': p.calls[:]})
    return result


def no_resume_choices():
    result = []
    for mode, chooser in [('campaign', 0x1d838), ('endless', 0x1eb64), ('madness', 0x1eb0c)]:
        p = CompoundProbe('map')
        switches = []

        def switch(u, *args):
            target = u.reg_read(REGS[0])
            switches.append(target)
            u.mem_write(CURRENT_MODE, struct.pack('<I', target))
            if target == 10:
                u.reg_write(REGS[0], MENU)
                u.reg_write(UC_ARM_REG_PC, 0x1ebbc)
            else:
                p.ret(u)

        p.u.hook_add(UC_HOOK_CODE, switch, begin=0x1d780, end=0x1d780)
        p.u.mem_write(CURRENT_MODE, bytes(4))
        for flag in FLAGS:
            p.u.mem_write(flag, b'\1')
        p.created = []
        p.call(chooser, [])
        after_choice = {'mode': p.get_at(CURRENT_MODE, 0, 'I'), 'created': p.created[:],
                        'flags': [p.get_at(f, 0, 'B') for f in FLAGS], 'dialogs': p.state()['dialogs']}
        assert after_choice['created'] == [{'kind': 4, 'text': None}]
        index = ['campaign', 'endless', 'madness'].index(mode)
        assert after_choice['flags'] == [int(i != index) for i in range(3)]
        controls = after_choice['dialogs'][0]['buttons']
        assert [(b['text'], b['callback']) for b in controls if b['active']] == [('NO', '0x33d9c'), ('YES', '0x354f8')]
        p.allowed.add(0x33d9c)
        p.actions = []
        p.call(0x33f84, [180, 185, 0])
        p.call(0x33f84, [180, 185, 1])
        after_no = {'mode': p.get_at(CURRENT_MODE, 0, 'I'), 'actions': p.actions[:],
                    'flags': [p.get_at(f, 0, 'B') for f in FLAGS], 'dialogs': p.state()['dialogs']}
        assert after_no['actions'] == ['0x33d9c'] and after_no['dialogs'] == []
        assert after_no['flags'] == after_choice['flags']
        assert after_no['mode'] == after_choice['mode'] == (10 if mode == 'campaign' else 0)
        p.created = []
        p.call(chooser, [])
        after_second = {'mode': p.get_at(CURRENT_MODE, 0, 'I'), 'created': p.created[:],
                        'flags': [p.get_at(f, 0, 'B') for f in FLAGS]}
        assert after_second['created'] == []
        assert after_second['mode'] == (10 if mode == 'campaign' else 1)
        result.append({'mode': mode, 'after_choice': after_choice, 'after_no': after_no,
                       'after_second_choice': after_second, 'switches': switches})
    return result


def abort_choices():
    result = []
    for mode in range(3):
        p = SaveProbe()
        p.u.hook_add(UC_HOOK_CODE, lambda u, *args: u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR)),
                     begin=0x1cd30, end=0x1cd30)
        p.u.mem_write(PLAYER + 0x88, bytes([mode != 0, mode == 2]))
        p.u.mem_write(META['symbols']['_g_paused'], b'\1')
        p.u.mem_write(CURRENT_MODE, struct.pack('<I', 1))
        for i, flag in enumerate(FLAGS):
            p.u.mem_write(flag, bytes([i != mode]))
        p.calls = []
        p.call(0x1ca78, [])
        target = 10 if mode == 0 else 0
        assert p.calls == [{'function': '0x1d780', 'argument': target}]
        assert p.u.mem_read(META['symbols']['_g_paused'], 1) == b'\0'
        result.append({'mode': ['campaign', 'endless', 'madness'][mode], 'calls': p.calls[:],
                       'paused': 0, 'flags': [p.u.mem_read(f, 1)[0] for f in FLAGS]})
    return result


def main():
    cases = [roundtrip(mode, phase) for mode, phase in [
        ('campaign', 'battle'), ('endless', 'battle'), ('madness', 'battle'),
        ('campaign', 'shop'), ('campaign', 'result'), ('campaign', 'complete')]]
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'blocks': [{'name': name, 'pointer_address': hex(ptr), 'size': size} for name, ptr, size in BLOCKS],
              'cases': cases, 'eligibility_edges': eligibility_edges(),
              'no_resume_choices': no_resume_choices(), 'abort_choices': abort_choices(),
              'scope': 'Actual SaveGame/LoadGame/GoLoadGame with in-memory stdio and Objective-C path mocks; '
                       'actual normalGame initializer on mode1, outgoing DeInit omitted. Actual world frames '
                       'before save and after resume. Shop/terminal flags and purchased inventory supplied. '
                       'SaveOptions, asset loading, audio/GPU, outgoing mode callbacks and OS calls intercepted. '
                       'No host/user save file writes. Supplied xorshift randomness is not historical libc.'}
    (ROOT / 'research/save-roundtrip.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'cases': len(cases), 'eligibility_edges': len(result['eligibility_edges']),
                      'resume': [{k: c[k] for k in ['mode', 'phase', 'after_frames', 'returned_to_result']} for c in cases]}))


if __name__ == '__main__':
    main()
