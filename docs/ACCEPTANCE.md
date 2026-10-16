# Per-game acceptance ledger

The restarted line's original/native/Wasm acceptance record for each compiled
game. A row passes only when every listed stream is byte-equal between the
original DICE 0.9 capture, the portable native runner and the Wasm module, for
the listed scenarios. Legacy-line results ([docs/legacy/](legacy/README.md))
are not carried over. Equality shows the ports reproduce the original for those
bounded replays; it does not establish complete gameplay, physical speaker
output or browser behavior, which are checked separately
([TESTING.md](TESTING.md)). Raw evidence stays under ignored `build/`.

## 0.1.x comparison re-run — 2026-10-13

Base commit `74655c1` (v0.1.0) on branch `wip/0.1.1-comparisons`, with the
ROM-backed replays added there. Seed 848. Original: pinned image
`nocpu-dice-qt4:0.1.0` (`sha256:bfdadad2…`), Xvfb, Mesa llvmpipe, on an x86-64
host with FMA. llvmpipe fuses its viewport multiply-add only on FMA CPUs, and
the capture tools record `host_cpu_fma` and refuse hosts without it. Native: host
GCC build of `build-core.sh native`. Wasm: Emscripten 3.1.74 run in Node 22.22.0.
ROM fixtures: `NoCPU-Roms` commit `2166ace`, audited by `fetch-roms.sh`.
The renderer fixes (`core/platform/portable_video.inc`: the scanline path, then the
rotated/overlay path and the ortho scale after review) were each re-checked
with fresh original captures of every game on branch `wip/0.1.1-indy4-row213`.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Pong | `pong.tsv`: attract, coin start, independent paddles, two paddle contacts, scoring, coin restart, recreate; DIP default (11) | PCM, telemetry, inputs, collisions, frame-time/full-frame RGB hashes, gray observations; native↔Wasm both reset epochs; reset isolation | **PASS** | Winning Score DIP 15 and the end-of-game state are not exercised; the Pong pipeline has a single scenario |
| Pong Doubles | `pongdoubles-default` (DIP 11), `pongdoubles-15` (DIP 15): coin vs Start, four paddles, contacts, scoring, game end, post-end restart | PCM, telemetry, inputs, collisions, events, frame RGB hashes, gray; native↔Wasm and reset epochs | **PASS** | — |
| Space Race | `spacerace-default` (970 kΩ), `-two-credits` (1 coin/2 credits, 470 kΩ), `-max-time` (1470 kΩ), `-coin-only`: Up/Down per rocket, crashes, scoring, play timer, game end | as Pong Doubles | **PASS** | The circuit exposes no attract/hit telemetry signal, so attract mode is covered by stream equality only; the original's Start-without-coin timer quirk is retained as the reference |
| Breakout | ten scenarios: `default`, `three-`/`five-balls-miss-restart`, `two-player-normal`/`-cocktail`, two `coinage-*-start2`, `bonus100-rally`, `pilot`, `alternate`; DIP ball count, cabinet, coinage, bonus thresholds | as Pong Doubles, plus selected full-RGB portrait snapshots; multi-game and Breakout ABI probes | **PASS** | Bonus-credit threshold award is not reached in any scenario |
| Stunt Cycle | `stuntcycle-throttle` (pilot), `stuntcycle-two-player-keys` (DIP 130: 2 misses, 1 coin/2 credits; Start 2, keyboard throttle, player alternation, game end, attract, restart), `stuntcycle-jump-score` (default DIP 76; two cleared jumps and score steps) | decoded RGB frames and snapshots, frame times/geometry, raw PCM, inputs, events, telemetry, hardware signals, audio boundary; native↔Wasm both epochs; reset isolation | **PASS** | Inherits absent DICE audio (PCM is a single constructor zero sample); free-game award not reached |
| Indy 4 | `indy4-pilot` (720 kΩ), `indy4-min-time-end` (220 kΩ, keyboard wheel keys, play timer expiry, restart), `indy4-max-time-keys` (1220 kΩ, dollar bill) | as Stunt Cycle | **PASS** (after the renderer fix on `wip/0.1.1-indy4-row213`) | The first re-run failed `frames.csv`/`frames.rgb` and one snapshot, original↔native only, in the two new scenarios. A pixel center lying exactly on a scanline edge (top-down rows 213 and 218) went to the scanline below, but llvmpipe gives it to the one above. Fixed by matching llvmpipe's fill rule and viewport arithmetic ([bug report](../bug-reports/2026-10-13-indy4-row213-scanline.md)); all six ROM scenarios and the ROM-free games were re-run fresh with the fix. Inherits absent DICE audio |

Commands, from the repository root:

```sh
./tools/build-native.sh && ./tools/build-core.sh all
./tools/capture-pong.sh      # original Pong
./tools/capture-games.sh     # original Pong Doubles, Space Race, Breakout
make core-compare            # Pong comparison, then ./tools/replay-games.sh
NOCPU_ROMS_REPO=<fixtures> ./tools/fetch-roms.sh
python3 tools/compare-rom-games.py   # Stunt Cycle, Indy 4
```

Reports: `build/core/comparison.json` (Pong),
`build/core/game-evidence/<run>/report.json` (16 ROM-free scenarios plus ABI
probes), `build/rom-comparison/<run>/report.json` (ROM-backed).

## 0.2.0 comparison run — 2026-10-16

Commit `aa9a23f` (the registered-game contract, ABI 5, and the Rebound port) on
`restart/desktop-first`, seed 848. Every original captured fresh (no reference
cache): pinned image `nocpu-dice-qt4:0.1.0` (`sha256:bfdadad2…`), Xvfb, Mesa
20.0.8 llvmpipe, x86-64 host with FMA (`host_cpu_fma: true`). Native: GCC 13.3.0
build of `build-core.sh native`. Wasm: Emscripten 3.1.74 (`nocpu.wasm`
`91f53e11…`) run in Node 22.22.0. The ABI 5 core changes shared code, so the
earlier games were re-run in full with it.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Rebound | `rebound-default` (DIP 0: 11 points, 1 coin/1 credit): Start without a credit, coin without Start, each horizontal paddle swept across its half alone, recorded closed-loop rallies with paddle contacts, scoring, game end at 11, coin and Start restart; `rebound-15-two-credits` (DIP 3: 15 points, 1 coin/2 credits): rallies, game end at 15, second-credit restart with Start alone | PCM, telemetry (both scores, ATTRACT_n, hits, active), inputs, HIT collisions, events (HIT, LEFT/RIGHT_SCORE pulses), frame times and full-frame RGB hashes, gray observations, every full-RGB snapshot; native↔Wasm both reset epochs; reset isolation; registered-game ABI probe | **PASS** | The original scheduler applies a replay input up to 10.8 µs after its millisecond (identical in all three runtimes; the per-game sanity bound is 20 µs). Rallies come from recorded inputs, not players; the alternate coinage is exercised through its second credit only |
| Pong, Pong Doubles, Space Race, Breakout | `pong.tsv` and the sixteen earlier ROM-free scenarios, unchanged | as in the 0.1.x run | **PASS** | Unchanged from the 0.1.x run |
| Stunt Cycle, Indy 4 | the six ROM-backed scenarios, unchanged, with the private fixtures (`build/roms`, audited by `compare-rom-games.py`) | as in the 0.1.x run | **PASS** | Unchanged from the 0.1.x run |

Commands, from the repository root:

```sh
./tools/build-native.sh --jobs 4 && ./tools/build-core.sh all
./tools/capture-pong.sh
NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh     # 18 scenarios, whole batch qualified
NOCPU_REPLAY_JOBS=4 make core-compare
python3 tools/compare-rom-games.py
```

Reports: `build/core/comparison.json` (Pong),
`build/core/game-evidence/20261016T182553965586687Z/report.json` (18 ROM-free
scenarios, `full_batch: true`, plus the multi-game probe, 357/357 checks, and
the Breakout probe), originals in
`build/reference-games/20261016T180952783453462Z/`, and
`build/rom-comparison/20261016T183954031892Z/report.json` (ROM-backed).

Browser checks of the same build, packaged (`make web-preview`), in Playwright
1.58.2's headless Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0:
the full suite passed in Chromium and Firefox (51 passed; the 7 ROM tests ran
separately with the private fixtures, 20/20 passed in Chromium and Firefox).
In WebKit, five full runs: the first two each lost one test whose page
crashed right after a game started ("Target crashed" / "Target page, context
or browser has been closed"; a Pong window-size test, then the Pong Doubles
mouse test, which passed 5/5 when repeated), and the next three passed 51/51.
Five runs of the 4dd6d18 baseline build, alternated with the last three, had
no crash (48/48). The Rebound and Play-screen specs passed in every run of
every engine. WebKit is not a required acceptance engine; the crash is
recorded, not explained. These are automated checks, not human play or speaker
output.

## 0.2.0 Quadrapong comparison run — 2026-10-16

Commit `daa1450` (Quadrapong, core ID 8, and the inverted score terms of
`5608d86`) on `restart/desktop-first`, seed 848. Every original captured fresh
(no reference cache), in the same pinned image (`sha256:bfdadad2…`), Xvfb, Mesa
20.0.8 llvmpipe, x86-64 host with FMA. Native: GCC 13.3.0 build of
`build-core.sh native`. Wasm: Emscripten 3.1.74 (`nocpu.wasm` `74906c80…`) run
in Node 22.22.0. The contract change touches shared core and reference code, so
every game was re-run in full.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Quadrapong | `quadrapong-default` (DIP 0, 1 coin/1 credit): Start without a credit, one coin without Start, two coins and Start load a four-player game, each paddle (left, right vertical; top, bottom horizontal) swept across its side alone, a recorded closed-loop rally with contacts by all four paddles, misses until one player is left and the game ends, one coin and Start restart a two-player game (top and bottom walled) with a recorded rally; `quadrapong-two-credits` (DIP 1, 1 coin/2 credits): one coin buys a four-player game, rally with contacts by all four, game end, Start without a credit does not restart, coin and Start restart | PCM, telemetry (four miss counters, ATTRAC_n, hits, active), inputs, HIT collisions, events (HIT, left/right and top/bottom paddle hits, buffered MISS, SERVE), frame times and full-frame RGB hashes, gray observations, every full-RGB snapshot (the contrast-3.0 raster); native↔Wasm both reset epochs; reset isolation; registered-game ABI probe | **PASS** | Rallies come from recorded inputs, not players. Paddle contacts are attributed from the raster time of each hit (no per-paddle hit pin). The miss counters are observations of the original counters, not a displayed score; the 15 ns `MISS_BUF` glitch filter (inherited TODO) is exercised, not validated against hardware |
| Pong, Pong Doubles, Space Race, Breakout, Rebound | `pong.tsv` and the eighteen earlier ROM-free scenarios, unchanged | as in the 0.2.0 run above | **PASS** | Unchanged |
| Stunt Cycle, Indy 4 | the six ROM-backed scenarios, unchanged, with the private fixtures | as in the 0.1.x run | **PASS** | Unchanged |

Commands as in the 0.2.0 run above (`NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh`
now captures 20 scenarios). Reports: `build/core/comparison.json` (Pong),
`build/core/game-evidence/20261016T211404229373590Z/report.json` (20 ROM-free
scenarios, `full_batch: true`, plus the multi-game probe, 405/405 checks, and
the Breakout probe, 502/502), originals in
`build/reference-games/20261016T205719449744244Z/`, and
`build/rom-comparison/20261016T212920923079Z/report.json` (ROM-backed).

Browser checks of the same build (commit `869ac4f`, Quadrapong verified),
packaged (`make web-preview`), in Playwright 1.58.2's headless Chromium
145.0.7632.6, Firefox 146.0.1 and WebKit 26.0: the full suite passed in
Chromium, Firefox and WebKit (54 passed each; the 7 ROM tests skipped there
ran separately with the private fixtures and the identity test, 20/20 in
Chromium and Firefox). WebKit ran the full suite three times with
`DEBUG=pw:browser` and a memory sampler: 54/54 each, no page crash (the two
unexplained crashes of the earlier 0.2.0 WebKit runs did not recur; peak
system memory use 2.3 GB of 16 GB, WebKit processes at most 257 MB). A local
desktop acceptance record (`tools/desktop-acceptance.py combine`) is passed for
all eight games in the required engines. These are automated checks, not human
play or speaker output.

## Desktop browser acceptance (generated by each release)

Desktop acceptance for the ported games is produced by the release
workflow itself, against the exact build it ships, rather than written here by
hand. The [release readiness record](../tests/release-readiness.json) states
only the policy: the games (Pong, Pong Doubles, Space Race, Breakout, Stunt
Cycle, Indy 4 and, from 0.2.0, Rebound and Quadrapong), the required engines (Chromium and Firefox) and that a release
requires it. The release run then:

1. runs the browser jobs (Chromium, Firefox, WebKit) and the ROM browser job
   (Stunt Cycle and Indy 4 from the private fixtures, Chromium and Firefox)
   against the packaged site, after checking every packaged file;
2. records each engine's `browser.version()` and the outcome of every test
   tagged `@game-<id>`, with the runtime digest recomputed from the tested files;
3. combines them with `tools/desktop-acceptance.py` into
   `nocpu-X.Y.Z-acceptance.json`. It is `passed` only when every listed game's
   tagged tests passed in every required engine and no test in those engines
   failed;
4. the publish step checks the record against the release zip (tag, commit and
   runtime digest recomputed from the zip) and publishes it as a release asset
   with its `.sha256`. Without a passed record nothing is published.

The record names the engines as what they are, for example "Chromium
145.0.7632.6 (Playwright 1.58.2 build, headless)" and "Firefox 146.0.1
(Playwright 1.58.2 build, headless)": real engines, but Playwright's test
builds, not Google Chrome or a Mozilla release Firefox. It is automated,
scripted play with a PulseAudio null sink, not human play or speaker output.
See [TESTING.md](TESTING.md#desktop-acceptance-record) for the details.

## Supplementary manual desktop checks

Optional evidence from a person playing a build in a desktop browser. It adds
to the automated record above; it never replaces it, and no release waits for
it. Add one row per session, newest last, with:

- **Date** — `YYYY-MM-DD`;
- **Build** — the About panel build string (`vX.Y.Z` or `vX.Y.Z-dev.<sha>`);
- **Browser** — name and full version as the browser reports it (for example
  "Google Chrome 146.0.7680.80" or "Firefox 147.0.2");
- **OS** — operating system and version;
- **Games played** — the games tried, and anything specific checked;
- **Result** — `pass`, `fail` or `partial`;
- **Notes** — problems seen, with a link to the bug report for a `fail` or
  `partial`.

`tools/check.py` checks that each row is complete.

<!-- manual-checks:start -->
| Date | Build | Browser | OS | Games played | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
<!-- manual-checks:end -->

No manual check has been recorded yet.
