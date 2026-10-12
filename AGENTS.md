# Instructions for coding agents

## Scope and fidelity

- Read [README.md](README.md), [docs/ROADMAP.md](docs/ROADMAP.md), and the relevant subsystem docs before changing behavior. The user-authorized [0.6.0 contract](docs/0.6.0_TASKS.md) selects original Stunt Cycle and Indy 4 with player-supplied ROMs. Preserve the delivered [0.5.0 four-game/Home Screen foundation](docs/0.5.0_TASKS.md), off-court touch controls and opt-in qualification collector. Physical qualification remains pending; it gates final tags and broad-game-support readiness, not this explicitly authorized development or independently reviewed preview delivery. Offline/service-worker delivery is excluded by default pending a concrete reviewed scope decision. Both selected ROM-backed titles inherit unavailable audio; do not fabricate replacement sound.
- Preserve all 21 DICE 0.9 games as the 1.0 scope. A difficult game is a recorded blocker, not permission to remove it.
- Keep `upstream/dice-0.9/` byte-identical to its audited source inventory. Build from a disposable copy. Place NoCPU adapters and instrumentation elsewhere, documenting any derived-source patches and attribution.
- Preserve the circuit scheduler, integer simulation time, video geometry, PCM generation, and supported physical inputs. Browser adaptations must change access to the hardware, with behavior verified against the native reference.
- Treat [docs/POST_1_0_GAMES.md](docs/POST_1_0_GAMES.md) as research, not authorization to expand the release scope.

## Assets and generated output

- Never commit or publish ROM payloads, private fixture archives, credentials, or secrets. Checksum/size metadata is permitted. Keep fixtures outside the checkout or in explicitly ignored local storage.
- Keep binaries, build copies, runtime settings, frame/audio captures, and temporary reports under ignored `build/` output. Release packaging must exclude private fixtures and generated local evidence unless specifically reviewed for distribution.
- Audit the applicable component notices before distributing code or binaries. Preserve existing copyright and license texts.
- Source-release and browser-distribution license gates are separate. A source-ready assessment does not clear generated JS/Wasm, native binaries or toolchain containers. Browser output must include applicable notices and a matching corresponding-source archive.

## Required checks and reporting

- Run `python3 tools/check.py` for repository changes. Run `./tools/build-native.sh` and `./tools/capture-pong.sh` for changes affecting compilation, the native toolchain, simulation, input replay, or captured evidence.
- Use `python3 tools/audit-games.py` and `python3 tools/audit-roms.py` when changing game or ROM metadata. Validate actual fixtures separately with `python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures` when authorized access exists.
- Add or run meaningful tests for changed behavior; do not manufacture tests that merely repeat the implementation. Inspect failed checks and fix the cause before claiming success.
- ROM-dependent checks without fixtures are skipped or blocked. A fixture-free metadata audit is not a ROM-loading or gameplay pass.
- Distinguish build, checksum, basic rendering, scenario coverage, audio capture, full gameplay, and real-device results. Never infer phone performance from a native build or sound accuracy from a dummy audio device.
- For browser changes, run the documented core build/comparison and browser checks in [docs/TESTING.md](docs/TESTING.md). Keep picosecond time inside C++/Wasm integer values and respect the ABI's frame/PCM ownership and bounded stepping rules.
- Physical Android/iPhone evidence must identify the tested runtime and actual model/browser. Automation with a mobile viewport is separate evidence. A preview may support device testing; final release-readiness must reflect the agreed device gate honestly.
- Record actual commands and limitations in the final report. Do not claim publication, repository settings changes, deployment, or release creation unless verified.

## Collaboration

The root agent is the orchestrator: break the user's goal into incremental roadmap tasks, assign implementation and investigation to agents, decide review outcomes, and remain available for user messages. Delegate coding, technical analysis, tests, CI polling, repairs and release execution. After assignment, wait for agent reports or user steering rather than taking on an individual implementation task. Assign completed work to another agent for independent review; route required repairs back to an agent and repeat review until the acceptance criteria pass.

Split parallel work by file ownership and agree command/data contracts before editing shared files. Agents report concise, timestamped milestones, acceptance results, blockers and the next action. State whether each assignment is running, waiting on a named dependency, or complete. Keep detailed logs and analysis in ignored `build/` evidence so the orchestrator can retain broad project context without carrying raw technical output. Do not imply that work or monitoring continues when no agent or external job is running.

Keep bug reports reproducible and focused on one issue; follow [bug-reports/README.md](bug-reports/README.md).
