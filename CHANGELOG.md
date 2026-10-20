# Changelog

All notable changes to NoCPU are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the pre-1.0 rules in
[docs/RELEASING.md](docs/RELEASING.md). Every change that players notice adds a line under
`## [Unreleased]`.

Versions restart at 0.1.0 for the desktop-first line. The legacy line (0.1.0 through 0.6.0,
preserved at tag `legacy-0.6.0`) has its own history in
[docs/legacy/CHANGELOG.md](docs/legacy/CHANGELOG.md); its version numbers do not refer to the
releases below.

## [Unreleased]

## [0.5.0] - 2026-10-20

### Added

- Anti-Aircraft (Atari, 1975) is playable with your own ROM file: two players fire missiles from
  launchers at the bottom of the screen at passing airplanes or UFOs. Each launcher has three
  buttons that aim it high, to the middle or low and fire (Q/A/Z and O/L/. by default). It is
  verified against original DICE, and like DICE it has no sound.
- Shark Jaws (Atari, 1975) is playable with your own ROM files: steer the diver with the arrow keys
  or WASD to catch fish while the shark hunts you. It is verified against original DICE and, like
  DICE, has no sound. It runs below full speed on slower computers (about 0.8x on the test machine).
- Jet Fighter (Atari, 1975) is playable with your own ROM files: two jets dogfight across a gray sky,
  or one player flies the white jet against the circuit's own pilot. Turn with A/D, speed up and
  slow down with W/S and fire with F (the black jet: the arrow keys and /). It is verified against
  original DICE and, like DICE, has no sound. It runs below full speed on slower computers (about
  0.8x on the test machine).
- Attack (Exidy, 1977) is playable with your own ROM files, in either accepted dump set: one player
  sails a ship and shoots at a plane, the other flies the plane and sinks the ship. The ship moves
  with A/D, turns its gun with W/S and fires with F; the plane turns with the left and right arrow
  keys, speeds up with the up arrow and fires with /. The coin starts the game. It is verified
  against original DICE, with DICE's sound.

## [0.4.0] - 2026-10-19

### Added

- Pin Pong has sound, as reconstructed from Atari's sound board: each hit rings and fades out at
  one of four pitches, set by the kind of object hit last (slingshots, 100-point objects, the cross
  centre, a moving flipper). DICE has no sound for Pin Pong; NoCPU reconstructs it from Atari's
  schematic (TM-007 Rev G) and the parts' data sheets, not from a recording, and the game's picture
  and play still match original DICE exactly. A new Pin Pong setting adjusts the sound board's tone
  trimmer; Atari's factory setting is unknown, so its range and default are NoCPU's choice.
- Pin Pong's free-game setting: a score of 10,000 to 90,000 points can earn a free game, using the
  jumper options on Atari's schematic (DICE leaves this unfinished). The default, no free game, is
  DICE's behaviour.

### Changed

- Games run faster in the browser. A game that cannot keep up no longer idles between steps, and the
  emulator core itself is faster, with the circuits unchanged (still verified against original DICE).
  In Chromium the core runs from about 1.25 times as fast (Hi-Way) to about 2.3 times as fast (Pong,
  Indy 4, Crossfire). On the 4-core test computer, Pin Pong, TV Basketball, Gotcha, Breakout and
  Stunt Cycle now run at full speed in Chromium and Firefox; Pin Pong ran at 70% before. Hi-Way,
  measured at the start of play, went from 46% to 97% of full speed in Chromium and from 47% to 89%
  in Firefox, but can still fall below full speed there while driving: most of its time is DICE's
  own circuit scheduler.
- A browser that cannot run the game's WebAssembly now says so ("This browser cannot run …")
  instead of suggesting a connection problem.

## [0.3.0] - 2026-10-18

### Added

- TV Basketball (Midway, 1974) is playable: the original circuit, verified against original DICE,
  with its play-time setting. One coin is a two-player game (each control moves both players of a
  team), two coins a four-player game; the four players are on W/S, the Up/Down arrow keys, I/K and
  T/G, the mouse or four gamepads, with the circuit's own sound. A coin always clears the scores
  and restarts the clock; a coin during a game also turns it into a two-player game.
- Hi-Way (Atari, 1975) is playable: the original circuit, verified against original DICE, with its
  extended-play, traffic and play-time settings. The coin starts the game; the original steering
  wheel turns with the Left/Right arrow keys or A/D, a gamepad stick, or the mouse (its position
  left or right of the display's centre sets how fast the wheel turns), and the accelerator is the
  Up arrow, W, a gamepad button or the left mouse button. DICE has no sound for Hi-Way.
- Pin Pong (Atari, 1974) is playable: the original circuit, verified against original DICE, with
  its coinage, free-ball and balls-per-game settings, shown upright in the original portrait
  picture. The left flipper is Z or the Left arrow key, the right flipper / or the Right arrow key,
  the left and right mouse buttons or the gamepad shoulder buttons; Start begins the game and serves
  each ball. DICE has no sound for Pin Pong.
- Pin Pong and Hi-Way can run below full speed on slower computers, most in Firefox. On the 4-vCPU
  test machine, Playwright's Chromium build ran Pin Pong at about 0.7 and Hi-Way at about half of
  full speed, its WebKit build at about 0.55 and 0.4, and its Firefox build at about a sixth of
  full speed; TV Basketball ran at full speed in Chromium, about 0.9 in WebKit and 0.3 in Firefox.
  Other browsers were not measured.

### Changed

- When a game cannot load or stops unexpectedly, the error panel now adds a "Details" line naming
  the underlying browser error, so a report can say what went wrong. A game that stops after it
  has loaded now says "stopped unexpectedly" instead of asking you to check your connection.

## [0.2.2] - 2026-10-18

### Fixed

- Starting a game could crash the tab in Playwright's WebKit (WPE) build, and may affect other
  Skia-based WebKitGTK/WPE browsers. The game display now uses a CPU-backed canvas, which avoids
  the WebKit bug; play and visuals are unchanged in Chromium, Firefox and WebKit.

## [0.2.1] - 2026-10-17

### Changed

- The README links the playable site at the top and lists the controls of all ten games; the
  guides for porting, testing, ROMs, compatibility and the browser distribution describe the
  current ten-game build.
- The browser license record is re-assessed for the ten-game build. The games and the app are
  unchanged from 0.2.0.

## [0.2.0] - 2026-10-17

### Added

- Rebound (Atari, 1974) is playable: the original circuit, verified against original DICE, with
  its winning-score and coinage settings, two horizontal paddles on A/D and the Left/Right arrow
  keys, the mouse or a gamepad, and the circuit's own sound.
- Quadrapong (Atari, 1974) is playable: the original four-player circuit, verified against original
  DICE, with its coinage setting (one credit buys a two-player game, two a four-player game), the
  left and right paddles on W/S and the Up/Down arrow keys, the top and bottom paddles on J/L and
  V/B, the mouse for one player or four gamepads, and the circuit's own sound.
- Crossfire (Atari, 1975) is playable: the original circuit, verified against original DICE, with
  its play-time setting, the coin that starts the game, the left gun on W/S with D to fire and the
  right gun on the Up/Down arrow keys with Left to fire, two gamepads, and the circuit's own sound.
- Gotcha (Atari, 1973) is playable: the original circuit, verified against original DICE, with its
  play-time setting, the cross on W/A/S/D and the square on the arrow keys, two gamepads, and the
  circuit's own sound, including the beeping tone that beeps faster as the cross and the square
  come closer together from left to right. One coin buys two games; extra coins do not add more.
  Gotcha is the heaviest game so far: on the 4-vCPU test machine, Playwright's Chromium and WebKit
  builds ran it at full speed and Playwright's Firefox build at about a third of full speed; other
  browsers were not measured.

## [0.1.7] - 2026-10-15

### Changed

- Faster verification: the long original/native/Wasm comparison is no longer repeated for
  changes that touch only the interface, documentation or version number once the same game
  core has been compared, including release updates. Releases still run it in full. No gameplay
  changes.
- More reliable verification: the browser checks now judge games in simulated circuit time
  rather than by how fast the test machine runs, and report real-time speed instead of failing
  on it. No gameplay changes.

## [0.1.6] - 2026-10-15

### Changed

- On phones, Home and Play are simpler, in the black arcade style: a big blocky NO CPU logo, one
  line of text and the menu marked by a glowing paddle on Home; the six playable games and a Play
  button on Play, with the games still to come folded into one line you can tap to expand.
  Desktop keeps the schematic-sheet Home.

## [0.1.5] - 2026-10-15

### Changed

- New Home screen, drawn as a circuit schematic sheet: the NoCPU logo, a small logic-gate
  drawing that sketches itself in the first time you open the app in a session (any key or click
  skips it, and it never plays when your system asks for reduced motion), and the menu Play,
  Settings, How to play and About.
- New Play screen, styled as a black arcade court: the six playable games are listed with a
  glowing paddle marking the selected one, which Up and Down change; the right side shows its
  maker, year, players, ROM status and a Play button, and the games not ported yet are listed
  under Coming soon. It still opens on the game you last played; Enter plays the chosen game,
  Game info opens its info page and Escape goes back Home. The Library is now called Play
  throughout.
- Home and Play also fit phone-sized screens (layout only; touch controls for playing games are
  still to come).

## [0.1.4] - 2026-10-14

### Changed

- The title screen no longer has a Play Pong button. The Library leads the menu and opens on the
  game you last played (remembered once it has loaded).

## [0.1.3] - 2026-10-14

### Added

- Each release now publishes a desktop acceptance record (`nocpu-X.Y.Z-acceptance.json`) showing
  that the six playable games passed their browser checks in Chromium and Firefox on exactly that
  build. No gameplay changes.

## [0.1.2] - 2026-10-14

### Changed

- Faster verification: reference recordings of the original are reused when nothing they depend
  on changed, browser engines run in parallel, and the ROM-backed games are now tested in Chromium
  and Firefox on every run. No gameplay changes.

## [0.1.1] - 2026-10-13

The first published release of the restarted desktop-first line; `v0.1.0` was tagged but not
published.

### Added

- Mouse controls: move the mouse over the game to set a paddle across its full range (Pong, Pong
  Doubles, Breakout); hold the left button for Breakout's Serve and for Stunt Cycle's throttle.
  Settings chooses which player the mouse controls, or turns it off.
- The About panel shows the build string (`vX.Y.Z` for releases, `vX.Y.Z-dev.<commit>` otherwise)
  with the DICE credit, license notices and source download.

### Changed

- A plain desktop layout: the original game picture fills the window above one action bar (coin,
  start, Pause · Esc); menus are simpler. Your saved settings carry over.

### Fixed

- Indy 4: one raster row could show the wrong scanline while a car crossed it; the renderer now
  matches the original DICE (Mesa llvmpipe) rasterization in all compared scenarios.

### Removed

- Touch controls, phone layouts, the phone qualification recorder and Home Screen (PWA) install
  support, deferred to the post-1.0 mobile phase.

## [0.1.0] - 2026-10-13

Tagged but not published: the release workflow did not complete, so no build was deployed. 0.1.1
is the first published release.

The first release of the restarted desktop-first line, a baseline: it keeps the legacy browser app
while the desktop interface and the renewed accuracy checks follow in 0.1.x updates.

### Added

- Numbered releases: each release has a `vX.Y.Z` tag, a section in this changelog and a GitHub
  Release with the playable browser build, its license notices and the matching source code.
  Builds for testers are release candidates such as `0.1.0-rc.1`.

### Changed

- NoCPU restarts desktop-first. The goal for 1.0 is all 21 DICE 0.9 games playing accurately in a
  desktop browser with keyboard and mouse, and version numbers start again at 0.1.0.
- The app is still the legacy browser app. Its phone and touch play, phone testing and iPhone Home
  Screen install are no longer maintained: they are set aside until every game plays accurately on
  desktop, and a 0.1.x update replaces them with a minimal desktop interface. The last legacy build
  (tag `legacy-0.6.0`) keeps them.
- The six games carried over from the legacy line (Pong, Pong Doubles, Space Race, Breakout, Stunt
  Cycle and Indy 4) are checked again against the original DICE in the 0.1.x updates, instead of
  relying on the legacy results. 0.1.0 makes no new accuracy claim for them.

### Removed

- Hand-published "preview" builds. Testers get release candidates instead, which are listed on the
  GitHub Releases page like every other release.

[Unreleased]: https://github.com/jelloshooter848/NoCPU/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/jelloshooter848/NoCPU/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jelloshooter848/NoCPU/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jelloshooter848/NoCPU/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/jelloshooter848/NoCPU/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/jelloshooter848/NoCPU/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jelloshooter848/NoCPU/compare/legacy-0.6.0...v0.1.0
