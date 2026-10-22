# Original mirrored Hell Gate machine ejection — 17 October 2026

User reported the arrow-shooting machine's black remains emerge near the
dragon hook when the castle/gate are on the left. This is reproduced in the
original executable, rather than a missing coordinate reflection in the port.

`probe_mirrored_gate.py` executes the original ballista pickup/capture and
425 world frames in both orientations, setting Player+0x12c through the
original initialization and intercepting the original GL matrix calls. At
tick334 it awards the sacrifice; tick335 draws the ejected pose. Its logical
x is129.567291 rather than the capture x233: ordinary captive recovery/movement
has already shifted it sideways. Normal screen x is130.287291; mirrored
screen x is349.712709, including that frame's0.72px shake. The two x values sum
to480. The mirrored hook at x360 is therefore close to the visible ejection,
matching the user's description.

Evidence: `artifacts/mirrored-gate-original.json`, pinned original executable
SHA256a4c5b8a013d79b55532e038674fbe752fdb98877cf54e5106251ae4e6d9330e1.
This is a seeded isolated native callback/matrix replay, not a recording of
the user's exact touches or GPU rasterization. Existing55-case gate and
528-scene world-render suites still pass, including mirrored transforms.
No engine ejection change was made because the requested baseline remains
the original1:1 behavior.

Subsequent user request: record original quirks and allow selective corrections.
`fixBallistaGate=1` now recenters the ballista's x at ejection, while the default
still matches the native replay above. See [the register](../docs/ORIGINAL-QUIRKS.md).
The new behavior is an explicit remake correction, not revised native evidence.
