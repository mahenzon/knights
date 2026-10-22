# Android soundtrack controls and installed display updates

Read-only research, 2026-10-16. Primary-source captures are under
`research/media-controls-audit/`. Chromium references are `main` at retrieval,
not a verified match to the phone's exact Chrome version. No physical Android
notification behavior or updated fullscreen shell was tested by this audit.

## Implementation update after new user report

The user subsequently reported a loud approximately60-second click through
S24 Ultra speakers, including while locked. That symptom has not been reproduced
locally and is not established as a Media Session defect. The prior guard only
re-paused an external playback request after it had started. `Soundtrack.pause`
now also mutes and unloads the element while preserving its playback position
and compressed cached source for explicit in-game resume. Native in-game Pause
keeps music playing; backgrounding or music mute invokes the unload.

Current Chromium `MediaSessionImpl::RemovePlayer` removes the player and calls
`AbandonSystemAudioFocusIfNeeded`. This supports releasing a stopped player,
not suppressing controls while music is playing. Physical Android notification
dismissal and the periodic click remain a targeted phone acceptance check.
See `artifacts/click-exit-browser-check.json` and `click-exit-release-check.json`.

## Recommendation

Keep the working streaming `HTMLAudioElement` soundtrack. There is no supported
Media Session API setting that hides Chrome Android's automatic OS media
controls while the element continues playing normally. Clearing metadata or
setting `playbackState = 'none'` is not such an opt-out. Enforce the game's
existing background/mute intent if the OS tries to resume the element directly.

Pure decoded Web Audio follows a different Chromium path and can avoid these
automatic controls, but switching the soundtrack to it is a playback redesign
with substantial decoded-memory cost. It is unnecessary for authentic gameplay
and should not replace reliable playback merely to hide OS UI.

## Why the proposed Media Session settings cannot hide the controls

The [Media Session specification's model](https://w3c.github.io/mediasession/#model)
defines browser-guessed playback state from playing unmuted media elements.
Declared `playing` forces playing; other declared values defer to the guessed
state. The routing section explicitly says `playbackState` **must not affect
media session routing**. Therefore `none` means no declared state, not no
playing media and not a request to hide platform controls.

`metadata = null` supplies empty metadata. The spec's metadata algorithm concerns
metadata presented to the platform, not whether media actions or the platform
session exist. In Chrome specifically, the native implementation fills in page
metadata when the page provides none:

- [`MediaSessionImpl::BuildMetadata`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/media/session/media_session_impl.cc)
  falls back to the sanitized page title and origin/source title.
- In the same file, Android `IsControllable()` depends on audio-focus state and
  persistent (`kGain`) focus, not the declared `playbackState`.
- [`MediaSessionHelper.mediaSessionStateChanged`](https://chromium.googlesource.com/chromium/src/+/main/components/browser_ui/media/android/java/src/org/chromium/components/browser_ui/media/MediaSessionHelper.java)
  shows the Android media notification when the session is controllable and
  hides it when it ceases to be controllable. Metadata and favicon fallbacks
  populate the notification separately.
- `MediaSessionImpl::RebuildAndNotifyActionsChanged` automatically adds play,
  pause and stop when controllable because Chrome can operate the underlying
  players. Removing custom handlers with `setActionHandler(action, null)` does
  not remove this native capability.

[Chrome's first-party Media Session article](https://developer.chrome.com/blog/media-session/)
also explains that Android already shows an audio notification before the page
uses this API, using the document title and an icon. The API customizes that
notification; it does not opt the page into notification creation.

Do not treat `playbackState='paused'`, blank metadata, or a no-op play handler as
a visibility switch. No-op handlers could change what controls do without
removing them. Muting or stopping the real element changes playback, so it also
does not meet the requirement to retain the working soundtrack unchanged.

## OS Play can bypass the application's soundtrack wrapper

The source establishes this concrete chain:

1. Android `MediaSessionHelper.onPlay` calls `MediaSession.resume(UI)`.
2. [`MediaSessionImpl::Resume`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/media/session/media_session_impl.cc)
   delegates to the page only if a custom play action handler is registered.
   Otherwise `OnResumeInternal` calls `OnResume` on the underlying players.
3. [`MediaSessionController::OnResume`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/media/session/media_session_controller.cc)
   sends `GetMediaPlayerRemote(id)->RequestPlay(triggered_by_user)`.

That path does not call the application's `Soundtrack.play()` JavaScript
method. The app's `pause()` sets its intended `wanted=false`, but the OS can
request playback of the same media element afterward. A `playing` listener
that pauses again when `wanted` is false is a justified lifecycle invariant. It
preserves background/explicit-mute intent; it does not claim to remove the OS
notification. The parent owns implementation and regression tests.

## Web Audio alternative and costs

Current Chromium's
[`AudioContext` implementation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/audio_context.cc)
reports audible context playback as `media::MediaContentType::kAmbient`.
[`MediaSessionImpl::AddAmbientPlayer`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/media/session/media_session_impl.cc)
explicitly ignores ambient players for Android audio focus. Pure Web Audio
sources therefore avoid the ordinary persistent-player notification path in
this implementation. This is an implementation observation, not a portable
standard guarantee that Web Audio can never receive platform media UI.

Merely wrapping an existing streaming element in `MediaElementAudioSourceNode`
is not established as a solution: the media element still exists and
[`WebMediaPlayerImpl`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/media/web_media_player_impl.cc)
continues reporting its own metadata/playback with a duration-derived media
content type. The reviewed code does not expose a page-controlled notification
opt-out for that player.

The [Web Audio specification's AudioBuffer section](https://webaudio.github.io/web-audio-api/#AudioBuffer)
defines a memory-resident, per-channel 32-bit float PCM asset. It recommends
short buffers (usually less than a minute) and streaming an audio element for
longer music soundtracks. `decodeAudioData` works on supplied encoded file data
and produces this decoded buffer; its output is resampled to the context rate.

Read-only `ffprobe` of the actual current soundtrack files gave:

| Track | Duration | Compressed bytes | Approx. PCM at 44.1 kHz stereo |
| --- | ---: | ---: | ---: |
| `knights_gameplay_02.mp3` | 111.31 s | 1,558,309 | 37.45 MiB |
| `knights_gameplay_03.mp3` | 180.61 s | 2,528,549 | 60.77 MiB |

Both decoded together require about98.2 MiB, or106.9 MiB if decoded/resampled
at48 kHz, before object/decoder/transient-copy overhead. Compressed files total
about3.90 MiB. Estimates use `seconds × sample rate × channels ×4`; exact
decoded sample count can differ slightly from container duration. Receipts:
`media-controls-audit/track-memory.json`.

A future pure Web Audio soundtrack would need explicit position accounting,
source recreation when resuming, loop/track transition behavior, and lifecycle
suspension. Retaining only one decoded track would reduce memory but introduce
transition/decode work. A custom streaming decoder/worklet would avoid keeping
whole tracks decoded at the cost of substantially more code and verification.
Neither design has a demonstrated battery advantage here, and neither was
implemented or benchmarked by this audit.

## Existing WebAPK fullscreen updates do not require a reinstall

[Chrome's official manifest-update guidance](https://web.dev/articles/manifest-updates)
lists `display` and `orientation` among Android WebAPK update triggers. Chrome
checks the manifest on app launch subject to throttling, queues changed
metadata, and obtains an updated WebAPK. The documented flow waits for the PWA
windows to close, the device to be plugged in and Wi-Fi to be available. The
article describes a24-hour check interval and typical updates within a day or
two; these are browser-controlled scheduling details, not a promise for this
device or every Chrome release.

The practical distinction is that updating the website/service-worker files
does not necessarily update the already installed Android shell immediately.
A `display:'fullscreen'` change can reach an existing installation through the
normal WebAPK update path. Keep the manifest URL and app identity stable and
do not require reinstalling as the normal update procedure. The same article
documents `about://webapks` as a diagnostic/manual-update surface if needed.
No forced reinstall, browser-data deletion or user-save change was performed.

The fullscreen manifest requests app display mode; it is not evidence that all
Android system UI stays hidden in every user gesture, device state or Chrome
version. Physical installed-app verification remains separate.
