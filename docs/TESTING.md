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
core hand-off, the reference-cache keys, the CI scope rule and the dev-ROM
exclusion test. Install the
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
complete scenario set passes (`last-run.txt` names the newest run of any
selection). `--scenario ID` or `--scenarios ID,ID,...` captures a selection;
`--explore` is an unqualified calibration run that cannot clear the gate.
`NOCPU_GAME_REFERENCE_ROOT` may select another output root under `build/` or
`/tmp`. `NOCPU_ANALYZE_JOBS=N` analyzes up to N scenarios at once (default 1);
the checks are the same.

### Reference cache

The original DICE tree never changes, so an original capture is a pure function
of its inputs. With `NOCPU_REFERENCE_CACHE=build/reference-cache` (any directory
below `build/` or `/tmp`), `capture-pong.sh` and `capture-games.sh` reuse a
cached capture instead of running the original in Docker, and store each newly
captured scenario once its original analysis and fresh-process repeat check
have passed. Without the variable every original is captured fresh, as before.
[`tools/reference-cache.py`](../tools/reference-cache.py) keys each entry
(Pong, or one ROM-free scenario) by a SHA-256 over:

- every byte of `upstream/dice-0.9/`;
- the toolchain recipe (`tools/native/**`, `tools/build-native.sh`) and the
  built image's identity: its base-image digest, its `dpkg-query` package
  inventory and the SHA-256 of the pristine `dice` it compiles;
- the SHA-256 of the adapted `dice` executable that produces the capture;
- `tools/reference/**`, both capture scripts and the cache tool itself;
- the scenario's manifest entry (with the manifest seed and schema) and its
  replay bytes;
- whether the host CPU has FMA (the original capture refuses hosts without it).

Docker image IDs are recorded, not keyed: the image is rebuilt on every CI
runner and its ID changes each time, while the package inventory and the
compiled binaries are byte-identical (checked on run 38335534370 against a local
build). Restore and store both refuse the cache unless the run's
`capture-image-id.txt` equals `build/native/toolchain-provenance/image-id.txt`,
so a capture made with another `NOCPU_NATIVE_IMAGE` is never cached or replaced
by a cached one. The key is computed once, before capture, and a store fails if
any input changed during the run. Any changed input is a miss and the scenario
is captured fresh; every hit and miss is printed with its reason and recorded in
`reference-cache.jsonl` next to the run. Before use, an entry's recorded inputs
must equal the current ones and every file must match its recorded SHA-256.

A hit skips only the Docker run. The original analysis and every native/Wasm
comparison still run on the cached streams. The fresh-process repeat check
(two independent original processes producing identical streams) was proven
when the entry was stored, which requires it; on a hit the two cached attempts
are compared again, but the original is not re-run, so that check is not
re-proven. A restored scenario's `capture-image-id.txt` (for Pong, the run's
`capture-image-id.txt` and so `build_identity.toolchain_image_id` in its report)
names the image that captured it; `native_toolchain_image_id` names the image
of this run. The analysis outputs (`evidence.json`, `positions.csv`,
`snapshot-positions.json`) are never cached. Each scenario keeps one entry;
`python3 tools/reference-cache.py prune` drops entries for scenarios no longer
declared.

The cache is an optimisation for pull request and branch CI and for local work.
Its entries are hashed but not signed, so any step of a run that can write the
cache could forge one. Release runs therefore never use it and capture every
original fresh (see [RELEASING.md](RELEASING.md)).

ROM-backed captures are never cached. Their frames are ROM-derived, and a
GitHub Actions cache can be restored by any workflow run of the repository,
including pull requests that never see the ROM secret. The cache tool refuses
the scenarios in `tests/replays/rom-scenarios.json`, and `compare-rom-games.py`
keeps capturing the original fresh in the ROM-backed validation workflow.

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
   `NOCPU_REPLAY_JOBS=N` runs up to N native/Wasm replays and scenario
   comparisons at once (default 1); the ABI probes run alongside the
   comparison. `--original RUN --subset` replays a `--scenarios` selection: its
   report keeps `full_batch: false`, prints `SUBSET ONLY`, skips the Breakout ABI
   probe unless both Breakout originals are present, and never moves `latest.txt`.

Read the per-scenario reports before claiming fidelity, and report frame
equality, settled geometry tolerances and PCM separately.
[PORT_PONG.md](PORT_PONG.md) lists the platform adaptations being compared.

`make reference-full` captures (or restores from `build/reference-cache`) Pong
and all sixteen scenarios and runs `make core-compare`; it is the local
equivalent of CI's comparison job. Pass `NOCPU_REFERENCE_CACHE=` to capture
every original fresh.

## Quick local check

```sh
make quick
```

For agents iterating locally: `make test`, the native reference and core
builds, Pong, and one scenario per ROM-free game (`pongdoubles-default`,
`spacerace-default`, `breakout-default`; `NOCPU_QUICK_SCENARIOS` overrides)
compared original/native/Wasm against cached originals. The first run fills
`build/reference-cache` (about 1 GB); later runs skip the Docker captures. A
quick pass is not the whole-batch qualification. Run the full comparison
(`make reference-full`, or let CI run it) before claiming a comparison pass and
whenever `core/`, `upstream/`, `tools/reference/`, the capture, replay or
compare tools, `tests/replays/` or the native toolchain change. CI runs it for
every such change and for every release.

## Continuous integration

`.github/workflows/verify-browser.yml` (called by `ci.yml` for pushes and pull
requests and by `release.yml` for releases) runs these jobs:

| Job | Runs | What it does |
| --- | --- | --- |
| `scope` | always | `tools/ci-scope.py` hashes the commit's content outside docs and web UI files and looks up a marker that a passing `core-compare` left for that hash; it decides whether the core comparisons run. |
| `core-build` | always | `make test`, the web foundation tests, the native and Wasm core builds, and the core transfer upload bound to the clean checkout. |
| `core-compare` | unless `scope` skips it | Verifies the transferred Wasm (`core-handoff.py --verify`), builds the native runner and the original reference, restores the reference cache (not on a release), captures or restores Pong and all sixteen scenarios, and runs every original/native/Wasm comparison with four parallel workers. Saves new qualified originals to the cache and, after passing, the `nocpu-compared-<hash>` marker. |
| `package` | always | Verifies and installs the transferred core, builds and packages the site, and uploads it with a SHA-256 list, plus the release assets and the Pages artifact (named `github-pages-<sha>-<attempt>`). |
| `browser (chromium / firefox / webkit)` | always | One job per engine against the exact packaged site; any missing, extra or changed file fails before the tests. |
| `verify` | always | Requires every job. It accepts a skipped `core-compare` only when `scope` skipped it, and never on a release. |

The scope rule is decided by content, not by a diff, and is deliberately
small. The core hash is a SHA-256 over the path, mode and blob of every tracked
file except documentation (`docs/**`, `bug-reports/**`, top-level `*.md`) and
browser UI (`web/**`, `tests/browser/**`); renames and deletions change it.
After `core-compare` passes, it saves an Actions cache marker
`nocpu-compared-<hash>`. A later run skips the comparisons only when a
lookup-only restore finds the marker for its own hash, that is when an earlier
run already passed them for identical content outside docs and UI. A docs-only
push that follows a cancelled or failed core push therefore still runs them:
its core content never passed. A missing marker, any error, and every release
run everything. A skip is printed in the `scope` log, as a notice and in the
`scope` and `verify` summaries as "skipped, not passed".

Original captures are cached in archives named `nocpu-reference-v1-` plus a hash
over every scenario's inputs plus a digest of the stored entries. A run restores
the newest archive for its inputs (or any older one) and re-checks each entry,
so only scenarios whose inputs changed are captured again, and saves a new
archive whenever its receipts show a newly stored entry. Caches are scoped by
GitHub: a pull request reads the caches of its base branch and the default
branch and writes only its own, so a fork cannot place entries or markers where
other runs read them. Release runs never use the reference cache.

Branch protection should require the single check `verify / verify` (the job
names inside it changed in 0.1.2; `verify` requires all of them). The owner
sets this in the repository settings.

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
secret is absent (always for fork pull requests). After the comparisons it
builds and packages a preview and runs `tests/browser/v060-driving.spec.ts`
against the private ROMs in Chromium and Firefox:

```sh
NOCPU_ROM_DIR=build/roms NOCPU_TEST_PACKAGED=1 NOCPU_TEST_ROM_SAFE=1 \
  ./tools/run-browser-tests.sh --project=chromium --project=firefox tests/browser/v060-driving.spec.ts
```

`NOCPU_TEST_ROM_SAFE=1` makes `playwright.config.ts` record no traces, videos or
failure screenshots and skip the HTML report, since their frames are
ROM-derived; results go to `build/rom-browser-matrix.json`, which still holds
the tests' own screenshot attachments. `tools/strip-rom-report.py` reduces it
to outcomes, errors and JSON/text attachments and refuses output that still
carries image or trace data; only that file and the comparison reports are
uploaded. The token is exposed to the fetch step alone. [ROMS.md](ROMS.md) documents
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
