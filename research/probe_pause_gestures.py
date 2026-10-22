"""Bounded original pause/save state with live gestures; all OS work intercepted."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_battle_input import DispatchProbe, LiveDispatchProbe, input_event, scale
from probe_weapons import WeaponProbe, ART, DRAG, CREEP
from probe_save_roundtrip import BLOCKS
from probe_day_end import EndProbe, GAME, NATIVE_LAND
from probe_frame_phase import PHASES

PLAYER = META['symbols']['_Player']
PAUSED = META['symbols']['_g_paused']
CURRENT_MODE = META['symbols']['_g_currentMode']
NAME, PATH = SELF + 0x96000, SELF + 0x96100


class PauseProbe(WeaponProbe):
    def __init__(self):
        self.routes = []
        self.boundaries = []
        self.data = bytearray()
        self.file_position = 0
        self.io = []
        super().__init__()
        self.u.mem_write(0xc7548, struct.pack('<I', ART))
        self.u.mem_write(ART, bytes(25 * 152))
        self.u.mem_write(DRAG, bytes(30 * 116))
        self.u.mem_write(CREEP, bytes(200 * 256))
        self.u.mem_write(CURRENT_MODE, struct.pack('<I', 1))
        self.u.mem_write(PLAYER + 0x80, struct.pack('<2I', 1234, 56))
        self.u.mem_write(PATH, b'/memory/pause.sav\0')
        scale(self)
        DispatchProbe.setup_pause(self)
        for at in (0x1d780, 0x254f4, 0x38164, 0x7b98, 0x7fc8):
            self.u.hook_add(UC_HOOK_CODE, self.side_effect, begin=at, end=at)
        for at in (0x1c934, 0x1ca2c, 0x1ca54, 0x1ca70, 0x1cac8, 0x1cafc,
                   0x1ca78, 0x1cab0, 0x1cabc, 0x20238, 0x20300):
            self.u.hook_add(UC_HOOK_CODE, self.boundary, begin=at, end=at)

    def effect_hook(self, u, address, *args):
        if address == 0x2d4b4:
            return
        super().effect_hook(u, address, *args)

    def ret(self, u):
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def side_effect(self, u, address, *args):
        if address == 0x1d780:
            mode = u.reg_read(REGS[0])
            self.routes.append({'call': 'SwitchMode', 'mode': mode})
            self.u.mem_write(CURRENT_MODE, struct.pack('<I', mode))
        elif address == 0x254f4:
            self.routes.append({'call': 'SaveOptions_intercepted'})
        elif address == 0x38164:
            self.routes.append({'call': 'music_intercepted', 'track': u.reg_read(REGS[0])})
        self.ret(u)

    def boundary(self, u, address, *args):
        self.boundaries.append({'address': hex(address), 'state': self.snapshot()})

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        a = [u.reg_read(r) for r in REGS]
        if name in ['_NSSearchPathForDirectoriesInDomains', '_objc_msgSend']:
            u.reg_write(REGS[0], PATH)
        elif name == '_fopen':
            mode = bytes(u.mem_read(a[1], 12)).split(b'\0')[0].decode()
            self.file_position = 0
            if mode.startswith('w'):
                self.data = bytearray()
            self.io.append({'op': 'open', 'mode': mode})
            u.reg_write(REGS[0], 1)
        elif name == '_fseek':
            assert a[1:3] == [0, 0]
            self.file_position = 0
            u.reg_write(REGS[0], 0)
        elif name in ['_fwrite', '_fread']:
            size = a[1] * a[2]
            if name == '_fwrite':
                self.data[self.file_position:self.file_position + size] = u.mem_read(a[0], size)
            else:
                u.mem_write(a[0], bytes(self.data[self.file_position:self.file_position + size]))
            self.file_position += size
            self.io.append({'op': 'write' if name == '_fwrite' else 'read', 'size': size})
            u.reg_write(REGS[0], a[2])
        elif name == '_fclose':
            self.io.append({'op': 'close'})
            u.reg_write(REGS[0], 0)
        elif name == '_memset':
            u.mem_write(a[0], bytes([a[1] & 255]) * a[2])
        else:
            return super().import_hook(u, address, *args)
        self.ret(u)

    def snapshot(self):
        result = LiveDispatchProbe.snapshot(self)
        result.update(paused=self.read(PAUSED, 0, 'B'),
                      mode=self.read(CURRENT_MODE, 0, 'I'),
                      score=self.read(PLAYER, 0x64, 'I'),
                      gold=self.read(PLAYER, 0x80, 'I'),
                      souls=self.read(PLAYER, 0x84, 'I'),
                      world_hashes={name: hashlib.sha256(self.u.mem_read(ptr, size)).hexdigest()
                                    for name, ptr, size in [('creeps', CREEP, 200 * 256),
                                                            ('objects', DRAG, 30 * 116),
                                                            ('devices', ART, 25 * 152)]})
        for row in result['objects']:
            ptr = DRAG + row['slot'] * 116
            row['position'] = [self.read(ptr, off) for off in (0x18, 0x1c)]
            row['velocity'] = [self.read(ptr, off) for off in (0x20, 0x24)]
        return result

    def setup(self, actor):
        if actor == 'creep':
            self.enemy(x=100, y=200)
            sequence = [('down', 100, 200), ('move', 150, 100)]
        elif actor == 'fireball':
            self.art(5, 0, 408, 150)
            self.write(ART, 0x28, 100.)
            sequence = [('down', 447, 163), ('move', 200, 100), ('move', 280, 80)]
        elif actor == 'column':
            self.art(4, 0, 405, 38)
            self.write(ART, 0x28, 100.)
            sequence = [('down', 438, 51)]
        else:
            raise ValueError(actor)
        events = []
        for kind, x, y in sequence:
            self.effects = []
            input_event(self, kind, [[x, y]])
            events.append({'kind': kind, 'point': [x, y], 'state': self.snapshot()})
        self.effects = []
        self.boundaries = []
        return events


def callbacks(actor, action):
    p = PauseProbe()
    setup = p.setup(actor)
    before = p.snapshot()
    p.call(0x1c934, [])
    paused = p.snapshot()
    assert paused['world_hashes'] == before['world_hashes']
    assert paused['paused'] == 1 and paused['sounds'] == []
    if action == 'resume':
        p.call(0x1ca54, [])
    elif action == 'options_done':
        p.call(0x1cac8, [])
        options = p.snapshot()
        assert options['mode'] == 3 and options['world_hashes'] == before['world_hashes']
        p.call(0x20238, [])
    elif action == 'abort':
        p.call(0x1ca78, [])
    after = p.snapshot()
    assert after['world_hashes'] == before['world_hashes']
    assert after['paused'] == 0 and after['sounds'] == []
    assert [after[key] for key in ['gold', 'souls', 'score']] == [before[key] for key in ['gold', 'souls', 'score']]
    return {'actor': actor, 'action': action, 'setup': setup, 'before': before,
            'paused': paused, 'after': after, 'boundaries': p.boundaries, 'routes': p.routes}


def release_to_pause(actor):
    p = PauseProbe()
    setup = p.setup(actor)
    events = []
    for kind in ['move', 'up']:
        p.effects = []
        input_event(p, kind, [[460, 305]])
        events.append({'kind': kind, 'point': [460, 305], 'state': p.snapshot()})
    assert events[-1]['state']['paused'] == 1
    entry, exit = p.boundaries[:2]
    assert entry['address'] == '0x1c934' and exit['address'] == '0x1ca2c'
    assert entry['state']['world_hashes'] == exit['state']['world_hashes']
    after_up = p.snapshot()
    p.effects = []
    p.call(0x1ca54, [])
    resumed = p.snapshot()
    assert resumed['world_hashes'] == after_up['world_hashes']
    return {'actor': actor, 'setup': setup, 'events': events, 'boundaries': p.boundaries,
            'resumed': resumed, 'routes': p.routes}


def save_held(actor):
    p = PauseProbe()
    setup = p.setup(actor)
    p.call(0x1c934, [])
    before = p.snapshot()
    p.u.mem_write(NAME, b'pause.sav\0')
    p.call(0x2516c, [NAME])
    saved = p.snapshot()
    assert saved == before
    assert len(p.data) == 59868
    for _, pointer, size in BLOCKS:
        ptr = p.read(pointer, 0, 'I')
        p.u.mem_write(ptr, bytes([0x55]) * size)
    p.call(0x24b80, [NAME])
    restored = p.snapshot()
    assert restored == before
    return {'actor': actor, 'setup': setup, 'before': before, 'saved': saved,
            'restored': restored, 'bytes': len(p.data), 'stdio': p.io}


class BannerProbe(EndProbe):
    def __init__(self):
        self.phases = []
        self.flag_calls = 0
        self.allow_land = False
        super().__init__()
        for at in PHASES:
            self.u.hook_add(UC_HOOK_CODE, self.phase, begin=at, end=at)
        for at in (0x6a70, 0x209fc, 0x312b8, 0x38164):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=at, end=at)
        self.u.hook_add(UC_HOOK_CODE, self.flag_entry, begin=0x1e2fc, end=0x1e2fc)

    def phase(self, u, at, *args):
        if self.allow_land and at == 0x303a8:
            return
        self.phases.append(PHASES[at])
        self.ret(u)

    def flag_entry(self, u, *args):
        self.flag_calls += 1

    def import_hook(self, u, at, *args):
        if META['imports'].get(at) == '_sprintf':
            a = [u.reg_read(reg) for reg in REGS]
            fmt = bytes(u.mem_read(a[1], 100)).split(b'\0')[0].decode()
            text = fmt % tuple(a[2:2 + fmt.count('%d') + fmt.count('%i')])
            u.mem_write(a[0], text.encode() + b'\0')
            u.reg_write(REGS[0], len(text))
            self.ret(u)
            return
        super().import_hook(u, at, *args)

    def end_hook(self, u, at, *args):
        if at == 0x6d68:
            return  # Actual DrawNormalGame order, with world phases intercepted.
        super().end_hook(u, at, *args)

    def draw(self, dt):
        self.trace = []
        self.phases = []
        self.flag_calls = 0
        self.call(0x20728, [GAME, f32(dt)])
        return {'paused': self.value(PAUSED, 'B'), 'flag_calls': self.flag_calls,
                'flag_y': self.value(GAME + 8), 'flag_remaining': self.value(GAME + 0x14),
                'commands': self.trace, 'world_phases': self.phases}


def banner(kind):
    p = BannerProbe()
    p.start()
    p.u.mem_write(PAUSED, b'\0')
    p.u.mem_write(PLAYER + 0x130, struct.pack('<2I', 1, 8))
    p.call(0x20e1c, [GAME])  # Actual InitMode installs day-start banner fields.
    # Battle setup is intercepted above; supply the first playable day for text.
    p.u.mem_write(PLAYER + 0x130, struct.pack('<2I', 1, 8))
    if kind == 1:
        p.u.mem_write(NATIVE_LAND + 4, struct.pack('<f', 31))
        p.allow_land = True
        p.call(0x303a8, [NATIVE_LAND, f32(0)])
        p.allow_land = False
    elif kind == 2:
        p.u.mem_write(NATIVE_LAND + 0x28c, struct.pack('<f', 100))
        p.call(0x308e8, [NATIVE_LAND, 101])
    initial = {'flag_y': p.value(GAME + 8), 'amplitude': p.value(GAME + 12),
               'direction': p.value(GAME + 16, 'i'), 'remaining': p.value(GAME + 20),
               'phase': p.value(GAME + 24), 'kind': p.value(GAME + 28, 'I')}
    assert initial == {'flag_y': -600, 'amplitude': 20, 'direction': 1,
                       'remaining': 4, 'phase': 0, 'kind': kind}
    for _ in range(100):
        before = p.draw(1 / 60)
    before['animation_frame'] = 100
    p.call(0x1c934, [])
    paused = [p.draw(0) for _ in range(3)]
    p.call(0x1ca54, [])
    resumed = p.draw(1 / 60)
    resumed['animation_frame'] = 101
    assert before['flag_calls'] == resumed['flag_calls'] == 1
    assert any(row.get('image') == 'flag.png' for row in before['commands'])
    for row in paused:
        assert row['flag_calls'] == 0 and row['commands'] == []
        assert row['flag_y'] == before['flag_y'] and row['flag_remaining'] == before['flag_remaining']
    return {'kind': ['day_start', 'victory', 'defeat'][kind], 'initial': initial, 'before': before,
            'paused': paused, 'resumed': resumed}


def main():
    actors = ['creep', 'fireball', 'column']
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'callbacks': [callbacks(actor, action) for actor in actors
                            for action in ['resume', 'options_done', 'abort']],
              'release_to_pause': [release_to_pause(actor) for actor in actors],
              'save_held': [save_held(actor) for actor in actors],
              'banners': [banner(kind) for kind in range(3)],
              'scope': 'Original input and pause/resume/options/abort callbacks with live supplied actors; '
                       'world state and audio are observed, not stubbed. Mode transition targets are '
                       'intercepted; options Done executes directly. Save/load uses in-memory stdio. '
                       'No UIKit background/cancellation delivery or full mode roundtrip claimed.'}
    (ROOT / 'research/pause-gestures.json').write_text(json.dumps(result, indent=2) + '\n')
    print({key: len(value) for key, value in result.items() if isinstance(value, list)})


if __name__ == '__main__':
    main()
