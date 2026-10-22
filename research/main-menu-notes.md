# Original main-menu geometry, press feedback, and Tell a friend

Source: supplied ARM executable `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Executed probe: `research/probe_main_menu.py`; evidence: `research/main-menu.json`.
This is the initial Play/Scores/Options/Help/Credits screen, not the already
verified Play submenu, map, or Credits screen.

## Original controls and artwork

`mainMenu::InitMode` (`0x21f50`) calls `ClearButtons`, starts music group0,
zeros its fade field at `this+0x24`, loads menu resources, and creates **six**
buttons unconditionally. No availability test guards Tell a friend.
All coordinates below are original 480×320 game coordinates; rectangles are
`[x,y,width,height]`.

| Control | Rectangle | Type | Normal image | Pressed image | Callback |
| --- | --- | ---: | --- | --- | --- |
| Tell a friend | `[40,280,220,42]` |1|`menu_big_button.png`|`menu_big_button_active.png`|`InvokeMail` `0x20690`|
| Play | `[285,20,190,42]` |0|none|`menu_b_play.png`|`0x20324`|
| Scores | `[290,80,190,42]` |0|none|`menu_b_scores.png`|`InitHiscores` `0x1d80c`|
| Options | `[292,134,190,48]` |0|none|`menu_b_options.png`|`InitOptions` `0x1d7e4`|
| Help | `[303,190,190,48]` |0|none|`menu_b_help.png`|`InitInstructions` `0x1d820`|
| Credits | `[292,242,190,48]` |0|none|`menu_b_credits.png`|`InitCredits` `0x1d7f8`|

`mainMenu::Draw` (`0x21aec`) first blits `menu_background.png` at0,0.
The five right-hand labels are baked into that backdrop. Their controls have
empty text and null normal artwork. When held, the corresponding pressed
image draws centered at the rectangle center at scale1, with original negative
Y scaling convention. There is no gold translucent rectangular hover outline
or brightness filter. The drawing wrappers record attempted null-image calls
as `0x0`; original `Display` (`0x7dc4`, branch `0x7de8`) skips them entirely.

Captured pressed-image centers are: Tell a friend150,301; Play380,41;
Scores385,101; Options387,158; Help398,214; Credits387,266. All settled images
use `sx=1, sy=-1` in the native display convention, opacity1, with no rotation.

The native rectangles deliberately extend beyond the right/bottom viewport
for several controls. Do not shrink their logical sizes to fit: normal view
clipping already clips them. Native input includes left/top edges and excludes
right/bottom edges, confirmed by36 boundary executions.

## Entrance, fade, and reentry

The five type0 label controls start at scale1 and remain there. Tell a friend
starts at scale0; every `button::Draw` adds float32(0.05), clamps to1, and draws
the result. First frame is0.05000000074505806; twentieth frame is1. This is
**per draw/frame, not dt-scaled**. Its artwork center is150,301. Text is
`Tell a friend`, centered at138,286 in the original font, with the same scale;
pressed text's baseline moves down one pixel.

All25 initial main-menu draw captures have fade0. The main-menu labels do
not fade or slide in. The native Draw tests `_Buttons[4].active`
(`_Buttons+0x214`), not a Player field: active Help distinguishes the six-button
main menu from the four-button Play submenu. Main reduces fade by1000×dt toward0;
submenu increases fade by1000×dt toward210. Original main Init always resets
fade to0, so the actual Play→Back path instantly restores an undimmed backdrop
and restarts Tell a friend's scale entrance. This was executed through the
real Play callback, real `InitMainMenu`, `SwitchMode`, and native main-menu
vtable Init/DeInit dispatch. It is not an inferred CSS transition.

## Input and sound

Native `mainMenu::StylusDown` (`0x1ddf0`) and Move (`0x1ddc4`) forward the
current point to `ButtonsStylus(...,release=false)`. Entering a control marks it
pressed; moving outside clears it. These do not emit click sounds.
Up (`0x1de1c`) forwards `release=true`. The control under the **release point**
activates, even if Down was elsewhere or no Down was supplied to the native
function. The browser may require a real pointer sequence as a platform input
constraint; cross-button retargeting during a drag is original behavior.

Five executed gesture cases prove: leave+release outside cancels;
outside→inside activates; Play→Scores activates Scores; Down on Play followed
by Up on Scores without an intervening Move also activates Scores; direct Up
inside Play activates Play. All six controls were pressed and released through
their real native button handlers.

`button::ButtonPress` (`0x1ce1c`) emits event8/subtype0 at `0x1ce30`
(`menu_click_button.wav`) before callback dispatch, then clears pressed state.
The actual Play callback additionally emits event9/subtype0 at `0x2033c`
(`menu_buble_open.wav`). Ordinary main-menu press feedback itself is silent
until release. Each other captured callback contributes its own separately
verified navigation behavior; this probe did not rerun those screens.

## Tell a friend

The control is always present; mail availability is tested **only on
activation**. The probe executes `InvokeMail` (`0x20690`) → native
`-[CrashLandingAppDelegate invokeMailSending]` (`0x512c`) for all three cases:
mail composer class available+can send; class available+cannot send; class absent.

If `MFMailComposeViewController` exists and `canSendMail` returns true, native
`displayComposerSheetInView:` (`0x48d8`) creates a system composer, sets its
delegate, sets subject/body, and presents it with `animated=false`.
It does **not** send the message. No recipient is supplied.

Subject is exactly `Knights Onrush`. Body is plain text (`isHTML=false`), with
leading and trailing newlines:

```text

Knights Onrush:
http://itunes.apple.com/WebObjects/MZStore.woa/wa/viewSoftware?id=297805402&mt=8

```

The historical ID in this body is297805402, even though the user supplied
312494232 for the restored title. Preserve this as historical evidence; it
does not establish that the old link is a useful current destination.

When the class is missing or cannot send mail, native `launchMailAppOnDevice`
(`0x47d0`) constructs `%@%@` from `mailto:&subject=Knights Onrush` and that
body, calls `stringByAddingPercentEscapesUsingEncoding:` with UTF-8(4), creates
an NSURL, and requests `UIApplication.openURL:`. This fallback is visibly
malformed: no `?` and no `&body=` separator. Evidence captures the pre-escaping
string; Foundation escaping itself is not emulated. Do not claim this legacy
fallback worked or reproduce its malformed syntax as a modern requirement.

The user-requested browser adaptation keeps the original control and label,
and now opens the platform share sheet with the current playable game URL.
Query/hash/credentials are stripped, including development/mute parameters.
Without Web Share, or after a non-cancel failure, it opens an unsent email
draft with the current playable URL. Cancellation leaves the game open.
`legacyShare=1` instead uses the exact original subject/body above through a
valid mailto handoff; the obsolete destination and historical ID are preserved.
This does not recreate UIKit's embedded composer or its malformed fallback.
Checks: tests/sharing.mjs, tests/main_menu.mjs and
artifacts/sharing-browser-check.json. Desktop browser API/mail stubs verify
the actual menu button and transient activation without sending any message;
physical mobile share-sheet and email handoff remain unchecked.

## Confirmed browser discrepancies at audit time

- `web/index.html` uses approximate percentage hit regions, notably x326.4
  rather than original285–303; it omits Tell a friend entirely.
- `web/style.css` gives main-menu hover a new rectangular highlight/border.
- `web/game.mjs` main-menu renderer draws only the backdrop, so it lacks all
  five pressed artwork overlays and Tell a friend's entrance/art/text.
- Existing per-element `onclick` handlers do not model native release-point
  retargeting. Existing shared castle control machinery may already provide
  the needed architecture; use it instead of another input system.

## Scope and limits

Executed25 initial frames, six pressed render cases,36 boundary checks,
five gesture sequences, reinitialization, real Play/Back mode transition,
and all three mail-capability paths. Embedded assertions pass. Graphics,
audio, Objective-C system services and dialogs are intercepted. The probe
creates no composer, opens no browser, plays no audio, and sends no message.
It captures render calls, not original GPU pixels. No production/test files
were edited; only the three assigned research files were written.
