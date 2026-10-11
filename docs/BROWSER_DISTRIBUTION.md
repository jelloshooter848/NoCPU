# Pong browser distribution assessment

The source-only assessment in [license-audit.json](../tests/license-audit.json)
does not clear a compiled browser artifact. The separate
[browser-license-audit.json](../tests/browser-license-audit.json) covers only
the Pong circuit, NoCPU app and generated JavaScript/WebAssembly. The engine
and SDK inventory was established in 0.2.0 and retained for 0.2.1. Historical
assessment hashes remain identified as that baseline. The 0.3.0 app foundation
adds the pinned fflate ROM-import helper, exact MIT and supplemental UZIP
notices, preferred library source and imported-byte provenance. Its affected
component/source assessment and first actual 0.3.0 production inventory passed
independent review for that 0.3.0 artifact. The initial 0.3.1 collector/loading
source and actual production inventory also pass independent affected-component
review: 47 frontend inputs, seven runtime outputs and the unchanged linked
families/notices verify. No new dependency is added, and the browser license
audit is ready within that scope. Subsequent independent
[0.3.1 exact-main/public reviews](0.3.1_VALIDATION.md#published-preview-outcome)
verify the actual 93 public files, 725 preferred-source files and corresponding
provenance/notices. Physical-device acceptance remains separate. Current
artifacts always require fresh provenance and matching source.
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
| fflate 0.8.2 ZIP deflate helper | MIT | Exact Arjun Barrett license; preferred TypeScript/build source and exact npm imported-file identity |
| Explicit UZIP.js attribution within fflate | MIT supplemental notice; no separate runtime import | Exact Photopea license retained conservatively from the inspected source commit |

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
- [fflate v0.8.2 source commit d3243651cb142e3e04f3e4bc037b9e985878f444](https://github.com/101arrowz/fflate/tree/d3243651cb142e3e04f3e4bc037b9e985878f444)
  matches its npm gitHead. [The source manifest](../tests/fflate-source-manifest.json)
  retains npm integrity, 17 unmodified preferred-source/build file hashes and
  the three actual imported npm file hashes. The complete MIT notice matches
  both source and installed package bytes.
- fflate's preferred source and distributed browser entry explicitly reference
  algorithms similar to UZIP.js. The supplemental [Photopea MIT notice](licenses/UZIP-MIT-LICENSE.txt)
  is copied from [source commit 95071093542682c2d4ed9b4e91855110ade73ce2](https://github.com/photopea/UZIP.js/blob/95071093542682c2d4ed9b4e91855110ade73ce2/LICENSE).
  This records supported attribution, not an additional dependency import.

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
- `source/nocpu-0.3.1-source.tar.gz`, built from the same checkout as the runtime
  and linked directly from the application. A future tag link is not a
  substitute for an available source download during preview testing.
- The source, browser and toolchain manifests identifying the build revision,
  preview/final stage, source archive checksum and actual output file checksums.

The corresponding source includes the immutable original DICE source, all
portable adaptations and frontend code, build/packaging scripts, pinned SDK
setup inputs, dependency lockfiles and notices. General-purpose compiler and
system-library dependencies are identified by version/source links; they are
not silently treated as NoCPU-owned code. The non-system fflate runtime helper
has its complete preferred library source/build inputs under
`upstream/fflate-0.8.2/`, separately attributed and byte-identical to the pinned
upstream snapshot. Installed npm browser/package/license inputs are bound by
exact package integrity and expected imported hashes; they are reacquirable
through the frozen root lockfile rather than copied as node_modules into the
source archive. Build/package checks reject changed or omitted catalog,
preferred-source and imported dependency inputs. Generated application glue
is reproducible through the retained build scripts.

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
