# NoCPU roadmap: desktop-first accuracy

## Goal

NoCPU 1.0 runs all 21 DICE 0.9 games accurately in desktop browsers. Accuracy
means the original circuit scheduler, integer simulation time, video geometry,
implemented PCM audio, game settings and player inputs behave as the native
DICE reference does, verified by original/native/Wasm comparisons. Faithfulness
includes documenting DICE's unfinished hardware models (for example, the eight
titles with no active audio hookup) rather than inventing replacements.

The desktop interface stays minimal until accuracy is complete:

- a game picker listing all 21 titles, with unported ones clearly marked;
- the original game raster on a canvas, at its original orientation and aspect;
- keyboard and mouse controls, with a per-game controls help panel;
- user-supplied ROM loading with name/size/checksum validation for the ten ROM-dependent titles;
- pause/reset, volume/mute, the game's DIP/potentiometer settings, and an About panel with DICE credit, license notices and the corresponding-source link.

Rust, assembly or other rewrites of the emulator are out of scope. Performance
work profiles and optimises the existing C++ core behind the comparison harness.

## History

Versions up to 0.6.0 belong to the legacy NoCPU line, which pursued a
browser-and-phone app with touch controls, physical-device qualification and
iPhone Home Screen support. Its final state is preserved at tag `legacy-0.6.0`
(commit `7196d709911fbb0b043cb007be77b49d1f592ad5`); its changelog, task
contracts, validation ledgers and device packets are kept in
[docs/legacy/](legacy/README.md). The restarted line reuses the legacy core,
comparison harness and audits, and numbers its versions from 0.1.0 again.

## Scope rules

- All 21 DICE 0.9 games are the 1.0 scope. A difficult game is a recorded blocker, not permission to drop it. Building a circuit into a binary is not the same as validating it.
- ROMs are never bundled. ROM-dependent titles are playable with validated player-supplied files; missing private fixtures block validation and are never reported as a pass.
- Mobile/touch UI, phone device qualification, iPhone Home Screen/PWA and any physical-device release gate are deferred to the post-1.0 phase and do not gate desktop milestones.
- Gamepad support, remapping and persistent preferences are optional desktop conveniences; add them only when they do not delay accuracy work.
- Save states, rewind, netplay, new games, circuit editing and enhanced modes are outside 1.0. [POST_1_0_GAMES.md](POST_1_0_GAMES.md) is research only.
- Any published browser build ships its applicable license notices and a matching corresponding-source archive.

## Game status at the restart

Six circuits are compiled by the core (`core/api.cpp` registers `circuit_pong`,
`circuit_pongdoubles`, `circuit_spacerace`, `circuit_breakout`,
`circuit_stuntcycle` and `circuit_indy4`) and had original/native/Wasm
comparison evidence from the legacy line:

| Game | ROM | Legacy evidence |
| --- | --- | --- |
| Pong | none | Portable native/Wasm replay matches the original baseline |
| Pong Doubles | none | Original-derived scenarios match through reset epochs |
| Space Race | none | Original-derived scenarios match, including pot/coinage settings |
| Breakout | none | Sixteen-scenario batch and canonical ABI traces match |
| Stunt Cycle | `stuntcycle.zip` | Comparison gate accepted with private fixtures; inherits DICE's missing audio |
| Indy 4 | `indy4.zip` | Comparison gate accepted with private fixtures; inherits DICE's missing audio |

For Stunt Cycle and Indy 4 the legacy [0.6.0 ledger](legacy/0.6.0_VALIDATION.md)
accepted the complete original/native/Wasm comparison gate, but their browser
and delivery gates were still open when the legacy line ended. The 0.1.x patch
releases re-run all six comparisons against the reduced desktop frontend rather
than inheriting browser passes.

Fifteen titles remain unported:

- ROM-free (7): Rebound, Gotcha, TV Basketball, Quadrapong, Crossfire, Pin Pong, Hi-Way.
- ROM-backed (8): Anti-Aircraft, Attack, Shark Jaws, Jet Fighter, Crash 'N Score, Clean Sweep, Wipe Out, Steeplechase.

See [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) for controls, players,
rotation and audio hookups, and [ROMS.md](ROMS.md) for ROM requirements.

## Milestones

Each milestone is a **minor release** (0.2.0, 0.3.0, …) once its game batch or
goal passes its comparisons; the remaining reset work after the 0.1.0 baseline
ships as 0.1.x patch releases. Patch releases (0.2.1, …) ship in between for
fixes, tooling, docs and UI, and `-rc.N` release candidates give testers a
build before a release. [RELEASING.md](RELEASING.md) has the version rules and
the release steps.

| Milestone | Release | Status |
| --- | --- | --- |
| Reset baseline | 0.1.0 | Tagged 2026-10-13, not published (release run failed; see owner decision) |
| Desktop UI (Phase 2): mobile, touch and device qualification removed; minimal desktop UI with build string | 0.1.x patch | In review |
| Original/native/Wasm comparisons re-run for the six ported games | 0.1.x patch | In review: 6/6 pass, Indy 4 renderer fix ([ACCEPTANCE.md](ACCEPTANCE.md)) |
| Faster CI; ROM browser tests in CI; Indy 4 Firefox test fix | 0.1.2 | In progress |
| Remaining reset leftovers | 0.1.x patch | Planned |
| ROM-free batch A | 0.2.0 | Planned |
| ROM-free batch B | 0.3.0 | Planned |
| Profiling and performance | 0.4.0 | Planned |
| ROM-backed batch A | 0.5.0 | Planned |
| ROM-backed batch B | 0.6.0 | Planned |
| Accuracy closure | 0.7.0 and later 0.x | Planned |
| All 21 accurate on desktop | 1.0.0 | Planned |

Status is one of **Planned**, **In progress**, **In review** (work complete,
under independent review or in a release pull request) or **Released
(YYYY-MM-DD)** (the owner has tagged the release and the release workflow
published it). A tag whose release run did not publish is recorded as such
(see 0.1.0). Update the row in the same change that moves a milestone.

Every milestone runs `python3 tools/check.py`, the native build/capture checks
for core changes, the original/native/Wasm comparison for each playable game,
and the desktop browser checks in [TESTING.md](TESTING.md). Desktop browser
evidence names the actual browser and version.

### 0.1.0 — Reset baseline

The first restarted release, tagged `v0.1.0` on 2026-10-13, is the working-branch
content at that point: the new agent rules, roadmap, release process and ROM
tooling, with the legacy browser UI still in place. It makes no desktop accuracy
claim. The tag stays, but the release was not published: its release run failed
(see the owner decision of 2026-10-13), so 0.1.1 is the first published release.

1. Rewrite the agent rules, roadmap and version. (Done.)
2. Replace the legacy physical-device release gate with a desktop release readiness record that keeps the device gate deferred. (Done.)
3. Refresh the browser component/notice/corresponding-source assessment for the actual 0.1.0 output. (Done; see [BROWSER_DISTRIBUTION.md](BROWSER_DISTRIBUTION.md).)

Exit: a `v0.1.0` tag passes the release workflow, and the published build carries notices and matching source.

### 0.1.x — Reset completion (patch releases)

1. Phase 2: remove mobile/touch controls, the phone qualification collector, Home Screen/PWA manifest and icons and the remaining legacy release-process overhead, keeping the core, comparison harness, ROM/game audits and license/source packaging; reduce the frontend to the minimal desktop interface above, including the About panel build string, for the six ported circuits. (Done; in review.)
2. Re-run original/native/Wasm comparisons for all six games and desktop browser checks in at least Chrome and Firefox, and record desktop acceptance in the release readiness record. (Comparisons: all six pass after the Indy 4 renderer fix, in review; see [ACCEPTANCE.md](ACCEPTANCE.md). Desktop acceptance stays pending: local browser evidence is Chromium only, and Firefox and WebKit run in CI.)
3. Speed up CI: cache the original DICE reference captures, keyed by the upstream, reference-build and scenario hashes; skip the comparisons when the core and scenarios are unchanged; drop the emulated phone projects (done in Phase 2); and run the browser engines as parallel jobs. The full comparison always runs when the core or the scenarios change.
4. Any other reset leftovers.

Exit: the six ported games are playable on desktop with keyboard/mouse, their comparisons pass, and each published build carries notices and matching source.

### 0.2.0 — ROM-free batch A

Port Rebound, Gotcha, Quadrapong and Crossfire. Add keyboard/mouse mappings for
horizontal paddles, four-player paddles and joystick/button games, with per-game
controls help.

### 0.3.0 — ROM-free batch B

Port TV Basketball, Pin Pong and Hi-Way, including the rotated Pin Pong raster
and Hi-Way's wheel mapping. All eleven ROM-free titles are playable at exit.

### 0.4.0 — Profiling and performance

Before the heavier ROM-backed titles, profile the existing C++ core natively
and in Wasm on representative games: scheduler hot paths, video output, PCM
generation and worker transfer costs. Optimise measured bottlenecks only, with
every change verified by unchanged original/native/Wasm comparisons. Record
simulation speed against real time for each ported game on named desktop
hardware/browsers. Establish a single-threaded baseline before considering
threads or SharedArrayBuffer.

### 0.5.0 — ROM-backed batch A

Port Anti-Aircraft, Shark Jaws, Jet Fighter and Attack (including Attack's
alternative CRCs). Comparisons require authorized private fixtures; without
them the games are recorded as blocked, not passed.

### 0.6.0 — ROM-backed batch B

Port Crash 'N Score, Clean Sweep, Wipe Out and Steeplechase (six players; its
missing bugle ROM is an inherited DICE limitation). All 21 games are ported at
exit.

### 0.7.0 and later 0.x — Accuracy closure

Complete the 21-game matrix: coin/start, every control and player slot, DIP and
potentiometer settings, attract mode, scoring/end state, reset and game
switching for each title. Separate upstream defects from port regressions and
fix the regressions. Re-profile any game that does not sustain full speed.

Known coverage gaps from the 0.1.x comparison re-run ([ACCEPTANCE.md](ACCEPTANCE.md)),
to close here:

- Pong: the Winning Score DIP 15 and the end-of-game state are not exercised.
- Breakout: no scenario reaches the bonus-credit award threshold.
- Stunt Cycle: no scenario reaches the free-game award.

### 1.0 — All 21 accurate on desktop

All 21 games pass their original/native/Wasm comparisons and desktop browser
checks; inherited limitations (absent audio, missing ROM dumps) are documented.
The release ships reproducible build instructions, notices, matching source,
the compatibility matrix and a changelog.

## Owner decisions

Dated decisions by the project owner that shape this roadmap. Add new entries
at the bottom; do not rewrite earlier ones.

- **2026-10-12 — Desktop-first restart.** NoCPU restarts with all 21 DICE 0.9 games accurate in desktop browsers as the 1.0 goal. Mobile/touch UI, phone qualification and iPhone Home Screen/PWA support move to the post-1.0 mobile phase; versions restart at 0.1.0.
- **2026-10-12 — Legacy line preserved.** The legacy line's final state is tag `legacy-0.6.0` (commit `7196d709911fbb0b043cb007be77b49d1f592ad5`); its records live in [docs/legacy/](legacy/README.md) as history, not current contracts.
- **2026-10-12 — Single working branch.** One long-lived working branch (`restart/desktop-first` for now) merges into `main` through release pull requests with merge commits. No per-task branches; parallel agents may use short-lived `wip/<version>-<topic>` branches merged back into the working branch.
- **2026-10-12 — Frequent releases.** Patch releases for fixes, tooling, docs and UI; a minor release for each milestone whose game batch passes its comparisons; `-rc.N` for tester builds, replacing the legacy "preview" stage; 1.0.0 when all 21 games pass their accuracy comparisons on desktop.
- **2026-10-12 — Owner creates release tags.** Agents cannot push tags. After a release pull request merges, the owner creates an annotated `vX.Y.Z` tag or a GitHub release on the merge commit. Tags are never moved; a failed release is fixed with the next patch release.
- **2026-10-12 — ROM fixtures from a private repository.** ROM fixtures come from the private repository `jelloshooter848/NoCPU-Roms`, for development and CI only. Agents fetch them into ignored local storage; CI reads them with a read-only secret; the local development server may load them automatically. They are never in published builds. In-app loading from the private repository (with a player-supplied GitHub token) is deferred and not authorized: the owner will reconsider it later. The fetch tooling and CI wiring are pending.
- **2026-10-13 — 0.1.0 is the reset baseline.** 0.1.0 ships soon as the current working-branch content: the new rules, process and ROM tooling, with the legacy browser UI still in place. The remaining reset work lands as 0.1.x patch releases: Phase 2 (mobile, touch and device qualification removed; minimal desktop UI with a build string), the original/native/Wasm comparisons re-run for all six ported games, and any leftovers. The 0.2.0 and later milestones are unchanged.
- **2026-10-13 — 0.2.0 stays the first ROM-free batch.** 0.2.0 remains ROM-free batch A (Rebound, Gotcha, Quadrapong, Crossfire); the later milestones are unchanged.
- **2026-10-13 — v0.1.0 tagged but not published.** The v0.1.0 release run failed one flaky legacy emulated-iPhone test, and "Re-run failed jobs" could not fetch the core artifact from the first attempt (fixed in 0.1.x). Nothing was deployed and the GitHub release has no assets. The `v0.1.0` tag stays as it is (tags are never moved); 0.1.1 is the first published release.
- **2026-10-13 — Speed up CI.** A 0.1.x patch speeds up CI: the original DICE reference captures are cached, keyed by the upstream, reference-build and scenario hashes; comparisons are skipped when the core and scenarios are unchanged; the emulated phones are gone (done in Phase 2); and the browser engines run as parallel jobs. The full comparison always runs when the core or the scenarios change.
- **2026-10-14 — 0.1.2 ships the faster CI.** The faster CI and its proof ship as v0.1.2: original reference captures reused when nothing they depend on changed (releases always capture fresh), comparisons skipped only for content an earlier run already compared, browser engines in parallel, the ROM-backed Stunt Cycle and Indy 4 browser tests in CI (Chromium and Firefox), and the Indy 4 Firefox test fix. No gameplay changes. The release commit follows once CI is green and the work is reviewed.

## After 1.0

- **Mobile phase:** touch controls, phone layouts, physical Android/iPhone device qualification and optional iPhone Home Screen/PWA support. The legacy line's touch and qualification work in [docs/legacy/](legacy/README.md) is reference material.
- **Optional native desktop app:** an SDL2 front end over the same core, verified against the same comparison harness.
- **New games and enhancements:** see [POST_1_0_GAMES.md](POST_1_0_GAMES.md); the 21-game fidelity suite remains the regression gate.

## Known barriers

- Ten games declare ROMs (Anti-Aircraft, Attack, Clean Sweep, Crash 'N Score, Indy 4, Jet Fighter, Shark Jaws, Steeplechase, Stunt Cycle, Wipe Out). Private fixtures exist outside the public repository; each environment must verify access rather than assume it. Distribution permission is unverified, so ROMs stay player-supplied.
- Eight titles have no active DICE audio hookup (Anti-Aircraft, Hi-Way, Indy 4, Jet Fighter, Pin Pong, Shark Jaws, Steeplechase, Stunt Cycle). NoCPU documents this rather than reconstructing sound for 1.0.
- Heavy circuits may not sustain real time in Wasm; the profiling milestone measures this before the ROM-backed batches.
- Analog controls (paddles, wheels, throttles) need keyboard/mouse mappings that preserve the circuit's input ranges.
