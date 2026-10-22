# Shared menu input routing audit

Follow-up: `compound-menu-input-notes.md` and `compound-menu-input.json` now
execute the compound-screen cases discussed below. They confirm cross-region
release actions, signed shop displacement, Options input phases, and native
dialog ordering. The production-audit section here remains a historical
snapshot from before the parent's shared-handler correction.

**The original release-point button semantics apply to all requested menu
buttons. Reuse the main-menu routing, but preserve ownership of scrolling,
option controls, text input, and map gestures.**

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Static ARM/vtable references below were read directly from that image with
Capstone and checked against `research/disassembly.txt`. Existing executed
behavior evidence: `research/main-menu.json`, `research/ui-fidelity.json`,
`research/play-menu.json`, and their probes. No broad frame recapture was needed.

## Native fact → source

All ordinary buttons use `button::Stylus` (`0x1ce4c`): active and not disabled,
left/top inclusive, right/bottom exclusive. Down/Move inside sets pressed;
outside clears pressed. Up inside calls `ButtonPress` regardless of where Down
occurred. `ButtonPress` (`0x1ce1c`) emits event8 then invokes the callback, then
clears pressed. Existing main-menu captures execute boundaries and cross-button
release sequences through these actual functions.

| Surface | Confirmed path to this same button logic |
| --- | --- |
| Play submenu | Still `mainMenu`, not old `newGame`: Down/Move/Up `0x1ddf0/0x1ddc4/0x1de1c`. Dialog dispatch first, then `ButtonsStylus` with0/0/1. |
| Credits | Vtable `0xc7858` entries6/7/8 point to inherited gamemode Down/Up/Move `0x7af8/0x7ae0/0x7ac8`. These call `ButtonsStylus` at `0x7b08/0x7af0/0x7ad8` with0/1/0. |
| Help, including Exit and page buttons | Instructions vtable `0xc7810` entries6/7/8 are the same inherited gamemode functions as Credits. |
| Results/interLevel | Down `0x1d9b0`, Move `0x1d980`, Up `0x1d998` call `ButtonsStylus` at `0x1d9c0/0x1d990/0x1d9a8` with0/0/1. |
| Options Done/Reset/Cheat | Down `0x24a5c`, Move `0x249c4`, Up `0x1dd94` first call `ProcessHelpDialogsStylus`; if unconsumed, call `ButtonsStylus` at `0x24b6c/0x24a48/0x1ddbc` with0/0/1. |
| Purchase, saved-game continue, Options confirmations, map hint | `ProcessHelpDialogsStylus` (`0x33f84`) calls the active dialog's three embedded `button::Stylus` instances with the unchanged release flag (e.g. `0x33ff4/0x34010/0x3402c`). It returns consumed for an active dialog even when the point hits no button. This prevents underlying ordinary buttons from responding. |
| Pause menu | Normal-game Down/Move/Up methods `0x20710/0x206e0/0x206f8` delegate to `GameStylusDownMultiDown/Move/Up` `0x6914/0x69c8/0x6840`; these call `ButtonsStylus` at `0x698c/0x6a40/0x68b8` with0/0/1. Pausing changes the button pool, not its selection semantics. Coordinate scaling/mirroring belongs to the game wrapper. |

The shared predicate is therefore proven for these controls; a separate
mouse-style "Down and Up on the same DOM element" rule is not original.
The native functions themselves accept direct Up without Down, but requiring
a fresh browser pointer sequence remains appropriate to prevent the known
compatibility-click/dialog replacement defect. That requirement is an explicit
platform adaptation, not a native ARM finding.

## Native compound screens require ordering

- **Map:** Down first interrupts automatic camera motion, then routes an active
  dialog, then ordinary buttons (`0x1dea0`), then marker selection only for
  y<260. Move routes dialog, then buttons (`0x1dca4`), then camera movement.
  Up routes dialog, then buttons (`0x1dd8c`). Native dragging from map background
  onto a bottom button can therefore select that button at release. Sources:
  `mapMode` handlers `0x1de4c/0x1dc7c/0x1dd64`.
- **Shop:** Down sets drag origin/state, routes dialog, then ordinary buttons
  (`0x31e88`). Move updates scroll state, routes dialog, then ordinary buttons
  (`0x31e48`). Up routes dialog first; when consumed it returns immediately.
  Otherwise it clears dragging, routes ordinary buttons (`0x31ec0`), then
  checks movement threshold for *item* selection (`0x31ec4–0x31ed0`, signed
  accumulated displacement inside−19…19). This threshold is not a prohibition
  on pressing Exit after moving. Sources: `0x31de4/0x31e50/0x31e90`.
- **Scores:** Down stores drag coordinates then calls buttons (`0x1dc74`);
  Move calls buttons (`0x1db7c`) then applies scroll; Up calls buttons
  (`0x1dc34`) then clears dragging. Sources: `0x1db64/0x1dc20/0x1dc44`.
- **Options special controls:** difficulty, Reverse, and Mute mutate on
  **Down**, before ordinary button routing (`0x24a7c–0x24b6c`). Volume mutates
  on **Move** (`0x249e4–0x24a3c`) within its native rectangle. These controls
  must retain separate behavior; they are not ordinary release callbacks.

## Production audit before the shared-handler correction

`web/game.mjs::castleControls` has one overlay pointer-capture path for main
menu and another per-element Down/Up/Leave/Click path for every other screen.
The latter loses highlight when leaving the starting element and never arms
the destination element. A read-only Node VM execution of the exact current
production function, repeated for Play, Options, Credits, Help, pause, results,
continue, and purchase-shop, confirmed Down(A)→Leave(A)→Move(B)→Up(B)→Click(B)
produces `pressedButton=-1` and no action. Native expects B highlighted, then
B activated. No production file was altered by this audit.

Existing `tests/shop_input.mjs` intentionally covers the previous failures:
touch Up→Leave→Click still activates; compatibility Click cannot activate twice;
other pointer IDs/cancel cannot finish a press; opening a purchase dialog cannot
answer its newly-created YES/NO with the same touch; next-day purchases still
ask. These invariants must remain while replacing the per-element mechanism.
The old suite does not cover cross-button retargeting, so its prior passing
result did not disprove this gap.

## Constraints on reusing overlay capture

1. **Use current rendered rectangles.** `renderMap` changes each button DOM
   top to `trunc(f32(270 + panel))` but leaves `castleButtons.rect` unchanged.
   A literal copy of main's array-based hit test would target invisible/stale
   positions during map motion. `render` for pause already updates both
   `castleButtons.rect` and DOM top. Source: `renderMap` and paused renderer in
   `web/game.mjs`. Reading button DOM rectangles covers both; keep right/bottom
   exclusive like native.
2. **Do not steal a child-owned gesture.** Shop strip, scores strip and Options
   slider call `preventDefault` and capture their own pointer in their Down
   handlers. Parent capture in the bubbling phase would override that capture.
   `event.defaultPrevented` is a sufficient exclusion for these present
   handlers. Options `[data-option]` buttons instead rely on independent
   `onclick`, without preventing Down, and result `.score-name` is a real input.
   Those targets need explicit exclusion or integrated native handling.
3. **Keep map background routing reachable.** `#castle-ui` currently has
   `pointer-events:none`, children auto; `#campaign-map` handles background
   Down and document Move/Up. Making its entire overlay pointer-active would
   block shield selection/dragging. Main already has pointer-events:auto.
   Full-screen simple menus/dialogs may own blank-origin gestures separately;
   preserving map's current CSS limits shared capture to button-origin gestures.
4. **Clear the pointer before activating and invalidate it on rebuild.**
   Purchase/Options handlers can replace the children while keeping the same
   `screen`. Screen-name equality alone cannot identify the current controls.
   Every newly-created control generation must require its own Down; old
   pointerup and lost-capture events must not mutate its selection. Ignore
   compatibility pointer clicks after pointerup while retaining detail0
   keyboard/accessibility activation. Keep cancellation, other-finger and
   Up→Leave ordering coverage.
5. **Do not silently claim compound-screen parity.** Excluding child gestures
   safely preserves existing scroll/slider/text behavior, but also preserves
   gaps where a drag starts in map/score/shop background and ends on an ordinary
   button. Options toggles currently respond on DOM click rather than native
   Down. These are separate confirmed input-fidelity differences, not reasons
   to block the ordinary-button correction or disable existing controls.

## Bounded recommendation and limits

Replacing ordinary per-button handling with the main overlay approach is
supported by native evidence, provided current DOM geometry, gesture ownership,
control-generation cancellation, and one-action-per-pointer are preserved.
Maintain specialized compound gestures instead of deleting them. An initial
scope limited to button-origin drags on map/scrolling screens is safe but must
leave their blank/strip-origin cross-boundary cases explicitly unverified or
unimplemented. Mouse leaving/reentering and touch implicit capture require
browser checks after the production change, in addition to VM event tests.

This follow-up wrote only this note. It did not rerun screen frames, operate a
browser, or test any later production edits; references to production behavior
describe the function inspected before the parent agent's shared-handler change.
