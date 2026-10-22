# Original soundtrack transitions

Verified 2026-10-16 against `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Primary sources: that ARM executable, `research/disassembly.txt`, its Objective-C
selector/CFString data, and the local Apple SDK header cited below.

Reproduce the silent execution evidence with
`.venv/bin/python research/probe_music_transitions.py` (Unicorn needs the approved
unsandboxed runner). `research/music-transitions.json` records21 dispatcher
transitions, original pause/resume execution, defaults, and a volume update.
No production or test files were changed by this research.

## Native behavior

| Fact | Primary source |
| --- | --- |
| Initial `_currentTrack` is signed `-1`; `_MusicPlayer` is zero. Music volume is `0.5`, sound volume `0.8`; music, sound, and global mute flags start false. | Executable data at `0xe23b8`, `0x12b0a8`, `0xe2380–0xe238a`; probe defaults. |
| Track request **0** selects **`knights_gameplay_02.mp3`**. | `SwitchSoundtrack` `0x381d0–0x3820c`; CFString `0xca378` points to `0xafb90`; native `pathForResource:ofType:` captured at `0x38204`. |
| Track request **1** selects **`knights_gameplay_03.mp3`**. | `0x38210–0x3824c`; CFString `0xca398` points to `0xafba8`; native resource call captured at `0x38248`. |
| Repeating the current request returns immediately, without even checking `isPlaying`. It neither restarts the track nor advances a playlist. | Equality guard `0x381bc–0x381cc`; consecutive `0,0` and `1,1` probe cases have zero Objective-C calls on the second request. |
| Switching between 0 and 1 checks `isPlaying`, stops when playing, releases the old player, allocates a new `AVAudioPlayer`, and initializes it with the new file URL. No position is saved or restored. Returning to a previous group creates another new player. | `0x38250–0x38348`; probe player identities and complete method sequence. Native code does not send `setCurrentTime:`. |
| Every newly created music player receives **`setNumberOfLoops:100`**, volume from `_g_musicVolume`, then `play`. | `0x38360–0x383bc`; selector `0xcf5b0 → 0xafbdc`; captured arguments. |
| This is **101 total plays of the same file**, not an infinite loop or a sequence of the three gameplay tracks. | Apple's `AVAudioPlayer.h` lines 92–97: zero plays once; one plays twice; negative loops indefinitely. Exact local source: `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/AVFAudio.framework/Headers/AVAudioPlayer.h`. The native code requests positive 100. |
| Plain Pause/Resume preserves the live player and sends no music method. | Original `InitPauseGame` `0x1c934–0x1ca2c` and `ResumeGamePress` `0x1ca54–0x1ca70` executed in the probe with the game player already playing; both retain it without Objective-C calls. |
| Volume changes immediately send the float to the current music player, unless globally disabled or no player exists. | `UpdateSoundtrackVolume` `0x37b50–0x37b94`; a probe update to `0.25` produces `setVolume:0.25`. |

`knights_mainmenu` and `knights_gameplay_01` do not occur anywhere in this executable;
`knights_gameplay_02` and `knights_gameplay_03` each occur once, in the above resource
strings. The complete `SwitchSoundtrack` has only resource cases 0 and 1. All 11
direct call sites are covered below. This establishes that the first two files are
unused by this build's game-owned soundtrack dispatcher; it does **not** establish
why the developers packaged them. There is no game-owned completion callback or
playlist advancement in this dispatcher, and it does not set an audio delegate.

## All direct switch call sites

| UI transition | Request and address | Consequence |
| --- | --- | --- |
| Main menu `mainMenu::InitMode` | 0 at `0x21f68` | Starts 02 on initial entry; repeated menu entry while already group0 continues it. |
| Map `mapMode::InitMode` | 0 at `0x1ec0c` | Menu → Play → map keeps group0. `PressPlayButton` `0x20324` has no switch. |
| Options `options::InitMode` | 0 at `0x20208` | Entering from a battle replaces 03 with fresh 02. Entering from menu keeps 02. |
| Ordinary gameplay `normalGame::InitMode` | 1 at `0x20e30` | A new battle after result/shop/map switches from0 to a fresh03. Calling the mode initializer again while group1 cannot itself restart music because the dispatcher returns early. |
| Result/interlevel `interLevel::InitMode` | 0 at `0x2046c` | Replaces03 with fresh02. Victory/defeat flag alone remains inside `normalGame::Draw`; music switches only at the actual mode transition. |
| Shop `shop::InitMode` | 0 at `0x32d78` | Result → shop → result keeps the same02 player and playback position. |
| Options Done `ResumeOptions` | 10 at `0x20260` when muted, otherwise0 at `0x2026c`; additionally1 at `0x20294` when returning to battle | Unmuted Options → battle replaces02 with fresh03; Options → main menu keeps02. |
| Options touch `options::StylusDown` | 10 at `0x24b54` when muted, otherwise0 at `0x24b60` | Request10 is stop-only. Slider uses `UpdateSoundtrackVolume` at `0x24a3c`. |

The extra result/shop time therefore does **not** pause a saved battle-song position:
each next day starts 03 again. Music continues through a plain foreground pause,
whereas visiting Options changes the song and returning to battle restarts 03.
User-requested suspension in the background remains a separate modern requirement.

## Mute edge case in the executable

`SwitchSoundtrack(10)` stops a playing player and returns at `0x38294–0x3829c`
without changing `_currentTrack` or releasing the player. The `_g_muteMusic` guard
at `0x382d0–0x382e4` suppresses new player creation for normal track changes.
The global disable flag returns even earlier at `0x381a8–0x381b8`.

The native sequence `0 → 10 (mute) → 0 (unmute)` produces no final `play` call:
the old track-id equality guard wins and leaves the player stopped. This is a
confirmed game-owned mute/unmute defect, not a browser cache problem. The current
web implementation intentionally resumes on unmute, which meets the user's
explicit working-audio requirement; do not copy this native defect accidentally.

Changing groups while muted still resolves the resource path, stops/releases any
old player, and then skips creating the new player; `_currentTrack` remains the
old ID. Thus `0 → 1 (muted) → 0 (unmuted)` remains silent with no player, whereas
`0 → 1 (muted) → 1 (unmuted)` creates03 successfully. Starting muted leaves the
initial ID at `-1`, so later entering either normal group unmuted can start it.
The fixture's `muted_mode_changes` contains these four complete sequences.
Muting is implemented with **stop**, not pause or volume0. Volume changes do not
restart the player. These are dispatcher semantics; the web should preserve
reliable unmute behavior rather than reproduce the stale-ID defect.

## Confirmed web discrepancies at inspection

1. `web/audio.mts` uses `knights_mainmenu.mp3` for menu and advances
   `01 → 02 → 03` for battle. The native mapping is02/menu and03/battle only.
2. `Soundtrack.positions` restores each group's prior time. Native group changes
   create a new player at the beginning. Same-group playback should continue.
3. Web menu loops indefinitely and battle advances tracks indefinitely. Native
   requests100 repeats,101 plays of the selected file.
4. `web/game.mjs::pause()` calls `stopAudio()`, stopping the soundtrack during an
   ordinary foreground pause. Native pause leaves it playing. Background pause
   should still fully stop audio as the user specifically requested.

The web result/shop/options group selection already matches the native call-site
mapping. Loading music before artwork is ready is also explicitly user-requested;
no original loading-delay claim is made. The constructor's temporary0.35 volume is
overwritten by `applyMusicSettings` before playing; assess the stored setting,
not that constructor value alone.

## Limits

Objective-C calls were intercepted, not played. `isPlaying` in the harness reflects
the captured `play`/`stop` sequence; this proves game-owned requests, not historical
iOS scheduling, loop-boundary gaplessness, interruptions, or audible crackling.
The local current Apple header establishes documented loop-count semantics; an
original iOS device has not been left playing for101 loops. No real phone audio
quality was checked, and no production changes were made here.
