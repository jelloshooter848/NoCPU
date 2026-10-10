# Architecture and fidelity boundaries

## Original reference and Pong port

NoCPU keeps an independently auditable copy of DICE 0.9 under `upstream/dice-0.9/`. Its 0.1.0 native reference is built in an isolated Qt4/SDL 1.2 toolchain from a generated source copy. The 0.2.0 work adds a Pong-only portable core and browser frontend. Implementation and actual qualification results are recorded in [0.2.0_VALIDATION.md](0.2.0_VALIDATION.md); the existence of a browser build does not establish final release or physical-phone qualification.

Original source, build copies, validation instrumentation, and product code have separate roles:

| Boundary | Responsibility |
| --- | --- |
| Original source | Historical reference; checked against its source manifest |
| Native build tools | Reproduce compilation without editing that reference |
| Validation adapter | Apply controlled inputs and capture observable behavior; document every instrumentation patch |
| `core/` | Versioned create/destroy/reset/input/advance/frame/PCM interface around the original-derived Pong circuit |
| `web/` | Pong interface, independent touch/keyboard paddles, worker stepping, Canvas and Web Audio delivery |
| Release packaging | Exact runtime identity, matching corresponding source, licenses and preview/final gates |

The newer DirtBagXon fork is a reference for dependency modernization, not the authority for fidelity. Earlier comparison found identical game definitions but observed rendering and logging differences that remain unresolved. See [provenance](PROVENANCE.md), [Pong reference](PONG_REFERENCE.md), and [testing](TESTING.md) for exact evidence and limits.

## 0.2.0 platform boundary

[`tools/prepare-core.py`](../tools/prepare-core.py) generates a disposable source
copy and records every adaptation. The chip models, event scheduler and Pong
netlist remain original-derived C++; the frontend does not implement replacement
Pong rules. Native and Wasm targets compile the same prepared source.
[`core/nocpu.h`](../core/nocpu.h) defines ABI 1, with one live circuit per module.
Create/reset take a seed, paddle slots hold independent signed axes, and coin
is a held switch. Time advances in bounded integer microseconds while internal
picosecond time stays 64-bit. Exact telemetry crosses the boundary through
high/low words and is presented as a decimal string, avoiding JavaScript Number
rounding.

The portable renderer exports a completed 576 × 432 top-down RGBA frame. It
uses original video signal timing and adapted presentation geometry, compared
with captured native OpenGL output. Generated audio is mono signed 16-bit PCM
at 48,000 Hz. Module-owned frame/audio buffers must be copied before reset,
destruction or further operations that invalidate their contents. Queues are
bounded and expose overrun observations. See [PORT_PONG.md](PORT_PONG.md) and
[`core/README.md`](../core/README.md) for the adaptation and ABI details.

The browser uses a dedicated single-threaded worker without shared memory.
The page sends ordered input and bounded advance requests, with only one
advance in flight. The worker copies frame and PCM data before transferring
them. Canvas presents the frame; gesture-unlocked Web Audio plays the actual
circuit samples. Pause, reset, lost visibility and audio interruption stop or
flush presentation work rather than accumulating hidden simulation time.
Pointer capture assigns each simultaneous touch to its own paddle; cancellation
and blur release held inputs. See [`web/README.md`](../web/README.md).

The static Vite production build defaults to the `/NoCPU/` GitHub Pages project
path. Release packaging supplies notices and matching source alongside the
runtime. Previews retain pending phone gates and identify the exact deployed
runtime; final releases require the agreed device evidence for those bytes.

## Later library work

Retain this platform boundary while adding the complete arcade UI:

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
