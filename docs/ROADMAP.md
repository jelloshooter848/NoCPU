# NoCPU roadmap: faithful 1.0 and future expansion

## Goal

NoCPU 1.0 is a faithful browser continuation of DICE 0.9: its 21 games, circuit behavior, implemented audio, game settings, and supported player inputs presented through a clear interface on desktop browsers and phones. Modernize access and usability first; expand the emulator and game library after the fidelity release. Faithfulness to DICE includes documenting its unfinished hardware models rather than promising historically complete sound in every title.

This plan draws on inspection of jelloshooter848/SMBC at d79b5f4163892a4212286ce566ad7276efd2970a (package version 0.4.42), including its README, input/audio implementations, CI, release workflow, releasing guide and bug-report process. The SMBC live application was not functionally tested during this review. Its roadmap contains future features; this plan does not treat them as shipped.

## What to carry over from SMB Crossover REMIX

- A public project with its own identity and prominent original-project credit.
- Static hosting through GitHub Pages, with no player account or backend required.
- Browser-first TypeScript tooling, frozen dependency installs, automated checks and developer commands.
- Unified keyboard/gamepad/touch inputs, remapping, controls labelled by their current function and a contextual how-to-play guide.
- Touch controls that appear when needed, with adjustable size and layouts and safe recovery when switching input modes.
- Persistent settings, explicit settings migrations, useful debug information and build-specific bug reports.
- Tagged releases, visible version/build identifiers, changelog entries, matching release downloads and deployment of tested releases rather than every main-branch commit.

SMBC is a from-scratch TypeScript reimplementation of a Flash game. NoCPU can retain DICE's working C++ engine and use WebAssembly. SMBC's MIT license and original art/music strategy do not replace DICE's GPL-3.0-or-later obligations or resolve ROM distribution rights. Component terms must also be retained; historical nall/Phoenix licensing evidence means the combined 0.1.0 distribution conservatively uses GPL version 3. Reuse patterns first; audit attribution and compatibility before copying specific code. NoCPU audio must reproduce circuit-generated PCM rather than substitute SMBC's chiptune synthesizer. Paddle and wheel games need analog-aware controls rather than a universal platform-game d-pad.

## 1.0 scope and release contract

Include all 21 registered DICE 0.9 games. Preserve original game metadata, DIP switches, player counts, circuit timing, video orientation and overlays, sounds and scoring behavior within documented comparison tolerances. Translate physical controls into usable browser inputs without changing the circuits.

The source audit identifies active mono-output hookups in thirteen games and none in Anti-Aircraft, Hi-Way, Indy 4, Jet Fighter, Pin Pong, Shark Jaws, Steeplechase, and Stunt Cycle. Several of those eight retain unfinished or commented sound circuits. The 1.0 contract reproduces sound that DICE implements and clearly records inherited absent audio; it does not require reconstructing these historical sound circuits. See [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md). A hookup is source evidence, not proof of audible playback or complete sound accuracy.

A ROM-dependent title may require player-supplied files. Show this before Play, validate names/sizes/checksums using audited requirements, explain errors, and retain files locally only with the user's choice. Do not bundle ROMs without established permission. Missing ROM fixtures are an explicit validation blocker for those games, not a passing result.

A phone must support selecting a game, understanding its controls, providing ROMs where needed, inserting a coin, starting, playing, pausing and returning to the library. Preserve all player slots; test multiplayer with suitable controllers and device layouts. Do not assume four players can comfortably share one phone screen.

In-app pause/reset, volume/mute, display sizing, remapping and persistent settings are in scope. Exact desktop Qt dialogs and physical multi-mouse hardware access are replaced with browser-appropriate interfaces. Save states, rewind, netplay, new games, circuit editing/visualization and enhanced modes are outside 1.0. Home-screen/offline PWA support is a later addition unless it becomes essential to the agreed mobile experience; mobile browser play is required regardless.

## Milestones

### 0.1.0 — GitHub repository foundation and measurable native reference

Implementation and the review gauntlet are complete for the 0.1.0 source candidate; see [0.1.0_VALIDATION.md](0.1.0_VALIDATION.md). The source foundation is merged; no release tag has been published. See [TESTING.md](TESTING.md) for actual command contracts, [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) for validation coverage, [PROVENANCE.md](PROVENANCE.md) for the source and license audit, and [RELEASING.md](RELEASING.md) for the publication gate. Browser/mobile support is not part of this release.

The repository itself is a deliverable of 0.1.0, following SMBC's separation of runtime code, tools, documentation, bug reports and release automation. Foundation layout:

```text
NoCPU/
  README.md                  # identity, original credit, scope, build/play instructions
  LICENSE                    # GPL-3.0-or-later project notice
  THIRD_PARTY_NOTICES.md
  CHANGELOG.md
  CONTRIBUTING.md
  AGENTS.md                  # project boundaries and required checks for coding agents
  .github/
    pull_request_template.md
    ISSUE_TEMPLATE/
    workflows/ci.yml
    workflows/release.yml
  upstream/dice-0.9/         # original source, with generated artifacts excluded
  core/                     # NoCPU core adapters and documented port changes
  web/                      # browser frontend, input, rendering, audio, storage
  tests/                    # native/Wasm comparisons, replay scenarios, browser smoke tests
  tools/                    # build, audit, capture, ROM inspection and release tools
  docs/
    ROADMAP.md
    ARCHITECTURE.md
    PROVENANCE.md
    GAME_COMPATIBILITY.md
    ROMS.md
    TESTING.md
    RELEASING.md
  bug-reports/
    README.md
    TEMPLATE.md
```

Use a root package manifest/lockfile for browser tooling when introduced, pinned Emscripten/native toolchains, and ignored build output and local ROM directories. Track ROM requirements and hashes, not proprietary ROM payloads. Do not assume saved Docker state is a prerequisite for every contributor: document the native reference environment and provide reproducible build scripts.

0.1.0 establishes CI for the actual native/reference checks that exist, developer commands and contribution guidance, a consistent version/build identifier, release checks and changelog convention. The tag-only Pages release workflow becomes deployable once a browser artifact exists; 0.1.0 should not claim a working browser build prematurely. Verify repository visibility and GitHub Pages settings separately; creating files does not change GitHub settings. Release preparation and publication status are recorded in [RELEASING.md](RELEASING.md); repository files alone do not establish a published release.

1. Import the supplied original source with its SHA-256, source provenance, GPL license and attribution. Keep upstream source separately identifiable and maintain a documented patch list.
2. Audit third-party notices and required ROM assets before distribution.
3. Preserve a pinned native reference build; retain the newer fork as an adaptation reference, not the authority for fidelity.
4. Create the 21-game capability matrix: ROMs, inputs, players, DIP switches, orientation, audio, baseline status, desktop/mobile status and known defects.
5. Capture Pong coin/start, paddle movement, rally, scoring, sound, reset and restart behavior. Add seeded, timestamped input replay through a validation adapter without assuming the original is already deterministic.
6. Establish standard build/dev/test commands, CI, version labels, changelog and one-bug-per-report format, following SMBC's release conventions.

Exit: source provenance and distribution requirements recorded; native Pong reference includes real controls and captured audio, not just an attract-screen image; repository can be built from documented prerequisites.

### 0.2.0 — Engine boundary and first browser/phone proof

The reviewed [Pong browser preview](https://jelloshooter848.github.io/NoCPU/)
is live with a C++/Wasm core, TypeScript frontend, notices and matching source.
The clean automated matrix passes 57 cases with three expected simultaneous
touch skips; ten selected checks against the public site also pass. See
[0.2.0_TASKS.md](0.2.0_TASKS.md) for individual tasks and
[0.2.0_VALIDATION.md](0.2.0_VALIDATION.md) for deployment identity and automation
limits. Actual Android Chrome and iPhone Safari gameplay, speaker audio and
sustained performance remain pending. The final tag is blocked until those
physical-device gates are satisfied for the full deployed runtime.

1. Extract create/destroy/reset/input/advance/video/audio/ROM interfaces individually, preserving the event scheduler and integer timing.
2. Remove Qt, native window creation, device audio, host filesystem assumptions and blocking wall-clock waits from the browser core. Keep simulation time separate from browser presentation time. Picosecond counters stay in C++/Wasm; do not pass them through imprecise JavaScript Number values.
3. Build a native headless reference runner and Emscripten WebAssembly target using the same adapted core. Characterize event-boundary overshoot before changing stepping behavior.
4. Implement frame output for Canvas/WebGL and PCM delivery for Web Audio; compare the adapted native output with the original and Wasm output with the adapted native reference.
5. Run Pong on desktop Chrome/Firefox/Safari and physical Android Chrome/iPhone Safari. Include coin/start, independent touch paddles, collision sound and reset.
6. Measure simulation throughput, memory, frame pacing, audio stability and input response. Choose and record actual target phone models and minimum supported browser versions.

Exit: Pong is genuinely playable with sound on desktop and both phone platforms; original/adapted-native/Wasm comparisons have documented results; baseline phone performance is viable. This is the first decision gate before broad game support.

### 0.3 — A usable NoCPU app

1. Build library → game information → Play → pause/settings → return-to-library flow, with clear ROM and controls status.
2. Add responsive portrait/landscape layouts, safe-area spacing, usable touch targets and fullscreen where the browser supports it, with a normal viewport fallback.
3. Add keyboard and gamepad remapping and per-game controls help. Touch layouts cover absolute/relative paddles, wheel/throttle, aiming, direction/action buttons and multiple player slots.
4. Implement pointer capture, independent simultaneous touches and release-on-cancel/blur behavior. Do not allow page scrolling to consume gameplay gestures.
5. Unlock audio from the player's first gesture; handle backgrounding, lock/unlock and interruptions. Pause on visibility loss instead of simulating a backlog on return.
6. Persist preferences and optional ROM files using versioned browser storage. Handle unavailable storage, browser eviction and re-import without losing access to the app.
7. Include original developer credit, project/source links, version, help and useful errors.

Exit: a new player can open the site and play Pong on a phone without keyboard access or unexplained settings. Resizing, orientation changes and audio interruption recover cleanly.

### 0.4–0.7 — Full DICE library and compatibility

Add the remaining games in batches based on the capability matrix, not assumed ROM requirements. Start with simpler controls/ROM-free titles; then cover ROM-backed games, driving/aiming controls and multiplayer families. Pong Doubles, Space Race, Stunt Cycle, Breakout and Indy 4 are useful candidates for exercising different paths, subject to the asset/control audit.

For each title:

- Identify and validate required ROMs using legitimately available test fixtures.
- Verify coin/start, every control axis/button and player slot, DIP switches, attract mode, gameplay, scoring/end state, pause, reset and repeated game switching.
- Compare video geometry/overlays/orientation, circuit behavior, and implemented sound events/PCM against the native reference using controlled scenarios. Record inherited absent audio separately from port regressions.
- Validate keyboard/gamepad controls and a usable mobile touch layout.
- Record performance and memory on the target devices; address sustained slowdowns and audio underruns without silently altering emulation timing.
- Add reproducible reports for baseline defects and separate them from port regressions.

Exit: every original title has an explicit desktop/mobile/ROM/fidelity result. Building all 21 into a binary is not equivalent to validating all 21. No title is silently dropped from the 1.0 goal if it is difficult.

### 0.8 — Performance and reliability

1. Profile the heaviest games and long sessions on actual target phones; run representative demanding titles for at least 30 minutes.
2. Test repeated load/reset/destroy, game switching and restored settings for leaks and stale shared state.
3. Exercise high-refresh displays, slow devices, missing gamepads, multi-touch interruption, tab suspension and audio interruption.
4. Keep native simulation speed and stable playback of implemented sound as the release requirements; display frame rates follow the game's actual timing. Never hide slowdown by labelling presentation FPS as emulation speed.
5. Optimize measured bottlenecks with native/Wasm replay comparisons. Prefer a worker to keep the UI responsive, but prove the cost of transfers and audio buffering. Establish a single-threaded Wasm baseline before considering pthreads/SharedArrayBuffer; do not assume GitHub Pages can supply cross-origin-isolation headers.

Exit: no unresolved freezes, stuck controls, lifecycle leaks or sustained required-game slowdowns on the declared device floor. Performance limits are explicit and do not silently excuse broken required titles.

### 0.9 / 1.0 release candidates — Fidelity and public testing

1. Freeze feature scope and complete the 21-game matrix with audited fixtures and reference comparisons.
2. Run browser automation for loading, menus, game lifecycle, ROM errors, settings and input cancellation; test native/Wasm replay behavior and audio output. Physical phones remain required for touch, sound, thermal and orientation checks.
3. Publish versioned prereleases through the tag-based release workflow. Reports include game, build, device/browser, settings/DIPs, input method, ROM hashes where relevant, steps, expected/actual behavior and evidence.
4. Separate open upstream defects, port regressions, optional limitations and untested behavior. Fix port regressions; document any deliberate original-bug corrections and verify they do not alter unrelated games.
5. Verify production Pages asset paths and Wasm loading, source availability, license/attribution notices, matching build/download versions and rollback to a previous release.

Exit: no unresolved critical blockers in the 1.0 matrix; independent players complete representative sessions on desktop, Android and iPhone; all remaining limitations are explicit and consistent with the scope.

### 1.0 — Faithful DICE, easy to play

Release all 21 original games through a tested browser/mobile interface. Publish reproducible build instructions, required source and notices, compatibility matrix, changelog and known baseline limitations. ROM-dependent titles remain clearly identified and playable with validated user-supplied files. The public release is a tagged, tested build with a visible version and matching release artifact.

## Proposed architecture

- Original-derived C++ simulation core → Emscripten Wasm, with a small versioned interface.
- Browser simulation worker where measurements support it; no requirement for shared memory in the initial architecture.
- Frame renderer and buffered circuit-generated PCM audio, preserving behavior while replacing native device coupling.
- TypeScript/Vite frontend with a per-game control schema shared by keyboard, gamepads, touch UI and help.
- Versioned settings/local ROM storage and a static GitHub Pages build.
- Native reference/replay tooling, browser smoke automation and documented real-device checks.

Do not rewrite the circuit emulator in TypeScript to imitate its output. The original source is available and both native builds already work; preserve that investment and verify the new platform boundary.

## Next concrete work package

The 0.1.0 repository foundation, upstream attribution/patch policy, 21-game matrix, native reference tooling and build/release scaffolding have completed review. The active implementation milestone is 0.2.0: a minimal Pong-only browser app that reaches physical Android/iPhone testing before the complete arcade UI. It adds a playable Pages URL with verified coin/start, two paddles, ball/scoring, circuit sound and reset. Complete its implementation, independent reviews and device qualification before expanding to the 0.3 library interface.

## After 1.0 — preservation and expansion

Keep the original 21-game fidelity suite as a regression gate for every expansion. New titles and enhanced modes must not change faithful play silently. The following priorities are research directions, not promised versions or dates.

### First expansion investigations

Assess **Tank, Gran Trak 10, Death Race and Qwak!** first. Choose the first implementation by complete documentation, validated assets, feasible controls and measured simulation performance. Popularity alone is not enough to schedule a faithful circuit implementation.

| Candidate | Value to NoCPU | Main research or implementation gate |
| --- | --- | --- |
| Tank / Tank II | Recognizable two-player tank combat | Tank PROM, complete circuit/audio validation, dual-track controls; verify Tank II separately |
| Gran Trak 10 / Gran Trak 20 | Historically important single- and two-player racing | Track PROM, wheel/pedal/shifter mapping, collision and timer behavior |
| Death Race | Memorable driving game and preservation flagship | Exidy schematics, graphics PROMs, reference gameplay and sound |
| Qwak! — Atari, 1974 | Duck shooting adds a light-gun control style | Gun/CRT timing, target PROM and a documented touch-aiming adaptation |

MAME has partial netlists for Tank and Gran Trak 10, which may help research. They are not complete working implementations. Potential circuit reuse between related titles must be established from schematics rather than assumed.

### Broader game backlog

| Candidate | Why investigate | Main gate |
| --- | --- | --- |
| Speed Race — Taito, 1974 | Scrolling racing beyond the existing library | Complete circuit documentation, video timing and steering |
| Destruction Derby — Exidy | Competitive driving; possible relationship to Death Race | Compare actual circuit revisions and validate distinct rules |
| Le Mans — Atari | Expands the discrete racing lineage | Graphics PROMs, race rules and driving controls |
| Fonz / Moto-Cross — Sega | Motorcycle racing beyond Stunt Cycle's jump challenge | Board variants, circuit documentation and throttle/steering behavior |
| Gunman — Taito | Additional shooting-game variety | Gun timing, cabinet references and ROM validation |
| Missile-X — Taito | Another underrepresented shooting game | Original gameplay/controls, schematics and assets |
| Wheels II — Midway | Discrete racing preservation opportunity | Circuit completeness and steering references |
| Bombs Away / Cobra Gunship — Meadows | Less familiar preservation targets | Sufficient gameplay evidence and schematics |
| T.T. Block / Zun Zun Block — Taito | Paddle-game extensions using existing port experience | Distinctive rules and verified circuit relationships |

### Stretch targets

- **Monaco GP / Pro Monaco GP:** ambitious later CPU-less racing with a colorful display. Multiple boards, many graphics PROMs, sound circuitry and an external LED score display increase the scope. Verify the Pro variant separately.
- **Indy 800:** eight-player racing and a potential relationship to existing Indy 4. Requires measured simulation performance, accurate colored output and practical multiplayer presentation; eight players sharing a phone is not a requirement.
- **Computer Space:** a strong thematic flagship. Investigate original schematics, analog behavior, reference footage and existing independent simulations before estimating work.

### Documentation-first watchlist

These leads need more evidence before implementation priority is assigned:

- **Touch-Me — Atari's 1974 arcade machine:** four-button memory play could suit phones well. The Atari TTL catalog lists no ROM requirement; distinguish the later handheld hardware.
- **Western Gun — Taito's original 1975 game:** two-player cowboy duel, distinct from Midway's CPU-based Gun Fight adaptation.
- **Heavyweight Champ — Sega's original 1976 game:** early boxing with physical cabinet controls that need careful browser adaptation.
- **Pursuit, World Cup and Goal IV — Atari/Kee:** additional no-ROM candidates identified in the hardware catalog.
- **Ball Park / T.V. Flipper — Midway:** baseball and pinball diversify the genres. T.V. Flipper's ROM requirement remains unresolved in the inspected catalog.
- **Magnavox Odyssey — 1972:** possible later CPU-less home-hardware collection. Analog/discrete circuits fit the theme, but overlays, physical props and player-enforced rules broaden the product substantially.

### Evidence and acceptance gate for new games

MAME source inspected at commit `a025aba9df9d417ddff6cf6c501db1059507d642` marks the registered Atari, Exidy, Taito, Sega, Meadows and Midway candidates above as not working and without sound, including Monaco GP. Watchlist/catalog-only titles and separately named variants do not all have registered entries. This is source inspection, not a runtime test or proof that no standalone emulator, FPGA implementation, recreation or console adaptation exists. Check broader emulation coverage before making public preservation claims.

Before scheduling any title:

1. Establish that its original hardware is genuinely CPU-less; a discrete sound board in a CPU-based game does not qualify.
2. Collect schematic revisions, board photos, manuals and reference gameplay/audio.
3. Identify required PROMs, validate exact checksums and establish lawful testing access. Source-code licensing does not grant ROM redistribution rights.
4. Identify missing chip/analog models and estimate work from a representative running circuit.
5. Define faithful browser controls and document any physical-control adaptation, especially light guns, steering and multiplayer.
6. Validate performance on the declared mobile device floor and add native/Wasm regression scenarios before release.

Full candidate notes and pinned source links are in [POST_1_0_GAMES.md](POST_1_0_GAMES.md).

### Other post-1.0 improvements

Consider installable/offline PWA support, controller presets, circuit visualization, educational explanations and debugging tools. Save states/rewind require proven complete engine serialization. Optional enhancement modes remain clearly separated from faithful play.

Reconstructing sound circuits absent from DICE 0.9 is a post-1.0 accuracy investigation. Assess the eight games without active output hookups individually, collecting schematics and cabinet audio references before modeling and comparing new sound behavior. Keep these improvements documented against the faithful DICE baseline; existing source connections and supplied ROMs do not prove the missing circuitry is complete.

Investigate the supplied candidate Steeplechase bugle ROM (`003774.8c`, CRC32 `F3785F4A`) as a historical accuracy improvement. Current DICE does not load it; owning candidate bytes does not prove the missing audio circuitry has been modeled correctly.

A separate **NoCPU Originals** collection could contain newly designed, playable discrete-circuit netlists with published schematics and an optional signal inspector. Label these as originals rather than historical recreations.

## Scheduling

Use milestone gates rather than fixed dates until the Pong Wasm/phone proof measures the two largest unknowns: extracting a faithful video/audio boundary and sustaining circuit simulation on mobile hardware. Estimate subsequent batches from actual per-game work and device results. Phone/ROM access can block validation and must be recorded early, rather than discovered at release time.

## Known barriers and verified ROM testing status

The supplied archive contains an empty roms directory. Active RomDesc declarations occur in ten games: Anti-Aircraft, Attack, Clean Sweep, Crash ’N Score, Indy 4, Jet Fighter, Shark Jaws, Steeplechase, Stunt Cycle and Wipe Out. The other eleven games have no such declarations in their source: Pong, Pong Doubles, Rebound, Gotcha, Space Race, TV Basketball, Breakout, Quadrapong, Crossfire, Pin Pong and Hi-Way. This is a source inventory, not eleven complete runtime passes. Confirm dependencies through each game's actual loading/playing scenario.

Original ROM loading expects a per-game ZIP under roms and searches its members by expected CRC32 (including alternative CRCs for Attack), then a filename fallback that warns about a mismatch. Browser importing should recognize the actual DICE-compatible bytes and produce a clear compatibility result; an arbitrary similarly named ROM set is not sufficient. Sizes and access ranges need auditing rather than inventing a file-size manifest from names alone.

Steeplechase also has a commented-out bugle ROM declaration labelled “ROM DUMP MISSING.” It is an original limitation, not an active file requirement that importing the two horse-video ROMs resolves. NoCPU 1.0 should document faithful DICE parity; reconstructing historically missing hardware behavior would be a later accuracy improvement.

All ten supplied ROM sets have now passed the DICE compatibility checksum checks and basic loading/render checks in both native builds. Testing fixtures are available through the private `jelloshooter848/NoCPU-Roms` repository; read access was verified in this session. These checks do not establish complete gameplay, controls, sound or historical fidelity. Future cloud environments must verify private-repository access rather than assume it persists.

Keep fixture payloads in the private testing repository and ignored local directories, never in the public NoCPU repository, release artifacts, logs or deployed browser assets. Document fixture retrieval and checksum validation without embedding credentials. CI jobs that cannot access fixtures must report ROM-dependent validation as skipped or blocked, not passed; restrict credential-bearing fixture jobs to trusted contexts.

Distribution permissions remain unverified. Private test access resolves the immediate asset-availability barrier for the original ten ROM-dependent games, but does not make them eligible for public bundling or one-click play. Use player-supplied files unless permission is established. Freely redistributable synthetic fixtures can test the loader but cannot establish faithful gameplay. Additional post-1.0 games require their own asset and rights audit.

Other material barriers: unknown phone simulation throughput; desktop OpenGL/Qt/SDL coupling; faithful circuit PCM extraction and browser audio buffering; lifecycle/shared mutable state; per-game analog and multiplayer touch mapping; native reference nondeterminism; original defects and the fork's observed rendering/logging differences; third-party license notices; production Wasm hosting and worker constraints. These are investigated in the staged milestones rather than assumed resolved by successful native builds.

Inherited audio gaps are a known baseline limitation: eight titles have no active mono-output hookup, while thirteen have source hookups whose audible behavior still needs per-game testing. Preserve this distinction in public compatibility labels and release notes.
