"""Original main menu initialization, drawing and input; read-only ARM research."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_SP

from extract_enemies import IMAGE, META, Probe, REGS, ROOT, SELF, f32
from probe_menu_motion import MenuMotionProbe

MENU = SELF + 0x71000
POINT = SELF + 0x72000
BUTTONS = 0x10cac0
PLAYER = META['symbols']['_Player']


class MainMenuProbe(MenuMotionProbe):
    def __init__(self):
        self.controls = []
        self.invocations = []
        self.intercept_callbacks = True
        super().__init__()
        for at in (0x33df0, 0x34834, 0x33f84):
            self.u.hook_add(UC_HOOK_CODE, self.no_dialog, begin=at, end=at)
        self.u.hook_add(UC_HOOK_CODE, self.fill, begin=0x7f28, end=0x7f28)
        self.call(0x19b60, [PLAYER])
        self.call(0x21f50, [MENU])
        for control in self.controls:
            at = int(control['callback'], 16)
            self.u.hook_add(UC_HOOK_CODE, self.callback, begin=at, end=at)

    def no_dialog(self, u, *args):
        u.reg_write(REGS[0], 0)
        self.ret(u)

    def callback(self, u, address, *args):
        self.invocations.append(hex(address))
        if self.intercept_callbacks:
            self.ret(u)

    def fill(self, u, *args):
        a = [u.reg_read(r) for r in REGS]
        h, r, g, b = struct.unpack('<4I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 16))
        self.trace.append({'op': 'fill', 'rect': [a[2], a[1], a[2] + h, a[1] + a[3]],
                           'rgba': [r, g, b, self.alpha]})
        self.ret(u)

    def shop_hook(self, u, address, *args):
        if address == 0x1cb44:
            return  # Original ClearButtons; preserve actual pool allocation and input.
        if address == 0x1d5f4:
            stack = struct.unpack('<5I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 20))
            self.controls.append({'rect': [u.reg_read(r) for r in REGS], 'type': stack[0],
                                  'text': self.string(stack[1]), 'normal': self.surfaces.get(stack[2]),
                                  'pressed': self.surfaces.get(stack[3]), 'callback': hex(stack[4])})
            return
        super().shop_hook(u, address, *args)

    def state(self):
        return {'fade': struct.unpack('<f', self.u.mem_read(MENU + 0x24, 4))[0],
                'main_buttons_active': self.u.mem_read(BUTTONS + 0x214, 1)[0],
                'buttons': [{'pressed': bool(self.u.mem_read(BUTTONS + i * 132 + 6, 1)[0]),
                             'scale': struct.unpack('<f', self.u.mem_read(BUTTONS + i * 132 + 0x28, 4))[0],
                             'hit': list(struct.unpack('<4h', self.u.mem_read(BUTTONS + i * 132 + 0x20, 8)))}
                            for i in range(6)]}

    def draw(self, dt=1 / 60):
        self.trace = []
        self.call(0x21aec, [MENU, f32(dt)])
        return {'state': self.state(), 'draws': self.trace[:]}

    def input(self, kind, x, y):
        self.trace = []
        self.invocations = []
        self.u.mem_write(POINT, struct.pack('<2i', x, y))
        self.call({'down': 0x1ddf0, 'move': 0x1ddc4, 'up': 0x1de1c}[kind], [MENU, POINT, 0])
        return {'kind': kind, 'point': [x, y], 'callbacks': self.invocations[:],
                'sounds': [t for t in self.trace if t['op'] == 'sound'], 'state': self.state()}


class MailProbe(Probe):
    """Capture system composer/URL requests; never invoke an actual OS application."""
    def __init__(self, available, can_send):
        super().__init__()
        self.available, self.can_send = available, can_send
        self.events = []
        self.objects = {}
        self.heap = SELF + 0x74000
        app_pointer = self.word(0xc7550)
        self.u.mem_write(app_pointer, struct.pack('<I', SELF + 0x78000))

    def word(self, ptr):
        return struct.unpack('<I', self.u.mem_read(ptr, 4))[0]

    def string(self, ptr):
        return bytes(self.u.mem_read(ptr, 1024)).split(b'\0')[0].decode()

    def cfstring(self, ptr):
        return self.objects[ptr] if ptr in self.objects else self.string(self.word(ptr + 8))

    def object(self, text):
        self.heap += 16
        self.objects[self.heap] = text
        return self.heap

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        if name == '_NSClassFromString':
            self.events.append({'class_lookup': self.cfstring(u.reg_read(REGS[0]))})
            u.reg_write(REGS[0], SELF + 0x79000 if self.available else 0)
        elif name == '_objc_msgSend':
            receiver, selector, arg, arg2 = [u.reg_read(r) for r in REGS]
            method = self.string(selector)
            event = {'method': method, 'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)}
            self.events.append(event)
            dispatch = {'invokeMailSending': 0x512c, 'launchMailAppOnDevice': 0x47d0,
                        'displayComposerSheetInView:': 0x48d8}
            if method in dispatch:
                u.reg_write(UC_ARM_REG_PC, dispatch[method])
                return
            answer = receiver
            if method == 'canSendMail':
                answer = self.can_send
            elif method in ('setSubject:', 'setMessageBody:isHTML:'):
                event['value'] = self.cfstring(arg)
                if method == 'setMessageBody:isHTML:':
                    event['html'] = bool(arg2)
            elif method == 'stringWithFormat:':
                fmt = self.cfstring(arg)
                values = [self.cfstring(arg2), self.cfstring(self.word(u.reg_read(UC_ARM_REG_SP)))]
                event['format'], event['values'] = fmt, values
                answer = self.object(fmt.replace('%@', '{}').format(*values))
            elif method == 'stringByAddingPercentEscapesUsingEncoding:':
                event['input'], event['encoding'] = self.cfstring(receiver), arg
                answer = receiver  # Capture pre-encoding URL; Foundation escaping is not emulated.
            elif method in ('URLWithString:', 'openURL:'):
                event['value'] = self.cfstring(arg)
                answer = arg
            elif method in ('alloc', 'sharedApplication'):
                answer = self.object(method)
            elif method in ('presentModalViewController:animated:', 'setHidden:'):
                event['animated' if method.startswith('present') else 'hidden'] = bool(arg2 if method.startswith('present') else arg)
            elif method not in ('init', 'setMailComposeDelegate:', 'release', 'addSubview:', 'view', 'removeFromSuperview'):
                raise RuntimeError(f'Unexpected mail selector {method}')
            u.reg_write(REGS[0], answer)
        else:
            raise RuntimeError(f'Unexpected mail import {name}')
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))


def main():
    p = MainMenuProbe()
    controls = p.controls[:]
    initial = p.state()
    entrance = [{'frame': i, **p.draw()} for i in range(1, 26)]
    pressed = []
    for i, control in enumerate(controls):
        x, y, w, h = control['rect']
        down = p.input('down', x + w // 2, y + h // 2)
        drawing = p.draw()
        up = p.input('up', x + w // 2, y + h // 2)
        pressed.append({'index': i, 'down': down, 'drawing': drawing, 'up': up})
        assert down['callbacks'] == [] and down['sounds'] == []
        assert up['callbacks'] == [control['callback']]
        assert [s['event'] for s in up['sounds']] == [8]
        assert all(not button['pressed'] for button in up['state']['buttons'])
        visible = [d for d in drawing['draws'] if d.get('image') == control['pressed']]
        assert len(visible) == 1
    boundaries = []
    for i, control in enumerate(controls):
        x, y, w, h = control['rect']
        for dx, dy in [(0, 0), (w - 1, h - 1), (-1, h // 2), (w, h // 2),
                       (w // 2, -1), (w // 2, h)]:
            row = p.input('up', x + dx, y + dy)
            expected = [control['callback']] if 0 <= dx < w and 0 <= dy < h else []
            assert row['callbacks'] == expected
            boundaries.append({'index': i, **row})
    gestures = []
    for name, steps in [
        ('leave_cancel', [('down', 380, 41), ('move', 100, 100), ('up', 100, 100)]),
        ('enter_release', [('down', 100, 100), ('move', 380, 41), ('up', 380, 41)]),
        ('switch_release', [('down', 380, 41), ('move', 385, 101), ('up', 385, 101)]),
        ('release_elsewhere', [('down', 380, 41), ('up', 385, 101)]),
        ('release_without_down', [('up', 380, 41)]),
    ]:
        p.input('move', 100, 100)
        gestures.append({'case': name, 'steps': [p.input(*step) for step in steps]})
    assert gestures[0]['steps'][-1]['callbacks'] == []
    assert gestures[1]['steps'][-1]['callbacks'] == ['0x20324']
    assert gestures[2]['steps'][-1]['callbacks'] == ['0x1d80c']
    assert gestures[3]['steps'][-1]['callbacks'] == ['0x1d80c']
    assert gestures[4]['steps'][-1]['callbacks'] == ['0x20324']
    assert all(row['state']['fade'] == 0 for row in entrance)
    assert entrance[19]['state']['buttons'][0]['scale'] == 1
    assert all(b['scale'] == 1 for row in entrance for b in row['state']['buttons'][1:])
    p.u.mem_write(MENU + 0x24, struct.pack('<f', 210))
    p.controls = []
    p.call(0x21f50, [MENU])
    reentry = {'state': p.state(), 'draw': p.draw()}
    assert reentry['state']['fade'] == 0 and reentry['state']['buttons'][0]['scale'] == 0
    # Actual Play/Back callback and SwitchMode lifecycle, with only mode objects supplied.
    p.intercept_callbacks = False
    p.u.mem_write(MENU, struct.pack('<I', META['symbols']['__ZTV8mainMenu'] + 8))
    p.u.mem_write(META['symbols']['_GameModes'], struct.pack('<I', MENU))
    p.u.mem_write(META['symbols']['_g_currentMode'], bytes(4))
    p.input('down', 380, 41)
    select_play = p.input('up', 380, 41)
    for _ in range(20):
        p.draw()
    faded_play = p.state()
    p.call(0x1d7d0, [])
    back_to_main = {'state': p.state(), 'draw': p.draw()}
    assert faded_play['fade'] == 210 and not faded_play['main_buttons_active']
    assert back_to_main['state']['fade'] == 0 and back_to_main['state']['main_buttons_active']
    mail = []
    for available, can_send in [(True, True), (True, False), (False, False)]:
        q = MailProbe(available, can_send)
        q.call(0x20690, [])
        mail.append({'class_available': available, 'can_send_mail': can_send, 'events': q.events})
    assert next(e for e in mail[0]['events'] if e.get('method') == 'setSubject:')['value'] == 'Knights Onrush'
    assert next(e for e in mail[0]['events'] if e.get('method') == 'setMessageBody:isHTML:')['value'] == (
        '\nKnights Onrush:\nhttp://itunes.apple.com/WebObjects/MZStore.woa/wa/viewSoftware?id=297805402&mt=8\n')
    assert all(any(e.get('method') == 'openURL:' for e in case['events']) for case in mail[1:])
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'controls': controls,
              'initial': initial, 'entrance': entrance, 'pressed': pressed,
              'boundaries': boundaries, 'gestures': gestures, 'reentry': reentry,
              'play_back_transition': {'select': select_play, 'faded_play': faded_play, 'main': back_to_main},
              'tell_friend': mail,
              'scope': 'Original mainMenu initializer/Draw/Stylus and button allocation/draw/input. '
                       'OS graphics/audio intercepted; callbacks captured without navigation except actual Play '
                       'and Back-to-main through SwitchMode; dialogs intercepted. Null-surface draw calls are '
                       'recorded as 0x0; original Display routine no-ops for null surfaces. '
                       'Mail invokes actual native dispatch/composer/fallback methods but intercepts every '
                       'Objective-C framework call. Foundation percent escaping is not emulated; captured '
                       'URL text is pre-encoding. No real composer, browser or email transmission occurs.'}
    (ROOT / 'research/main-menu.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'controls': controls, 'entrance_frames': len(entrance),
                      'pressed_buttons': len(pressed), 'boundary_checks': len(boundaries),
                      'gestures': len(gestures), 'reentry_fade': reentry['state']['fade'],
                      'play_back_fade': back_to_main['state']['fade']}, indent=2))


if __name__ == '__main__':
    main()
