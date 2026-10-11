# Changelog

## 0.5.0 — 2026-10-11 (Pages preview)

- Add online iPhone Home Screen installation and game-first standalone usability: manual Safari guidance, stable `/NoCPU/` identity, reproducible icons, safe-area/lifecycle handling and local-storage recovery. Installation does not promise offline play, shared Safari/installed storage or permanent retention.
- Add original DICE Breakout alongside Pong, Pong Doubles and Space Race: four ROM-free playable titles and seventeen remaining ports. Preserve the shared horizontal paddle, held Serve, separate one-/two-player starts, rotated color raster, PCM and original settings.
- Pass independently reviewed original/native/Wasm comparisons across sixteen scenarios and 64 portable behavioral epochs, with legacy ABI 295/295 checks across 45 traces and canonical Breakout ABI 502/502 across 70 traces.
- Publish the exact-main preview after clean CI: 281 browser passes and nine existing annotated CDP skips out of 290. Verify all 104 public files, canonical root and both hash-keyed core URLs, then pass all 20 live cases across five browser profiles. Preserve earlier failed/interrupted/superseded attempts in [0.5.0 validation](docs/0.5.0_VALIDATION.md).
- Physical Safari/installed-iPhone/controller qualification, bonus-threshold award behavior and event overflow remain unexercised; no final hardware-readiness tag is published. All 21 original titles remain the 1.0 scope.

## 0.4.0 — 2026-10-11 (Pages preview)

- Add original DICE Pong Doubles and Space Race alongside Pong: three playable ROM-free titles, with eighteen remaining ports clearly identified.
- Preserve four independent Doubles paddles, its original coin-selected modes, two digital Space Race sticks, distinct Coin/Start, original settings, game-specific help and external touch controls.
- Preserve app preferences/ROM management and title-bound qualification reports; keep original circuit, integer clock and PCM behavior with exact original/native/Wasm comparisons.
- Pass independently reviewed clean exact-main CI: 214 browser passes and six existing annotated CDP skips out of 220; ABI checks pass 295/295 across 45 traces.
- Publish the exact-main preview and verify all 97 public files plus canonical root, both separately labelled hash-keyed core response proofs, and all 15 selected live browser cases. Preserve prior failed/cancelled attempts in [0.4.0 validation](docs/0.4.0_VALIDATION.md).
- Physical phone/controller qualification and final tags remain pending; the existing Pong phone baseline does not qualify the new titles automatically.

## 0.3.1 — 2026-10-11 (Pages preview)

- Add an opt-in phone qualification collector with Start, Finish and Export, preserving normal Pong play and explicit measurement limits.
- Add an identified-device test packet and separate real-controller report; physical results and a final tag remain pending.
- Pass independently reviewed clean CI: 167 browser passes and 3 documented CDP skips out of 170 single attempts, including all 35 new qualification cases.
- Publish the exact-main preview and verify all 93 public files, both hash-keyed core responses and 50 selected live browser cases. See [0.3.1 validation](docs/0.3.1_VALIDATION.md) for deployed identities and preserved failed-run history.

## 0.3.0 — 2026-10-11 (Pages preview)

- Show the build's version number unobtrusively on the title screen, beginning with this release.
- Add a source-derived 21-title library and information panels with origin-aware Back, while Pong remains the only playable browser game.
- Add keyboard/gamepad remapping, player joystick settings and shared help; retain the original court and external touch tracks.
- Add versioned sound/control preferences and local ZIP validation with optional device retention, removal, backup and corruption/eviction recovery. Compatible ROMs do not make pending browser ports playable.
- Add optional fullscreen with an ordinary-browser fallback and retain matching-source delivery for the pinned ZIP helper.
- Pass independent source, product, visual and assertion reviews and the full 135-case clean CI matrix: 132 passes plus 3 documented CDP touch skips, with no failures, retries or flaky results.
- Publish and independently verify the exact-main preview: 92 live passes plus 3 documented CDP skips out of 95 cases, and all 90 public HTTPS files equal the reviewed artifact.

Deployed source/runtime identity and the accepted qualification runs are recorded
in [0.3.0 validation](docs/0.3.0_VALIDATION.md). This publication is a preview;
physical-device/controller hardware qualification and a final tag remain pending.

## 0.2.1 — 2026-10-10 (Pages preview)

- Move phone paddle control to visible independent P1/P2 tracks outside the court, below it in portrait and beside it in landscape, so fingers do not hide play.
- Retain the original Pong raster, circuit, worker clock, PCM and game menus; court touches no longer move paddles.
- Pass the full 75-case clean CI matrix with 72 browser passes and 3 documented CDP touch skips; fresh original/native/Wasm comparison and independent visual, lifecycle, source and artifact reviews pass.
- Publish and independently verify the replacement preview: 32 live browser passes plus 3 documented CDP skips out of 35, no failures/flaky results/retries, and all 84 public HTTPS files equal the reviewed artifact.
- Record exact deployed source/runtime identity in [0.2.1 tasks](docs/0.2.1_TASKS.md) and [validation](docs/0.2.1_VALIDATION.md). Physical Android/iPhone qualification and a final tag remain pending; this publication is a preview.

## 0.2.0 — 2026-10-10 (Pages preview)

Pong browser preview with the preserved DICE circuit compiled to WebAssembly:

- Add keyboard and independent simultaneous touch paddles, coin insertion, pause/resume, reset, mute, volume, and audio recovery.
- Replace the initial page-style presentation with a viewport game shell: title, contextual coin/menu controls, pause/settings/help/About panels and original-court touch regions. Independent reviews and the expanded 70-case clean CI matrix pass; the replacement is deployed and independently verified.
- Preserve integer simulation time, circuit scheduling, video and generated PCM, with original/native/Wasm replay comparisons and reset checks.
- Provide browser engine tests and a source-matched Pages package with component notices, runtime hashes, and corresponding-source downloads.
- Deploy the reviewed [Pong preview](https://jelloshooter848.github.io/NoCPU/) through GitHub Actions, with matching source and notices verified against the public files.
- Pass the expanded clean 70-case CI matrix with 67 passes and three expected simultaneous-touch skips, followed by 25 selected checks against the live site across five automated browser profiles.

Physical-phone gameplay, audible speaker output, and sustained performance
remain pending. Preview builds are identified separately from a final release;
no final `v0.2.0` tag or release has been published. Actual Android Chrome and
iPhone Safari evidence must match the deployed runtime before final release
publication. See [0.2.0 validation](docs/0.2.0_VALIDATION.md) for deployment
identity, results and automation limits.

## 0.1.0 — 2026-10-10 (release candidate, UTC)

Initial preservation and development foundation for NoCPU:

- Preserve the original DICE 0.9 source with a complete SHA-256 manifest and provenance.
- Inventory all 21 original games, controls, configuration, ROM requirements, and validation limits.
- Provide an isolated native reference build and a seeded, timestamped Pong scenario covering observed paddles, two contacts, scoring, coin restart, circuit recreation, and captured PCM.
- Establish repository documentation, contributor guidance, issue templates, CI, and source-release checks.
- Keep proprietary ROM fixtures outside the public repository and public CI.

The reviewed source candidate is ready for release qualification. This version does not provide a browser or mobile game build. No release tag or published GitHub release has been created.
