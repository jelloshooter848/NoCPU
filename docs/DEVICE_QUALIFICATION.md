# Physical phone and controller qualification

After reviewed 0.3.1 deployment, use the
[preview and its exact identity](0.3.1_VALIDATION.md). That report records whether
publication has completed; an undeployed candidate is not the live preview.
Test an actual Android phone in Chrome and an actual iPhone in Safari. Pong is
the only playable browser game and needs no ROM. Copy the
[report template](DEVICE_REPORT_TEMPLATE.md) once per phone; controller results
cover each actual device/browser/controller pairing separately.

## Capture a phone run

1. Open a fresh [qualification page](https://jelloshooter848.github.io/NoCPU/?debug).
   Record the actual phone model, OS and browser/version, UTC test date and
   Build shown in About. Save the current
   [manifest](https://jelloshooter848.github.io/NoCPU/BUILD-MANIFEST.json).
   Its source/build and full runtime digest must match the reviewed preview.
2. Choose **Play Pong**, then **Insert coin**. Open **Menu → Qualification**.
   Wait for the build-identity preflight, then choose **Start** to resume play
   and request sound from that gesture. Recording adds no gameplay overlay.
3. Play until the panel records at least **600 conservative active seconds**. Reinsert a
   coin when a game ends. The recorder excludes menu, pause, background and
   attract intervals, so the session can take longer than ten minutes. Do not
   reset or reload during this measured session.
4. Open **Menu → Qualification → Finish**. Fill in the optional actual-device
   and observations fields. Use **Download report** or **Copy report**; the
   selectable **Report JSON** also provides a fallback. You can add observations
   after the short checks and download/copy again. Record actual paddle input
   response in its observations field or the supplemental report; a blank field
   stays unknown. Save before reloading: the
   report stays only in this page's memory. A new recording replaces it.
5. Complete the manual checks below and return the export plus your completed
   report, relevant screenshots/clips and any reproducible problems. Leave
   unknown values blank and checks `pending` or `unavailable`; partial reports
   are useful. No export automatically supplies a physical-device pass.

The report's total session seconds include excluded intervals. Accepted wall
seconds and native simulation seconds sum over the same active foreground,
native-running segments; the existing gate requires at least 600 accepted wall
seconds and simulation/wall ratio ≥0.95. Preserve raw readings, excluded
intervals, conservative bounds and acquisition uncertainty. A result whose
uncertainty crosses either requirement needs a longer or cleaner run. Missing
identity, collection errors or incomplete coverage cannot support measured
qualification. Keep their exported reasons; finish and save a partial report
before attempting a fresh recording.

Frame pacing, audio underruns, memory start/end bytes and input response are
required evidence, with no additional numeric cutoffs. Memory is Wasm
linear-memory capacity, not total phone process memory. Presentation timing
does not measure displayed FPS or physical input latency; audio adapter counters
do not prove speaker playback. Preserve the exported identity scope: served-artifact
validation does not cryptographically prove already-loaded process memory.

## Manual phone checks

Perform these short checks separately from the sustained recording:

- In portrait and landscape, follow Library → game information → Help/Settings
  → Back. Check readable content, reachable controls and internal scrolling;
  Back returns to its originating panel. Only Pong should be playable.
- Insert coin, play rallies, observe ball contacts and scoring, and hear
  circuit sound through the phone speakers. Move both P1/P2 tracks
  simultaneously to both endpoints and back. Each controls its own paddle
  over the full range; court touches do not move paddles. Check track/court
  separation, safe areas, finger obstruction and reachability in both orientations.
- Test Menu/Resume, Reset/new coin, mute/unmute and volume. Open Menu while
  holding a track, release and resume; movement requires a fresh gesture.
  Rotate while touching and check that fresh touch input works without stale input.
- Background while controlling a paddle, return and resume explicitly. Repeat
  lock/unlock and an available real audio interruption. Record the actual
  paused/input/sound recovery and any old-sound burst. Unavailable interruption
  checks remain incomplete observations.
- Change a preference and reload. Where possible, check visible recovery after
  site storage is cleared or unavailable; clearing site data removes this app's
  saved preferences and remembered ROMs. Record a usable normal-tab fallback
  where fullscreen is unsupported. If you have your own legitimate compatible
  ROM files, check picker/import, opt-in Remember, removal and re-import. Keep
  unavailable checks explicit; no ROM is required for Pong qualification.

## Real controller support

Record controller model, wired/Bluetooth connection, host/browser, visible
controller ID and bindings. With two controllers, test one player per
controller; with a dual-axis controller, remap distinct axes to P1/P2. Defaults
expect separate controllers. Move both paddles independently and simultaneously,
exercise mapped coin/menu/reset/mute and a remapped action, then verify settings
after reload. Disconnect while held, reconnect held, return to neutral and make
a fresh input. Test Menu/Resume, Reset and background release for stuck movement
or duplicate actions. Record unsupported detection/mapping honestly.

A controller pass covers only that pairing and is separate from the existing
phone release gate. Do not infer phone support from a desktop controller run.
Send no ROM bytes, private archives or unrelated device content. Maintainers
review actual reports before changing readiness or choosing a supported device
floor; final tags and broad game ports retain their agreed physical gate.
