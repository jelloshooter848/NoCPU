# Contributing to NoCPU

Start with the [roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [testing guide](docs/TESTING.md). The current 0.2.0 work is a Pong-only WebAssembly/browser port, measured against the 0.1.0 native foundation. All 21 original DICE games remain the 1.0 goal. Post-1.0 candidates are research priorities, not accepted implementation commitments.

## Make a reviewable change

1. Open a branch for one focused problem. Describe its concrete trigger and expected behavior in an issue or pull request.
2. Keep the original source under `upstream/dice-0.9/` unchanged. Put NoCPU adapters or reference instrumentation outside that directory and record intentional derived changes in the provenance/patch documentation.
3. Run `python3 tools/check.py`. For native or capture changes, also run `./tools/build-native.sh` and `./tools/capture-pong.sh`. For browser/core changes, run the matching core comparisons and browser checks in [TESTING.md](docs/TESTING.md). Explain skipped checks and their blockers.
4. Update the compatibility matrix when a result changes. Record the scenario, toolchain/build identifier, observed evidence, and remaining untested behavior.
5. Update relevant docs and the changelog. Use the [pull request template](.github/pull_request_template.md) to state validation and limitations.

Tests should exercise meaningful behavior or invariants. A successful compile, an attract-screen image, and a complete gameplay session are different results. Report them accurately. Fix regressions without silently changing original circuit timing or substituting new gameplay rules.

## Preserve useful evidence

Use [one bug per report](bug-reports/README.md). Include a game ID, build/commit, input method, DIP settings, exact steps, expected/actual behavior, and reproducibility. Put generated binaries, frame/audio captures, and local settings in ignored output directories. Small redistributable scenario descriptions and audited metadata can be tracked.

Never commit ROM archives, extracted ROM bytes, private-repository credentials, or secrets. Keep test fixtures outside the public checkout or in an ignored local directory. Checksum metadata may be recorded; payloads may not. See [ROMS.md](docs/ROMS.md) for asset requirements and [third-party notices](THIRD_PARTY_NOTICES.md) for distribution gates.

## Releases

Follow [RELEASING.md](docs/RELEASING.md). A version entry or passing local check does not mean a release was published. Distinguish a Pages preview used for device testing from a qualified version-tag release. Release notes must state measured coverage and any pending device gates. The browser artifact must include applicable notices and its matching corresponding source; private ROMs remain excluded.
