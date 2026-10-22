"""Bounded original top-level touch and UIKit bridge execution, no OS calls."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC
from extract_enemies import IMAGE, META, Probe, REGS, ROOT, SELF, f32
from probe_weapons import WeaponProbe, ART, DRAG, CREEP

POINT = SELF + 0x90000
BUTTONS = META['symbols']['_Buttons']
PLAYER = META['symbols']['_Player']
HANDLERS = {'down': 0x6914, 'move': 0x69c8, 'up': 0x6840}
LEAVES = {0x1cedc: 'buttons', 0x26674: 'creep_down', 0x29338: 'object_down',
          0x2e1cc: 'device_down', 0x26250: 'creep_move', 0x2d4b4: 'device_move',
          0x29640: 'object_move', 0x264ac: 'creep_up', 0x2dd64: 'device_up',
          0x298f8: 'object_up'}


def integer(v):
    return struct.unpack('<i', struct.pack('<I', v))[0]


def word(p, at):
    return struct.unpack('<I', p.u.mem_read(at, 4))[0]


def scale(p, sx=1, sy=1, mirror=False, world_mirror=False):
    p.u.mem_write(word(p, 0xc7398), struct.pack('<f', sx))
    p.u.mem_write(word(p, 0xc73a4), struct.pack('<f', sy))
    p.u.mem_write(word(p, 0xc73d4), bytes([mirror]))
    p.u.mem_write(PLAYER + 0x12c, bytes([world_mirror]))


def input_event(p, kind, points):
    p.u.mem_write(POINT, b''.join(struct.pack('<2i', *xy) for xy in points))
    p.call(HANDLERS[kind], [POINT, len(points)])
    return list(struct.unpack('<' + 'i' * len(points) * 2, p.u.mem_read(POINT, len(points) * 8)))


class DispatchProbe(Probe):
    def __init__(self, real_buttons=False):
        self.trace = []
        self.accept = None
        self.real_buttons = real_buttons
        super().__init__()
        self.u.mem_map(0, 4096)
        self.call(0x19b60, [PLAYER])
        scale(self)
        for at in LEAVES:
            self.u.hook_add(UC_HOOK_CODE, self.leaf, begin=at, end=at)

    def effect_hook(self, u, address, *args):
        if address == 0x2d4b4:
            return  # The dispatcher hook below captures this original call.
        if address == 0x37ba8:
            self.trace.append({'call': 'sound', 'args': [u.reg_read(r) for r in REGS[:2]]})
        super().effect_hook(u, address, *args)

    def leaf(self, u, address, *args):
        name = LEAVES[address]
        count = 3 if name == 'buttons' or name.startswith('device_') and name != 'device_down' else 2
        self.trace.append({'call': name, 'args': [integer(u.reg_read(r)) for r in REGS[:count]]})
        if self.real_buttons and name == 'buttons':
            return
        u.reg_write(REGS[0], int(name == self.accept))
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def setup_pause(self):
        self.call(0x1cb44, [])
        self.u.mem_write(POINT, b'\0')
        self.call(0x1d534, [BUTTONS, 446, 291, 34], [29, 0, POINT, 0, 0])
        self.u.mem_write(BUTTONS + 0x80, struct.pack('<I', 0x1c934))
        self.u.mem_write(META['symbols']['_g_paused'], b'\0')


class BridgeProbe(DispatchProbe):
    def __init__(self):
        self.coords = []
        self.messages = []
        self.delivered = []
        super().__init__()
        normal = SELF + 0x80000
        self.u.mem_write(normal, struct.pack('<I', META['symbols']['__ZTV10normalGame'] + 8))
        self.u.mem_write(META['symbols']['_GameModes'] + 4, struct.pack('<I', normal))
        self.u.mem_write(META['symbols']['_g_currentMode'], struct.pack('<I', 1))
        for at in (0x20710, 0x206e0, 0x206f8):
            self.u.hook_add(UC_HOOK_CODE, self.virtual_input, begin=at, end=at)

    def string(self, ptr):
        return bytes(self.u.mem_read(ptr, 200)).split(b'\0')[0].decode()

    def virtual_input(self, u, address, *args):
        count = u.reg_read(REGS[2])
        raw = struct.unpack('<' + 'i' * count * 2, u.mem_read(u.reg_read(REGS[1]), count * 8))
        self.delivered.append({'method': hex(address), 'count': count,
                               'points': [list(raw[i:i + 2]) for i in range(0, len(raw), 2)]})

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        a = [u.reg_read(r) for r in REGS]
        if name == '_objc_msgSend':
            method = self.string(a[1])
            self.messages.append(method)
            if method == 'anyObject':
                u.reg_write(REGS[0], SELF + 0x82000)
            elif method == 'view':
                u.reg_write(REGS[0], SELF + 0x81000)
            elif method == 'countByEnumeratingWithState:objects:count:':
                if word(self, a[2]):
                    u.reg_write(REGS[0], 0)
                else:
                    ptr = SELF + 0x83000
                    u.mem_write(ptr, bytes(4))
                    u.mem_write(a[2], struct.pack('<3I', 1, a[3], ptr))
                    u.mem_write(a[3], struct.pack('<' + 'I' * len(self.coords),
                                                *[SELF + 0x82000 + i * 16 for i in range(len(self.coords))]))
                    u.reg_write(REGS[0], len(self.coords))
            else:
                raise RuntimeError(method)
        elif name == '_objc_msgSend_stret':
            method = self.string(a[2])
            assert method == 'locationInView:', method
            self.messages.append(method)
            i = (a[1] - (SELF + 0x82000)) // 16
            u.mem_write(a[0], struct.pack('<2f', *self.coords[i]))
        else:
            return super().import_hook(u, address, *args)
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))


class LiveDispatchProbe(WeaponProbe):
    def __init__(self):
        super().__init__()
        self.u.mem_write(0xc7548, struct.pack('<I', ART))
        self.u.mem_write(ART, bytes(25 * 152))
        self.u.mem_write(DRAG, bytes(30 * 116))
        self.u.mem_write(CREEP, bytes(200 * 256))
        self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ignore(u, *args), begin=0x1cedc, end=0x1cedc)
        scale(self)

    def effect_hook(self, u, address, *args):
        if address == 0x2d4b4:
            return
        super().effect_hook(u, address, *args)

    def snapshot(self):
        return {'device_pressed': self.read(ART, 0x34, 'B'),
                'device_elapsed': self.read(ART, 0x28),
                'objects': [{'slot': i, 'kind': self.read(DRAG + i * 116, 8, 'i'),
                             'held': self.read(DRAG + i * 116, 3, 'B'),
                             'pressed': self.read(DRAG + i * 116, 0x48, 'B'),
                             'skip_global_input': self.read(DRAG + i * 116, 0x64, 'B'),
                             'travel_charge': self.read(DRAG + i * 116, 0x60),
                             'target': [self.read(DRAG + i * 116, off) for off in (0x30, 0x34)]}
                            for i in range(30) if self.read(DRAG + i * 116, 0, 'B')],
                'creep': {key: self.read(CREEP, off, fmt) for key, off, fmt in [
                    ('held', 0x98, 'B'), ('flying', 0xa9, 'B'), ('vx', 0x1c, 'f'),
                    ('vy', 0x20, 'f'), ('target_x', 0xa0, 'i'), ('target_y', 0xa4, 'i')]},
                'creep_pointer': [integer(word(self, at)) for at in (0x113910, 0x113914)],
                'sounds': [e['args'][:2] for e in self.effects if e['address'] == '0x37ba8']}


def routing():
    rows = []
    for kind in HANDLERS:
        for accepted in ([None, 'buttons', 'creep_down', 'object_down'] if kind == 'down' else [None]):
            p = DispatchProbe()
            p.accept = accepted
            for sx, sy, mirror, world_mirror in [(1, 1, False, False), (.5, 1.5, True, False), (1, 1, True, True)]:
                scale(p, sx, sy, mirror, world_mirror)
                p.trace = []
                out = input_event(p, kind, [[-101, 501], [250, 150]])
                rows.append({'kind': kind, 'accept': accepted, 'scale': [sx, sy], 'mirror': mirror,
                             'world_mirror': world_mirror, 'points_after': out, 'calls': p.trace[:]})
                assert out[2:] == [250, 150]
                assert p.trace[0]['call'] == 'buttons'
    return rows


def pauses():
    rows = []
    cases = [('inside', [('down', 460, 305), ('up', 460, 305)]),
             ('empty_to_pause', [('down', 200, 200), ('move', 460, 305), ('up', 460, 305)]),
             ('pause_to_empty', [('down', 460, 305), ('move', 200, 200), ('up', 200, 200)]),
             ('left_top', [('down', 446, 291), ('up', 446, 291)]),
             ('right_outside', [('down', 480, 300), ('up', 480, 300)]),
             ('bottom_outside', [('down', 460, 320), ('up', 460, 320)]),
             ('mirrored_physical_right', [('down', 460, 305), ('up', 460, 305)]),
             ('mirrored_physical_left', [('down', 20, 305), ('up', 20, 305)])]
    for name, sequence in cases:
        p = DispatchProbe(real_buttons=True)
        p.setup_pause()
        if name.startswith('mirrored'):
            scale(p, mirror=True, world_mirror=True)
        events = []
        for kind, x, y in sequence:
            p.trace = []
            input_event(p, kind, [[x, y]])
            events.append({'kind': kind, 'point': [x, y], 'calls': p.trace[:],
                           'pressed': p.u.mem_read(BUTTONS + 6, 1)[0],
                           'paused': p.u.mem_read(META['symbols']['_g_paused'], 1)[0]})
        expected = name in ['inside', 'empty_to_pause', 'left_top', 'mirrored_physical_right', 'mirrored_physical_left']
        assert bool(events[-1]['paused']) == expected, (name, events)
        rows.append({'case': name, 'events': events})
    return rows


def bridges():
    rows = []
    for kind, address in [('down', 0x61e4), ('move', 0x5ec0), ('up', 0x6508)]:
        for coords in [[[12.75, 123.875]], [[-1.75, -101.25], [321.75, 600.5]],
                       [[10.25, 50.75], [20.25, 100.75], [30.25, 150.75], [40.25, 200.75]]]:
            p = BridgeProbe()
            p.coords = coords
            p.call(address, [SELF + 0x81000, 0, SELF + 0x84000, 0])
            assert p.delivered[0]['points'] == [[int(y), int(320 - x)] for x, y in coords]
            assert len(p.delivered) == 1
            assert all(c['args'][:2] == p.delivered[0]['points'][0] for c in p.trace)
            rows.append({'kind': kind, 'UIKit_locations': coords, 'delivered': p.delivered,
                         'dispatch_calls': p.trace, 'mocked_messages': p.messages})
    p = BridgeProbe()
    p.coords = [[12.75, 123.875]]
    scale(p, mirror=True, world_mirror=True)
    p.call(0x61e4, [SELF + 0x81000, 0, SELF + 0x84000, 0])
    assert p.delivered[0]['points'] == [[123, 307]]
    assert all(c['args'][:2] == [357, 307] for c in p.trace)
    rows.append({'kind': 'mirrored_fractional_down', 'UIKit_locations': p.coords,
                 'delivered': p.delivered, 'dispatch_calls': p.trace, 'mocked_messages': p.messages})
    return rows


def view_init():
    class ViewProbe(Probe):
        def __init__(self):
            self.messages = []
            super().__init__()
            self.u.mem_map(0, 4096)

        def import_hook(self, u, address, *args):
            name = META['imports'].get(address)
            a = [u.reg_read(r) for r in REGS]
            if name in ['_objc_msgSendSuper', '_objc_msgSendSuper2']:
                u.reg_write(REGS[0], SELF + 0x80000)
            elif name == '_objc_msgSend':
                method = bytes(u.mem_read(a[1], 100)).split(b'\0')[0].decode()
                self.messages.append({'method': method, 'argument': a[2],
                                      'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})
                u.reg_write(REGS[0], 1 if method == '_createSurface' else SELF + 0x81000)
            else:
                return super().import_hook(u, address, *args)
            u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    p = ViewProbe()
    p.call(0x5b08, [SELF + 0x80000, 0, SELF + 0x82000])
    multi = [m for m in p.messages if m['method'] == 'setMultipleTouchEnabled:']
    assert multi == [{'method': 'setMultipleTouchEnabled:', 'argument': 0, 'caller': '0x5c14'}]
    return p.messages


def live_sequences():
    rows = []
    for name, sequence in [
        ('column_down_up_outside', [('down', 438, 51), ('up', 200, 200)]),
        ('column_down_up_inside', [('down', 438, 51), ('up', 438, 51)]),
        ('column_empty_down_return_release', [('down', 438, 51), ('up', 200, 200),
                                             ('down', 200, 200), ('move', 438, 51), ('up', 438, 51)]),
        ('creep_unclipped_move', [('down', 100, 200), ('move', -600, 900), ('up', 700, -900)]),
        ('empty_down_move', [('down', 10, 10), ('move', 100, 200), ('up', 100, 200)]),
        ('boulder_device_move', [('down', 344, 76), ('move', 200, 100), ('move', 210, 110)]),
        ('fireball_device_move', [('down', 447, 163), ('move', 200, 100), ('move', 210, 110)]),
    ]:
        p = LiveDispatchProbe()
        if name.startswith('column'):
            p.art(4, 0, 405, 38)
            p.write(ART, 0x28, 100.)
        elif name in ['boulder_device_move', 'fireball_device_move']:
            p.art(2 if name.startswith('boulder') else 5, 0,
                  315 if name.startswith('boulder') else 408, 63 if name.startswith('boulder') else 150)
            p.write(ART, 0x28, 100.)
        else:
            p.enemy(x=100, y=200)
        events = []
        for kind, x, y in sequence:
            p.effects = []
            input_event(p, kind, [[x, y]])
            events.append({'kind': kind, 'point': [x, y], 'state': p.snapshot()})
        if name == 'column_down_up_outside':
            assert events[-1]['state']['objects'] == []
        if name in ['column_down_up_inside', 'column_empty_down_return_release']:
            assert len(events[-1]['state']['objects']) == 1
        if name == 'creep_unclipped_move':
            assert events[1]['state']['creep']['target_x'] == -600
            assert events[1]['state']['creep']['target_y'] == 900
        if name == 'empty_down_move':
            assert events[-1]['state']['creep']['held'] == 0
        rows.append({'case': name, 'events': events})
    return rows


def sampling_sequences():
    rows = []
    for mass in (.9, 1.8):
        for path, deltas in [('up', [(16, -16)]), ('down', [(8, 8)]),
                             ('horizontal', [(16, 0)]), ('reverse', [(8, -16), (8, 16)])]:
            baseline = None
            for samples in (1, 2, 4, 8):
                p = LiveDispatchProbe()
                p.enemy(x=100, y=200)
                p.write(CREEP, 0xc0, mass)
                input_event(p, 'down', [[100, 200]])
                assert p.snapshot()['creep']['held'] == 1
                point = [100, 200]
                frames = []
                for tick in range(8):
                    moves = []
                    for dx, dy in deltas:
                        for sample in range(1, samples + 1):
                            target = [point[0] + dx * sample // samples,
                                      point[1] + dy * sample // samples]
                            input_event(p, 'move', [target])
                            moves.append(target)
                        point = target
                    p.call(0x283ec, [CREEP, f32(1 / 60)])
                    state = {**p.snapshot()['creep'], 'x': p.read(CREEP, 8),
                             'y': p.read(CREEP, 12)}
                    assert state['held'] == 1, (path, tick, state)
                    frames.append({'moves': moves, 'state': state})
                # Up coordinates do not introduce another Move, even when they differ.
                input_event(p, 'up', [[point[0] + 12, point[1] - 12]])
                released = {**p.snapshot()['creep'], 'x': p.read(CREEP, 8),
                            'y': p.read(CREEP, 12)}
                assert released['held'] == 0 and released['flying'] == 1
                values = [f['state'] for f in frames] + [released]
                if baseline is None:
                    baseline = values
                error = max(abs(a[k] - b[k]) for a, b in zip(values, baseline) for k in a)
                assert error < .001, (mass, path, samples, error)
                rows.append({'mass': mass, 'path': path, 'samples_per_segment': samples,
                             'frames': frames, 'up': [point[0] + 12, point[1] - 12],
                             'released': released, 'subdivision_max_error': error})
    return rows


def recovery_pickups():
    rows = []
    for kind in (0, 3, 10):
        for timer in (-1., .001, .2, 2.):
            p = LiveDispatchProbe()
            p.enemy(kind=kind, x=100, y=240)
            p.write(CREEP, 0x50, 4, 'i')
            p.write(CREEP, 0x88, 0, 'i')
            p.write(CREEP, 0xb8, timer)
            def snapshot():
                return {**p.snapshot()['creep'], 'x': p.read(CREEP, 8), 'y': p.read(CREEP, 12),
                        'pose': p.read(CREEP, 0x50, 'i'), 'frame': p.read(CREEP, 0x4c),
                        'speed': p.read(CREEP, 0x88, 'i'), 'stun': p.read(CREEP, 0xb8),
                        'held_time': p.read(CREEP, 0x9c)}
            initial = snapshot()
            input_event(p, 'down', [[100, 240]])
            picked = snapshot()
            frames = []
            for _ in range(9):
                p.call(0x283ec, [CREEP, f32(1 / 60)])
                frames.append(snapshot())
            rows.append({'kind': kind, 'timer': timer, 'initial': initial,
                         'picked': picked, 'frames': frames})
    return rows


def main():
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'routing': routing(), 'pause': pauses(), 'UIKit_bridge': bridges(),
              'view_init': view_init(),
              'live_sequences': live_sequences(),
              'sampling_sequences': sampling_sequences(),
              'recovery_pickups': recovery_pickups(),
              'scope': 'Actual top-level dispatch and UIKit methods with mocked Objective-C NSSet/UITouch. '
                       'Routing cases stub leaf systems; pause cases execute actual buttons/InitPauseGame. '
                       'Live sequences execute original creep/object/device input with supplied state. '
                       'Sampling sequences execute creep::Process at 60Hz between movement bursts. '
                       'No OS event timing, hardware multi-touch or browser claims.'}
    (ROOT / 'research/battle-input.json').write_text(json.dumps(result, indent=2) + '\n')
    print({k: len(v) for k, v in result.items() if isinstance(v, list)})


if __name__ == '__main__':
    main()
