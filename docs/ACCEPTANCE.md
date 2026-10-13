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
`nocpu-dice-qt4:0.1.0` (`sha256:bfdadad2…`), Xvfb, Mesa llvmpipe. Native: host
GCC build of `build-core.sh native`. Wasm: Emscripten 3.1.74 run in Node 22.22.0.
ROM fixtures: `NoCPU-Roms` commit `2166ace`, audited by `fetch-roms.sh`.

| Game | Scenarios | Streams compared | Result | Gaps |
| --- | --- | --- | --- | --- |
| Pong | `pong.tsv`: attract, coin start, independent paddles, two paddle contacts, scoring, coin restart, recreate; DIP default (11) | PCM, telemetry, inputs, collisions, frame-time/full-frame RGB hashes, gray observations; native↔Wasm both reset epochs; reset isolation | **PASS** | Winning Score DIP 15 and the end-of-game state are not exercised; the Pong pipeline has a single scenario |
| Pong Doubles | `pongdoubles-default` (DIP 11), `pongdoubles-15` (DIP 15): coin vs Start, four paddles, contacts, scoring, game end, post-end restart | PCM, telemetry, inputs, collisions, events, frame RGB hashes, gray; native↔Wasm and reset epochs | **PASS** | — |
| Space Race | `spacerace-default` (970 kΩ), `-two-credits` (1 coin/2 credits, 470 kΩ), `-max-time` (1470 kΩ), `-coin-only`: Up/Down per rocket, crashes, scoring, play timer, game end | as Pong Doubles | **PASS** | The circuit exposes no attract/hit telemetry signal, so attract mode is covered by stream equality only; the original's Start-without-coin timer quirk is retained as the reference |
| Breakout | ten scenarios: `default`, `three-`/`five-balls-miss-restart`, `two-player-normal`/`-cocktail`, two `coinage-*-start2`, `bonus100-rally`, `pilot`, `alternate`; DIP ball count, cabinet, coinage, bonus thresholds | as Pong Doubles, plus selected full-RGB portrait snapshots; multi-game and Breakout ABI probes | **PASS** | Bonus-credit threshold award is not reached in any scenario |
| Stunt Cycle | `stuntcycle-throttle` (pilot), `stuntcycle-two-player-keys` (DIP 130: 2 misses, 1 coin/2 credits; Start 2, keyboard throttle, player alternation, game end, attract, restart), `stuntcycle-jump-score` (default DIP 76; two cleared jumps and score steps) | decoded RGB frames and snapshots, frame times/geometry, raw PCM, inputs, events, telemetry, hardware signals, audio boundary; native↔Wasm both epochs; reset isolation | **PASS** | Inherits absent DICE audio (PCM is a single constructor zero sample); free-game award not reached |
| Indy 4 | `indy4-pilot` (720 kΩ) passes; `indy4-min-time-end` (220 kΩ, keyboard wheel keys, play timer expiry, restart) and `indy4-max-time-keys` (1220 kΩ, dollar bill) | as Stunt Cycle | **FAIL** — in the two new scenarios `frames.csv`/`frames.rgb` and one snapshot differ, original↔native only; native↔Wasm, reset isolation and every non-RGB stream (PCM, inputs, events, telemetry, hardware, gray, geometry) are equal | Open renderer mismatch, deterministic on a repeat original capture: raster row 213 of 432 shows the next scanline in the original (it duplicates row 214) but the previous one in the port (it duplicates row 212), seen when a car crosses it. Bug report pending; not accepted. Inherits absent DICE audio |

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
