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

## 0.2.0 Crossfire comparison run — 2026-10-17

Commit `4ce4c85` (Crossfire, core ID 9) on `restart/desktop-first`, seed 848.
Every original captured fresh (no reference cache), in the same pinned image
(`sha256:bfdadad2…`), Xvfb, Mesa 20.0.8 llvmpipe, x86-64 host with FMA. Native:
GCC 13.3.0 build of `build-core.sh native`. Wasm: Emscripten 3.1.74
(`nocpu.wasm` `03ea2f91…`) run in Node 22.22.0. Every game was re-run in full.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Crossfire | `crossfire-default` (1180 kΩ): Fire in attract does not start, the coin starts at once (no Start switch), each stick held Up to its clamp and Down under the bottom border alone, Fire held 2 s fires once, a press during the flight is ignored and a later press fires again (both guns), recorded closed-loop play (each gun alone, then both) with hits and goals for both players, a coin in play changes nothing, the timer ends the game (129.64 s) after the GNE warning, Fire after the end does not start, a coin restarts with cleared scores and play continues; `crossfire-min-time` (680 kΩ, 74.71 s) and `crossfire-max-time` (1680 kΩ, 184.57 s): play, a coin in play, timer end, Fire after the end, coin restart | PCM, telemetry (both scores, ATTRACT_n, hits, active), inputs, HIT collisions, events (left/right HIT and FIRE, START, the N9 timer, GNE), frame times and full-frame RGB hashes, gray observations, every full-RGB snapshot; native↔Wasm both reset epochs; reset isolation (the fire-sound capacitor and astable restored cold); registered-game ABI probe | **PASS** | Play comes from recorded inputs, not players. The analog chips of `crossfire.h` are DICE's own estimates ("guesswork + simulation", inherited TODOs) and are compared, not validated against hardware. Scores past 19 would wrap and are not reached. Floating point: the run-time `log()` in the fire-sound 555 astables returns a different last bit in glibc 2.27 (original), glibc 2.39 (native) and musl (Wasm) for 34 of the 50228 control voltages FIRE_SOUND_CV can produce, but an exhaustive check of all 50228 (`build/agent-crossfire/float/`) shows every integer-picosecond delay derived from them identical in the three builds (the nearest affected delay is 4×10⁻³ ps from a truncation boundary, a one-ULP change moves it by about 10⁻⁶ ps); the `exp`/`log` constants of `crossfire.h` are compile-time folded to identical bits by all three compilers |
| Pong, Pong Doubles, Space Race, Breakout, Rebound, Quadrapong | `pong.tsv` and the twenty earlier ROM-free scenarios, unchanged | as in the runs above | **PASS** | Unchanged |
| Stunt Cycle, Indy 4 | the six ROM-backed scenarios, unchanged, with the private fixtures | as in the 0.1.x run | **PASS** | Unchanged |

Commands as in the 0.2.0 run above (`NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh`
now captures 23 scenarios). Reports: `build/core/comparison.json` (Pong),
`build/core/game-evidence/20261016T235117906847613Z/report.json` (23 ROM-free
scenarios, `full_batch: true`, plus the multi-game probe, 429/429 checks, and
the Breakout probe, 502/502), originals in
`build/reference-games/20261016T232952333963571Z/`, and
`build/rom-comparison/20261017T001312880071Z/report.json` (ROM-backed).

Browser checks of the same build (commit `93113e3`, Crossfire verified),
packaged (`make web-preview`), in Playwright 1.58.2's headless Chromium
145.0.7632.6, Firefox 146.0.1 and WebKit 26.0: the full suite passed in
Chromium, Firefox and WebKit (57 passed each; the 7 ROM tests skipped there
ran separately with the private fixtures and the identity test, 20/20 in
Chromium and Firefox). The three Crossfire tests assert on the held clock:
coin start, both sticks to their clamps, one bullet per press, gamepads, the
680 kΩ game ending between 74 and 75 simulated seconds, and the restart.
WebKit ran the full suite three times with `DEBUG=pw:browser` and a memory
sampler: 57/57 each, no page crash (peak system memory use 2.2 GB, WebKit
processes at most 250 MB). A local desktop acceptance record
(`tools/desktop-acceptance.py combine`) is passed for all nine games in the
required engines. These are automated checks, not human play or speaker
output.

## 0.2.0 Gotcha comparison run — 2026-10-17

Commit `5ef3145` (Gotcha, core ID 7, with the derived-source edit of `8677553`)
on `restart/desktop-first`, seed 848. Every original captured fresh (no
reference cache), in the same pinned image (`sha256:bfdadad2…`), Xvfb, Mesa
20.0.8 llvmpipe, x86-64 host with FMA. Native: GCC 13.3.0 build of
`build-core.sh native`. Wasm: Emscripten 3.1.74 (`nocpu.wasm` `9baeb1c4…`) run
in Node 22.22.0. The prepared-core change touches every compiled game's build,
so every game was re-run in full.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Gotcha | `gotcha-default` (297 kΩ, the original default and maximum): Start without a credit and a coin alone do not start, Start after the coin does; each stick direction held alone (cross right, left, up, down; square right, left, up, down) moves only its own player that way; a coin and Start in play change nothing; recorded closed-loop play (the square chasing a still cross, the cross running into a still square, both closing in, both idle) with 21 catches, each adding one to the catch counter; the maze blank during each 0.73 s catch one-shot and changing shape in play; the timer stepping once per D8 period and ending the game at 99 (104.918 s); Start begins the second game the coin bought with cleared counters; `gotcha-min-time` (47 kΩ, 17.768 s): four complete games, one coin buying two games, Start without a credit after them, two coins still buying only two games, 22 catches; `gotcha-mid-time` (172 kΩ, 61.343 s): play to the end with 25 catches and the second game | PCM, telemetry (catch and play-time counters, ATTRACT_n, hits, active), inputs, CATCHOS collisions, events (START and every edge of the E8 proximity-tone astable), frame times and full-frame RGB hashes, gray observations, every full-RGB snapshot; native↔Wasm both reset epochs (including the proximity tone, with the PROXIMITY capacitor restored cold); registered-game ABI probe | **PASS** | Play comes from recorded inputs, not players. One coin buys two games because DICE wires the games-per-coin input to VCC (inherited "should be connected to dip switch" TODO); the PROXIMITY Thevenin values and cutoff and the "right wall collision fix" gate are DICE's own (inherited TODOs) and are compared, not validated against hardware. The tone's dependence on the players' position is checked from snapshots (beeps faster when the two line up across the screen), not measured continuously. Catches past 39 would wrap and are not reached. Floating point: PROXIMITY integrates its capacitor with run-time `exp()` and E8 takes `log()` of the resulting control voltage. Replaying the recorded PROXIMITY inputs of all three scenarios (16.6 million calls, 138998 control-voltage writes) through the original arithmetic with glibc 2.27 (original), glibc 2.39 (native) and Emscripten's musl (Wasm) gives different last bits of the capacitor voltage in all three, and different control voltages for 188 writes, but every integer-picosecond 555 delay derived from them is identical (the nearest affected delay is 3.9×10⁻³ ps from a truncation boundary; a one-ULP change moves it by about 10⁻⁴ ps). The reachable control voltages are not a finite set here, so this is shown for the scenarios, not exhaustively (`build/agent-gotcha/float/`) |
| Pong, Pong Doubles, Space Race, Breakout, Rebound, Quadrapong, Crossfire | `pong.tsv` and the twenty-three earlier ROM-free scenarios, unchanged | as in the runs above | **PASS** | Unchanged |
| Stunt Cycle, Indy 4 | the six ROM-backed scenarios, unchanged, with the private fixtures | as in the 0.1.x run | **PASS** | Unchanged |

Commands as in the 0.2.0 run above (`NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh`
now captures 26 scenarios). Reports: `build/core/comparison.json` (Pong),
`build/core/game-evidence/20261017T031212738825254Z/report.json` (26 ROM-free
scenarios, `full_batch: true`, plus the multi-game probe, 453/453 checks, and
the Breakout probe, 502/502), originals in
`build/reference-games/20261017T022753331216529Z/` (media pruned after the
run), and `build/rom-comparison/20261017T033648511418Z/report.json`
(ROM-backed). The first `make core-compare` attempt stopped when the disk
filled (its replay tool refuses to start a scenario with less than 1 GiB
free); after pruning old evidence it was re-run unchanged against the same
originals and passed.

Cold reset: the PROXIMITY chip's function-local `static double v_cap` is moved
to file scope by `tools/prepare-core.py` and zeroed by the cold reset
([UPSTREAM_PATCHES.md](UPSTREAM_PATCHES.md)). A scan of the compiled objects of
`games/gotcha.cpp` and every chip it uses found no other mutable
function-local or global static (the descriptors are restored by
`core/games/gotcha.inc`). Without the edit, a stale voltage would be forgotten
within about 5.5 ms of attract while the tone astable is held in reset, and a
scratch build without it gave identical epochs in a 10 s replay; the edit makes
the reset exact rather than relying on that.

Browser checks of the same build (commit `2562085`, Gotcha verified),
packaged (`make web-preview`), in Playwright 1.58.2's headless Chromium
145.0.7632.6, Firefox 146.0.1 and WebKit 26.0: the full suite passed in
Chromium, Firefox and WebKit (60 passed each; the 7 ROM tests skipped there
ran separately with the private fixtures and the identity test, 20/20 in
Chromium and Firefox). The three Gotcha tests assert on the held clock from a
fixed simulated time: Start without a credit, a coin alone, Start, the catch
flash, all eight stick directions by keyboard and two by gamepad (axis and
d-pad), each moving only its player, the 47 kΩ games ending between 17.0 and
18.5 simulated seconds, one coin buying two games, and the restart. WebKit ran
the full suite three times with `DEBUG=pw:browser` and a memory sampler: 60/60
each, no page crash (peak system memory use 2.2 GB, WebKit processes at most
250 MB); one page crash ("Target crashed") was seen earlier in a development
(unpackaged) WebKit run of the Gotcha play-time test and did not recur in nine
later runs of that test. A local desktop acceptance record
(`tools/desktop-acceptance.py combine`, `build/agent-gotcha/acceptance-record.json`)
is passed for all ten games in the required engines. These are automated
checks, not human play or speaker output.

Real-time speed of Gotcha in play on this host (4-vCPU Intel Xeon @ 2.10 GHz),
reported by the Gotcha play test, not gated: Chromium runs it in real time
(paced 0.999x; raw held-clock stepping 2.02x real time), WebKit in real time
(paced 0.98–1.00x; raw 1.98–2.06x over three runs), and Playwright's Firefox
build does **not**: paced 0.35x, raw 0.39x real time, so a player in that
Firefox build gets Gotcha at about a third of its original speed. (Pong in
the same Firefox run: 0.98x.) This is input for the 0.4.0 profiling milestone.

## 0.3.0 comparison run — 2026-10-18

Core of commit `61df02e` (TV Basketball, Pin Pong and Hi-Way, core IDs 10–12)
on `wip/0.3.0-batch-b`, seed 848; later commits change docs and the browser
registry only. Every original captured fresh (no reference cache) in the same
pinned image (`nocpu-dice-qt4:0.1.0`, `sha256:bfdadad2…`), Xvfb, Mesa 20.0.8
llvmpipe, x86-64 host with FMA. Native: GCC 13.3.0 build of `build-core.sh
native`. Wasm: Emscripten 3.1.74 (`nocpu.wasm` `940ca7fc…`) run in Node
22.22.0. The new chips, the wheel and portrait contract and the Wasm memory
limit touch every compiled game's build, so every game was re-run in full.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| TV Basketball | `tvbasketball-default` (35 kΩ): Start without a credit does not start, one coin and Start give the two-player game, paddle 1 moving both striped and paddle 2 both solid players (paddles 3 and 4 nobody), baskets scoring two for one side, both sides scoring, Start in play changing nothing, the clock running 120 periods of the 9D astable and ending the game (119 s), then two coins and Start giving a four-player game; every coin stopping VBLANK for the 0.53 s 3B one-shot and clearing both scores; `tvbasketball-four-players` (10 kΩ, 73 s): a four-player game with each of the four paddles moving its own player, a coin in play restarting it as a two-player game; `tvbasketball-max-time` (60 kΩ, 165 s): two complete games | PCM (13F.3), telemetry (both scores, the clock, active), inputs, events (coin, VBLANK, the 9D clock), frame times including the declared coin frame gaps, full-frame RGB hashes, gray observations, every full-RGB snapshot; native↔Wasm both reset epochs; registered-game ABI probe | **PASS** | Play comes from recorded closed-loop inputs, not players. The 9D astable's run-time `log()` arguments are constants (its control voltage is never written): identical in glibc 2.27, glibc 2.39 and musl |
| Pin Pong | `pinpong-default` (DIP 0: one credit, free ball enabled, three balls): Start without a credit, a coin and Start beginning the game and serving the first ball, Start serving each later ball, each flipper (BUTTONS1 buttons 1 and 2) rising alone while held, scoring in play (the display shows ten times the count), the game ending after the third ball, a second coin and game; `pinpong-five-balls` (DIP 6: five balls, free ball disabled): the game ends after the fifth ball, no free ball awarded; `pinpong-two-credits` (DIP 1): one coin buying two games, then Start without a credit | PCM (one constructor sample: no hookup), telemetry (score, balls served, attract, active), inputs, events (coin, Start, ball served, drain), frame times, full-frame RGB hashes of the portrait 324 × 432 raster, gray observations, every full-RGB snapshot; native↔Wasm both reset epochs; registered-game ABI probe (portrait raster and flipper buttons) | **PASS** | The free-ball award (all knockdown targets down) is not reached by any scenario. DICE wires no output to the audio chip ("TODO: Finish Sound"): absent audio is inherited and compared as such, not reconstructed. The `OPTIMIZATION_HINT` tables need about 590 MB in Wasm (840 MB native RSS), so the Wasm memory limit is now 2 GiB (growth on demand); the other games stay at their 32 MiB initial memory |
| Hi-Way | `hiway-default` (DIP 6, 510 kΩ): the coin starting a cleared game at once (no Start switch), the wheel turned left and then right moving the car that way, recorded closed-loop steering by the wheel axis and then by the held wheel keys, the accelerator held and released (no distance scored while released), the score counting distance one at a time on Fx, the game ending as the E8 counter wraps (81.1 s); `hiway-extended-play` (DIP 1, 1010 kΩ, steering by the wheel axis): reaching 10 points clears the clock at once and the game runs seven to eight more E9 periods; `hiway-double-traffic` (DIP 54, 10 kΩ, 51.4 s, steering by the wheel keys): concurrent and opposing traffic set to double (compared exactly; the traffic density itself has no separate check), a coin in play clearing the score but not the clock | PCM (one constructor sample: no hookup), telemetry (score, clock, active), inputs (wheel and accelerator), events (Fx, the E9 clock, the extended-play match), frame times, full-frame RGB hashes, gray observations, every full-RGB snapshot (car position); native↔Wasm both reset epochs (the wheel queues and `HighwaySpeedDesc` cleared in place); registered-game ABI probe (wheel slot) | **PASS** | One count exactly as the time runs out, without an Fx edge, is the original's and accepted as such. DICE wires no output to the audio chip ("todo: needs work"): absent audio is inherited. Floating point: `HIGHWAY_SPEED_CONTROL` takes run-time `exp()` of 18 distinct arguments; all are bit-identical and correctly rounded in glibc 2.27, glibc 2.39 and musl (exhaustive) |
| Pong, Pong Doubles, Space Race, Breakout, Rebound, Quadrapong, Crossfire, Gotcha | `pong.tsv` and the twenty-six earlier ROM-free scenarios, unchanged | as in the runs above | **PASS** | Unchanged |
| Stunt Cycle, Indy 4 | the six ROM-backed scenarios, unchanged, with the private fixtures | as in the 0.1.x run | **PASS** | Unchanged |

Originals: `NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh` (35 scenarios,
`build/reference-games/20261018T031912235696007Z/`, "Original whole game
reference qualification passed"; media and its report pruned after the run,
its source bindings kept in the comparison report). Reports:
`build/core/comparison.json` (Pong),
`build/core/game-evidence/20261018T044920200177Z/report.json` (35 ROM-free
scenarios, `full_batch: true`, 35/35, plus the multi-game probe, 562/562
checks, and the Breakout probe, 502/502) and
`build/rom-comparison/20261018T061244831242Z/report.json` (ROM-backed). The host's free
disk (about 11 GB) cannot hold every scenario's four native/Wasm epochs at
once (about 20 GB), so `make core-compare`'s replay and comparison steps ran
through a scratch driver that performs the same `replay-games.sh` commands and
the same `compare-games.py` per-scenario comparison and ABI probes scenario by
scenario, deleting a scenario's native/Wasm media once it had passed; the
report records this in its `driver` field. Subset runs during the port (TV
Basketball, Pin Pong and Hi-Way alone) also passed, after a fix that leaves
BUTTONS button 3 unassigned in a game with wheels (it had shared joystick
button 2 with the wheel's left key and broke original↔native keyboard
steering).

Cold reset: a scan of the compiled objects of the three circuits and every
chip they use found no mutable function-local or global static beyond the
descriptors their `core/games/<id>.inc` files restore; no derived-source edit
is needed. The 555 astables whose control voltage is never written take
`log()` of the same constants (`ctrl` = 10/3 gives log(0.5) and log(1/3)),
identical in all three libms.

Real-time speed in play, measured on a 4-vCPU Xeon @2.1 GHz CI-class host; may
run below real time on slower machines. Host load below 1, Playwright 1.58.2's
headless builds, median of three runs, paced (the app's own clock) / raw
(held-clock stepping as fast as possible), as a fraction of real time; not
gated:

| Game | Chromium 145.0.7632.6 | Firefox 146.0.1 | WebKit 26.0 |
| --- | --- | --- | --- |
| Pong (baseline) | 1.00 / 3.82 | 0.93 / 1.09 | 1.00 / 1.72 |
| TV Basketball | 1.00 / 1.44 | 0.30 / 0.36 | 0.88 / 1.11 |
| Pin Pong | 0.71 / 0.93 | 0.15 / 0.18 | 0.55 / 0.84 |
| Hi-Way | 0.51 / 0.98 | 0.16 / 0.25 | 0.41 / 0.80 |

Pin Pong and Hi-Way run below real time in all three engines on this host,
and TV Basketball below it in Firefox and slightly below in WebKit. The owner
released all three as playable in 0.3.0 (2026-10-18) with this recorded;
making them real time is the 0.4.0 profiling target.

Browser checks of the same build (TV Basketball, Pin Pong and Hi-Way verified,
thirteen playable games), packaged (`make web-preview`, runtime SHA-256
`4e1a8e63…`), in Playwright 1.58.2's headless Chromium 145.0.7632.6, Firefox
146.0.1 and WebKit 26.0: the full suite passed in Chromium (68 passed), Firefox
(67 passed, see below) and WebKit (68 passed on a quiet host); the 8 ROM tests
skipped there ran separately with the private fixtures and the identity test,
20/20 in Chromium and Firefox. In that Firefox run the Pin Pong DIP test failed
once: the first ball was still in play after the test's fixed 12 s drain wait.
The game had run paced before the test held the clock, and Firefox paces Pin
Pong at about 0.15x, so the coin landed at a different circuit time and the
ball took a different path. The test now resets the circuit cold under the
held clock before its coin. The changed spec then passed in all three
engines: Firefox (the DIP test twice and the whole file once), Chromium, and
the WebKit full run above. A first WebKit full run had one Breakout failure
(`v050-breakout.spec.ts`, the ball not seen moving within its 10 s wall-clock
poll) while a Firefox Pin Pong test loaded the same host; the quiet re-run
passed. These are automated checks, not human play or speaker output.

## Desktop browser acceptance (generated by each release)

Desktop acceptance for the ported games is produced by the release
workflow itself, against the exact build it ships, rather than written here by
hand. The [release readiness record](../tests/release-readiness.json) states
only the policy: the games (Pong, Pong Doubles, Space Race, Breakout, Stunt
Cycle, Indy 4, from 0.2.0 Rebound, Gotcha, Quadrapong and Crossfire, and from
0.3.0 TV Basketball, Pin Pong and Hi-Way), the required engines (Chromium and Firefox) and that a release
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
