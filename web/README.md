# NoCPU browser application

The current [0.4.0 development contract](../docs/legacy/0.4.0_TASKS.md) adds faithful
Pong Doubles and Space Race alongside Pong, with four independent paddles,
two digital sticks and original supported settings. The other eighteen
circuits remain unported. [0.4.0 validation](../docs/legacy/0.4.0_VALIDATION.md) records
actual qualification and publication status. Until that delivery completes,
the public site remains the verified [0.3.1 preview](../docs/legacy/0.3.1_VALIDATION.md);
the app-foundation description and counts below are historical 0.3.0 evidence.


The independently verified [0.3.0 app foundation](../docs/legacy/0.3.0_TASKS.md) preview adds
game-first library/info, shared controls/remapping, persistent preferences and
optional local ROM management. All 21 games have source-derived metadata, but
only Pong is playable. ROM compatibility never implies browser availability.
Clean CI passes 132 cases with three documented CDP skips; the selected actual
live suite passes 92 with three such skips. All 90 public HTTPS files match the
reviewed exact-main artifact. Deployed source/runtime and pending physical
qualification belong in [0.3.0 validation](../docs/legacy/0.3.0_VALIDATION.md).

The Pong frontend introduced in 0.2.0 presents ROM-free Pong from DICE's original-derived C++ circuit engine. The 0.2.1 patch changes its touch controls. It uses TypeScript and Vite, a dedicated WebAssembly worker, a Canvas display, and Web Audio playback of the engine's signed mono PCM. The frontend contains no replacement game rules or synthesized Pong effects. Current physical Android/iPhone qualification is tracked separately in [0.3.0 validation](../docs/legacy/0.3.0_VALIDATION.md); [0.2.1 validation](../docs/legacy/0.2.1_VALIDATION.md) retains its historical deployment and partial device feedback, and the earlier runtime is recorded in [0.2.0 validation](../docs/legacy/0.2.0_VALIDATION.md).

`main.ts` owns the player interface and ordered control/input requests. `core.worker.ts` loads the Wasm module from the site's configured base path, preserves picosecond telemetry as a string, copies module-owned video/PCM before transfer, and clears consumed buffers. The worker advances simulation from its own bounded clock; Canvas presentation cadence cannot slow the circuit. Transfers are bounded, and paused or hidden time is discarded rather than replayed as a backlog.

The 0.3.0 shell fills the browser viewport. Its title screen offers quick Play Pong, the 21-title library, Settings, How to play and About, with the source version visible. Library information distinguishes browser availability from ROM compatibility and preserves source-derived controls, player counts, shared groups and audio limitations. Only Pong can launch. Play Pong loads the original attract display; Insert coin starts a game. During play, the circuit court, external P1/P2 tracks and compact coin/menu controls remain visible. There is no duplicate frontend score or substitute court. The circuit raster retains its 4:3 aspect ratio; unused space accommodates the browser/device viewport. Optional fullscreen can fail or be unavailable without preventing ordinary browser play.

Default keyboard controls are W/S for player 1, Up/Down for player 2, Enter for coin and Space for the menu; Escape remains a menu/Back shortcut. Settings can reassign keyboard actions, controller buttons, player joystick axes, direction and deadzone. How to play reflects current assignments. Labeled P1/P2 vertical touch tracks sit entirely outside the court: below it in portrait and in the side letterboxes in landscape. Each track captures one pointer independently, shows its current thumb position and covers the full original joystick axis range between its visible endpoints; two players can drag at once. Court touches do not move either paddle. Cancellation, disconnect, blur and pause clear transient held inputs while retaining the last absolute paddle position.

Menu pauses the circuit and offers Resume, Reset game, Settings, How to play, About, Return to library and Return to title. Returning to library or title destroys the circuit and clears active input/audio. Back from a secondary panel follows its origin and restores focus, never resumes play implicitly. About retains DICE attribution, version/build identification, GPL and component notices, and matching source access. Loading and failure/retry screens stay inside the same shell. Panels may scroll internally; the document and gameplay gestures do not scroll. Physical safe-area spacing and compact portrait/landscape layouts are part of the shell's acceptance checks.

Settings stores sound, volume and control assignments in a versioned local preference record. Malformed records recover to defaults; unavailable or full storage permits session-only settings. Restore default controls resets assignments. Local ROM management accepts player-supplied ZIPs against audited active CRC and observed-size requirements; descriptor filenames are documentary. Imports remain available for the session unless the player opts into device storage. Valid retained archives can be backed up; browser clearing/eviction requires re-import. A known corrupt saved record is marked as needing re-import and remains removable. Storage/import failures are reported without blocking ROM-free Pong or making an unavailable game playable. Files are processed locally and are not uploaded.

The first player gesture unlocks audio. Playback keeps a short bounded lead, preserves that lead when inserting another coin, and discards old audio on pause/reset/interruption. A backgrounded page requires the player to resume. Device activation has a bounded wait and never prevents simulation from resuming; unavailable sound has an Enable sound retry control. Expired activation attempts cannot resume playback after backgrounding.

Run `npm ci`, `npm run test:foundations`, `npm run build`, and `npm run preview` from the repository root using the prerequisites in [testing](../docs/TESTING.md). The default URL base is `/NoCPU/`; `NOCPU_BASE_PATH` can configure a different absolute path ending in `/`. The packaged Pages artifact supplies runtime licenses and its matching corresponding-source archive, including preferred source for the pinned fflate ZIP helper. Build identity and preview/release status are read from the artifact's `BUILD-MANIFEST.json`; unavailable metadata retains the preview label. This lets the tested runtime remain unchanged when promoting a preview to a release.

`?debug` exposes read-only snapshots for automated validation: integer time as a decimal string, circuit scoring/hit state, input ownership, worker timings, and PCM scheduling metrics. `wasmMemoryCapacityBytes` is the allocated Wasm memory capacity, not total browser process memory. `coreOverruns` counts samples the core could not retain. This is validation observability; rendered gameplay always comes from the circuit's output. Read [architecture](../docs/ARCHITECTURE.md) and the [roadmap](../docs/ROADMAP.md) for the current app foundation and later game-circuit support.
