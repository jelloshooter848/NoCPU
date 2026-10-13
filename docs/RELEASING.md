# Releases and versions

NoCPU releases often. Each release has a tag (`v0.2.0`), a section in
[CHANGELOG.md](../CHANGELOG.md), a GitHub Release with those notes and the
browser build, its license notices and the matching corresponding-source
archive, and the same version in the app's About panel. A bug report therefore
always names a build that anyone can find again.

The restarted desktop-first line starts at **0.1.0**, the reset baseline (see
the [roadmap](ROADMAP.md)); `VERSION` holds the current version. The legacy line's release process (versions up to 0.6.0, tag
`legacy-0.6.0`, with Pages "previews" and a physical-device gate) is kept as
history in [legacy/RELEASING_0.6.md](legacy/RELEASING_0.6.md); it does not
govern current releases.

## Branches

- `main` holds released code only. It changes through **release pull
  requests**, merged with a merge commit (no squash or rebase), so every
  release tag sits on a merge commit on `main`.
- One long-lived working branch, currently `restart/desktop-first`, collects
  all work between releases. Commits land on it directly; per-task branches are
  not needed.
- Agents working in parallel may use short-lived `wip/<version>-<topic>`
  branches (for example `wip/0.2.0-rebound`) and merge them back into the
  working branch. They never target `main`.

CI (`.github/workflows/ci.yml`) verifies pushes to `main` and to the working
branch, and every pull request.

## Version numbers

[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with these pre-1.0 rules:

| Change | Bump | Example |
| --- | --- | --- |
| A roadmap milestone: its game batch (or milestone goal) passes the original/native/Wasm comparisons | minor: `0.MINOR.0` | 0.1.0 → 0.2.0 |
| Fixes, tooling, docs, build and release changes, and UI changes within the minimal desktop interface | patch: `0.x.PATCH` | 0.2.0 → 0.2.1 |
| A build for testers before a release | pre-release: `-rc.N` | 0.3.0-rc.1 |
| All 21 DICE 0.9 games pass their accuracy comparisons on desktop | `1.0.0` | |

Milestones in the [roadmap](ROADMAP.md) are minor releases; patch releases ship
in between whenever there is something worth publishing. Release candidates
replace the legacy "preview" stage. After 1.0.0 the usual SemVer rules apply.

## The version string

[`VERSION`](../VERSION) is the single source of the version. `tools/check.py`
requires the version fields in `package.json`, `package-lock.json`,
`tests/release-readiness.json` and `tests/browser-license-audit.json` to match
it, so a version bump updates those fields in the same commit.

The About panel will show the build string (the Phase 2 desktop UI, a 0.1.x
patch release, implements it; 0.1.0 still shows `buildId`):

- a build packaged from a release tag shows **`vX.Y.Z`** (or `vX.Y.Z-rc.N`);
- any other build (local development, CI, the working branch) shows
  **`vX.Y.Z-dev.<sha>`**, the last version set in `VERSION` plus the short
  commit, so the build is newer than that release;
- a build without its manifest (for example the Vite dev server) shows
  `vX.Y.Z-dev`.

The packaged site's `BUILD-MANIFEST.json` already carries what this needs:
`version`, `stage` (`release` for a tag build; untagged builds currently say
`preview`), `tag`, and `buildId`/`source_commit` (the full commit SHA) with
`source_tree_state`. Today the app shows `buildId` and a preview label.

Bug reports quote this string (see [bug-reports/README.md](../bug-reports/README.md)).

## The changelog

[CHANGELOG.md](../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

- Every change that players notice adds a line under `## [Unreleased]`, in the
  right group: `### Added`, `### Changed`, `### Fixed` or `### Removed`
  (create the group if it is missing). Write for players: what changed in the
  games or the app, not which files. Internal-only changes (tests, tooling,
  refactors) need no entry. The pull request template has a checkbox for this.
- `## [Unreleased]` always exists, even when empty, and is the first version
  section.
- A release renames the Unreleased entries to `## [X.Y.Z] - YYYY-MM-DD` (the
  release date) and starts a new empty `## [Unreleased]` above it.
- The link footers at the bottom compare tags: `[Unreleased]` compares the
  newest tag with `HEAD`, and each version compares with the previous tag.
  Until the first restarted tag exists, `[Unreleased]` compares with
  `legacy-0.6.0`.

`tools/release_check.py` checks these rules. `python3 tools/check.py` and CI
run its base check: `VERSION` is a SemVer version (a pre-release such as
`0.2.0-rc.1` is allowed; `+build` metadata is not) and CHANGELOG.md has `## [Unreleased]`. With
`--tag vX.Y.Z` it also checks that the tag is `v` + `VERSION` and that a dated,
non-empty `## [X.Y.Z] - YYYY-MM-DD` section exists; `--notes` prints that
section's body, which becomes the GitHub Release notes:

```sh
python3 tools/release_check.py
python3 tools/release_check.py --tag v0.2.0 --notes
```

## Release checklist

Before opening a release pull request, confirm and record in it:

- [ ] The original/native/Wasm comparison passed for every game the release
      affects (and, for a milestone, every game in its batch), with the desktop
      browser checks from [TESTING.md](TESTING.md) naming the actual browser and
      version. ROM-dependent games without authorized fixtures are blocked, not
      passed.
- [ ] No ROM bytes, private fixtures or secrets are in any artifact: the source
      archive, the browser zip and tarball, the Pages site and the workflow
      evidence.
- [ ] The browser build carries the applicable license notices and a matching
      corresponding-source archive with its checksum. The browser license audit
      ([browser-license-audit.json](../tests/browser-license-audit.json)) was
      reviewed against this release's actual output; bumping its version field
      states that review.
- [ ] A release candidate (`-rc.N`) is never described as accuracy-qualified
      unless its comparisons passed. Its notes state what was and was not
      compared.
- [ ] `python3 tools/check.py`, `make test` and
      `python3 tools/release_check.py --tag vX.Y.Z` pass.

## Releasing a version

1. On the working branch, make one **release commit** that only changes the
   version and the changelog:
   - `VERSION` set to `X.Y.Z`, with the mirrored version fields listed under
     [The version string](#the-version-string);
   - in CHANGELOG.md, `## [Unreleased]` becomes `## [X.Y.Z] - YYYY-MM-DD`, a new
     empty `## [Unreleased]` goes above it, and the footers are updated:
     ```
     [Unreleased]: https://github.com/jelloshooter848/NoCPU/compare/vX.Y.Z...HEAD
     [X.Y.Z]: https://github.com/jelloshooter848/NoCPU/compare/vPREVIOUS...vX.Y.Z
     ```
     (For the first restarted release, compare with `legacy-0.6.0`.)
   - `python3 tools/release_check.py --tag vX.Y.Z` and `python3 tools/check.py`
     pass locally.
2. Open a pull request **Release vX.Y.Z** from the working branch into `main`.
   It carries the work since the last release; its last commit is the release
   commit above, touching only the version fields and CHANGELOG.md. Fill in
   the release checklist. Wait for CI.
3. Merge it with a **merge commit**. Nothing is published or deployed yet.
4. **The owner tags the merge commit.** Agents cannot push tags from their
   sessions, so the owner does this step, either on the command line:
   ```sh
   git checkout main && git pull
   git tag -a vX.Y.Z -m "NoCPU vX.Y.Z"
   git push origin vX.Y.Z
   ```
   or in the GitHub UI (Releases → Draft a new release → new tag `vX.Y.Z` on
   `main`); the workflow then fills in the release notes and assets.
5. The **Release** workflow (`.github/workflows/release.yml`) runs on the tag:
   - it checks that the ref is a tag, resolves the tag's commit, and runs
     `tools/release_check.py --tag` (tag = `v` + `VERSION`, dated changelog
     section), keeping the notes;
   - it runs the full browser verification from
     `.github/workflows/verify-browser.yml` on the tag's commit: repository
     checks and tests, native reference build, captures and the
     original/native/Wasm comparisons, the browser builds and tests, then
     `tools/package-web.py --tag`, which packages the site with notices and the
     corresponding-source archive and refuses to package when the license
     audits are not ready;
   - it refuses to publish if the browser zip, the source archive or their
     checksums are missing, if checksums do not match, or if the packaged site
     lacks its license notices or matching source archive;
   - it creates (or updates) the GitHub Release `vX.Y.Z` with the changelog
     section as notes and attaches `nocpu-X.Y.Z-web.zip`,
     `nocpu-X.Y.Z-web.tar.gz`, `nocpu-X.Y.Z-source.tar.gz` and their `.sha256`
     files; any tag containing `-` is marked as a **pre-release**;
   - for a final release (a tag without `-`), it deploys the exact verified site
     to GitHub Pages. A pre-release tag skips the deploy, so the live site keeps
     the latest final release. Pages is deployed only
     from release tags, never from a branch push or a pull request.

**Never move a tag.** Tags are public and permanent: a tag that has been pushed
is never deleted, re-pointed or reused. If a release run fails because of the
code or its checks, leave the tag as it is, fix the problem on the working
branch and release the next patch version (`vX.Y.Z+1`), noting in its
changelog section that `vX.Y.Z` was not published. If it failed for reasons
outside the code (a Pages outage, permissions), rerun it as described below.

The zip is the exact site that was deployed, built for the `/NoCPU/` path:
serve it from a folder of that name (for example
`mkdir NoCPU && unzip nocpu-0.2.0-web.zip -d NoCPU && python3 -m http.server`,
then open `http://localhost:8000/NoCPU/`).

### One-time setup

- **Settings → Pages → Source: GitHub Actions.**
- The `github-pages` environment usually allows deployments only from the
  default branch. In **Settings → Environments → github-pages → Deployment
  branches and tags**, add a tag rule `v*`, or tag runs stop at the deploy job.

## Redeploying, retrying or rolling back

Actions → **Release** → **Run workflow**, leave "Use workflow from" on `main`,
and enter an existing tag (for example `v0.2.0`). The workflow checks out that
tag, runs the same checks, verification and packaging, creates or updates its
GitHub Release, and deploys it. Use this to:

- roll the live site back to an earlier final release (run it with the older
  tag; a pre-release tag never deploys Pages);
- retry a release whose run failed for reasons outside the code.

With the GitHub CLI: `gh workflow run release.yml -f tag=v0.2.0`.

The workflow definition (and the shared verification it calls) comes from the
branch the run is started from; the checked, built and published code comes
from the tag. The manual run appears only once this workflow is on `main`.

GitHub Pages labels each deployment with the commit the workflow runs from, and
may ignore a deployment whose label it has already served. After redeploying
an older tag by hand, make sure `main` has moved on before the next release
runs, or redeploy the newest tag by hand afterwards, and check the live site's
build string.

## Release candidates for testers

A release candidate is a normal release with a `-rc.N` suffix:

1. A release commit sets `VERSION` to `X.Y.Z-rc.N` and moves the Unreleased
   entries into `## [X.Y.Z-rc.N] - YYYY-MM-DD`; a **Release vX.Y.Z-rc.N** pull
   request merges it into `main`.
2. The owner tags the merge commit `vX.Y.Z-rc.N`.
3. The workflow marks the GitHub Release as a **pre-release** and attaches the
   same assets, but it does **not** deploy GitHub Pages: the live site keeps the
   latest final release. Testers download `nocpu-X.Y.Z-rc.N-web.zip` from the
   pre-release and serve it locally as described above; it shows
   `vX.Y.Z-rc.N`.

An rc's notes say which comparisons it passed; an rc is never called
accuracy-qualified unless its comparisons passed. When the final version ships,
its `## [X.Y.Z]` section lists everything since the previous final release (the
rc entries plus anything newer), so its notes stand alone; the rc sections stay
below it as history.

## Source archives

```sh
make source-candidate
make source
```

`source-candidate` makes a local review archive (its notes come from
`## [Unreleased]`) and records license blockers in its manifest; it is not
publishable. `source` requires the source-license gate, the exact `v` +
`VERSION` tag argument and a dated changelog section, then writes
`nocpu-X.Y.Z-source.tar.gz` and its checksum. Neither command creates a tag or a
GitHub Release.

Archives contain curated maintained source, unchanged original DICE files,
frontend code, scripts, dependency lockfiles, metadata and notices. They
exclude Git metadata, private fixtures, ROM archives, local evidence and
compiled payloads; nested checkouts, symlinks and prohibited payload paths fail
closed. Sorting, modes, ownership, timestamps and gzip metadata are normalized,
and the manifest records every file's SHA-256. Browser packaging
(`tools/package-web.py`) builds the same archive into the site and checks the
browser notices listed in
[browser-license-audit.json](../tests/browser-license-audit.json); see
[BROWSER_DISTRIBUTION.md](BROWSER_DISTRIBUTION.md) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Public jobs never receive
ROM payloads in their artifacts.

Native executables and toolchain containers are outside this browser
distribution assessment; publishing them needs a separate dependency and
license inventory.

## Release readiness record

[tests/release-readiness.json](../tests/release-readiness.json) states what a
release claims, and `tools/package-web.py --tag` refuses to package unless it
is `release_ready` with no blockers for the current `VERSION`:

- `release_scope` says what the release is, in one or two sentences.
- `desktop_acceptance` is `pending` or `passed`. `passed` names the games, the
  actual desktop browsers and versions, the evidence and the accepted
  `runtime_sha256`, which must equal the packaged runtime digest (a rebuilt or
  changed runtime needs fresh acceptance); `pending` lists none
  and says where the work is scheduled. The 0.1.0 reset baseline ships with
  `pending`: it makes no desktop accuracy claim.
- `physical_device_gate` is always `deferred`. Phone qualification and other
  physical-device checks are post-accuracy work (AGENTS.md) and never gate a
  desktop release. The legacy device gate is history at tag `legacy-0.6.0`.

The packaged `BUILD-MANIFEST.json` carries the record as `release_readiness`.
