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

The ROM-free batch reference uses the twenty-six scenarios in
[`tests/replays/game-scenarios.json`](../tests/replays/game-scenarios.json)
(Pong Doubles, Space Race, Breakout, Rebound, Quadrapong, Crossfire and Gotcha). Games ported from 0.2.0 on
add their original-behavior checks, measured frame cadence and settings
validity as `tools/reference/games/<id>.py`, and their original observation as
`tools/reference/games/<id>.inc` ([PORT_GAME.md](PORT_GAME.md)); their
snapshots compare as exact full RGB, like Breakout's.

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
and every ROM-free scenario and runs `make core-compare`; it is the local
equivalent of CI's comparison job. Pass `NOCPU_REFERENCE_CACHE=` to capture
every original fresh.

## Quick local check

```sh
make quick
```

For agents iterating locally: `make test`, the native reference and core
builds, Pong, and one scenario per ROM-free game (every `<game>-default`
scenario of the manifest, today `pongdoubles-default`, `spacerace-default`,
`breakout-default`, `rebound-default`, `quadrapong-default`, `crossfire-default`
and `gotcha-default`; `NOCPU_QUICK_SCENARIOS` overrides)
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
| `scope` | always | `tools/ci-scope.py` hashes the commit's content outside docs, web UI files, packaging and release metadata, and looks up a marker artifact that a passing `core-compare` left for that hash; it decides whether the core comparisons run. |
| `core-build` | always | `make test`, the web foundation tests, the native and Wasm core builds, and the core transfer upload bound to the clean checkout. |
| `core-compare` | unless `scope` skips it | Verifies the transferred Wasm (`core-handoff.py --verify`), builds the native runner and the original reference, restores the reference cache (not on a release), captures or restores Pong and every ROM-free scenario, and runs every original/native/Wasm comparison with four parallel workers. Saves new qualified originals to the cache and, after passing, uploads the `nocpu-compared-<hash>` marker artifact. |
| `package` | always | Verifies and installs the transferred core, builds and packages the site, and uploads it with a SHA-256 list, plus the release assets and the Pages artifact (named `github-pages-<sha>-<attempt>`). |
| `browser (chromium / firefox / webkit)` | always | One job per engine against the exact packaged site; any missing, extra or changed file fails before the tests. Collects the engine's `browser.version()` and its `@game-` test outcomes for the acceptance record. |
| `rom-access` | always | Reports whether the `NOCPU_ROMS_TOKEN` secret is available (never for fork pull requests). |
| `rom-browser` | when the secret is available | Fetches the private ROM fixtures and plays Stunt Cycle and Indy 4 in Chromium and Firefox against the same packaged site, ROM-safe; uploads only the stripped results and the acceptance inputs. |
| `acceptance` | after the browser jobs | Combines every engine's results into the desktop acceptance record of this package (`tools/desktop-acceptance.py`). Must pass on a release, and on any run whose `rom-browser` job ran. |
| `verify` | always | Requires every job. It accepts a skipped `core-compare` only when `scope` skipped it (on a release too), and a skipped `rom-browser` only when the secret is absent, never on a release. |

The scope rule is decided by content, not by a diff, and is deliberately
small. The core hash is a SHA-256 over the path, mode and blob of every tracked
file except the files no capture, replay or comparison reads; renames and
deletions change it. Left out are:

- documentation: `docs/**`, `bug-reports/**` and every `*.md` file anywhere
  (including `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` and READMEs such as
  `core/README.md`);
- browser UI: `web/**`, `tests/browser/**`, `tests/test-web-foundations.cjs`;
- distribution packaging and license records: `tools/package-web.py`,
  `tools/package-release.py`, their tests `tests/test-web-release.py` and
  `tests/test-release-tools.py`, `tests/license-audit.json` and `LICENSE`. No
  capture, replay or comparison reads them; `package`, the browser jobs and
  the release workflow, which do, run on every run;
- release metadata a release commit rewrites: `VERSION`,
  `tests/release-readiness.json`, `tests/browser-license-audit.json`, and the
  project `version` field of `package.json` and `package-lock.json` (the rest
  of both files is hashed). `VERSION` is not compiled into the native or Wasm
  core: `tools/build-core.sh` only records its digest in the build provenance,
  and the comparison reports copy it as a label. The provenance and version
  drift checks (`core-handoff.py --verify`) still run on every run in
  `package`.

Everything else is hashed: `core/`, `upstream/`, every script under `tools/`
(capture, replay, compare, build, toolchain installers, the native Dockerfile,
this rule itself), `tests/replays/`, the manifests, the unit tests, the
Makefile and the workflows. The hash also includes the first line of the
runner's `g++ --version`, the one compare input (it builds the native runner)
not pinned in the repository. `python3 tools/ci-scope.py hash` prints the tree
hash, the compiler line and the resulting core hash.

After `core-compare` passes, it uploads a small artifact named
`nocpu-compared-<hash>` (kept 30 days). Artifacts, unlike Actions caches, are
visible to every run of the repository: content compared in a pull request or
on the working branch is found again by the merge push to `main` and by the
next release pull request. (Until 0.1.6 the marker was a cache entry; GitHub
scopes caches to the branch that saved them, so `main` and new pull requests
never saw it and re-ran the comparison.) A later run skips the comparisons
only when the artifact lookup (`ci-scope.py lookup`, GitHub REST API) finds an
unexpired marker for its own hash uploaded by a run of this repository; markers
uploaded by fork pull request runs are ignored. A docs-only push that follows a
cancelled or failed core push therefore still runs them: its core content never
passed. A missing marker, a failed lookup or any error runs everything. A
release looks the marker up like any other run (owner decision 2026-10-17,
from 0.2.1): when the tagged commit's core content already passed on the same
host compiler it reuses that comparison, otherwise it runs it with every
original captured fresh. A skip is printed in the
`scope` log, as a notice and in the `scope` and `verify` summaries as "skipped,
not passed".

Original captures are cached in archives named `nocpu-reference-v1-` plus a hash
over every scenario's inputs plus a digest of the stored entries. A run restores
the newest archive for its inputs (or any older one) and re-checks each entry,
so only scenarios whose inputs changed are captured again, and saves a new
archive whenever its receipts show a newly stored entry. Caches are scoped by
GitHub: a pull request reads the caches of its base branch and the default
branch and writes only its own, so a fork cannot place reference entries where
other runs read them. A release run that compares never uses the reference
cache.

Measured on the first runs of this workflow (run 38492310183, commit
`500ee1a`, 4-vCPU `ubuntu-24.04` runners):

| Job | Every original captured fresh | Originals from the cache |
| --- | --- | --- |
| `scope` | 6 s | 6 s |
| `core-build` | 3 min 4 s | 3 min 4 s |
| `package` | 28 s | 28 s |
| `browser (chromium / firefox / webkit)` | 4 min 2 s / 5 min 33 s / 5 min 39 s | same |
| `core-compare` | 34 min 10 s (16 captures 11 min, replays 11 min, comparison 7 min) | 15 min 28 s (restore 8 s, replays 7 min, comparison 4 min) |
| whole run | 37 min 23 s | about 19 min |

A run whose content outside docs, web UI, packaging and release metadata
already passed skips `core-compare` and takes about 9 minutes. With the ten
games of 0.2.0 a full comparison took about 65 minutes on a pull request and
about 40 minutes with every original fresh on a release (runs 39048461746
and 39043961048). The cached originals for all
seventeen entries archive to 56 MB.

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

The separate `rom-validation.yml` workflow runs these comparisons with the
`NOCPU_ROMS_TOKEN` secret and is skipped, with a `blocked` notice, when the
secret is absent (always for fork pull requests). The ROM-backed browser tests
run in the `rom-browser` job of `verify-browser.yml` instead (since 0.1.3),
against the exact package the other browser jobs test, so their results count
towards that package's [desktop acceptance record](#desktop-acceptance-record);
releases run them too. Locally, against a packaged site:

```sh
NOCPU_ROM_DIR=build/roms NOCPU_TEST_PACKAGED=1 NOCPU_TEST_ROM_SAFE=1 \
  ./tools/run-browser-tests.sh --project=chromium --project=firefox \
  tests/browser/browser-identity.spec.ts tests/browser/v060-driving.spec.ts
```

`NOCPU_TEST_ROM_SAFE=1` makes `playwright.config.ts` record no traces, videos or
failure screenshots, skip the HTML report (their frames are ROM-derived) and
turn off Playwright's git capture (`captureGitInfo`), which on CI otherwise
copies the commit message and the pull request's source diff into the report.
Results go to `build/rom-browser-matrix.json`, which still holds the tests' own
screenshot attachments. `tools/strip-rom-report.py` drops the run metadata
(`config.metadata` and each project's `metadata`: CI links, PR title, commit,
diff) and reduces the rest to outcomes and errors plus the attachments on its
allow-list (today only `stunt-original-score9-software.json`), each at most
4 KiB of JSON with no numeric array longer than 64 values. It drops and names
every other attachment. It then refuses, naming the JSON path, any remaining
field with a base64 image or archive signature, a `data:` image or video URI or
a `trace.zip` reference, and any attachment body or stdout/stderr buffer that
does not decode or decodes to an image or archive. Only that file, the
acceptance inputs collected from it (test titles, outcomes and the browser
identity) and, from `rom-validation.yml`, the comparison reports are uploaded.
In both workflows the token is exposed to the fetch step alone. [ROMS.md](ROMS.md) documents
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
commit, no manifest) and the preferences record: version 6 with its per-game
`mouseByGame` assignment and the remembered last game, records from versions
0 to 5 migrating without loss, and invalid mouse slots recovering to the
default.

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
They are Playwright's builds of Chromium, Firefox and WebKit, not Google
Chrome, a Mozilla release Firefox or Safari, and evidence names them that way.

### Simulated time, not host speed

Browser tests assert in simulated time; wall-clock time only bounds waiting;
real-time performance is reported, not gated. A correct build must pass on a
slow or unevenly loaded runner, so:

- Accuracy and behavior checks are expressed in circuit time (the snapshot's
  integer picoseconds and frame numbers) and keep their calibrated limits in
  those terms. "Hold until X, then check Y" must make X imply Y without
  relying on how late the release lands; waits use `waitSimulation`,
  `untilCircuit` or an equivalent bound in simulated time.
- Where a check needs inputs or observations at exact circuit times, it holds
  the worker's clock with the `?debug` test clock
  ([web/README.md](../web/README.md#building-and-testing)) and advances it in explicit
  simulated steps. The Space Race movement envelope, the Stunt Cycle
  throttle release ramp and the tests of the games ported from 0.2.0 on
  (`tests/browser/game-<id>.spec.ts`) work this way.
- App timers that are wall-clock by design (the 3000 ms audio activation
  expiry, the 2500 ms storage watchdogs) are tested on Playwright's page clock,
  held or advanced explicitly, so the test controls which timer fires first.
- Wall-clock limits are generous and only end a wait for something that should
  happen (a page load, an acknowledgment, a stalled simulation). Short fixed
  waits are used only to check that nothing happens, which a slow host can
  never fail.
- Real-time speed is measured and reported: the sustained Pong session attaches
  `browser-performance.json` and a `performance` annotation
  (`simulationSpeedRatio=…`), which `tools/desktop-acceptance.py collect`
  carries into the acceptance record beside that test's outcome. It never
  decides a game's status.

### Desktop acceptance record

Every CI and release run generates the desktop acceptance record of the
package it tested; a release publishes it as `nocpu-X.Y.Z-acceptance.json`
([RELEASING.md](RELEASING.md#the-desktop-acceptance-record)). The policy (games,
engines, whether a release requires it) is `desktop_acceptance` in
[tests/release-readiness.json](../tests/release-readiness.json).

- `tests/browser/browser-identity.spec.ts` writes
  `build/browser-identity/<project>.json`: the engine, its
  `browser.version()`, headless mode, the Playwright version, the OS and the
  device profile's emulated user agent. Every test of a project runs in that
  same browser (one worker).
- Game coverage comes from Playwright tags: a test that exercises a game's
  play carries `@game-<id>` (`pong`, `pongdoubles`, `spacerace`, `breakout`,
  `stuntcycle`, `indy4`, `rebound`, `gotcha`, `quadrapong`, `crossfire`). Tag a new game's tests the same way and
  add the game to the policy.
- `tools/desktop-acceptance.py collect` reduces one run's Playwright JSON
  report to the tagged outcomes, after recomputing the runtime digest from the
  tested site's files. `combine` merges every engine and run (a ROM test
  skipped in the public run and passed in the ROM run counts as passed; skipped
  everywhere does not) and marks a game passed in an engine only when it has a
  tagged test, all its tagged tests passed and no test of that engine failed.
  Each result is bound to its workflow run and attempt; when a job has no
  usable report, `collect` writes a missing-results marker instead (and fails
  the job), and `combine --job browser=… --job rom-browser=…` refuses `passed`
  unless both jobs succeeded in this run. `verify` checks a record against a
  release zip, including that the zip holds exactly the manifest's files.
- `tools/check.py` requires a `@game-<id>` tag on every test of the per-game
  specs (`pong`, `v040-game-ui`, `v050-breakout`, `v060-driving`) except the
  few it exempts by title with a reason; a new spec must be listed there as
  per-game or generic. A game ported from 0.2.0 on keeps its tests in
  `tests/browser/game-<id>.spec.ts`, which is per-game by its name and whose
  every test must carry `@game-<id>`; generic tests read the list of playable
  games from `tests/browser/ported-games.ts`.

To reproduce it locally after packaging (`make web-preview`) and running the
suites:

```sh
NOCPU_TEST_PACKAGED=1 ./tools/run-browser-tests.sh --project=chromium   # repeat per engine,
python3 tools/desktop-acceptance.py collect --engine chromium --source public \
  --report build/browser-matrix.json --identity build/browser-identity/chromium.json \
  --site build/pages --output build/acceptance-inputs/public-chromium.json
# ...the same for firefox, and with --source rom on the stripped ROM report...
python3 tools/desktop-acceptance.py combine --inputs build/acceptance-inputs \
  --site build/pages --output build/acceptance/record.json
```

Optional human checks belong in [ACCEPTANCE.md](ACCEPTANCE.md#supplementary-manual-desktop-checks);
they are supplementary and never replace the generated record.

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

Eleven of the 21 DICE 0.9 games are unported. The ten ported games pass their
bounded original/native/Wasm comparisons ([ACCEPTANCE.md](ACCEPTANCE.md)), with
the coverage gaps listed there, and automated browser checks in Playwright's
engine builds; nobody has yet recorded a manual check in a release Chrome or
Firefox. No result covers every game's controls, DIP settings,
scoring, multiplayer, reset and audio. Eight games have no active DICE audio
hookup; inherited silence and untested playback are separate statuses. Record
each result with its build, scenario and actual environment instead of
generalizing from Pong; [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) holds
the per-game record. Report failures with the [bug-report
template](../bug-reports/TEMPLATE.md).
