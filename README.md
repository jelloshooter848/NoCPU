# NoCPU

NoCPU is a continuation of **DICE**, the Discrete Integrated Circuit Emulator, by the DICE Team. It preserves arcade games built from discrete logic rather than a game-program CPU. The goal is a faithful, easy-to-use browser and phone experience for all 21 games in DICE 0.9.

**0.1.0 establishes the repository and a measurable native reference. Browser and mobile play begin with the 0.2 milestone.** There is no NoCPU browser build or public play URL yet. See the [roadmap](docs/ROADMAP.md) for milestone gates and [changelog](CHANGELOG.md) for release status.

## Start here

- [0.1.0 qualification and review results](docs/0.1.0_VALIDATION.md)
- [Build and validation instructions](docs/TESTING.md), [0.1.0 task breakdown](docs/0.1.0_TASKS.md), and [validation report](docs/0.1.0_VALIDATION.md)
- [Game compatibility and validation matrix](docs/GAME_COMPATIBILITY.md)
- [ROM requirements and private test fixtures](docs/ROMS.md)
- [Architecture and platform boundaries](docs/ARCHITECTURE.md)
- [Source provenance](docs/PROVENANCE.md) and [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [bug reports](bug-reports/README.md), and [releasing](docs/RELEASING.md)

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
| `core/` | Boundaries for future NoCPU engine adapters and documented port changes |
| `web/` | Boundaries for the future browser frontend; no browser runtime in 0.1.0 |
| `tools/` | Source/game/ROM audits, native builds, reference capture, and release checks |
| `tests/` | Audited metadata and controlled reference scenarios |
| `docs/` | Architecture, provenance, compatibility, testing, releases, and roadmap |
| `bug-reports/` | One reproducible report per problem |
| `build/` | Ignored local binaries and generated evidence |

## Credit and license

DICE is copyright © 2008–2014 DICE Team and licensed under GPL-3.0-or-later. Component-specific terms remain applicable: the historical nall/Phoenix licensing evidence supports GPL version 3, so the combined 0.1.0 distribution conservatively uses GPL version 3 rather than assuming every component permits later versions. Read [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PROVENANCE.md](docs/PROVENANCE.md) for the retained notices and release audit.

[DICE on SourceForge](https://sourceforge.net/projects/dice/) supplies the historical source. [DirtBagXon/DICE](https://github.com/DirtBagXon/DICE) is an adaptation reference. [Super Mario Bros. Crossover REMIX](https://github.com/jelloshooter848/SMBC) informs the repository, release, controls, and bug-report conventions. NoCPU preserves DICE's circuit simulator rather than copying SMBC's game engine or license.
