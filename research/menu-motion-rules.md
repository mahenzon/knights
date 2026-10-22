# Native menu motion

Evidence: `probe_menu_motion.py` executes bounded original functions and writes
`menu-motion.json`; binary SHA256 is recorded in that fixture. No original code
is included in the browser build.

- `interLevel::Draw` at `0x224c4`, terminal branch `0x227b0`–`0x22804`, converts
  positive gold by subtracting2000 and adding2000 score per draw. In the same
  draw, positive sacrifices decrease by2 and score increases by
  `difficultyIndex*4000`. Negative remainders are original behavior. Ordinary
  day results do not run this conversion. Four65-frame sequences cover all
  difficulties, zero balances and partial chunks.
- `button::Init` at `0x1d534` starts ordinary type0 buttons at scale1. Types1/2
  start at0. `button::Draw` at `0x1d084` adds float32(0.05) each draw, capped at1
  (type2 caps at float32(0.85)). The day-result Go Next/Shop/Done controls are
  type0. Purchase NO/YES are type1. There is no result-button entrance bounce.
- `helpDialog::Process` at `0x33d30` adds float32(dt) to elapsed and
  float32(dt+dt) to scale, capped at1. At60Hz the body reaches full size in30
  frames. `helpDialog::Draw` at `0x345a8` uses opacity
  `trunc(min(255,float32(elapsed*350)))/255`, reaching1 after44 frames.
- The dialog backdrop is RGB(105,105,5), alpha `trunc(float32(scale*191))`.
  Body center is(238,138); its scale applies to the bitmap text as well.
  Button scale advances independently, reaching1 after20 frames. Native
  `hgeFont::Render` uses the Display opacity for text, including colored text.
- `button::ButtonPress` at `0x1ce1c` calls sound8/subtype0 before its callback;
  dialog initialization at `0x3499c` calls sound9/subtype0. These map to
  `menu_click_button.wav` and `menu_buble_open.wav`. Menu effect playback is
  still pending in the browser; this continuation restores visual motion.

The browser steps presentation at60Hz independently of display refresh and
stops requesting frames when settled/backgrounded. Final score is committed
before presentation begins, preserving rewards if the tab closes early.
This persistence adapter intentionally avoids making the reward depend on
how long the player watches the terminal animation.
