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

- **Hosts:** two 4-vCPU cloud x86-64 hosts, with Node 22.22.0.
  - Profiling and the per-change gains below were measured on one whose CPU
    reports "Intel(R) Xeon(R) Processor @ 2.80GHz".
  - A container restart then moved the work to a host reporting "@ 2.10GHz":
    the CI-class host of the 0.3.0 tables. The final before-and-after tables
    were both measured there.
  - The 2.8 GHz baseline is kept in `build/perf/` evidence and is not compared
    with the 2.1 GHz results.
- **Browsers:** Playwright 1.58.2's headless builds of Chromium 145.0.7632.6,
  Firefox 146.0.1 and WebKit 26.0, plus Mozilla's release Firefox 146.0.1
  (`firefox-146.0.1.tar.xz`, SHA-256 `36a4dc0e…f37f8dd`, equal to Mozilla's
  published SHA256SUMS) driven through WebDriver BiDi. That build is listed as
  "firefox-release".
- **Measurement order:** each before-and-after pair was measured on the same
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

| Change | Where | Gain (2.8 GHz host) | Exactness evidence |
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

Measured on the 2.1 GHz host, Playwright 1.58.2. Each entry is the median of
three runs: paced / raw for the app, then the core alone. The tables come from
`tools/measure-speed.mjs --table` on `build/perf/baseline21-speed.json` and
`build/perf/after-speed.json`. Paced 1.00 means the game runs at full speed; a
paced value below raw for a fast game only shows that pacing holds it at real
time. Stunt Cycle and Indy 4 used the private ROM fixtures.

### Before: v0.3.0 (runtime `e25a51b7…`)

| Game | chromium 145.0.7632.6 paced / raw | chromium 145.0.7632.6 core raw | firefox 146.0.1 paced / raw | firefox 146.0.1 core raw | webkit 26.0 paced / raw | webkit 26.0 core raw | firefox-release 146.0.1 paced / raw | firefox-release 146.0.1 core raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pong | 1.00 / 6.14 | 7.10 | 0.89 / 1.12 | 1.28 | 1.00 / 7.27 | 7.69 | 1.00 / 6.87 | 6.42 |
| pongdoubles | 1.00 / 5.96 | 6.20 | 0.92 / 1.12 | 1.18 | 1.00 / 5.85 | 7.13 | 1.00 / 6.12 | 5.56 |
| spacerace | 1.00 / 2.61 | 2.33 | 0.36 / 0.46 | 0.44 | 1.00 / 2.33 | 2.49 | 1.00 / 2.45 | 2.34 |
| breakout | 0.99 / 1.76 | 1.30 | 0.22 / 0.30 | 0.24 | 0.88 / 2.14 | 1.46 | 1.00 / 1.81 | 1.32 |
| stuntcycle | 0.91 / 1.27 | 1.30 | 0.26 / 0.31 | 0.32 | 0.73 / 1.33 | 1.41 | 0.96 / 1.27 | 1.36 |
| indy4 | 1.00 / 3.44 | 5.07 | 0.49 / 0.70 | 0.69 | 1.00 / 2.73 | 4.73 | 1.00 / 3.44 | 4.49 |
| rebound | 1.00 / 7.77 | 7.87 | 0.94 / 1.45 | 1.36 | 1.00 / 7.27 | 7.23 | 1.00 / 7.55 | 6.69 |
| gotcha | 1.00 / 1.85 | 1.64 | 0.31 / 0.43 | 0.40 | 0.90 / 2.29 | 1.78 | 1.00 / 2.03 | 1.86 |
| quadrapong | 1.00 / 5.13 | 3.82 | 0.71 / 0.93 | 0.86 | 1.00 / 4.31 | 4.59 | 1.00 / 4.26 | 4.79 |
| crossfire | 1.00 / 6.14 | 5.36 | 0.66 / 0.95 | 0.83 | 1.00 / 5.75 | 5.49 | 1.00 / 5.12 | 4.88 |
| tvbasketball | 0.99 / 1.83 | 1.69 | 0.28 / 0.35 | 0.36 | 0.93 / 1.99 | 1.84 | 1.00 / 1.73 | 1.65 |
| pinpong | 0.70 / 1.02 | 1.14 | 0.15 / 0.17 | 0.17 | 0.55 / 1.12 | 1.16 | 0.72 / 1.01 | 1.06 |
| hiway | 0.46 / 0.77 | 1.04 | 0.18 / 0.24 | 0.22 | 0.43 / 0.89 | 1.09 | 0.47 / 0.84 | 1.04 |

### After: 0.4.0 part 1 (runtime `99a3f9f9…`)

| Game | chromium 145.0.7632.6 paced / raw | chromium 145.0.7632.6 core raw | firefox 146.0.1 paced / raw | firefox 146.0.1 core raw | webkit 26.0 paced / raw | webkit 26.0 core raw | firefox-release 146.0.1 paced / raw | firefox-release 146.0.1 core raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pong | 1.00 / 12.76 | 15.93 | 1.00 / 2.84 | 2.90 | 1.00 / 10.47 | 12.79 | 1.00 / 11.70 | 11.99 |
| pongdoubles | 1.00 / 10.25 | 11.61 | 1.00 / 2.47 | 2.78 | 1.00 / 9.17 | 11.39 | 1.00 / 10.00 | 9.75 |
| spacerace | 1.00 / 3.59 | 3.28 | 0.67 / 0.71 | 0.66 | 1.00 / 3.32 | 3.08 | 1.00 / 3.14 | 2.99 |
| breakout | 1.00 / 3.10 | 2.28 | 0.42 / 0.47 | 0.35 | 1.00 / 2.24 | 1.85 | 1.00 / 2.47 | 2.33 |
| stuntcycle | 1.00 / 2.21 | 2.40 | 0.45 / 0.44 | 0.41 | 0.99 / 2.06 | 2.14 | 1.00 / 1.94 | 2.34 |
| indy4 | 1.00 / 5.34 | 11.14 | 0.96 / 1.02 | 1.08 | 1.00 / 4.82 | 10.68 | 1.00 / 3.96 | 8.21 |
| rebound | 1.00 / 12.22 | 14.44 | 1.00 / 3.32 | 3.14 | 1.00 / 10.99 | 12.99 | 1.00 / 12.12 | 12.72 |
| gotcha | 1.00 / 2.80 | 2.47 | 0.45 / 0.55 | 0.50 | 1.00 / 2.52 | 2.33 | 1.00 / 2.65 | 2.13 |
| quadrapong | 1.00 / 7.73 | 7.53 | 1.00 / 1.74 | 1.55 | 1.00 / 6.17 | 6.47 | 1.00 / 6.49 | 7.39 |
| crossfire | 1.00 / 12.59 | 12.36 | 0.99 / 1.72 | 1.71 | 1.00 / 7.81 | 9.56 | 1.00 / 10.10 | 11.47 |
| tvbasketball | 1.00 / 2.42 | 2.22 | 0.47 / 0.48 | 0.46 | 0.99 / 2.18 | 2.24 | 1.00 / 2.16 | 2.30 |
| pinpong | 1.00 / 1.62 | 1.71 | 0.25 / 0.27 | 0.27 | 0.91 / 1.39 | 1.57 | 1.00 / 1.50 | 1.69 |
| hiway | 0.97 / 1.49 | 1.30 | 0.25 / 0.29 | 0.27 | 0.49 / 0.91 | 1.26 | 0.89 / 0.92 | 1.13 |

Core alone on recorded scenarios (`tools/bench-core.mjs`, Node 22.22.0, first
30 simulated seconds, whole run / slowest 10-second window), before → after:

| Scenario | Before | After |
| --- | --- | --- |
| `pinpong-default` | 0.90 / 0.83 | 1.31 / 1.16 |
| `hiway-default` | 0.59 / 0.50 | 0.70 / 0.57 |
| `tvbasketball-default` | 1.44 / 1.36 | 1.74 / 1.67 |
| `gotcha-default` | 1.95 / 1.90 | 2.48 / 2.39 |
| `breakout-default` | 1.90 / 1.82 | 2.94 / 2.80 |

**Summary of the targets**

- Chromium:
  - Pin Pong, TV Basketball, Gotcha, Breakout and Stunt Cycle now run at full
    speed on this host.
  - Hi-Way reaches 0.97 at the start of play. In heavier driving its core
    falls to about 0.6–0.7.
- Release Firefox 146.0.1:
  - every game except Hi-Way (0.89) is at full speed.
- WebKit:
  - all but Pin Pong (0.91) and Hi-Way (0.49) are at or within 0.01 of full
    speed.
  - WebKit's paced Hi-Way stays well below its raw 0.91. That gap was not
    profiled.
- Playwright's Firefox build:
  - it stays slow (baseline Wasm compiler only), although every heavy game
    is about 1.5 to 2 times faster than before.

### 0.5.0: the ROM-backed batch A games

Measured on the 2.8 GHz 4-vCPU Xeon host (not the 2.1 GHz host above), quiet,
with the private ROM fixtures: `tools/measure-speed.mjs --mode app` and
`--mode core`, three runs each, Playwright's Chromium and a release Firefox
146.0.1.

| Game | chromium 145.0.7632.6 paced / raw | chromium core raw | firefox-release 146.0.1 paced / raw | firefox-release core raw |
| --- | --- | --- | --- | --- |
| antiaircraft | 1.00 / 1.95 | 1.85 | 1.00 / 1.80 | 1.78 |
| sharkjaws | **0.79** / 0.87 | 0.84 | **0.78** / 0.81 | 0.84 |
| jetfighter | **0.79** / 0.78 | 0.80 | **0.75** / 0.80 | 0.77 |
| attack | 1.00 / 17.9 | 17.7 | 1.00 / 18.2 | 17.9 |

Shark Jaws and Jet Fighter run below real time on this host in both
browsers. A native gprof profile of Shark Jaws puts most of the time in
DICE's own scheduler (`Chip::activation_check`, `Chip::update_inputs`, the
event queue), as for Hi-Way; NoCPU's rasterizer takes about 5%. Jet
Fighter's native capture runs at about 1.5x real time, its Wasm core at 0.8x.
Reported to the owner, not optimized in 0.5.0. The figures vary by host: the
independent 0.5.0 review measured them paced in Playwright's Chromium on the
2.1 GHz host at 0.98 (Shark Jaws) and 0.92 (Jet Fighter), still below real
time.

## What remains

- **Hi-Way.** It does not sustain real time while driving on this hardware:
  - its time is about 89% DICE's own event scheduler;
  - even the native core runs `hiway-default` at about 0.8x on the 2.8 GHz
    host.

  An exact restructuring of the scheduler is the only lever left. The owner
  decided on 2026-10-19 to accept the current speed for 0.4.0 and to test
  Hi-Way on their own hardware; a scheduler investigation would be a later
  patch, only if it is slow there ([ROADMAP.md](ROADMAP.md)).
- **Shark Jaws and Jet Fighter** (0.5.0) run at about 0.8x on the 2.8 GHz
  host in Chromium and a release Firefox, for the same reason as Hi-Way.
- **WebKit's paced Hi-Way** (0.49 against raw 0.91) is the one remaining
  pacing gap. It was not profiled.
- **Playwright's Firefox build** cannot reach real time on the heavy games
  until it runs WebAssembly with an optimizing compiler. A release Firefox
  does.
- **Pin Pong's first simulated tenth of a second** builds its large
  `OPTIMIZATION_HINT` tables and takes seconds of wall time (about 16 s in
  Playwright's Firefox). It is a one-time start-up cost, not measured in the
  tables.
- **Threads and `SharedArrayBuffer`** were not needed for any target reached
  here and were not introduced.
