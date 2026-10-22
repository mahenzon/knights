# Historical iPhone libc: rand and qsort

Investigated 2026-10-16 against Apple's published source and documentation. **No production RNG or tie-order change is justified as an exact iPhone reproduction yet.** The evidence strengthens the Park–Miller candidate, corrects which qsort source would actually build, and exposes a release-version gap.

## Release identity is still missing

Apple's official [Mac OS X 10.6.3 manifest](https://github.com/apple-oss-distributions/distribution-macOS/blob/mac-os-x-1063/release.json) explicitly names `Libc-594.1.4`. In contrast, [10.6](https://github.com/apple-oss-distributions/distribution-macOS/blob/mac-os-x-106/release.json) names `Libc-583`, and [10.5.8](https://github.com/apple-oss-distributions/distribution-macOS/blob/mac-os-x-1058/release.json) names `Libc-498.1.7`. Therefore `594.1.4` is a verified **desktop release source**, not a version proven to run the 2009 IPA.

The first-party iPhone release manifests for [2.0](https://github.com/apple-oss-distributions/distribution-iOS/blob/iphone-20/release.json), [3.0](https://github.com/apple-oss-distributions/distribution-iOS/blob/iphone-30/release.json), [3.1](https://github.com/apple-oss-distributions/distribution-iOS/blob/iphone-31/release.json), and [3.1.3](https://github.com/apple-oss-distributions/distribution-iOS/blob/iphone-313/release.json) do **not list Libc or Libsystem**. This does not mean those libraries were absent from the OS; it means these public manifests cannot establish their version. Do not infer a matching libc tag from matching release year, Darwin version, or API names.

## Actual iPhone/ARM build path in Libc-594.1.4

The immutable source commit behind the tag is `0d7a000256faa8e750c97ebd703e5d01a5c26fb6`.

| Finding | Primary source |
| --- | --- |
| The tree has an explicit iPhone platform configuration. `Makefile.features` includes `Platforms/${RC_TARGET_CONFIG}/Makefile.inc`; the top Makefile defaults to `MacOSX` only when that variable is absent. | [Makefile](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile#L20-L24), [Makefile.features](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile.features#L1), [iPhone configuration](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Platforms/iPhone/Makefile.inc) |
| `armv*` is mapped to `MACHINE_ARCH=arm`; the ARM configuration adds `-mthumb` for `armv6`. The tag's `arm/stdlib` contains only `gdtoa.mk`, with no rand/qsort replacement. | [BSDmakefile](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/BSDmakefile#L55-L58), [arm/Makefile.inc](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/arm/Makefile.inc), [ARM stdlib tree](https://github.com/apple-oss-distributions/Libc/tree/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/arm/stdlib) |
| rand and qsort enter through the machine-independent FreeBSD source list. Files with a `.patch` are patched before use; otherwise the build creates a symlink. | [stdlib/Makefile.inc](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/stdlib/Makefile.inc#L4-L26), [Makefile.fbsd_end](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile.fbsd_end), [autopatch recipe](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile.inc#L19-L31) |
| These objects are intended to be merged into libSystem rather than a standalone libc.dylib. | [Makefile.xbs introduction](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile.xbs#L1-L12) |

This proves an iPhone-targeted build path exists in the published tree. It does not prove Apple shipped that precise tree or invocation in the target firmware.

## rand: default branch is better supported, not hardware-proven

`stdlib/rand-fbsd.c` is a symlink to the original FreeBSD source; there is no rand patch in this tag. Its default `do_rand` branch is Park–Miller: multiplier 16807, modulus 2147483647, and special replacement of zero state with 123459876. The alternate `USE_WEAK_SEEDING` branch uses `state * 1103515245 + 12345`. `srand` assigns the unsigned seed directly to the shared state. [Actual source](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/stdlib/FreeBSD/rand.c#L55-L116).

No `USE_WEAK_SEEDING` definition appears in the inspected top-level, platform, ARM, stdlib, FreeBSD, or variant build files saved with these notes. There is no rand-specific flag in the stdlib build file. **Inference:** an ordinary build of this published configuration uses Park–Miller. However, the build accepts external `RC_NONARCH_CFLAGS`, reads external `CoreOS/Standard` makefiles and SDK headers, and the historical build invocation is unavailable. This remains weaker than the exact compiled ARM routine. [Compiler flags](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile#L14-L15), [external flags](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/Makefile#L52-L65).

The older [Libc-498.1.7 rand source](https://github.com/apple-oss-distributions/Libc/blob/7198b93dbba0617e5927ff5a5e783f0e54ff957b/stdlib/FreeBSD/rand.c) is byte-identical to the saved 594 source (`cmp` passed). This establishes continuity across two published desktop releases, not their iPhone build flags.

Apple's archived [iOS srand manual](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/srand.3.html) promises repeatability for the same seed and default seed 1, but does not specify the recurrence. The similarly named `rand.3.html` URL unexpectedly contains the OpenSSL RAND manual; it is not evidence for libc `rand`.

## qsort: the previously saved file is not the final Apple source

`research/apple-qsort-594.c` corresponds to `stdlib/FreeBSD/qsort.c`, the **unpatched upstream input**. The actual build input is [`stdlib/qsort-fbsd.c`](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/stdlib/qsort-fbsd.c), after applying [Apple's qsort patch](https://github.com/apple-oss-distributions/Libc/blob/0d7a000256faa8e750c97ebd703e5d01a5c26fb6/stdlib/FreeBSD/qsort.c.patch). Applying that patch to the existing local upstream file and comparing with the downloaded final source produced a byte-for-byte match.

The final source retains Bentley–McIlroy partitioning but adds a `2 * floor(log2(n))` depth limit with heapsort fallback, moves equal-element block swaps ahead of the insertion-sort fallback, and bounds that fallback's swaps before returning to partition recursion. Consequently an unpatched upstream transcription is not an exact model of even this Apple candidate.

The older [498.1.7 final qsort source](https://github.com/apple-oss-distributions/Libc/blob/7198b93dbba0617e5927ff5a5e783f0e54ff957b/stdlib/qsort-fbsd.c) does not contain that depth limit or heapsort fallback. Version uncertainty can therefore matter to ordering, even though the broad algorithm family is the same.

Apple's archived [iOS qsort manual](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/qsort.3.html) explicitly says qsort is unstable and the relative order of members comparing equal is undefined. Thus pool-order ties are a remake policy, not an API-guaranteed original behavior.

A local host check of the downloaded **594 patched C algorithm**, renamed to avoid the host qsort, sorted seven equal-key records with initial ordinals `0 1 2 3 4 5 6` into `3 1 2 0 4 5 6`. The middle-pivot swap explains this directly in the source. This check illustrates candidate instability only; it did not run on ARM or an iPhone. The host build emitted the expected legacy non-prototype warning for `swapfunc`.

## Decision and missing evidence

- Keep the explicit limitations around xorshift and stable ties. Replacing either now would trade a declared approximation for an unproven historical choice.
- Correct any research description that treats the saved unpatched 594 qsort as Apple's final build source. If candidate comparison is needed, use `apple-libc-primary/Libc-594.1.4/stdlib/qsort-fbsd.c`.
- To claim exact reproduction, obtain the target device/OS build and either its original libSystem `rand`/`srand`/`qsort` ARM disassembly or controlled outputs from that build. A few `srand` vectors distinguish the RNG branches; equal-key/mixed-key and adversarial qsort inputs distinguish ordering behavior. A simulator or touchHLE implementation alone does not establish original iPhone behavior.
- Algorithm identity alone will not recover the live game's sequence: the seed, complete call order and sort input order must also match. The parent audit is independently correcting native loading-hint RNG consumption; this note neither changes nor re-verifies that work.

## Saved evidence

`research/apple-libc-primary/` contains exact fetched build/source files with original paths and the selected official release manifests. `stdlib/rand-fbsd.c` preserves the original symlink to the saved FreeBSD source. Fetch base URLs are `https://raw.githubusercontent.com/apple-oss-distributions/<repository>/<tag>/<original-path>`; the directory names identify repository/tag except the Libc directories, whose repository is `Libc`.

The final patched 594 qsort SHA-256 is `419978fc01b00aa86555199dc0854abb006cb4c0c55ec5071bb3894cc5de2607`. No production files, dependencies, runtime options or fixtures were changed. No firmware image was downloaded, no original-device build was run, and no exact-iPhone claim is made.
