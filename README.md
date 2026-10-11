# NoCPU

NoCPU is a continuation of **DICE**, the Discrete Integrated Circuit Emulator, by the DICE Team. It preserves arcade games built from discrete logic rather than a game-program CPU. The goal is a faithful, easy-to-use browser and phone experience for all 21 games in DICE 0.9.

Current [0.5.0 development](docs/0.5.0_TASKS.md) adds online iPhone Home
Screen/standalone support and the original Breakout port. The complete original/
portable game batch is independently accepted; current final package/browser
qualification remains pending. Offline play is excluded by default.
The public preview below remains the independently verified 0.4.0 build.

**[Play NoCPU 0.4.0](https://jelloshooter848.github.io/NoCPU/).** The
independently verified Pages preview has three playable original-derived,
ROM-free games: **Pong, Pong Doubles and Space Race**. The game-first library,
remapping, preferences, optional local ROM management and qualification
recorder are preserved. The other eighteen titles remain explicitly unported;
compatible imported ROMs do not unlock them.

Exact-main CI passes 214 cases with six existing annotated CDP touch skips out
of 220. All 15 selected live cases pass across five browser profiles, and all
97 public files plus the canonical root match the reviewed artifact. Original,
portable native and Wasm scenario comparisons, actual component notices and
matching-source delivery pass independent review. The [0.4.0 validation
report](docs/0.4.0_VALIDATION.md), [roadmap](docs/ROADMAP.md) and
[changelog](CHANGELOG.md) record the deployed identities and preserved failed
attempts. The [0.3.1 qualification-tooling preview](docs/0.3.1_VALIDATION.md)
remains historical evidence.

Open the [qualification page](https://jelloshooter848.github.io/NoCPU/?debug)
and follow the [three-game phone/controller
packet](docs/DEVICE_QUALIFICATION_0.4.md) to record actual-device evidence.
Physical Android Chrome/iPhone Safari and controller qualification remain
pending; no final browser tag or release has been published.

The earlier touch-control preview received a user report of two full iPhone
games, one portrait and one landscape, both playing well with sound that seems
to work well. This [partial 0.2.1 device feedback](docs/0.2.1_VALIDATION.md#partial-actual-iphone-feedback)
does not qualify the current 0.4.0 runtime or complete the physical-device gate.

The frontend fills the viewport with a title screen, library, original game
raster and in-game menus. Choose a title from the library. Pong needs **Insert
coin**; default keys are **W/S** for player 1 and **Up/Down** for player 2.
For Pong Doubles, insert one coin then **Start** for the two outer paddles, or
two separate coins then **Start** for all four independent paddles. Space Race
has separate **Coin/Start** and two Up/Down sticks. Settings and Help show each
game's assignments. Touch tracks and digital controls sit outside the raster,
below it in portrait and beside it in landscape. **Menu** pauses play and
opens resume, reset, settings, help and About. Sound and volume are in Settings;
DICE credit, build identity, licenses and the matching source download are in
About. None of these three games needs a ROM file.

## Start here

- [0.5.0 development contract](docs/0.5.0_TASKS.md) and [current validation stages](docs/0.5.0_VALIDATION.md)
- [0.4.0 first-game-batch contract](docs/0.4.0_TASKS.md) and [qualification status](docs/0.4.0_VALIDATION.md)
- [Three-game physical phone/controller procedure](docs/DEVICE_QUALIFICATION_0.4.md), [report template](docs/DEVICE_REPORT_TEMPLATE.md), and historical [0.3.1 qualification-tooling status](docs/0.3.1_VALIDATION.md)
- [0.2.1 touch-control tasks](docs/0.2.1_TASKS.md) and [qualification status](docs/0.2.1_VALIDATION.md)
- [0.3.0 app-foundation contract](docs/0.3.0_TASKS.md) and [qualification status](docs/0.3.0_VALIDATION.md)
- [0.2.0 task breakdown](docs/0.2.0_TASKS.md) and [validation results](docs/0.2.0_VALIDATION.md)
- [Build and validation instructions](docs/TESTING.md) and [0.1.0 native foundation results](docs/0.1.0_VALIDATION.md)
- [Game compatibility and validation matrix](docs/GAME_COMPATIBILITY.md)
- [ROM requirements and private test fixtures](docs/ROMS.md)
- [Architecture and platform boundaries](docs/ARCHITECTURE.md)
- [Source provenance](docs/PROVENANCE.md) and [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [bug reports](bug-reports/README.md), and [releasing](docs/RELEASING.md)

## Browser development

Install the prerequisites in [TESTING.md](docs/TESTING.md), then run:

```sh
./tools/install-web-toolchain.sh
npm run build
npm run preview -- --host 127.0.0.1
```

Open `http://127.0.0.1:4173/NoCPU/` and use the same controls as the public preview.

## Native foundation

From a checkout, install Python 3.10 or newer and Docker with a running daemon. Bash is needed for the native scripts. Then run:

```sh
python3 tools/check.py
./tools/build-native.sh
./tools/capture-pong.sh
```

The build creates `build/native/dice` from a separate copy of the original source using the `nocpu-dice-qt4:0.1.0` toolchain image. The first build downloads the base image and historical Ubuntu packages. The base image and direct compiler/Qt/SDL versions are pinned; transitive package resolution is not fully hermetic. See [testing](docs/TESTING.md) for requirements, capture results, and what the checks establish.

The original Qt4/SDL 1.2 application requires native display and audio services to play interactively. Its executable is intended for the supplied toolchain environment; it is not a portable browser artifact. The automated [Pong reference scenario](docs/PONG_REFERENCE.md) captures rendered frames and generated PCM without requiring a physical display or sound device.

## Games and ROMs

DICE 0.9 registers Pong, Pong Doubles, Rebound, Gotcha, Space Race, Stunt Cycle, TV Basketball, Breakout, Anti-Aircraft, Attack, Shark Jaws, Quadrapong, Jet Fighter, Crash 'N Score, Crossfire, Pin Pong, Clean Sweep, Wipe Out, Hi-Way, Steeplechase, and Indy 4.

Ten games have active ROM requirements. ROM payloads are not included in this public repository. Use your own compatible files; source-code licensing does not grant permission to distribute game ROMs. The [ROM guide](docs/ROMS.md) describes validation and private fixture handling.

Earlier native checks found compatible CRCs and basic loading/rendering for ten supplied ROM sets in both the original DICE build and the newer fork. That evidence does not establish complete gameplay, audio, historical accuracy, or phone compatibility for those games. Current results and untested behavior belong in the [compatibility matrix](docs/GAME_COMPATIBILITY.md).

DICE also leaves sound circuitry unfinished in several games: eight have no active mono-output hookup. The 1.0 goal preserves implemented DICE sound and documents those inherited gaps; reconstructing missing historical sound is later accuracy work.

## Repository layout

| Path | Purpose |
| --- | --- |
| `upstream/dice-0.9/` | Original DICE source, kept independently identifiable and checked against an inventory |
| `core/` | Headless four-game development interface and documented adaptations of the original engine |
| `web/` | Game-first browser frontend, touch/keyboard/gamepad controls, rendering and audio delivery |
| `tools/` | Source/game/ROM audits, native builds, reference capture, and release checks |
| `tests/` | Audited metadata and controlled reference scenarios |
| `docs/` | Architecture, provenance, compatibility, testing, releases, and roadmap |
| `bug-reports/` | One reproducible report per problem |
| `build/` | Ignored local binaries and generated evidence |

## Credit and license

DICE is copyright © 2008–2014 DICE Team and licensed under GPL-3.0-or-later. Component-specific terms remain applicable: historical nall/Phoenix licensing evidence supports GPL version 3, so the combined source distribution conservatively uses GPL version 3 rather than assuming every component permits later versions. Read [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PROVENANCE.md](docs/PROVENANCE.md) for retained notices. The [browser distribution assessment](docs/BROWSER_DISTRIBUTION.md) separately records the components linked into the Pong JS/Wasm build and its matching-source delivery gate.

[DICE on SourceForge](https://sourceforge.net/projects/dice/) supplies the historical source. [DirtBagXon/DICE](https://github.com/DirtBagXon/DICE) is an adaptation reference. [Super Mario Bros. Crossover REMIX](https://github.com/jelloshooter848/SMBC) informs the repository, release, controls, and bug-report conventions. NoCPU preserves DICE's circuit simulator rather than copying SMBC's game engine or license.
