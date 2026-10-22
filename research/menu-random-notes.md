# Menu and loading randomness audit — 16 October 2026

Source: the supplied executable `research/Knights`, with addresses from
`research/disassembly.txt`. `random-call-sites.json` records all 112 direct
calls to the imported `_rand` stub at `0xaa874`, across 26 functions, and the
executable SHA-256. This is a direct-call inventory, not a claim about external
system-library internals.

## Confirmed setup omission and correction

`ClearLoadUpdateFuction` at `0x6a70` clears the loading callback, restores its
progress field and consumes `rand()` at `0x6a90`. It stores `rand() % 12` at
`0xe1e90`. `normalGame::InitMode` calls it at `0x20e6c`, **before** the new-game
branch, background selection and either landscape initialization. The native
function is small and requires no graphics/audio emulation.

The earlier session probe incorrectly intercepted this function alongside
external loaders. Removing that interception makes the previous production
test fail at the first setup state: 1689530164 versus native 3406375997.
The remake now consumes that value in `createRun` before the new-game setup,
and in `prepareDay` when advancing from the shop. Cloning before advancing
means background asset warming and failed-load retries cannot mutate the
saved run or consume extra values.

The corrected native probe executes this call and checks its position in
every initialization. Five two-day sessions now have setup call counts:

| Session | First day | Second day |
| --- | ---: | ---: |
| Campaign castle 0 | 121 | 121 |
| Campaign castle 9 | 531 | 326 |
| Campaign castle 11 | 123 | 122 |
| Endless Siege | 325 | 324 |
| Madness | 325 | 324 |

The fixture additionally captures the actual `LoadBackground` argument at
`0x17020`; the legacy `LandProbe.state().theme` field is not the artwork ID.
All 4,500 world frames, procedural tables/durations, backgrounds, stars and
10 resume checkpoints match through the production frontend and real Wasm.
This test supplies xorshift outputs to the native import; it verifies call
ordering, not the historical libc generator.

## Other menu callers and scope

- Credits initialization at `0x208bc` consumes three values at `0x208d0`,
  `0x20900`, `0x2092c`, producing `3 + rand()%5`, `6 + rand()%5`,
  `10 + rand()%5`. Existing Credits animation fixtures verify the presentation;
  its browser randomness remains independent of a saved combat stream.
- Main menu (`0x21f78`), map (`0x1ec24`) and scores (`0x22310`) also call
  `ClearLoadUpdateFuction`. They therefore consume the process-global stream
  in the original. The port does not claim menu-to-new-run deterministic parity.
- The old `newGame::DrawList1/DrawList2` carousel contains ten direct random
  call sites. The active Play menu is `mainMenu` plus its four buttons; those
  unused carousel routines must not be added to the active menu's schedule.
- `InitGame` seeds libc once from truncated `CFAbsoluteTimeGetCurrent`
  (`0x711c`–`0x712c`). The port's new-run crypto seed and independent menu
  generator remain explicit limits. Changing just Credits would not reproduce
  the complete original process-global lifecycle, especially across browser
  reloads, so no partial coupling was added.

No snapshot field or save migration changed. Existing battles retain their
saved engine state; future new-day generation now follows the corrected
supplied-stream ordering. HD remains unstarted.
