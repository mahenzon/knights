"""Execute the IPA's soundtrack dispatcher silently; intercept only platform calls."""
import hashlib
import json
import struct

from extract_enemies import IMAGE, META, Probe, REGS, ROOT
from unicorn.arm_const import UC_ARM_REG_LR, UC_ARM_REG_PC


class MusicProbe(Probe):
    def __init__(self):
        self.events = []
        self.players = {}
        self.urls = {}
        super().__init__()

    def word(self, address):
        return struct.unpack('<I', self.u.mem_read(address, 4))[0]

    def string(self, address):
        return bytes(self.u.mem_read(address, 100)).split(b'\0')[0].decode()

    def cfstring(self, address):
        return self.string(self.word(address + 8))

    def import_hook(self, u, address, *args):
        name = META['imports'].get(address)
        if name == '_strcpy':
            return super().import_hook(u, address, *args)
        if name in ('__Unwind_SjLj_Register', '__Unwind_SjLj_Unregister'):
            pass
        elif name == '_objc_msgSend':
            receiver, selector, value, value2 = [u.reg_read(r) for r in REGS]
            method = self.string(selector)
            event = {'method': method, 'receiver': receiver, 'caller': hex(u.reg_read(UC_ARM_REG_LR)-4)}
            answer = receiver
            if method == 'mainBundle':
                answer = 0x1000100
            elif method == 'pathForResource:ofType:':
                event['resource'] = self.cfstring(value) + '.' + self.cfstring(value2)
                answer = 0x1001000 + 16 * len(self.urls)
                self.urls[answer] = event['resource']
            elif method == 'fileURLWithPath:':
                answer = value
            elif method == 'alloc':
                answer = 0x1002000 + 16 * len(self.players)
                self.players[answer] = {'playing': False}
            elif method == 'initWithContentsOfURL:error:':
                self.players[receiver]['file'] = self.urls[value]
                event['file'] = self.urls[value]
            elif method == 'isPlaying':
                answer = int(self.players[receiver]['playing'])
            elif method == 'play':
                self.players[receiver]['playing'] = True
                answer = 1
            elif method == 'stop':
                self.players[receiver]['playing'] = False
            elif method == 'release':
                self.players[receiver]['released'] = True
            elif method == 'setNumberOfLoops:':
                event['value'] = value
                self.players[receiver]['loops'] = value
            elif method == 'setVolume:':
                event['value'] = struct.unpack('<f', struct.pack('<I', value))[0]
                self.players[receiver]['volume'] = event['value']
            else:
                raise RuntimeError(f'Unexpected Objective-C call {method}')
            self.events.append(event)
            u.reg_write(REGS[0], answer)
        else:
            raise RuntimeError(f'Unexpected platform import {name}')
        u.reg_write(UC_ARM_REG_PC, u.reg_read(UC_ARM_REG_LR))

    def switch(self, request, muted=False, disabled=False):
        self.u.mem_write(META['symbols']['_g_muteMusic'], bytes([muted]))
        self.u.mem_write(META['symbols']['_g_disableAllSounds'], bytes([disabled]))
        self.events = []
        self.call(0x38164, [request])
        pointer = self.word(META['symbols']['_MusicPlayer'])
        return {'request': request, 'muted': muted, 'disabled': disabled,
                'current_track': self.word(META['symbols']['_currentTrack']),
                'player': pointer, 'state': self.players.get(pointer, {}).copy(),
                'events': self.events[:]}


def main():
    p = MusicProbe()
    initial_track = p.word(META['symbols']['_currentTrack'])
    initial_player = p.word(META['symbols']['_MusicPlayer'])
    assert initial_track == 0xffffffff and initial_player == 0
    defaults = {name: (struct.unpack('<f', p.u.mem_read(META['symbols'][name], 4))[0]
                      if 'Volume' in name else bool(p.u.mem_read(META['symbols'][name], 1)[0]))
                for name in ['_g_musicVolume', '_g_soundVolume', '_g_muteMusic',
                             '_g_muteSound', '_g_disableAllSounds']}
    cases = [p.switch(0), p.switch(0), p.switch(1), p.switch(1), p.switch(0),
             p.switch(10, muted=True), p.switch(0), p.switch(1), p.switch(0, disabled=True)]
    assert cases[0]['state']['file'] == 'knights_gameplay_02.mp3'
    assert cases[2]['state']['file'] == 'knights_gameplay_03.mp3'
    assert cases[0]['state']['loops'] == cases[2]['state']['loops'] == 100
    assert cases[1]['events'] == cases[3]['events'] == cases[6]['events'] == cases[8]['events'] == []
    assert cases[4]['player'] != cases[0]['player']
    assert [x['method'] for x in cases[2]['events']] == [
        'mainBundle', 'pathForResource:ofType:', 'isPlaying', 'stop', 'release',
        'alloc', 'fileURLWithPath:', 'initWithContentsOfURL:error:', 'setNumberOfLoops:', 'setVolume:', 'play']
    assert not cases[5]['state']['playing'] and not cases[6]['state']['playing']
    p.u.mem_write(META['symbols']['_g_disableAllSounds'], b'\0')
    pause = []
    for address in [0x1c934, 0x1ca54]:
        p.events = []
        p.call(address, [])
        pointer = p.word(META['symbols']['_MusicPlayer'])
        pause.append({'function': hex(address), 'events': p.events[:],
                      'player': pointer, 'state': p.players[pointer].copy()})
        assert not p.events and p.players[pointer]['playing']
    p.events = []
    p.u.mem_write(META['symbols']['_g_disableAllSounds'], b'\0')
    p.u.mem_write(META['symbols']['_g_musicVolume'], struct.pack('<f', .25))
    p.call(0x37b50, [])
    assert p.events[0]['method'] == 'setVolume:' and p.events[0]['value'] == .25
    muted_mode_changes = []
    for label, requests in [
        ('mute_stops_then_unmute_same_group', [(0, False), (10, True), (0, False)]),
        ('change_while_muted_then_return_old_group', [(0, False), (1, True), (0, False)]),
        ('change_while_muted_then_enter_new_group', [(0, False), (1, True), (1, False)]),
        ('muted_boot_then_unmute_game', [(0, True), (1, True), (1, False)]),
    ]:
        q = MusicProbe()
        steps = [q.switch(request, muted) for request, muted in requests]
        muted_mode_changes.append({'case': label, 'steps': steps})
    stopped, old, new, boot = [case['steps'] for case in muted_mode_changes]
    assert stopped[-1]['events'] == [] and not stopped[-1]['state']['playing']
    assert old[1]['player'] == old[2]['player'] == 0 and old[2]['events'] == []
    assert old[1]['current_track'] == 0
    assert [e['method'] for e in old[1]['events']] == [
        'mainBundle', 'pathForResource:ofType:', 'isPlaying', 'stop', 'release']
    assert new[-1]['state']['playing'] and new[-1]['state']['file'] == 'knights_gameplay_03.mp3'
    assert boot[0]['player'] == boot[1]['player'] == 0
    assert boot[0]['current_track'] == boot[1]['current_track'] == 0xffffffff
    assert boot[-1]['state']['playing'] and boot[-1]['state']['file'] == 'knights_gameplay_03.mp3'
    result = {'binary_sha256': hashlib.sha256(IMAGE).hexdigest(), 'initial_track': initial_track,
              'initial_player': initial_player,
              'defaults': defaults, 'cases': cases, 'pause_resume': pause, 'volume_update': p.events,
              'muted_mode_changes': muted_mode_changes,
              'scope': 'Original ARM SwitchSoundtrack and UpdateSoundtrackVolume run unchanged. '
                       'Objective-C methods intercepted and recorded; isPlaying modeled from play/stop. '
                       'No sound played, no OS decoder/mixer timing claimed.'}
    (ROOT / 'research/music-transitions.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Native music: 21 transitions, original pause/resume, both filenames, loops=100, group reset, mute edges and volume verified.')


if __name__ == '__main__':
    main()
