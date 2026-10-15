# NoCPU desktop browser application

The frontend is the minimal desktop interface defined in the
[roadmap](../docs/ROADMAP.md) "Goal". It runs the DICE 0.9 circuits that the
core compiles (Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle and Indy 4)
in desktop browsers with keyboard, mouse and optional gamepads. The other
fifteen DICE games are listed but not ported yet.

## What it offers

- **Home and game picker.** Home is a schematic drafting sheet whose menu
  leads with Play; its gate drawing sketches itself in at most once per browser
  session (`sessionStorage`), any key or click skips it, reduced motion never
  runs it, and the menu is usable throughout. Play is an arcade-court picker
  that opens on the last game played: Up and Down choose among the six
  playable games and then the 15 listed under Coming soon, the right side
  shows the selected game's maker, year, players, comparison and ROM status
  with a Play button. Enter plays the focused game as the Play button does (a
  ROM game without its ROM explains on its info page); a click, Space or Game
  info opens the game's info page
  (controls, audio status and ROM requirements). Only installed fonts are
  used; nothing is downloaded. Phone-sized windows (up to 640px wide, or
  phone landscape up to 940 by 500px) use the plain arcade-court style
  instead of the schematic sheet: Home shows a blocky pixel NO CPU logo (an
  inline SVG, so no font is needed), one tagline, the build string and the
  same menu marked by a glowing paddle; Play lists the six playable games
  with the selected game's Play button kept in view and folds the games not
  ported yet into one "+15 more coming" line that expands the list. This is
  layout only, with no touch controls for play.
- **Game canvas.** The circuit's own raster, at its original orientation and
  aspect ratio, as large as the window allows above a single action bar
  (coin, start and Pause · Esc buttons, plus a short status line). The
  frontend draws no substitute court, score or sound.
- **Controls help.** How to play shows the rules and the current keyboard,
  mouse and gamepad assignments for each game.
- **Keyboard and mouse.** Default keys: W/S and Up/Down move the Pong paddles,
  Enter inserts a coin, Space opens the menu and Escape pauses or goes back.
  For the paddle games (Pong, Pong Doubles, Breakout) moving the mouse over the
  display sets the chosen player's paddle across the full original range; each
  edge of the display keeps a 5% margin so both endpoints are reachable. In
  Breakout the left mouse button over the display holds Serve. In Stunt Cycle
  the left button held over the display sets the shared throttle from idle
  (left) to full (right) and releasing it idles. Space Race and Indy 4 use the
  keyboard or a gamepad. Settings → Controls chooses which player the mouse
  drives, or turns it off, for each game.
- **ROM loading.** Settings → Local ROMs validates player-supplied ZIPs against
  the audited CRC and size requirements, locally; files are never uploaded.
  Imports last for the visit unless "Remember in this browser" is chosen.
- **Pause and reset.** Pause · Esc stops the circuit clock; the menu offers
  Resume, Reset game, Settings, How to play, About and returning to Play
  or Home.
- **Volume and mute** in Settings → Sound.
- **DIP and potentiometer settings** for each game in Settings → Controls; they
  apply when the game starts or after Apply & reset game.
- **About** shows the DICE credit, links to the GPL and the third-party notices
  shipped with the build and to its corresponding-source archive, and the build
  string: `vX.Y.Z` for a site packaged from its release tag, `vX.Y.Z-dev.<sha>`
  for any other packaged build (from `BUILD-MANIFEST.json`), and `vX.Y.Z-dev`
  without a manifest, as on the Vite dev server.

## How it works

`main.ts` owns the interface and orders control and input requests.
`core.worker.ts` loads the Wasm module from the site's base path, keeps
picosecond time as a string, copies module-owned video and PCM before
transfer, and clears consumed buffers. The worker advances the simulation on
its own bounded clock, so canvas presentation never slows the circuit; paused
or hidden time is discarded rather than replayed. Audio plays the engine's
signed mono PCM with a short bounded lead and is cleared on pause, reset and
interruption.

`controls.ts` turns keyboard and gamepad input into the circuit's switches and
absolute axes; `app-settings.ts` and `preferences.ts` keep sound, control
assignments, the mouse assignment and game settings in a versioned
`localStorage` record (version 5; versions 0-4 migrate on load, and malformed
or unavailable storage falls back to defaults for the visit). `roms.ts` and
`zip.ts` implement the bounded local ROM reader and store. `build-info.ts`
computes the About build string.

## Building and testing

Run `npm ci`, `npm run test:foundations`, `npm run build` and `npm run preview`
from the repository root with the prerequisites in [testing](../docs/TESTING.md).
The default URL base is `/NoCPU/`; `NOCPU_BASE_PATH` sets another absolute path
ending in `/`. `npm run dev` also offers the private ROM fixtures from
`build/roms` (see [ROMS.md](../docs/ROMS.md)) to the local development server
only; production builds never contain that loader. The packaged site supplies
the license notices and the matching corresponding-source archive, including
the preferred source of the pinned fflate ZIP helper.

`?debug` exposes read-only snapshots for automated tests: integer time as a
decimal string, circuit scoring and hit state, input ownership, worker timings
and PCM scheduling metrics. `wasmMemoryCapacityBytes` is the allocated Wasm
memory, not total browser memory. Rendered gameplay always comes from the
circuit's output.
