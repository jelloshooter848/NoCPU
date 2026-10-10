# Upstream patch ledger

`upstream/dice-0.9/` is the exact 566-file import identified in
[`PROVENANCE.md`](PROVENANCE.md). No archival source file is patched.

| Change | Location | Purpose / fidelity impact |
| --- | --- | --- |
| Import DICE 0.9 | `upstream/dice-0.9/` | Preserve original reference bytes; SHA-256 checked for every file |
| Preserve root GPL text and restore supplemental dependency notices | `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/licenses/` | Attribution and distribution documentation; no runtime change |
| Native reference build | `tools/`, generated `build/native/` | Build a fresh copy using the unchanged original Makefile with the isolated historical compiler/Qt/SDL toolchain; no source patch or extra compiler flags |
| Instrumented reference adapter | `tools/reference/apply_adapter.py`, generated `build/reference/` | Deterministic input and observation for replay measurements; a separately identified instrumented build |
| Portable Pong adapter | `tools/prepare-core.py`, `core/`, generated `build/core/source/` | Substitute platform display/input/audio boundaries, expose a bounded native/Wasm ABI and restore fresh-machine reset state; exact changes and comparison scope are recorded in [PORT_PONG.md](PORT_PONG.md) |

The reference adapter requires an exact single match for each source insertion
and writes its complete text diff to ignored `build/reference/adapter.diff`.
It changes only the generated build copy:

- `main.cpp`: select a recorded random seed, drive replay input/observation, and
  advance to a replay deadline using integer simulation time.
- `circuit.cpp`: register existing chip names, output pins, and pointers for
  read-only observation.
- `chip.cpp`: observe original output transitions for the selected trace pin.
- `chips/input.cpp`: supply recorded keyboard/joystick state through the original
  input methods.
- `chips/audio.cpp`: tap the original PCM samples before SDL buffering.
- `chips/video.cpp`: capture the original OpenGL back buffer before swapping.
- Add `reference_api.h` and `reference_driver.cpp` to that generated copy.

The adapter does not change game descriptors, netlists, chip truth tables, or
the event-queue algorithm. A fixed seed, input schedule, observation hooks, and
changed run boundaries distinguish this instrumented executable from the
untouched native executable; comparisons must record those settings. Frame
capture and PCM taps are evidence of generated output, not proof of display,
speaker, complete gameplay, or hardware fidelity. Refer to
[`TESTING.md`](TESTING.md) and the recorded fixture for the
current validation results.

The 0.2.0 portable adapter records its own `adapter.diff` and compiled-source
inventory. It replaces Qt/SDL/OpenGL host access with owned platform boundaries,
while retaining Pong's netlist, chip logic and integer event scheduler. Its
generated `chip.cpp` initializes `custom_update` to null in the null-description
VCC/GND supply-chip branch; this repairs the allocator-dependent repeated-machine
failure without changing archival bytes. It also restores mutable Pong
descriptors for fresh reset and checks descriptor iteration bounds before
reading. [PORT_PONG.md](PORT_PONG.md) documents every adaptation and its reason.
The original fresh capture, adapted native and Wasm replay outputs match exactly
in the reviewed scenario; that evidence is recorded in
[0.2.0_VALIDATION.md](0.2.0_VALIDATION.md) and does not establish physical-phone
playback or hardware fidelity.

The original source was compared with DirtBagXon/DICE revision
`742e8b48c38138491c55e85cd3c4f7342d641a6f`. Its desktop dependency migrations,
alignment change, and other differences are reference findings, not imported
patches. Modernization must remain explicit outside the archival tree.

Future adaptations must record their exact tool/path, changed files, reason,
validation, and fidelity implications here. Generated instrumentation is a
different executable from the untouched native reference and must be identified
as such in any reported result.
