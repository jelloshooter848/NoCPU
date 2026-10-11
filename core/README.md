# Original-derived DICE core

The 0.5.0 core sources compile original DICE 0.9 Pong, Pong Doubles, Space Race
and Breakout circuits and the chip scheduler
without Qt, SDL devices, or an OpenGL window. The same generated source builds
as a native evidence runner and an Emscripten module. Historical files under
[`upstream/dice-0.9/`](../upstream/dice-0.9/) remain byte-identical; the preparation
script writes a disposable copy under ignored `build/` and records its complete
adapter diff.

[`nocpu.h`](nocpu.h) defines ABI version 3, retaining ABI 2 game IDs and entry
points. Each module owns one live circuit.
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

Coin and Start are separate held switches. Pong starts on coin; Doubles and
Space Race expose the original Start switch. Two Pong and four Pong Doubles paddle
slots accept signed axes from -32768 to 32767, converted by the original
absolute-joystick circuitry and its 10 ms polling clock.
Space Race takes two independent Up/Down digital switch pairs instead of
analog paddle positions. Original active-low input conversion remains intact.
Breakout adds a single shared horizontal paddle, distinct Start1/Start2 and a
held Serve switch. Its canonical axis has the original reversed resistor range:
`15047 + (axis + 32768) * (-15000) / 65536` ohms; the positive endpoint remains
47.2288818359375 ohms. Two alternating players share that input slot. Coin,
Start and Serve remain independent actions. The browser queues up to eight
explicit Start selections behind queued coins, with original-time 100 ms held
and 100 ms released intervals; pause, reset and release cancel pending actions.
All four compiled circuits are ROM-free.

Breakout packs four original DIP indices into the ABI: bonus credit 0..8 in
bits 0..3 (the named original choices None, 100 through 800), cabinet type in
bit 4, coinage in bit 5 and ball count in bit 6. The default is 3; all higher
bits, unnamed bonus indices and nonzero potentiometer values are invalid.
These configure a fresh circuit rather than mutating live hardware. Cold reset
also restores the original static 256-byte 82S16 RAM and mixer capacitor state.

Advance takes integer microseconds, accepts at most 100000 per call, and uses
original scheduler calls of at most 1 ms. Zero does nothing. Invalid advances
return zero without changing state. Simulation time remains integer
picoseconds inside the core; exported high/low words let callers reconstruct
an exact 64-bit value. The original scheduler may execute the first event past
a requested boundary. Host pause means no advance calls; it does not change
the circuit clock or perform catch-up after a hidden tab resumes.

Frames are top-down RGBA with opaque alpha. The original measured 632 × 432
reference client crops to 576 × 432 for the three landscape titles and
324 × 432 for Breakout's clockwise portrait projection. Read the actual frame
dimensions through the ABI. Breakout preserves the original GLfloat rotation,
including its small trigonometric terms, before raster coverage; it applies the
five original guessed-color overlays using framebuffer color multiplication.
The source's cocktail-overlay TODO remains inherited. Its renderer is qualified
only when the independent original/native/Wasm full RGB comparison passes.
Host rasterization preserves the original GLfloat projection and the pinned
original Mesa 20.0.8 llvmpipe renderer's eight-bit subpixel edge grid, including
nearest-even rounding and pixel-center inclusion. This handles original video
transitions near a pixel center without changing any circuit timing or geometry.
The pointer belongs to the module and
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
Breakout's raw Q_n is the credit latch, while its actual active signal is
ATTRACT_n at E6.9. Named observations retain the original ServeWait, Player2 and
ball-counter bits; the counter is not labelled remaining lives. Breakout has no
synthetic Pong HIT. Event IDs 5..10 retain BRICK_HIT, BP_HIT_n, VB_HIT_n,
SERVE_WAIT, PLAYER_2 and ATTRACT_n transitions respectively. Contact counts
cover only IDs 5..7, including authentic startup transitions; validation must
distinguish brick initialization from gameplay contact.
An additional bounded queue carries exact four-word event records for paddle
HIT, Space Race crash/score or Breakout transitions, with a visible overrun counter.
Hosts drain both event queues each tick. All time words remain exact integers.

[`native_runner.cpp`](native_runner.cpp) drives the same API with
[`tests/replays/pong.tsv`](../tests/replays/pong.tsv) and writes original-shaped
evidence files. Read the [adaptation inventory](../docs/PORT_PONG.md),
[testing instructions](../docs/TESTING.md), and
[0.2.0 validation report](../docs/0.2.0_VALIDATION.md) for build commands and actual
fidelity results. The remaining 17 games are outside this compiled batch.
Pong Doubles uses DICE's default audio gain of 10; Space Race keeps its explicit
gain of 50 and its original 566/filter/mixer audio graph. Fresh circuit creation
also replaces audio objects, preventing selected-title gain from leaking into
the next game. Breakout retains its original gain of 80, mixer/9602 sound graph and
inherited approximations. Space Race's inherited timer and sound-model approximations
are preserved and require measured reference evidence rather than silent fixes.
