# Build and validation

Acceptance on the restarted line, as set by the [roadmap](ROADMAP.md), is the
original/native/Wasm comparison for each ported game plus desktop browser
checks naming the actual browser and version. This page lists the commands and
what each one does and does not establish. Run heavy builds and captures one
at a time: they share generated directories under `build/`.

## Requirements

- **Repository checks:** Python 3.10 or newer.
- **Native reference:** Bash and Docker with a running daemon, on Linux amd64.
  The pinned image uses historical Ubuntu 18.04 packages (Qt4, SDL 1.2, GCC
  7.5) needed by the original source. The first image build needs network
  access to the official Ubuntu image and package repositories, with signature
  verification; later builds use the cached image offline. Base image and
  direct dependency versions are pinned, transitive apt packages are not, so
  this is a reproducible recipe rather than a hermetic build. Never disable
  package signature or transport verification.
- **Core and browser:** Node.js 22.12 or newer, npm, Bash 4 or newer, Git, a
  native C++14 compiler such as GCC, and zlib development files (the native
  evidence runner links `-lz` for lossless RGB capture; the Wasm build does
  not). Emscripten 3.1.74 is pinned and installed by
  `./tools/install-web-toolchain.sh`.
- **Browser automation:** Playwright 1.58.2 with Chromium, Firefox and WebKit
  and their platform libraries.

## Repository checks

```sh
python3 tools/check.py
python3 tools/audit-games.py
python3 tools/audit-roms.py
npm ci --cache build/npm-cache --no-audit --no-fund
make test
```

`tools/check.py` checks the repository contracts: the byte-identical
`upstream/dice-0.9/` inventory, license notices, version fields, the changelog
rules and the absence of ROM or binary payloads. The game and ROM audits compare
the source declarations with the [game
manifest](../tests/fixtures/game-manifest.json) without needing ROM files;
`audit-roms.py` reads archive bytes only when given `--rom-dir`. Metadata
consistency does not show that a game loads, plays or sounds right.

`make test` runs `check.py` and the Python regression suites: release and
packaging tools, game audits, reference-capture analysis, full-RGB comparison,
core hand-off and the dev-ROM exclusion test. (The legacy CI-change classifier
and runtime-baseline tests, and the docs-only CI fast path they served, have
been removed: CI runs the full verification on every push and pull request.) Install the
npm dependencies first; the distribution tests read the actual fflate bytes.
Without a native capture, the reference-mutation cases are skipped while their
unit checks run. After `./tools/capture-pong.sh`, run them against real
media:

```sh
python3 tests/test-reference-analysis.py --reference-dir build/reference
```

These copy the capture under ignored `build/audit-reference/`, truncate media
or alter replay rows, and require each altered copy to fail.

## Native reference

```sh
./tools/build-native.sh            # or --jobs 4; BUILD_JOBS also works
./tools/capture-pong.sh
```

`build-native.sh` builds `build/native/dice` from a generated copy of the
original source in the `nocpu-dice-qt4:0.1.0` toolchain image
(`--rebuild-image` rebuilds it; `NOCPU_NATIVE_IMAGE` names another tag). The
compile container needs no network once the image exists. The binary depends
on the toolchain's libraries and is not a portable executable.

`capture-pong.sh` runs the controlled [Pong reference](PONG_REFERENCE.md):
an instrumented copy replays [`tests/replays/pong.tsv`](../tests/replays/pong.tsv)
under Xvfb with SDL dummy audio and writes `build/reference/report.json` with
frames, PCM, inputs, telemetry and collision traces for two epochs in two fresh
processes. A pass proves the observations it checks: it taps generated PCM, not
speaker output, and an attract-mode screenshot is not a pass.

The ROM-free batch reference uses the sixteen scenarios in
[`tests/replays/game-scenarios.json`](../tests/replays/game-scenarios.json)
(Pong Doubles, Space Race and Breakout):

```sh
./tools/capture-games.sh           # or: make reference-games
```

Output goes to `build/reference-games/`, whose `latest.txt` moves only after the
complete scenario set passes. `--scenario ID` captures one scenario; `--explore`
is an unqualified calibration run that cannot clear the gate.
`NOCPU_GAME_REFERENCE_ROOT` may select another output root under `build/` or
`/tmp`.

## Portable core and original/native/Wasm comparison

```sh
./tools/install-web-toolchain.sh   # npm ci plus the pinned emsdk and Emscripten 3.1.74
./tools/build-core.sh all          # or: native, wasm
make core-compare
```

`build-core.sh` regenerates `build/core/source/` and records the adapter diff,
compiled sources, dependencies, linker map, compiler version, flags and
input/output hashes under `build/core/`. The Wasm target also copies its module
into ignored `web/public/core/` for Vite. Do not run two core builds at once.

The Wasm output does not depend on the checkout path. `build-core.sh` builds
the Emscripten system libraries with `embuilder` (deterministic
`-ffile-prefix-map` paths) into a dedicated cache,
`build/emscripten-cache-repro-<key>`, keyed by the Emscripten version and the
library list, then links with a frozen cache so nothing is rebuilt
path-dependently; NoCPU's own sources are compiled with
`-ffile-prefix-map=<checkout>=/nocpu`. The same commit therefore gives
byte-identical `nocpu.wasm` and `nocpu.js` in any directory, including CI's
`/home/runner/work/NoCPU/NoCPU`. `NOCPU_EM_CACHE` selects another cache
directory.

`make core-compare` runs, in order:

1. the portable native runner and `node tools/replay-core.mjs` on the Pong
   replay, then `python3 tools/compare-core.py`, which writes
   `build/core/comparison.json`. It compares PCM, input/event timing,
   telemetry and collision transitions with the original fresh capture, and
   native against Wasm frames/PCM and reset isolation. Portable reset restores
   fresh descriptors; the original application's second in-process epoch keeps
   static state and is not the fresh-reset baseline.
2. `./tools/replay-games.sh`, which replays every captured ROM-free scenario
   through native and Wasm for two reset epochs, runs `tools/compare-games.py`
   and the multi-game and Breakout ABI probes, and records the run under
   `build/core/game-evidence/` (`NOCPU_GAME_EVIDENCE_ROOT` may override it).
   Streams compare full-frame RGB hashes, raw PCM and input/event/telemetry
   records; selected full-color snapshots compare byte for byte.

Read the per-scenario reports before claiming fidelity, and report frame
equality, settled geometry tolerances and PCM separately.
[PORT_PONG.md](PORT_PONG.md) lists the platform adaptations being compared.

## ROM-backed comparison (private fixtures)

```sh
./tools/fetch-roms.sh                 # or: make roms; exit 77 = blocked, no ROM access
python3 tools/compare-rom-games.py    # or: make rom-compare; exit 77 = skipped, no fixtures
```

`fetch-roms.sh` fetches the private development/CI fixtures into ignored
`build/roms/` and audits them. `compare-rom-games.py` runs the Stunt Cycle and
Indy 4 scenarios in [`tests/replays/rom-scenarios.json`](../tests/replays/rom-scenarios.json)
through original DICE, the native runner and Wasm, after
`./tools/build-native.sh` and `./tools/build-core.sh all`, and writes
`build/rom-comparison/<timestamp>/report.json`. Its frames and audio are
ROM-derived and must never be published. Without fixtures it reports
`SKIPPED (blocked: no ROM access)`; that is not a pass. Both games inherit
DICE's missing audio hookup, so equal PCM is not audible sound.

The separate `rom-validation.yml` workflow runs these steps with the
`NOCPU_ROMS_TOKEN` secret and is skipped, with a `blocked` notice, when the
secret is absent (always for fork pull requests). [ROMS.md](ROMS.md) documents
the variables, the dev-server auto-load and the secret setup. To audit
fixtures by hand:

```sh
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures --game indy4
```

Keep fixtures outside the checkout or in ignored `build/roms/`, never print
credentials or payloads, and report ROM-dependent checks without access as
skipped or blocked.

## Desktop browser checks

```sh
npm run build                      # Wasm, TypeScript check and Vite build
npm run preview -- --host 127.0.0.1
```

Open `http://127.0.0.1:4173/NoCPU/`. `npm run build:web` skips the Wasm rebuild,
and `npm run dev` serves a development build once the Wasm files exist. The
production base is `/NoCPU/`; `NOCPU_BASE_PATH` selects another absolute path
ending in `/`.

`npm run test:foundations` runs the Node unit tests for controls, settings and
the bounded ROM/ZIP reader, using synthetic archives with no ROM payloads. It
also covers the About build string (tag build, untagged build with its short
commit, no manifest) and the mouse preferences: the version-5 preferences
record with its per-game `mouseByGame` assignment, version-4 records loading
without loss, and invalid mouse slots recovering to the default.

The Playwright suite drives the production build in three desktop projects,
**chromium**, **firefox** and **webkit**, using Playwright's desktop device
profiles with keyboard and mouse input; there are no emulated phone projects.
The tests drive the keyboard bindings and the mouse paddle, Serve and throttle
mappings described in [web/README.md](../web/README.md#what-it-offers).
Install and run:

```sh
./tools/install-web-toolchain.sh --browsers   # Debian 13 amd64: pinned engines and signed local libraries
./tools/run-browser-tests.sh                  # all projects
./tools/run-browser-tests.sh --project=firefox
```

On another Linux host, install the engines with
`PLAYWRIGHT_BROWSERS_PATH=./build/playwright npx playwright install --with-deps chromium firefox webkit`.
The wrapper sets local library and cache paths and runs the tests through an
isolated PulseAudio null sink, so audio scheduling is exercised for real but
speaker playback is not. Results go to `build/browser-matrix.json` and
`build/playwright-report/`. The private tests in `tests/browser/v060-driving.spec.ts`
(for example "stuntcycle private ROM keyboard and mouse controls, silent
lifecycle and original raster") load ROMs from `NOCPU_ROM_DIR` and are skipped
without fixtures.

A sandboxed runner may stop a browser from launching (Firefox has failed on a
read-only `/proc/self/uid_map` in a cloud sandbox). A failed launch is a runner
limitation, not a gameplay result.

Automated browser projects show that the build loads and runs in those engines.
Desktop acceptance evidence for a release also names the real browser and
version it was played in (at least Chrome and Firefox for the 0.1.x
acceptance) and is recorded in the [release readiness
record](RELEASING.md#release-readiness-record).

## Release path

```sh
make web-preview      # package build/web with notices and source, for local review
make web-release      # package for the current VERSION tag (release gates apply)
make browser          # run the browser suite against the packaged site
```

`tools/package-web.py` builds the site into `build/pages/` with the license
notices and the corresponding-source archive and refuses a release package when
the license audits or the release readiness record are not ready.
`NOCPU_TEST_PACKAGED=1` makes Playwright serve that packaged directory instead
of the Vite preview. After deployment, two smoke checks can target the live
site (an explicit base disables the local server):

```sh
NOCPU_TEST_BASE_URL=https://jelloshooter848.github.io/NoCPU/ \
NOCPU_TEST_PACKAGED=1 ./tools/run-browser-tests.sh --project=chromium \
  --grep 'loads genuine Wasm|distributed assets'
```

They check the deployed Wasm, coin-start, rendering, PCM scheduling and the
source/notice hashes; they do not replace the full local matrix.
[RELEASING.md](RELEASING.md) has the release checklist and workflow.

## What is still untested

Fifteen of the 21 DICE 0.9 games are unported, and for the six ported games the
restarted line has not yet re-run its comparisons against the reduced desktop
frontend (a 0.1.x task). No result covers every game's controls, DIP settings,
scoring, multiplayer, reset and audio. Eight games have no active DICE audio
hookup; inherited silence and untested playback are separate statuses. Record
each result with its build, scenario and actual environment instead of
generalizing from Pong; [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) holds
the per-game record. Report failures with the [bug-report
template](../bug-reports/TEMPLATE.md).
