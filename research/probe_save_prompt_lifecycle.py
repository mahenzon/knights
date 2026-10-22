"""Original saved-prompt persistence across fresh ARM runtimes; OS I/O mocked."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_SP

from extract_enemies import IMAGE, META, REGS, ROOT, SELF
from probe_main_menu import MainMenuProbe, MENU, PLAYER

MODES = ['campaign', 'endless', 'madness']
CHOOSERS = [0x1d838, 0x1eb64, 0x1eb0c]
FLAGS = [META['symbols'][name] for name in
         ['_g_gameSavedCampaign', '_g_gameSavedEndless', '_g_gameSavedMadness']]
CURRENT_MODE = META['symbols']['_g_currentMode']
DIALOGS = META['symbols']['_HelpDialogs']
PATH = SELF + 0x96000


class PromptLifecycleProbe(MainMenuProbe):
    def __init__(self, files=None):
        self.files = {name: bytearray(raw) for name, raw in (files or {}).items()}
        self.filename = None
        self.file_position = 0
        self.io = []
        self.calls = []
        self.blocks = []
        self.created = []
        self.extra_file_component = None
        super().__init__()
        self.intercept_callbacks = False
        self.u.mem_write(DIALOGS, bytes(10 * 0x674))
        self.u.mem_write(CURRENT_MODE, bytes(4))
        for at in [0x254f4, 0x24d3c, 0x2516c, 0x1d780, 0x34f2c,
                   0x25308, 0x24f80, 0x37b50, 0x33d9c, 0x4508]:
            self.u.hook_add(UC_HOOK_CODE, self.lifecycle, begin=at, end=at)

    def no_dialog(self, u, *args):
        pass  # Execute original dialog input and the actual NO callback.

    def word(self, at):
        return struct.unpack('<I', self.u.mem_read(at, 4))[0]

    def flags(self):
        return [self.u.mem_read(at, 1)[0] for at in FLAGS]

    def lifecycle(self, u, address, *args):
        self.calls.append({'address': hex(address), 'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})
        if address in [0x254f4, 0x24d3c]:
            self.filename = 'options'  # Name replaced by native format component below.
            self.u.mem_write(PATH, b'/memory/options\0')
        elif address == 0x2516c:
            raise AssertionError('Menu/prompt termination must not write a battle file')
        elif address == 0x1d780:
            target = u.reg_read(REGS[0])
            self.calls[-1]['mode'] = target
            u.mem_write(CURRENT_MODE, struct.pack('<I', target))
            if target == 10:
                u.reg_write(REGS[0], MENU)
                u.reg_write(UC_ARM_REG_PC, 0x1ebbc)
            else:
                # No battle initialization is necessary to prove absence of an offer.
                self.ret(u)
        elif address == 0x34f2c:
            self.created.append(u.reg_read(REGS[0]))
        elif address in [0x25308, 0x24f80, 0x37b50]:
            self.ret(u)  # Extra data / audio are outside this options-file audit.

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        a = [u.reg_read(r) for r in REGS]
        if name in ['_NSSearchPathForDirectoriesInDomains', '_objc_msgSend']:
            if name == '_objc_msgSend' and self.string(a[1]) == 'stringWithFormat:':
                component = self.word(u.reg_read(UC_ARM_REG_SP))
                self.extra_file_component = self.string(component)
                self.filename = self.extra_file_component
                u.mem_write(PATH, ('/memory/' + self.filename).encode() + b'\0')
            u.reg_write(REGS[0], PATH)
        elif name == '_fopen':
            mode = self.string(a[1])
            self.file_position = 0
            if mode.startswith('w'):
                self.files[self.filename] = bytearray()
            self.io.append({'op': 'open', 'file': self.filename, 'mode': mode})
            u.reg_write(REGS[0], int(self.filename in self.files))
        elif name == '_fseek':
            assert a[1:3] == [0, 0]
            self.file_position = 0
            u.reg_write(REGS[0], 0)
        elif name in ['_fread', '_fwrite']:
            count = a[1] * a[2]
            offset = self.file_position
            block = next((key for key, at in META['symbols'].items() if at == a[0]), hex(a[0]))
            self.io.append({'op': 'read' if name == '_fread' else 'write', 'file': self.filename,
                            'offset': offset, 'bytes': count, 'block': block,
                            'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})
            if name == '_fwrite':
                raw = bytes(u.mem_read(a[0], count))
                self.files[self.filename][offset:offset + count] = raw
                self.blocks.append((a[0], offset, count))
            else:
                raw = bytes(self.files[self.filename][offset:offset + count])
                assert len(raw) == count
                u.mem_write(a[0], raw)
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

    def persisted(self):
        offsets = [next(offset for at, offset, _ in self.blocks if at == flag) for flag in FLAGS]
        return {'file': self.filename, 'bytes': len(self.files[self.filename]),
                'sha256': hashlib.sha256(self.files[self.filename]).hexdigest(),
                'flag_offsets': offsets, 'flags': [self.files[self.filename][off] for off in offsets]}

    def choose(self, mode):
        self.created = []
        self.call(CHOOSERS[MODES.index(mode)], [])
        return {'runtime_flags': self.flags(), 'current_mode': self.word(CURRENT_MODE),
                'dialogs_created': self.created[:],
                'active_dialogs': sum(bool(self.u.mem_read(DIALOGS + i * 0x674, 1)[0]) for i in range(10))}


def case(mode, answer, shutdown):
    index = MODES.index(mode)
    expected = [int(i != index) for i in range(3)]
    p = PromptLifecycleProbe()
    for flag in FLAGS:
        p.u.mem_write(flag, b'\1')
    p.call(0x254f4, [])
    baseline = p.persisted()
    baseline_io = p.io[:]
    p.calls = []; p.io = []
    chosen = p.choose(mode)
    assert chosen['dialogs_created'] == [4]
    assert chosen['runtime_flags'] == expected
    after_open = p.persisted()
    if answer == 'no':
        p.call(0x33f84, [180, 185, 0])
        p.call(0x33f84, [180, 185, 1])
        assert any(c['address'] == '0x33d9c' for c in p.calls)
        assert not any(p.u.mem_read(DIALOGS + i * 0x674, 1)[0] for i in range(10))
    after_answer = p.persisted()
    if shutdown == 'terminate_callback':
        p.call(0x4508, [])
    before_restart = p.persisted()
    expected_persistent = expected if mode == 'campaign' or shutdown == 'terminate_callback' else [1, 1, 1]
    assert before_restart['flags'] == expected_persistent
    assert after_open['flags'] == (expected if mode == 'campaign' else [1, 1, 1])
    assert after_answer == after_open

    # Fresh Unicorn image + fresh initializers; transfer only persisted bytes.
    fresh = PromptLifecycleProbe(p.files)
    assert fresh.flags() == [0, 0, 0]
    fresh.call(0x24d3c, [])
    assert fresh.u.reg_read(REGS[0]) == 1
    loaded_flags = fresh.flags()
    assert loaded_flags == expected_persistent
    new_choice = fresh.choose(mode)
    assert new_choice['dialogs_created'] == ([4] if expected_persistent[index] else [])
    return {'mode': mode, 'answer': answer, 'shutdown': shutdown, 'baseline': baseline,
            'baseline_io': baseline_io, 'chosen': chosen, 'after_open': after_open,
            'after_answer': after_answer, 'before_restart': before_restart,
            'calls': p.calls, 'io': p.io, 'fresh_loaded_flags': loaded_flags,
            'fresh_mode_choice': new_choice, 'fresh_io': fresh.io}


def main():
    cases = [case(mode, answer, shutdown) for mode in MODES
             for answer in ['unanswered', 'no']
             for shutdown in ['no_termination_callback', 'terminate_callback']]
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Actual native chooser/dialog-NO/SaveOptions/LoadOptions/applicationWillTerminate '
                       'instructions. Fresh Unicorn runtime per restart; only mocked file bytes transferred. '
                       'Full UIKit boot and OS callback delivery not executed; main init substitutes shell '
                       'setup and original LoadOptions boot call is invoked directly. '
                       'Extra data, graphics, audio, outgoing mode transitions and all OS/file APIs mocked. '
                       'No native user saves or browser storage read or modified.'}
    (ROOT / 'research/save-prompt-lifecycle.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Verified 12 native saved-prompt persistence/restart cases with actual options serialization.')
    for row in cases:
        print(row['mode'], row['answer'], row['shutdown'],
              row['fresh_loaded_flags'], row['fresh_mode_choice']['dialogs_created'])


if __name__ == '__main__':
    main()
