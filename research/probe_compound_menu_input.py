"""Bounded original compound menu gestures; no OS audio, navigation or mail."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_PC

from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_main_menu import MainMenuProbe, MENU, POINT, PLAYER, BUTTONS

DIALOGS = META['symbols']['_HelpDialogs']
LEVELS = META['symbols']['_LevelData']
ITEMS = META['symbols']['_ShopItems']
HANDLERS = {
    'map': {'down': 0x1de4c, 'move': 0x1dc7c, 'up': 0x1dd64, 'draw': 0x22e88},
    'shop': {'down': 0x31e50, 'move': 0x31de4, 'up': 0x31e90, 'draw': 0x32760},
    'scores': {'down': 0x1dc44, 'move': 0x1db64, 'up': 0x1dc20, 'draw': 0x23df0},
    'options': {'down': 0x24a5c, 'move': 0x249c4, 'up': 0x1dd94, 'draw': 0x24214},
}


class CompoundProbe(MainMenuProbe):
    def __init__(self, mode):
        self.actions = []
        self.created = []
        self.allowed = set()
        self.mode = mode
        self.shop_width = 0
        super().__init__()
        self.u.hook_add(UC_HOOK_CODE, self.button_action, begin=0x1ce3c, end=0x1ce3c)
        self.u.hook_add(UC_HOOK_CODE, self.create_dialog, begin=0x34f2c, end=0x34f2c)
        self.u.hook_add(UC_HOOK_CODE, self.width, begin=0x32840, end=0x32840)
        for address in (0x254f4, 0x25308, 0x24f80, 0x37b50):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=address, end=address)
        self.u.mem_write(DIALOGS, bytes(10 * 0x674))
        self.u.mem_write(MENU, bytes(0x100))
        self.controls = []
        self.u.mem_write(PLAYER + 0x80, struct.pack('<2I', 100000, 1000))
        self.u.mem_write(PLAYER + 0x8c, struct.pack('<20i', *([-1] * 20)))
        self.u.mem_write(PLAYER + 0x22c, bytes(6))
        if mode == 'map':
            self.u.mem_write(MENU + 0x28, struct.pack('<2f', -420, -180))
            self.u.mem_write(PLAYER + 0x234, bytes(4))
            for i, level in enumerate(json.loads((ROOT / 'research/campaign-data.json').read_text())['levels']):
                row = bytearray.fromhex(level['rawLevelData'])
                row[0xd4] = 0
                row[0xd5] = 1
                row[0xd6] = i == 0
                row[0xf0] = 0
                self.u.mem_write(LEVELS + i * 244, bytes(row))
        self.call({'map': 0x1ebbc, 'shop': 0x32cfc, 'scores': 0x222f8, 'options': 0x2012c}[mode], [MENU])
        if mode == 'map':
            # Begin from the settled selected-castle state, without recapturing its entrance.
            self.u.mem_write(MENU + 0x40, struct.pack('<fB', 0, 1))
        if mode == 'options':
            self.u.mem_write(PLAYER + 0x70, struct.pack('<I', 1))
            self.u.mem_write(PLAYER + 0x238, bytes(1))
            self.u.mem_write(META['symbols']['_g_muteMusic'], bytes(1))
            self.u.mem_write(META['symbols']['_g_musicVolume'], struct.pack('<f', .5))
        if mode == 'shop':
            self.u.mem_write(MENU + 0x20, bytes(4))
            self.u.mem_write(MENU + 0x30, bytes(4))
        self.draw_frame(0)
        self.actions = []
        self.created = []

    def callback(self, u, address, *args):
        pass  # ButtonPress call-site hook below owns callback capture for every pool.

    def no_dialog(self, u, address, *args):
        if address == 0x33f84:
            return  # Actual original dialog-priority input routing.
        super().no_dialog(u, address, *args)

    def button_action(self, u, address, *args):
        target = u.reg_read(REGS[0])
        if target:
            self.actions.append(hex(target))
        if target not in self.allowed:
            u.reg_write(UC_ARM_REG_PC, address + 4)

    def create_dialog(self, u, *args):
        self.created.append({'kind': u.reg_read(REGS[0]), 'text': self.string(u.reg_read(REGS[1])) if u.reg_read(REGS[1]) else None})

    def width(self, u, *args):
        self.shop_width = u.reg_read(REGS[0])

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        if name == '___divsi3':
            a, b = [struct.unpack('<i', struct.pack('<I', u.reg_read(r)))[0] for r in REGS[:2]]
            u.reg_write(REGS[0], int(a / b) & 0xffffffff)
            self.ret(u)
        elif name == '_objc_msgSend':
            self.ret(u)
        else:
            super().import_hook(u, address, *args)

    def get_at(self, at, offset=0, fmt='f'):
        return struct.unpack('<' + fmt, self.u.mem_read(at + offset, struct.calcsize(fmt)))[0]

    def button_state(self, at):
        return {'active': bool(self.get_at(at, 4, 'B')), 'disabled': bool(self.get_at(at, 7, 'B')),
                'pressed': bool(self.get_at(at, 6, 'B')), 'text': self.string(at + 0x3c),
                'rect': list(struct.unpack('<4h', self.u.mem_read(at + 0x20, 8))),
                'callback': hex(self.get_at(at, 0x80, 'I'))}

    def state(self):
        out = {'buttons': [self.button_state(BUTTONS + i * 132) for i in range(30)
                           if self.get_at(BUTTONS + i * 132, 4, 'B')],
               'dialogs': [{'index': i, 'x': self.get_at(DIALOGS + i * 0x674, 4, 'I'),
                            'buttons': [self.button_state(DIALOGS + i * 0x674 + off) for off in (0x4c4, 0x548, 0x5cc)]}
                           for i in range(10) if self.get_at(DIALOGS + i * 0x674, 0, 'B')],
               'balance': list(struct.unpack('<2I', self.u.mem_read(PLAYER + 0x80, 8)))}
        if self.mode == 'map':
            out.update(camera=[self.get_at(MENU, o) for o in (0x28, 0x2c)],
                       contact=[self.get_at(MENU, o) for o in (0x20, 0x24)],
                       selected=self.get_at(PLAYER, 0x234, 'I'), panel=self.get_at(MENU, 0x40),
                       panel_open=bool(self.get_at(MENU, 0x44, 'B')),
                       markers=[bool(self.get_at(LEVELS + i * 244, 0xd6, 'B')) for i in range(12)])
        elif self.mode == 'shop':
            out.update(offset=self.get_at(MENU, 0x20), contact=self.get_at(MENU, 0x24, 'i'),
                       dragging=bool(self.get_at(MENU, 0x28, 'B')), displacement=self.get_at(MENU, 0x2c, 'i'),
                       velocity=self.get_at(MENU, 0x30), width=self.shop_width,
                       medium_center=self.get_at(ITEMS + 101 * 0x164, 0x14c, 'i'))
        elif self.mode == 'scores':
            out.update(offset=[self.get_at(MENU, o) for o in (0x24, 0x20)],
                       contact=[self.get_at(MENU, o) for o in (0x30, 0x34)],
                       velocity=self.get_at(MENU, 0x28), dragging=bool(self.get_at(MENU, 0x2c, 'B')))
        else:
            out.update(difficulty=self.get_at(PLAYER, 0x70, 'I'), reverse=bool(self.get_at(PLAYER, 0x238, 'B')),
                       muted=bool(self.get_at(META['symbols']['_g_muteMusic'], 0, 'B')),
                       volume=self.get_at(META['symbols']['_g_musicVolume']))
        return out

    def draw_frame(self, dt=1 / 60):
        self.trace = []
        self.call(HANDLERS[self.mode]['draw'], [MENU, f32(dt)])

    def event(self, kind, x, y, draw=False):
        self.trace = []
        self.actions = []
        self.created = []
        self.u.mem_write(POINT, struct.pack('<2i', x, y))
        self.call(HANDLERS[self.mode][kind], [MENU, POINT, 0])
        row = {'kind': kind, 'point': [x, y], 'after_input': self.state(),
               'actions': self.actions[:], 'created': self.created[:],
               'sounds': [d for d in self.trace if d['op'] == 'sound']}
        if draw:
            self.draw_frame()
            row['after_draw'] = self.state()
        return row


def capture(mode, name, events, *, center_medium=False, center_target=240, dialog=None, draw=False, allow=()):
    p = CompoundProbe(mode)
    p.allowed.update(allow)
    if center_medium:
        p.u.mem_write(MENU + 0x20, struct.pack('<f', center_target - p.state()['medium_center']))
        p.draw_frame(0)
    if dialog is not None:
        p.call(0x34f2c, [dialog, 0])
    initial = p.state()
    rows = [p.event(*event, draw=draw) for event in events]
    return {'mode': mode, 'case': name, 'draw_after_event': draw,
            'controls': p.controls, 'initial': initial, 'events': rows}


def verify(cases):
    """Assert native outcomes separately from fixture capture, before writing evidence."""
    by_name = {(c['mode'], c['case']): c for c in cases}
    checks = 0

    def equal(actual, expected):
        nonlocal checks
        assert actual == expected, (actual, expected)
        checks += 1

    def rows(mode, name):
        return by_name[mode, name]['events']

    def state(mode, name, index=-1, draw=False):
        return rows(mode, name)[index]['after_draw' if draw else 'after_input']

    def pressed(s, modal=False):
        buttons = [b for d in s['dialogs'] for b in d['buttons']] if modal else s['buttons']
        return [b['text'] for b in buttons if b['pressed']]

    expected_actions = {
        ('map', 'background_to_menu'): ['0x1d958'],
        ('map', 'background_to_play'): ['0x1d96c'],
        ('map', 'marker_to_play'): ['0x1d96c'],
        ('map', 'background_release_without_move'): ['0x1d958'],
        ('shop', 'strip_to_exit'): ['0x321f8'],
        ('shop', 'long_strip_to_exit'): ['0x321f8'],
        ('scores', 'strip_to_done'): ['0x1d7d0'],
        ('scores', 'done_to_global'): ['0x1eac4'],
        ('options', 'difficulty_to_done'): ['0x20238'],
        ('options', 'checkbox_to_done'): ['0x20238'],
        ('options', 'slider_to_done'): ['0x20238'],
        ('shop', 'opening_release_then_fresh_yes'): ['0x358d0'],
        ('shop', 'opening_release_then_bare_yes_release'): ['0x358d0'],
        ('shop', 'dialog_no_to_yes'): ['0x358d0'],
        ('map', 'info_opens_one_dialog'): ['0x1eaac'],
        ('options', 'cheat_opens_one_dialog'): ['0x1eadc'],
        ('options', 'cheat_reset_overlap'): ['0x1eadc'],
        ('map', 'play_info_overlap'): ['0x1d96c'],
    }
    for c in cases:
        equal([a for e in c['events'] for a in e['actions']],
              expected_actions.get((c['mode'], c['case']), []))
        for e in c['events']:
            if e['kind'] != 'up':
                equal(e['actions'], [])
            if e['actions']:
                equal([s['event'] for s in e['sounds']].count(8), len(e['actions']))
            # Confirmation callbacks are intercepted: this invariant proves only no
            # premature charge before confirmation, not callback purchase semantics.
            equal(e['after_input']['balance'], c['initial']['balance'])
            if e['kind'] == 'up':
                equal(pressed(e['after_input']),
                      {'cheat_reset_overlap': ['Reset'], 'play_info_overlap': ['']}.get(c['case'], []))
                equal(pressed(e['after_input'], modal=True), [])

    for mode, name, label in [('map', 'background_to_menu', 'Menu'),
                              ('map', 'background_to_play', 'Play'),
                              ('shop', 'strip_to_exit', 'EXIT'),
                              ('scores', 'strip_to_done', 'Done'),
                              ('scores', 'done_to_global', 'Global'),
                              ('options', 'difficulty_to_done', 'Done')]:
        equal(pressed(state(mode, name, 1)), [label])
    for mode, name in [('map', 'menu_to_background'), ('shop', 'exit_to_strip'),
                       ('scores', 'done_to_strip'), ('options', 'done_to_slider')]:
        equal(len(pressed(state(mode, name, 0))), 1)
        equal(pressed(state(mode, name, 1)), [])

    equal(state('map', 'camera_clamps', 1)['camera'], [-420, 0])
    equal(state('map', 'camera_clamps', 2)['camera'], [-540, -430])
    equal(state('map', 'camera_clamps', 2)['contact'], [-1000, -1000])
    equal(state('map', 'menu_to_background', 1)['camera'], [-420, -290])
    equal(state('map', 'background_to_menu', 0)['panel_open'], False)
    equal(state('map', 'marker_to_play', 0)['selected'], 2)
    equal(state('map', 'marker_to_play', 0)['panel_open'], True)

    for displacement in [-20, -19, 0, 19, 20]:
        event = rows('shop', f'displacement_{displacement}')[-1]
        equal(event['after_input']['displacement'], displacement)
        equal(event['created'], [{'kind': 0, 'text': 'Medium Fireball'}] if abs(displacement) < 20 else [])
    equal([e['after_input']['displacement'] for e in rows('shop', 'backtracking')], [0, 100, 0, 0])
    equal(rows('shop', 'backtracking')[-1]['created'], [{'kind': 0, 'text': 'Medium Fireball'}])
    equal(rows('shop', 'exit_to_item_same_x')[-1]['created'], [{'kind': 0, 'text': 'Medium Fireball'}])
    equal(state('shop', 'long_strip_to_exit')['displacement'], -300)
    equal(state('shop', 'outside_coordinates', 1)['offset'], 543)
    equal(state('shop', 'outside_coordinates', 1, draw=True)['offset'], 15)
    equal(state('shop', 'outside_coordinates', 2)['offset'], -4985)
    equal(state('shop', 'outside_coordinates', 2, draw=True)['offset'], -1922)
    equal(state('shop', 'outside_coordinates', 2, draw=True)['medium_center'], -3528)
    equal(state('shop', 'outside_coordinates', 2)['contact'], -3000)

    equal(state('scores', 'done_to_strip', 1)['offset'], [0, -140])
    equal(state('scores', 'done_to_strip', 1)['velocity'], 2800)
    equal(state('scores', 'done_to_strip', draw=True)['velocity'], 2520)
    equal(state('scores', 'done_to_strip', draw=True)['offset'], [0, -186.6666717529297])
    equal(state('scores', 'outside_coordinates', 1)['offset'], [-340, -660])
    equal(state('scores', 'outside_coordinates', 2)['offset'], [0, 0])

    equal(state('options', 'difficulty_to_done', 0)['difficulty'], 2)
    equal([e['after_input']['reverse'] for e in rows('options', 'checkbox_leave')], [True] * 3)
    equal([e['after_input']['reverse'] for e in rows('options', 'enter_checkbox_without_down')], [False] * 3)
    equal(state('options', 'mute_to_slider', 0)['muted'], True)
    equal([e['after_input']['volume'] for e in rows('options', 'slider_outside_bounds')],
          [.5] + [0.9655172228813171] * 4)
    equal(state('options', 'done_to_slider', 1)['volume'], 0.24137930572032928)
    equal([e['after_input']['reverse'] for e in rows('options', 'dialog_blocks_underlying')], [False] * 3)
    equal(state('map', 'dialog_blocks_underlying')['camera'], [-420, -180])
    equal(state('map', 'dialog_blocks_underlying')['contact'], [0, 0])
    equal(state('shop', 'dialog_shop_movement', 1)['offset'], -1317)
    equal(state('shop', 'dialog_shop_movement')['dragging'], True)
    equal(pressed(state('shop', 'dialog_no_to_yes', 0), modal=True), ['NO'])
    equal(pressed(state('shop', 'dialog_no_to_yes', 1), modal=True), ['YES'])
    for name in ['opening_release_then_fresh_yes', 'opening_release_then_bare_yes_release']:
        opening = rows('shop', name)[1]
        equal(opening['actions'], [])
        equal(opening['created'], [{'kind': 0, 'text': 'Medium Fireball'}])
        equal([s['event'] for s in opening['sounds']], [9])
        yes = next(b for b in opening['after_input']['dialogs'][0]['buttons'] if b['text'] == 'YES')
        top, left, bottom, right = yes['rect']
        x, y = opening['point']
        equal(left <= x < right and top <= y < bottom, True)
    for mode, name, kind in [('map', 'info_opens_one_dialog', 1), ('options', 'cheat_opens_one_dialog', 6)]:
        equal(rows(mode, name)[-1]['created'], [{'kind': kind, 'text': None}])
        equal(len(state(mode, name)['dialogs']), 1)
    equal(pressed(state('options', 'cheat_reset_overlap', 0)), ['Cheat', 'Reset'])
    equal(rows('options', 'cheat_reset_overlap')[-1]['created'], [{'kind': 6, 'text': None}])
    equal(pressed(state('map', 'play_info_overlap', 0)), ['Play', ''])
    equal(rows('map', 'play_info_overlap')[-1]['created'], [])
    return checks


def main():
    cases = []
    sequences = {
        'map': [
            ('background_to_menu', [('down', 100, 180), ('move', 60, 290), ('up', 60, 290)]),
            ('background_to_play', [('down', 100, 180), ('move', 440, 290), ('up', 440, 290)]),
            ('marker_to_play', [('down', 440, 180), ('move', 440, 290), ('up', 440, 290)]),
            ('menu_to_background', [('down', 60, 290), ('move', 100, 180), ('up', 100, 180)]),
            ('camera_clamps', [('down', 200, 100), ('move', 1000, 1000), ('move', -1000, -1000), ('up', -1000, -1000)]),
            ('background_release_without_move', [('down', 100, 180), ('up', 60, 290)]),
        ],
        'shop': [
            ('strip_to_exit', [('down', 400, 180), ('move', 400, 285), ('up', 400, 285)]),
            ('exit_to_strip', [('down', 400, 285), ('move', 240, 180), ('up', 240, 180)]),
            ('bottom_blank_to_strip', [('down', 240, 285), ('move', 240, 180), ('up', 240, 180)]),
            ('long_strip_to_exit', [('down', 100, 180), ('move', 400, 285), ('up', 400, 285)]),
            ('backtracking', [('down', 240, 180), ('move', 140, 180), ('move', 240, 180), ('up', 240, 180)]),
            ('outside_coordinates', [('down', 240, 180), ('move', 2000, 180), ('move', -3000, 180), ('up', -3000, 180)]),
        ],
        'scores': [
            ('strip_to_done', [('down', 100, 150), ('move', 100, 290), ('up', 100, 290)]),
            ('done_to_strip', [('down', 100, 290), ('move', 100, 150), ('up', 100, 150)]),
            ('done_to_global', [('down', 100, 290), ('move', 350, 290), ('up', 350, 290)]),
            ('outside_coordinates', [('down', 240, 160), ('move', -100, -500), ('move', 600, 600), ('up', 600, 600)]),
        ],
        'options': [
            ('difficulty_to_done', [('down', 400, 50), ('move', 80, 290), ('up', 80, 290)]),
            ('checkbox_to_done', [('down', 50, 130), ('move', 80, 290), ('up', 80, 290)]),
            ('checkbox_leave', [('down', 50, 130), ('move', 200, 130), ('up', 200, 130)]),
            ('mute_to_slider', [('down', 50, 180), ('move', 350, 230), ('up', 350, 230)]),
            ('slider_to_done', [('down', 210, 230), ('move', 350, 230), ('move', 80, 290), ('up', 80, 290)]),
            ('done_to_slider', [('down', 80, 290), ('move', 140, 230), ('up', 140, 230)]),
            ('enter_checkbox_without_down', [('down', 200, 130), ('move', 50, 130), ('up', 50, 130)]),
            ('slider_outside_bounds', [('down', 210, 230), ('move', 350, 230), ('move', 600, 230), ('move', -100, 230), ('up', -100, 230)]),
        ],
    }
    for mode, rows in sequences.items():
        for name, events in rows:
            cases.append(capture(mode, name, events, center_medium=mode == 'shop', draw=True))
    for displacement in [-20, -19, 0, 19, 20]:
        cases.append(capture('shop', f'displacement_{displacement}',
                             [('down', 240, 180), ('move', 240 - displacement, 180),
                              ('up', 240 - displacement, 180)], center_medium=True, draw=True))
    for mode, point in [('map', (60, 290)), ('shop', (400, 285)), ('options', (50, 130))]:
        cases.append(capture(mode, 'dialog_blocks_underlying',
                             [('down', *point), ('move', *point), ('up', *point)], dialog=2, draw=True))
    cases.append(capture('shop', 'exit_to_item_same_x',
                         [('down', 400, 285), ('move', 400, 180), ('up', 400, 180)],
                         center_medium=True, center_target=400, draw=True))
    cases.append(capture('shop', 'opening_release_then_fresh_yes',
                         [('down', 300, 180), ('up', 300, 180),
                          ('down', 300, 185), ('up', 300, 185)],
                         center_medium=True, center_target=300, draw=True))
    cases.append(capture('shop', 'opening_release_then_bare_yes_release',
                         [('down', 300, 180), ('up', 300, 180), ('up', 300, 180)],
                         center_medium=True, center_target=300, draw=True))
    cases.append(capture('shop', 'dialog_shop_movement',
                         [('down', 240, 100), ('move', 140, 100), ('up', 140, 100)],
                         center_medium=True, dialog=2, draw=True))
    cases.append(capture('shop', 'dialog_no_to_yes',
                         [('down', 180, 185), ('move', 300, 185), ('up', 300, 185)],
                         center_medium=True, dialog=0, draw=True))
    cases.append(capture('map', 'info_opens_one_dialog', [('down', 350, 290), ('up', 350, 290)],
                         allow=[0x1eaac], draw=True))
    cases.append(capture('options', 'cheat_opens_one_dialog', [('down', 280, 290), ('up', 280, 290)],
                         allow=[0x1eadc], draw=True))
    cases.append(capture('options', 'cheat_reset_overlap', [('down', 350, 290), ('up', 350, 290)],
                         allow=[0x1eadc, 0x1eaf4], draw=True))
    cases.append(capture('map', 'play_info_overlap', [('down', 382, 290), ('up', 382, 290)],
                         allow=[0x1eaac], draw=True))
    checks = verify(cases)
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'checks_passed': checks, 'cases': cases,
              'scope': 'Original mode initialization, button allocation/handling, compound input, scroll/camera '
                       'and option state updates, and one original Draw per event. Active selected map panel '
                       'and centered shop item supplied as starting state; shop initial autoscroll stopped. '
                       'All navigation and destructive confirmation callbacks intercepted at ButtonPress call '
                       'site, except harmless hint/cheat-dialog creation. Dialog creation/input remain native. '
                       'Graphics, audio playback and OS services intercepted. No external actions.'}
    (ROOT / 'research/compound-menu-input.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'cases': len(cases), 'events': sum(len(c['events']) for c in cases),
                      'checks_passed': checks}))


if __name__ == '__main__':
    main()
