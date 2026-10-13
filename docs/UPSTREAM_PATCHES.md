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
machine starts cold. [PORT_PONG.md](PORT_PONG.md) explains each adaptation and
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
