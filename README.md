# NoCPU

**Play it in your browser: [jelloshooter848.github.io/NoCPU](https://jelloshooter848.github.io/NoCPU/)** · [Releases](https://github.com/jelloshooter848/NoCPU/releases) · [Changelog](CHANGELOG.md)

NoCPU is a continuation of **DICE**, the Discrete Integrated Circuit Emulator, by the DICE Team. It preserves arcade games built from discrete logic rather than a game-program CPU. The goal is accurate play of all 21 games in DICE 0.9 in **desktop browsers**, using keyboard and mouse with a minimal interface: a game picker, the original game raster, controls help and user-supplied ROM loading.

**Restarted desktop-first line, from version 0.1.0.** See the [roadmap](docs/ROADMAP.md). Mobile/touch play, phone device qualification and iPhone Home Screen support are deferred until after desktop accuracy. Versions up to 0.6.0 belong to the legacy line, preserved at tag `legacy-0.6.0` with its records under [docs/legacy/](docs/legacy/README.md).

The C++/Wasm core compiles thirteen original DICE 0.9 circuits. All thirteen are playable: **Pong, Pong Doubles, Rebound, Gotcha, Space Race, TV Basketball, Breakout, Quadrapong, Crossfire, Pin Pong and Hi-Way** (ROM-free; Pin Pong and Hi-Way inherit DICE's missing audio) and **Stunt Cycle and Indy 4** (player-supplied ROMs; both inherit DICE's missing audio). Hi-Way is the heaviest circuit so far and can run below full speed while driving on slower computers ([PERFORMANCE.md](docs/PERFORMANCE.md) has the measured speeds). The other eight titles remain unported and are still part of the 1.0 scope; [docs/PORT_GAME.md](docs/PORT_GAME.md) describes how a game is ported. Every compiled game passes the original/native/Wasm comparison against original DICE ([ACCEPTANCE.md](docs/ACCEPTANCE.md)), and each release publishes a desktop acceptance record from its own browser tests. The [GitHub Releases](https://github.com/jelloshooter848/NoCPU/releases) page lists each published build with its notes, and the Pages site serves the latest final release (see the [changelog](CHANGELOG.md)).

## Playing

The app opens on a Home screen drawn as a circuit schematic; Play lists the thirteen playable games and, under Coming soon, the other eight. The original game picture fills the window above a single action bar with coin, start and **Pause · Esc**. How to play shows each game's current controls.

- **Keyboard (defaults):** W/S and Up/Down move the two Pong paddles (and the Space Race rockets), Enter inserts a coin, 1 starts a game where the circuit has a Start switch (2 starts two players in Breakout and Stunt Cycle), Space opens the menu, Escape pauses or goes back, R resets and M mutes. Pong Doubles adds T/G and I/K for players three and four; Rebound moves its paddles with A/D and Left/Right; Quadrapong uses W/S and Up/Down for the side paddles and J/L and V/B for the top and bottom; Gotcha steers the cross with WASD and the square with the arrow keys; Crossfire moves the guns with W/S and Up/Down and fires with D and Left; TV Basketball moves its four players with W/S, Up/Down, I/K and T/G; Pin Pong raises its left flipper with Z or Left and its right flipper with / or Right, and 1 starts the game and serves each ball; Hi-Way turns its steering wheel with Left/Right or A/D, accelerates with Up or W and starts on the coin; Breakout moves its paddle with Left/Right and serves with S; Stunt Cycle opens and closes the throttle with W/S; Indy 4 steers and uses gas/brake with W/A/S/D, the arrow keys, I/J/K/L and Numpad 8/4/5/6, and takes coins on 1-4 and the dollar bill on 5.
- **Mouse:** in Pong, Pong Doubles, Rebound, Quadrapong, TV Basketball and Breakout, moving the mouse over the game sets a paddle across its full original range. In Hi-Way the mouse position left or right of the game's centre turns the steering wheel that way and the held left button accelerates. In Pin Pong the held left and right buttons raise the left and right flippers. In Breakout the held left button is Serve; in Stunt Cycle the held left button opens the throttle from idle (left edge) to full (right edge). Space Race, Gotcha, Crossfire and Indy 4 use the keyboard or a gamepad. Settings → Controls chooses which player the mouse controls, or turns it off, for each game.
- **Browsers:** a desktop Chrome or Edge 95, Firefox 114 or Safari 15.2, or newer. The game runs
  in a module worker and its WebAssembly uses exception handling; an older browser shows
  "This browser cannot run …".
- Keys and gamepad assignments can be changed per game in Settings, which also holds sound, the game's DIP and potentiometer settings and local ROM loading. About shows the build string (`vX.Y.Z` for releases, `vX.Y.Z-dev.<commit>` otherwise), the DICE credit, the license notices and the source download.

## Start here

- [Roadmap](docs/ROADMAP.md) and [coding-agent rules](AGENTS.md)
- [Build and validation instructions](docs/TESTING.md)
- [Game compatibility and validation matrix](docs/GAME_COMPATIBILITY.md)
- [ROM requirements and private test fixtures](docs/ROMS.md)
- [Architecture and platform boundaries](docs/ARCHITECTURE.md)
- [Source provenance](docs/PROVENANCE.md) and [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [bug reports](bug-reports/README.md), and [releasing](docs/RELEASING.md)
- Legacy line records (0.1.0–0.6.0): [changelog](docs/legacy/CHANGELOG.md), task contracts, validation ledgers and device-qualification packets in [docs/legacy/](docs/legacy/README.md)

## Browser development

Install the prerequisites in [TESTING.md](docs/TESTING.md), then run:

```sh
./tools/install-web-toolchain.sh
npm run build
npm run preview -- --host 127.0.0.1
```

Open `http://127.0.0.1:4173/NoCPU/` and use the same controls as the released app on the Pages site.

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

Earlier native checks found compatible CRCs and basic loading/rendering for ten supplied ROM sets in both the original DICE build and the newer fork. That evidence does not establish complete gameplay, audio or historical accuracy for those games. Current results and untested behavior belong in the [compatibility matrix](docs/GAME_COMPATIBILITY.md).

DICE also leaves sound circuitry unfinished in several games: eight have no active mono-output hookup. The 1.0 goal preserves implemented DICE sound and documents those inherited gaps; reconstructing missing historical sound is later accuracy work.

## Repository layout

| Path | Purpose |
| --- | --- |
| `upstream/dice-0.9/` | Original DICE source, kept independently identifiable and checked against an inventory |
| `core/` | ABI 5 interface to the thirteen compiled circuits (games from 0.2.0 on registered in `core/games/`), validated ROM handoff and documented adaptations of the original engine |
| `web/` | Desktop browser frontend: game picker, keyboard/mouse controls, Canvas rendering and Web Audio delivery |
| `tools/` | Source/game/ROM audits, native and core builds, reference capture, original/native/Wasm comparison, packaging and release checks |
| `tests/` | Audited metadata, replay scenarios, regression suites and desktop browser tests |
| `docs/` | Architecture, provenance, compatibility, testing, releases, and roadmap |
| `bug-reports/` | One reproducible report per problem |
| `build/` | Ignored local binaries and generated evidence |

## Credit and license

DICE is copyright © 2008–2014 DICE Team and licensed under GPL-3.0-or-later. Component-specific terms remain applicable: historical nall/Phoenix licensing evidence supports GPL version 3, so the combined source distribution conservatively uses GPL version 3 rather than assuming every component permits later versions. Read [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PROVENANCE.md](docs/PROVENANCE.md) for retained notices. The [browser distribution assessment](docs/BROWSER_DISTRIBUTION.md) separately records the components linked into the browser JS/Wasm build and its matching-source delivery gate.

[DICE on SourceForge](https://sourceforge.net/projects/dice/) supplies the historical source. [DirtBagXon/DICE](https://github.com/DirtBagXon/DICE) is an adaptation reference. [Super Mario Bros. Crossover REMIX](https://github.com/jelloshooter848/SMBC) informs the repository, release, controls, and bug-report conventions. NoCPU preserves DICE's circuit simulator rather than copying SMBC's game engine or license.
