# Reverse-engineering tools for Knights Onrush

Decision, 15 October 2026: **continue the working Capstone/Unicorn probes; add REA with Ghidra when a specific complicated gameplay function needs decompilation or call-graph analysis.** The two supplied repositories are useful, but neither converts an IPA into a finished browser game.

## Fit for this binary

The project has an unencrypted ARMv6 Mach-O with C++ symbols, extracted assets and working original-function probes. Asset inventory and symbol discovery are already covered. The original game also runs in touchHLE as a behavioral reference; the shipped remake will not include that emulator. See [project evidence](PROGRESS.md).

REA supplies a common CLI/MCP interface over analysis engines. Its native tools return assembly, pseudocode, references and recovered types. That would help navigate long weapon updates, enemy state machines and indirect calls. Its documentation explicitly distinguishes inferred static routes from observed execution and recovered types from original source. Existing Unicorn comparisons should remain the validation step. [REA native investigation](https://github.com/morluto/rea/blob/main/docs/native-investigation.md).

Ghidra is a plausible provider: upstream defines `ARM:LE:32:v6` and includes a Mach-O loader. This establishes relevant capabilities, not verified correct decompilation of this exact game. First test a known function with already measured behavior, including ARM/Thumb mode, floating-point handling and calling convention. [Ghidra ARM definitions](https://github.com/NationalSecurityAgency/ghidra/blob/master/Ghidra/Processors/ARM/data/languages/ARM.ldefs), [Mach-O loader](https://github.com/NationalSecurityAgency/ghidra/blob/master/Ghidra/Features/Base/src/main/java/ghidra/app/util/opinion/MachoLoader.java).

## What adds little right now

REA's Apple application graph reports paths, hashes, package anatomy and runtime-family hints. It does not reconstruct game logic, decode language metadata or prove runtime calls. That overlaps our completed IPA inventory. [Apple application analysis](https://github.com/morluto/rea/blob/main/docs/apple-application-analysis.md).

REA's documented built-in Objective-C/Swift metadata reader targets 64-bit little-endian structures; that is not evidence for this 32-bit C++ engine. Its native call observation launches a host process under LLDB, so it does not by itself provide an ARMv6 iOS runtime on a modern Mac. These limits do not prevent using a provider for static analysis. [Native investigation and observation boundaries](https://github.com/morluto/rea/blob/main/docs/native-investigation.md).

The awesome-reverse-engineering repository is a curated directory. Its relevant entries include Capstone, Unicorn, Ghidra and Hopper; it is not another engine or an automatic porting service. Use it to find a tool for an identified gap, not as an installation checklist. [Supplied collection](https://github.com/morluto/awesome-reverse-engineering).

## When to add REA

1. Select one unresolved function where assembly/probes leave a concrete question, such as weapon collision ordering or enemy-state dispatch.
2. Provision a compatible Ghidra/JDK outside this research task and verify the exact binary imports. Current REA documentation specifies Ghidra 12.1.x, a matching full JDK and a host-native decompiler. Existing checks found no Hopper/Ghidra installation in the checked application/PATH locations. [Provider requirements](https://github.com/morluto/rea/blob/main/docs/installation.md#ghidra).
3. Compare decompiled results with Capstone instructions and known input/output probes before trusting additional functions. Retain function addresses, constants, uncertain types and evidence for each recovered rule.

REA can be used from its CLI; an MCP registration is not required just to analyze a function. Its guided agent setup changes client configuration and workflow instructions and asks for an agent restart. No installation, license activation, setup command or configuration change was performed here. [REA setup and CLI](https://github.com/morluto/rea).

Exact ARMv6 IPA decompilation through REA remains untested. The benefit is faster investigation of difficult functions, not guaranteed source recovery or a shorter total porting schedule.
