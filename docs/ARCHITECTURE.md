# Architecture and fidelity boundaries

NoCPU runs original DICE 0.9 circuits in desktop browsers. The emulator is the
original C++ circuit scheduler and chip models, compiled to WebAssembly; the
browser only supplies display, controls, pacing and audio delivery around it.
The [roadmap](ROADMAP.md) sets the scope; this page describes the boundaries
that keep the browser build comparable with original DICE.

| Layer | Location | Responsibility |
| --- | --- | --- |
| Original source | `upstream/dice-0.9/` | Byte-identical DICE 0.9 import, checked against [`tests/source-manifest.json`](../tests/source-manifest.json); never built in place |
| Native reference | `tools/build-native.sh`, `tools/reference/`, generated `build/native/` and `build/reference/` | Original Qt4/SDL 1.2 application built from a disposable copy; an instrumented copy captures controlled replays |
| Portable core | `tools/prepare-core.py`, `core/`, generated `build/core/` | The same original circuits with host access replaced by owned display/input/audio/ROM boundaries; one source builds a native runner and a Wasm module. Games ported from 0.2.0 on are described as data in `core/games/<id>.cpp` ([PORT_GAME.md](PORT_GAME.md)) |
| Worker | `web/src/core.worker.ts` | Owns the Wasm module and the simulation clock; steps the circuit in bounded slices and transfers copied frames and PCM |
| Frontend | `web/` | Game picker, Canvas presentation, Web Audio playback, keyboard/mouse input, ROM import, settings and About panel |
| Packaging | `tools/package-web.py`, `tools/package-release.py` | Exact runtime identity, license notices and the matching corresponding-source archive |

The newer [DirtBagXon/DICE](https://github.com/DirtBagXon/DICE) fork is a
reference for dependency modernization, not the authority for fidelity. See
[PROVENANCE.md](PROVENANCE.md) and [UPSTREAM_PATCHES.md](UPSTREAM_PATCHES.md).

## Portable core (ABI 5)

[`tools/prepare-core.py`](../tools/prepare-core.py) writes a disposable copy of
the original source under `build/core/source/` and records its complete
`adapter.diff`. Preparation fails if an exact insertion point has changed. The
chip models, event scheduler and game netlists stay original-derived C++; no
game rules are reimplemented in TypeScript. [PORT_PONG.md](PORT_PONG.md) lists
the platform adaptations.

[`core/nocpu.h`](../core/nocpu.h) defines ABI 5. `core/api.cpp` serves the six
earlier circuits through their own code and every game registered in
`core/games/<id>.cpp` through generic paths, with stable game IDs:

| ID | Game | ROM |
| --- | --- | --- |
| 0 | Pong | none |
| 1 | Pong Doubles | none |
| 2 | Space Race | none |
| 3 | Breakout | none |
| 4 | Stunt Cycle | `stuntcycle.zip`, player-supplied |
| 5 | Indy 4 | `indy4.zip`, player-supplied |
| 6 | Rebound | none (registered, 0.2.0) |
| 7 | Gotcha | none (registered, 0.2.0) |
| 8 | Quadrapong | none (registered, 0.2.0) |
| 9 | Crossfire | none (registered, 0.2.0) |
| 10 | TV Basketball | none (registered, 0.3.0) |

A registered game declares its original DIP switches (by descriptor name,
packed from bit 0), potentiometer range, paddle, joystick, button and Start
counts and the original pins it observes; `nocpu_game_name` and
`nocpu_game_info` expose that contract to tools, and `nocpu_joystick_switches`
and `nocpu_button` reach its digital switches. The original reference has its
own independent per-game description (`tools/reference/games/<id>.inc`), and
the comparison its per-game analysis module (`tools/reference/games/<id>.py`).

The main rules of the boundary, detailed in [core/README.md](../core/README.md):

- One live circuit per module. Create and reset take a seed; game, DIP and
  potentiometer settings are validated before a live machine changes. Reset
  is a cold reboot that restores the original descriptors and keeps the
  selected title, settings and loaded ROM bytes.
- Advance takes integer microseconds (at most 100000 per call) and runs the
  original scheduler in slices of at most 1 ms. Simulation time stays 64-bit
  integer picoseconds inside the core and crosses the boundary as high/low
  words, never as a JavaScript `Number`.
- Frames are top-down opaque RGBA: 576 × 432 for the landscape titles and
  324 × 432 for Breakout's rotated raster. Audio is circuit-generated mono
  signed 16-bit PCM at 48,000 Hz. Frame, PCM, collision and event buffers are
  module-owned and bounded; hosts copy and drain them every tick, and
  overruns are counted rather than hidden.
- ROM bytes arrive through `nocpu_rom_begin`/`nocpu_rom_buffer`/`nocpu_rom_finish`
  into bounded module-owned staging buffers. The core checks exact size and
  CRC32 at finish and again at create. It has no ZIP parser, filesystem or
  network access; the browser reads the player's ZIP. Destroy clears staged
  and live ROM data.
- Inputs are the original cabinet's: absolute paddle axes, digital sticks,
  throttle, relative wheels, held buttons, coin channels and Start switches,
  converted by the original input chips and their 10 ms polling.

## Worker and frontend

The page runs the core in a dedicated single-threaded worker with no shared
memory. The page sends ordered control and input messages; the worker owns the
simulation clock, advances in bounded slices with a capped time debt, and
transfers copied frames and PCM with bounded outstanding output. Canvas
presents the latest frame at the original orientation and aspect; Web Audio
plays the circuit's own samples. Pause and lost visibility stop advancing
rather than accumulating hidden simulation time, and pausing releases held
inputs.

The desktop frontend is deliberately minimal (see the [roadmap
goal](ROADMAP.md#goal)): a game picker, the canvas, keyboard and mouse controls
with per-game help, ROM loading for the ROM-dependent titles, pause/reset,
volume/mute, the game's DIP and potentiometer settings, and an About panel with
DICE credit, license notices, the corresponding-source link and the build
string. ROM ZIPs are read in the browser with the pinned fflate helper, with
output bounds and CRC/size checks against the [game
manifest](../tests/fixtures/game-manifest.json); see [ROMS.md](ROMS.md).

Where a physical control has no direct desktop equivalent (paddles, wheels,
throttles), the frontend maps keys or the mouse onto the same core input and
range. It must not add game rules, synthesize sound or invent control slots the
cabinet did not have. [web/README.md](../web/README.md) describes the frontend
modules.

## Fidelity rules

- Do not replace the simulator with lookalike game logic, or circuit PCM with a
  generic synthesizer. Eight DICE 0.9 titles have no active audio hookup
  ([GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md#audio-and-video-limits));
  the browser discloses that rather than hiding it.
- Presentation clocks never redefine simulation time.
- Establish a single-threaded performance baseline before considering threads
  or `SharedArrayBuffer`; GitHub Pages cannot be assumed to provide
  cross-origin isolation headers.
- Every change to the core is verified by the original/native/Wasm comparisons
  in [TESTING.md](TESTING.md): the original DICE capture against the portable
  native runner, then native against Wasm. Scenarios name their seed, input
  timestamps, settings and toolchain.

## History

The legacy line (versions up to 0.6.0, tag `legacy-0.6.0`) built this core
incrementally: ABI 1 for Pong, ABI 2 for Pong Doubles and Space Race, ABI 3
for Breakout, and ABI 4 for the staged-ROM Stunt Cycle and Indy 4. The restarted
line's ABI 5 (0.2.0) adds the registered-game contract. The legacy frontend
also carried touch controls, phone qualification and Home Screen support,
which the restarted line removes. The per-version contracts and validation
ledgers are in [docs/legacy/](legacy/README.md).
