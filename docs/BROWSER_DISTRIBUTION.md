# Browser distribution assessment

This records what the published browser build contains, which licenses apply
to each part, and how the matching source is delivered. The machine-readable
record is [tests/browser-license-audit.json](../tests/browser-license-audit.json);
`tools/package-web.py` refuses to package a build unless that record is ready
for the current `VERSION` and every notice it lists is present and unchanged.

The legacy line's assessments (0.2.0 through 0.6.0) are history in
[legacy/BROWSER_DISTRIBUTION_0.6.md](legacy/BROWSER_DISTRIBUTION_0.6.md).

## 0.1.0 assessment (2026-10-13)

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

An independent review of this assessment by a second agent is recommended
before the owner tags v0.1.0.

### What ships

The packaged site (`nocpu-0.1.0-web.zip`, served from `/NoCPU/`) holds:

| Part | Files | Origin |
| --- | --- | --- |
| Runtime | `index.html`, `assets/index-*.js`, `assets/core.worker-*.js`, `assets/index-*.css` | NoCPU frontend (GPL), with fflate 0.8.2 and the Vite modulepreload helper bundled in |
| Core | `core/nocpu.js`, `core/nocpu.wasm` | DICE 0.9 circuits and NoCPU adapters (GPL), Emscripten glue and the SDK library members below |
| Assets | `icon.svg`, `icons/*.png` (3), `manifest.webmanifest` | NoCPU-owned; the PNGs are rendered from the SVG by `tools/render-icons.mjs` |
| Notices | `notices/…` | All 27 notices in the audit, the files they link to, and the audit itself |
| Source | `source/nocpu-0.1.0-source.tar.gz` and `.sha256` | Corresponding source for the same commit |
| Identity | `BUILD-MANIFEST.json`, `provenance/core-build.json`, `provenance/web-build.json` | Runtime and source hashes, build inputs, release readiness record |

The release also attaches `nocpu-0.1.0-web.tar.gz`, `nocpu-0.1.0-source.tar.gz`
and their `.sha256` files.

### Components and notices

| Component | License | Evidence for 0.1.0 |
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
then are NoCPU-owned and add no dependency.

The development server's ROM fixture plugin (`vite.config.ts`) and
`web/src/dev-roms.ts` are excluded from the production bundle;
`tests/test-dev-rom-exclusion.py` checks this on every production build and,
with fixtures present, searches the bundle for their bytes.

### Matching source

`tools/package-web.py` builds the source archive from the same checkout as the
compiled output, verifies that the compiled core matches freshly prepared
source and that the Vite output matches its recorded inputs, and links the
archive from the app. The reviewed archive has 809 files: all 566 original
DICE files, `core/`, `web/`, `tools/`, `upstream/fflate-0.8.2`, lockfiles,
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
