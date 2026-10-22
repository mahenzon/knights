"""Original ARM scene anchors and sound events; offline research only.

Run from the project root with .venv/bin/python research/probe_scene.py.
Renderer, sound playback, allocation/particles are intercepted. Game state,
sound-table setup, sacrifice animation and death routines execute original code.
"""
import hashlib
import json
import math
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R3, UC_ARM_REG_SP
from extract_enemies import IMAGE, META, NAMES, REGS, ROOT, SELF, f32
from probe_sacrifices import ART, SacrificeProbe


def unf(value):
    return struct.unpack('<f', struct.pack('<I', value))[0]


def verify_dragon_equations(frames):
    """Independent reimplementation, bit-identical to every recorded native pose."""
    f = lambda value: unf(f32(value))
    dt = f(1 / 60)
    x, y, jaw, phase, direction = 360., -182., .5, 0., 1.
    for pose in frames:
        if pose['frame'] >= 61:
            x = f(x + f(dt * -180))
            y = min(0., f(y + (f(f(dt * 105) * direction) + math.sin(phase) * 130 * dt)))
            phase = f(phase + f(dt * 5))
            if x < 55:
                direction = -2.
            if x < 215:
                jaw = f(jaw + f(dt * f(-1.1)))
            if x < 85:
                jaw = f(jaw + f(dt * 8))
            jaw = min(.5, jaw)
            if x < -250:
                x = 1000.
        for key, value in (('x', x), ('y', y), ('jaw_angle', jaw), ('phase', phase), ('direction', direction)):
            assert value == pose[key], (pose['frame'], key, value, pose[key])
    return {'frames_compared': len(frames), 'maximum_absolute_error': 0,
            'fields': ['x', 'y', 'jaw_angle', 'phase', 'direction']}


class SceneProbe(SacrificeProbe):
    def __init__(self):
        self.trace = []
        self.frame = 0
        self.loads = {}
        self.surfaces = {}
        self.alpha = 255
        super().__init__()
        for address in (0x37c28, 0x31a7c, 0x27cc4, 0x26b3c, 0x308e8, 0x7fc8):
            self.u.hook_add(UC_HOOK_CODE, self.extra_hook, begin=address, end=address)
        for symbol, names in (
            ('_g_altarHook', ['altar_hook.png']),
            ('_g_hole', ['hole_zad.png', 'hole_per.png']),
            ('_g_holeCap', ['hole_krishka.png']),
            ('_g_dragon', ['reddrake_head.png', 'reddrake_jaw.png']),
            ('_g_artefacts', ['altar_dragon.png']),
        ):
            for index, name in enumerate(names):
                ptr = 0x1080000 + len(self.surfaces) * 16
                self.surfaces[ptr] = name
                self.u.mem_write(META['symbols'][symbol] + 4 * index, struct.pack('<I', ptr))
        # Captured Display calls never dereference these surface objects.

    def ret(self, u):
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def extra_hook(self, u, address, size, context):
        if address == 0x7fc8:
            self.alpha = u.reg_read(UC_ARM_REG_R1)
        if address == 0x37c28:
            path, event, subtype = [u.reg_read(r) for r in REGS[:3]]
            name = bytes(u.mem_read(path, 100)).split(b'\0')[0].decode()
            token = len(self.loads) + 1
            self.loads[token] = name
            u.mem_write(META['symbols']['_allSounds2'] + 4 * (event * 30 + subtype), struct.pack('<I', token))
        self.ret(u)

    def effect_hook(self, u, address, size, context):
        if address == 0x27534:
            return  # Execute real death; capture its sound and reward.
        if address == 0x37ba8:
            event, subtype = [u.reg_read(r) for r in REGS[:2]]
            self.trace.append({'frame': self.frame, 'op': 'sound', 'event': event,
                               'subtype': subtype, 'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})
        super().effect_hook(u, address, size, context)

    def ignore(self, u, address, size, context):
        a = [u.reg_read(r) for r in REGS]
        stack = struct.unpack('<IIII', bytes(u.mem_read(u.reg_read(UC_ARM_REG_SP), 16)))
        if address in (0x7bf4, 0x7fec):
            ptr = a[3] if address == 0x7bf4 else stack[0]
            self.trace.append({'frame': self.frame, 'op': 'blit' if address == 0x7bf4 else 'rotated',
                               'image': self.surfaces.get(ptr, hex(ptr)),
                               'x': unf(a[1]), 'y': unf(a[2]),
                               'radians': 0 if address == 0x7bf4 else unf(a[3])})
            if self.alpha != 255:
                self.trace[-1]['alpha'] = self.alpha / 255
        elif address == 0x28c70:
            self.trace.append({'frame': self.frame, 'op': 'creep', 'x': self.get(8), 'y': self.get(12)})
        self.ret(u)

    def import_hook(self, u, address, size, context):
        name = META['imports'].get(address, '')
        if name == '_glScissor':
            self.trace.append({'frame': self.frame, 'op': 'scissor', 'rect': [u.reg_read(r) for r in REGS]})
        if name == '_glVertexPointer':
            values = struct.unpack('<12f', bytes(u.mem_read(u.reg_read(UC_ARM_REG_R3), 48)))
            self.trace.append({'op': 'vertices', 'xyz': list(values)})
        if name == '_glTexCoordPointer':
            values = struct.unpack('<8f', bytes(u.mem_read(u.reg_read(UC_ARM_REG_R3), 32)))
            self.trace.append({'op': 'uv', 'st': list(values)})
        super().import_hook(u, address, size, context)

    def art_put(self, offset, value, kind='f'):
        self.u.mem_write(ART + offset, struct.pack('<' + kind, value))

    def sounds(self):
        return [x for x in self.trace if x['op'] == 'sound']

    def tick(self, dt):
        if self.get(0, 'B'):
            self.call(0x283ec, [SELF, f32(dt)])
        self.call(0x2f084, [ART, f32(dt)])
        self.call(0x2f2fc, [ART, f32(dt)])
        self.call(0x2e3b0, [ART])
        self.call(0x2e8a0, [ART, f32(dt)])

    def sound_table(self):
        self.call(0x37ce0, [])
        def lookup(event, subtype):
            token = struct.unpack('<I', self.u.mem_read(META['symbols']['_allSounds2'] + 4 * (event * 30 + subtype), 4))[0]
            name = self.loads.get(token)
            return name + '.wav' if name else None
        return {'creeps': [[lookup(event, kind) for kind in range(11)] for event in range(5)],
                'other': {str(event): [lookup(event, subtype) for subtype in range(3)] for event in range(8, 19)}}

    def texture_anchor_fixture(self):
        texture = SELF + 0x90000
        self.u.mem_write(texture, bytes(64))
        # Real Objective-C ivar offsets: maxS4,maxT8,pixelsWide24,pixelsHigh28.
        for offset, value, kind in ((4, .5, 'f'), (8, .5, 'f'), (24, 128, 'I'), (28, 64, 'I')):
            self.u.mem_write(texture + offset, struct.pack('<' + kind, value))
        self.trace.clear(); self.call(0x9934, [texture, 0, f32(10), f32(20)], [1])
        top_left = next(v['xyz'] for v in self.trace if v['op'] == 'vertices')
        blit_uv = next(v['st'] for v in self.trace if v['op'] == 'uv')
        self.trace.clear(); self.call(0x9a70, [texture, 0, f32(10), f32(20)], [1])
        centered = next(v['xyz'] for v in self.trace if v['op'] == 'vertices')
        centered_uv = next(v['st'] for v in self.trace if v['op'] == 'uv')
        assert top_left == [10,20,0,74,20,0,10,52,0,74,52,0]
        assert centered == [-22,4,0,42,4,0,-22,36,0,42,36,0]
        assert blit_uv == centered_uv == [0,0,.5,0,0,.5,.5,.5]
        scaled = []
        for sx, sy in ((1,-1), (1,1), (-.5,2)):
            width, height = 64*sx, 32*sy
            self.trace.clear()
            self.call(0x95a0, [texture, 0, f32(-width/2), f32(-height/2)],
                      [f32(width), f32(height), 1])
            xyz = next(v['xyz'] for v in self.trace if v['op'] == 'vertices')
            uv = next(v['st'] for v in self.trace if v['op'] == 'uv')
            assert uv == [0,.5,.5,.5,0,0,.5,0]
            scaled.append({'sx': sx, 'sy': sy, 'xyz': xyz, 'uv': uv})
        return {'content_size': [64,32], 'point': [10,20], 'BlitAtPoint_vertices': top_left,
                'drawAtPoint_vertices': centered, 'BlitAtPoint_uv': blit_uv,
                'drawAtPoint_uv': centered_uv, 'drawInRect': scaled}


def main():
    p = SceneProbe()
    result = {'source_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'method': 'Bounded original ARM execution. rand returns123456; graphics/audio/particles are intercepted.',
              'enemy_types': NAMES, 'sounds': p.sound_table()}
    assert result['sounds']['creeps'][1][0] == 'knightlite_deathcrash.wav'
    result['texture_anchor_fixture'] = p.texture_anchor_fixture()
    result['geometry'] = {
        'altar': {'base': {'image': 'altar_dragon.png', 'top_left': [35,30]},
                  'hook': {'image': 'altar_hook.png', 'top_left': [100,36]}},
        'gate': {'back': {'image': 'hole_zad.png', 'top_left': [173,210]},
                 'lid': {'image': 'hole_krishka.png', 'center': [232,227]},
                 'front': {'image': 'hole_per.png', 'top_left': [158,220]},
                 'clip_max_y': 253, 'opening_max_offset': 22, 'opening_speed': 50},
        'draw_order': ['land', 'altar_base', 'altar_hook', 'gate_back', 'begin_clip_y_le_253',
                       'gate_captive_creep', 'gate_lid', 'end_clip', 'gate_front',
                       'ordinary_creeps_and_dragobjects', 'dragon_head', 'dragon_jaw',
                       'missiles', 'land_foreground', 'particles', 'flying_text', 'fragments', 'smoke']}
    p.trace.clear()
    p.init_art(0, 35, 30)
    p.art_put(0x60, 255)  # Settled idle hook; capture fixtures below start from Init's alpha0.
    p.call(0x2e3b0, [ART])
    result['altar_idle'] = p.trace[:]
    assert [(v['image'], v['x'], v['y']) for v in p.trace if v['op'] == 'blit'] == [
        ('altar_dragon.png', 35, 30), ('altar_hook.png', 100, 36)]

    p.trace.clear(); p.init_art(3, 173, 210)
    p.call(0x2f2fc, [ART, f32(0)])
    result['gate_idle'] = p.trace[:]
    assert [(v['image'], v['x'], v['y']) for v in p.trace if v['op'] in ('blit', 'rotated')] == [
        ('hole_zad.png', 173, 210), ('hole_krishka.png', 232, 227), ('hole_per.png', 158, 220)]

    p.trace.clear(); p.art_put(0x70, 1, 'B')
    for frame in range(1, 28):
        p.frame = frame
        p.call(0x2f2fc, [ART, f32(1 / 60)])
    result['gate_opening'] = {'frames_to_ready': 27, 'opening_offset': p.art_get(0x64),
                              'samples': [v for v in p.trace if v['frame'] in (1, 13, 27)]}
    assert p.art_get(0x71, 'B') == 1 and p.art_get(0x64) == 22

    p.trace.clear(); p.init(0); p.init_art(0, 35, 30)
    p.put(8, 120); p.put(12, 75)
    p.call(0x2d140, [ART, 0, 0, 0])
    consumed = None
    dragon_samples = []; dragon_frames = []; hook_frames = []
    for frame in range(1, 361):
        p.frame = frame
        p.tick(1 / 60)
        hook = next((v for v in p.trace if v['frame'] == frame and v.get('image') == 'altar_hook.png'), None)
        hook_frames.append({'frame': frame, 'alpha': hook.get('alpha', 1) if hook else 0})
        dragon_frames.append({'frame': frame, 'x': p.art_get(0x4c), 'y': p.art_get(0x50),
                              'jaw_angle': p.art_get(0x5c), 'phase': p.art_get(0x54),
                              'direction': p.art_get(0x58), 'visible': bool(p.art_get(0x48, 'B')),
                              'occupied': bool(p.art_get(1, 'B'))})
        if consumed is None and not p.get(0, 'B'):
            consumed = frame
        if frame in (1, 60, 100, 120, 150, 200):
            dragon_samples.append({'frame': frame, 'x': p.art_get(0x4c), 'y': p.art_get(0x50),
                                   'jaw_angle': p.art_get(0x5c)})
        if not p.art_get(1, 'B'):
            break
    result['altar_capture'] = {'sounds': p.sounds(), 'consumed_frame': consumed,
                                'ready_frame': frame, 'dragon_samples': dragon_samples, 'dragon_frames': dragon_frames,
                                'first_dragon_draws': [v for v in p.trace if v.get('image', '').startswith('reddrake')][:2]}
    result['altar_capture']['equation_verification'] = verify_dragon_equations(dragon_frames)
    for frame in range(265, 292):
        p.frame = frame; p.tick(1 / 60)
        hook = next(v for v in p.trace if v['frame'] == frame and v.get('image') == 'altar_hook.png')
        hook_frames.append({'frame': frame, 'alpha': hook.get('alpha', 1)})
    result['altar_capture']['hook_frames'] = hook_frames

    p.trace.clear(); p.init(0); p.init_art(3, 173, 210)
    p.put(8, 233); p.put(12, 130); p.put(0x88, 0, 'i'); p.put(0x98, 1, 'B')
    p.call(0x2d254, [ART, 233, 100, 0])
    for _ in range(27):
        p.call(0x2f2fc, [ART, f32(1 / 60)])
    p.trace.clear(); p.frame = 0
    p.call(0x2d698, [ART, 0])
    initial = p.balances(); awarded = ready = None; gate_transition_samples = []; gate_frames = []
    for frame in range(1, 451):
        p.frame = frame; p.tick(1 / 60)
        lid = next(v for v in p.trace if v['frame'] == frame and v.get('image') == 'hole_krishka.png')
        gate_frames.append({'frame': frame, 'y': p.get(12), 'vy': p.get(0x20), 'hp': p.get(0x94),
                            'opening': p.art_get(0x64), 'amplitude': p.art_get(0x6c),
                            'burst_y': p.art_get(0x68), 'burst': bool(p.art_get(0x7c, 'B')),
                            'digestion': bool(p.art_get(0x72, 'B')), 'remaining': p.art_get(0x78),
                            'lid_y': lid['y'], 'lid_angle': lid['radians']})
        if awarded is None and p.balances()[2] > initial[2]:
            awarded = frame
        if frame in (332,333,334,343,344):
            gate_transition_samples.append({'frame': frame, 'creep_y': p.get(12),
                                             'animation': p.get(0x50, 'i'),
                                             'exclude_normal_creep_pass': bool(p.get(3, 'B')),
                                             'gate_draw_captive': bool(p.art_get(0x84, 'B'))})
        if ready is None and not p.art_get(1, 'B'):
            ready = frame
    result['gate_capture'] = {'sounds': p.sounds(), 'award_frame': awarded, 'ready_frame': ready,
                               'frames': gate_frames,
                               'digestion_draw_sample': [v for v in p.trace if v['frame'] == 60],
                               'payout_draw_samples': [v for v in p.trace if v['frame'] in (333,334,343,344)],
                               'transition_samples': gate_transition_samples}
    p.init(4); p.init_art(3, 173, 210); p.art_put(0x71, 1, 'B')
    p.trace.clear(); p.frame = 0; p.call(0x2d698, [ART, 0])
    result['catapult_gate_capture'] = p.sounds()

    result['creep_events'] = []
    for kind in range(11):
        p.init(kind); p.trace.clear(); p.frame = 0
        p.call(0x26528, [SELF]); p.call(0x26378, [SELF]); p.call(0x27534, [SELF])
        result['creep_events'].append({'type': kind, 'sounds': p.sounds()})

    result['impacts'] = []
    for vy in (100, 700):
        p.init(0); p.put(12, 243); p.put(0x20, vy); p.put(0xa9, 1, 'B'); p.put(0x88, 0, 'i')
        p.trace.clear(); p.call(0x283ec, [SELF, f32(.01)])
        result['impacts'].append({'initial_vy': vy, 'hp': p.get(0x94), 'dead': bool(p.get(1, 'B')), 'sounds': p.sounds()})
    assert [x['event'] for x in result['impacts'][0]['sounds']] == [0]
    assert [x['event'] for x in result['impacts'][1]['sounds']] == [1]
    (ROOT / 'research/scene-data.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'sound_rows': len(result['sounds']['creeps']), 'dragon_frames': len(dragon_frames),
                      'altar_sounds': result['altar_capture']['sounds'], 'gate_sounds': result['gate_capture']['sounds'],
                      'impact_sounds': result['impacts']}, indent=2))


if __name__ == '__main__':
    main()
