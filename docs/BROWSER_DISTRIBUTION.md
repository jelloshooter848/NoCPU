# Browser distribution assessment

This records what the published browser build contains, which licenses apply
to each part, and how the matching source is delivered. The machine-readable
record is [tests/browser-license-audit.json](../tests/browser-license-audit.json);
`tools/package-web.py` refuses to package a build unless that record is ready
for the current `VERSION` and every notice it lists is present and unchanged.

The legacy line's assessments (0.2.0 through 0.6.0) are history in
[legacy/BROWSER_DISTRIBUTION_0.6.md](legacy/BROWSER_DISTRIBUTION_0.6.md).

## 0.5.0 assessment (2026-10-20)

**Result: ready** (the porting agent's review, not an independent one). This
re-checks the actual local packaged build of `wip/0.5.0-rom-batch-a`, which
adds Anti-Aircraft, Shark Jaws, Jet Fighter and Attack, against a fresh
rebuild of v0.4.0 (which reproduced its `core/nocpu.wasm`, `1ef66c15…`, byte
for byte). The audit's `version` field is bumped by the release commit.

- **Runtime:** the same seven files as 0.4.0 (`core/nocpu.wasm` `59c3dd77…`).
- **Compiled code:** seventeen circuits. The linker map has 105 compiled
  units, 14 more than 0.4.0: the four DICE circuits, their four NoCPU
  registrations (`core/games/<id>.cpp`) and six DICE chips (8225, 74116,
  74191, 7495, 7496, 82S131), all GPL-3.0-or-later under the existing DICE
  notice or NoCPU's own code.
- **Anti-Aircraft's random generator:** `nocpu_glibc_rand()` in `core/api.cpp`
  is NoCPU's own independent implementation of the published TYPE_3
  additive-feedback recurrence and Park–Miller seeding, matching glibc's
  `rand()` output; no glibc source is copied, so no LGPL text is needed
  ([UPSTREAM_PATCHES.md](UPSTREAM_PATCHES.md)).
- **SDK members:** 149, the identical set to 0.4.0 (libc 103 with the same 27
  math members, compiler-rt 18, libc++ 12, libc++abi 11, libunwind 1,
  dlmalloc 2, noexit 1, stubs 1). No new component, so no new notice.
- **Notices:** `THIRD_PARTY_NOTICES.md` now names the seventeen circuits; its
  hash is updated in both audits. The other 27 notices match their recorded
  hashes.
- **Dependencies:** still one npm runtime dependency, fflate 0.8.2.
- **Source archive and ROMs:** 930 files (every tracked file plus
  `RELEASE-MANIFEST.json`, all 566 original DICE files) and no ROMs or build
  output; the packaged `notices/` holds 118 files. The ROM-exclusion test
  passes with the ten private fixture archives (44 members) present.

The record's `review.findings` hold the hashes and counts.

## 0.4.0 assessment (2026-10-19, history)

**Result: ready** (an agent's review, not an independent one). This re-checks
the actual local packaged build of `restart/desktop-first` after the 0.4.0
merge (`a75a826`: part 1's speed changes and the Pin Pong sound and free-game
reconstruction) and its review fixes, against a fresh rebuild of v0.3.0 (which
reproduced its `core/nocpu.wasm`, `940ca7fc…`, byte for byte). The audit's
`version` field is bumped by the release commit.

- **Runtime:** the same seven files as 0.3.0 (`core/nocpu.wasm` `1ef66c15…`,
  `core/nocpu.js` `eadbe7c7…`).
- **Compiled code:** the same thirteen circuits. The linker map has 91 compiled
  units, one more than 0.3.0: NoCPU's Pin Pong sound-board model
  (`core/games/pinpong_sound.cpp`). The free-game jumper chip is NoCPU code in
  the prepared `games/pinpong.cpp`, a derived copy of the unchanged DICE
  layout made by `tools/prepare-core.py`.
- **Flags:** part 1 builds with WebAssembly exception handling
  (`-fwasm-exceptions`), which links the exception-handling variants of the
  same SDK libraries.
- **SDK members:** 149 (0.3.0: 147). Four differ: libc++abi's
  `cxa_exception_emscripten.o` became `cxa_exception.o` and
  `cxa_exception_storage.o`; compiler-rt's `emscripten_exception_builtins.o`
  became `__trap.o` (a two-line Emscripten file without a header, under the
  retained Emscripten and compiler-rt notices); and **LLVM libunwind** is linked
  for the first time (`Unwind-wasm.o`, Apache-2.0 WITH LLVM-exception). libc
  (103, the same 27 math members), dlmalloc, noexit and stubs are unchanged.
- **New notice:** [LLVM-libunwind-3.1.74-LICENSE.txt](licenses/LLVM-libunwind-3.1.74-LICENSE.txt),
  byte-identical to the SDK's `system/lib/libunwind/LICENSE.TXT` (the SDK has
  no CREDITS file for it), listed in `THIRD_PARTY_NOTICES.md`, both audits and
  `tools/package-web.py`. All 28 notices match their recorded hashes.
- **Dependencies:** still one npm runtime dependency, fflate 0.8.2.
- **Source archive and ROMs:** 898 files (every tracked file plus
  `RELEASE-MANIFEST.json`, all 566 original DICE files, the new notice) and no
  ROMs or build output; the packaged `notices/` holds 118 files. The
  ROM-exclusion test passes with the ten private fixture archives (44 members)
  present.

The record's `review.findings` hold the hashes and counts.

## 0.3.0 assessment (2026-10-18, history)

**Result: ready** (a porting agent's review, not an independent one). This
re-checks the actual local packaged build of `restart/desktop-first` after the
0.3.0 merge (`f60a064`) and its review fixes, which change only `web/`, docs
and release metadata, against the v0.2.0 build reviewed for 0.2.1 (which 0.2.2
carried forward). The audit's `version` field is bumped by the release commit.

- **Runtime:** the same seven files as 0.2.1. A fresh `./tools/build-core.sh
  all` reproduced `core/nocpu.wasm` (`940ca7fc…`) and `core/nocpu.js`
  (`1b527316…`) byte for byte: the module the 0.3.0 original/native/Wasm
  comparison ran.
- **Compiled code:** thirteen circuits, adding TV Basketball, Pin Pong and
  Hi-Way. The linker map has 90 compiled units, thirteen more than 0.2.1: the
  three circuit sources (Hi-Way's is `games/highway.cpp`), their
  `core/games/` registrations and the DICE chips 2533, 74151, 74155, 7442, 7454,
  9314 and `wired_logic`, all DICE GPL-3.0-or-later or NoCPU code.
- **Flags:** the only Emscripten flag change is the larger memory limit
  (`-sMAXIMUM_MEMORY=2147483648`, for Pin Pong); it links no extra code.
- **SDK members:** the identical set of 147 linked Emscripten SDK members as the
  0.2.0 build's map, including the same 27 musl math members, so no new notice.
- **Dependencies:** still one npm runtime dependency, fflate 0.8.2.
- **Notices:** all 27 match their recorded hashes; only `THIRD_PARTY_NOTICES.md`
  changed, its Browser runtime paragraph now naming the thirteen circuits.
- **Source archive and ROMs:** the source archive holds 888 files (every tracked
  file plus `RELEASE-MANIFEST.json`, all 566 original DICE files) and no ROMs or
  build output; the ROM-exclusion test passes with the ten private fixture
  archives (44 members) present.

The record's `review.findings` hold the hashes and counts.

## 0.2.1 assessment (2026-10-17, history)

This section records the 0.2.1 assessment as reviewed; the current record is
the 0.4.0 assessment above.


**Result: ready** (the integrating agent's review, not an independent one).
Releases 0.1.2 to 0.2.0 carried the 0.1.1 assessment below forward with only
the version fields bumped; this assessment re-checks the actual local build of
the v0.2.0 release commit (`1a8a55f`), which 0.2.1 ships unchanged apart from
docs, the audit record and a packaging check.

- **Runtime:** the same seven files as 0.1.1. The application bundle is the one
  served by the Pages site and shipped in `nocpu-0.2.0-web.tar.gz`.
- **Compiled code:** ten circuits — Pong, Pong Doubles, Space Race, Breakout,
  Rebound, Gotcha, Quadrapong, Crossfire, Stunt Cycle and Indy 4. The 0.2.0
  games add ten compiled units (four circuits, their `core/games/` registrations
  and the DICE chips 7492 and 9321), all DICE GPL-3.0-or-later or NoCPU code.
- **SDK members:** the identical set of 147 linked Emscripten SDK members as the
  0.1.x build, including the same 27 musl math members, so no new notice.
- **Dependencies:** still one npm runtime dependency, fflate 0.8.2.
- **Notices:** all 27 unchanged except `THIRD_PARTY_NOTICES.md`, whose text now
  names the ten circuits.
- **Source archive and ROMs:** the source archive holds every tracked file and
  no ROMs or build output; the ROM-exclusion test passes with the ten private
  fixture archives present.

The record's `review.findings` hold the hashes and counts.

## 0.1.1 assessment (2026-10-13)

**Result: ready; final independent review accepted (at `bd5aaa0`).**
Scope: the 0.1.1 desktop build on `restart/desktop-first`, which compiles the
same six DICE circuits (Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle,
Indy 4) with Emscripten 3.1.74, includes the Indy 4 renderer fix, and replaces
the legacy frontend with the minimal desktop interface. The touch controls, the
Home Screen manifest and PNG icons, `tools/render-icons.mjs` and the
qualification collector are gone. The assessment covers browser JS, Wasm and
asset distribution only. It makes no gameplay, accuracy or browser-compatibility
claim, and it does not clear native binaries, toolchain containers or ROMs. The
audit's `version` field stays `0.1.0` until the 0.1.1 release commit bumps it.

The current review was made against the actual local build output after
merging `wip/0.1.1-indy4-row213` and `wip/post-1.0-evidence` and making the Wasm
build path-independent, in a clean clone:

```sh
./tools/build-core.sh all
npm run build:web
python3 tools/package-web.py --preview --archive-dir build/release
python3 tests/test-dev-rom-exclusion.py --require-build
```

Findings:

- `core/nocpu.wasm` is `becf728c28422763a2ced9f6f3b5094807c6e706c82c00ab9342afb0af0e8607`
  (changed by the renderer fix and the path-independent system libraries);
  `core/nocpu.js` is unchanged at `623c8478…`. The local runtime SHA-256 is
  `1c2430a76fa95695954e6d8c09879cdc665847211540d80ca46b3ed755618cc9`.
- The Wasm build is reproducible across checkout paths: `tools/build-core.sh`
  builds the Emscripten system libraries with deterministic paths into a
  dedicated cache, and builds in three directories of different depth
  (including CI's `/home/runner/work/NoCPU/NoCPU`) gave byte-identical
  `nocpu.wasm` and `nocpu.js` (see [TESTING.md](TESTING.md)).
- The linker map has 147 SDK members: two more than 0.1.0, both musl. The
  renderer's `std::fma` links `fmaf.o`, whose FreeBSD 2-clause BSD header (David
  Schultz) is now retained verbatim in the
  [MATH-NOTICES](licenses/musl-emscripten-3.1.74-MATH-NOTICES.txt) file. The
  other new member, `fenv.o`, has no header of its own and is covered by the musl MIT
  grant.
- The other notices are byte-identical to the installed SDK and npm packages,
  and all 27 are present with matching hashes in the packaged site.
- The source archive has 802 files (the 801 tracked files plus
  `RELEASE-MANIFEST.json`), including all 566 original DICE files; no Git
  metadata, build output, `node_modules`, compiled payloads, ROMs, PNG icons,
  web manifest or `render-icons.mjs`. The zip, tarball and source checksums
  verify.
- A search of the web zip, web tarball, packaged site and source archive
  (including archives nested in the zip) for all 44 members of the ten private
  fixture archives, raw and base64 at three alignments, found none, and the
  dev-ROM exclusion test passed with fixtures present.

**Reviews so far (2026-10-13).**

- Independent review of `c2c72de..9fc4eac`, accepted. It covered the
  byte-identical Wasm/JS (then equal to 0.1.0), the seven-file inventory, a
  byte-identical rebuild from the source archive (caveat: shared Emscripten
  SDK), 0 ROM hits and a simulated `v0.1.1` tag release that passed.
- Delta review of `9fc4eac..0b02051` (the review fixes), re-verified and
  accepted.
- Independent review of the Indy 4 renderer fix (`wip/0.1.1-indy4-row213`) and
  of its follow-up delta, both accepted. It checked the fix against the Mesa
  20.0.8 llvmpipe source, ran GL probes in the pinned image and fresh
  original/native/Wasm comparisons.

**Final independent review (2026-10-13): accepted.** An independent agent
reviewed `0b02051..bd5aaa0` at commit `bd5aaa0`:

- license: all 147 SDK members are accounted for; the `fmaf.c` header in the
  MATH-NOTICES file is byte-identical to the SDK source, and `fenv` is covered
  by the musl MIT license;
- runtime `1c2430a7…` with seven files; the source archive has 802 files,
  equal to `git ls-files` plus the manifest;
- 0 ROM hits in the zip, tarball, source archive and packaged site;
- reproducible Wasm: `becf728c…` in two clones with fresh caches, and a
  rebuild from the source archive was byte-identical (caveat: shared
  Emscripten SDK);
- 16/16 ROM-free scenarios, 6/6 ROM-backed scenarios, the Pong comparison and
  the ABI probes passed;
- packaged Chromium 145.0.7632.6: 49/49 Playwright tests passed.

The release workflow's publish-job re-run change and a reworded changelog line
came after this review, at its request; they change neither the runtime nor
the notices nor the source-archive file list. The 0.1.0 independent review
below applies to 0.1.0 only.

### What ships

The packaged site (`nocpu-X.Y.Z-web.zip`, served from `/NoCPU/`)
holds:

| Part | Files | Origin |
| --- | --- | --- |
| Runtime | `index.html`, `assets/index-*.js`, `assets/core.worker-*.js`, `assets/index-*.css` | NoCPU frontend (GPL), with fflate 0.8.2 and the Vite modulepreload helper bundled in |
| Core | `core/nocpu.js`, `core/nocpu.wasm` | DICE 0.9 circuits and NoCPU adapters (GPL), Emscripten glue and the SDK library members below |
| Assets | `icon.svg` | NoCPU-owned; the only icon (no web manifest or PNG icons) |
| Notices | `notices/…` | All 27 notices in the audit, the files they link to, and the audit itself |
| Source | `source/nocpu-X.Y.Z-source.tar.gz` and `.sha256` | Corresponding source for the same commit |
| Identity | `BUILD-MANIFEST.json`, `provenance/core-build.json`, `provenance/web-build.json` | Runtime and source hashes, build inputs, release readiness record |

That is seven runtime files. The release also attaches
`nocpu-X.Y.Z-web.tar.gz`, `nocpu-X.Y.Z-source.tar.gz` and their `.sha256`
files.

### Components and notices

| Component | License | Evidence (rechecked for 0.1.1) |
| --- | --- | --- |
| DICE 0.9 circuits and chips, NoCPU core adapters, frontend and icons | GPL-3.0-only combined (GPL-3.0-or-later grants individually) | Prepared unchanged from `upstream/dice-0.9`; see [tests/license-audit.json](../tests/license-audit.json) and [PROVENANCE.md](PROVENANCE.md) |
| Emscripten 3.1.74 generated JS and runtime support | MIT (MIT/NCSA dual) | Installed compiler reports 3.1.74 (`1092ec30`); retained LICENSE and AUTHORS byte-identical to the SDK |
| LLVM libc++ (12 members), libc++abi (10; 11 from 0.4.0), compiler-rt (18), libunwind (from 0.4.0: 1) | Apache-2.0 WITH LLVM-exception | Linker map; retained LICENSE/CREDITS byte-identical to the SDK |
| musl libc (103 members, 27 of them math routines) | MIT; Sun-derived routines keep their notice grant; `fmaf` is BSD-2-Clause | The 26 math members of the reviewed legacy inventory plus `fmaf` (and the header-less `fenv`); COPYRIGHT byte-identical; Sun, Arm and FreeBSD `fmaf` headers in [MATH-NOTICES](licenses/musl-emscripten-3.1.74-MATH-NOTICES.txt) |
| dlmalloc 2.8.6 (2 members), Emscripten noexit and stubs (1 each) | CC0 dedication; Emscripten changes MIT | Doug Lea's dedication and Emscripten notices retained |
| Vite 7.3.1 modulepreload helper | MIT | Retained license byte-identical to the installed package |
| fflate 0.8.2 | MIT | The only npm runtime dependency in the build provenance; pinned by version and lockfile integrity; preferred source in `upstream/fflate-0.8.2`; UZIP.js attribution retained |

The Wasm link has 67 compiled NoCPU/DICE units and the seven SDK archive
families above, 147 members in all (0.1.0: 145). Its dependency list names only `core/` and
the prepared DICE sources: no Qt, SDL, OpenGL, X11, ManyMouse, Phoenix, nall or
zlib. Since tag `legacy-0.6.0` the core changed only in the 0.1.1 Indy 4 renderer
fix (`core/platform/portable_video.inc`) and its README; frontend changes
(including the 0.1.1 desktop interface) are NoCPU-owned and add no dependency.

The development server's ROM fixture plugin (`vite.config.ts`) and
`web/src/dev-roms.ts` are excluded from the production bundle.
`tests/test-dev-rom-exclusion.py --require-build` checks the production build
that gets packaged (CI's browser job, including release runs) for the dev
endpoint, module and any embedded ZIP. The ROM-backed validation workflow runs
it with fixtures present, which adds a search of the bundle for their bytes;
without fixtures that search is reported as skipped.

### Matching source

`tools/package-web.py` builds the source archive from the same checkout as the
compiled output, verifies that the compiled core matches freshly prepared
source and that the Vite output matches its recorded inputs, and links the
archive from the app. The 0.1.1 review archive has 802 files (0.1.0: 809): all
566 original DICE files, `core/`, `web/`, `tools/`, `upstream/fflate-0.8.2`, lockfiles,
manifests and every notice. It contains no Git metadata, build output,
`node_modules`, compiled payloads or ROMs. A search of the web zip, the
packaged site and the source archive for every member of the private fixture
archives found none, raw or base64-encoded.

### What would reopen this assessment

Re-review and update the audit before the next release when any of these
change: the Emscripten version or flags, the set of linked SDK members, an npm
runtime dependency, a compiled circuit, the asset set, or the source-archive
contents. Bumping the audit's `version` states that the review was made for
that release's actual output (see [RELEASING.md](RELEASING.md)).

## 0.1.0 assessment (2026-10-13, history)

This section records the 0.1.0 release as reviewed; the current record is the
0.1.1 assessment above.

**Result: ready.** Scope: the 0.1.0 reset baseline, which compiles the six DICE
circuits (Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle, Indy 4) with
Emscripten 3.1.74 and still uses the legacy browser frontend. The assessment
covers browser JS, Wasm and asset distribution only. It makes no gameplay,
accuracy or browser-compatibility claim, and it does not clear native binaries,
toolchain containers or ROMs.

The review was made against the actual local build output:

```sh
./tools/build-core.sh all
NOCPU_BASE_PATH=/NoCPU/ npm run build:web
python3 tools/package-web.py --preview --archive-dir build/release
python3 tests/test-dev-rom-exclusion.py
```

**Independent review (2026-10-13): accepted.** An independent agent reviewed
commit `6994217` in a scratch clone with a simulated release commit and tag:

- the tagged packaging passed, with the same runtime and Wasm hashes recorded
  in the audit, and the release workflow's checksum and notice/source guards
  passed;
- rebuilding the Wasm core and Vite output from the extracted source archive
  gave byte-identical output. Caveat: that rebuild reused the installed
  `node_modules` and Emscripten SDK instead of fetching them afresh;
- the SDK link members and every retained notice were confirmed;
- a scan of the web zip, web tarball and source archive for every private
  fixture ROM and member, raw and base64, found 0 hits.

### What shipped in 0.1.0

The packaged site (`nocpu-0.1.0-web.zip`, served from `/NoCPU/`) holds:

| Part | Files | Origin |
| --- | --- | --- |
| Runtime | `index.html`, `assets/index-*.js`, `assets/core.worker-*.js`, `assets/index-*.css` | NoCPU frontend (GPL), with fflate 0.8.2 and the Vite modulepreload helper bundled in |
| Core | `core/nocpu.js`, `core/nocpu.wasm` | DICE 0.9 circuits and NoCPU adapters (GPL), Emscripten glue and the SDK library members above |
| Assets | `icon.svg`, `icons/*.png` (3), `manifest.webmanifest` | NoCPU-owned; the PNGs are rendered from the SVG by `tools/render-icons.mjs` |
| Notices | `notices/…` | All 27 notices in the audit, the files they link to, and the audit itself |
| Source | `source/nocpu-0.1.0-source.tar.gz` and `.sha256` | Corresponding source for the same commit |
| Identity | `BUILD-MANIFEST.json`, `provenance/core-build.json`, `provenance/web-build.json` | Runtime and source hashes, build inputs, release readiness record |

The release also attaches `nocpu-0.1.0-web.tar.gz`, `nocpu-0.1.0-source.tar.gz`
and their `.sha256` files.
