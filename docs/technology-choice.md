# Browser engine choice: JavaScript or Rust/WebAssembly

Research date: 15 October 2026. Scope: the browser remake, approximately 100 enemies plus projectiles/effects, a fixed 480×320 logical playfield, optional HD artwork, Android first and iOS/iPadOS later. The actor count is a planning workload, not a recovered original limit.

## 1. Chosen architecture

**Use a compact Rust simulation compiled to WebAssembly, with JavaScript for browser input, rendering, audio, saves and offline installation.** JavaScript remains a credible implementation choice; the Rust decision rests on explicit numeric/state representation and reuse of simulation tests on the host and in Wasm, with a small measured CPU benefit. It does not establish a battery advantage. Basic WebAssembly has broad browser support, and Rust officially supports compilation to `wasm32-unknown-unknown`. This is newly written game logic running through the browser's Wasm runtime, without an iOS emulator or the original executable. [WebAssembly support](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface), [Rust target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html).

The simulation boundary fits the reconstruction workflow: recovered native mechanics can have explicit integer widths, floating-point operations and state transitions, then be checked against original-function probes. Rust does not guarantee fidelity or deterministic replay by itself; those require matched rules, inputs, random seeds and tests. Keep browser APIs outside the core. Canvas 2D versus WebGL is a separate decision from JavaScript versus Rust.

| Choice | Useful advantage | Cost or limit |
| --- | --- | --- |
| JavaScript simulation + Canvas 2D | Smallest initial implementation; direct input, audio and drawing APIs | Avoid allocations in the frame loop; profile rendering at HD resolution |
| Rust/Wasm simulation + JS renderer | Explicit memory layout, no Rust tracing GC, native test executable from the same simulation code | Additional build/binding work; conversions and boundary calls need design |
| Batched WebGL renderer with either simulation | Atlas batching can reduce sprite draw calls | More rendering code; GPU memory and fill cost still need control |

Rust's ownership model manages memory without a tracing collector; it does not remove garbage collection from the surrounding JavaScript/browser. A pure Rust library can run host tests with `cargo test` and compile separately for Wasm. The same test cases should also run against the browser build: native success alone does not establish Wasm correctness or speed. [Rust ownership](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html), [Cargo tests](https://doc.rust-lang.org/cargo/commands/cargo-test.html).

## 2. Where speed and battery usage come from

CPU simulation, JavaScript/Wasm interoperability, rendering, audio and display power are different costs. WebKit identifies CPU, GPU, networking and the screen as major power consumers. Reducing object churn, avoiding unnecessary drawing and letting idle work stop are actionable improvements with either language. A faster update function does not establish lower total device energy. [WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/).

Rendering remains browser/GPU work when its caller is Rust. MDN recommends caching repeated Canvas work, and for WebGL recommends fewer draw calls, texture atlases and a bounded back buffer. HD art does not require more physics computation. A 1440×960 back buffer contains nine times as many pixels as 480×320; this is arithmetic, not a measured ninefold energy increase. Keep the 3:2 logical world fixed and select rendering resolution separately. [Canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

For Rust, keep entities in long-lived Wasm memory, send input in batches and step the whole world per call. Expose a compact draw-state buffer instead of calling across the boundary for every entity property. Ordinary exported slice parameters can copy data; a JavaScript typed-array view over Wasm memory avoids that particular copy, but must be refreshed if memory grows. [Rust/Wasm interface design](https://rustwasm.github.io/docs/book/game-of-life/implementing.html), [current wasm-bindgen slice documentation](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html), [memory growth](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow).

Use a measured frame cap, fixed simulation steps and `requestAnimationFrame` timestamps. Pause simulation/audio when hidden, save progress, and reset elapsed-time accumulation on resume. Browsers normally pause animation callbacks in background tabs, and refresh rates vary; simulation must not accelerate on a 120 Hz display or catch up an hour of background time. [Animation scheduling](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## 3. Mobile compatibility and offline delivery

Both implementations can be static PWAs: HTML/JS, optional `.wasm`, assets, manifest and a service worker. Installation and offline caching are browser features independent of the simulation language. Serve the site over HTTPS; plain LAN HTTP is useful for a basic preview but is not the final install/offline test environment. iOS has an Add to Home Screen flow, but not Chrome's programmatic install-prompt API. [PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Cache the game and selected art/audio before showing “Ready offline”; save locally and test a fresh launch in airplane mode. Browser storage can be evicted or cleared, so request persistence when available and offer save export. Neither Rust nor PWA installation removes storage policy limits. [Offline storage](https://web.dev/learn/pwa/offline-data).

Use an ordinary single-threaded Rust target. OS filesystem calls do not become browser storage, and `std::thread::spawn` is not available through the ordinary browser target. Validate emitted Wasm features against the supported browsers. A worker can be added for measured main-thread congestion, but adds communication/startup costs and is not automatically a power optimization. [Rust target restrictions](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html), [Chrome team's Wasm performance guidance](https://web.dev/articles/webassembly-performance-patterns-for-web-apps).

## 4. Measurements and remaining acceptance checks

The desktop browser comparison ran a matched synthetic physics/projectile workload, with one call per simulation tick plus a JavaScript position-buffer scan. Each implementation warmed up for 1,200 ticks; nine trials alternated execution order, with 3,600 ticks per trial. The validation compared every Float64 state value after 600 ticks and checked matching accumulated outputs during timed runs. The stripped Wasm artifact is 17,035 bytes. Sources: [benchmark implementation](../benchmarks/simulation.mjs), [Rust implementation](../benchmarks/simulation.rs), [browser runner](../benchmarks/index.html).

| Entities | JavaScript median ms/tick | Rust/Wasm median ms/tick | Ratio |
| --- | ---: | ---: | ---: |
| 128 | 0.004667 | 0.002472 | 1.89× |
| 512 | 0.017278 | 0.009528 | 1.81× |

These are medians of trial-average tick times, not per-frame tail latency. The absolute saving is about 0.0022–0.0078 ms/tick, versus approximately 16.67 ms for a 60 FPS frame. Both were fast in this synthetic desktop workload. It contains no drawing, audio, real game logic or power measurement, and does not establish full-game or mobile performance. The separate saved Node run in `research/benchmark-results.json` has different timings; it must not be presented as the browser run.

1. Repeat the comparison with recovered game mechanics and original-function fixtures. Preserve output agreement; measure per-frame tail latency rather than relying on trial averages.
2. Profile full gameplay at the same art, resolution and frame cap on the Android test phone, then Safari/iOS. Separate simulation from renderer submission and check dropped frames and input response. A 60 FPS frame is approximately 16.67 ms, shared with browser/rendering work.
3. Compare sustained sessions with equal brightness, audio, workload and starting thermal conditions. Repeat alternating implementations; report measured energy only if measurement is available. Battery percentage from one short run cannot establish an efficiency advantage.
4. Confirm install, offline relaunch, save/load, interrupted audio and background/resume on both mobile platforms. Fixed aspect ratio and faithful throwing behavior remain acceptance requirements regardless of language.

Use Rust as the one production simulation implementation. Since the measured synthetic CPU cost is small, prioritize gameplay fidelity, artwork and rendering over further language-level optimization. Phone battery efficiency remains unmeasured.

## Source list

All sources above were opened during this research. The categories below collect the principal references.

- Runtime/toolchain: [Rust target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html), [WebAssembly support](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface), [Rust ownership](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html), [Cargo tests](https://doc.rust-lang.org/cargo/commands/cargo-test.html).
- Interoperability: [wasm-bindgen slices](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html), [memory growth](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow), [Chrome performance patterns](https://web.dev/articles/webassembly-performance-patterns-for-web-apps).
- Rendering/power: [WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/), [Canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
- Mobile lifecycle/delivery: [animation scheduling](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [offline storage](https://web.dev/learn/pwa/offline-data).
- Historical design reference: [Rust/Wasm interface chapter](https://rustwasm.github.io/docs/book/game-of-life/implementing.html). Its book is explicitly unmaintained; use it for the memory-interface explanation, not current setup commands. The [Rust project transition announcement](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) explains the old organization's retirement and wasm-bindgen's move to independent maintainers.

Browser benchmark median receipt: `research/browser-benchmark-results.json`; this is distinct from the Node/V8 report.

The later production-renderer check found and fixed refresh-jitter pacing:
about52.5FPS became60.0FPS in the same desktop late-game scenes. This differs
from the early language microbenchmark above; it is a browser scheduling fix,
not evidence of a Rust or battery advantage. See [rendering measurements](RENDERING.md).
