"""Recover original map captions, records and completion labels from bounded ARM draws."""
import hashlib
import json
import struct
from unicorn import UC_HOOK_CODE
from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_hiscores import ScoreProbe

MAP = SELF + 0x71000


class MapProbe(ScoreProbe):
    def import_hook(self, u, address, size, context):
        if META['imports'].get(address) == '___divsi3':
            a, b = [struct.unpack('<i', struct.pack('<I', u.reg_read(r)))[0] for r in REGS[:2]]
            u.reg_write(REGS[0], int(a/b) & 0xffffffff)
            self.ret(u)
            return
        if META['imports'].get(address) == '_sprintf' and self.string(u.reg_read(REGS[1])) == '%3.3i':
            result = f'{u.reg_read(REGS[2]):03d}'.encode()+b'\0'
            u.mem_write(u.reg_read(REGS[0]), result)
            u.reg_write(REGS[0], len(result)-1)
            self.ret(u)
            return
        super().import_hook(u, address, size, context)


def main():
    p = MapProbe()
    for address in [0x196cc, 0x1a304, 0x254f4, 0x25308, 0x24f80]:
        p.u.hook_add(UC_HOOK_CODE, lambda u, *args: p.ret(u), begin=address, end=address)
    p.call(0x19b60, [META['symbols']['_Player']])
    p.controls = []
    p.call(0x1ebbc, [MAP])
    controls = p.controls[:]
    for symbol, bindings in (
        ('_g_globalMap', {i+i//4: f'map_{i+1:02}.jpg' for i in range(12)}),
        ('_g_mapPoint', dict(enumerate(['point_capture.png', 'point_defending.png', 'point_open.png', 'point_fx.png']))),
        ('_g_mapPanel', {0: 'map_interface.png'}),
        ('_g_mapPanel2', {0: 'map_interface_up.png'}),
    ):
        for i, name in bindings.items():
            ptr = p.heap
            p.heap += 256
            p.surfaces[ptr] = name
            p.u.mem_write(META['symbols'][symbol] + i*4, struct.pack('<I', ptr))
    levels = json.loads((ROOT/'research/campaign-data.json').read_text())['levels']
    fixtures = []
    for selected, completed, record, current, panel in [(0, False, 0, 0, 0), (2, False, 5, 3, 0), (11, True, 25, 25, 0), (0, True, 8, 0, 17)] + [(0, True, n, n, 0) for n in [71999, 72000, 108000, 144000, 180000, 300000]]:
        p.u.mem_write(MAP, bytes(0x100))
        p.u.mem_write(MAP+0x28, struct.pack('<ff', -420, -180))
        p.u.mem_write(MAP+0x40, struct.pack('<f', panel))
        p.u.mem_write(META['symbols']['_Player']+0x234, struct.pack('<i', selected))
        for i, level in enumerate(levels):
            row = bytearray.fromhex(level['rawLevelData'])
            row[0xd4] = completed and i == selected
            row[0xd5] = i <= selected
            row[0xd6] = i == selected
            struct.pack_into('<f', row, 0xd8, 1)
            struct.pack_into('<2I', row, 0xe4, record if i == selected else 0, current if i == selected else 0)
            p.u.mem_write(META['symbols']['_LevelData'] + i*244, bytes(row))
        p.trace = []
        p.call(0x22e88, [MAP, f32(0)])
        fixtures.append({'selected': selected, 'completed': completed, 'record': record,
                         'current': current, 'panel': panel, 'draws': p.trace[:]})
    records = []
    player, land, base = [META['symbols'][name] for name in ['_Player', '_Land', '_LevelData']]
    for won, score, best, endless in [(False, 1234, 0, False), (False, 12, 1234, False), (True, 5678, 1234, False), (True, 99, 0, True)]:
        p.u.mem_write(player+0x88, bytes([endless]))
        p.u.mem_write(player+0x64, struct.pack('<I', score))
        p.u.mem_write(player+0x234, struct.pack('<I', 0))
        p.u.mem_write(land+0x2dc, bytes([won]))
        p.u.mem_write(base+0xd4, bytes(2))
        p.u.mem_write(base+0xf4+0xd5, bytes(1))
        p.u.mem_write(base+0xe4, struct.pack('<2I', 0, best))
        p.call(0x1995c, [player])
        records.append({'won': won, 'score': score, 'best': best, 'endless': endless,
                        'after': list(struct.unpack('<2I', p.u.mem_read(base+0xe4, 8))),
                        'completed': bool(p.u.mem_read(base+0xd4, 1)[0]),
                        'next_open': bool(p.u.mem_read(base+0xf4+0xd5, 1)[0])})
    hints = []
    for selected in range(12):
        p.u.mem_write(player+0x234, struct.pack('<I', selected))
        p.call(0x3499c, [MAP, 1])
        for _ in range(45): p.call(0x33d30, [MAP, f32(1/60)])
        p.trace = []
        p.call(0x345a8, [MAP, 0])
        hints.append({'selected': selected, 'draws': p.trace[:]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'controls': controls, 'fixtures': fixtures, 'records': records, 'hints': hints}
    (ROOT/'research/map-details.json').write_text(json.dumps(result, indent=2)+'\n')
    print('controls', json.dumps(controls))
    print('records', json.dumps(records))
    print('hints', json.dumps(hints))
    for fixture in fixtures:
        print(json.dumps({**{k:v for k,v in fixture.items() if k != 'draws'}, 'text': [d for d in fixture['draws'] if d['op']=='text']}))


if __name__ == '__main__':
    main()
