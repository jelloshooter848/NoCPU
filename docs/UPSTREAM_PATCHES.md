# Upstream patch ledger

`upstream/dice-0.9/` is the exact 566-file import identified in
[`PROVENANCE.md`](PROVENANCE.md). No archival source file is patched. Every
adaptation is applied by a script to a generated copy under ignored `build/`,
and each script writes its complete text diff there.

| Change | Location | Purpose / fidelity impact |
| --- | --- | --- |
| Import DICE 0.9 | `upstream/dice-0.9/` | Preserve original reference bytes; SHA-256 checked for every file |
| Root GPL text and supplemental dependency notices | `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/licenses/` | Attribution and distribution documentation; no runtime change |
| Native reference build | `tools/build-native.sh`, generated `build/native/` | Build a fresh copy with the unchanged original Makefile in the isolated historical compiler/Qt/SDL toolchain; no source patch or extra compiler flags |
| Instrumented reference adapter | `tools/reference/apply_adapter.py`, generated `build/reference/` | Deterministic input and observation for replay measurements; a separately identified instrumented build |
| Portable core adapter | `tools/prepare-core.py`, `core/`, generated `build/core/source/` | Replace Qt/SDL/OpenGL host access with owned display/input/audio boundaries, expose the bounded native/Wasm ABI, initialize the supply-chip `custom_update` pointer, bounds-check descriptor iteration, and append per-game restoration of mutable descriptors for a fresh-machine reset. Details in [PORT_PONG.md](PORT_PONG.md) |
| Six-circuit and ROM support | `tools/prepare-core.py`, `core/platform/portable_rom.cpp`, `core/platform/rom_session.h`, `core/api.cpp` | Compile Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle and Indy 4 and their chips; exact-descriptor, core-owned ROM lookup; cold descriptor restoration and original DIP/potentiometer configuration. No archive parsing, network ROM fetch, netlist rewriting or replacement audio |
| Registered games (0.2.0) | `core/games/<id>.inc` (appended to the prepared `games/<id>.cpp`), `core/games/<id>.cpp`, `core/game_registry.h`, `core/api.cpp`, `core/platform/settings.h`, `core/platform/portable_input.cpp`, `tools/prepare-core.py` | Each game's descriptor-restoration code lives in its own `.inc` file (the six earlier snippets moved there from `prepare-core.py` with a byte-identical adapter diff). Registered games are configured by original descriptor name and reached through held joystick left/right switches (new keyboard scancodes, released by default exactly like unassigned switches) and per-slot joystick buttons for `BUTTONSn_INPUT`. Chips 7492 and 9321 are compiled for Crossfire. Rebound, Quadrapong and Crossfire need no source edit; Gotcha needs one (next row). No netlist, chip logic or scheduler change |
| Registered games (0.3.0) | `core/games/<id>.inc`, `core/games/<id>.cpp`, `core/game_registry.h`, `core/api.cpp`, `tools/prepare-core.py`, `tools/build-core.sh` | TV Basketball, Pin Pong and Hi-Way need no source edit. Chips 74151, 74155, 7454 (TV Basketball), 9314 (Pin Pong), 2533, 7442 and the wired-logic chips (Hi-Way) are compiled; `prepare-core.py` maps the DICE ID `hiway` to its circuit file `games/highway.cpp`. Hi-Way's `HighwaySpeedDesc` has `const` members, so its cold reset zeroes its two capacitor voltages in place, and its wheel queues are cleared in place as Indy 4's are. A registered game may declare a portrait raster (Pin Pong's `VIDEO_ORIENTATION(ROTATE_90)`, checked at creation) and wheel slots. The Wasm memory limit is raised from 256 MiB to 2 GiB (growth on demand) because Pin Pong's original `OPTIMIZATION_HINT` tables need about 590 MB; the circuit, chips and scheduler are unchanged |
| Gotcha PROXIMITY capacitor (0.2.0) | `tools/prepare-core.py` (edit of the prepared `games/gotcha.cpp`), `core/games/gotcha.inc` | The custom `PROXIMITY` chip keeps its capacitor voltage in a function-local `static double v_cap`, which survives in-process machine re-creation, so a portable reset could start with the previous machine's voltage. The derived copy moves that one variable to file scope as `nocpu_gotcha_proximity_v_cap` (same type, same `0.0` constant initializer; the function now binds `double& v_cap` to it, so every use and every arithmetic step is unchanged) and `nocpu_reset_gotcha_descriptors()` zeroes it with the other cold descriptors. A fresh process, as the original runs each reference epoch, behaves identically before and after the edit. Validation: both reset epochs of every Gotcha scenario are byte-identical (frames, PCM, telemetry, events including the E8 proximity tone) and match the original. Without the edit the stale value would be forgotten within about 5.5 ms of attract (the RC is 150 µs) while the tone astable is held in reset, so no scenario output differs; the edit makes the cold reset exact rather than relying on that. Original code by the DICE authors (GPL-3.0-or-later), adapted for NoCPU |
| Portable renderer rasterization (0.1.1) | `core/platform/portable_video.inc` (`Video::draw` scanline quads and `Video::draw_quad` for rotated games and overlays), `tools/reference/check-config-isolation.py` | Reproduce the reference's Mesa 20.0.8 llvmpipe rasterization of DICE's `GL_QUADS`.<br>- The ortho scale is `2.0F/(right-left)` in float, as `_math_matrix_ortho` computes it after `_mesa_Ortho` casts the bounds to GLfloat.<br>- The vertex transform stays unfused.<br>- The viewport is applied as one fused multiply-add (`llvm.fmuladd`), in absolute coordinates of the 632×432 client window.<br>- y is mapped directly to the `Y_0_TOP` window (negated scale, `fb_height-(y+h/2)` translate).<br>- Vertices snap to the 1/256-pixel grid with ties to even.<br>- The fill rule is `bottom_edge_rule`: left and bottom edges are inclusive, so a pixel center on a horizontal edge belongs to the scanline above.<br>GL probes in the pinned image match every pixel: every v_size 1–600, random scanline times, clipped quads, and boundary-critical and pixel-center-tie times at the ROTATE_0 and Breakout ROTATE_90 geometries.<br>llvmpipe enables no guard band, so quads past the viewport are clipped and the new vertices get unfused window coordinates (`draw_pipe_clip.c`). For DICE geometry this changes no pixel: the clipped x is exactly the viewport edge, and clipped y could differ only at v_size ≥ 1271.<br>The reference depends on host FMA: llvmpipe fuses only on CPUs that have it. The isolation check records `host_cpu_fma` in `container-environment.json` and refuses captures without it. See [bug report](../bug-reports/2026-10-13-indy4-row213-scanline.md). |
| Speed (0.4.0) | `tools/prepare-core.py`, `core/platform/portable_video.inc`, `core/api.cpp`, `tools/build-core.sh` | NoCPU's own adapter code only; no DICE logic changes. The progressive VBLANK `glClear` replacement writes whole opaque-black pixels (`Video::clear_back`, identical bytes). The rotated-raster rasterizer prepares each quad's two triangles once and finds the covered pixel centres of each row or column by exact integer division of the same edge functions (identical coverage, checked against the per-pixel test). The output-transition hook skips chips that no observation names. The Wasm build uses WebAssembly exception handling instead of Emscripten's JavaScript emulation. The portable native runner gives byte-identical output to v0.3.0 for every scenario, and the full comparison passes ([PERFORMANCE.md](PERFORMANCE.md)) |
| Pin Pong sound and free-game select, reconstructed (0.4.0) | `core/games/pinpong_sound.{h,cpp}`, `core/games/pinpong.cpp`, `core/game_registry.h`, `core/api.cpp`, `tools/prepare-core.py` (derived layout in the prepared `games/pinpong.cpp`) | The first opt-in exception to "only what DICE implements" (owner decision 2026-10-18); DICE marks both `TODO`. Reconstructed from Atari's TM-007 Rev G schematic, drawing 001660 sheet 3 (<https://archive.org/details/ArcadeGameManualPinpong>, linked only), with the MC3340P and NE566 data sheets; no cabinet recording was used. **Sound:** a NoCPU sound-board model (NE566 VCO pitched by the D9 object latches through R45–R48 and the TONE trimmer R41, MFC6040 attenuator with the C33/Q5 decay) fed by the read-only observation hook from F1.9, D9-2.9, D9-2.5, D9-1.5, C8.3 and D8.8; it writes PCM at DICE's 48 kHz sample instants after the AUDIO constructor sample, never drives a pin and adds no scheduler event, so the netlist, chips and event queue are unchanged. Deterministic double arithmetic without libm (native and Wasm byte-identical). **Free game:** the default ("no free game", DICE's VCC on B5.4) builds the original layout unchanged; a non-default jumper choice builds `circuit_pinpong_free_game()`, a copy of the original layout text in which one NoCPU chip (jumper choice plus the C5 pins 9/10→8 NAND, 7400 delays, created first) drives B5.4 from C6 pins 12/9/8/11. Validation: the default scenarios still match original DICE byte for byte apart from the PCM, which is compared native↔Wasm and checked against the schematic-derived pitch, decay, trigger and silence ([PINPONG_SOUND.md](PINPONG_SOUND.md)). Original code by the DICE authors (GPL-3.0-or-later), adapted for NoCPU |
| Observation lifetime repair | `tools/prepare-core.py`, `tools/reference/apply_adapter.py` | Unregister observed chips before original pruning deletes them, and fail closed when a required pin is unavailable. Stunt Cycle GOOD_JUMP observes the logical inverse of live K7.6 instead of the deleted K7.5 output. Changes observation ownership, not the scheduler or netlist |

## Reference adapter

The reference adapter requires an exact single match for each source insertion
and writes its complete diff to `build/reference/adapter.diff`. It changes only
the generated build copy:

- `main.cpp`: select a recorded random seed, drive replay input/observation, and
  advance to a replay deadline using integer simulation time.
- `circuit.cpp`: register existing chip names, output pins, and pointers for
  read-only observation.
- `chip.cpp`: observe original output transitions for the selected trace pin.
- `chips/input.cpp`: supply recorded keyboard/joystick state through the original
  input methods.
- `reference_games.inc` and `reference_games/<id>.inc`: the per-game original
  observations of games ported from 0.2.0 on, copied from
  `tools/reference/games/` and included by the driver.
- `chips/audio.cpp`: tap the original PCM samples before SDL buffering.
- `chips/video.cpp`: capture the original OpenGL back buffer before swapping.
- Add `reference_api.h` and `reference_driver.cpp` to that generated copy.

The adapter does not change game descriptors, netlists, chip truth tables or
the event-queue algorithm. A fixed seed, input schedule, observation hooks and
changed run boundaries distinguish this instrumented executable from the
untouched native executable; comparisons record those settings. Frame capture
and PCM taps are evidence of generated output, not of display, speaker,
complete gameplay or hardware fidelity.

## Portable core adapter

The portable adapter records its own `adapter.diff` and compiled-source
inventory under `build/core/`. It keeps the netlists, chip logic and integer
event scheduler. Two inherited defects are repaired in the generated copy only:
the null-description VCC/GND supply chips get a null `custom_update` pointer
(fixing an allocator-dependent failure of repeated machines), and descriptor
iteration is bounds-checked before reading an entry. Each compiled game gets an
appended function that restores its mutable static descriptors, so a new
machine starts cold. Gotcha's one function-local mutable static (the
PROXIMITY capacitor voltage) is moved to file scope so that restoration can
reach it. [PORT_PONG.md](PORT_PONG.md) explains each adaptation and
[core/README.md](../core/README.md) the resulting ABI.

## Other references

The original source was compared with DirtBagXon/DICE revision
`742e8b48c38138491c55e85cd3c4f7342d641a6f`. Its desktop dependency migrations,
alignment change and other differences are reference findings, not imported
patches. Modernization must remain explicit outside the archival tree.

Future adaptations record their exact tool/path, changed files, reason,
validation and fidelity implications here. Generated instrumentation is a
different executable from the untouched native reference and must be
identified as such in any reported result.
