# Original compound menu input

Executed the original ARM handlers for **41 gesture sequences, 126 input events,
and 430 assertions**. Evidence is in `compound-menu-input.json`; reproduce with
`.venv/bin/python research/probe_compound_menu_input.py`. This is native input and
state evidence, not a browser acceptance test or a GPU screenshot comparison.

Source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.

## Execution boundaries

The probe executes each mode's actual initializer, actual shared button
allocation/input, actual dialog creation/input, and one actual mode Draw at
1/60 second after every input. It captures state both before and after that
Draw, because input and drawing apply different parts of scrolling.

It supplies a settled selected map panel, available campaign markers, and
100,000 gold/1,000 sacrifices. Shop initial autoscroll is stopped; the actual
DrawAllShopItems layout centers Medium Fireball at a specified x before each
relevant sequence. There are no save-file writes.

Navigation and purchase/confirmation callback bodies are intercepted at
`ButtonPress`'s indirect call (`0x1ce3c`). Actual button sound dispatch and
pressed-state clearing still execute. Only harmless map Info (`0x1eaac`),
Options Cheat (`0x1eadc`), and Options Reset (`0x1eaf4`) callbacks are allowed to
create their actual dialogs. Reset confirmation itself remains intercepted.
Graphics, actual sound playback, dialog animation/drawing, and OS services are
intercepted. Therefore callback addresses prove routing, not successful
destination navigation, purchase completion, or a dialog's rendered animation.

## Compound release routing

Ordinary buttons still use the common release-point predicate even when a
gesture starts in another region. Every listed destination highlights on Move
and invokes its callback on Up:

| Native gesture | Callback | Fixture case |
| --- | --- | --- |
| Map blank background → Menu | `0x1d958` | `map/background_to_menu` |
| Map blank background → Play | `0x1d96c` | `map/background_to_play` |
| Map castle marker → Play | `0x1d96c` | `map/marker_to_play` |
| Shop items → Exit | `0x321f8` | `shop/strip_to_exit` |
| Shop items → Exit after 300 px horizontal movement | `0x321f8` | `shop/long_strip_to_exit` |
| Scores list → Done | `0x1d7d0` | `scores/strip_to_done` |
| Scores Done → Global | `0x1eac4` | `scores/done_to_global` |
| Options difficulty/Reverse/slider → Done | `0x20238` | `options/*_to_done` |

All those actions dispatch button sound event 8 on Up. The map marker selection
also dispatches event 9 on Down. A map background Down followed directly by Up
on Menu activates Menu even without an intermediate Move.

The opposite direction also matters. Down on Map Menu, Shop Exit, or Scores
Done does not reserve the gesture for that button: Move into the content clears
the button's highlight and performs native camera/list scrolling. Down on
Options Done followed by Move into the slider updates the slider.

Handler addresses (Down / Move / Up / Draw):

- Map: `0x1de4c / 0x1dc7c / 0x1dd64 / 0x22e88`.
- Shop: `0x31e50 / 0x31de4 / 0x31e90 / 0x32760`.
- Scores: `0x1dc44 / 0x1db64 / 0x1dc20 / 0x23df0`.
- Options: `0x24a5c / 0x249c4 / 0x1dd94 / 0x24214`.

## Overlapping ordinary buttons

The native button pool can highlight multiple overlapping hit rectangles.
Down(350,290) on Options presses **both Cheat and Reset**. Up invokes only
Cheat (`0x1eadc`) and creates its kind 6 dialog; it does not invoke Reset or
create kind 2. Reset remains pressed behind the newly-created dialog.
This runs both harmless dialog-opening callbacks without interception, so
the second callback's absence is an actual priority result.

Down(382,290) on Map similarly presses **both Play and Info**. Up invokes only
Play (`0x1d96c`) and does not create an Info dialog. In this case Play's
navigation callback is intercepted; Info remains pressed in the captured
unchanged map pool. That last highlight is a dispatcher observation, not a
claim about the real map after gameplay navigation.

`ButtonsStylus` (`0x1cedc`) continues iterating after the first consumed
button, but replaces the release flag with 0 (`0x1cf10–0x1cf14`, repeated for
its unrolled iterations). Thus it calls only the first eligible callback,
while processing later overlaps as Move-like highlights. Native priority is
pool order (Cheat before Reset, Play before Info), not last-drawn DOM order.
A single first-hit action matches this; a single pressed index does not
reproduce the simultaneous artwork. Fixture cases: `cheat_reset_overlap` and
`play_info_overlap`.

## Shop selection uses signed displacement

The field at shop `+0x2c` accumulates **previousX − currentX**, preserving the
sign. It is not total distance traveled. The Up item-selection threshold
(`0x31ec4–0x31ed0`) accepts −19 through 19, inclusive; −20 and 20 reject.
`shop/displacement_*` executes all five boundary values.

`shop/backtracking` starts at x240, moves to x140, then returns to x240.
Displacement changes 0 → 100 → 0. Despite traveling 200 pixels in total, the
release opens the original Medium Fireball confirmation. Gold/sacrifices do
not change during this opening release. A vertical drag from Exit to an item at
the same x also opens confirmation (`exit_to_item_same_x`). Exit itself is
routed before the item threshold: the 300-pixel move in `long_strip_to_exit`
does not suppress Exit.

Coordinates are not clipped to the 480×320 viewport before scrolling:
`outside_coordinates` retains contact x2000 and then x−3000. Starting from
offset −1217, those Moves produce input offsets 543 and −4985. Draw clamps
the stored offset to 15 and −1922 respectively (layout width 2402).

There is an original asymmetric draw-order quirk: the upper bound 15 is applied
before `DrawAllShopItems` (`0x32824` before call `0x3283c`), but the lower bound
`480 − width` is applied afterward (`0x32858`). On the lower overshoot frame,
the stored offset is already −1922 while Medium Fireball's last drawn center
still reflects the unclamped offset (−3528). A model clamping both bounds
before layout differs on that overshoot frame.

## Map and Scores state

Map movement clamps camera x to [−540, −420], y to [−430, 0], while retaining
the raw outside pointer coordinates. Down in blank map space sets
`panel_open=false`; Down on a castle sets the selected marker and
`panel_open=true`. The `+0x44` flag means **open**, not hidden: the supplied
settled state is panel offset 0 and flag true. A previous probe's naming of
this flag as hidden must not be used to reverse its meaning.

Scores Done(100,290) → list(100,150) produces y offset −140 and velocity 2800
on Move. Up clears dragging; the next Draw advances offset to
−186.6666717529297 and damps velocity to 2520. Scores also updates an internal
x offset during horizontal movement and caps both offsets at 0. That x state
is not evidence of visible horizontal scrolling: the native Draw reads y at
`+0x20`, supplies x=0 to its translation (`0x23f78–0x23f84`), and draws score
columns at fixed x. No visible x-scrolling gap is claimed here.

## Options input phase

- Difficulty, Reverse, and Mute change on **Down**. Moving away does not undo
  the change. Moving into a checkbox without a Down there does not toggle it.
- The volume slider changes on **Move**, not Down. Down(210,230) leaves the
  supplied volume 0.5. Move(350,230) changes it to 0.9655172228813171.
- Subsequent Moves to x600 or x−100 leave the last valid volume unchanged;
  the native slider does not clamp an outside pointer to the nearest endpoint.
- Down on Done then Move(140,230) updates volume to 0.24137930572032928 and
  cancels Done. Mute→slider also works within one gesture.
- These special control mutations dispatch no click sound in the captured
  input handlers; an ordinary Done release dispatches event 8.

## Dialog order and original quirks

An active dialog consumes input before underlying ordinary buttons or Options
special controls can act. Map camera/contact state remains unchanged under
the tested dialog. Within the dialog, Down on NO → Move/Up on YES highlights
and invokes YES (`0x358d0`) using the same release-point rule.

Shop is an exception for **scroll state**, not button priority. Its Down/Move
mutates drag state/offset before calling dialog dispatch. Under an existing
modal, Down(240,100) → Move(140,100) changes offset −1217 → −1317. The consumed
Up returns before the native `dragging=false` assignment, so dragging remains
true. `dialog_shop_movement` records this; underlying Exit/purchase selection
does not execute. Choosing not to reproduce this oddity should be described
as an intentional adaptation rather than native behavior.

The newly-created purchase dialog cannot consume its opening release.
`opening_release_then_fresh_yes` deliberately opens at (300,180), inside the
future YES rectangle. That release creates exactly one dialog, dispatches
event 9, invokes no confirmation callback, and does not charge. A subsequent
fresh press/release invokes YES. `opening_release_then_bare_yes_release` also
shows the native routine accepts a separate Up without a new Down. The web
requirement for a fresh pointer sequence and suppression of compatibility
clicks is therefore a necessary browser adaptation, not a claim that native
code required a new Down.

Map Info and Options Cheat similarly create exactly one dialog on the opening
release. Purchase callback bodies were intercepted, so the unchanged balance
after a later YES in these fixtures must not be interpreted as a purchase bug.

## Remaining scope

This does not exercise touch implicit capture, multiple pointer IDs, browser
compatibility clicks, keyboard accessibility, or actual page transitions.
Those require the production regression suite and browser checks. It does not
audit every item hit boundary, multi-dialog stacking, or external leaderboard
behavior. Production and test files were not modified by this research.

## Implemented browser correspondence

The shared `castleControls` overlay now integrates the four native gesture paths,
with integer logical coordinates, signed shop displacement and all overlapping
button highlights. Its first release callback follows native ordering. Options
Down/Move updates preserve the captured bounds. The shop menu clock continues
beneath dialogs; `ShopScroll.frameOffset` and production rendering/hit testing
preserve layout-before-lower-clamp ordering.

`tests/compound_input.mjs` compares122 of the126 captured events through the
production handler and production menu-clock callback. The two native
real-constructor cases remain covered by their probe assertions; browser and
production purchase tests separately verify dialog creation/navigation. Twelve
lifecycle cases check cancellation and recovery. New input is required after
control replacement/backgrounding, and bare Up cannot confirm a dialog; these
remain browser adaptations. Settled modal scrolling stops requesting frames,
even when the native consumed-Up drag flag remains true, and subsequent Move
restarts scheduling. Native Draw does not establish mobile CPU/battery use.
