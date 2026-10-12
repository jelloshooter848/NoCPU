# Bug reports

Use one Markdown file per problem. Copy [TEMPLATE.md](TEMPLATE.md) to start.

## Naming

`YYYY-MM-DD-<area>-<slug>.md`, using the actual report date, for example
`2026-10-09-pong-reset-keeps-score.md` or `2026-10-12-roms-checksum-rejected.md`.
`<area>` is a game ID (`pong`, `breakout`, `stuntcycle`, …) or a part of the app
or tooling (`picker`, `roms`, `audio`, `settings`, `about`, `core`, `ci`, …).
`<slug>` is a few lowercase words joined by hyphens.

One bug per file. Never edit another tester's report; if you see the same bug,
add your own file and mention the other one.

## What makes a report useful

- **Build.** Quote the build string from the About panel exactly: `v0.2.0` on
  a released build (the live site or a GitHub Release download), or something
  like `v0.2.0-dev.3a09872` on any other build (local development, a branch,
  CI). If you cannot see it, give the commit you tested. Build strings are
  explained in [docs/RELEASING.md](../docs/RELEASING.md#the-version-string).
- **Where.** Game ID, desktop browser and version (or native toolchain), input
  method and bindings, and relevant DIP/potentiometer settings.
- **Steps, expected, actual, how often** (every time / sometimes / once).
- **ROMs.** For ROM-dependent games, report compatible filenames/checksums or
  validation output, never ROM payloads or private credentials.

Distinguish an original DICE defect from a NoCPU regression when evidence
permits. If the original behavior has not been tested, say so. Include small,
relevant screenshots or output excerpts when useful; keep generated captures
and unrelated logs out of a public report.

## Delivery and outcome

Commit the file under `bug-reports/` on your own branch and open a pull
request, or use the repository's issue template. Each report is reviewed and
reproduced; the reviewer adds the reproduction result, and the report ends with
exactly one status line:

- `Status: fixed in <commit>` naming the commit that fixed it, or
- `Status: not a bug — <reason>`.

A report is closed with a concrete fix or explanation, not simply because
compilation passed. See [testing](../docs/TESTING.md) for supported commands
and known coverage limits.
