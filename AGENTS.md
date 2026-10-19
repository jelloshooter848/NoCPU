# Instructions for coding agents

## Direction and scope

- Read [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), and the relevant subsystem docs before changing behavior. NoCPU restarted desktop-first at version 0.1.0. Versions up to 0.6.0 belong to the legacy line (tag `legacy-0.6.0`); records under [docs/legacy/](docs/legacy/) are historical evidence, not current contracts.
- The goal is all 21 DICE 0.9 games running accurately in desktop browsers, played with keyboard and mouse through the minimal interface defined in the ROADMAP "Goal": game picker, game canvas, controls help, user-supplied ROM loading, pause/reset, volume/mute, the game's DIP/potentiometer settings, and an About panel with DICE credit, license notices and the corresponding-source link. Accuracy comes before features and polish.
- Preserve all 21 DICE 0.9 games as the 1.0 scope. A difficult game is a recorded blocker, not permission to remove it.
- Mobile/touch UI, phone device qualification, iPhone Home Screen/PWA support and any physical-device gate are deferred to a post-accuracy phase. They must not gate, block or be added to desktop milestones unless the user explicitly re-authorizes them.
- Offline/service-worker delivery is excluded unless a reviewed scope decision is made.
- A native desktop app (an SDL2 front end over the same core) is an optional later item, not a 1.0 requirement.
- Rust, assembly or other rewrites of the emulator are out of scope. Performance work means profiling and optimising the existing C++ core, with every change verified behind the original/native/Wasm comparison harness.
- Treat [docs/POST_1_0_GAMES.md](docs/POST_1_0_GAMES.md) as research, not authorization to expand the release scope.

## Fidelity

- Keep `upstream/dice-0.9/` byte-identical to its audited source inventory. Build from a disposable copy. Place NoCPU adapters and instrumentation elsewhere, documenting any derived-source patches and attribution.
- Preserve the circuit scheduler, integer simulation time, video geometry, PCM generation, and supported physical inputs. Browser adaptations must change access to the hardware, with behavior verified against the native reference.
- Keep picosecond time inside C++/Wasm integer values and respect the ABI's frame/PCM ownership and bounded stepping rules.
- Reproduce sound that DICE implements and record inherited absent audio; never fabricate replacement sound.
  The one owner-approved exception is Pin Pong's sound and free-game select, reconstructed from Atari's schematic and labelled as such ([docs/PINPONG_SOUND.md](docs/PINPONG_SOUND.md); ROADMAP decision of 2026-10-18). Any further reconstruction needs its own owner decision.

## Assets and generated output

- Never commit or publish ROM payloads, private fixture archives, credentials, or secrets. Checksum/size metadata is permitted. Keep fixtures outside the checkout or in explicitly ignored local storage. ROMs are supplied by the player at runtime.
- Keep binaries, build copies, runtime settings, frame/audio captures, and temporary reports under ignored `build/` output. Packaging must exclude private fixtures and generated local evidence unless specifically reviewed for distribution.
- Audit the applicable component notices before distributing code or binaries. Preserve existing copyright and license texts.
- Any published browser build must ship the applicable license notices and a matching corresponding-source archive. Source-release and browser-distribution license gates are separate: a source-ready assessment does not clear generated JS/Wasm, native binaries or toolchain containers.

## Required checks and reporting

- Run `python3 tools/check.py` for repository changes. Run `./tools/build-native.sh` and `./tools/capture-pong.sh` for changes affecting compilation, the native toolchain, simulation, input replay, or captured evidence.
- For core or browser changes, run the documented core build and original/native/Wasm comparison plus the desktop browser checks in [docs/TESTING.md](docs/TESTING.md). A newly ported game is not accepted until its original/native/Wasm comparison passes.
- Use `python3 tools/audit-games.py` and `python3 tools/audit-roms.py` when changing game or ROM metadata. Validate actual fixtures separately with `python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures` when authorized access exists.
- Add or run meaningful tests for changed behavior; do not manufacture tests that merely repeat the implementation. Inspect failed checks and fix the cause before claiming success.
- ROM-dependent checks without fixtures are skipped or blocked. A fixture-free metadata audit is not a ROM-loading or gameplay pass.
- Distinguish build, checksum, basic rendering, scenario coverage, audio capture, full gameplay and performance results. Never infer browser performance from a native build or sound accuracy from a dummy audio device. Name the actual desktop browser and version for browser evidence.
- Record actual commands and limitations in the final report. Do not claim publication, repository settings changes, deployment, or release creation unless verified.

## Collaboration

The root agent is the orchestrator: break the user's goal into incremental roadmap tasks, assign implementation and investigation to agents, decide review outcomes, and remain available for user messages. Delegate coding, technical analysis, tests, CI polling, repairs and release execution. After assignment, wait for agent reports or user steering rather than taking on an individual implementation task. Assign completed work to another agent for independent review; route required repairs back to an agent and repeat review until the acceptance criteria pass.

Split parallel work by file ownership and agree command/data contracts before editing shared files. Agents report concise, timestamped milestones, acceptance results, blockers and the next action. State whether each assignment is running, waiting on a named dependency, or complete. Keep detailed logs and analysis in ignored `build/` evidence so the orchestrator can retain broad project context without carrying raw technical output. Do not imply that work or monitoring continues when no agent or external job is running.

## Branches, releases and changelog

- Work on the single long-lived working branch (`restart/desktop-first` for now). It merges into `main` only through release PRs with merge commits. Parallel agents may use short-lived `wip/<version>-<topic>` branches merged back into the working branch. Do not open per-task PRs to `main`.
- Follow [docs/RELEASING.md](docs/RELEASING.md): patches for fixes/tooling/docs/UI, a minor release per milestone, `-rc.N` for testers. The release commit touches only the version fields and CHANGELOG.md, and `python3 tools/release_check.py --tag vX.Y.Z` must pass. Agents never create, push or move tags; the owner tags the merged release. A failed release is fixed by the next patch.
- Add a player-facing line under `## [Unreleased]` in CHANGELOG.md for user-visible changes. Never call a build accuracy-qualified unless its comparisons passed.
- Record owner decisions in the dated log in [docs/ROADMAP.md](docs/ROADMAP.md) and keep its milestone Status column current.

Keep bug reports reproducible and focused on one issue; follow [bug-reports/README.md](bug-reports/README.md). Reports quote the build string and end with `Status: fixed in <commit>` or `Status: not a bug — <reason>`.
