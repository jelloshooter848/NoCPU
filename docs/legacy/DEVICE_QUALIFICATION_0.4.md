# 0.4.0 three-game physical qualification — draft packet

The [0.4.0 preview](0.4.0_VALIDATION.md) has passed independent publication
review. Use this packet with its exact tested runtime; later previews require
their own runtime identity and additional-title/mode procedure. The earlier
Pong procedure remains in [DEVICE_QUALIFICATION.md](DEVICE_QUALIFICATION.md).
This packet records no physical-device result and does not authorize a final tag.

Test an identified actual iPhone in Safari and Android phone in Chrome.
Record the model, OS/browser version, UTC date, source/build and full runtime
digest from the reviewed manifest. All three playable titles are ROM-free;
the other eighteen library entries must remain explicitly unported.

## Record the exact game

1. Open the diagnostic page with `?debug` and choose the title from Library.
   Record `pong`, `pongdoubles` or `spacerace` and the actual supported settings.
2. Insert a coin. Pong starts from coin; Doubles and Space Race require their
   separate **Start game** action. For four-player Doubles, insert two separate
   coins before Start; one coin selects the original two outer paddles.
   Open **Menu → Qualification**, wait for
   identity preflight and start recording from its explicit gesture.
3. Play active foreground sessions and preserve raw metrics and exclusions.
   The existing Pong baseline per identified phone requires at least 600
   conservative active-wall seconds and a simulation/wall ratio of 0.95.
   For each additional title, record actual measured time, speed and observed
   manual/performance scope; this packet adds no new mandatory per-title
   ten-minute threshold. A Pong baseline does not supply missing new-game
   performance or physical-control evidence.
   Menus, attract, background and boundary/identity-uncertain intervals are
   excluded. Endpoint acquisition uncertainty is preserved and bounded
   conservatively. Frame
   pacing, audio counters, Wasm capacity and manual input response keep their
   existing limitations; they are not phone-memory, speaker or physical-latency
   proof.
4. Finish in the Qualification panel, add actual device details/observations
   and download or copy the JSON before reloading. Keep partial reports and
   their explicit failure/coverage reasons. Do not combine different games or
   options into a single performance claim: the collector records game/session
   identity and mixed scope invalidates measured coverage.
5. Record the manual checks below separately. A Pong report cannot qualify
   four Doubles paddles or two digital Space Race rockets. Leave untested
   titles/options/physical checks pending; exports never automatically supply
   a phone or final-release pass.

## Title-specific manual observations

| Title | Required observations |
| --- | --- |
| Pong | Coin start, independent simultaneous P1/P2 tracks and endpoints, rally contacts, scoring, implemented sound, and both original winning-score settings |
| Pong Doubles | One coin + Start selects two outer paddles; two separate coins + Start select four. Test all four independently controlled paddles (P1 outer left, P2 outer right, P3 inner left, P4 inner right), simultaneous and full-range track access, contacts/scoring, implemented sound, and 11/15 winning-score options |
| Space Race | Separate Coin/Start, independently held/released P1/P2 Up and Down with neutral behavior, rocket motion/collisions/scoring and end/start behavior, implemented sound, both coinage options and supported playtime endpoints/default; record inherited DICE timer/sound behavior separately |

Space Race's original Start also activates play without credit. Its
source-declared alternate coinage and observed repeated-Start timer restart
must remain distinct from proven credit consumption; preserve the inherited
behavior and report actual observations.

For every tested title, check portrait/landscape reachability, controls outside
the raster, finger obstruction/safe areas, cancellation, Menu/Resume, reset,
mute/volume, actual speaker/audio recovery, held-input background/lock/rotation
and explicit resume. Record a mixed Pong → Doubles → Space Race → Pong cycle:
inputs, settings, queued sound and current title must follow the current game
without stale behavior. Perform switching checks outside a single-game
sustained recording.

Check game panels, Back/focus/internal scrolling, preferences after reload,
optional storage recovery and fullscreen or a usable normal-tab fallback.
Keep actual controller model/pairing, player channels/remapping and held
disconnect/reconnect results separate; available controller counts do not
silently collapse four Doubles players. No controller support is inferred from
automation or a different hardware pairing.

Use [the device report template](DEVICE_REPORT_TEMPLATE.md), naming the tested
game/options for each report and recording title-specific observations. Send
no ROM payloads/private archives. Actual reports must be independently reviewed
before changing readiness or claiming a supported device floor.
