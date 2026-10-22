"""Replay the reported machine, entry explosion and shop art in the original ARM code."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, ROOT, SELF, f32
from probe_captive_pose import CaptiveProbe
from probe_chain_cycle import ChainProbe
from probe_enemy_drawing import EnemyDrawProbe
from probe_sacrifices import ART
from probe_shop import SHOP, ShopProbe
from probe_weapons import CREEP, DRAG


def entry_blast(kind):
    p = ChainProbe()
    p.reset()
    p.smokes = []
    p.fragments = []
    p.u.mem_write(ART, bytes(25 * 0x98))
    p.init(kind)
    p.put(8, -50)
    p.put(12, 236)
    p.put(0xe0, 99)
    p.u.mem_write(CREEP, bytes(p.u.mem_read(SELF, 256)))
    p.init_art(7, -50, 236)
    p.u.mem_write(ART + 0x28, struct.pack('<f', 0.41))
    p.step_frame()
    launched = p.actor_state()
    assert launched['immunity'] and launched['flying']
    # Use a real expiring barrel in the integrated world loop, beside the launched enemy.
    p.call(0x29bb0, [DRAG, int(launched['x']), int(launched['y']), 4], [0])
    p.u.mem_write(DRAG + 3, b'\0')
    p.u.mem_write(DRAG + 0xc, struct.pack('<f', p.get_at(DRAG, 0x10) - 0.01))
    p.step_frame()
    burned = p.actor_state()
    assert burned['active'] and not burned['dead'] and burned['burning']
    assert burned['hp'] == launched['hp'] and not burned['immunity']
    for _ in range(60):
        p.step_frame()
    continued = p.actor_state()
    for _ in range(120):
        p.step_frame()
    settled = p.actor_state()
    if kind == 7:
        assert settled['active'] and not settled['dead'] and settled['burning']
        assert settled['speed'] > 0 and settled['pose'] == 0
    color = EnemyDrawProbe().draw_case(kind, burning=1)['draws'][0]['color']
    assert color[:3] == [70, 70, 70]
    return {'kind': kind, 'after_platform': launched, 'after_barrel': burned,
            'after_one_second': continued, 'after_three_seconds': settled,
            'native_draw_color': color}


def main():
    gate = CaptiveProbe().run_captive(5, 3, 0, pickup=True)
    eject = next(frame for frame in gate['frames'] if frame['sacrifices'])
    assert gate['initial']['x'] == 233 and eject['actor']['x'] < 140
    p = ShopProbe()
    player = META['symbols']['_Player']
    p.u.mem_write(player + 0x22c, bytes(6))
    p.u.mem_write(player + 0x8c, struct.pack('<20i', 0, *([-1] * 19)))
    p.u.mem_write(player + 0x80, struct.pack('<2I', 10000, 100))
    p.call(0x32cfc, [SHOP])
    p.u.mem_write(SHOP + 0x20, struct.pack('<f', -300))
    p.trace = []
    p.call(0x32760, [SHOP, f32(0)])
    altar = [d for d in p.trace if d.get('image', '').startswith('altar')]
    assert len(altar) == 1 and altar[0]['image'] == 'altar_dragon.png'
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
              'gate': {'initial_x': gate['initial']['x'], 'ejection_frame': eject['tick'],
                       'ejected': eject['actor'], 'drawn': eject['drawn']},
              'shop_altar': altar, 'entry_blasts': [entry_blast(k) for k in (10, 7)],
              'limits': 'Original ARM callbacks execute; GL/audio intercepted, seeded actors and '
                        'expiring barrel. This is not an exact replay of the user touch gesture.'}
    (ROOT / 'artifacts/ipad-original-findings.json').write_text(
        json.dumps(result, indent=2, allow_nan=False) + '\n')
    print('Original: machine ejects at x', eject['actor']['x'], 'from initial x233.')
    print('Original shop: altar_dragon.png only; no altar_hook.png.')
    print('Original entry platform: barrel and assassin survive the first blast with RGB70 tint.')
    print('After one second:', [(r['kind'], r['after_one_second']['active'],
                               r['after_one_second']['dead']) for r in result['entry_blasts']])


if __name__ == '__main__':
    main()
