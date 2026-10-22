# Native save, resume, and terminal lifecycle

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
The earlier `probe_save_lifecycle.py` / `save-lifecycle.json` already executes
30 shutdown-eligibility cases and three result-Done routes. This follow-up
adds `probe_save_roundtrip.py` / `save-roundtrip.json`, with six native
save/resume cases, nine eligibility edges, three NO sequences, and three
Abort callbacks. Both research probes leave real user saves untouched.

## Native files and saved state

| Native routine | Executed fact |
| --- | --- |
| `SaveGame(char*)`, `0x2516c` | Writes 59,868 bytes through seven `fwrite` calls. |
| `LoadGame(char*)`, `0x24b80` | Checks the four-byte version, then reads the same six state blocks. |
| `GoLoadGame`, `0x354f8` | Loads the selected mode's file, initializes battle mode, then loads the file again. |
| `applicationWillTerminate`, `0x4508` | Saves only the eligible current mode; the other two modes' availability flags are preserved. |

The files are `recent1.sav` for Campaign, `recent2.sav` for Endless Siege, and
`recent3.sav` for Madness. Independent flags `_g_gameSavedCampaign`,
`_g_gameSavedEndless`, and `_g_gameSavedMadness` control the prompts. These are
three concurrent slots, not one slot tagged with the latest mode.
`SaveOptions` (`0x254f4`) persists all three flags (static stores via
`fwrite` at `0x2565c`, `0x25674`, `0x2568c`).

The native file layout, recorded from actual stdio arguments, is:

| Offset | Bytes | Data |
| --- | ---: | --- |
| 0 | 4 | Native version, 10 in this executable |
| 4 | 572 | Player: day, balances, inventory, mode/configuration, score |
| 576 | 76 | Wave state |
| 652 | 736 | Land: time, door, end flags, environmental state |
| 1388 | 51,200 | 200 Creeps, 256 bytes each |
| 52588 | 3,480 | 30 DragObjects, 116 bytes each |
| 56068 | 3,800 | 25 Artefacts, 152 bytes each |

This native version number and binary layout are unrelated to the remake's
snapshot versions. These files are evidence, not portable browser save files.

## Resume preserves the current day and purchases

All three modes were initialized and advanced through 360 actual world frames
before saving. Native time was 6.000023365020752 seconds. After poisoning every
serialized region, direct native LoadGame restored all six block hashes
exactly. GoLoadGame then did the same through its full load/init/load sequence.
The incoming `normalGame::InitMode` executes; outgoing mode teardown is omitted.

The intermediate initializer advances to day 2 and resets time to 0. The second
load restores day 1, the exact original elapsed time, actors, wave, HP, and
inventory. The first subsequent world frame reaches 6.016690254211426 seconds.
It does **not** restart the saved day. See `cases` with `phase: "battle"`.

A supplied shop checkpoint with gold 12,345, sacrifices 67, and a tier-2 spell
in inventory slot 10 survives both direct load and GoLoadGame without any
balance or inventory difference. This proves serialization of purchased
state; the purchase callback itself was not exercised in this follow-up.

Shop, ordinary victory results, and a final-castle victory all resume through
battle mode and return to the results screen on the **first Draw**. They do not
remain in the shop or replay the eight-second victory transition. The probe
supplies end flags and final day for those three cases, rather than completing
another natural battle. No browser result transition change is required just
to match this destination.

GoLoadGame clears only the selected mode's saved flag. The other flags remain
available. It does not restore the global pause flag or libc RNG state: those
are absent from the file blocks. Actual initialization consumes randomness
before the second load. The probe uses the established synthetic xorshift
stream; it does not claim to recover historical libc random state.

## Save eligibility and terminal acknowledgement

Existing `save-lifecycle.json::cases` establishes the same predicate for all
three modes: shop is eligible; battle/results are eligible when Land's defeat
flag at `+0x2dd` is false; main menu and map are ineligible. Winning results,
including an unacknowledged final victory, can therefore be saved. A defeated
run is not offered for resume.

New `eligibility_edges` confirms Pause remains battle mode 1 and is eligible.
Options mode 3 is ineligible even when entered from a live battle; map after
Abort is ineligible. Termination clears only the current mode's flag first,
then sets it again if the current state is eligible. Other mode flags survive.

Native final Done (`FinalizeGame`, `0x206bc`) calls `player::PerformVictory`
(`0x1995c`) before returning to map. This routine writes the castle score,
sets completed at LevelData `+0xd4`, and unlocks the next marker at `+0xd5`
only when the victory flag is set. The defeat Done route (`GoHiscores`,
`0x22274`) uses the same record routine for Campaign, then returns to map;
Endless/Madness go to scores. Only these two direct call sites to PerformVictory
exist in the inspected executable.

The bounded `probe_save_ui.py` follow-up now executes this timing directly.
With supplied final-victory or defeat state, actual result InitMode and 65 Draws
leave the level's completion flag, next-level unlock, and stored scores
unchanged. The selected original Done callback then writes the final counted
score and best score, routes to map mode 10, and sets completion/unlock only
for victory. See `save-ui.json::terminal_acknowledgement` (two cases). These
are supplied result states, not another natural full campaign playthrough.

The browser implementation inspected before the parent's current changes
wrote `knights-completed` immediately in `tick()` when phase became complete.
That makes map completion persistent before final Done; native acknowledgement
happens at Done. This is a separate remaining timing difference to consider.

## NO consumes the offer and closes the dialog

`no_resume_choices` executes each mode chooser, actual dialog Down/Up on NO,
and a second mode choice. The actual NO callback is `ClearHelpDialogs`
(`0x33d9c`); YES is `GoLoadGame` (`0x354f8`).

- Campaign first enters map. Map Init opens the saved-game dialog, clears only
  the Campaign availability flag, and saves options (`0x1ec78–0x1ecb8`). NO
  leaves the map visible. Selecting Campaign again does not show another offer.
- Endless (`0x1eb64`) and Madness (`0x1eb0c`) clear their respective availability
  flag **before** opening the dialog. NO leaves the Play submenu visible. A
  second tap on the mode starts a new battle without another saved-game offer.
- NO itself does not launch a new battle, delete a native file, or change the
  other modes' saved flags. The file can still exist after its offer is consumed.

`save-ui.json::saved_dialog_backdrops` directly executes both Endless and
Madness chooser paths from a settled Play submenu. The dialog overlays the
existing Campaign / Endless Siege / Madness / Back buttons; all four are still
drawn before the dialog's NO / YES buttons. NO leaves the original submenu
control scales and backdrop fade unchanged. It does not reinitialize the
submenu or restart its entrance. `mainMenu::Draw` calls ButtonsDraw at
`0x21c1c`, then dialog update at `0x21c24` and DrawHelpDialogs at `0x21c34`.

The former browser shared-key implementation differed in two places: another
mode overwrote the only slot, and NO immediately started Endless/Madness while
leaving Campaign's offer available for repeated prompts. The parent is applying
per-mode slots and consumed-offer metadata; this note does not claim to test
those production changes.

## Abort and browser adaptations

`abort_choices` executes Abort (`0x1ca78`). It clears pause, resets game buttons,
and routes Campaign to map mode 10 or Endless/Madness to main mode 0. It makes
no SaveGame call. The active run's flag was already cleared when it was loaded
or its offer was shown. Other saved-mode flags remain unchanged.

Useful browser adaptations should remain explicit:

- Save on visibility/page lifecycle and after purchases, rather than depending
  on old iOS termination callbacks. Native SaveGame has only three direct call
  sites, all within applicationWillTerminate.
- Keep live-battle saves when temporarily in Options. The original shutdown
  predicate would lose that run; reproducing that old loss is unnecessary.
- Restore into a paused state and release transient pointer capture. Native
  reload enters battle directly, but browser background/input behavior differs.
- Preserve deterministic browser RNG/snapshot replay and validate malformed
  saves. Native raw struct serialization is not a suitable browser format.
- A per-mode tombstone or `available:false` can represent native consumed flags
  without deleting the legacy fallback. Keep the captured payload usable for
  YES/loading retries, while suppressing a new offer. Other mode slots must
  remain unaffected.

## Fixture schema and limits

`save-roundtrip.json` contains:

- `blocks`: native pointer-table addresses and serialized sizes.
- `cases`: `mode`, `phase`, `before`, `direct_load`,
  `after_initializer_before_second_load`, `resumed`, `flags_after_resume`,
  `stdio`, `lifecycle`, `after_frames`, `returned_to_result`, and `after`.
  Snapshots include exact hashes, day/time/HP, balance/inventory, RNG, and mode.
- `eligibility_edges`: current mode/UI, all three flags after termination,
  and intercepted calls.
- `no_resume_choices`: state after chooser, after actual NO, and after choosing
  again. Includes actual dialog callback addresses and mode switches.
- `abort_choices`: mode, exact callback routing, cleared pause, and all flags.

All stdio lives in Python bytearrays; Objective-C path construction is mocked.
SaveOptions, real asset/audio/GPU work and outgoing mode callbacks are
intercepted. The established battle harness relocates Land/Artefacts; the
probe follows the executable's actual pointer-table entries to those regions.
No OS save files, TouchHLE saves, browser storage, production code, or tests
were changed. Full-duration/high-level stress belongs to the parent's separate
work and was not duplicated here.

The separate `save-ui.json` contains `saved_dialog_backdrops` (two modes) and
`terminal_acknowledgement` (victory/defeat). It executes original menu/result
callbacks and presentation updates, with navigation/file/audio/GPU effects
intercepted. Both probes completed successfully; Python compilation also passes.
