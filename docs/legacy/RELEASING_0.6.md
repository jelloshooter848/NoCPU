# Releasing NoCPU (legacy line, up to 0.6.0)

> Historical record. This was the release process of the legacy line (versions
> up to 0.6.0, tag `legacy-0.6.0`), including its Pages "preview" stage and its
> physical-device final-tag gate. It does not govern the restarted
> desktop-first line; see the current [RELEASING.md](../RELEASING.md). Version
> numbers below refer to legacy releases.

Legacy status (historical): the public site was last published by the legacy
line from exact source `5d57abe35081451cc0c5d7b48b118a531a0cc930`
([run 38176567783](https://github.com/jelloshooter848/NoCPU/actions/runs/38176567783),
2026-10-11 23:06:42 UTC; the 0.5.0 preview). The
[0.4.0 preview](0.4.0_VALIDATION.md), [0.3.1 preview](0.3.1_VALIDATION.md),
[0.3.0 preview](0.3.0_VALIDATION.md) and earlier deployments are
historical. No final legacy browser release tag through 0.5.0 was published.

## Build and qualification

Follow [TESTING.md](../TESTING.md) to install the native reference, Emscripten and
browser prerequisites. Before packaging, run the repository tests, original
Pong and the canonical sixteen Doubles/Space Race/Breakout scenario captures, portable native/Wasm replay
comparisons and production browser
checks, including `npm run test:foundations` after the frozen dependency
install and `npm run test:qualification` after the core build. Inspect their
reports; passing metadata or synthetic ZIP checks do not establish
gameplay for other unported DICE titles.

Source packaging requires [license-audit.json](../../tests/license-audit.json) to
be ready with an empty blocker list. Browser packaging independently requires
[browser-license-audit.json](../../tests/browser-license-audit.json), hash-checked
notices and matching corresponding source. Read
[BROWSER_DISTRIBUTION.md](../BROWSER_DISTRIBUTION.md) and
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) for component evidence.
Changing a readiness boolean alone does not resolve missing evidence.

Public jobs use ROM-free Pong, Pong Doubles, Space Race and Breakout with
fixture-free metadata. They receive no
private ROM credentials. Never package ROM bytes, private fixtures, secrets,
generated source copies or unrelated build output. Known-path/type checks are
useful guards; they cannot identify arbitrary secret text.

The 0.6.0 new-game actual ROM/reference/gameplay/browser gates require trusted
local fixtures. Public CI must retain complete four-game gates, run meaningful
new loader/error/lifecycle checks and explicitly skip/block fixture-dependent
coverage when files are absent. Any independently accepted local attestation
must bind exact source/scenario/report/media identities and be labeled as such;
source continuity checks are not an actual private-fixture CI execution.
Review measured job/storage/artifact capacity before expanding the batch. A
timeout or artifact budget cannot silently remove an accepted assertion.

## Pages preview for phone testing

GitHub Pages **Source: GitHub Actions** is the correct repository setting.
The Pages workflow builds a tested static artifact and deploys it using the
official Pages actions. It does not change this setting itself.

A preview supplies the playable URL needed for physical Android/iPhone tests.
It may retain pending phone qualification, while all repository, core,
automated-browser and license checks must pass first. Preview packaging is:

```sh
npm run build:web
python3 tools/package-web.py --preview
```

`build/pages/` contains the runtime, visible preview identification,
`BUILD-MANIFEST.json`, complete applicable notices and
`source/nocpu-0.6.0-source.tar.gz` with its checksum. The archive's manifest
identifies `preview-corresponding-source`; the browser manifest has stage
`preview` and no final tag. The app links directly to the available matching
source archive. Preserve relative notice paths so their nested links work.

The runtime reads its build identifier and preview/final label from the
packaged manifest. Promoting reviewed bytes changes metadata without embedding
a new Git commit or release-stage constant into the tested JavaScript.

The manifest's `runtime_sha256` covers **all original production runtime
files**, including HTML, CSS, workers, JavaScript, Wasm and icons. Added source,
notice and provenance metadata are described separately, avoiding a hash of a
manifest that contains its own hash. A Wasm-only checksum is insufficient for
touch/audio/layout qualification.

Check the deployed project URL and every referenced asset at `/NoCPU/`, not
only a localhost root URL. Confirm Wasm MIME/loading, worker paths, source
archive/checksum availability, notices and preview identification. Record the
successful deployment URL and workflow revision in the validation report.
Preserve earlier previews' source, runtime and deployment identifiers as
historical evidence. Outcome-documentation commits do not change the exact
source or matching archive served by the verified 0.5.0 deployment.

## Physical-device and final-release gates

[release-readiness.json](../../tests/release-readiness.json) records actual physical
Android Chrome and iPhone Safari evidence for the complete runtime digest.
Record the model, OS/browser versions, test date, tested build, required play,
touch, speaker audio and lifecycle checks, plus the retained Pong baseline's
at least ten minutes of sustained performance. The [physical-device packet](DEVICE_QUALIFICATION.md)
provides the existing Pong procedure after reviewed publication: include both external tracks, their visible
full-range feedback, court separation and portrait/landscape reachability.
The earlier iPhone obstruction report and subsequent two successful 0.2.1
games are useful partial feedback; they do not supply the missing identified
device/performance fields or qualify later changed runtime bytes. Automated
mobile viewports cannot complete them.

Final browser packaging rejects pending/failed device gates, stale runtime
digests, missing checks and incomplete performance evidence. A tested runtime
must be the runtime that is published. Rebuilding with different visible
labels, runtime constants, CSS, compiler output or controls changes its digest
and requires corresponding qualification; do not attach preview evidence to
changed final bytes.

The maintained eight phone-check keys and 600-active-second/0.95 requirements
retain their Pong baseline meaning. [The three-game device
packet](DEVICE_QUALIFICATION_0.4.md) records additional title/options-specific
manual and performance scope without introducing a mandatory ten-minute gate
for each new title. A Pong baseline pass cannot qualify four Doubles paddles,
Space Race's digital controls, Breakout or broad-game support. The current
[four-game/Home Screen draft](DEVICE_QUALIFICATION_0.5.md) records separate
Safari/installed-mode and additional title/options-specific procedures; it does
not report a physical pass or add a ten-minute threshold for each title.
Actual new-title coverage
remains pending and requires independent review before any final promotion.

Complete the agreed checks and independent repair/re-review loops before
tagging. Pending physical-device results remain pending until actual testing
supplies the required evidence.

Once gates are satisfied and final publication is authorized, finalize the
0.5.0 changelog date/status, commit the reviewed change, create the exact
`v0.5.0` tag and push it. This qualification preview does not authorize that
final tag. Final packaging
requires a clean checkout of that tag and version equality:

```sh
python3 tools/package-web.py --tag v0.5.0
```

`.github/workflows/verify-browser.yml` provides shared verification for pull
requests, preview dispatch and release tags. An explicit dispatch of
`.github/workflows/ci.yml` with `publish_preview: true` deploys its passing
preview; normal pushes and pull requests verify without publication. The
release workflow reruns qualification before publishing source/browser
downloads and deploying the qualified Pages artifact. Publication
jobs receive only their required write permissions. Pull-request verification
uses read-only repository permissions; fork pull requests do not publish or
receive private credentials. External actions are pinned to reviewed commits.
Verify the resulting GitHub release assets, final Pages deployment and visible
build/source identifiers before reporting publication.

## Source archives

```sh
make source-candidate
make source
```

`source-candidate` makes a local review archive and records license blockers in
its manifest. It is not publishable while blockers remain. `source` requires
the source-license gate and exact current tag/version argument, then writes
`nocpu-0.5.0-source.tar.gz` and its checksum; this local command alone does not
create a Git tag or GitHub release.

Archives contain curated maintained source, unchanged original DICE files,
frontend code, scripts, dependency lockfiles, metadata and notices. They exclude
Git metadata, private fixtures, ROM archives, local evidence and compiled
payloads. Nested checkouts, symlinks and prohibited payload paths/types fail
closed. Sorting, modes, ownership, timestamps and gzip metadata are normalized;
the manifest records every included file's SHA-256. Release notes are derived
from the exact current-version changelog section.

Native executables and toolchain containers remain outside this browser
distribution assessment. Their publication needs a separate linked dependency
and license inventory.
