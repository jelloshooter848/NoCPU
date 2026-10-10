# Architecture and fidelity boundaries

## Current foundation

NoCPU 0.1.0 keeps an independently auditable copy of DICE 0.9 under `upstream/dice-0.9/`. Its native reference is built in an isolated Qt4/SDL 1.2 toolchain from a generated source copy. The project currently provides repository structure, audited source/game/ROM metadata, native tooling, and controlled Pong reference evidence. There is no browser core or phone frontend yet.

Original source, build copies, validation instrumentation, and future product code have separate roles:

| Boundary | Responsibility |
| --- | --- |
| Original source | Historical reference; checked against its source manifest |
| Native build tools | Reproduce compilation without editing that reference |
| Validation adapter | Apply controlled inputs and capture observable behavior; document every instrumentation patch |
| Future `core/` | Create/destroy/reset/input/advance/video/audio/ROM interface around the original-derived C++ simulation |
| Future `web/` | Accessible library, per-game controls, rendering, audio delivery, local storage, and lifecycle handling |

The newer DirtBagXon fork is a reference for dependency modernization, not the authority for fidelity. Earlier comparison found identical game definitions but observed rendering and logging differences that remain unresolved. See [provenance](PROVENANCE.md), [Pong reference](PONG_REFERENCE.md), and [testing](TESTING.md) for exact evidence and limits.

## Browser direction for 0.2 and later

Retain the C++ circuit engine and compile it with Emscripten to WebAssembly. Define the platform boundary before building the complete arcade UI:

1. Advance bounded simulation work without native window, device-audio, filesystem, or blocking wall-clock assumptions.
2. Export frames and circuit-generated PCM; deliver them through Canvas/WebGL and Web Audio.
3. Express all supported player inputs through a per-game schema shared by keyboard, gamepad, touch controls, and help.
4. Keep ROM loading behind an audited import interface, with clear validation errors and optional user-selected local persistence.
5. Handle visibility loss, pointer cancellation, audio interruption, reset, destruction, and repeated game switching explicitly.

Picosecond counters remain integers inside C++/Wasm. They must not pass through imprecise JavaScript `Number` values. Native and browser presentation clocks must not redefine simulation time. A worker may keep the interface responsive, but transfer and audio costs need measurement. Establish a single-threaded baseline before considering pthreads or shared memory; GitHub Pages cannot be assumed to provide cross-origin-isolation headers.

Do not replace the simulator with visually similar TypeScript game rules. Do not replace circuit PCM with a generic music or effects synthesizer. Where physical controls need adaptation—paddles, wheels, light guns, simultaneous player slots—document the mapping and compare its effect against native behavior.

The audio boundary preserves what DICE implements. Eight original titles lack active mono-output hookups, as recorded in the [compatibility matrix](GAME_COMPATIBILITY.md). Completing their historical sound circuits is later accuracy work; browser audio delivery must not conceal that baseline limitation.

## Validation direction

Compare original native behavior with the adapted native core, then adapted native with Wasm. Controlled scenarios must name seeds, input timestamps, settings, toolchains, and measured output. Characterize existing nondeterminism and event-boundary overshoot before assuming byte-for-byte replay equivalence.

Current native evidence does not establish historical hardware accuracy for every game. The [compatibility matrix](GAME_COMPATIBILITY.md) separates recorded results from unknowns. The [roadmap](ROADMAP.md) requires physical Android and iPhone testing and measured mobile throughput before broad library expansion.
