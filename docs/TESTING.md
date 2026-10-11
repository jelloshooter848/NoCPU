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

## Pong portable core and browser

The browser tools require Node.js 22.12 or newer, npm, Python 3.10 or newer,
Bash 4 or newer, Git and a native C++14 compiler such as GCC. Emscripten 3.1.74
is the pinned Wasm compiler. Browser automation also needs the platform
libraries required by Playwright Chromium, Firefox and WebKit. The historical
Qt4 container is needed for the original comparison, not normal browser play.

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
qualify the other twenty circuits. The public site serves the reviewed 0.3.0
preview; exact deployment identity and pending physical qualification are in
[0.3.0 validation](0.3.0_VALIDATION.md).

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

### Browser checks

After the frozen `npm ci` install, run `npm run test:foundations` for the
control, preferences and bounded ROM/ZIP modules. The shared CI runs this
meaningful suite after dependency installation. Its temporary synthetic
archives contain no private ROM payloads and do not establish other-game
loading or gameplay. Browser tests independently exercise the actual app,
gamepad/IndexedDB interactions and existing circuit/audio/touch behavior.

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
audio buffers do not prove speaker playback. [0.3.0_VALIDATION.md](0.3.0_VALIDATION.md)
records current app-foundation qualification and the physical-phone procedure;
the separately verified public preview and partial actual-iPhone feedback
remain in [0.2.1_VALIDATION.md](0.2.1_VALIDATION.md), and earlier checks remain in
[0.2.0_VALIDATION.md](0.2.0_VALIDATION.md).

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

With compatible files available outside the public checkout:

```sh
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures --game antiaircraft
```

The validator accepts original DICE runtime ZIP basenames and documented short archive aliases. It reads members in memory and checks CRCs and audited byte sizes; missing, corrupt, or incompatible sets fail validation. It does not extract or copy payloads into the repository. See [ROMS.md](ROMS.md) for retrieval/access expectations and exact requirements.

Fixture access must be verified in each environment. Do not print credentials or ROM payloads. Jobs without access report ROM-dependent validation as skipped or blocked. Public pull-request checks must not receive private fixture credentials. Compatible bytes do not establish distribution permission.

## What is still untested

Earlier comparison builds and basic render checks are historical observations, not a full regression suite. The original 21-game list remains incompletely tested for controls, audio, scoring, DIP switches, multiplayer, reset, and historical fidelity. Eight games have no active mono-output hookup in the original source; inherited absent audio and untested playback are separate statuses. Browser, touch, Android/iPhone, and mobile performance results do not exist in 0.1.0. Record each result with its build, scenario, and actual environment instead of generalizing from Pong.

The [0.1.0 validation report](0.1.0_VALIDATION.md) records the integrated milestone results and remaining limitations. Report failures using the [bug-report template](../bug-reports/TEMPLATE.md). Release qualification and packaging have additional checks in [RELEASING.md](RELEASING.md).
