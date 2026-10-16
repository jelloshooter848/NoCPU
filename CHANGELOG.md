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

### Added

- Rebound (Atari, 1974) is playable: the original circuit, verified against original DICE, with
  its winning-score and coinage settings, two horizontal paddles on A/D and the Left/Right arrow
  keys, the mouse or a gamepad, and the circuit's own sound.

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

[Unreleased]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jelloshooter848/NoCPU/compare/legacy-0.6.0...v0.1.0
