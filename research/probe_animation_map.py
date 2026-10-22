"""Original map marker/panel/progression animations, outside battlefield probes."""
import hashlib
import json
import math
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_SP

from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_map_details import MAP, MapProbe
from probe_scene import unf


class AnimationMapProbe(MapProbe):
    def __init__(self):
        self.emissions = []
        self.blend = 'source-over'
        super().__init__()
        for address in (0x254f4, 0x25308, 0x24f80):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=address, end=address)
        for address in (0x7d40, 0x7d20):
            self.u.hook_add(UC_HOOK_CODE, self.ignore, begin=address, end=address)

    def ret(self, u):
        if u.reg_read(UC_ARM_REG_PC) in (0x33df0, 0x34834):
            return  # Let the inherited menu hooks execute real dialog process/draw.
        super().ret(u)

    def import_hook(self, u, address, *args):
        if META['imports'].get(address) == '_glBlendFunc':
            src, dst = [u.reg_read(r) for r in REGS[:2]]
            self.blend = 'screen' if (src, dst) == (1, 0x301) else 'lighter' if (src, dst) == (0x302, 1) else 'source-over'
        super().import_hook(u, address, *args)

    def ignore(self, u, address, *args):
        if address == 0x1a090:
            values = [u.reg_read(r) for r in REGS]
            values += list(struct.unpack('<6I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 24)))
            self.emissions.append({k: unf(v) if 5 <= i <= 8 else v if v < 0x80000000 else v - 0x100000000
                                   for i, (k, v) in enumerate(zip(
                                       ['kind', 'x', 'y', 'vx', 'vy', 'size', 'growth', 'alpha', 'fade', 'additive'], values))}
                                  | {'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})
            return  # Execute the original smoke allocator and its later map Draw phase.
        if address in (0x7d40, 0x7d20):
            self.blend = 'screen' if address == 0x7d40 else 'source-over'
        super().ignore(u, address, *args)

    def shop_hook(self, u, address, *args):
        super().shop_hook(u, address, *args)
        if address == 0x7dc4:
            self.trace[-1]['blend'] = self.blend

    def state(self):
        def read(at, fmt):
            return struct.unpack('<' + fmt, self.u.mem_read(at, struct.calcsize('<' + fmt)))[0]
        levels = META['symbols']['_LevelData']
        return {
            'camera': [read(MAP + o, 'f') for o in (0x28, 0x2c)],
            'target': [read(MAP + o, 'f') for o in (0x38, 0x3c)],
            'panel': read(MAP + 0x40, 'f'),
            'panel_hidden': read(MAP + 0x44, 'B'),
            'camera_delay': read(MAP + 0x34, 'f'),
            'pending_selection': read(MAP + 0x30, 'B'),
            'manualCamera': read(MAP + 0x31, 'B'),
            'selected': read(META['symbols']['_Player'] + 0x234, 'i'),
            'dialogs': [read(META['symbols']['_HelpDialogs'] + i * 0x674, 'B') for i in range(10)],
            'markers': [{key: read(levels + i * 244 + off, fmt) for key, off, fmt in [
                ('x', 4, 'i'), ('y', 8, 'i'),
                ('selected', 0xd6, 'B'), ('scale', 0xd8, 'f'), ('flash', 0xf0, 'B'), ('flash_time', 0xec, 'f')]}
                for i in range(12)],
        }


def capture(won, manual=False, time_start=0, selected=0, repeat=False):
    p = AnimationMapProbe()
    player, land, levels = (META['symbols'][s] for s in ('_Player', '_Land', '_LevelData'))
    p.call(0x19b60, [player])
    p.u.mem_write(player + 0x234, struct.pack('<I', selected))
    p.u.mem_write(land + 0x2dc, bytes([won, 0]))
    p.u.mem_write(MAP, bytes(0x100))
    p.u.mem_write(MAP + 0x28, struct.pack('<2f', -420, -180))
    for i, level in enumerate(json.loads((ROOT / 'research/campaign-data.json').read_text())['levels']):
        row = bytearray.fromhex(level['rawLevelData'])
        row[0xd4] = i < selected or (repeat and i == selected)
        row[0xd5] = i <= selected
        row[0xd6] = i == selected
        row[0xf0] = 0
        if won:
            struct.pack_into('<f', row, 0xd8, 1.5 if i == selected else 1)
        p.u.mem_write(levels + i * 244, bytes(row))
    if won:
        p.call(0x1995c, [player])  # Actual victory record callback creates the transient map flash.
    before_init = p.state()
    p.call(0x1ebbc, [MAP])
    for ptr, name in list(p.surfaces.items()):
        if name.startswith('map_') and name.endswith('.png') and (ROOT / 'dist/assets' / name.replace('.png', '.jpg')).exists():
            p.surfaces[ptr] = name.replace('.png', '.jpg')
    initial = p.state()
    frames = []
    time = unf(f32(time_start))
    for frame in range(1, 241 if manual else 151):
        actions = []
        def input(kind, x, y):
            actions.append([kind, x, y])
            p.u.mem_write(SELF + 0x74000, struct.pack('<2i', x, y))
            p.call({'down': 0x1de4c, 'move': 0x1dc7c, 'up': 0x1dd64}[kind], [MAP, SELF + 0x74000, 0])
        def select(index):
            state = p.state()
            marker = state['markers'][index]
            input('down', int(marker['x'] + state['camera'][0]), int(marker['y'] + state['camera'][1]))
        if manual:
            if frame == 21:
                input('down', 10, 50)
                input('up', 10, 50)
            if frame in (31, 61, 151):
                select(2 if frame == 61 else 0)
            if frame in (32, 62, 152):
                input('up', 200, 160)
            if frame == 91:
                input('down', 10, 50)
            if frame == 92:
                input('up', 10, 50)
            if frame == 121:
                input('down', 10, 50)
            if frame == 122:
                input('move', -30, 10)
            if frame == 123:
                input('up', -30, 10)
            if frame == 161:
                actions.append(['hint'])
                p.call(0x1eaac, [])
            if frame == 181:
                select(2)
            if frame == 182:
                input('move', 300, 100)
                input('up', 300, 100)
            if frame == 211:
                input('down', 217, 230)
                input('up', 217, 230)
        time = unf(f32(time + unf(f32(1 / 60))))
        p.u.mem_write(META['symbols']['_g_timef'], struct.pack('<f', time))
        before = p.state()
        p.trace = []
        p.call(0x22e88, [MAP, f32(1 / 60)])
        assert all(not d.get('image', '').startswith('0x') for d in p.trace), p.trace
        frames.append({'frame': frame, 'time': time, 'actions': actions, 'before': before, 'state': p.state(), 'draws': p.trace[:]})
    return {'won': won, 'manual': manual, 'selected': selected, 'time_start': time_start,
            'beforeInit': before_init, 'initialState': initial, 'emissions': p.emissions[:], 'frames': frames}


def main():
    cases = [capture(False), capture(True), capture(False, True, 17.25), capture(True, True, 29.5), capture(True, False, 42, 11)]
    assert not cases[0]['emissions']
    assert len(cases[1]['emissions']) == 1
    assert cases[1]['emissions'][0]['kind'] == 3
    assert cases[1]['frames'][60]['state']['markers'][0]['scale'] == 1.5
    assert cases[1]['frames'][-1]['state']['selected'] == 1
    assert cases[2]['frames'][30]['state']['markers'][0]['selected'] == 1
    assert cases[2]['frames'][60]['state']['markers'][2]['selected'] == 1
    assert not any(m['selected'] for m in cases[2]['frames'][90]['state']['markers'])
    assert cases[2]['frames'][180]['state']['selected'] == 0
    assert any(cases[2]['frames'][160]['state']['dialogs'])
    assert not any(cases[2]['frames'][210]['state']['dialogs'])
    assert all(r['state']['manualCamera'] for r in cases[3]['frames'][20:])
    assert cases[4]['frames'][-1]['state']['selected'] == 11
    repeated = capture(True, repeat=True)
    assert repeated == cases[1], 'Previously completed castle still has the same victory flash and next-castle flow'
    f = lambda n: unf(f32(n))
    compared = 0
    for case in cases:
        for row in case['frames']:
            markers = [d for d in row['draws'] if d.get('image') in ('point_capture.png', 'point_open.png', 'point_defending.png')]
            assert len(markers) == 12
            for marker, state in zip(markers, row['before']['markers']):
                base = min(1.5, max(1, f(state['scale'] + (f(1/60) if state['selected'] else -f(1/60)))))
                expected = f(base + math.sin(f(row['time'] * 16)) * 0.10000000149011612) if state['selected'] else base
                assert marker['sx'] == expected and marker['sy'] == -expected, (row['frame'], marker, expected)
                compared += 1
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'marker_equation_comparisons': compared,
              'repeat_victory_matches_case': 1, 'repeat_victory_frames_compared': len(repeated['frames']), 'cases': cases,
              'scope': 'Native map InitMode, Player record update, map Draw, ProcessLevels and smoke allocation/process/draw. '
                       'Real map pointer callbacks, real hint dialog manager and pointer blocking. '
                       'File/OS/graphics calls and global map button drawing intercepted. Supplied app clock; no GPU rasterization.'}
    (ROOT / 'research/animation-map.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('Captured', sum(len(c['frames']) for c in cases), 'native map frames')
    for c in cases:
        print('won', c['won'], 'manual', c['manual'], 'selected', c['selected'],
              'emissions', c['emissions'], 'last camera', c['frames'][-1]['state']['camera'])


if __name__ == '__main__':
    main()
