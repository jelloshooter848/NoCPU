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
| `web/` | Game shell/catalog, input mappings, local preferences/ROM management, worker stepping, Canvas and Web Audio delivery; Pong alone is playable |
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
The page sends ordered control and input requests; the worker owns the bounded
simulation clock independently of Canvas presentation cadence. The worker
copies frame and PCM data before transferring them with bounded outstanding
output. Canvas presents the frame; gesture-unlocked Web Audio plays the actual
circuit samples. Pause, reset and lost visibility stop or flush work rather
than accumulating hidden simulation time. Interruption of active audio flushes
stale playback and pauses the circuit until explicit Resume. Bounded initial
audio activation failure permits play with an Enable sound retry; simulation
does not depend on that activation succeeding.
Pointer capture assigns each simultaneous touch to its own paddle; cancellation
and blur release held inputs. See [`web/README.md`](../web/README.md).

The Pong frontend is a viewport game shell with title, loading, play, paused
menu, settings, help, About and recoverable-error states. In play, its compact
coin/menu controls surround the original 4:3 circuit raster. Settings and
project/source information belong in game panels rather than permanent page
sections. Opening a menu releases active inputs and pauses the circuit;
returning from a panel does not resume until the player chooses Resume.

The 0.2.1 usability patch places visible independent P1/P2 vertical touch
tracks outside the raster: below the court in portrait and beside it in
landscape. The original court is display-only for touch input. Track endpoints
map to the unchanged absolute paddle axis; thumb feedback reflects each
player's current position. This changes browser input access and layout,
retaining the core, worker clock and circuit PCM boundaries.

The static Vite production build defaults to the `/NoCPU/` GitHub Pages project
path. Release packaging supplies notices and matching source alongside the
runtime. Previews retain pending phone gates and identify the exact deployed
runtime; final releases require the agreed device evidence for those bytes.

## 0.3.0 app-foundation boundary

The authorized [0.3.0 work](0.3.0_TASKS.md) extends the game shell with library
and information screens, shared controls/remapping, preferences and local ROM
management. The source-audited `tests/fixtures/game-manifest.json` supplies all
21 metadata entries; only Pong has a playable browser circuit. ROM compatibility
and optional retention are separate from game availability.

Shell/catalog modules consume the input, preference and ROM modules through
agreed typed interfaces. Gamepad and remapped keyboard inputs still target the
unchanged circuit axes and control protocol. Storage migration, corruption or
eviction must not prevent ROM-free Pong play. ZIP validation uses the pinned
fflate helper with output bounds and accepted source CRC/observed-size checks;
filenames are documentary. The preferred library source and actual imported
dependency bytes are covered by the separate distribution/provenance checks.

Preferences retain volume, mute and keyboard/gamepad assignments through a
versioned record. ROM archives remain session-local unless retention is
explicitly selected; re-import, removal and backup are distinct from game
availability. Known corrupt retained records are not treated as validated and
remain removable. Back follows the panel origin without resuming simulation;
returning to library/title tears down the active circuit. Optional fullscreen
uses the browser capability with a usable ordinary-viewport fallback.

This foundation preserves the worker-owned clock, circuit PCM, original raster
and external paddle tracks. It does not port the other game circuits or waive
pending actual-phone gates. Candidate and deployment results are recorded
separately in [0.3.0 qualification](0.3.0_VALIDATION.md).

## Full-library implementation

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
