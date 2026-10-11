# Releasing NoCPU

`VERSION` is **0.3.1**, the opt-in phone qualification collector built on the
app foundation's game-first library, remapping, preferences and local ROM
management. Its [review/publication status](0.3.1_VALIDATION.md) is separate
from actual-device readiness. Pong remains the only playable browser circuit.
Preparing files, running tests or packaging a preview does not publish a final
release. The verified public site still serves the
[0.3.0 preview](0.3.0_VALIDATION.md), published from exact source
`ee7f78e57278bc318dc52820d1606b3ec3fa2917`. Later documentation-only commits
record its outcome without republishing or relabeling that source archive.
Earlier 0.2.0/0.2.1 deployments remain historical. No final 0.2.0, 0.2.1 or
0.3.0 tag was published. The user authorized app
foundation development and reviewed previews without waiving actual-device
qualification for final tags or the broad-game-support decision gate.

## Build and qualification

Follow [TESTING.md](TESTING.md) to install the native reference, Emscripten and
browser prerequisites. Before packaging, run the repository tests, original
Pong capture, portable native/Wasm replay comparison and production browser
checks, including `npm run test:foundations` after the frozen dependency
install and `npm run test:qualification` after the core build. Inspect their
reports; passing metadata or synthetic ZIP checks do not establish
gameplay for the other twenty DICE titles.

Source packaging requires [license-audit.json](../tests/license-audit.json) to
be ready with an empty blocker list. Browser packaging independently requires
[browser-license-audit.json](../tests/browser-license-audit.json), hash-checked
notices and matching corresponding source. Read
[BROWSER_DISTRIBUTION.md](BROWSER_DISTRIBUTION.md) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for component evidence.
Changing a readiness boolean alone does not resolve missing evidence.

Public jobs use ROM-free Pong and fixture-free metadata. They receive no
private ROM credentials. Never package ROM bytes, private fixtures, secrets,
generated source copies or unrelated build output. Known-path/type checks are
useful guards; they cannot identify arbitrary secret text.

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
`source/nocpu-0.3.1-source.tar.gz` with its checksum. The archive's manifest
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
Until that replacement is verified, retain the earlier preview's source,
runtime and deployment identifiers as historical evidence rather than
relabeling its bytes as 0.3.1.

## Physical-device and final-release gates

[release-readiness.json](../tests/release-readiness.json) records actual physical
Android Chrome and iPhone Safari evidence for the complete runtime digest.
Record the model, OS/browser versions, test date, tested build, required play,
touch, speaker audio and lifecycle checks, plus at least ten minutes of
sustained performance. The [physical-device packet](DEVICE_QUALIFICATION.md)
provides the 0.3.1 procedure after reviewed publication: include both external tracks, their visible
full-range feedback, court separation and portrait/landscape reachability.
The earlier iPhone obstruction report and subsequent two successful 0.2.1
games are useful partial feedback; they do not supply the missing identified
device/performance fields or qualify changed 0.3.1 runtime bytes. Automated
mobile viewports cannot complete them.

Final browser packaging rejects pending/failed device gates, stale runtime
digests, missing checks and incomplete performance evidence. A tested runtime
must be the runtime that is published. Rebuilding with different visible
labels, runtime constants, CSS, compiler output or controls changes its digest
and requires corresponding qualification; do not attach preview evidence to
changed final bytes.

Complete the agreed checks and independent repair/re-review loops before
tagging. Pending physical-device results remain pending until actual testing
supplies the required evidence.

Once gates are satisfied and final publication is authorized, finalize the
0.3.1 changelog date/status, commit the reviewed change, create the exact
`v0.3.1` tag and push it. This qualification preview does not authorize that
final tag. Final packaging
requires a clean checkout of that tag and version equality:

```sh
python3 tools/package-web.py --tag v0.3.1
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
`nocpu-0.3.1-source.tar.gz` and its checksum; this local command alone does not
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
