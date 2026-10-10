# Contributing to NoCPU

Start with the [roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [testing guide](docs/TESTING.md). The immediate work is a native foundation; browser and phone support are later milestones. All 21 original DICE games remain the 1.0 goal. Post-1.0 candidates are research priorities, not accepted implementation commitments.

## Make a reviewable change

1. Open a branch for one focused problem. Describe its concrete trigger and expected behavior in an issue or pull request.
2. Keep the original source under `upstream/dice-0.9/` unchanged. Put NoCPU adapters or reference instrumentation outside that directory and record intentional derived changes in the provenance/patch documentation.
3. Run `python3 tools/check.py`. For native or capture changes, also run `./tools/build-native.sh` and `./tools/capture-pong.sh`. Explain skipped checks and their blockers.
4. Update the compatibility matrix when a result changes. Record the scenario, toolchain/build identifier, observed evidence, and remaining untested behavior.
5. Update relevant docs and the changelog. Use the [pull request template](.github/pull_request_template.md) to state validation and limitations.

Tests should exercise meaningful behavior or invariants. A successful compile, an attract-screen image, and a complete gameplay session are different results. Report them accurately. Fix regressions without silently changing original circuit timing or substituting new gameplay rules.

## Preserve useful evidence

Use [one bug per report](bug-reports/README.md). Include a game ID, build/commit, input method, DIP settings, exact steps, expected/actual behavior, and reproducibility. Put generated binaries, frame/audio captures, and local settings in ignored output directories. Small redistributable scenario descriptions and audited metadata can be tracked.

Never commit ROM archives, extracted ROM bytes, private-repository credentials, or secrets. Keep test fixtures outside the public checkout or in an ignored local directory. Checksum metadata may be recorded; payloads may not. See [ROMS.md](docs/ROMS.md) for asset requirements and [third-party notices](THIRD_PARTY_NOTICES.md) for distribution gates.

## Releases

Follow [RELEASING.md](docs/RELEASING.md). A version entry or passing local check does not mean a release was published. Release notes must describe the artifact that exists: 0.1.0 is the native/reference foundation, with no deployed browser application. Future browser deployment should follow tested version tags, as in SMBC.
