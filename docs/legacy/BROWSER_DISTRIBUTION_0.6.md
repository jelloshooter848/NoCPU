# Legacy browser distribution assessment (0.2.0–0.6.0)

> Legacy-line record, kept as history. The current assessment is [docs/BROWSER_DISTRIBUTION.md](../BROWSER_DISTRIBUTION.md) with [tests/browser-license-audit.json](../../tests/browser-license-audit.json).
> The legacy audit file these sections describe is preserved at [tag legacy-0.6.0](https://github.com/jelloshooter848/NoCPU/blob/legacy-0.6.0/tests/browser-license-audit.json).

## Legacy 0.6.0 assessment

The legacy 0.6.0 browser scope added original Stunt Cycle and Indy 4 to the
delivered four circuits, including a core ROM adapter and player-supplied local
file launch. The selected source/metadata is not distribution approval. The
audit required fresh actual
compiler/dependency/link-member/frontend/preferred-source evidence before
packaging. Retained 0.5.0 findings below remain identified historical evidence;
they do not qualify changed output hashes.

Audit new chip-ROM and selected-game source inputs, actual native/Wasm linker
members, frontend/fflate source and all applicable notices. Observer-only native
zlib linkage used to retain lossless selected-game full-RGB evidence is distinct
from the actual browser-linked inventory. A source-package assessment does not
clear native binaries or containers for distribution. Keep private ROMs and
credentials absent from corresponding source, notices, packages and CI logs.
Both games' inherited absent active audio hookups do not authorize synthesized
replacement sound. Current component review permits local candidate packaging;
actual archive review remains pending, and
the [validation ledger](0.6.0_VALIDATION.md) records acceptance as it occurs.

The actual v4 compiled snapshot links seven archive families and 145 concrete
members (libc 101, compiler-rt 18, libc++ 12, libc++abi 10, dlmalloc 2, noexit 1,
stubs 1). Its 26 musl math members add only `fmod.o`
to the historical 25-math/144-member set. The pinned SDK's `src/math/fmod.c` has no
additional leading copyright/license header (SHA-256
`33fb61093e04783081b9e8f8a8a303456b2f919c215cd0c378c1ed0acf41934c`);
existing complete musl COPYRIGHT and Emscripten MIT notices cover it. The
historical 25-member basis below remains separately identified. Independent
build-only review verified the v4 input/output hashes. Those bytes were later
superseded by observation/ownership repairs and did not qualify complete
component/frontend/source archive acceptance. License readiness was false at
that snapshot; the current contract acceptance below records the refresh.
Narrow independent v4 core component/notices acceptance is recorded in
`build/v060-review/core-component-actual-notices-v1.json`, SHA-256
`67772458a84da232162f69f4a9350cf80b0761bbf2710b260e8c71e576398dc6`.
It verifies all 27 notice hashes and exact pinned SDK license/author bytes;
fresh repaired runtime/member binding and current frontend/preferred-source/
archive/privacy/package acceptance remain separate requirements.

Current ownership-repaired core/member closure and production frontend/
preferred-source contract now pass independent review for **local candidate
packaging eligibility**. Receipt:
`build/v060-review/current-components-frontend-preferredsource-contract-v2.json`,
SHA-256 `b41deddb7bc91bb1d598cfb2bf43acc94bd48fa2ee008ad260f15ad74dcdd56d`.
It verifies all 582 current Wasm source inputs and outputs, unchanged 145
members/26 math sources, 54 frontend inputs/11 runtime outputs, 17 preferred
and three imported fflate identities, all 27 notices and current icon recipe/
assets. The browser license audit may therefore permit local packaging.
Actual produced archive/source/privacy/package, gameplay/fidelity, browser,
committed CI and public delivery remain mandatory separate acceptance gates.
Overall release/device readiness remains false.

## Historical 0.5.0 component/license basis

That development scope added online iPhone Home Screen/standalone
metadata and reproducible icons, alongside the selected Breakout circuit.
The [browser license audit](https://github.com/jelloshooter848/NoCPU/blob/legacy-0.6.0/tests/browser-license-audit.json) records actual
compiled/dependency/link-member, frontend/icon and preferred-source reviews.
The preliminary V2 local candidate is accepted within its recorded snapshot;
the affected renderer's V3 core and fresh frontend V3 basis now pass for the
next local candidate with current matching provenance.
Retained 0.4.0 approval is
historical and does not qualify changed outputs. Every local candidate still
requires current provenance and independent actual archive/source/public-
payload review; fidelity/browser/CI/public and physical readiness are separate.

The first fresh 0.5.0 core build records 54 Wasm / 55 native translation units,
with every recorded current input and snapshot output matching. Its actual
Wasm map links seven archive families and 144 members, including 25 musl math
members. Breakout adds six Sun-derived trigonometric members (`cosf`, `sinf`,
`__cosdf`, `__sindf`, `__rem_pio2f`, `__rem_pio2_large`), Arm's `log`/`log_data`,
and `floor`, `__math_divzero`, `__math_invalid`. The six concrete Sun headers
carry their original notice-preservation grant; the Arm log sources/supporting
header carry 2018 MIT SPDX notices. Their exact pinned source identities and
verbatim headers join the retained
[supplemental math notice](../licenses/musl-emscripten-3.1.74-MATH-NOTICES.txt).
The latter three routines have no additional leading copyright/license header.
Independent actual core/member/notice review accepts this concrete basis in
`build/v050/review/core-component-v2-actual-license-review.json` (SHA-256
`1dda5d8119e85615b999c09f2a370de31084431849db5b0f1b32a7af68b0ff5f`).
Actual frontend/preferred-source contract review also passes in
`build/v050/review/frontend-component-v2-actual-license-contract-review.json`
(SHA-256 `bfc2da7157e35bb37eba641bc58417c337ab6107ee43ce82fa0409c56a6616a7`):
54 current inputs, eleven exact runtime files, 27 applicable notices and unchanged
17 preferred fflate / three npm inputs agree. The opaque PNGs reproduce from
the required SVG/recipe; canonical manifest/Apple links and generated source
identities match. This permits producing a local review candidate with current
provenance. Independent inspection of its actual archive/source/public payload
remains mandatory afterward, before PR/public distribution.

The later generic horizontal raster correction passes actual core V3 review:
`build/v050/review/core-component-v3-actual-license-review.json` (SHA-256
`67d9990d40d90107745b5a77e73f3aeb6b05b36f734907790aa9d920fdbf81b5`).
All current input/output hashes match; translation units, seven archives /
144 members, 25 math sources and notice terms remain unchanged. Its changed
Wasm is now bound by fresh frontend V3 review:
`build/v050/review/frontend-component-v3-actual-license-contract-review.json`
(SHA-256 `f73ac4b042ffd6036480ff6b74065dfec12faee414dd48126e7ba916a1eb657f`).
All 54 unchanged compile inputs, eleven exact runtime files, current notices
and preferred dependency/icon sources match. Runtime SHA-256 is
`c6ded08c4a07a1521d1e67df079d409bf73afcc2421016b5d0549b3a52df7a8a`.
This permits local candidate preparation with current provenanced outputs;
actual source/archive/public-payload inspection remains mandatory afterward.

## Historical 0.4.0 expanded component/license scope

The delivered 0.4.0 version adds Pong Doubles and Space Race to Pong.
The old Pong-only assessment does not approve this expanded executable:
fresh compiled translation units, dependencies, linker members and frontend
provenance must be independently reviewed. The actual successful local Wasm
build has 42 translation units, seven runtime archive families and 133 linked
members. Fourteen concrete musl math members include the prior nine plus
`exp`, `exp_data`, `__math_oflow`, `__math_uflow` and `__math_xflow`.
The exp/exp_data source and supporting header carry Arm's 2018 MIT notice;
their [verbatim headers and MIT grant](../licenses/musl-emscripten-3.1.74-MATH-NOTICES.txt)
are retained. Independent review accepts that actual core/member/license basis.
The three math helpers have no additional copyright/license header and remain
covered by the complete musl COPYRIGHT. Independent actual frontend/component
review also accepts seven exact runtime files, 48 inputs, 27 notices and the
unchanged MIT fflate preferred/runtime source, together with the matching-source
packaging contract. The browser **license** audit is ready for local candidate
preparation within that scope. A later owned GPL interface-copy change adds no
license blocker; the initial affected frontend rebuild and independent actual
48-input/seven-output provenance read close that initial stale-source limitation.
The preliminary local package and actual archive/notices/source review pass
within their recorded scope. Subsequent report-scope and host-raster repairs
require fresh frontend provenance and final matching-source packaging. The
refreshed frontend v3 now passes independent actual 48-input/seven-output/
27-notice review and permits current local packaging; actual archive/source
review remains mandatory next. The
affected renderer core independently retains exactly the same seven archives,
133 members and fourteen math routines, with all recorded current native/Wasm
input/output hashes matching; no speculative new component term is introduced.
The [0.4.0 validation outcome](0.4.0_VALIDATION.md) records the independently
accepted matching package/source, gameplay/fidelity, committed/exact-main CI
and public/live delivery. Physical qualification and final tags remain pending.
These component snapshots remain historical; every later artifact still needs
current matching provenance and independent acceptance.
The original source, existing component notices and historical assessments
below remain identifiable. Source-only licensing and pending physical-device
qualification are separate from this compiled-distribution gate.

## Historical Pong/app assessment through 0.3.1

The source-only assessment in [license-audit.json](../../tests/license-audit.json)
does not clear a compiled browser artifact. The separate
[browser-license-audit.json](https://github.com/jelloshooter848/NoCPU/blob/legacy-0.6.0/tests/browser-license-audit.json) covers only
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
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) records original-source
inventory and attribution.

| Component | Distribution basis | Retained material |
| --- | --- | --- |
| DICE four-game netlists, scheduler and chip models; maintained adapters/frontend/SVG-derived icons | DICE GPL-3.0-or-later, combined conservatively under GPLv3 | Root GPL text, DICE author credit, matching original and maintained source, preferred icon SVG/recipe |
| Emscripten 3.1.74 generated loader/runtime and support code | MIT option of its MIT/NCSA dual grant | Exact installed LICENSE and AUTHORS plus runtime copyright headers |
| Bundled LLVM libc++, libc++abi and compiler-rt portions | Apache 2.0 with LLVM exception | Exact installed LICENSE.TXT and CREDITS.TXT for each family |
| Bundled musl libc and math routines | MIT for musl/Arm portions; six concrete Sun-derived trigonometric routines retain their permissive notice-preservation grant | Exact installed COPYRIGHT, supplemental verbatim headers and concrete linked-member inspection |
| dlmalloc 2.8.6 allocator | Doug Lea's CC0/public-domain dedication; Emscripten modifications MIT | Original dedication excerpt and Emscripten support notices |
| Vite 7.3.1 injected browser helpers | MIT | Exact package LICENSE.md |
| fflate 0.8.2 ZIP deflate helper | MIT | Exact Arjun Barrett license; preferred TypeScript/build source and exact npm imported-file identity |
| Explicit UZIP.js attribution within fflate | MIT supplemental notice; no separate runtime import | Exact Photopea license retained conservatively from the inspected source commit |

Emscripten's license explicitly names its bundled musl copy and optional
third-party components. An SDK's presence is not proof that an optional library
was linked. The release inventory uses the actual compilation/dependency list,
linker inputs and production output. The historical thirty-one Pong/adapters translation units and
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
matches the frozen npm dependency. The historical Pong-only musl math members were
`__fpclassifyl`, `copysignl`, `fabsl`, `fmodl`, `frexp`, `lroundf`, `roundf`,
`scalbn` and `scalbnl`. Their concrete source files have no additional license
headers and fall under the overall musl COPYRIGHT. Separately licensed
Sun/FreeBSD/Arm math implementations were not linked in that historical target.
The expanded current inventory and required supplemental terms are recorded
above; every affected build must revisit the actual member inventory.

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
  matches its npm gitHead. [The source manifest](../../tests/fflate-source-manifest.json)
  retains npm integrity, 17 unmodified preferred-source/build file hashes and
  the three actual imported npm file hashes. The complete MIT notice matches
  both source and installed package bytes.
- fflate's preferred source and distributed browser entry explicitly reference
  algorithms similar to UZIP.js. The supplemental [Photopea MIT notice](../licenses/UZIP-MIT-LICENSE.txt)
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
- `source/nocpu-0.4.0-source.tar.gz`, built from the same checkout as the runtime
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
assessment of affected components. The historical 0.5.0 assessment covers the
four selected browser circuits and online Home Screen assets within the accepted
component/source-contract scope above. It does not qualify
native executables, toolchain container redistribution, the other seventeen
games, ROM bundling, gameplay or physical readiness.
