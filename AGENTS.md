# Instructions for coding agents

## Direction and scope

- Read [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), and the relevant subsystem docs before changing behavior. NoCPU restarted desktop-first at version 0.1.0. Versions up to 0.6.0 belong to the legacy line (tag `legacy-0.6.0`); records under [docs/legacy/](docs/legacy/) are historical evidence, not current contracts.
- The goal is all 21 DICE 0.9 games running accurately in desktop browsers, played with keyboard and mouse through a minimal interface: game picker, game canvas, controls help and user-supplied ROM loading. Accuracy comes before features and polish.
- Preserve all 21 DICE 0.9 games as the 1.0 scope. A difficult game is a recorded blocker, not permission to remove it.
- Mobile/touch UI, phone device qualification, iPhone Home Screen/PWA support and any physical-device gate are deferred to a post-accuracy phase. They must not gate, block or be added to desktop milestones unless the user explicitly re-authorizes them.
- A native desktop app (an SDL2 front end over the same core) is an optional later item, not a 1.0 requirement.
- Rust, assembly or other rewrites of the emulator are out of scope. Performance work means profiling and optimising the existing C++ core, with every change verified behind the original/native/Wasm comparison harness.
- Treat [docs/POST_1_0_GAMES.md](docs/POST_1_0_GAMES.md) as research, not authorization to expand the release scope.

## Fidelity

- Keep `upstream/dice-0.9/` byte-identical to its audited source inventory. Build from a disposable copy. Place NoCPU adapters and instrumentation elsewhere, documenting any derived-source patches and attribution.
- Preserve the circuit scheduler, integer simulation time, video geometry, PCM generation, and supported physical inputs. Browser adaptations must change access to the hardware, with behavior verified against the native reference.
- Keep picosecond time inside C++/Wasm integer values and respect the ABI's frame/PCM ownership and bounded stepping rules.
- Reproduce sound that DICE implements and record inherited absent audio; never fabricate replacement sound.

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

Keep bug reports reproducible and focused on one issue; follow [bug-reports/README.md](bug-reports/README.md).
