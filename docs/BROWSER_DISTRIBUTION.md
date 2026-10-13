# Browser distribution assessment

This records what the published browser build contains, which licenses apply
to each part, and how the matching source is delivered. The machine-readable
record is [tests/browser-license-audit.json](../tests/browser-license-audit.json);
`tools/package-web.py` refuses to package a build unless that record is ready
for the current `VERSION` and every notice it lists is present and unchanged.

The legacy line's assessments (0.2.0 through 0.6.0) are history in
[legacy/BROWSER_DISTRIBUTION_0.6.md](legacy/BROWSER_DISTRIBUTION_0.6.md).

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

The packaged site (`nocpu-0.1.1-web.zip` once released, served from `/NoCPU/`)
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
| LLVM libc++ (12 members), libc++abi (10), compiler-rt (18) | Apache-2.0 WITH LLVM-exception | Linker map; retained LICENSE/CREDITS byte-identical to the SDK |
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
