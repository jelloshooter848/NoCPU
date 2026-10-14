# DICE 0.9 game inventory

All 21 games registered by DICE 0.9 are the NoCPU 1.0 scope (see the
[roadmap](ROADMAP.md)). This page records what the original source declares for
each game and what has been verified. Source declarations describe intended
capabilities, not verified gameplay.

## Port status

| Status | Games |
| --- | --- |
| Compiled by the core, ROM-free | Pong, Pong Doubles, Space Race, Breakout |
| Compiled by the core, player-supplied ROM | Stunt Cycle, Indy 4 |
| Unported, ROM-free | Rebound, Gotcha, TV Basketball, Quadrapong, Crossfire, Pin Pong, Hi-Way |
| Unported, ROM-backed | Anti-Aircraft, Attack, Shark Jaws, Jet Fighter, Crash 'N Score, Clean Sweep, Wipe Out, Steeplechase |

The six compiled games had original/native/Wasm comparison evidence in the
legacy line (see [Verification status](#verification-status)); legacy evidence
is not a restarted-line pass. On the restarted line all six passed their
bounded original/native/Wasm comparisons in 0.1.1 ([ACCEPTANCE.md](ACCEPTANCE.md),
with the coverage gaps listed there), and from 0.1.3 each release publishes a
desktop acceptance record of automated browser checks in Playwright's Chromium
and Firefox builds ([RELEASING.md](RELEASING.md#the-desktop-acceptance-record)).

## Source inventory

The machine-readable [game manifest](../tests/fixtures/game-manifest.json) contains every labeled input, active DIP setting/default, exposed potentiometer range, rotation, overlay geometry, audio declaration, and required ROM descriptor. [The source audit](../tools/audit-games.py) compares those fields against the preserved C++ source without requiring ROMs.

```sh
python3 tools/audit-games.py
python3 tools/audit-roms.py
```

Player counts below are indicated by numbered input slots and named start actions. A slot is an independently addressable control group; Breakout and Stunt Cycle indicate two-player starts with one shared group. Cabinet behavior and simultaneous/alternating modes still need gameplay testing. Rotation is clockwise monitor rotation from the video descriptor; overlay count refers to simulated colored filter regions, not ROM artwork.

| Game (original ID) | Maker / year | Players indicated / input slots | Controls | Rotation / overlays | ROM ZIP |
| --- | --- | --- | --- | --- | --- |
| [Pong](../upstream/dice-0.9/games/pong.cpp) (`pong`) | Atari / 1972 | 2 / 2 | paddle vertical | 0° / 0 | `None` |
| [Pong Doubles](../upstream/dice-0.9/games/pongdoubles.cpp) (`pongdoubles`) | Atari / 1973 | 4 / 4 | paddle vertical | 0° / 0 | `None` |
| [Rebound](../upstream/dice-0.9/games/rebound.cpp) (`rebound`) | Atari / 1974 | 2 / 2 | paddle horizontal | 0° / 0 | `None` |
| [Gotcha](../upstream/dice-0.9/games/gotcha.cpp) (`gotcha`) | Atari / 1973 | 2 / 2 | joystick | 0° / 0 | `None` |
| [Space Race](../upstream/dice-0.9/games/spacerace.cpp) (`spacerace`) | Atari / 1973 | 2 / 2 | joystick | 0° / 0 | `None` |
| [Stunt Cycle](../upstream/dice-0.9/games/stuntcycle.cpp) (`stuntcycle`) | Atari / 1976 | 2 / 1 | throttle | 0° / 0 | `stuntcycle.zip` |
| [TV Basketball](../upstream/dice-0.9/games/tvbasketball.cpp) (`tvbasketball`) | Midway / 1974 | 4 / 4 | paddle vertical | 0° / 0 | `None` |
| [Breakout](../upstream/dice-0.9/games/breakout.cpp) (`breakout`) | Atari / 1976 | 2 / 1 | paddle horizontal, buttons | 90° / 5 | `None` |
| [Anti-Aircraft](../upstream/dice-0.9/games/antiaircraft.cpp) (`antiaircraft`) | Atari / 1975 | 2 / 2 | buttons | 0° / 0 | `antiaircraft.zip` |
| [Attack](../upstream/dice-0.9/games/attack.cpp) (`attack`) | Exidy / 1977 | 2 / 2 | joystick, buttons | 0° / 0 | `attack.zip` |
| [Shark Jaws](../upstream/dice-0.9/games/sharkjaws.cpp) (`sharkjaws`) | Atari / 1975 | 1 / 1 | joystick | 0° / 1 | `sharkjaws.zip` |
| [Quadrapong](../upstream/dice-0.9/games/quadrapong.cpp) (`quadrapong`) | Atari / 1974 | 4 / 4 | paddle vertical, paddle horizontal | 0° / 0 | `None` |
| [Jet Fighter](../upstream/dice-0.9/games/jetfighter.cpp) (`jetfighter`) | Atari / 1975 | 2 / 2 | joystick, buttons | 0° / 0 | `jetfighter.zip` |
| [Crash 'N Score](../upstream/dice-0.9/games/crashnscore.cpp) (`crashnscore`) | Atari / 1975 | 2 / 2 | wheel, buttons | 0° / 0 | `crashnscore.zip` |
| [Crossfire](../upstream/dice-0.9/games/crossfire.cpp) (`crossfire`) | Atari / 1975 | 2 / 2 | joystick, buttons | 0° / 0 | `None` |
| [Pin Pong](../upstream/dice-0.9/games/pinpong.cpp) (`pinpong`) | Atari / 1974 | 1 / 1 | buttons | 90° / 0 | `None` |
| [Clean Sweep](../upstream/dice-0.9/games/cleansweep.cpp) (`cleansweep`) | Ramtek / 1974 | 1 / 1 | paddle horizontal, buttons | 0° / 1 | `cleansweep.zip` |
| [Wipe Out](../upstream/dice-0.9/games/wipeout.cpp) (`wipeout`) | Ramtek / 1974 | 4 / 4 | paddle vertical, paddle horizontal | 0° / 0 | `wipeout.zip` |
| [Hi-Way](../upstream/dice-0.9/games/highway.cpp) (`hiway`) | Atari / 1975 | 1 / 1 | wheel, buttons | 0° / 0 | `None` |
| [Steeplechase](../upstream/dice-0.9/games/steeplechase.cpp) (`steeplechase`) | Atari / 1975 | 6 / 6 | buttons | 0° / 6 | `steeplechase.zip` |
| [Indy 4](../upstream/dice-0.9/games/indy4.cpp) (`indy4`) | Atari / 1976 | 4 / 4 | wheel, buttons | 0° / 0 | `indy4.zip` |

## Audio and video limits

The runtime creates a special `AUDIO` chip centrally for every circuit (`circuit.cpp`). Thirteen game sources have active hookups to its mono output. Eight have no active audio output hookup: Anti-Aircraft, Hi-Way, Indy 4, Jet Fighter, Pin Pong, Shark Jaws, Steeplechase, and Stunt Cycle. Several retain unfinished or commented sound circuitry. This is a limitation inherited from DICE 0.9, not a browser-port regression.

The manifest's `audio.circuit_audio_present` and `mono_output_wired` track active connections, independently of `audio.descriptor`. A null descriptor uses the runtime's default gain of 10; it does not establish silence or sound. Hi-Way even has an explicit descriptor despite its commented hookup. The original SDL output is one channel (`chips/audio.cpp`); Crash 'N Score explicitly has a stereo TODO. No audible audio validation is claimed by the fixture audit or the earlier dummy-audio render checks.

Indy 4 declares a color monitor; the remaining games use the original `MONOCHRONE` default with optional overlays. Breakout and Pin Pong specify 90° clockwise rotation. Overlay/video differences observed between original DICE and the Qt5/SDL2 fork remain an accuracy investigation, rather than an accepted new reference.

## Verification status

Each kind of evidence below is separate: a metadata audit is not a ROM load, a
basic render is not gameplay, and generated PCM is not audible sound. Rows that
name the legacy line come from its ledgers in [docs/legacy/](legacy/README.md)
(tag `legacy-0.6.0`) and are history, not restarted-line acceptance.

| Coverage | Evidence |
| --- | --- |
| All 21 registrations and exposed descriptors | `tools/audit-games.py` passes without external assets |
| Ten ROM-dependent games | `tools/audit-roms.py` checks public metadata without ROMs; with the private fixtures (`--rom-dir`) all ten sets pass the CRC and observed-size checks |
| Ten ROM-dependent games plus Pong | Basic native rendering observed in original DICE and the DirtBagXon rebuild during the legacy 0.1.0 comparison; startup and rendering only |
| Pong | Legacy: portable native/Wasm replay of coin-start, independent paddles, rally contacts, scoring, coin restart and reset matched the original fresh capture ([0.2.0](legacy/0.2.0_VALIDATION.md)) |
| Pong Doubles, Space Race | Legacy: six original-derived scenarios matched timing, events and media through both portable reset epochs, covering Doubles' 11/15 score and Space Race's coinage and 470/970/1470-kilohm play time ([0.4.0](legacy/0.4.0_VALIDATION.md)) |
| Breakout | Legacy: the sixteen-scenario ROM-free batch matched streams, RGB hashes, selected color snapshots and reset, with canonical ABI traces; coinage, cabinet, ball count and the shared paddle covered, bonus-credit awards unexercised ([0.5.0](legacy/0.5.0_VALIDATION.md)) |
| Stunt Cycle, Indy 4 | Legacy: the original/native/Wasm comparison gate was accepted with private fixtures; browser and delivery gates were still open when the line ended ([0.6.0](legacy/0.6.0_VALIDATION.md)) |
| Restarted line, six compiled games | Original/native/Wasm comparisons pass for the bounded scenarios in [ACCEPTANCE.md](ACCEPTANCE.md) (0.1.1). Automated browser tests pass in Playwright's Chromium, Firefox and WebKit builds in CI (Stunt Cycle and Indy 4 from private ROMs, Chromium and Firefox only); from 0.1.3 each release publishes them as its desktop acceptance record. No manual check in a release desktop browser is recorded yet |
| Fifteen unported games | Source-inventoried only; no render or play claim |
| Audible audio and audio/video synchronization | Not verified for any game; automated checks cover generated PCM and its scheduling only |

Known inherited behaviors: original Space Race Start activates `GAME_ON`
without a credit, and repeated Start/timer restarts do not prove two-credit
consumption under its alternate coinage. These are DICE 0.9 behaviors,
preserved and kept separate from port comparisons.

The manifest's `validation` fields record the legacy 0.1.0 source/native audit
scope only; they do not mark any game as verified gameplay.

## Inputs and adjustable settings

Labels and pin/direction selections below come from the original input descriptors. Global coin/start groups have no player slot. DIP values are indexed exactly as the original settings UI expects; unlisted rotary positions are `null` in the manifest and must not be presented as meaningful settings. Potentiometers retain original resistance expressions, not invented durations in seconds.

### Pong (`pong`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_VERTICAL_INPUT` | Move Left Paddle | Whole input group |
| `Slot 2 / PADDLE2_VERTICAL_INPUT` | Move Right Paddle | Whole input group |
| `COIN_INPUT` | Insert Coin and Start Game | 1 |

DIP settings:

- `winning_score` — Winning Score: 0: 11; 1: 15. Default index 0.

### Pong Doubles (`pongdoubles`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_VERTICAL_INPUT` | Move Outer Left Paddle | Whole input group |
| `Slot 2 / PADDLE2_VERTICAL_INPUT` | Move Outer Right Paddle | Whole input group |
| `Slot 3 / PADDLE3_VERTICAL_INPUT` | Move Inner Left Paddle | Whole input group |
| `Slot 4 / PADDLE4_VERTICAL_INPUT` | Move Inner Right Paddle | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `winning_score` — Winning Score: 0: 11; 1: 15. Default index 0.

### Rebound (`rebound`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_HORIZONTAL_INPUT` | Move Left Paddle | Whole input group |
| `Slot 2 / PADDLE2_HORIZONTAL_INPUT` | Move Right Paddle | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `winning_score` — Winning Score: 0: 11; 1: 15. Default index 0.
- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.

### Gotcha (`gotcha`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Move Cross | Whole input group |
| `Slot 2 / JOYSTICK2_INPUT` | Move Square | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

No active DIP descriptor exposed.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(297.0)`, range `K_OHM(47.0)` to `K_OHM(297.0)`.

### Space Race (`spacerace`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Move Left Rocket | Joystick::UP, Joystick::DOWN |
| `Slot 2 / JOYSTICK2_INPUT` | Move Right Rocket | Joystick::UP, Joystick::DOWN |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(970.0)`, range `K_OHM(470.0)` to `K_OHM(1470.0)`.

### Stunt Cycle (`stuntcycle`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / THROTTLE1_INPUT` | Adjust Motorcycle Speed | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start 1-Player Game | 1 |
| `START_INPUT` | Start 2-Player Game | 2 |

DIP settings:

- `misses` — Number of Misses Allowed: 0: 0; 1: 1; 2: 2; 3: 3; 4: 4; 5: 5; 6: 6; 7: 7. Default index 4.
- `free_game_control` — Free Game Control: 0: 12; 1: 13; 2: 14; 3: 15; 4: 16; 5: 17; 6: 18; 7: 19; 8: 20; 9: 21; 10: 22; 11: 23; 12: 24; 13: 25; 14: 26; 15: 27. Default index 9.
- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.
- `free_game_en` — Free Game: 0: Enabled; 1: Disabled. Default index 0.

### TV Basketball (`tvbasketball`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_VERTICAL_INPUT` | Move Left Striped Player | Whole input group |
| `Slot 2 / PADDLE2_VERTICAL_INPUT` | Move Right Solid Player | Whole input group |
| `Slot 3 / PADDLE3_VERTICAL_INPUT` | Move Right Striped Player | Whole input group |
| `Slot 4 / PADDLE4_VERTICAL_INPUT` | Move Left Solid Player | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

No active DIP descriptor exposed.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(35.0)`, range `K_OHM(10.0)` to `K_OHM(60.0)`.

### Breakout (`breakout`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_HORIZONTAL_INPUT` | Move Paddle | Whole input group |
| `Slot 1 / BUTTONS1_INPUT` | Serve Ball | 1 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start 1-Player Game | 1 |
| `START_INPUT` | Start 2-Player Game | 2 |

DIP settings:

- `bonus_credit` — Bonus Credit: 0: None; 1: 100; 2: 200; 3: 300; 4: 400; 5: 500; 6: 600; 7: 700; 8: 800. Default index 3.
- `cabinet_type` — Cabinet Type: 0: Normal; 1: Cocktail. Default index 0.
- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.
- `ball_count` — Ball Count: 0: 3; 1: 5. Default index 0.

### Anti-Aircraft (`antiaircraft`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / BUTTONS1_INPUT` | Fire Left Cannon | 1, 2, 3 |
| `Slot 2 / BUTTONS2_INPUT` | Fire Right Cannon | 1, 2, 3 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.
- `plane_type` — Plane Type: 0: Airplane; 1: UFO. Default index 0.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(830.0)`, range `K_OHM(220.0)` to `K_OHM(1220.0)`.

### Attack (`attack`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Move Ship | Joystick::LEFT, Joystick::RIGHT |
| `Slot 1 / JOYSTICK1_INPUT` | Rotate Gun | Joystick::UP, Joystick::DOWN |
| `Slot 1 / BUTTONS1_INPUT` | Fire Gun | 1 |
| `Slot 2 / JOYSTICK2_INPUT` | Rotate Plane | Joystick::LEFT, Joystick::RIGHT |
| `Slot 2 / BUTTONS2_INPUT` | Fire Gun | 1 |
| `Slot 2 / BUTTONS2_INPUT` | Increase Speed | 2 |
| `COIN_INPUT` | Insert Coin and Start Game | 1 |

No active DIP descriptor exposed.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(2500.0)`, range `K_OHM(1000.0)` to `K_OHM(3000.0)`.

### Shark Jaws (`sharkjaws`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Move Diver | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(970.0)`, range `K_OHM(470.0)` to `K_OHM(1470.0)`.

### Quadrapong (`quadrapong`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_VERTICAL_INPUT` | Move Left Paddle | Whole input group |
| `Slot 2 / PADDLE2_VERTICAL_INPUT` | Move Right Paddle | Whole input group |
| `Slot 3 / PADDLE3_HORIZONTAL_INPUT` | Move Top Paddle | Whole input group |
| `Slot 4 / PADDLE4_HORIZONTAL_INPUT` | Move Bottom Paddle | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.

### Jet Fighter (`jetfighter`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Rotate White Plane | Joystick::LEFT, Joystick::RIGHT |
| `Slot 1 / JOYSTICK1_INPUT` | Increase Speed | Joystick::UP |
| `Slot 1 / JOYSTICK1_INPUT` | Decrease Speed | Joystick::DOWN |
| `Slot 1 / BUTTONS1_INPUT` | Fire Gun | 1 |
| `Slot 2 / JOYSTICK2_INPUT` | Rotate Black Plane | Joystick::LEFT, Joystick::RIGHT |
| `Slot 2 / JOYSTICK2_INPUT` | Increase Speed | Joystick::UP |
| `Slot 2 / JOYSTICK2_INPUT` | Decrease Speed | Joystick::DOWN |
| `Slot 2 / BUTTONS2_INPUT` | Fire Gun | 1 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start 1-Player Game | 1 |
| `START_INPUT` | Start 2-Player Game | 2 |

DIP settings:

- `coinage` — Coinage: 0: 25 Cents/2 players; 1: 50 Cents/2 players. Default index 0.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(510.0)`, range `K_OHM(10.0)` to `K_OHM(1010.0)`.

### Crash 'N Score (`crashnscore`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / WHEEL1_INPUT` | Rotate White Car | Whole input group |
| `Slot 1 / BUTTONS1_INPUT` | Accelerate | 1 |
| `Slot 1 / BUTTONS1_INPUT` | Toggle Barriers | 2 |
| `Slot 2 / WHEEL2_INPUT` | Rotate Grey Car | Whole input group |
| `Slot 2 / BUTTONS2_INPUT` | Accelerate | 1 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start 1-Player Game | 1 |
| `START_INPUT` | Start 2-Player Game | 2 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.
- `bonus_credit` — Bonus Credit: 0: None; 1: 10; 2: 20; 3: 30; 4: 40; 5: 50; 6: 60; 7: 70; 8: 80; 9: 90. Default index 6.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(510.0)`, range `K_OHM(10.0)` to `K_OHM(1010.0)`.

### Crossfire (`crossfire`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / JOYSTICK1_INPUT` | Move Left Gun | Joystick::UP, Joystick::DOWN |
| `Slot 1 / BUTTONS1_INPUT` | Fire Gun | 1 |
| `Slot 2 / JOYSTICK2_INPUT` | Move Right Gun | Joystick::UP, Joystick::DOWN |
| `Slot 2 / BUTTONS2_INPUT` | Fire Gun | 1 |
| `COIN_INPUT` | Insert Coin and Start Game | 1 |

No active DIP descriptor exposed.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(1180.0)`, range `K_OHM(680.0)` to `K_OHM(1680.0)`.

### Pin Pong (`pinpong`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / BUTTONS1_INPUT` | Flip Left Flipper | 1 |
| `Slot 1 / BUTTONS1_INPUT` | Flip Right Flipper | 2 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game / Serve Ball | 1 |

DIP settings:

- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.
- `free_ball` — Free Ball: 0: Enabled; 1: Disabled. Default index 0.
- `ball_count` — Ball Count: 0: 3; 1: 5. Default index 0.

### Clean Sweep (`cleansweep`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_HORIZONTAL_INPUT` | Move Paddle | Whole input group |
| `Slot 1 / BUTTONS1_INPUT` | Serve Ball | 1 |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `replay` — Replay: 0: Disabled; 1: Enabled. Default index 1.
- `ball_count` — Ball Count: 0: 3; 1: 5. Default index 1.
- `coinage` — Coinage: 0: 1 Coin / 1 Credit; 1: 1 Coin / 2 Credits. Default index 0.

### Wipe Out (`wipeout`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / PADDLE1_VERTICAL_INPUT` | Move Left Paddle | Whole input group |
| `Slot 2 / PADDLE2_HORIZONTAL_INPUT` | Move Top Paddle | Whole input group |
| `Slot 3 / PADDLE3_VERTICAL_INPUT` | Move Right Paddle | Whole input group |
| `Slot 4 / PADDLE4_HORIZONTAL_INPUT` | Move Bottom Paddle | Whole input group |
| `COIN_INPUT` | Insert Coin | 1 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `misses` — Starting Score: 0: 5; 1: 7. Default index 0.

### Hi-Way (`hiway`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / WHEEL1_INPUT` | Steer Car | Whole input group |
| `Slot 1 / BUTTONS1_INPUT` | Accelerate | 1 |
| `COIN_INPUT` | Insert Coin and Start Game | 1 |

DIP settings:

- `ext_play` — Extended Play Score: 0: None; 1: 10; 2: 20; 3: 30; 4: 40; 5: 50; 6: 60; 7: 70; 8: 80; 9: 90; 10: 100; 11: 110; 12: 120; 13: 130; 14: 140; 15: 150. Default index 6.
- `concurrent_traffic` — Concurrent Traffic: 0: Regular; 1: Double. Default index 0.
- `opposing_traffic` — Opposing Traffic: 0: Regular; 1: Double. Default index 0.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(510.0)`, range `K_OHM(10.0)` to `K_OHM(1010.0)`.

### Steeplechase (`steeplechase`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / BUTTONS1_INPUT` | Jump (Bobin Robin) | 1 |
| `Slot 2 / BUTTONS2_INPUT` | Jump (Beetle Bomb) | 1 |
| `Slot 3 / BUTTONS3_INPUT` | Jump (Ash Can) | 1 |
| `Slot 4 / BUTTONS4_INPUT` | Jump (Mac's Nag) | 1 |
| `Slot 5 / BUTTONS5_INPUT` | Jump (Golden Boys) | 1 |
| `Slot 6 / BUTTONS6_INPUT` | Jump (Crazy Arnold) | 1 |
| `COIN_INPUT` | Insert Coin | 1 |
| `COIN_INPUT` | Insert Coin | 2 |
| `START_INPUT` | Start Game | 1 |

DIP settings:

- `game_time` — Game Time: 0: 90 Seconds; 1: 2 Minutes. Default index 0.
- `coinage` — Coinage: 0: 1 Coin / 2 Credit; 1: 1 Coin / 6 Credits. Default index 0.

### Indy 4 (`indy4`)

| Group | Action | Pins/directions |
| --- | --- | --- |
| `Slot 1 / WHEEL1_INPUT` | Rotate Green Car | Whole input group |
| `Slot 1 / BUTTONS1_INPUT` | Gas Pedal, Hand Brake | 1, 2 |
| `Slot 2 / WHEEL2_INPUT` | Rotate Cyan Car | Whole input group |
| `Slot 2 / BUTTONS2_INPUT` | Gas Pedal, Hand Brake | 1, 2 |
| `Slot 3 / WHEEL3_INPUT` | Rotate Violet Car | Whole input group |
| `Slot 3 / BUTTONS3_INPUT` | Gas Pedal, Hand Brake | 1, 2 |
| `Slot 4 / WHEEL4_INPUT` | Rotate Red Car | Whole input group |
| `Slot 4 / BUTTONS4_INPUT` | Gas Pedal, Hand Brake | 1, 2 |
| `COIN_INPUT` | Insert Coin (Green) | 1 |
| `COIN_INPUT` | Insert Coin (Cyan) | 2 |
| `COIN_INPUT` | Insert Coin (Violet) | 3 |
| `COIN_INPUT` | Insert Coin (Red) | 4 |
| `COIN_INPUT` | Insert Dollar Bill | 5 |

No active DIP descriptor exposed.

Potentiometers:

- `playtime` — Play Time: default `K_OHM(720.0)`, range `K_OHM(220.0)` to `K_OHM(1220.0)`.
