# Releasing NoCPU

`VERSION` identifies the current source foundation: **0.1.0**. Preparing the repository and a local archive does not create a Git tag, GitHub release, or browser deployment.

## Before publishing

Run from the repository root with Python 3.10 or later, GNU Make, and Docker:

```sh
make test
make native
make pong
```

Inspect `build/reference/report.json` and the native reference evidence. Public checks use ROM-free Pong and metadata; they do not fetch private fixtures or establish fidelity for all 21 games. Branch/PR CI uploads the reference report, evidence JSON, CSV traces, PPM frames, WAV samples, and adapter diff. It also retains toolchain metadata: exact package versions, base-image reference, local image ID, binary hash, toolchain checks, and signed APT release metadata. Generated source copies, object files, and executable builds stay local. Native binary distribution requires a separate dependency/license review.

Review `tests/license-audit.json` and `THIRD_PARTY_NOTICES.md`. A release requires `release_ready: true` and an empty `blockers` list, supported by the documented license evidence. Updating the boolean alone does not resolve missing notices or distribution questions. Source changes under `upstream/dice-0.9/` are prohibited; changes belong in maintained adapters or patches.

Confirm that `VERSION` and the corresponding `CHANGELOG.md` entry describe the release. Replace the entry's `prepared locally` status with the reviewed release date and update any preparation-only wording before tagging; release packaging rejects the preparation heading. Check for ROMs, private fixture credentials, generated builds, and unrelated files; `tools/check.py` rejects known prohibited paths and file types but cannot identify arbitrary secret text. Keep private fixture repositories outside this checkout.

## Local source archives

```sh
make source-candidate
make source
```

`source-candidate` creates `build/release/nocpu-0.1.0-candidate-source.tar.gz` for local review, including any license blockers in `RELEASE-MANIFEST.json`. It is not suitable for publication while blockers remain. `source` requires the release license gate and produces `nocpu-0.1.0-source.tar.gz` plus its `.sha256` file.

Both commands rerun repository integrity checks. Archives include curated project source, preserved upstream files, documentation, tools, game metadata, license notices, and a per-file SHA-256 manifest. They exclude Git internals, generated build/capture outputs, private ROM directories, ROM archives, and executable build payloads. Sorting, ownership, timestamps, and gzip metadata are normalized so unchanged source and executable modes produce identical bytes. `RELEASE-NOTES.md` beside the archive contains the exact current-version changelog section, which the publication workflow uses as its release description.

## GitHub publication

The maintainer reviews the tested changes and explicitly authorizes publication before creating and pushing `v0.1.0` on the reviewed commit. The tag must equal `v` plus `VERSION` exactly. The `Verified source release` workflow reruns repository/tooling checks, builds the native reference, captures Pong, verifies the license gate, and packages source before its separate publication job obtains `contents: write`.

Only pushed version tags trigger release publication. Pull requests and branch CI have read-only repository permissions and no private ROM access. External GitHub actions are pinned to verified upstream commit hashes; update these pins deliberately and review their changes. The publication step creates the release; it does not merge changes or alter repository settings. If a tag fails checks, correct the underlying problem before preparing the next reviewed release rather than treating a failed run as a published version.

## Browser and mobile delivery

0.1.0 has no browser artifact or Pages deployment workflow. At the browser milestone, add a real tested browser build and tag-controlled Pages deployment only after browser validation passes. Never publish a placeholder arcade that implies games are playable.
