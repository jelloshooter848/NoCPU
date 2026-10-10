# Original-derived Pong core

The 0.2.0 core compiles the original DICE 0.9 Pong circuit and chip scheduler
without Qt, SDL devices, or an OpenGL window. The same generated source builds
as a native evidence runner and an Emscripten module. Historical files under
[`upstream/dice-0.9/`](../upstream/dice-0.9/) remain byte-identical; the preparation
script writes a disposable copy under ignored `build/` and records its complete
adapter diff.

[`nocpu.h`](nocpu.h) defines ABI version 1. Each module owns one live circuit.
Create and reset take a seed; duplicate create fails, destroy is repeatable, and
reset releases held inputs and restores the original Pong descriptor defaults.
Coin is a held switch whose assertion starts the original game. Two paddle
slots accept signed axes from -32768 to 32767, converted by the original
absolute-joystick circuitry and its 10 ms polling clock.

Advance takes integer microseconds, accepts at most 100000 per call, and uses
original scheduler calls of at most 1 ms. Zero does nothing. Invalid advances
return zero without changing state. Simulation time remains integer
picoseconds inside the core; exported high/low words let callers reconstruct
an exact 64-bit value. The original scheduler may execute the first event past
a requested boundary. Host pause means no advance calls; it does not change
the circuit clock or perform catch-up after a hidden tab resumes.

Frames are 576 × 432 top-down RGBA with opaque alpha, using a fixed 4:3 viewport.
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
visible game comes from the original video signals.

[`native_runner.cpp`](native_runner.cpp) drives the same API with
[`tests/replays/pong.tsv`](../tests/replays/pong.tsv) and writes original-shaped
evidence files. Read the [adaptation inventory](../docs/PORT_PONG.md),
[testing instructions](../docs/TESTING.md), and
[0.2.0 validation report](../docs/0.2.0_VALIDATION.md) for build commands and actual
fidelity results. This directory does not implement the other 20 games.
