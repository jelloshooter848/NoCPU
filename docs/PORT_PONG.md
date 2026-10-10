# Pong platform adaptation

The portable target is the original DICE 0.9 Pong circuit, its digital/analog
chip definitions, and the original scheduler. It does not reproduce Pong's
behavior in JavaScript. The browser hosts display, controls, pacing, and PCM
delivery around the same C++ core used by the headless native runner.

[`tools/prepare-core.py`](../tools/prepare-core.py) starts from the audited
historical directory and writes a separate build copy. The generated
`adapter.diff` records every changed or added file; `sources.txt` records
compiled circuit sources. Preparation fails if an exact insertion point has
changed. Files in the historical directory are never patched in place.

| File or boundary | Adaptation | Preserved behavior |
| --- | --- | --- |
| `settings.h`, `game_config.h`, `realtime.h` | A portable subset of host settings; original default Pong DIP; no host configuration files or wall-clock wait | Original settings fields read by the compiled circuitry; sample rate 48000 Hz and reference volume 500 |
| `chips/input.h` and hardware-acquisition portion of `chips/input.cpp` | Held coin/axes supplied through the ABI; hardware discovery removed | Original input chip logic, 10 ms polling, absolute-joystick conversion, and timer-resistance updates |
| `chips/audio.cpp` | Capture synthesized samples through the ABI; remove SDL initialization, callbacks, locking and device shutdown | Original audio graph, sample timer, TTL voltage conversion, gain, and signed 16-bit sample arithmetic |
| `chips/video.cpp` and `chips/video.h` | Replace OpenGL presentation with a 576 × 432 software frame; remove presentation busy-wait | Original VIDEO buffer delays, scanline/frame timing, color lookup, progressive scan and video signal transitions |
| `circuit.cpp` and `chip.cpp` | Register chip outputs, observe HIT transitions and initialize the null logic pointer for supply chips | Original circuit construction, scheduler, optimization and chip logic |
| `circuit_desc.h` | Check iterator bounds before reading an entry type | Same valid netlist entries; avoids an inherited one-past-end read exposed by AddressSanitizer |
| `games/pong.cpp` | Add restoration of seven mutable descriptor objects before each construction | Original netlist, resistor/capacitor values, default winning score and wiring |
| `core/api.cpp` | Singleton ownership, bounded stepping, frame/PCM queues and exact-time observation | Original circuit execution inside requested simulation deadlines |

Pong has no overlay, rotation or game ROM dependency. Its original OpenGL
renderer submits quads with float vertex coordinates. The software adapter
keeps that coordinate precision and converts their coverage to pixel centers
in the same fixed reference viewport. Raster comparison is a validation gate;
this implementation description alone is not evidence of pixel equality.
Initial zero scan bounds and resolution changes can clear presentation buffers
before the first settled frame, so comparisons report startup and settled
output separately.

DICE stores paddle positions and 555 resistances in static descriptors. A new
portable machine restores both paddle descriptors, four monostable 555
descriptors and the winning-score DIP descriptor. This intentionally supplies
fresh-machine reset semantics. The 0.1.0 native application recreation retained
some static state; its second epoch is a characterization of that inherited
lifecycle and is not the portable reset baseline.

The original `Chip` constructor left `custom_update` uninitialized for VCC and
GND supply chips. `Chip::connect` reads this field to recognize the deoptimizer.
After destruction, allocator reuse could give a supply chip the previous
deoptimizer's function pointer, suppress its input connections, and stop video
and gameplay in the next machine. The prepared copy initializes this pointer
to null. An optimized native two-epoch replay then matches the fresh baseline
for full frames, observation rasters, PCM, telemetry, inputs and HIT transitions;
the historical source remains unchanged.

The seed is supplied consistently for native/Wasm runs. The compiled Pong
circuit has no call to `rand()`; the archive's calls belong to Anti-Aircraft and
Steeplechase, which are outside this target. Different glibc/musl random-number
implementations therefore do not alter this Pong replay. Other games will need
their own determinism and reset assessment when introduced.

The ABI exposes integer microseconds for bounded calls and split 64-bit
picosecond values for observations. Each call tracks a requested deadline and
uses slices of at most 1 ms. The original scheduler advances through the first
queued event at or beyond the requested boundary; the adapter records that
overshoot without changing queue execution. JavaScript never supplies
picosecond deadlines as floating-point `Number` values.

The frame pointer and audio/collision pointers remain module-owned. Hosts copy
media before the next modifying call, drain bounded queues each tick, and pause
by stopping advances. Device playback remains a host responsibility: a PCM
capture verifies generated samples, while real-device tests verify audibility
and interruptions. See [the core boundary](../core/README.md) and
[0.2.0 validation](0.2.0_VALIDATION.md) for ownership and measured limits.
