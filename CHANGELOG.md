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

Work towards 0.1.0, the desktop-first reset. No build of the restarted line has been published yet.

### Added

- Numbered releases: each release has a `vX.Y.Z` tag, a section in this changelog and a GitHub
  Release with the playable browser build, its license notices and the matching source code.
  Builds for testers are release candidates such as `0.1.0-rc.1`.

### Changed

- NoCPU restarts desktop-first. The goal for 1.0 is all 21 DICE 0.9 games playing accurately in a
  desktop browser with keyboard and mouse, and version numbers start again at 0.1.0.
- The six games carried over from the legacy line (Pong, Pong Doubles, Space Race, Breakout, Stunt
  Cycle and Indy 4) are checked again against the original DICE before 0.1.0 ships, instead of
  relying on the legacy results.
- Phone and touch play, phone testing and iPhone Home Screen install are set aside until every game
  plays accurately on desktop. The last legacy build (tag `legacy-0.6.0`) keeps them.

### Removed

- Hand-published "preview" builds. Testers get release candidates instead, which are listed on the
  GitHub Releases page like every other release.

[Unreleased]: https://github.com/jelloshooter848/NoCPU/compare/legacy-0.6.0...HEAD
