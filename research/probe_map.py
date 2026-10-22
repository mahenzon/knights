"""Bounded original map drawing: tiles, marker pivots, selection and camera limits."""
import json
import struct
from unicorn import UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_PC
from extract_enemies import META, ROOT, SELF, RETURN, f32
from probe_land import LandProbe

MAP = SELF + 0x30000


def main():
    p = LandProbe()
    p.u.hook_add(UC_HOOK_CODE, lambda u, a, s, c: p.ret(u), begin=0x196cc, end=0x196cc)
    p.u.hook_add(UC_HOOK_CODE, lambda u, a, s, c: u.reg_write(UC_ARM_REG_PC, RETURN), begin=0x235b0, end=0x235b0)
    for symbol, bindings in (
        ('_g_globalMap', {i+i//4: f'map_{i+1:02}.jpg' for i in range(12)}),
        ('_g_mapPoint', dict(enumerate(['point_capture.png', 'point_defending.png', 'point_open.png', 'point_fx.png']))),
        ('_g_mapPanel', {0: 'map_interface.png'}),
        ('_g_mapPanel2', {0: 'map_interface_up.png'}),
    ):
        for i, name in bindings.items():
            ptr = p.alloc; p.alloc += 256; p.surfaces[ptr] = name
            p.u.mem_write(META['symbols'][symbol] + i*4, struct.pack('<I', ptr))
    levels = json.loads((ROOT/'research/campaign-data.json').read_text())['levels']
    fixtures = []
    for completed, selected, camera in (([], 0, [-420, -180]), ([0], 1, [-488, -380]), ([0, 1], 2, [-540, -199])):
        p.u.mem_write(MAP, bytes(0x100))
        p.u.mem_write(MAP+0x28, struct.pack('<ff', *camera))
        for i, level in enumerate(levels):
            record = bytearray.fromhex(level['rawLevelData'])
            record[0xd4] = i in completed
            record[0xd5] = i == 0 or i-1 in completed
            record[0xd6] = i == selected
            struct.pack_into('<f', record, 0xd8, 1)
            p.u.mem_write(META['symbols']['_LevelData'] + i*244, bytes(record))
        p.trace = []
        p.call(0x22e88, [MAP, f32(0)])
        draws = p.trace[:]
        assert len(draws) == 27
        assert [v['image'] for v in draws[:12]] == [f'map_{i+1:02}.jpg' for i in range(12)]
        fixtures.append({'completed': completed, 'selected': selected, 'camera': camera, 'draws': draws})
    (ROOT/'research/map-data.json').write_text(json.dumps(fixtures, indent=2)+'\n')
    print('Native map: three progression states, 36 tiles, 36 markers, three selections and six panels captured.')


if __name__ == '__main__':
    main()
