# Pause, held gestures, saves, and banner visibility

Primary source: `research/Knights`, SHA-256
`a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1`.
Executable fixture: `probe_pause_gestures.py`; captured results:
`pause-gestures.json`. Research only; no production or test edits.

## Ordinary touch Pause already has the correct release behavior

The original top-level Up dispatcher at `0x6840` calls Buttons first, then
CreepUp, DeviceUp and ObjectUp. The Pause button invokes actual InitPauseGame
`0x1c934`. That callback changes the pause flag/buttons and **does not release
the held knight or weapon**. The rest of the same Up event then releases it.

The fixture executes the actual button callback and actual world input for
three isolated live gestures. It captures world hashes at entry and return of
InitPauseGame, proving the callback itself does not mutate them:

| Gesture moved to and released at Pause (460,305) | Result after the entire Up |
| --- | --- |
| Held light knight | Becomes flying; sounds `[8,0]` (button), then `[2,0]` (throw) |
| Charged fireball | Device pressed clears, fireball launches with its accumulated charge; sounds `[8,0]`, then `[13,0]` |
| Armed ready Column | No column appears because release is outside activation radius; armed flag remains set; only `[8,0]` |

Actual ResumeGamePress `0x1ca54` clears pause without another release, reward
change, or sound. The callback itself does not emit the UI click: Buttons emits
that when invoked through touch input. Calling the callback directly should not
be mistaken for a silent original Resume button.

The current `web/game.mjs::releasePointer` releases once with the real Up
coordinates, clears `activePointer`, and then calls `pause()`. Although its
callback bookkeeping order differs, these ordinary touch outcomes match. In
particular, `save()` does not release the armed Column a second time at the old
press point once `activePointer` is null. No change to ordinary touch Pause is
justified by these cases.

## Direct callbacks preserve a gesture if no Up occurred

`callbacks` contains nine cases: held knight, charged fireball and armed Column,
each followed by direct InitPauseGame and one of:

- ResumeGamePress `0x1ca54`;
- OptionsGamePress `0x1cac8`, then actual Options Done `0x20238`;
- AbortGamePress `0x1ca78`.

All callbacks leave the entire creep/object/device pools byte-identical and
preserve score, gold and sacrifices. Resume returns to mode1. Options routes to
mode3; Done returns mode1 and requests the original menu/game music changes.
Campaign Abort routes to mode10 without awarding or releasing the held object.
The outgoing/incoming mode transition machinery is intercepted, so this proves
the callbacks, not every mode initializer/deinitializer or a complete Options
UI journey. Held knight/fireball before a direct callback is supplied through
real Down/Move, but a normal one-finger Pause tap necessarily includes Up first.

Current browser `pause()` calls `save()`, whose `activePointer !== null` branch
calls `core.release()`. Therefore Escape or an accessibility-keyboard Pause
while a pointer remains held releases the knight/weapon; a Column can fire at
its last pointer position. This differs from direct native InitPauseGame but
is **not** a demonstrated bug in ordinary mobile touch Pause. The original
UIKit view disables multiple touch and has no equivalent keyboard control.
Background/page lifecycle cancellation is an intentional browser adaptation;
it should be considered separately from foreground keyboard pause behavior.

## Saving does not release original actors

`save_held` executes real SaveGame `0x2516c` and LoadGame `0x24b80` with in-memory
stdio for each actor type. Each save is 59,868 bytes. Save leaves all captured
state unchanged. Serialized blocks are then deliberately overwritten, and Load
restores the held/pressed/charge state and entire world hashes exactly.

This is a same-process serialization check. Nonserialized input-selection
globals remain in the harness; it does not establish what pointer delivery or
selection should occur after a cold app restart. The existing browser decision
to discard transient capture on background/restore remains a separate platform
choice. No real native or browser save file was touched.

## Banners disappear during Pause in the original

The user's observed day-start banner behavior is authentic. In actual
`normalGame::Draw` (`0x20728`), the `_g_paused` test at `0x20768–0x20778` skips
the banner draw/update function `0x1e2fc` while paused. The same function handles
the day-start, Victory and Defeat banners.

`banners` executes the outer normalGame Draw and DrawNormalGame dispatch, with
individual world phases intercepted, and executes the actual banner draw
function. InitMode `0x20e1c` initializes the day-start banner; actual Land Process
`0x303a8` with elapsed time beyond duration initializes Victory, and Land Hit
`0x308e8` with lethal damage initializes Defeat. All three initialize Y=−600,
amplitude20, direction1, countdown4, phase0. After100 actual Draw frames, each
phase is captured before Pause, then after actual
InitPauseGame for three zero-dt paused frames, then after actual Resume:

| Phase | Before Pause | While paused | After Resume |
| --- | --- | --- | --- |
| Day start | flag, `DAY 1 of 8`, `GET READY!` | No banner commands | Same banner continues |
| Victory | flag, `VICTORY!` | No banner commands | Same banner continues |
| Defeat | flag, ` DEFEAT!`, `CASTLE\n     FALLEN!` | No banner commands | Same banner continues |

Banner Y and remaining time do not change in paused draws. Before Pause, frame100
has Y=−100; it stays there while hidden, then advances to−95 at frame101 after
Resume. `before.animation_frame` and `resumed.animation_frame` record these
indices for direct comparison to production `endFlagY(frame / 60)`. The fixture
supplies dt0 during Pause, matching the already
audited app render clock. It does not rely merely on a zero-dt flag routine:
the trace proves the flag function is not called at all while paused.

The production `screen === 'game'` banner condition is therefore correct and
should remain unchanged.

## Verification and limits

```sh
.venv/bin/python research/probe_pause_gestures.py
.venv/bin/python -m py_compile research/probe_pause_gestures.py
```

Both passed. Captures: nine callback cases, three complete release-to-Pause
cases, three held Save/Load cases, and three banner phases. OS audio/navigation,
GPU operations and real files are intercepted. Live held-state callbacks do not
advance battle physics. Banner phases are supplied deliberately and world
phase bodies are intercepted except the explicit Victory initialization; full battles and pause menu visual layout were
already covered elsewhere and are not claimed by this fixture.
