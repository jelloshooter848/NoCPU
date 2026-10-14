# Contributing to NoCPU

Start with the [roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [testing guide](docs/TESTING.md). NoCPU has restarted desktop-first at 0.1.0: the target is accurate play of every DICE 0.9 game in desktop browsers with keyboard and mouse through a minimal interface. Mobile/touch UI, phone qualification and Home Screen support are deferred until after desktop accuracy; do not add them to desktop work. Preserve the measured original/native/Wasm behavior of the six ported circuits. All 21 original DICE games remain the 1.0 goal. Post-1.0 candidates are research priorities, not accepted implementation commitments.

## Make a reviewable change

1. Work on the long-lived working branch (currently `restart/desktop-first`); it reaches `main` only through release pull requests merged with a merge commit. Parallel work may use a short-lived `wip/<version>-<topic>` branch merged back into the working branch. Describe each change's concrete trigger and expected behavior.
2. Keep the original source under `upstream/dice-0.9/` unchanged. Put NoCPU adapters or reference instrumentation outside that directory and record intentional derived changes in the provenance/patch documentation.
3. Run `python3 tools/check.py`. For native or capture changes, also run `./tools/build-native.sh` and `./tools/capture-pong.sh`. For browser/core changes, run the original/native/Wasm comparisons and desktop browser checks in [TESTING.md](docs/TESTING.md); a newly ported game is accepted only when its comparison passes. Explain skipped checks and their blockers.
4. Update the compatibility matrix when a result changes. Record the scenario, toolchain/build identifier, observed evidence, and remaining untested behavior.
5. Update relevant docs. Add a player-facing line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) (Added/Changed/Fixed/Removed) for any change players notice; internal-only changes need none. Use the [pull request template](.github/pull_request_template.md) to state validation and limitations.

Tests should exercise meaningful behavior or invariants. A successful compile, an attract-screen image, and a complete gameplay session are different results. Report them accurately. Fix regressions without silently changing original circuit timing or substituting new gameplay rules.

## Preserve useful evidence

Use [one bug per report](bug-reports/README.md). Include a game ID, build/commit, input method, DIP settings, exact steps, expected/actual behavior, and reproducibility. Put generated binaries, frame/audio captures, and local settings in ignored output directories. Small redistributable scenario descriptions and audited metadata can be tracked.

Never commit ROM archives, extracted ROM bytes, private-repository credentials, or secrets. Keep test fixtures outside the public checkout or in an ignored local directory. Checksum metadata may be recorded; payloads may not. See [ROMS.md](docs/ROMS.md) for asset requirements and [third-party notices](THIRD_PARTY_NOTICES.md) for distribution gates.

## Releases

Follow [RELEASING.md](docs/RELEASING.md). Releases are frequent: patch releases for fixes, tooling, docs and UI; a minor release for each roadmap milestone whose games pass their comparisons; `-rc.N` release candidates for testers. A release pull request ends with a release commit that changes only the version fields and CHANGELOG.md; after it merges, the owner creates the `vX.Y.Z` tag, and the release workflow publishes the GitHub Release and deploys Pages. Tags are never moved; a failed release is fixed by the next patch. A version entry or passing local check does not mean a release was published, and a release candidate is not accuracy-qualified unless its comparisons passed. Every browser artifact includes the applicable notices and its matching corresponding source; private ROMs remain excluded.
