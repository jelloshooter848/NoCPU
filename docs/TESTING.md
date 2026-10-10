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
