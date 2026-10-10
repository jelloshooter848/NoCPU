# Pong browser distribution assessment

The source-only assessment in [license-audit.json](../tests/license-audit.json)
does not clear a compiled browser artifact. The separate
[browser-license-audit.json](../tests/browser-license-audit.json) covers only
the Pong frontend and its generated JavaScript/WebAssembly. Its concrete
component inventory and independent assessment review were established in
0.2.0 and retained for the 0.2.1 NoCPU-owned touch-control patch: core,
linked SDK families, pinned dependencies and notice bytes are unchanged.
Historical assessment hashes remain identified as the 0.2.0 baseline; current
artifacts require fresh provenance and matching source.
Previews and final releases must both pass this gate before distribution.

## Included components

The combined NoCPU browser application uses **GPL version 3** conservatively,
with each component's original terms and exceptions retained. DICE and
NoCPU-owned adaptations individually permit GPL-3.0-or-later. Historical nall
library evidence supports GPL version 3 for the included corresponding-source
archive; those nall/Phoenix libraries are not compiled into this Pong runtime.
No retroactive blanket ISC or public-domain claim is made.
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) records original-source
inventory and attribution.

| Component | Distribution basis | Retained material |
| --- | --- | --- |
| DICE Pong netlist, scheduler and chip models; maintained adapters/frontend | DICE GPL-3.0-or-later, combined conservatively under GPLv3 | Root GPL text, DICE author credit, matching original and maintained source |
| Emscripten 3.1.74 generated loader/runtime and support code | MIT option of its MIT/NCSA dual grant | Exact installed LICENSE and AUTHORS plus runtime copyright headers |
| Bundled LLVM libc++, libc++abi and compiler-rt portions | Apache 2.0 with LLVM exception | Exact installed LICENSE.TXT and CREDITS.TXT for each family |
| Bundled musl libc and math routines | MIT; current linked routines have no additional per-file terms | Exact installed COPYRIGHT and concrete linked-member inspection |
| dlmalloc 2.8.6 allocator | Doug Lea's CC0/public-domain dedication; Emscripten modifications MIT | Original dedication excerpt and Emscripten support notices |
| Vite 7.3.1 injected browser helpers | MIT | Exact package LICENSE.md |

Emscripten's license explicitly names its bundled musl copy and optional
third-party components. An SDK's presence is not proof that an optional library
was linked. The release inventory uses the actual compilation/dependency list,
linker inputs and production output. Thirty-one Pong/adapters translation units and
their project dependencies exclude Qt, SDL, OpenGL, X11, ManyMouse, nall and
Phoenix. The minimal owned `phoenix::Keyboard` type stub is not the archived
Phoenix library. Native reference toolchain licenses remain separate from
browser distribution.

LLVM's retained license contains the compilation exception: embedded object
portions resulting from compilation may be redistributed without sections
4(a), 4(b) and 4(d). NoCPU retains the complete license and credit records
anyway. This exception does not waive DICE/nall GPL requirements or establish
permission to redistribute an SDK container.

The installed Emscripten/LLVM/musl notices were compared byte-for-byte with the
3.1.74 SDK copy. Their SHA-256 values are retained in the audits. Vite's notice
matches the frozen npm dependency. The linked musl math members are
`__fpclassifyl`, `copysignl`, `fabsl`, `fmodl`, `frexp`, `lroundf`, `roundf`,
`scalbn` and `scalbnl`. Their concrete source files have no additional license
headers and fall under the overall musl COPYRIGHT. Separately licensed
Sun/FreeBSD/Arm math implementations are not linked in this target; revisiting
the member inventory is required if that changes.

## Exact source identities and inventory

- [Emsdk 3d6d8ee910466516a53e665b86458faa81dae9ba](https://github.com/emscripten-core/emsdk/tree/3d6d8ee910466516a53e665b86458faa81dae9ba)
  maps 3.1.74 to release bundle `c2655005234810c7c42e02a18e4696554abe0352`.
- [Emscripten 1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5](https://github.com/emscripten-core/emscripten/tree/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5)
  is the verified 3.1.74 tag and installed compiler source identity.
- [libc++](https://github.com/emscripten-core/emscripten/tree/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5/system/lib/libcxx),
  [libc++abi](https://github.com/emscripten-core/emscripten/tree/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5/system/lib/libcxxabi),
  [compiler-rt](https://github.com/emscripten-core/emscripten/tree/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5/system/lib/compiler-rt),
  [musl](https://github.com/emscripten-core/emscripten/tree/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5/system/lib/libc/musl)
  and [dlmalloc](https://github.com/emscripten-core/emscripten/blob/1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5/system/lib/dlmalloc.c)
  are the copies bundled in that Emscripten source tree.
- [Vite v7.3.1](https://github.com/vitejs/vite/tree/v7.3.1) is pinned with npm
  integrity data in the project lockfile; its published full license is retained.

The concrete linker map lists seven runtime archives: `libc++.a`,
`libc++abi.a`, `libc.a`, `libcompiler_rt.a`, `libdlmalloc.a`, `libnoexit.a` and
`libstubs.a`. Build provenance retains compiled sources, full flags, dependency
file and output hashes. The browser audit records the inspected evidence
hashes under ignored `build/core/` and `build/web-provenance.json`; later clean
builds may have different linker-map paths while using this same component set.

## Matching source and notices

Every distributed Pages preview or final artifact must contain:

- The original GPL text and applicable copyright/license/credit notices,
  accessible from the application.
- `source/nocpu-0.2.1-source.tar.gz`, built from the same checkout as the runtime
  and linked directly from the application. A future tag link is not a
  substitute for an available source download during preview testing.
- The source, browser and toolchain manifests identifying the build revision,
  preview/final stage, source archive checksum and actual output file checksums.

The corresponding source includes the immutable original DICE source, all
portable adaptations and frontend code, build/packaging scripts, pinned SDK
setup inputs, dependency lockfiles and notices. General-purpose compiler and
system-library dependencies are identified by version/source links; they are
not silently treated as NoCPU-owned code. Generated application glue is
reproducible through the retained build scripts.

The source packager excludes ROM payloads, private fixture repositories,
credentials, binaries and local evidence. Pong itself uses no game ROM. Game
trademarks and third-party ROM images are not licensed by DICE's GPL grant.

## Gate and review boundary

Preview packaging requires both license audits to be ready, with empty blocker
lists and complete hash-checked notice files. Final packaging additionally
requires the independent runtime/device readiness gates. Source readiness,
browser license readiness and physical phone readiness represent different
evidence and must not be inferred from one another.

Record the actual compiled input inventory and independent review outcome
before changing the browser audit to ready. Changes to the compiler version,
compiled library set, runtime options or frontend dependencies require another
assessment of affected components. This assessment covers the concrete Pong
browser artifact; it does not qualify native executables, toolchain container
redistribution, other games or ROM bundling.
