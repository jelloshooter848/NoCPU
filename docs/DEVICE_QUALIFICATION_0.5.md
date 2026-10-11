# 0.5.0 four-game and iPhone Home Screen qualification — draft packet

Use this packet with the independently reviewed, deployed
[0.5.0 four-game/Home Screen preview](0.5.0_VALIDATION.md). Its software
acceptance does not establish physical installation or device performance.
This draft records no physical result and does not authorize a final tag; the
[0.4.0 packet](DEVICE_QUALIFICATION_0.4.md) retains its shared game procedure.

Record the actual phone model, OS/browser versions, UTC date, tested build/source
and complete runtime SHA-256. Test Android Chrome, iPhone Safari and installed
iPhone mode separately. Browser emulation, a manifest or a home-screen icon
cannot supply installed-device evidence. The four software-preview playable titles are
ROM-free; the other seventeen must remain explicitly unported.

## iPhone Safari and installed mode

1. Open the reviewed canonical `/NoCPU/` URL in Safari. Use the existing Help/
   About installation guidance and manually choose **Add to Home Screen**.
   Record what that device actually offers; no automatic install prompt is
   assumed. Confirm the installed icon, app title and observed standalone mode.
2. Launch from the Home Screen in portrait and landscape. Record notch/home
   indicator clearance, game-first title/library/play, reachable menus/file
   picker and controls outside the raster. Fullscreen/orientation lock must not
   be prerequisites for ordinary play.
3. Start audio with a normal user gesture. Test speaker sound, mute/volume,
   app-switch, lock/unlock and audio interruption, including held-input release
   and explicit resume. Rotate with a touch held; confirm release/ownership and
   usable controls after the change. Record actual results in both modes.
4. Cold-relaunch and record observed navigation/preferences and ROM inventory.
   Circuit state is not saved. Compare Safari and installed storage as separate
   contexts; do not assume sharing or permanent retention. Test denied/cleared/
   evicted storage recovery where feasible, recording setup and limitations.
5. Optional retained ROM management uses only the player's files and choice:
   validate, import/Remember, remove, re-import and export. The four playable
   titles need no ROMs; compatible files do not unlock the seventeen unported
   games. Share only metadata/hashes, never ROM payloads or private archives.

This milestone is online. Installation does not establish offline operation;
record a network failure honestly rather than claiming an offline cache exists.

## Game and measurement scope

Follow the [0.4.0 packet](DEVICE_QUALIFICATION_0.4.md) for Pong/Doubles/Space Race
and the shared recording/lifecycle procedure. Record one report per actual
game/options and launch context, outside mixed-game switching checks. On the
diagnostic page, choose the game and open Menu → Qualification; wait for identity
preflight, Start recording, Finish and export before reloading. Reports do not
automatically prove the device, installed context or readiness.

The Pong phone baseline retains at least 600 conservative active-wall seconds,
simulation/wall ratio at least 0.95 and the eight existing manual checks. For
each other title and installed-mode observation, record actual duration/speed
and manual/performance coverage without inventing a mandatory ten-minute gate
per title. Preserve excluded intervals, endpoint acquisition uncertainty and
all coverage/identity limits. Wasm capacity and audio counters are not phone
memory, physical latency or speaker fidelity measurements.

Breakout observations must identify the one shared horizontal absolute paddle,
full-range outside-raster access, held/released Serve, separate Coin/Start 1/
Start 2 actions, actual one-/two-player behavior, brick/paddle contacts, scoring/
end state and implemented sound. Record the tested bonus-credit, cabinet,
coinage and ball-count settings; untested options remain pending. Observe the
original rotated 3:4 raster and five source-derived color bands, retaining
inherited guessed-color/cocktail limitations rather than silently claiming an
accuracy fix. Source-declared settings alone do not prove credit accounting.
The automated preview does not exercise threshold-triggered bonus-credit awards;
record any actual award check separately and leave untested thresholds pending.

Start 1P requires one credit; Start 2P requires two. With default coinage, insert
one separate Coin pulse before Start 1P or two separate Coin pulses before
Start 2P. With the original 1 Coin / 2 Credits setting, one Coin supplies the
two credits. Record the actual two-player alternation and shared-paddle behavior;
do not replace the original Cocktail-mode raster/overlay limitations with an
unmeasured frontend correction.

Test each game's cancel/Menu/Resume/reset/background/audio behavior, plus a
Pong → Doubles → Space Race → Breakout → Pong switch sequence outside sustained
recordings. Check current title/options, neutral inputs and no queued old-game
audio. Preserve all supported player slots; a Pong report cannot qualify
Doubles' four paddles, Space's digital sticks or Breakout's shared paddle/Serve.
Keep controller-model/pairing/remapping/disconnect evidence separate.

Use [the report template](DEVICE_REPORT_TEMPLATE.md), including observed launch
context and separate title-specific results. Independently review actual
runtime-matched evidence before changing readiness or declaring a device floor.
