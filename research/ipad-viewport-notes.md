# iPad viewport and Help loading

User reports iPadOS16.6.1: dragging the game moves/dismisses browser fullscreen; installed presentation can also move. Help takes time to open; otherwise plays okay. No model or offline/audio-specific acceptance supplied.

Historical WebKit source (near Safari16.6, not proof of the exact shipped OS binary):
https://github.com/WebKit/WebKit/blob/4776571d7bd69cdb89bb3315120497f74cc23064/Source/WebKit/UIProcess/ios/fullscreen/WKFullScreenWindowControllerIOS.mm
Lines805–816 add a one-touch downward swipe and a pan recognizer to the fullscreen view. Lines1216–1219 permit simultaneous recognition. The dismissal methods request fullscreen exit. This makes the browser-owned controller unsuitable for throwing controls; no attempt is made to override OS navigation gestures.

Change: Apple touch devices use the existing page-expanded view instead of requestFullscreen. Detection includes desktop-mode iPad (MacIntel plus multitouch); ordinary Mac and Android retain native fullscreen. Safari chrome may remain in browser expansion; Home Screen is the standalone route. Root overflow/overscroll is locked, body is fixed, and stage touchmove/dragstart prevent default except editable controls and the scrollable fallback panel. Physical iPad rubber-band behavior is not reproduced on this Mac and requires confirmation.

Help is already354,385bytes in one artwork pack and is included in the service-worker installation allowlist. Background warmup previously began after showing the menu, so a first Help tap could wait for download/decode. All five Help pages now finish decoding with the initial menu artwork, on every launch. This moves a small amount of work to startup; no artwork changes or extra downloads.

Before-change tests: node tests/viewport.mjs failed MacIntel/5 native fullscreen requests1!=0. node tests/help.mjs failed All Help pages must decode during initial loading. After-change full npm run check passes. Local browser checks at1024x768,768x1024,360x800,800x360 preserve3:2 with no page overflow. Stopped local server8945, reloaded, opened all five Help pages and Options→Done offline. Desktop Chromium, not physical Apple acceptance.
