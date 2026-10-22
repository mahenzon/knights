"""Unshortened native battles with pointer gestures and natural result transitions."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_session_random import SessionProbe, PLAYER, WAVE, SKIP
from probe_land import LandProbe
from probe_weapons import CREEP, DRAG, DRAG_SCHEMA

GAME = SELF + 0x95000
ACTOR_KEYS = ['kind', 'dead', 'sacrifice', 'x', 'y', 'vx', 'vy', 'hp',
              'dragging', 'flying', 'pose', 'alpha', 'frame', 'speed', 'cooldown']


class FullDayProbe(SessionProbe):
    def __init__(self):
        super().__init__()
        self.switched = False
        self.frame = 0
        # Keep the real world/land/normalGame transition; omit flag text and GPU fade.
        for address in (0x1e6c8, 0x1e2fc, 0x7b98):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u),
                            begin=address, end=address)
        self.u.hook_add(UC_HOOK_CODE, self.change_mode, begin=0x1d780, end=0x1d780)
        self.u.mem_write(0xf5450, struct.pack('<I', 1))
        self.u.mem_write(0xf53fc + 4, struct.pack('<I', GAME))

    def change_mode(self, u, *args):
        assert u.reg_read(REGS[0]) == 9, u.reg_read(REGS[0])
        self.switched = True
        self.ret(u)

    def actors(self):
        return [{'slot': slot, **self.actor_state(slot)} for slot in range(200)
                if self.get_at(CREEP + slot * 256, 0, 'B')]

    def controls(self, actors, plan):
        if plan:
            x, y, age = plan
            if age == 11:
                self.call(0x264ac, [x, 10])
                return [['release', x, 10]], None
            point = [x, round(y + (10 - y) * age / 10)]
            self.call(0x26250, point)
            return [['drag', *point]], (x, y, age + 1)
        available = [a for a in actors if not any(a[k] for k in
                     ('dead', 'sacrifice', 'flying', 'dragging', 'shield'))
                     and 25 < a['x'] < 300 and 50 < a['y'] < 300]
        if not available:
            return [], None
        a = max(available, key=lambda a: a['x'])
        point = [int(a['x']) + 8, int(a['y']) - 12]
        self.call(0x26674, point)
        picked = self.u.reg_read(REGS[0])
        return [['pickup', *point, picked]], (*point, 1) if picked else None

    def setup_day(self):
        self.call(0x20e1c, [GAME])
        return {'rng': self.stream, 'background': self.background,
                'land': LandProbe.state(self), **self.config()}

    def equipment_frame(self):
        return {}

    def run(self, mode, level, defend, day_count, start_day=1, difficulty=1):
        assert difficulty in (0, 1, 2)
        self.stream = None
        self.clean()
        self.u.mem_write(PLAYER + 0x70, struct.pack('<I', difficulty))
        self.u.mem_write(PLAYER + 0x184, bytes(80))
        self.u.mem_write(WAVE, bytes(0x50))
        self.u.mem_write(SKIP, bytes(4))
        self.u.mem_write(PLAYER + 0x234, struct.pack('<I', level))
        self.u.mem_write(PLAYER + 0x88, bytes([mode != 'campaign', mode == 'madness']))
        self.u.mem_write(self.get_at(0xc7574, 0, 'I'), b'\1')
        self.stream = 73
        warmup = []
        if start_day > 1:
            for _ in range(start_day - 1 if mode == 'campaign' else 1):
                warmup.append(self.setup_day())
            self.u.mem_write(PLAYER + 0x130, struct.pack('<I', start_day - 1))
        days = []
        for day in range(start_day, start_day + day_count):
            self.switched = False
            initial = self.setup_day()
            assert self.get_at(PLAYER, 0x130, 'I') == day
            frames = []
            plan = None
            actors = self.actors()
            for tick in range(1, int(initial['config'][0] * 60) + 1000):
                self.frame = tick
                self.trace = []; self.commands = []; self.actor_draws = []
                self.phases = []; self.random_calls = []
                inputs, plan = self.controls(actors, plan) if defend else ([], None)
                self.call(0x20728, [GAME, f32(1 / 60)])
                actors = self.actors()
                flags = [self.get_land(0x2dc, 'B'), self.get_land(0x2dd, 'B')]
                frames.append({'tick': tick, 'inputs': inputs, 'rng': self.stream,
                               'hp': self.get_land(0x28c), 'time': self.get_land(4),
                               'balances': self.balances(), 'kills': self.get_at(PLAYER, 0x6c, 'I'),
                               'ending': 2 if flags[1] else flags[0],
                               'status': (2 if flags[1] else flags[0]) if self.switched else 0,
                               'fade': self.get_at(GAME, 0x28),
                               'objects': [[slot, *[self.get_at(DRAG+slot*116, off, fmt)
                                            for key,off,fmt in DRAG_SCHEMA]] for slot in range(30)
                                            if self.get_at(DRAG+slot*116,0,'B')],
                               'actors': [[a['slot'], *[a[k] for k in ACTOR_KEYS]] for a in actors],
                               **self.equipment_frame()})
                if self.switched:
                    break
            assert self.switched, (mode, level, day, 'did not reach result')
            final = frames[-1]
            print(mode, level, day, 'frames', len(frames), 'status', final['status'],
                  'balances', final['balances'], 'gestures',
                  sum(i[0] in ('pickup', 'press') for f in frames for i in f['inputs']), flush=True)
            days.append({'day': day, 'initial': initial, 'frames': frames})
            if final['status'] == 2:
                break
        return {'mode': mode, 'level': level, 'defend': defend, 'seed': 73,
                'difficulty': ['easy', 'normal', 'hard'][difficulty],
                'warmup': warmup, 'start_day': start_day, 'days': days}


def main():
    cases = [FullDayProbe().run('campaign', 0, True, 2),
             FullDayProbe().run('endless', 0, True, 2),
             FullDayProbe().run('madness', 0, False, 1)]
    (ROOT / 'research/full-days.json').write_text(json.dumps({
        'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'actor_keys': ACTOR_KEYS,
        'object_keys': [key for key,off,fmt in DRAG_SCHEMA],
        'cases': cases,
        'scope': 'Unshortened native normalGame::Draw through its real mode9 transition. '
                 'Real wave/actor/weapon/effect/land phases and CreepStylus pointer callbacks. '
                 'Default HP and difficulty; synthetic within-screen gestures; no human balance claim. '
                 'Flag presentation, HUD, legacy text/particles and external audio/GPU intercepted. '
                 'Next-day entry bypasses menu dwell, with no purchases. '
                 'Supplied xorshift rand and stable host qsort are not historical-library evidence.'
    }, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
