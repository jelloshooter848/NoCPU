## Summary

<!-- What changes for players or developers, and why. For fidelity changes, name the native reference and the games affected. -->

## Test plan

<!-- Commands run, games and scenarios checked, desktop browsers and versions. State skipped or blocked checks and why (for example, missing private ROM fixtures). -->

- [ ] `python3 tools/check.py` (and `make test`)
- [ ] Original/native/Wasm comparison passed for each affected game (or no game behavior changed)
- [ ] CHANGELOG.md updated under `## [Unreleased]` (or not user-facing)
- [ ] `upstream/dice-0.9/` unchanged; no ROM payloads, private fixtures or credentials included
