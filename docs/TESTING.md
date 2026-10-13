# Build and validation

## Requirements

Run the fixture-free audits with Python 3.10 or newer from the repository root. Native build and capture scripts require Bash, Docker, and access to a running Docker daemon. The validated native toolchain is Linux amd64 with historical Ubuntu 18.04 packages. Other CPU architectures and host-native Qt builds have not been validated. The first image build needs network access to the pinned official Ubuntu image and Ubuntu package repositories with signature verification; later compilation can use the cached image without network access.

The image uses historical Qt4, SDL 1.2, and GCC versions needed by the original source. The base image and direct dependency versions are pinned and checked. Transitive apt packages are not fully snapshot-pinned, so this is a reproducible build recipe rather than a claim of hermetic or byte-identical builds. Do not disable package signatures or transport verification to make an old dependency install succeed.

## Repository checks

```sh
python3 tools/check.py
python3 tools/audit-games.py
python3 tools/audit-roms.py
```

The foundation check audits the repository contracts. Game and ROM audits compare source declarations with tracked metadata without requiring game ROM payloads. `audit-roms.py` checks actual archive bytes only when `--rom-dir` is supplied. Read their output: metadata consistency does not establish that a title loads, plays, or has accurate sound. The [compatibility matrix](GAME_COMPATIBILITY.md) is the record of per-game evidence.

```sh
npm ci --cache build/npm-cache --no-audit --no-fund
make test
```

Install the pinned npm dependencies before the full regression command: the
0.3.0 distribution tests verify actual fflate input bytes in disposable copies.
The fixture-free Python audits above still run without Node dependencies.

`make test` also checks the Home Screen icons read-only with
`node tools/render-icons.mjs --check`. The PNGs must reproduce exactly from
the retained SVG and recipe. After an intentional source-art change, regenerate
them with `node tools/render-icons.mjs` before building. Production frontend
builds repeat the read-only check and bind the recipe hash into provenance;
packaging rejects missing or changed post-build recipe inputs.

This runs repository integrity checks and source-release, game/ROM-metadata,
browser-distribution and reference-analysis regressions. Without captured artifacts, seven actual
reference-mutation cases are skipped while their fourteen timing/input unit
checks run. After the native capture, enable those cases explicitly:

```sh
python3 tests/test-reference-analysis.py --reference-dir build/reference
```

The CI browser qualification runs this command immediately after its fresh
capture. It verifies that incomplete real media or altered replay logs are
rejected, using disposable copies under ignored `build/audit-reference/`.
Browser/core tests below have additional prerequisites.

## Portable core and browser

Restarted 0.1.0 acceptance follows the [roadmap](ROADMAP.md): original/native/Wasm
comparisons for each compiled game plus desktop browser checks. Version-specific
prose below is legacy-line content; rewrite pending Phase 2. The core compiles
Stunt Cycle and Indy 4, which require compatible player-supplied ROMs; the legacy
[0.6.0 ledger](legacy/0.6.0_VALIDATION.md) and
[device packet](legacy/DEVICE_QUALIFICATION_0.6.md) are historical evidence only.
Reuse the existing pinned toolchain and frozen dependencies. All heavy execution has one owner;
do not run competing builds/captures or duplicate an active validator job.
The new titles inherit missing active DICE audio hookups. Actual compatible
fixtures are required for their gameplay/reference/browser launch coverage;
synthetic loader rejection and fixture-free metadata remain separate checks.
`make test` also runs `python3 tests/test-full-rgb.py`: synthetic lossless
RGB/gzip decoder fault and valid-multiframe checks. This checks the comparator,
including equally invalid metadata, rather than exercising either ROM-backed
circuit. Actual selected-game captures retain every decoded color frame and
must pass the independently reviewed scenario/configuration/media contracts.
Retain every raw PCM byte too: the selected titles' absent active audio hookups
coexist with one original constructor zero sample. Measure initialization and
ongoing counts separately, compare complete original/native/Wasm PCM without
dropping/coercing samples, and keep physical speaker claims separate.

The delivered [0.5.0 contract](legacy/0.5.0_TASKS.md) compiles original-derived Pong,
Pong Doubles, Space Race and Breakout with online Home Screen/standalone support.
The complete sixteen-scenario original/native/Wasm batch, reset/ABI, components
and matching-source delivery pass independent review. Exact-main full CI
accounts for 290 instances: 281 passes/nine existing annotated CDP skips. All
107 HTTP bodies and the separate 20 live cases pass, as recorded in
[0.5.0 validation](legacy/0.5.0_VALIDATION.md). The [four-game/Home Screen physical
packet](legacy/DEVICE_QUALIFICATION_0.5.md) keeps actual installed-iPhone tests separate
from browser emulation. Initial old-core Home checks and incomplete/scoped local
matrices retain their recorded stage identities.

The historical delivered [0.4.0 contract](legacy/0.4.0_TASKS.md) compiles original-derived Pong,
Pong Doubles and Space Race. Its actual new-game reference/native/Wasm fidelity
and authorized proportionate local browser scopes pass independent review.
The delivered preview also passes exact-main full-matrix CI (214 passed/six
existing annotated CDP skips), matching-source/component review, every public
file and all 15 selected live cases, as recorded in
[0.4.0 validation](legacy/0.4.0_VALIDATION.md). Physical qualification remains pending.
The older Pong
instructions and measured results below retain their historical scope.

The browser tools require Node.js 22.12 or newer, npm, Python 3.10 or newer,
Bash 4 or newer, Git and a native C++14 compiler such as GCC. Emscripten 3.1.74
is the pinned Wasm compiler. Browser automation also needs the platform
libraries required by Playwright Chromium, Firefox and WebKit. The historical
Qt4 container is needed for the original comparison, not normal browser play.
Selected-game lossless RGB observation additionally requires zlib development
headers/library for native evidence builds. The native runner records `-lz`;
this observer dependency is absent from the Wasm/browser link inventory and
does not authorize distribution of native executables or toolchain containers.

Install frozen npm dependencies and the pinned Wasm toolchain, then build:

```sh
./tools/install-web-toolchain.sh
./tools/build-core.sh all
npm run build:web
npm run preview -- --host 127.0.0.1
```

The installer runs `npm ci`, installs the pinned SDK commit and activates
Emscripten 3.1.74. Open `http://127.0.0.1:4173/NoCPU/` after building.
`npm run dev` starts a development server after Wasm files have been built;
`npm run build` rebuilds Wasm, checks TypeScript and produces the Vite runtime.
The production base defaults to `/NoCPU/`; `NOCPU_BASE_PATH` can select another
absolute path ending in `/`. The package lock pins npm dependency versions and
integrity hashes.

`build-core.sh native`, `wasm` and `all` select targets. It regenerates
`build/core/source`, then records the adapter diff, compiled source list,
dependency list, linker map, compiler version, flags and input/output hashes
under `build/core/`. Do not run simultaneous core builds against that shared
generated directory. The Wasm target also copies its generated module into
ignored `web/public/core/` for Vite. Build artifacts remain outside tracked
source.

The independently verified 0.3.0 preview retains Play Pong, Insert coin, default W/S and Up/Down
paddles, external simultaneous touch tracks, pause/resume, reset, mute and
volume. It adds a source-derived 21-title library/info shell, keyboard/gamepad
remapping, preferences and optional local ROM management. Only Pong is
playable and requires no ROM import; compatibility/import results do not
qualify the other twenty circuits in that historical preview. The later
[0.3.1 preview](legacy/0.3.1_VALIDATION.md) adds the qualification recorder and remains
historical evidence. The public site now serves the independently verified
four-game 0.5.0 preview described above; its exact deployed identity, software
results and pending physical qualification are in
[0.5.0 validation](legacy/0.5.0_VALIDATION.md).

### Original, portable-native and Wasm comparison

First build and capture the historical reference using the native commands
below. After `build-core.sh all`, run:

```sh
build/core/native/pong-runner --output build/core/native-evidence --replay tests/replays/pong.tsv --seed 848 --epochs 2
node tools/replay-core.mjs
python3 tools/compare-core.py
```

The comparison writes `build/core/comparison.json`. It compares generated PCM,
exact input/event timing, circuit telemetry and collision transitions with the
original fresh circuit. It compares portable native and Wasm frames/PCM and
same-module reset isolation separately. The portable reset restores fresh
descriptor values; the historical application's second in-process epoch
retained static state and is not its fresh-reset baseline. Render reports name
full-frame/observation equality and measured settled geometry tolerances;
read actual results before claiming pixel equality. [PORT_PONG.md](PORT_PONG.md)
records preserved behavior and deliberate platform adaptations.

For the current batch, capture the complete sixteen-scenario original
Doubles/Space Race/Breakout set
after the fresh original build and Pong capture, then compare the actual
portable native and Wasm outputs:

```sh
./tools/capture-games.sh
./tools/replay-games.sh
```

`make reference-games` selects the original new-game capture. `make core-compare`
retains the Pong commands above and then runs the new-game replay comparison.
The new tools retain timestamped evidence under `build/reference-games/` and
`build/core/game-evidence/`; their latest pointers are updated only after the
complete expected scenario set passes. A short `--explore` original capture is
explicitly unqualified calibration and cannot clear the production gate.
The replay wrapper also requires both the existing multi-game ABI probe and
the dedicated Breakout probe against qualified pilot/rally references. The
seven compared streams retain full-frame RGB hashes, supplemental red-channel
gray observations, raw PCM and input/event/telemetry records; selected full-color
PPMs are bound to their frame hashes and compare byte-for-byte. Optional
`NOCPU_GAME_REFERENCE_ROOT` and `NOCPU_GAME_EVIDENCE_ROOT` select reviewed local
output roots under repository `build/` or `/tmp` when measured capacity requires
them. CI keeps its ordinary default paths. Retain historical evidence and the
documented storage reserve before replacing shared latest outputs.
Read actual per-scenario reports, media coverage and failed-run history before
claiming fidelity. Native/Wasm gameplay and physical-device results remain
separate. Validation owns all shared builds/capture execution.

### Browser checks

After the frozen `npm ci` install, run `npm run test:foundations` for the
control, preferences and bounded ROM/ZIP modules. The shared CI runs this
meaningful suite after dependency installation. Its temporary synthetic
archives contain no private ROM payloads and do not establish other-game
loading or gameplay. Browser tests independently exercise the actual app,
gamepad/IndexedDB interactions and existing circuit/audio/touch behavior.
After the core build, run `npm run test:qualification` for native-time/active-interval collection,
measurement limits and artifact-identity failure cases. Controlled test inputs
remain separate from actual physical-device observations. CI requires both suites.

On this Debian 13 amd64 cloud environment, the installer can also download the
exact Playwright 1.58.2 engines and signed, locally extracted browser libraries:

```sh
./tools/install-web-toolchain.sh --browsers
./tools/run-browser-tests.sh
```

On another supported Linux CI host, install system dependencies and browser
engines using Playwright's standard installer instead:

```sh
PLAYWRIGHT_BROWSERS_PATH=./build/playwright npx playwright install --with-deps chromium firefox webkit
./tools/run-browser-tests.sh
```

The wrapper supplies local library/cache paths where required. Do not bypass
transport or package verification. Individual checks can select a project,
for example `./tools/run-browser-tests.sh --project=chromium`.

In this cloud workspace, Firefox's launcher encountered a read-only
`/proc/self/uid_map` inside the command filesystem sandbox. Running the browser
check through the environment's approved command path resolved that launch
restriction. This is a runner limitation; a failed launch is not a gameplay
result.

The configured projects cover Chromium, Firefox, WebKit, an emulated Android
viewport and an emulated iPhone viewport. They exercise actual production Wasm
loading and frontend behavior. An emulated phone viewport is not a physical
phone, Playwright WebKit is not an actual iPhone Safari session, and intercepted
audio buffers do not prove speaker playback. [0.3.0_VALIDATION.md](legacy/0.3.0_VALIDATION.md)
records historical app-foundation qualification; the earlier public preview
and partial actual-iPhone feedback remain in
[0.2.1_VALIDATION.md](legacy/0.2.1_VALIDATION.md), and earlier checks remain in
[0.2.0_VALIDATION.md](legacy/0.2.0_VALIDATION.md).

The current [four-game/Home Screen physical-device packet](legacy/DEVICE_QUALIFICATION_0.5.md)
and [fillable report](DEVICE_REPORT_TEMPLATE.md) bind the selected title/options
and actual phone/controller observations to the tested runtime. The historical
[0.3.1 recorder report](legacy/0.3.1_VALIDATION.md) and [Pong baseline
packet](DEVICE_QUALIFICATION.md) retain their original scope. The current
[0.5.0 validation](legacy/0.5.0_VALIDATION.md) records publication and hardware limits;
no collector export or automated profile completes the actual-device gate by
itself.
These packets are legacy records: the restarted line's release readiness
record keeps the physical-device gate deferred, and it does not gate releases
(see [RELEASING.md](RELEASING.md#release-readiness-record)).

The Pages packager supplies source downloads/notices omitted from an ordinary
Vite preview. Follow [RELEASING.md](RELEASING.md) to check the complete packaged
artifact and its links.

After deployment, the same two smoke checks can target the actual Pages site:

```sh
NOCPU_TEST_BASE_URL=https://jelloshooter848.github.io/NoCPU/ \
NOCPU_TEST_PACKAGED=1 ./tools/run-browser-tests.sh --project=chromium \
  --grep 'loads genuine Wasm|distributed assets'
```

An explicit remote base disables the local test server. These checks exercise
the deployed Wasm, coin-start, rendered paddles, PCM scheduling and matching
source/notices hashes. Local fault injection and the full engine matrix remain
separate checks; a remote smoke pass does not replace them or physical phones.

## Native build

```sh
./tools/build-native.sh
./tools/build-native.sh --jobs 4
```

The default parallelism is two jobs. `BUILD_JOBS` can also select parallelism. `--rebuild-image` rebuilds the toolchain image; `NOCPU_NATIVE_IMAGE` can name the local image tag, which defaults to `nocpu-dice-qt4:0.1.0`.

Compilation happens in a separate generated copy and creates `build/native/dice`. The imported source is not edited. The compilation container needs no network once the toolchain image exists. Generated objects, binaries, settings, and evidence belong in ignored `build/` output.

The executable uses the toolchain's libraries and native display/audio services. Running it directly on an arbitrary host is not a supported portable-binary contract. The capture script supplies the isolated services needed for reference scenarios.

## Controlled Pong reference

```sh
./tools/capture-pong.sh
```

This command runs the [Pong reference scenario](PONG_REFERENCE.md) and writes `build/reference/report.json` plus generated evidence under `build/reference/`. The baseline and repeat runs retain per-epoch WAV audio, rendered frames, frame hashes, input timestamps, telemetry, and collision observations. Its [input replay](../tests/replays/pong.tsv), output summaries, and adapter patches are reviewed separately from the untouched historical source. A passing scenario proves only the observations it checks; inspect the capture report before describing sound, scoring, reset, or replay determinism as verified.

Pong needs no game ROM fixture. Its coin input starts play; it has no separate start-button claim. Reference validation must include independent paddle inputs, a rally, scoring, non-silent captured PCM, and reset/restart behavior to satisfy the 0.1.0 exit gate. The replay uses the original New Game operation to destroy and recreate the circuit while retaining the input/video objects; this characterizes shared state rather than assuming a completely fresh process. Fixed-seed runs in fresh processes check repeatability separately; successive circuit epochs are not assumed identical.

A screenshot of attract mode or merely selecting a dummy audio device does not satisfy the exit gate. The capture adapter taps generated signed 16-bit mono PCM at 48,000 Hz and observes OpenGL-rendered frames. This does not prove audible speaker playback or historical sound accuracy. The final reference report records what was observed and what remains untested.

## Private ROM fixture validation

Fetch the private development/CI fixtures into ignored `build/roms/` and audit them, then run the ROM-backed Stunt Cycle and Indy 4 comparison after the native reference and core builds:

```sh
./tools/fetch-roms.sh                 # exit 77: blocked, no ROM access
python3 tools/compare-rom-games.py    # exit 77: skipped, no fixture directory
python3 tests/test-dev-rom-exclusion.py   # after npm run build:web
```

[ROMS.md](ROMS.md) documents the environment variables (`NOCPU_ROMS_REPO`, `NOCPU_ROMS_REF`, `NOCPU_ROM_DIR`, `NOCPU_ROMS_TOKEN`), what the comparison checks, the dev-server auto-load and the CI secret. The separate `rom-validation.yml` workflow runs these with the `NOCPU_ROMS_TOKEN` secret and reports `blocked: NOCPU_ROMS_TOKEN not configured` with the job skipped when the secret is absent, including on fork pull requests. The private browser test `tests/browser/v060-driving.spec.ts` also reads `NOCPU_ROM_DIR`.

With compatible files available outside the public checkout or in an ignored directory:

```sh
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures --game antiaircraft
```

The validator accepts original DICE runtime ZIP basenames and documented short archive aliases. It reads members in memory and checks CRCs and audited byte sizes; missing, corrupt, or incompatible sets fail validation. It does not extract or copy payloads into the repository. See [ROMS.md](ROMS.md) for retrieval/access expectations and exact requirements.

Fixture access must be verified in each environment. Do not print credentials or ROM payloads. Jobs without access report ROM-dependent validation as skipped or blocked. Pull requests from forks never receive the fixture secret; only same-repository branches can. Compatible bytes do not establish distribution permission.

Audit the actual Stunt Cycle and Indy 4 fixtures separately with
`--game stuntcycle` and `--game indy4` when needed. Keep fixtures outside this
checkout or in ignored `build/roms/`; never stage them. The ordinary CI workflow
retains the full four-game reference/regression gates and fixture-free
new-game error/metadata coverage; it must not claim actual new-game gameplay
when fixtures are absent. ROM-backed comparison results come from
`tools/compare-rom-games.py`, locally or in `rom-validation.yml`.

## What is still untested

Earlier comparison builds and basic render checks are historical observations, not a full regression suite. The original 21-game list remains incompletely tested for controls, audio, scoring, DIP switches, multiplayer, reset, and historical fidelity. Eight games have no active mono-output hookup in the original source; inherited absent audio and untested playback are separate statuses. Browser, touch, Android/iPhone, and mobile performance results do not exist in 0.1.0. Record each result with its build, scenario, and actual environment instead of generalizing from Pong.

The [0.1.0 validation report](legacy/0.1.0_VALIDATION.md) records the integrated milestone results and remaining limitations. Report failures using the [bug-report template](../bug-reports/TEMPLATE.md). Release qualification and packaging have additional checks in [RELEASING.md](RELEASING.md).
