"""Native saved-game backdrop and result acknowledgement; all OS work mocked."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, REGS, ROOT, f32
from probe_main_menu import MainMenuProbe, MENU, PLAYER, BUTTONS

LEVELS = META['symbols']['_LevelData']
DIALOGS = META['symbols']['_HelpDialogs']


class SavedUiProbe(MainMenuProbe):
    def __init__(self):
        self.routes = []
        super().__init__()
        self.intercept_callbacks = False
        self.u.mem_write(DIALOGS, bytes(10 * 0x674))
        for address in (0x1d780, 0x254f4, 0x25308, 0x24f80):
            self.u.hook_add(UC_HOOK_CODE, self.side_effect, begin=address, end=address)

    def side_effect(self, u, address, *args):
        self.routes.append({'address': hex(address), 'argument': u.reg_read(REGS[0])})
        self.ret(u)

    def no_dialog(self, u, *args):
        pass  # Actual dialog update, draw, and NO callback execute.

    def controls_state(self):
        return [{'text': self.string(BUTTONS + i * 132 + 0x3c),
                 'scale': struct.unpack('<f', self.u.mem_read(BUTTONS + i * 132 + 0x28, 4))[0]}
                for i in range(30) if self.u.mem_read(BUTTONS + i * 132 + 4, 1)[0]]


def backdrop(mode):
    p = SavedUiProbe()
    p.call(0x20324, [])
    for _ in range(30):
        p.draw()
    before = {'controls': p.controls_state(), 'fade': p.state()['fade']}
    flag = META['symbols']['_g_gameSavedEndless' if mode == 'endless' else '_g_gameSavedMadness']
    p.u.mem_write(flag, b'\1')
    p.call(0x1eb64 if mode == 'endless' else 0x1eb0c, [])
    opened = {'controls': p.controls_state(), 'fade': p.state()['fade']}
    assert opened == before
    for _ in range(60):
        drawing = p.draw()
    texts = [d['text'] for d in drawing['draws'] if d['op'] == 'text']
    expected = ['Campaign', 'Endless Siege', 'Madness', 'Back']
    assert texts[:4] == expected, texts
    assert 'NO' in texts and 'YES' in texts, texts
    p.call(0x33f84, [180, 185, 0])
    p.call(0x33f84, [180, 185, 1])
    after = {'controls': p.controls_state(), 'fade': p.state()['fade']}
    assert after == before
    assert not any(p.u.mem_read(DIALOGS + i * 0x674, 1)[0] for i in range(10))
    assert p.routes == []
    return {'mode': mode, 'before': before, 'opened': opened,
            'dialog_draws': drawing['draws'], 'after_no': after, 'routes': p.routes}


def acknowledge(won):
    p = SavedUiProbe()
    land = struct.unpack('<I', p.u.mem_read(0xc73ac, 4))[0]
    for i, level in enumerate(json.loads((ROOT / 'research/campaign-data.json').read_text())['levels']):
        row = bytearray.fromhex(level['rawLevelData'])
        row[0xd4] = 0
        row[0xd5] = i == 0
        row[0xf0] = 0
        struct.pack_into('<2I', row, 0xe4, 0, 0)
        p.u.mem_write(LEVELS + i * 244, bytes(row))
    p.u.mem_write(PLAYER + 0x88, b'\0\0')
    p.u.mem_write(PLAYER + 0x234, bytes(4))
    p.u.mem_write(PLAYER + 0x64, struct.pack('<4I', 12345, 53, 7, 1))
    p.u.mem_write(PLAYER + 0x80, struct.pack('<2I', 2468, 12))
    p.u.mem_write(PLAYER + 0x130, struct.pack('<2I', 8 if won else 3, 8))
    p.u.mem_write(land + 0x2dc, bytes([won, not won]))

    def state():
        return {'completed': bool(p.u.mem_read(LEVELS + 0xd4, 1)[0]),
                'next_open': bool(p.u.mem_read(LEVELS + 244 + 0xd5, 1)[0]),
                'scores': list(struct.unpack('<2I', p.u.mem_read(LEVELS + 0xe4, 8))),
                'run_score': struct.unpack('<I', p.u.mem_read(PLAYER + 0x64, 4))[0]}

    before = state()
    p.call(0x20458, [MENU])
    for _ in range(65):
        p.call(0x224c4, [MENU, f32(1 / 60)])
    after_result_draws = state()
    assert after_result_draws['completed'] is False and after_result_draws['next_open'] is False
    assert after_result_draws['scores'] == [0, 0]
    controls = p.controls[-1:]
    assert controls[0]['text'] == 'Done', controls
    callback = int(controls[0]['callback'], 16)
    assert callback == (0x206bc if won else 0x22274)
    # Invoke the exact original callback selected by result InitMode; no production substitute.
    p.call(callback, [])
    after_done = state()
    assert after_done['completed'] == won and after_done['next_open'] == won
    assert after_done['scores'] == [after_result_draws['run_score']] * 2
    assert p.routes == [{'address': '0x1d780', 'argument': 10}]
    return {'won': won, 'before': before, 'after_result_draws': after_result_draws,
            'result_draw_count': 65, 'done_control': controls[0], 'after_done': after_done,
            'routes': p.routes}


def main():
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'saved_dialog_backdrops': [backdrop(mode) for mode in ['endless', 'madness']],
              'terminal_acknowledgement': [acknowledge(won) for won in [True, False]],
              'scope': 'Actual Play/Endless/Madness callbacks, mainMenu Draw, dialog update/draw/NO; '
                       'actual supplied victory/defeat result InitMode, 65 Draws and selected Done callback. '
                       'All navigation, OS files, assets, GPU and audio intercepted. No natural battle '
                       'completion claimed and no user saves touched.'}
    (ROOT / 'research/save-ui.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Verified 2 saved-dialog backdrops and 2 terminal acknowledgement routes.')


if __name__ == '__main__':
    main()
