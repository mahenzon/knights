"""Execute PlaySound's dispatch without playing audio or emulating the OS mixer."""
import hashlib
import json
from extract_enemies import IMAGE, META, REGS, ROOT
from probe_scene import SceneProbe


class SoundProbe(SceneProbe):
    def __init__(self):
        self.dispatched = []
        super().__init__()

    def effect_hook(self, u, address, *args):
        if address == 0x37ba8:
            return
        super().effect_hook(u, address, *args)

    def import_hook(self, u, address, *args):
        if META['imports'].get(address) == '_AudioServicesPlaySystemSound':
            token = u.reg_read(REGS[0])
            self.dispatched.append(self.loads[token] + '.wav')
            self.ret(u)
            return
        super().import_hook(u, address, *args)


def main():
    p = SoundProbe()
    table = p.sound_table()
    assert bytes(p.u.mem_read(META['symbols']['_allSounds'], 30 * 30 * 4)) == bytes(30 * 30 * 4)
    cases = []
    for disabled, requests in [(False, [(1, 0), (1, 0), (1, 1), (1, 0)]),
                               (True, [(1, 0), (1, 1)]), (False, [(1, 0)])]:
        p.u.mem_write(META['symbols']['_g_disableAllSounds'], bytes([disabled]))
        p.dispatched = []
        for event, kind in requests:
            p.call(0x37ba8, [event, kind])
        expected = [] if disabled else [table['creeps'][event][kind] for event, kind in requests]
        assert p.dispatched == expected
        cases.append({'disabled': disabled, 'requests': requests, 'os_calls': p.dispatched[:]})
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'cases': cases,
              'scope': 'Native LoadAllSounds table binding and PlaySound dispatch; system audio call intercepted. '
                       'No game-side duplicate coalescing. All AVAudioPlayer effect slots remain empty. '
                       'Does not establish historical OS interruption/queuing/mixing semantics.'}
    (ROOT / 'research/sound-dispatch.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Native sound dispatch: repeated/distinct requests preserve order; global disable/resume pass.')


if __name__ == '__main__':
    main()
