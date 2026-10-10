# Changelog

## 0.2.0 — prepared locally

Pong browser preview with the preserved DICE circuit compiled to WebAssembly:

- Add keyboard and independent simultaneous touch paddles, coin insertion, pause/resume, reset, mute, volume, and audio recovery.
- Preserve integer simulation time, circuit scheduling, video and generated PCM, with original/native/Wasm replay comparisons and reset checks.
- Provide browser engine tests and a source-matched Pages package with component notices, runtime hashes, and corresponding-source downloads.
- Verify a reviewed preview before explicit GitHub Actions deployment; require matching physical Android Chrome and iPhone Safari evidence before final release publication.

Physical-phone gameplay, audible speaker output, and sustained performance
remain pending. Preview builds are identified separately from a final release;
no final `v0.2.0` tag or release has been published.

## 0.1.0 — 2026-10-10 (release candidate, UTC)

Initial preservation and development foundation for NoCPU:

- Preserve the original DICE 0.9 source with a complete SHA-256 manifest and provenance.
- Inventory all 21 original games, controls, configuration, ROM requirements, and validation limits.
- Provide an isolated native reference build and a seeded, timestamped Pong scenario covering observed paddles, two contacts, scoring, coin restart, circuit recreation, and captured PCM.
- Establish repository documentation, contributor guidance, issue templates, CI, and source-release checks.
- Keep proprietary ROM fixtures outside the public repository and public CI.

The reviewed source candidate is ready for release qualification. This version does not provide a browser or mobile game build. No release tag or published GitHub release has been created.
