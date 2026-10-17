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
than inheriting browser passes (done in 0.1.1; see [ACCEPTANCE.md](ACCEPTANCE.md)).

Fifteen titles were unported at the restart (eleven remain after 0.2.0; see Milestones):

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
| Desktop UI (Phase 2): mobile, touch and device qualification removed; minimal desktop UI with build string | 0.1.1 | Released (2026-10-14) |
| Original/native/Wasm comparisons re-run for the six ported games | 0.1.1 | Released (2026-10-14): 6/6 pass, Indy 4 renderer fix ([ACCEPTANCE.md](ACCEPTANCE.md)); desktop browser acceptance follows in 0.1.3 |
| Faster CI; ROM browser tests in CI; Indy 4 Firefox test fix | 0.1.2 | Released (2026-10-14) |
| Desktop acceptance generated by each release (six games, Chromium and Firefox); closes the reset phase | 0.1.3 | Released (2026-10-14) |
| Title menu: Library replaces Play Pong and opens on the last game played | 0.1.4 | Released (2026-10-15) |
| UI: Home (schematic sheet) and Play (arcade picker) screens | 0.1.5 | Released (2026-10-15) |
| Simpler phone Home and Play (arcade style) | 0.1.6 | Released (2026-10-15) |
| CI: skip already-compared core content across branches and release edits; robust WebKit Space Race test | 0.1.7 | Released (2026-10-16) |
| ROM-free batch A | 0.2.0 | Released (2026-10-17) |
| Docs refresh, browser license re-assessment, packaging check | 0.2.1 | In review |
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
v0.1.1 was published on 2026-10-14 (release run 38491883569, GitHub Release and Pages
from commit `b0eec13`), and v0.1.2 the same day (release run 38515838264, from
commit `e218c75`), and v0.1.3 the same day (release run 38560946295).

1. Rewrite the agent rules, roadmap and version. (Done.)
2. Replace the legacy physical-device release gate with a desktop release readiness record that keeps the device gate deferred. (Done.)
3. Refresh the browser component/notice/corresponding-source assessment for the actual 0.1.0 output. (Done; see [BROWSER_DISTRIBUTION.md](BROWSER_DISTRIBUTION.md).)

Exit: a `v0.1.0` tag passes the release workflow, and the published build carries notices and matching source.

### 0.1.x — Reset completion (patch releases)

1. Phase 2: remove mobile/touch controls, the phone qualification collector, Home Screen/PWA manifest and icons and the remaining legacy release-process overhead, keeping the core, comparison harness, ROM/game audits and license/source packaging; reduce the frontend to the minimal desktop interface above, including the About panel build string, for the six ported circuits. (Done; released in 0.1.1.)
2. Re-run original/native/Wasm comparisons for all six games and automated desktop browser checks in Playwright's Chromium and Firefox builds, and publish with each release a desktop acceptance record generated from that release's own verification run (the release readiness record states the policy). (Comparisons: all six pass after the Indy 4 renderer fix, released in 0.1.1; see [ACCEPTANCE.md](ACCEPTANCE.md). Desktop acceptance: from 0.1.3 the readiness record states the policy and each release generates and publishes its acceptance record from its own browser jobs, in Playwright's Chromium and Firefox builds at the exact shipped runtime, and refuses to publish unless it passed; see [RELEASING.md](RELEASING.md#the-desktop-acceptance-record). Manual checks in a release Chrome or Firefox are optional supplementary evidence in ACCEPTANCE.md. Released in 0.1.3.)
3. Speed up CI: cache the original DICE reference captures, keyed by the upstream, reference-build and scenario hashes; skip the comparisons when the core and scenarios are unchanged; drop the emulated phone projects (done in Phase 2); and run the browser engines as parallel jobs. The full comparison always runs when the core or the scenarios change. (Done; released in 0.1.2.)
4. Any other reset leftovers. (0.1.3 makes desktop acceptance a generated release gate and closes the reset phase; released. 0.1.4 replaces the title screen's Play Pong button with the Library, which opens on the last game played; released.)

Exit: the six ported games are playable on desktop with keyboard/mouse, their comparisons pass, and each published build carries notices and matching source.

### 0.2.0 — ROM-free batch A

Port Rebound, Gotcha, Quadrapong and Crossfire. Add keyboard/mouse mappings for
horizontal paddles, four-player paddles and joystick/button games, with per-game
controls help.

Done: all four are verified against original DICE and were released in 0.2.0 on
2026-10-17 (ten playable games). 0.2.1 refreshes the docs, re-assesses the
browser license record for the ten-circuit build, and links the site from the
README.

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
- **2026-10-12 — ROM fixtures from a private repository.** ROM fixtures come from the private repository `jelloshooter848/NoCPU-Roms`, for development and CI only. Agents fetch them into ignored local storage; CI reads them with a read-only secret; the local development server may load them automatically. They are never in published builds. In-app loading from the private repository (with a player-supplied GitHub token) is deferred and not authorized: the owner will reconsider it later. The fetch tooling and CI wiring were pending at the time; both are done (`tools/fetch-roms.sh` in 0.1.1, the ROM-backed CI jobs in 0.1.2).
- **2026-10-13 — 0.1.0 is the reset baseline.** 0.1.0 ships soon as the current working-branch content: the new rules, process and ROM tooling, with the legacy browser UI still in place. The remaining reset work lands as 0.1.x patch releases: Phase 2 (mobile, touch and device qualification removed; minimal desktop UI with a build string), the original/native/Wasm comparisons re-run for all six ported games, and any leftovers. The 0.2.0 and later milestones are unchanged.
- **2026-10-13 — 0.2.0 stays the first ROM-free batch.** 0.2.0 remains ROM-free batch A (Rebound, Gotcha, Quadrapong, Crossfire); the later milestones are unchanged.
- **2026-10-13 — v0.1.0 tagged but not published.** The v0.1.0 release run failed one flaky legacy emulated-iPhone test, and "Re-run failed jobs" could not fetch the core artifact from the first attempt (fixed in 0.1.x). Nothing was deployed and the GitHub release has no assets. The `v0.1.0` tag stays as it is (tags are never moved); 0.1.1 is the first published release.
- **2026-10-13 — Speed up CI.** A 0.1.x patch speeds up CI: the original DICE reference captures are cached, keyed by the upstream, reference-build and scenario hashes; comparisons are skipped when the core and scenarios are unchanged; the emulated phones are gone (done in Phase 2); and the browser engines run as parallel jobs. The full comparison always runs when the core or the scenarios change.
- **2026-10-14 — 0.1.2 ships the faster CI.** The faster CI and its proof ship as v0.1.2: original reference captures reused when nothing they depend on changed (releases always capture fresh), comparisons skipped only for content an earlier run already compared, browser engines in parallel, the ROM-backed Stunt Cycle and Indy 4 browser tests in CI (Chromium and Firefox), and the Indy 4 Firefox test fix. No gameplay changes. The release commit follows once CI is green and the work is reviewed.
- **2026-10-14 — 0.1.3 closes the reset phase.** v0.1.2 was published (release run 38515838264). 0.1.3 records desktop acceptance for the six ported games: because the version bump in the release commit changes the runtime digest, the release workflow generates the acceptance record from its own browser jobs against the exact build it ships (Chromium and Firefox, Playwright builds, named as such; Stunt Cycle and Indy 4 from the private ROMs) and refuses to publish unless it passed. The readiness record states the policy. Optional human checks are supplementary evidence in ACCEPTANCE.md and never required. No gameplay changes.
- **2026-10-14 — 0.1.4 title menu.** v0.1.3 was published (release run 38560946295). The title screen's Play Pong button, left over from when Pong was the only game, is removed: Continue (shown once a game has been played) starts the last game, and Library leads the menu otherwise. A visual revamp of the UI follows as a separate change once the owner picks a design direction.
- **2026-10-14 — UI direction and the Circuits track.** The owner chose the UI structure: Home is the schematic-sheet design (concept A), with an optional draw-in animation; Play opens an arcade-style game picker (concept C), which can later become the mobile default; and Circuits (concept D, logic-analyzer style) is a workbench with, for each game, a clean schematic generated from the circuit NoCPU runs, original scans (linked or player-supplied only, never in this repository), a board view, and a live view of circuit activity. This relaxes the earlier "minimal UI until 1.0" rule for this feature track. Home and Play ship as a small UI release after 0.1.4. Circuits follows after the 0.4.0 profiling milestone: schematics and board views first, then the live view, which needs a read-only probe in the core and therefore a full comparison run. 0.2.0 and 0.3.0 continue as planned.
- **2026-10-14 — 0.1.4 drops Continue.** At the owner's request the title menu's Continue item is removed because it cluttered the menu; the title menu is Library, Settings, How to play and About. The last game played is still remembered once it has loaded, and opening the Library focuses it (the first game when none is remembered or it is no longer playable).
- **2026-10-15 — Home and Play details for 0.1.5.** v0.1.4 was released. For the new Home (schematic sheet) and Play (arcade court) screens the owner decided: (1) on Play, Enter on a playable game starts it directly, exactly as the Play button does (a ROM game without its ROM explains on its info page); Enter on a game not ported yet opens its info page, and the Game info button, a click or Space opens a game's info page; (2) the screens use installed-font stacks only (the IBM Plex and Silkscreen names first, then system faces), so no font is bundled or downloaded and the packaged asset set and license audit are unchanged; (3) the Home title block's SHEET reads "1 OF N", N being the number of playable games counted from the game catalog (6 today), the same count as the footer's "6 OF 21 GAMES PLAYABLE"; (4) at the owner's explicit request, the mobile layout of Home/Play is kept simple and presentable (phone portrait and landscape: Home stacks the logo above full-width menu pins, Play is a single column with the selected game's Play button held in view, and Settings, How to play and About do not overflow); mobile gameplay/touch controls are still deferred; (5) installing NoCPU as an app (desktop install, mobile Add to Home Screen) was considered for 0.1.5 and deferred by the owner to the post-1.0 mobile phase, as originally planned.
- **2026-10-15 — Phones use the arcade style for Home and Play (0.1.6).** On phones the 0.1.5 schematic-sheet Home was too busy. Phones (phone-sized windows, portrait and landscape) use the phosphor-court style (concept C) for Home and Play: a black screen, a blocky NO CPU logo with a soft glow, one tagline and the menu marked by a glowing paddle, and on Play the playable games with the selected game's Play button. Desktop keeps the schematic-sheet Home. Mobile gameplay and touch controls stay deferred.
- **2026-10-15 — 0.1.7 CI fixes.** At the owner's request, CI no longer repeats the original/native/Wasm comparison for content whose game core was already compared on any branch, and release version edits no longer count as core changes; releases still compare in full. The intermittent WebKit Space Race test now schedules its inputs on circuit time only. No gameplay changes.
- **2026-10-16 — 0.2.0 started.** The owner gave the go-ahead for 0.2.0 after v0.1.7. Rebound, Quadrapong, Crossfire and Gotcha are ported and verified against original DICE (ten playable games). Gotcha needs a derived-source reset patch (docs/UPSTREAM_PATCHES.md). Gotcha runs below real time in Playwright's Firefox build (about 0.35x on the 4-vCPU test machine); this is recorded for the 0.4.0 profiling milestone and noted in the changelog, not gated.
- **2026-10-17 — 0.2.1 docs patch.** v0.2.0 was released (release run 39043961048). At the owner's request 0.2.1 brings the README (with the site link at the top) and all docs up to date, re-assesses the browser license record for the ten-circuit build, and makes the packaging check require the game registry sources.

## After 1.0

- **Mobile phase:** touch controls, phone layouts, physical Android/iPhone device qualification and optional iPhone Home Screen/PWA support. The legacy line's touch and qualification work in [docs/legacy/](legacy/README.md) is reference material.
- **Optional native desktop app:** an SDL2 front end over the same core, verified against the same comparison harness.
- **New games and enhancements:** see [POST_1_0_GAMES.md](POST_1_0_GAMES.md); the 21-game fidelity suite remains the regression gate.

## Known barriers

- Ten games declare ROMs (Anti-Aircraft, Attack, Clean Sweep, Crash 'N Score, Indy 4, Jet Fighter, Shark Jaws, Steeplechase, Stunt Cycle, Wipe Out). Private fixtures exist outside the public repository; each environment must verify access rather than assume it. Distribution permission is unverified, so ROMs stay player-supplied.
- Eight titles have no active DICE audio hookup (Anti-Aircraft, Hi-Way, Indy 4, Jet Fighter, Pin Pong, Shark Jaws, Steeplechase, Stunt Cycle). NoCPU documents this rather than reconstructing sound for 1.0.
- Heavy circuits may not sustain real time in Wasm; the profiling milestone measures this before the ROM-backed batches.
- Analog controls (paddles, wheels, throttles) need keyboard/mouse mappings that preserve the circuit's input ranges.
