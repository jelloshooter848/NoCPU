# Browser distribution assessment

This records what the published browser build contains, which licenses apply
to each part, and how the matching source is delivered. The machine-readable
record is [tests/browser-license-audit.json](../tests/browser-license-audit.json);
`tools/package-web.py` refuses to package a build unless that record is ready
for the current `VERSION` and every notice it lists is present and unchanged.

The legacy line's assessments (0.2.0 through 0.6.0) are history in
[legacy/BROWSER_DISTRIBUTION_0.6.md](legacy/BROWSER_DISTRIBUTION_0.6.md).

## 0.1.1 assessment (2026-10-13)

**Result: ready; independent review accepted (at `9fc4eac`).**
Scope: the 0.1.1 desktop build on `restart/desktop-first`, which compiles the
same six DICE circuits (Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle,
Indy 4) with Emscripten 3.1.74 and replaces the legacy frontend with the
minimal desktop interface. The touch controls, the Home Screen manifest and
PNG icons, `tools/render-icons.mjs` and the qualification collector are gone.
The assessment covers browser JS, Wasm and asset distribution only. It makes
no gameplay, accuracy or browser-compatibility claim, and it does not clear
native binaries, toolchain containers or ROMs. The audit's `version` field
stays `0.1.0` until the 0.1.1 release commit bumps it.

The review was made against the actual local build output of commit `3138314`
in a clean clone:

```sh
./tools/build-core.sh all
npm run build:web
python3 tools/package-web.py --preview --archive-dir build/release
python3 tests/test-dev-rom-exclusion.py --require-build
```

Findings:

- `core/nocpu.wasm` (`bc6f2806…`) and `core/nocpu.js` (`623c8478…`) are
  byte-identical to 0.1.0; the core sources are unchanged apart from
  `core/README.md`, and the linker map has the same 145 SDK members. The local
  runtime SHA-256 is `1abff7963802ca71e0d67d015f78974cfff50fd44cae983e2d47635d5e137012`.
- The 27 notices are unchanged from 0.1.0, byte-identical to the installed SDK
  and npm packages, and all present with matching hashes in the packaged site.
- The source archive has 796 files (the tracked files plus
  `RELEASE-MANIFEST.json`), including all 566 original DICE files; no Git
  metadata, build output, `node_modules`, compiled payloads, ROMs, PNG icons,
  web manifest or `render-icons.mjs`. The zip, tarball and source checksums
  verify.
- A search of the web zip, web tarball, packaged site and source archive
  (including archives nested in the zip) for all 44 members of the ten private
  fixture archives, raw and base64 at three alignments, found none, and the
  dev-ROM exclusion test passed with fixtures present.

**Independent review (2026-10-13): accepted.** An independent agent reviewed
`c2c72de..9fc4eac` at commit `9fc4eac` in a clean scratch clone:

- `core/nocpu.wasm` and `core/nocpu.js` are byte-identical to 0.1.0, and the
  packaged runtime digest equals the one recorded above;
- the runtime is the seven files listed below, the source archive has 796
  files, the checksums verify and the notice list is unchanged;
- rebuilding from the extracted source archive gave a byte-identical
  `build/web`. Caveat: that rebuild reused the shared Emscripten SDK instead of
  fetching it afresh;
- the ROM scan of the web zip, web tarball, source archive and packaged site
  for all ten fixture archives and their 44 members, raw and base64, found 0
  hits;
- a simulated `v0.1.1` tag release (never pushed) passed `release_check --tag`,
  `check.py`, the builds and `package-web.py --tag v0.1.1`, and showed `v0.1.1`
  in the About panel.

Its should-fix items were cleared on the working branch after `9fc4eac`
without changing the core or the asset inventory. The 0.1.0 independent review
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

| Component | License | Evidence (0.1.0, rechecked for 0.1.1) |
| --- | --- | --- |
| DICE 0.9 circuits and chips, NoCPU core adapters, frontend and icons | GPL-3.0-only combined (GPL-3.0-or-later grants individually) | Prepared unchanged from `upstream/dice-0.9`; see [tests/license-audit.json](../tests/license-audit.json) and [PROVENANCE.md](PROVENANCE.md) |
| Emscripten 3.1.74 generated JS and runtime support | MIT (MIT/NCSA dual) | Installed compiler reports 3.1.74 (`1092ec30`); retained LICENSE and AUTHORS byte-identical to the SDK |
| LLVM libc++ (12 members), libc++abi (10), compiler-rt (18) | Apache-2.0 WITH LLVM-exception | Linker map; retained LICENSE/CREDITS byte-identical to the SDK |
| musl libc (101 members, 26 of them math routines) | MIT; Sun-derived routines keep their notice grant | Same 26 math members as the reviewed legacy inventory; COPYRIGHT byte-identical; Sun/Arm headers in [MATH-NOTICES](licenses/musl-emscripten-3.1.74-MATH-NOTICES.txt) |
| dlmalloc 2.8.6 (2 members), Emscripten noexit and stubs (1 each) | CC0 dedication; Emscripten changes MIT | Doug Lea's dedication and Emscripten notices retained |
| Vite 7.3.1 modulepreload helper | MIT | Retained license byte-identical to the installed package |
| fflate 0.8.2 | MIT | The only npm runtime dependency in the build provenance; pinned by version and lockfile integrity; preferred source in `upstream/fflate-0.8.2`; UZIP.js attribution retained |

The Wasm link has 67 compiled NoCPU/DICE units and the seven SDK archive
families above, 145 members in all. Its dependency list names only `core/` and
the prepared DICE sources: no Qt, SDL, OpenGL, X11, ManyMouse, Phoenix, nall or
zlib. Core sources are unchanged since tag `legacy-0.6.0`; frontend changes since
then (including the 0.1.1 desktop interface) are NoCPU-owned and add no dependency.

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
archive from the app. The 0.1.1 review archive has 796 files (0.1.0: 809): all
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
