# Porting a DICE 0.9 game

From 0.2.0 on, each newly ported game is described as data in a handful of
files of its own, and the shared core, reference, comparison and browser code
serve it through generic paths. Rebound is the template. A port is accepted
only when its original/native/Wasm comparison passes
([ACCEPTANCE.md](ACCEPTANCE.md)); a game DICE cannot run accurately is recorded
as blocked with evidence, never dropped.

The six earlier circuits (Pong, Pong Doubles, Space Race, Breakout, Stunt
Cycle, Indy 4) keep their own code paths; do not move them onto the generic
paths as part of a port.

## Files a game owns

Create these; nothing else should need per-game code. `<id>` is the DICE
command-line ID (`gotcha`, `quadrapong`, `crossfire`, …).

| File | What it holds |
| --- | --- |
| `core/games/<id>.inc` | Appended to the prepared `games/<id>.cpp` by `tools/prepare-core.py`: `void nocpu_reset_<id>_descriptors()`, restoring every mutable static descriptor of the original file to its cold value (paddles, 555/9602, capacitors, mixers, custom analog descriptors, DIP switches, potentiometer). First line is the SPDX header. |
| `core/games/<id>.cpp` | `NOCPU_REGISTER_GAME(<id>) { … }` filling a `NoCPUGameDef` ([`core/game_registry.h`](../core/game_registry.h)): ID, circuit and reset functions, DIP fields (original descriptor names, packed from bit 0 in declared order), potentiometer name and range, paddle/joystick/button/Start counts, observed score terms, `active`, optional `attract_n`, `hit` and up to eight event pins. |
| `tools/reference/games/<id>.inc` | `REFERENCE_GAME(<id>) { … }`: the original reference's own, independently written description of the same settings, inputs and observed pins. |
| `tools/reference/games/<id>.py` | Analysis module: `GAME`, `CORE_ID`, measured `FIRST_FRAME_PS`/`FRAME_PERIOD_PS` (+ `FRAME_PERIOD_BASIS`, optional clock counts and `INPUT_SKEW_BOUND_PS`), `valid_options(dip, pot)`, `snapshot_objects(rgb, w, h)` and `analyze(ctx)` returning the game's original-behavior checks. |
| `tests/replays/<id>*.tsv` | Scenario replays (see below). |
| `web/src/games/<id>.ts` | Browser definition (`GameDefinition`, [`web/src/games/types.ts`](../web/src/games/types.ts)): channels (paddle or stick axis, orientation, core slot, measured axis sign, actions, default pad/axis), held buttons, Start count, settings descriptors, labels, default keys, help texts, and `verified`. |
| `tests/browser/game-<id>.spec.ts` | Browser tests; every test tagged `@game-<id>`. `tools/check.py` treats this file name as a per-game spec automatically. Use [`tests/browser/game-helpers.ts`](../tests/browser/game-helpers.ts). |

## Shared files: one line each

These lists have a reserved line per batch game, separated by blank lines so
parallel ports do not touch the same lines:

- `core/nocpu.h`: the game's ID in `NoCPUGame`, reserved before the batch
  starts (0.2.0 reserved `NOCPU_REBOUND=6`, `NOCPU_GOTCHA=7`,
  `NOCPU_QUADRAPONG=8`, `NOCPU_CROSSFIRE=9`; 0.3.0 reserved
  `NOCPU_TVBASKETBALL=10`, `NOCPU_PINPONG=11`, `NOCPU_HIWAY=12`). Later
  batches add theirs.
- `web/src/games/index.ts`: the game's `import` line and its list entry,
  reserved as `// Reserved:` comments before the batch starts; the port
  uncomments them.

These have one entry per game and may need a trivial merge (keep both sides):

- `tests/replays/game-scenarios.json`: the game's scenarios, appended.
- `tests/release-readiness.json`: the game in `desktop_acceptance.games`,
  added only with the verified commit.
- `docs/ACCEPTANCE.md` (ledger row), `docs/GAME_COMPATIBILITY.md` (status,
  verification row), `CHANGELOG.md` (one Added line).

Nothing else should change for a ROM-free game with paddles, digital
joysticks, buttons, Coin and up to two Starts. A game needing an input family
the contract lacks (wheel, throttle, rotated raster, ROMs) needs shared work
first; agree it with the orchestrator before editing shared files.

## Steps and commands

Run heavy builds and captures one at a time. Original captures need Docker
and a host CPU with FMA (`grep -m1 -o fma /proc/cpuinfo`).

1. **Read the circuit.** `upstream/dice-0.9/games/<id>.cpp` (and any header):
   inputs, settings, `static` descriptors, custom chips, function-local
   `static` variables (state that survives in-process machine re-creation),
   audio hookup. Pick observed pins that exist after pruning (score counters,
   ATTRACT/active, HIT). Record anything DICE marks TODO as inherited.
2. **Core.** Write `core/games/<id>.inc` and `.cpp`, then
   `./tools/build-core.sh native` and a scratch replay:
   ```sh
   build/core/native/pong-runner --output build/<scratch> --game <id> --replay <scratch.tsv> --epochs 2
   ```
   Epochs 0 and 1 must be byte-identical (`cmp`) — a difference means a
   descriptor or static is not restored. Function-local statics cannot be
   restored from `core/games/<id>.inc`; they need a documented
   derived-source edit in `tools/prepare-core.py` (and a row in
   [UPSTREAM_PATCHES.md](UPSTREAM_PATCHES.md)).
3. **Scenarios.** Replays are `ms action value` rows ending in one
   `recreate 1`. Actions: `coin`, `start`, `start2`, `paddleN` (signed int16
   axis), `upN`/`downN`/`leftN`/`rightN` (declared directions only),
   `buttonSB` (slot S, button B), all 0/1 except paddles. Cover attract,
   coin/Start rules, every control slot moving alone (sampled at the fixed
   snapshot times, see `snapshots` in `core/native_runner.cpp`), contacts,
   scoring, game end, each DIP/potentiometer behavior and a restart. Long
   rallies can be recorded closed-loop against the Wasm core (advance 1 ms,
   read the frame, set an axis, record the row at that millisecond); the
   recorded TSV, not the script, is the scenario. Add the scenarios to
   `tests/replays/game-scenarios.json` with `id`, `game`, `core_id`, `replay`,
   `dip`, `pot_ohms` and the fields your module reads.
4. **Original capture and analysis.**
   ```sh
   ./tools/build-native.sh --jobs 4          # once; pristine original DICE
   ./tools/capture-games.sh --scenarios <id>-default,<id>-other
   python3 tools/reference/analyze-games.py "$(cat build/reference-games/last-run.txt)"
   ```
   Take `FIRST_FRAME_PS` and `FRAME_PERIOD_PS` from the original
   `frames.csv`, never from the port. Every check in the module must pass on
   both fresh original attempts.
5. **Subset comparison.**
   ```sh
   ./tools/build-core.sh all
   NOCPU_REPLAY_JOBS=4 ./tools/replay-games.sh --original "$(cat build/reference-games/last-run.txt)" --subset
   ```
   Requires original↔native and native↔Wasm byte equality of every stream,
   both reset epochs, and exact full-RGB snapshots. The multi-game ABI probe
   also checks the registered contract (undeclared inputs rejected, held-input
   reset equals a fresh machine, each paddle changes the court).
6. **Browser.** Write `web/src/games/<id>.ts` (`verified: false`) and its
   registry lines, then:
   ```sh
   npm run typecheck && npm run test:foundations
   npm run build:web
   PLAYWRIGHT_BROWSERS_PATH=$PWD/build/playwright ./tools/run-browser-tests.sh --project=chromium tests/browser/game-<id>.spec.ts
   ```
   Measure each paddle's axis sign on the original raster. Assert circuit
   behavior in simulated time (`untilCircuit`, `holdClock`/`stepClock`), never
   wall-clock speed ([TESTING.md](TESTING.md#simulated-time-not-host-speed)).
7. **Full checks** (all games, every original fresh):
   ```sh
   python3 tools/check.py && make test
   ./tools/build-native.sh --jobs 4 && ./tools/build-core.sh all
   ./tools/capture-pong.sh
   NOCPU_ANALYZE_JOBS=4 ./tools/capture-games.sh
   NOCPU_REPLAY_JOBS=4 make core-compare
   python3 tools/compare-rom-games.py        # with private fixtures; else SKIPPED (blocked)
   npm run typecheck && npm run test:foundations
   make web-preview
   NOCPU_TEST_PACKAGED=1 PLAYWRIGHT_BROWSERS_PATH=$PWD/build/playwright ./tools/run-browser-tests.sh --project=chromium
   NOCPU_TEST_PACKAGED=1 PLAYWRIGHT_BROWSERS_PATH=$PWD/build/playwright ./tools/run-browser-tests.sh --project=firefox --project=webkit tests/browser/game-<id>.spec.ts tests/browser/library-controls.spec.ts
   ```
   Keep logs under `build/`.
8. **Acceptance**, only after step 7 passes: set `verified: true` (the Play
   screen's "Verified against original DICE"), add the game to
   `tests/release-readiness.json` `desktop_acceptance.games`, add its
   [ACCEPTANCE.md](ACCEPTANCE.md) ledger row and its
   [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) status, and one
   `## [Unreleased]` Added line in `CHANGELOG.md`.

## Contract notes

- The core applies settings like the original `GameConfig`: every top-level
  DIP switch and potentiometer descriptor is found by its original name; a
  missing or duplicate name fails creation.
- Paddle slot N reads input axis N whatever its orientation (the original
  reads joystick N's X axis for horizontal and Y axis for vertical paddles).
  Paddle channels come first in the browser definition, in slot order.
- Joystick switches and buttons are held: the browser releases them on pause,
  reset and focus loss. A stick channel is one axis of a four-way stick; two
  channels with the same `slot` form one joystick.
- A score term is `{"CHIP.pin", weight}`; `{"CHIP.pin", weight, true}` reads
  the pin inverted, for a counter stage whose true output the original netlist
  prunes because only its complement is wired (Quadrapong's J10 `_3D_n`/`_4D_n`).
  The reference `.inc` uses the same form.
- Observations never feed the circuit. Telemetry columns are `score1..N`
  (at least two), `run_n` (`1 - active`), `attract_n` (`4294967295` when
  absent), `hits` (rising edges of `hit`) and `active`; events are `0` for HIT
  and `200 + index` for the declared event pins.
- `nocpu_game_info` exposes the contract to tools (`tools/replay-core.mjs`,
  the probes); the browser reads its own definition.
- From 0.3.0: `portrait=true` declares a circuit that rotates its monitor
  (Pin Pong, a 324x432 raster; creation checks it), and `wheels` declares
  `WHEELn_INPUT` slots (Hi-Way), steered in replays with `wheelN` (the signed
  turning-rate axis) and `wheelleftN`/`wheelrightN` (held keys) and in the
  browser by a `wheel` channel. A circuit file whose name differs from the DICE
  ID is mapped in `tools/prepare-core.py` (`SOURCE_FILES`, Hi-Way's
  `games/highway.cpp`). A browser definition can map the mouse buttons or a
  mouse-steered wheel with `mouse`.
- An analysis module may declare `frame_gap_windows(scenario, replay)` for a
  circuit that stops its own video sync (TV Basketball's coin) and
  `NO_AUDIO_HOOKUP = True` for a game DICE leaves without sound; any other
  frame gap or PCM length still fails.
