"""Bounded native renderScene -> virtual mode Draw clock and visual-phase audit."""
import hashlib
import json
import struct

from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM
from capstone.arm import ARM_REG_PC, ARM_OP_MEM
from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC

from extract_enemies import IMAGE, META, ROOT, SELF, REGS, f32
from probe_animation_map import AnimationMapProbe, MAP
from probe_land import LandProbe, LAND
from probe_scene import unf
from probe_sacrifices import ART
from probe_weapons import CREEP, DRAG, MISSILE
from probe_world_scene import WorldSceneProbe
from probe_session_random import SessionProbe, PLAYER, WAVE, SKIP

CLOCK = META['symbols']['_g_timef']
DELEGATE = SELF + 0x79000
NORMAL = SELF + 0x7a000
DT = unf(f32(1 / 60))


class AppClockMixin:
    def __init__(self):
        self.host_time = 1000.
        self.clock_access = []
        self.mode_calls = []
        self.phase_dt = []
        self.record_clock = False
        super().__init__()
        self.u.hook_add(UC_HOOK_MEM_READ | UC_HOOK_MEM_WRITE, self.clock_hook,
                        begin=CLOCK, end=CLOCK + 3)
        for at in (0x20728, 0x22e88, 0x21aec):
            self.u.hook_add(UC_HOOK_CODE, self.mode_hook, begin=at, end=at)
        self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=0x683c, end=0x683c)
        self.u.mem_write(0xe1d68, b'\1')  # App/Display already initialized by harness.
        self.u.mem_write(META['symbols']['_lastTime'], struct.pack('<d', self.host_time))
        self.u.mem_write(DELEGATE, bytes(0x100))
        self.u.mem_write(META['symbols']['_g_paused'], b'\0')

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        if name == '_CFAbsoluteTimeGetCurrent':
            lo, hi = struct.unpack('<2I', struct.pack('<d', self.host_time))
            u.reg_write(REGS[0], lo)
            u.reg_write(REGS[1], hi)
            self.ret(u)
            return
        if name == '_objc_msgSend' and u.reg_read(UC_ARM_REG_LR) == 0x52e8:
            self.ret(u)  # Present framebuffer, outside game timing.
            return
        super().import_hook(u, address, *args)

    def clock_hook(self, u, access, address, size, value, context):
        if self.record_clock:
            from unicorn import UC_MEM_WRITE
            self.clock_access.append({'pc': hex(u.reg_read(UC_ARM_REG_PC)),
                                      'op': 'write' if access == UC_MEM_WRITE else 'read',
                                      'value': unf(value) if access == UC_MEM_WRITE else self.clock()})

    def mode_hook(self, u, at, *args):
        if self.record_clock:
            self.mode_calls.append({'pc': hex(at), 'dt': unf(u.reg_read(REGS[1])),
                                    'clock': self.clock(), 'caller': hex(u.reg_read(UC_ARM_REG_LR) - 4)})

    def clock(self):
        return struct.unpack('<f', self.u.mem_read(CLOCK, 4))[0]

    def select_mode(self, name, ptr):
        self.u.mem_write(ptr, struct.pack('<I', META['symbols']['__ZTV' + name] + 8))
        self.u.mem_write(META['symbols']['_GameModes'], struct.pack('<I', ptr))
        self.u.mem_write(META['symbols']['_g_currentMode'], bytes(4))

    def render_app(self, elapsed, paused=False):
        self.host_time += elapsed
        self.u.mem_write(META['symbols']['_g_paused'], bytes([paused]))
        self.clock_access = []
        self.mode_calls = []
        self.phase_dt = []
        self.record_clock = True
        self.call(0x51bc, [DELEGATE, 0])
        self.record_clock = False
        assert len(self.mode_calls) == 1, self.mode_calls
        return {'clock': self.clock(), 'accesses': self.clock_access[:],
                'mode': self.mode_calls[0], 'phase_dt': self.phase_dt[:]}


class ClockWorld(AppClockMixin, WorldSceneProbe):
    def __init__(self):
        super().__init__()
        # End flag/result UI are outside this clock investigation. normalGame::Draw
        # and its complete world-loop call remain live, including its own fade timer.
        for at in (0x1e6c8, 0x1e2fc):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=at, end=at)

    def phase(self, u, address, *args):
        if self.record_clock:
            if address in (0x19104, 0x303a8):
                self.phase_dt.append({'pc': hex(address), 'dt': unf(u.reg_read(REGS[1]))})
            elif address in (0x3010c, 0x1c310, 0x28b38, 0x2c604):
                self.phase_dt.append({'pc': hex(address), 'dt': unf(u.reg_read(REGS[0]))})
        super().phase(u, address, *args)

    def setup_clock_world(self, start=0):
        self.reset()
        self.u.mem_write(ART, bytes(25 * 0x98))
        self.u.mem_write(MISSILE, bytes(100 * 500))
        self.u.mem_write(META['symbols']['_Smokes'], bytes(50 * 44))
        self.u.mem_write(META['symbols']['_Fragments'], bytes(150 * 56))
        self.call(0x19b60, [META['symbols']['_Player']])
        for off in (0x64, 0x80, 0x84):
            self.u.mem_write(META['symbols']['_Player'] + off, bytes(4))
        self.call(0x17020, [0])
        LandProbe.init_land(self, 30)
        self.put_land(0x2dc, 0, 'B')
        self.put_land(0x28c, 100000)
        self.call(0x2ce80, [ART, 408, 150, 5], [1])
        self.u.mem_write(ART + 0x28, struct.pack('<f', 31))
        self.init(0)
        self.put(8, 180)
        self.put(12, 244)
        self.put(0xe0, 99)
        self.u.mem_write(CREEP, bytes(self.u.mem_read(SELF, 256)))
        self.call(0x29bb0, [DRAG, 260, 100, 2], [1])
        self.u.mem_write(DRAG + 3, b'\1')  # Held fireball remains visible for full capture.
        self.u.mem_write(DRAG + 0x30, struct.pack('<2f', 260, 100))
        self.call(0x1ab18, [MISSILE, 100, 100, 0], [0, 0, 0, f32(20), 0, 1, 0])
        self.u.mem_write(META['symbols']['_g_trembling'], bytes(4))
        self.u.mem_write(CLOCK, struct.pack('<f', start))
        self.u.mem_write(NORMAL, bytes(0x100))
        self.select_mode('10normalGame', NORMAL)

    def snapshot(self):
        fields = {'clock': self.clock(), 'land': LandProbe.state(self),
                  'actor': self.actor_state(0), 'objects': self.objects(),
                  'missiles': self.missiles(), 'device': self.gun_state()}
        # Compare complete simulation pools too, including timers not projected above.
        fields['simulation_sha256'] = hashlib.sha256(b''.join(bytes(self.u.mem_read(at, size))
            for at, size in ((LAND, 0x300), (CREEP, 200*256), (DRAG, 30*116),
                             (ART, 25*0x98), (MISSILE, 100*500)))).hexdigest()
        return fields

    def clear_frame(self):
        self.commands = []; self.emissions = []; self.actor_draws = []
        self.smokes = []; self.fragments = []; self.phases = []; self.trace = []


def static_references(p):
    md = Cs(CS_ARCH_ARM, CS_MODE_ARM)
    md.detail = True
    md.skipdata = True
    result = []
    for i in md.disasm(bytes(p.u.mem_read(0x2000, 0xa8000)), 0x2000):
        if not i.id or not i.mnemonic.startswith('ldr') or len(i.operands) < 2:
            continue
        source = i.operands[1]
        if source.type != ARM_OP_MEM or source.mem.base != ARM_REG_PC:
            continue
        literal = i.address + 8 + source.mem.disp
        if not 0x1000 <= literal < 0x200000:
            continue
        value = struct.unpack('<I', p.u.mem_read(literal, 4))[0]
        if value in (0xc73c8, CLOCK):
            result.append({'pc': hex(i.address), 'literal': hex(literal), 'value': hex(value)})
    return result


def battle_case(start=0):
    outer, inner = ClockWorld(), ClockWorld()
    outer.setup_clock_world(start)
    inner.setup_clock_world(start)
    frames = []
    for frame in range(1, 91):
        paused = 31 <= frame <= 36
        host_elapsed = .5 if frame == 50 else 1/60
        dt = 0. if paused else unf(f32(min(.05, host_elapsed)))
        outer.clear_frame(); inner.clear_frame()
        clock_row = outer.render_app(host_elapsed, paused)
        # Mirror the same delta passed by real renderScene, excluding only its clock write.
        dt = clock_row['mode']['dt']
        inner.u.mem_write(META['symbols']['_g_paused'], bytes([paused]))
        inner.call(0x20728, [NORMAL, f32(dt)])
        a, b = outer.snapshot(), inner.snapshot()
        assert {k:v for k,v in a.items() if k != 'clock'} == {k:v for k,v in b.items() if k != 'clock'}, frame
        assert all(p['dt'] == dt for p in clock_row['phase_dt']), clock_row
        writes = [e for e in clock_row['accesses'] if e['op'] == 'write']
        assert [e['pc'] for e in writes] == ['0x5264', '0x6edc']
        expected = unf(f32(unf(f32((frames[-1]['outer']['clock'] if frames else start) + dt)) + dt))
        assert a['clock'] == expected, (a['clock'], expected)
        assert (dt == 0.) == paused
        if frame == 50: assert dt == unf(f32(.05))
        frames.append({'frame':frame, 'host_elapsed':host_elapsed, 'paused':paused,
                       'app':clock_row, 'outer':a, 'inner':b,
                       'outer_draws':outer.commands[:], 'inner_draws':inner.commands[:],
                       'drawing_differs':outer.commands != inner.commands})
    assert any(r['drawing_differs'] for r in frames)
    return {'start':start, 'frames':frames}


class ClockMap(AppClockMixin, AnimationMapProbe):
    pass


def map_case():
    p = ClockMap()
    p.call(0x19b60, [META['symbols']['_Player']])
    p.u.mem_write(MAP, bytes(0x100))
    p.u.mem_write(CLOCK, struct.pack('<f', 17.25))
    init = []
    for name, fn in [('map_init', 0x1ebbc), ('map_reinit', 0x1ebbc)]:
        before = p.clock()
        p.call(fn, [MAP])
        init.append({'name':name, 'before':before, 'after':p.clock()})
        assert before == p.clock()
    p.select_mode('7mapMode', MAP)
    rows=[]
    for frame in range(1, 31):
        p.trace=[]
        before=p.clock()
        row=p.render_app(1/60, 11<=frame<=13)
        assert [e['pc'] for e in row['accesses'] if e['op']=='write']==['0x5264']
        assert p.clock()==unf(f32(before+row['mode']['dt']))
        rows.append({'frame':frame,**row,'draws':p.trace[:]})
    return {'initializers':init,'frames':rows}


class ClockSession(AppClockMixin, SessionProbe):
    snapshot = ClockWorld.snapshot
    clear_frame = ClockWorld.clear_frame

    def __init__(self):
        super().__init__()
        for at in (0x1e6c8, 0x1e2fc, 0x7b98):
            self.u.hook_add(UC_HOOK_CODE, lambda u, *args: self.ret(u), begin=at, end=at)


def initialization_case():
    p = ClockSession()
    p.stream = None
    p.clean()
    p.u.mem_write(PLAYER + 0x184, bytes(80))
    p.u.mem_write(WAVE, bytes(0x50))
    p.u.mem_write(SKIP, bytes(4))
    p.u.mem_write(PLAYER + 0x234, bytes(4))
    p.u.mem_write(PLAYER + 0x88, bytes(2))
    p.u.mem_write(p.get_at(0xc7574, 0, 'I'), b'\1')
    p.stream = 73
    p.u.mem_write(CLOCK, struct.pack('<f', 17.25))
    p.select_mode('10normalGame', NORMAL)
    days = []
    for day in (1, 2, 3):
        before = p.clock()
        p.clock_access = []
        p.record_clock = True
        p.call(0x20e1c, [NORMAL])
        p.record_clock = False
        assert p.clock() == before and not p.clock_access, p.clock_access
        initial = {'clock_before':before, 'clock_after':p.clock(),
                   'day':p.get_at(PLAYER, 0x130, 'I'), 'land':LandProbe.state(p),
                   'wave':p.wave()}
        assert initial['day'] == day and initial['land']['elapsed'] == 0
        frames = []
        for frame in range(1, 31):
            p.clear_frame()
            clock_row = p.render_app(1/60)
            frames.append({'frame':frame, 'app':clock_row, 'land':LandProbe.state(p),
                           'wave':p.wave(), 'actors':[p.actor_state(i) for i in range(200)
                                    if p.get_at(CREEP+i*256,0,'B')]})
        days.append({'initial':initial, 'frames':frames})
    return {'days':days,
            'scope':'Original normalGame::InitMode/SetupNewLevel, real wave generation and real renderScene dispatch. '
                    'Next-day transition is requested early by harness after30frames; does not claim completed days.'}


def mode_switch_case():
    p = ClockMap()
    main = NORMAL
    p.call(0x19b60, [META['symbols']['_Player']])
    p.u.mem_write(main, bytes(0x100))
    p.u.mem_write(MAP, bytes(0x100))
    for ptr, name in ((main, '8mainMenu'), (MAP, '7mapMode')):
        p.u.mem_write(ptr, struct.pack('<I', META['symbols']['__ZTV'+name]+8))
    p.u.mem_write(META['symbols']['_GameModes'], struct.pack('<2I', main, MAP))
    p.u.mem_write(META['symbols']['_g_currentMode'], bytes(4))
    p.u.mem_write(CLOCK, struct.pack('<f', 23.5))
    p.call(0x21f50, [main])
    assert p.clock() == 23.5
    stages = []
    for mode in (0, 1, 0):
        before = p.clock()
        p.clock_access = []
        p.record_clock = True
        p.call(0x1d780, [mode])
        p.record_clock = False
        assert p.clock() == before and not p.clock_access
        frames = []
        for frame in range(1, 13):
            before_frame = p.clock()
            row = p.render_app(1/60)
            assert p.clock() == unf(f32(before_frame + row['mode']['dt']))
            assert [e['pc'] for e in row['accesses'] if e['op']=='write'] == ['0x5264']
            frames.append({'frame':frame, **row})
        stages.append({'mode':mode, 'clock_before_switch':before, 'frames':frames})
    return {'stages':stages, 'scope':'Real SwitchMode -> virtual DeInit/Init, mainMenu/mapMode, then real renderScene virtual Draw.'}


def main():
    battle = [battle_case(0), battle_case(17.25)]
    maps = map_case()
    initializers = initialization_case()
    switches = mode_switch_case()
    p = ClockWorld()
    result = {'binary_sha256':hashlib.sha256(IMAGE).hexdigest(), 'static_clock_references':static_references(p),
              'battle':battle,'map':maps,'initializers':initializers,'switches':switches,
              'scope':'Real renderScene with CFAbsoluteTimeGetCurrent supplied, original vtable dispatch into normalGame::Draw/mapMode::Draw. '
                      'Battle world phases execute as world-scene probe (wave/HUD/legacy generic pools intercepted); end-flag/result UI intercepted. '
                      'OS framebuffer presentation/accelerometer overlay intercepted; no audio playback, no GPU rasterization. '
                      'Inner-only paired normalGame::Draw receives identical native delta; full simulation pools must match exactly.'}
    (ROOT/'research/app-clock.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print('battle frames',sum(len(c['frames']) for c in battle),'map frames',len(maps['frames']))
    print('real initialization frames',sum(len(d['frames']) for d in initializers['days']),'mode-switch frames',sum(len(s['frames']) for s in switches['stages']))
    print('visual differences',[sum(r['drawing_differs'] for r in c['frames']) for c in battle])
    print('clock references',result['static_clock_references'])


if __name__=='__main__': main()
