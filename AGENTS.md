# Instructions for coding agents

## Scope and fidelity

- Read [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), and the relevant subsystem docs before changing behavior. 0.1.0 is the native/reference foundation; browser and mobile play are not implemented yet.
- Preserve all 21 DICE 0.9 games as the 1.0 scope. A difficult game is a recorded blocker, not permission to remove it.
- Keep `upstream/dice-0.9/` byte-identical to its audited source inventory. Build from a disposable copy. Place NoCPU adapters and instrumentation elsewhere, documenting any derived-source patches and attribution.
- Preserve the circuit scheduler, integer simulation time, video geometry, PCM generation, and supported physical inputs. Browser adaptations must change access to the hardware, with behavior verified against the native reference.
- Treat [docs/POST_1_0_GAMES.md](docs/POST_1_0_GAMES.md) as research, not authorization to expand the release scope.

## Assets and generated output

- Never commit or publish ROM payloads, private fixture archives, credentials, or secrets. Checksum/size metadata is permitted. Keep fixtures outside the checkout or in explicitly ignored local storage.
- Keep binaries, build copies, runtime settings, frame/audio captures, and temporary reports under ignored `build/` output. Release packaging must exclude private fixtures and generated local evidence unless specifically reviewed for distribution.
- Audit the applicable component notices before distributing code or binaries. Preserve existing copyright and license texts.

## Required checks and reporting

- Run `python3 tools/check.py` for repository changes. Run `./tools/build-native.sh` and `./tools/capture-pong.sh` for changes affecting compilation, the native toolchain, simulation, input replay, or captured evidence.
- Use `python3 tools/audit-games.py` and `python3 tools/audit-roms.py` when changing game or ROM metadata. Validate actual fixtures separately with `python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures` when authorized access exists.
- Add or run meaningful tests for changed behavior; do not manufacture tests that merely repeat the implementation. Inspect failed checks and fix the cause before claiming success.
- ROM-dependent checks without fixtures are skipped or blocked. A fixture-free metadata audit is not a ROM-loading or gameplay pass.
- Distinguish build, checksum, basic rendering, scenario coverage, audio capture, full gameplay, and real-device results. Never infer phone performance from a native build or sound accuracy from a dummy audio device.
- Record actual commands and limitations in the final report. Do not claim publication, repository settings changes, deployment, or release creation unless verified.

## Collaboration

Split parallel work by file ownership and agree command/data contracts before editing shared files. Review integrated results and send incomplete or incorrect work back for correction. Keep bug reports reproducible and focused on one issue; follow [bug-reports/README.md](bug-reports/README.md).
