# Bug reports

Use one Markdown file per problem. Copy [TEMPLATE.md](TEMPLATE.md) and name the file `YYYY-MM-DD-<game-or-area>-<short-slug>.md`, for example `2026-10-09-pong-reset-keeps-score.md`. Use the actual report date.

Give exact steps, expected and actual behavior, and frequency. Include the NoCPU version and commit, game ID, toolchain or device/browser, input method, and relevant DIP/settings values. For ROM-dependent games, report compatible filenames/checksums or validation output, never ROM payloads or private credentials.

Distinguish an original DICE defect from a NoCPU regression when evidence permits. If the original behavior has not been tested, say so. Include small, relevant screenshots or output excerpts when useful; keep generated captures and unrelated logs out of a public report.

Submit the file on your own branch in a pull request, or use the repository's issue template. Reference related reports rather than overwriting another tester's account. Reviewers add a reproduction result and resolution to the report. A report is closed with a concrete fix/build or explanation, not simply because compilation passed.

The native/reference foundation is the current test target. Browser/mobile report fields become applicable once those builds exist. See [testing](../docs/TESTING.md) for supported commands and known coverage limits.
