# Profiling and performance (0.4.0)

This page records how NoCPU's speed was measured and profiled for the 0.4.0
milestone, what was found, what was changed, and what each change gained. Speed
is reported, never gated: no test or CI job fails on it
([TESTING.md](TESTING.md#simulated-time-not-host-speed)). Every change here
keeps the original/native/Wasm comparisons exact
([ACCEPTANCE.md](ACCEPTANCE.md#040-part-1-profiling-and-performance--2026-10-19)).

## Terms

- **Real-time speed** is simulated circuit time divided by wall-clock time: 1.00
  is full speed.
- **Paced** is what a player gets: the page's own worker clock running the game
  for 5 wall seconds.
- **Raw** is the worker's held debug clock stepped as fast as it goes, through
  the same slice path as play. The two differ by what the pacing loop loses.
- **Core** is the Wasm module alone in a dedicated worker, with no app around it.
  It separates the engine's and the core's speed from app overhead.

## Host and browsers

- **Host:** a 4-vCPU cloud x86-64 host whose CPU reports itself as
  "Intel(R) Xeon(R) Processor @ 2.80GHz" (the 0.3.0 tables in ACCEPTANCE.md were
  measured on a 4-vCPU Xeon reported as 2.1 GHz, so those numbers do not carry
  over), with Node 22.22.0.
- **Browsers:** Playwright 1.58.2's headless builds of Chromium 145.0.7632.6,
  Firefox 146.0.1 and WebKit 26.0, plus Mozilla's release Firefox 146.0.1
  (`firefox-146.0.1.tar.xz`, SHA-256 `36a4dc0e…f37f8dd`, equal to Mozilla's
  published SHA256SUMS) driven through WebDriver BiDi. That build is listed as
  "firefox-release".
- **Measurement order:** before-and-after numbers were measured on the same
  host, one measurement at a time, with no other heavy job running.

## Tools

```sh
make web-preview                                   # or: npm run build, then package
node tools/measure-speed.mjs                       # all games, Chromium/Firefox/WebKit, app mode
node tools/measure-speed.mjs --mode app,core --rom-dir build/roms \
  --engines chromium,firefox,webkit,firefox-release --firefox-release /path/to/firefox/firefox
node tools/measure-speed.mjs --table build/perf/speed-<stamp>.json   # print a saved run's table
node tools/bench-core.mjs --scenario hiway-default --module build/core/wasm/nocpu.js
```

### tools/measure-speed.mjs

`tools/measure-speed.mjs` serves a packaged site (default `build/pages`, on
port 4673 unless `--port` is given) or uses `--base-url`. For each engine and
game it opens a fresh `?debug` page and does the following:

1. Starts the game and lets its first simulated second run paced.
2. Holds the clock and puts the game into play:
   - inserts a coin and presses Start;
   - Pin Pong: presses Start a second time to serve;
   - Breakout: presses Serve;
   - Hi-Way: holds the accelerator;
   - ROM games: imports the ROMs from `--rom-dir` first.
3. Measures raw speed over 2 simulated seconds, in requests sized to about
   half a wall second each.
4. Releases the clock and measures paced speed over 5 wall seconds.

It repeats this (`--repeats`, default 3) and reports the median, writing every
run to `build/perf/speed-<stamp>.json` after each measurement (`--resume 1`
continues a run). Core mode times the Wasm module alone in the same engines.

### tools/bench-core.mjs

`tools/bench-core.mjs` replays one ROM-free scenario's recorded inputs through
the Wasm core in Node and reports speed for each 10-second window of simulated
time. This is how heavy stretches of real play show up (Hi-Way is much heavier
while driving than at the start of a game).

Neither tool checks any output; the comparisons do.

### Profiling

Profiling used these tools:

- `perf record` on a native build of the core (the portable sources with
  `-O3 -g`) driven through the ABI;
- `node --cpu-prof` on a Wasm build linked with `--profiling-funcs`;
- the Gecko profiler (`MOZ_PROFILER_STARTUP`) in Firefox;
- small differential harnesses, which are described with the change they
  check.

## What was found

### The pacing loop lost a third of the worker's time

`web/src/core.worker.ts` advances the circuit for an 8 ms CPU budget per tick.
When the circuit was behind real time, it scheduled the next tick with
`setTimeout(…, 0)`. Browsers clamp nested timeouts to at least 4 ms, so a
worker that could not keep up still idled for about a third of every tick.
Paced speed was capped near 0.7 of raw speed. For example, Chromium Breakout
ran paced 0.88 with raw 1.54, and Pin Pong 0.51 with raw 0.76.

### C++ exceptions were emulated in JavaScript

The core was built with `-fexceptions -sDISABLE_EXCEPTION_CATCHING=0`, that is
Emscripten's JavaScript exception emulation. Every call that could unwind
through a destructor went through an `invoke_*` JavaScript trampoline.
`Chip::update_output` is one such function: NoCPU's output-observation object
in it has a destructor. These trampolines took about 10% of Hi-Way's time in V8.
Exceptions are caught only at the ABI boundary (allocation failures while a
circuit is built or ROMs are staged).

### NoCPU's frame clear and rotated rasterizer were hot

- **Frame clear:** the VBLANK `glClear` replacement in `tools/prepare-core.py`
  cleared the 1 MB RGBA back buffer one byte at a time with an `i%4` test, once
  per frame. That is 43% of Pong's native time and 9–12% of the heavy games'.
- **Rotated rasterizer:** the rotated-raster rasterizer
  (`core/platform/portable_video.inc`, `Video::draw_quad`) tested every pixel
  centre of a conservative box against two triangles, setting up each triangle
  again for each centre. With Pin Pong's portrait raster that was 23% of its
  native time.
- **Output hook:** the output-transition hook (`~NoCPUOutputObservation`)
  scanned more than 30 observation slots on every output change of every chip
  (3–6%).

### Most of the rest is DICE's scheduler

`Chip::activation_check`, `update_output`, `update_inputs`,
`deactivate_outputs`, `wake_up` and `Circuit::queue_push` take 60–90% of the
heavy games' time, about 89% for Hi-Way while driving. That is the original
event scheduler with its `OPTIMIZATION_HINT` machinery. Its hottest loop scans
a chip's input-event history and is bound by memory latency (perf annotate: the
top instructions are the event-time loads).

### Playwright's Firefox runs WebAssembly without its optimizing compiler

Playwright's Firefox build ran every game four to five times slower than
Chromium, Pong included (core alone: Pong 1.09, Hi-Way 0.28). The cause is the
engine build, not NoCPU:

- with `javascript.options.wasm_baselinejit` off, it reports "no WebAssembly
  compiler available": only the baseline compiler exists there;
- a plain integer Wasm loop ran nine times slower than in Chromium;
- Mozilla's release Firefox 146.0.1 ran the same loop faster than Chromium, and
  the core alone at Chromium's speed (Pong 6.30, Hi-Way 1.38 before any change).

The "Firefox cases" of 0.3.0 (Gotcha, TV Basketball, Breakout and Pong at
0.93) were therefore mostly measurements of Playwright's Firefox build. Its
numbers are still reported, as that build is what CI runs, but they do not
represent Firefox users.

## Changes and gains

Each change keeps the circuit, the scheduler order, integer picosecond time,
video and PCM exactly as before; the evidence is listed with each.

| Change | Where | Gain (measured on this host) | Exactness evidence |
| --- | --- | --- | --- |
| Pacing: when behind real time, the next tick runs through a `MessageChannel` as soon as queued messages are handled; a caught-up circuit still waits 8 ms | `web/src/core.worker.ts` | Paced speed now about equals raw speed. Chromium, old core: Pin Pong paced 0.51 → 0.73, Hi-Way 0.42 → 0.68, Breakout 0.88 → 1.00, Stunt Cycle 0.74 → 0.91 | Browser only: the core, its slices and simulation time are unchanged, and pacing never enters a comparison; browser suites pass |
| Wasm exception handling (`-fwasm-exceptions`, system libraries `libc++-except`, `libc++abi-except`, `libunwind-except`, `libcompiler_rt-wasm-sjlj`) instead of JavaScript emulation | `tools/build-core.sh` | Node, core: Breakout 1.29 → 1.93, Hi-Way 1.71 → 1.95, Pin Pong 1.09 → 1.20, Pong 9.7 → 10.3 | Full original/native/Wasm comparison; a standalone check that a `bad_alloc` thrown under destructors is caught and unwinds with the flags |
| Frame clear writes whole opaque-black pixels | `tools/prepare-core.py`, `Video::clear_back` in `core/platform/portable_video.inc` | Pong native 5.8 → 10x; 5–10% on heavy games | Identical bytes by construction; native runner output identical to v0.3.0 |
| Rotated quads: both triangles prepared once per quad; each row or column of the box gets its covered pixel centres by exact integer division of the same edge functions | `core/platform/portable_video.inc` | Pin Pong native 1.29 → 1.53x (draw cost 28% → 16% plus 6%) | A differential harness compared the new coverage with the 0.3.0 per-pixel test over about 5×10⁹ pixel centres of 1.2–2.3 million random, near-axis-aligned, degenerate and self-intersecting quads, in both walk directions: identical. Native runner output identical to v0.3.0 |
| Output hook: one short scan of the observed chips before anything else | `core/api.cpp` | 2–4% | Same records in the same order; native runner output identical to v0.3.0 |

### Not adopted

- **LTO:** about 2% on the heavy games (15% on Pong, which was already real
  time).
- **`-msimd128`:** no gain.
- **Removing DICE's write-only `loop_count` statistics counters:** no
  measurable gain.
- **Bulk-memory:** about 1% (`__emscripten_memcpy_js`), not worth another set of
  system libraries.

Threads and `SharedArrayBuffer` were not considered, as the milestone requires:
the single-threaded baseline is what this page records. Threads would also not
speed up one circuit's sequential event loop.

## Results

RESULTS-TABLES

## What remains

REMAINING
