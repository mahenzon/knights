"""Reproduce Victory spawning, weapon replacement prompts and frozen-enemy transitions."""
import hashlib
import json
import struct

from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP
from extract_enemies import IMAGE, META, REGS, ROOT, SELF, f32
from probe_play_menu import PlayProbe
from probe_shop import ShopProbe, SHOP
from probe_smoke import SmokeProbe


def waves():
    p = PlayProbe()
    spawns = []

    def spawn(u, *args):
        spawns.append([u.reg_read(r) for r in REGS])
        p.ret(u)

    p.u.hook_add(UC_HOOK_CODE, spawn, begin=0x18f8c, end=0x18f8c)
    p.u.hook_add(UC_HOOK_CODE, lambda u, *args: p.ret(u), begin=0x18e30, end=0x18e30)
    results = []
    for won in [False, True]:
        wave = META['symbols']['_Wave']
        p.u.mem_write(wave, bytes(0x50))
        p.u.mem_write(wave, struct.pack('<f', 99999))
        p.u.mem_write(wave + 0x14, struct.pack('<f', -1))
        p.u.mem_write(META['symbols']['_Land'] + 0x2dc, bytes([won, 0]))
        p.u.mem_write(0xe23a0, bytes(4))
        spawns.clear()
        for _ in range(490):
            p.call(0x19104, [wave, f32(1 / 60)])
        results.append({'victory': won, 'ticks': 490, 'spawn_calls': len(spawns)})
    assert results[0]['spawn_calls'] == 49 and results[1]['spawn_calls'] == 0, results
    return results


def purchases():
    p = ShopProbe()
    dialogs = []

    def dialog(u, *args):
        dialogs.append(u.reg_read(REGS[0]))
        p.ret(u)

    def no_dialog(u, *args):
        u.reg_write(REGS[0], 0)
        p.ret(u)

    p.u.hook_add(UC_HOOK_CODE, no_dialog, begin=0x33f84, end=0x33f84)
    p.u.hook_add(UC_HOOK_CODE, lambda u, *args: p.ret(u), begin=0x1cedc, end=0x1cedc)
    p.u.hook_add(UC_HOOK_CODE, dialog, begin=0x34f2c, end=0x34f2c)
    player = META['symbols']['_Player']
    result = []
    for owned, item in [(2, 100), (2, 101), (2, 102), (2, 103), (3, 102)]:
        inventory = [0] + [-1] * 19
        inventory[10] = owned
        p.u.mem_write(player + 0x8c, struct.pack('<20i', *inventory))
        p.u.mem_write(player + 0x80, struct.pack('<2I', 10000, 100))
        p.u.mem_write(player + 0x22c, bytes(6))
        p.call(0x32cfc, [SHOP])
        p.u.mem_write(SHOP + 0x20, bytes(4))
        p.call(0x32760, [SHOP, f32(0)])
        center = struct.unpack('<i', p.u.mem_read(META['symbols']['_ShopItems'] + item * 0x164 + 0x14c, 4))[0]
        p.u.mem_write(SHOP + 0x20, struct.pack('<f', 240 - center))
        p.call(0x32760, [SHOP, f32(0)])
        dialogs.clear()
        point = SELF + 0x90000
        p.u.mem_write(point, struct.pack('<2i', 240, 140))
        p.call(0x31e50, [SHOP, point])
        p.call(0x31e90, [SHOP, point])
        result.append({'owned_tier': owned, 'item': item, 'dialogs': dialogs[:]})
    assert [bool(r['dialogs']) for r in result] == [True, True, False, True, True], result
    return result


class IceProbe(SmokeProbe):
    def ignore(self, u, address, size, context):
        if address == 0x31a7c:
            self.fragments.append([u.reg_read(r) for r in REGS] +
                                  list(struct.unpack('<8I', u.mem_read(u.reg_read(UC_ARM_REG_SP), 32))))
        super().ignore(u, address, size, context)


def ice():
    p = IceProbe()
    result = []
    for scenario in ['timer_expiry', 'landing', 'death']:
        p.init(0)
        p.put(8, 200)
        p.put(12, 240)
        p.put(0xcc, 1 / 120 if scenario == 'timer_expiry' else 3.5)
        p.put(0xd0, 1, 'B')
        p.put(0x50, 7, 'I')
        p.put(0x88, 0, 'i')
        p.fragments, p.effects, p.emissions = [], [], []
        if scenario == 'timer_expiry':
            p.call(0x283ec, [SELF, f32(1 / 60)])
        else:
            p.call(0x26d44, [SELF, 4 if scenario == 'landing' else 6])
        result.append({'scenario': scenario, 'active': p.get(0, 'B'), 'animation': p.get(0x50, 'I'),
                       'fragments': p.fragments[:], 'sounds': p.effects[:]})
    assert result[0]['active'] == 1 and result[0]['animation'] == 0
    assert not result[0]['fragments'] and not result[0]['sounds']
    assert all(len(r['fragments']) == 16 and not r['active'] for r in result[1:])
    return result


if __name__ == '__main__':
    for name, probe in [('victory-wave', waves), ('shop-purchase-clicks', purchases), ('ice-transitions', ice)]:
        data = probe()
        (ROOT / f'research/{name}.json').write_text(json.dumps({'binary_sha256': hashlib.sha256(IMAGE).hexdigest(),
                                                              'cases': data}, indent=2) + '\n')
        print(name, len(data), 'native cases verified')
