# Physical-device release checks

Use the release candidate's permanent HTTPS address. Record the URL, commit,
device model, browser and OS version with every result. Previous tunnel URLs are historical
and may no longer serve the candidate.

Earlier checks confirmed Android installation, fullscreen, installed offline
relaunch, music/effects and background silence on Galaxy S24 Ultra / Chrome.
The latest installed-app follow-up remains open. iPadOS 16.6.1 has a partial
play pass; viewport movement/dismissal and Help delay have fixes awaiting
physical retest. iPhone testing remains pending. See
[acceptance](ACCEPTANCE.md) for the evidence and open reports.

Keep existing installed apps and their site data. A different hostname has
separate saves and an independent installation.

## iPad gesture and Help check: about 1 minute after downloading

1. Open the candidate URL, apply **Update game** if offered, and enter the
   expanded game view. Drag downward inside the playfield: the page must stay
   in place. Safari chrome may remain because Apple devices use page expansion
   instead of native fullscreen.
2. Open **Help**, then tap Next/Previous through the five pages. Once the main
   menu has opened, these pages should already be decoded and switch promptly.

If startup stalls, record the exact URL and visible error before continuing.
Installed iPad gestures and airplane-mode/audio need the separate checks below.

## Apple installation check: about 3 minutes per device after downloading

Open the same candidate URL in Safari without `dev`, `mute` or other diagnostic
parameters. A normal first tap may be necessary to unlock audio.

1. Wait for **Ready offline**, then choose Safari **Share → Add to Home Screen**.
   Keep **Open as Web App** enabled if Safari offers it. Launch the knight icon:
   the game should open without Safari's address bar. Keep this installed app
   online and open until **Preparing offline play** completes and the main menu
   appears. Check readiness here even if Safari had already shown **Ready
   offline**; the installed app may have separate storage. **Play → Campaign**
   should then open the prepared map promptly.
2. Turn the device landscape. Check **Options → Done**, then **Play → Campaign →
   Play** (or **YES → Resume** if a save is offered). Throw one knight and pause.
   Check music/effects, touch alignment and the full 3:2 playfield. It must fit
   without stretching or clipping; borders are expected on differently shaped
   screens. Record any system status bar rather than treating it as proof that
   installation failed.
3. Go Home and lock for 10 seconds. Music must stop. Reopen Knights and tap
   **Resume**: gameplay, music and the next pickup/throw sound should return.
4. Pause, enable airplane mode, close Knights and Safari, then launch the knight
   icon. **Play → Campaign → YES → Resume** should restore the saved battle with
   music and throwing sounds. Keep the same installed icon and hostname.

Report each step as pass/fail with the exact failed action. Do not reinstall or
clear storage to repair a failed test: that can remove evidence and saves.

## Android release follow-up: about 3 minutes after downloading

On the candidate URL in Chrome, wait for **Ready offline**, install the game
from the browser menu if needed, and open its icon. Apply **Update game** if
offered; allow an existing installed app time to receive manifest updates.

1. Confirm the knight icon, landscape playfield, touch alignment and fullscreen
   presentation without browser chrome. Start or resume a campaign and check
   music, pickup and throwing sounds.
2. Go Home and lock for 10 seconds. Audio must stop. Return and resume; gameplay
   and sounds should continue without an unwanted media notification or player.
3. Pause, enable airplane mode, close Chrome and the installed app, then relaunch
   the same icon. Resume the saved battle and confirm music/effects and Help work.

## Sustained play: 20 minutes per device

After installation/audio pass, play normally to check for growing heat,
persistent slowdown, crashes and touch errors. Record mode/day, Battery saver
setting and battery percentages before/after, alongside device/browser/OS.
This is a practical single-device observation, not a controlled battery benchmark.
For the reported iPad barrel slowdown, see
[rendering measurements](RENDERING.md) and record the affected mode/day.

Human campaign completion remains distinct from the automated 579-day defender.
Native comparisons cover every castle's final day on all three difficulties,
but the recorded evidence contains no completed human campaign in this browser
remake. Do not mark that gate passed from the automated report alone.
