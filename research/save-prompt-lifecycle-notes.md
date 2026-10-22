# Saved-game prompt persistence across restart

Primary source: `Knights` (local original executable), SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Reproducer: [`probe_save_prompt_lifecycle.py`](probe_save_prompt_lifecycle.py).
Executed evidence: `save-prompt-lifecycle.json` (local capture).

## Finding

**An unanswered saved-game prompt can permanently consume the original offer.**
Campaign writes that consumption immediately. Endless Siege and Madness clear
the flag in memory immediately but defer writing it until a later options save,
including ordinary application termination. Explicit NO makes no additional
save; it closes the dialog and leaves the same persistence distinction.

The earlier [`save-lifecycle-notes.md`](save-lifecycle-notes.md) and
`save-roundtrip.json` (local capture) execute the in-process consumption
and intercept SaveOptions. They alone do not prove cold-runtime persistence.
This follow-up executes the actual SaveOptions and LoadOptions instructions,
including every fread/fwrite, in twelve cases. Each restart uses a new Unicorn
instance with a new image and initialized memory, carrying over only the
mocked persisted file bytes.

| Selected mode | Prompt left open, restart without termination callback | NO, restart without termination callback | Prompt open or NO, actual termination callback then restart |
| --- | --- | --- | --- |
| Campaign | No new offer | No new offer | No new offer |
| Endless Siege | Offer returns | Offer returns | No new offer |
| Madness | Offer returns | Offer returns | No new offer |

“Without termination callback” means no further options-saving action between
the chooser/NO and destroying the runtime. It models abrupt process loss; it
does not claim that a particular original iOS Home-button action had that
behavior. Each case starts with all three availability flags set. The other
two modes' flags remain available throughout.

## Exact native path

- Campaign's `GoCampaignGame` at `0x1d838` routes to map mode 10. Actual
  `mapMode::InitMode` at `0x1ebbc` opens dialog 4 at `0x1ec9c`, clears
  `_g_gameSavedCampaign` at `0x1ecac`, and calls SaveOptions at `0x1ecb8`.
  These finish before the caller returns with the prompt ready to draw.
  See `map-menu-disassembly.txt` (local capture),
  `0x1ec78–0x1ecb8`, and each Campaign case's `calls`/`io`.
- `GoEndlessGame` at `0x1eb64` clears `_g_gameSavedEndless` at `0x1eb98`
  before opening dialog 4 at `0x1eba0`. `GoMadnessGame` at `0x1eb0c`
  clears `_g_gameSavedMadness` at `0x1eb40` before opening it at `0x1eb48`.
  Both return without calling SaveOptions. The executed fixtures have no file
  writes for either chooser. See `disassembly.txt` (local capture), those
  functions, and `after_open`/`io`.
- Actual dialog Down/Up on NO invokes `KillDialogs` at `0x33d9c`
  (called “ClearHelpDialogs” descriptively in the earlier note).
  It closes the dialog, does not call SaveOptions, and makes no further change
  to the three flags or persisted file. `after_answer == after_open` is
  asserted for every case, including full file hash. See `answer: "no"`.
- Actual `applicationWillTerminate:` at `0x4508` clears the selected mode's
  flag, skips SaveGame because map/main-menu modes are ineligible, then calls
  SaveOptions at `0x461c`. The probe fails if any SaveGame call occurs here;
  none did. See `shutdown: "terminate_callback"` and native
  `0x4508–0x4620` in `disassembly.txt` (local capture).
- Native `InitGame` initializes Player and then calls LoadOptions at
  `0x73fc`; see `initgame-disassembly.txt` (local capture),
  `0x73f8–0x73fc`. The fresh fixture initializes a new runtime, invokes this
  actual LoadOptions routine directly, verifies its success result and flags,
  then executes the mode chooser again to establish whether the offer returns.

## Serialized flags, rather than dialog state

SaveOptions (`0x254f4`) writes **32,149 bytes** to `options.cfg`. The actual
native filename comes from its Objective-C format argument. Availability is
three one-byte fields:

| Field | File offset | Native fwrite call site | Native fread call site |
| --- | ---: | --- | --- |
| `_g_gameSavedCampaign` | 7906 | `0x2565c` | `0x24ecc` |
| `_g_gameSavedEndless` | 7907 | `0x25674` | `0x24ee4` |
| `_g_gameSavedMadness` | 7908 | `0x2568c` | `0x24efc` |

The file also contains version, Player, LevelData, sound/music settings, and
high scores. `baseline_io` records every serialized block. There is no
HelpDialogs block and no serialized pending-YES/NO decision. Actual
LoadOptions (`0x24d3c`) reads these flags back; the fresh fixture observes the
expected difference between persisted and merely in-memory consumption.

The separately stored `recent1.sav` / `recent2.sav` / `recent3.sav` payloads
are not deleted by these prompt/NO/termination paths. This audit establishes
availability, not loading those battle payloads; that round trip is covered
by the earlier save audit.

## Implication for the browser

Writing `available:false` before YES/NO is supported by native Campaign
behavior, and by all three modes after orderly termination. Losing the next
offer after a reload while Campaign's prompt is open is therefore **not, by
itself, a fidelity defect**. Browser immediate persistence for Endless/Madness
is stricter than their native abrupt-loss path, although it matches their
normal termination result.

For the current browser lifecycle, reload/pagehide is treated as graceful
close. The executed native cases support preserving the current consumed-offer
behavior under that mapping. No production change is proposed by this audit.
The abrupt Endless/Madness process-loss difference above remains explicit;
there is no native pending-prompt serialization in the inspected file.

## Limits and verification

The original app delegate's available application methods in
`macho.json` (local capture) are `applicationDidReceiveMemoryWarning:`,
`applicationWillTerminate:`, and `applicationDidFinishLaunching:`. No native
`applicationDidEnterBackground:` or `applicationWillResignActive:` override
appears for this app delegate. OpenFeint has its own active/resign-active class
methods; these are not the game's save lifecycle.

This is a native-instruction persistence test with fresh emulated runtimes,
**not a physical original-iOS shutdown test or a complete UIKit boot**.
It does not prove which lifecycle callback a specific OS version or TouchHLE
delivers on backgrounding, forced termination, crash, or emulator closure.
Full launch, outgoing mode teardown, graphics/audio, extra progress files,
Objective-C filesystem/path APIs, and OS file operations are intercepted.
It does not simulate interrupted/partial file writes. No real user save,
TouchHLE save, browser storage, production file, or test was modified.

Completed successfully:

```sh
.venv/bin/python research/probe_save_prompt_lifecycle.py
.venv/bin/python -m py_compile research/probe_save_prompt_lifecycle.py
```

The first command verifies 3 modes × 2 prompt decisions × 2 termination paths,
including serialized offsets, fresh LoadOptions success, the subsequent real
chooser outcome, unchanged other-mode flags, and absence of battle-file writes.
