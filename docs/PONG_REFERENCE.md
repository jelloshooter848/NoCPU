# Native Pong reference

This scenario captures a measured reference from the original DICE 0.9
application. The portable native and Wasm cores are compared against it (see
[TESTING.md](TESTING.md#portable-core-and-originalnativewasm-comparison)).
Pong requires no external ROM. The other compiled games use the same
instrumented build through `tools/capture-games.sh` and
`tools/compare-rom-games.py`.

Run from the repository root:

```sh
./tools/build-native.sh --jobs 2
./tools/capture-pong.sh
```

Docker must be running. The pinned Qt4/SDL1.2/GCC7.5 toolchain runs the actual
historical Qt desktop frontend under Xvfb with Mesa software OpenGL. Compilation
and capture containers have networking disabled. Output stays in ignored
`build/reference/`; ROM files are neither needed nor captured.

The script creates an observation/input adapter in a separate copy of
`build/native/`. Original `upstream/dice-0.9/` and the unadapted native binary
remain unchanged. `tools/reference/apply_adapter.py` requires exact source
matches and writes the complete `build/reference/adapter.diff`, including added
adapter files. The adapter changes the simulation caller's slice boundaries,
injects values through the existing keyboard/absolute-joystick methods, records
named chip outputs, taps generated PCM before SDL's ring buffer, and reads the
original OpenGL backbuffer before swapping. It changes no game netlist, chip
truth table, queue algorithm, or audio synthesis logic.

The capture container uses its existing root account because historical
`nall::userpath()` dereferences `getpwuid(getuid())`; arbitrary host UIDs without
a container passwd entry crash that original code. Repository and executable
mounts remain read-only. Generated artifact ownership is restored to the caller
before the disposable container exits.

## Scenario and assertions

[`tests/replays/pong.tsv`](../tests/replays/pong.tsv) contains fixed timestamped
input changes, in milliseconds from circuit construction. Seed 848 is passed to
the original `srand` entry point. This test does not assume Pong uses randomness
or establish seed independence for other games.

The harness schedules with C++ integer picoseconds. Its maximum slice is 1 ms;
an input timestamp can shorten a slice. Original `Circuit::run` processes the
first queued circuit event at or beyond the requested deadline, so inputs record
both requested and applied picoseconds. The game retains its original 10 ms
input polling. No wall-clock keyboard automation drives the scenario.

Each process runs two 16-second epochs:

1. Observe settled attract mode, then insert coin at 500 ms. Pong's coin switch
   starts play; this game has no separate start-button action.
2. Move the left paddle while the right remains fixed, then move the right while
   the left remains fixed. Assert positions from native rendered pixels.
3. Place both paddles using fixed axis values chosen from observed ball paths.
   Assert two separate paddle contacts and horizontal ball reversals in the
   actual native frames.
4. Deliberately move paddles away and observe score-counter increases.
5. Insert another coin at 14 seconds. Assert the existing circuit clears both
   score counters and stays in active play.
6. At 16 seconds destroy and recreate the circuit using the original New Game
   construction/resize operation. Reuse the original frontend objects and static
   descriptors, then repeat the scenario. This characterizes reset behavior;
   it does not invent a hardware reset switch.

The script repeats the entire process from a fresh container and compares PCM,
frame hashes, observation rasters, circuit telemetry, input timestamps, and HIT
traces separately for each epoch. `tools/reference/analyze.py` exits nonzero if
behavioral assertions or those repeat comparisons fail.

Qualification also requires complete media for each declared epoch, independently
of telemetry reaching the recreate action. For the 16-second replay, video must
start and finish within one nominal frame of the epoch boundaries, contain
approximately 960 frames (±2), retain contiguous frame indices, and maintain
60 Hz cadence within 1%. Original Pong measures approximately 60.055 Hz. PCM must
contain 768,000 samples within ±4 samples; the native initialization emits two
extra samples in this baseline. A six-second video or thirteen-second PCM stream
fails even if scores, contacts, and final telemetry still exist.

Every recorded input must also match `tests/replays/pong.tsv`: requested timestamp,
action, integer value, row order, and multiplicity. This includes both paddle
events sharing the 10-second timestamp. Applied-time skew is checked separately.
Keeping only the final recreate log row cannot qualify a capture.

HIT is `B2.8` in the original Pong circuit. One physical contact spans several
raster scan lines, so pulses separated by less than 100 ms form one contact
episode. Two pulses do not establish a rally: the assertions require two
episodes and rendered horizontal velocity reversals around each. Scores are
decoded from original `C7`/`D7` decade counters and `C8` tens outputs. Paddle and
ball observations use a 160×120 grayscale sample of the native framebuffer;
snapshots retain the full native viewport.

## Measured baseline

The first complete run (legacy line) passed all checks in all four epochs:

| Observation | Result |
| --- | --- |
| Native frames per 16-second epoch | 960 |
| First contact, right paddle | 3.220800175920 seconds; 4 rising HIT pulses |
| Second contact, left paddle | 5.314627885440 seconds; 4 rising HIT pulses |
| Rendered horizontal velocity at first contact | approximately +50.6 to −51.5 observation pixels/second |
| Rendered horizontal velocity at second contact | approximately −50.8 to +51.6 observation pixels/second |
| Maximum combined score before coin restart | 2 |
| Requested/applied input skew | 0 ps in this scenario |
| Native PCM per epoch | 768,002 signed 16-bit mono samples at 48,000 Hz |
| Active PCM range / transitions | 1,000–17,000 / 284 changes |
| Fresh-process comparisons | identical for each corresponding epoch |

Fresh and recreated epochs produced identical PCM, but their complete frame
streams and initial telemetry differed. Both passed the same settled behavioral
checks. The original frontend retains video fields and game descriptions contain
mutable static data; startup equivalence must not be claimed from this result.
The portable core defines its own cold reset instead (see
[PORT_PONG.md](PORT_PONG.md)).

The first fresh frame recorded inherited OpenGL error 1281 (`GL_INVALID_VALUE`)
at 16,652,246,960 ps. The original renderer initially configures projection with
zero scan bounds. The adapter records and clears preexisting errors before its
own frame reads, then treats read errors as failures. Recreated epochs recorded
no preexisting GL errors in this run. These observations are retained in
`renderer-errors.csv` and the report.

## Artifacts and limits

`build/reference/report.json` is the aggregate assertion report. Under each
`baseline/epoch0`, `baseline/epoch1`, `repeat/epoch0`, and `repeat/epoch1`:

- `evidence.json`: checks, observations, statistics, hashes, and inherited GL errors.
- `audio.wav`: real native generated PCM; `audio.s16le` is its raw source.
- `*ms.ppm`: native snapshots at 250, 1000, 2000, 3000, 6000, 13000, and 15000 ms.
- `frames.csv` / `frames.gray`: native frame timestamps/hashes and observation raster.
- `positions.csv`: paddle/ball coordinates derived from native pixels.
- `telemetry.csv`: scores, run/attract outputs, and rising HIT pulse count.
- `inputs.csv`: requested/applied simulation timestamps and external input values.
- `collisions.csv`: native HIT output transitions.
- `renderer-errors.csv`: preexisting native OpenGL errors.

The aggregate report records the NoCPU version, original source-archive hash,
replay hash, adapted binary hash, adapter diff hash, native binary record, capture
image ID, and copied toolchain provenance. These identify the measured build
when reporting a later regression.

`make test` runs ROM-free regression tests for these qualification gates.
After native capture, the capture script additionally runs
`tests/test-reference-analysis.py --reference-dir build/reference`, which tests
the healthy capture and mutates isolated copies under ignored
`build/audit-reference/`. The regression cases truncate actual video/PCM and
remove, change, duplicate, or reorder recorded input rows. They preserve the
original capture and require each altered copy to fail the appropriate gate.

CI uploads reports, CSVs, WAVs, PPM snapshots, and the adapter diff. It excludes
copied source, executables, object files, and raw working buffers.

SDL dummy playback avoids an audio-device dependency. The sample tap proves
native sound generation; it does not verify audible speaker output, the SDL
callback's wall-clock behavior, or physical hardware accuracy. Injected controls
exercise the original circuit input conversion, but not physical keyboard,
mouse, or joystick devices. Repeat equality applies to the pinned native
toolchain/renderer, not every operating system or future WebAssembly rendering.
This reference is the baseline for the portable comparisons, not a claim that
DICE has been validated against a physical Pong board.
