# Original-derived DICE core

The 0.4.0 core compiles original DICE 0.9 Pong, Pong Doubles and Space Race circuits and the chip scheduler
without Qt, SDL devices, or an OpenGL window. The same generated source builds
as a native evidence runner and an Emscripten module. Historical files under
[`upstream/dice-0.9/`](../upstream/dice-0.9/) remain byte-identical; the preparation
script writes a disposable copy under ignored `build/` and records its complete
adapter diff.

[`nocpu.h`](nocpu.h) defines ABI version 2. Each module owns one live circuit.
Create and reset take a seed; duplicate create fails, destroy is repeatable, and
reset releases held inputs and restores cold original descriptors, then applies
the selected title's chosen DIP/potentiometer settings. Invalid game/settings
fail before disturbing a live machine. `nocpu_create(seed)` remains a convenience
entry point for original-default Pong; `nocpu_create_game` selects a circuit.
Reset retains the selected title/settings; `nocpu_reset_config` applies new
settings to a fresh instance of that title. Space Race's playtime setting is
resistance in ohms. The original potentiometer's initialization callback applies
the chosen value to C9 at simulation time zero, followed by its original 250 ms
polls. The cold C9 descriptor starts at 1000000 ohms and the default
potentiometer selects 970000 ohms; the host sets the potentiometer value and
lets the original chip perform that initialization update.

Coin and Start are separate held switches. Pong starts on coin; the two added
titles expose the original Start switch. Two Pong and four Pong Doubles paddle
slots accept signed axes from -32768 to 32767, converted by the original
absolute-joystick circuitry and its 10 ms polling clock.
Space Race takes two independent Up/Down digital switch pairs instead of
analog paddle positions. Original active-low input conversion remains intact.
Neither additional circuit requires a ROM.

Advance takes integer microseconds, accepts at most 100000 per call, and uses
original scheduler calls of at most 1 ms. Zero does nothing. Invalid advances
return zero without changing state. Simulation time remains integer
picoseconds inside the core; exported high/low words let callers reconstruct
an exact 64-bit value. The original scheduler may execute the first event past
a requested boundary. Host pause means no advance calls; it does not change
the circuit clock or perform catch-up after a hidden tab resumes.

Frames are 576 × 432 top-down RGBA with opaque alpha, using a fixed 4:3 viewport.
Host rasterization preserves the original GLfloat projection and the pinned
original Mesa 20.0.8 llvmpipe renderer's eight-bit subpixel edge grid, including
nearest-even rounding and pixel-center inclusion. This handles original video
transitions near a pixel center without changing any circuit timing or geometry.
Read the dimensions through the ABI. The pointer belongs to the module and
remains allocated until reset/destroy; a new completed circuit frame replaces
its contents. Frame numbers and exact timestamps identify new images.
The smaller 160 × 120 files in validation output are observation samples of
the full frame, matching the historical reference sampling positions.

Audio is circuit-generated mono signed 16-bit PCM at 48000 Hz. Copy the sample
queue before clearing it or advancing/resetting the circuit. The queue holds
at most 96000 samples; an undrained queue drops additional samples and exposes
an overrun counter. Hosts normally drain every tick. Collision observation
triples contain exact picosecond high/low words and the new HIT pin value; the
queue is limited to 4096 transitions and should also be drained every tick.
Score, hit count, and run/attract pins are validation observations, while the
visible game comes from the original video signals. Doubles' raw run latch
tracks credit/start logic; `nocpu_active` observes its actual active signal.
Space Race has no Pong HIT or attract signal: the browser reports these as
null, while its ABI attract getter returns `UINT32_MAX` to mark unsupported.
Its crashes retain their own names and original active-low transitions.
An additional bounded queue carries exact four-word event records for paddle
HIT or Space Race crash/score transitions, with a visible overrun counter.
Hosts drain both event queues each tick. All time words remain exact integers.

[`native_runner.cpp`](native_runner.cpp) drives the same API with
[`tests/replays/pong.tsv`](../tests/replays/pong.tsv) and writes original-shaped
evidence files. Read the [adaptation inventory](../docs/PORT_PONG.md),
[testing instructions](../docs/TESTING.md), and
[0.2.0 validation report](../docs/0.2.0_VALIDATION.md) for build commands and actual
fidelity results. The remaining 18 games are outside this compiled batch.
Pong Doubles uses DICE's default audio gain of 10; Space Race keeps its explicit
gain of 50 and its original 566/filter/mixer audio graph. Fresh circuit creation
also replaces audio objects, preventing selected-title gain from leaking into
the next game. Space Race's inherited timer and sound-model approximations
are preserved and require measured reference evidence rather than silent fixes.
