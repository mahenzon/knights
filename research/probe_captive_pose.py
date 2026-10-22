"""Native captive pose/history, including skeleton rotation; research only."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, ROOT, SELF, f32
from probe_device_phase import DeviceFrameProbe
from probe_sacrifices import ART
from probe_weapons import CREEP


class CaptiveProbe(DeviceFrameProbe):
    def actor_state(self):
        result = super().actor_state()
        result.update({key: self.get_at(CREEP, off, fmt) for key, off, fmt in [
            ('angle', 0x44, 'f'), ('dragging', 0x98, 'B'), ('drag_time', 0x9c, 'f'),
            ('stun_time', 0xb8, 'f'), ('freeze_time', 0xcc, 'f'), ('ground', 0x10, 'f'),
            ('target_x', 0xa0, 'i'), ('target_y', 0xa4, 'i'),
            ('blocked', 0x24, 'B'), ('cooldown', 0xf0, 'f'),
            ('disarmed', 0xc9, 'B'), ('frozen', 0xd0, 'B'), ('shield', 0xa8, 'B')]})
        return result

    def run_captive(self, kind, device, pose, pickup=False, frozen=0):
        self.reset()
        self.u.mem_write(ART, bytes(25 * 0x98))
        self.call(0x19b60, [META['symbols']['_Player']])
        for off in (0x64, 0x80, 0x84):
            self.u.mem_write(META['symbols']['_Player'] + off, bytes(4))
        self.init(kind)
        self.put(0xe0, 99)
        self.call(0x26d44, [SELF, pose])
        self.put(0x4c, 0.75)
        self.put(8, 233 if device == 3 else 120)
        self.put(12, 130 if device == 3 else 75)
        if frozen:
            self.put(0xcc, frozen)
            self.put(0xd0, 1, 'B')
            self.call(0x26d44, [SELF, 7])
        if pickup:
            self.call(0x26528, [SELF])
        self.u.mem_write(CREEP, bytes(self.u.mem_read(SELF, 256)))
        self.init_art(device, 173 if device == 3 else 35, 210 if device == 3 else 30)
        if device == 3:
            self.u.mem_write(CREEP+0x88, bytes(4))
            self.u.mem_write(CREEP+0x98, b'\1')
            self.call(0x2d254, [ART, 233, 100, 0])
            for _ in range(27):
                self.call(0x2f2fc, [ART, f32(1 / 60)])
            self.call(0x2d698, [ART, 0])
        else:
            self.call(0x2d140, [ART, 0, 0, 0])
        initial = self.actor_state()
        assert initial['sacrifice'] == 1 and initial['hidden'] == int(device == 3)
        frames = []
        for tick in range(1, 426 if device == 3 else 181):
            self.frame = tick
            self.actor_draws = []
            row = self.step_frame()
            frames.append({'tick': tick, 'actor': row['after']['actor'],
                           'drawn': self.actor_draws[:], 'sacrifices': self.balances()[2],
                           'device': self.device_state(),
                           'draws': [d for d in row['draws'] if d.get('image') in
                                     ('altar_hook.png', 'drakon.png', 'drakon_cherep.png')]})
        return {'kind': kind, 'device': device, 'pose': pose, 'pickup': pickup,
                'frozen': frozen, 'initial': initial, 'frames': frames}


def main():
    p = CaptiveProbe()
    cases = [p.run_captive(kind, device, pose)
             for kind in range(11) for device in (0, 3) for pose in (0, 2)]
    cases += [p.run_captive(kind, 3, 0, pickup=True, frozen=frozen)
              for kind in range(11) for frozen in (0, 1, 4.5)]
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Original capture functions followed by integrated world loop. '
                       'Initial animation poses0/2 with fractional frame0.75; '
                       'abilities delayed99 seconds; rand123456; external effects intercepted.'}
    (ROOT/'research/captive-pose.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    for c in cases:
        changes = []
        previous = None
        for f in c['frames']:
            a = f['actor']; signature = (a['pose'], a['dragging'], a['flying'], a['active'])
            if signature != previous:
                changes.append((f['tick'], signature, a['x'], a['angle']))
                previous = signature
        print(c['kind'], c['device'], c['pose'], 'initial', c['initial']['pose'], 'changes', changes)


if __name__ == '__main__':
    main()
