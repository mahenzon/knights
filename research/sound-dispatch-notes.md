# Original sound dispatch: confirmed and unresolved

`probe_sound_dispatch.py` executes native `LoadAllSounds` and `PlaySound` with
audio creation/playback intercepted. `sound-dispatch.json` records repeat,
distinct, globally disabled and re-enabled requests. No audio is played.

- `PlaySound` at0x37ba8 reads `_g_disableAllSounds` via0xc7590→0xe238a.
- Its first table is `_allSounds`; a nonzero slot receives Objective-C `play`
  (selector0xcf5a8→0xafbc8). After original `LoadAllSounds`, all900 slots in
  this table remain zero in the fixture.
- Its populated `_allSounds2` table uses `event*30+subtype` and calls
  `AudioServicesPlaySystemSound` at0xaa0c4 once per request. Repeated requests
  are neither deduplicated nor reordered by game code.
- The former port's `web/game.mjs::tick` grouped actor sounds by five action
  masks, then weapon-bit order, then general event bits. That lost same-frame
  duplicates and cross-category call order. The16October follow-up replaces
  this path with the ordered native-key event stream. `sound()` still creates
  an independent Web Audio source per request and currently allows overlap.

Apple's [archived Multimedia Programming Guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/MultimediaPG/UsingAudio/UsingAudio.html),
“Playing UI Sound Effects or Invoking Vibration Using System Sound Services”,
describes immediate, single-sound playback. The same restriction appears in
the [current API reference](https://developer.apple.com/documentation/AudioToolbox/AudioServicesPlaySystemSound%28_%3A%29).
The archive states that it was not updated specifically for iOS4.0, making it
relevant to this game's era. Neither source establishes the exact policy for
repeated calls arriving before a previous sound ends: interruption versus
rejection, same versus different system-sound IDs, or driver timing.

Do not assume unrestricted browser mixing reproduces that OS behavior.
Native event order/multiplicity is now compared in the chain, throw, enemy,
gun, drag-object and sacrifice tests (throw/enemy comparisons exclude the
projectile phase intercepted by those probes). The browser also preserves
request order across out-of-order decoding and cancels background generations.
Native evidence fixes frozen-landing order (ice shatter before actor crash,
0x287cc→0x287d8) and dropped-barrel death (gun impact after nested callbacks,
0x2aaec), without changing simulation state or snapshot20.

The [touchHLE0.3.0 implementation](https://github.com/touchHLE/touchHLE/blob/v0.3.0/src/frameworks/audio_toolbox/audio_services.rs)
was read directly and saved as `touchhle-audio-services.rs` for reference.
It allocates one OpenAL source per SystemSoundID and calls SourcePlay on that
same source for each request. It has no global one-source gate. This explains
why the emulator is not an independent proof of original iPhone OS overlap
semantics. No code from that implementation is used in the port.

Remaining: establish historical interruption/rejection/mixing behavior before
claiming audible1:1 parity. Browser event-order tests do not establish that.

## Complete downloads before battle — 16 October 2026

`newDay` and `resumeSaved` now await all49 decoded effects and the complete
three-track gameplay playlist before entering battle. The ordinary Play tap
still authorizes the shared media element synchronously. Downloads start in
the menu background; failures keep the player out of battle and offer Retry.
Compressed OST Blob URLs avoid keeping minutes of decoded PCM in RAM. Muted
development bypasses audio initialization/loading without changing preferences.
The loading subtitle identifies audio preparation after artwork is complete.

`tests/audio_ready.mjs` failed against the previous newDay behavior, which
initialized and started play while its audio promise was unresolved. It now
checks waiting, retry, all requested effects and the mute bypass. Soundtrack
tests cover complete playlist downloads, retry/deduplication, local sources,
stream-to-Blob position preservation and background completion.

`audio_readiness_qa.py` is a local-only silent browser server. It holds the
throw WAV and third gameplay MP3 until `audio-download-release` exists. Battle
remained loading while withheld; after release its trace showed49 effects,
three tracks, running context, playing Blob source and readyState4. Final
browser tracing also exercised an actual knight pickup/throw: both
`knightlite_scary.wav` and `knightlite_fly.wav` reached BufferSource.start with
decoded durations0.4997s and0.5840s. Gameplay music advanced, and pause/options/
Done clicks played without console errors. Output gain was zero and the media
element muted. This proves dispatch/readiness, not audible phone quality.
Receipts: `artifacts/audio-readiness-browser.json`, `audio-final-browser.json`.

Crackle investigation compared packaged WAVs to the exact IPA members:

| Sample | PCM observations | SHA256 |
| --- | --- | --- |
| menu_click_button.wav | mono16-bit44100Hz,4480frames; first0,last−5,peak15149,mean−0.05 | d52663dce2eb8a9a04f6fe6898d93904dfa3ddc54cb843dda7cbe1d31aa534ef |
| menu_buble_open.wav | mono16-bit44100Hz,12128frames; first0,last55,peak14886,mean3.73 | 967b3b996b46d42f8d01dce99cb1a50698fe916a29a55e96563588cffb0b46f6 |

Both WAVs and knightlite_fly.wav are byte-identical to the IPA. The UI samples
contain sharp transients but no gross boundary discontinuity/DC/clipping.
This does not establish the reported crackle's cause. One implementation
problem was confirmed: suspension froze live source tails mid-waveform. Each
source now has a unity-gain output, fades over5ms only when interrupted, stops,
and disconnects. Suspension follows the last ending source. Uninterrupted
original PCM is unchanged. The sound-dispatch test covers stop scheduling,
pending decode cancellation and late background resumes. An audible S24 Ultra
check is still required before declaring the crackle resolved.
