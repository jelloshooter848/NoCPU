# DICE 0.9 game inventory

All 21 games registered by DICE 0.9 are the NoCPU 1.0 scope (see the
[roadmap](ROADMAP.md)). This page records what the original source declares for
each game and what has been verified. Source declarations describe intended
capabilities, not verified gameplay.

## Port status

| Status | Games |
| --- | --- |
| Compiled by the core, ROM-free | Pong, Pong Doubles, Rebound, Gotcha, Space Race, TV Basketball, Breakout, Quadrapong, Crossfire, Pin Pong, Hi-Way |
| Compiled by the core, player-supplied ROM | Stunt Cycle, Indy 4 |
| Unported, ROM-backed | Anti-Aircraft, Attack, Shark Jaws, Jet Fighter, Crash 'N Score, Clean Sweep, Wipe Out, Steeplechase |

Pong, Pong Doubles, Space Race, Breakout, Stunt Cycle and Indy 4 had
original/native/Wasm comparison evidence in the legacy line (see [Verification
status](#verification-status)); legacy evidence is not a restarted-line pass.
On the restarted line those six passed their bounded original/native/Wasm
comparisons in 0.1.1, Rebound, Gotcha, Quadrapong and Crossfire passed
theirs in 0.2.0, and TV Basketball, Pin Pong and Hi-Way theirs in
0.3.0 ([ACCEPTANCE.md](ACCEPTANCE.md), with the coverage gaps listed there), and from 0.1.3 each release publishes a
desktop acceptance record of automated browser checks in Playwright's Chromium
and Firefox builds ([RELEASING.md](RELEASING.md#the-desktop-acceptance-record)).

## 0.2.0 batch survey (ROM-free batch A)

Rebound, Gotcha, Quadrapong and Crossfire, surveyed from the DICE 0.9 source
on 2026-10-16. Games from 0.2.0 on are ported through the registered-game
contract in [PORT_GAME.md](PORT_GAME.md). "Feasibility" is a short probe with
temporary definitions (native runner, two reset epochs of a 10 s replay, and
raw Wasm stepping in Node 22.22.0 on an Intel Xeon @ 2.10 GHz, 10 simulated
seconds after coin and Start): it shows the circuit constructs and runs, not
that it is accurate. Speeds compare with Pong at 7.8x and Breakout at 1.25x
real time in the same Wasm measurement.

| Game | Circuit | Inputs | Settings | Video / audio | Unusual | Feasibility | Effort and risks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rebound | `games/rebound.cpp` (1025 lines), 14.318 MHz | Two horizontal paddles (`PADDLE1/2_HORIZONTAL_INPUT`, 42–132 kΩ and 150–250 kΩ), Coin, one Start | DIP winning score 11/15, DIP coinage 1/2 credits; no potentiometer | Default monochrome 576 × 432; 454 × 262 pixel clocks per frame (measured); audio wired (E1.6, default gain 10) | Volleyball: paddles on the floor, net in the middle | Native 5.1x, Wasm 6.7x real time | **Ported in 0.2.0** (template). Its original scheduler delays an input up to 10.8 µs, above the default 10 µs sanity bound; the bound is declared per game and the skews are compared exactly |
| Gotcha | `games/gotcha.cpp` (1130 lines), 14.318 MHz | Two four-way digital joysticks (`JOYSTICK1/2_INPUT`, all four switches: cross and square), Coin, one Start | No DIP; play-time potentiometer `POT_555_ASTABLE` 47–297 kΩ, original default 297 kΩ (the maximum) | Default monochrome; audio wired through two `MIXER`s and a custom `PROXIMITY` tone chip (gain 10) | `PROXIMITY` keeps a function-local `static double v_cap` and writes `e8_555_desc.ctrl`; `CLK_GATE` "speed hack"; `BUFFER` | Constructs, reset epochs identical in the probe; native 2.0x, **Wasm 2.0x** real time, the heaviest of the batch | **Ported in 0.2.0.** Data-only contract plus one documented derived-source edit: `tools/prepare-core.py` moves PROXIMITY's `static double v_cap` to file scope so the cold reset zeroes it (both reset epochs are byte-identical, tone included); no other mutable static. Observed: the catch counter (G8/J8) and the play-time counter (K8/L8, the game ends as it passes 99, 104.9 s at 297 kΩ and 17.8 s at 47 kΩ), CATCHOS, START and the E8 proximity tone. One coin buys two games (the games-per-coin input is wired to VCC in DICE, an inherited TODO); coins do not accumulate. Each catch blanks the maze for 0.73 s; the maze changes shape in play; the tone beeps faster as the players line up across the screen. Floating point: run-time `exp`/`log` give different last bits in glibc 2.27, glibc 2.39 and musl, but every derived integer-picosecond delay is identical over the scenarios' 138998 control-voltage writes (see [ACCEPTANCE.md](ACCEPTANCE.md)). Browser speed on the test host: Playwright's Chromium and WebKit builds run it in real time (about 2.0x raw); its Firefox build does not (0.35x paced, 0.39x raw) |
| Quadrapong | `games/quadrapong.cpp` (1396 lines), 14.318 MHz | Four paddles: left/right vertical (`PADDLE1/2_VERTICAL_INPUT`, 17–145 kΩ), top/bottom horizontal (`PADDLE3/4_HORIZONTAL_INPUT`, 30–200 kΩ); Coin, one Start | DIP coinage; no potentiometer | `VIDEO_DESC` with 1 kΩ resistances and contrast 3.0; audio wired (B2.11) | Four players with mixed paddle orientations; `MISS_BUF` buffer against 12 ns glitches (inherited TODO) | Constructs, reset identical; native 3.6x, Wasm 5.3x | **Ported in 0.2.0.** Data-only contract plus one shared addition: J10's Q outputs are pruned by DICE, so the top/bottom counters' D stage is read through inverted score terms. One credit buys a two-player game (top and bottom walled), two credits a four-player game; the observed scores are the original miss counters. A ball can bounce in a corner pocket beside a parked paddle for many seconds (original behavior) |
| Crossfire | `games/crossfire.cpp` (1405 lines) + `games/crossfire.h`, 12.096 MHz | Two joysticks, Up/Down only (`JOYSTICK1/2_INPUT`), two Fire buttons (`BUTTONS1/2_INPUT` button 1); Coin starts the game (no Start switch) | No DIP; play-time potentiometer `POT_555_MONO` 680–1680 kΩ, default 1180 kΩ (also drives the custom `GNE` timer) | Default monochrome; HBLANK from a custom `HSYNC_MOD`; measured frame period 16253583360 ps in the probe; audio wired (K9.8) | Custom analog chips from "guesswork + simulation" (`JOYSTICK_VOLTAGE`, `SCAN_COMPARATOR`, `BULLET1/2_VOLTAGE`, `FIRE_SOUND_CV`, `GNE`); `FireSoundDesc.cap_v` relies on static zero-initialization; needs chips 7492 and 9321 (now compiled) | Constructs, reset identical; native 4.3x, Wasm 5.3x | **Ported in 0.2.0.** Data-only contract; the cold reset restores `FireSoundDesc` (capacitor voltage and astable) and the M9/L9/N9 descriptors, and needs no derived-source edit (the function-local statics are constants). The original wires joystick/buttons 1 to the left gun; the left score is L3/J3.5. Floating-point math: `crossfire.h`'s `exp`/`log` constants are folded identically by GCC 7.5, GCC 13.3 and Emscripten; the run-time `log` of the fire-sound 555 astables differs by one ULP between glibc 2.27, glibc 2.39 and Emscripten's musl for 34 of the 50228 reachable `ctrl` values, but every integer-picosecond delay derived from them is identical (exhaustive check, see [ACCEPTANCE.md](ACCEPTANCE.md)). Fire sets a bullet on the press (within 10 ms); holding does not repeat; the gun hides under the bottom border at its lower clamp; scores past 19 wrap (a toggling tens flip-flop) |

All four have active audio hookups. None uses a ROM. DICE's inaccuracies and
TODOs in these circuits are inherited and recorded, not fixed.

## 0.3.0 batch survey (ROM-free batch B)

TV Basketball, Pin Pong and Hi-Way, ported through the registered-game
contract from 2026-10-17; all three are playable in 0.3.0. Speeds below are
measured on a 4-vCPU Xeon @2.1 GHz CI-class host; may run below real time on slower machines (Playwright's Chromium 145.0.7632.6,
Firefox 146.0.1 and WebKit 26.0 builds, paced / raw held-clock stepping,
median of three runs; Pong in the same runs: 1.00/3.82, 0.93/1.09 and
1.00/1.72).

| Game | Circuit | Inputs | Settings | Video / audio | Unusual | Port notes |
| --- | --- | --- | --- | --- | --- | --- |
| TV Basketball | `games/tvbasketball.cpp` (1658 lines), 14.318 MHz | Four vertical paddles; the chip type selects the input (`PAD2` is `PADDLE4_VERTICAL_INPUT`, `PAD4` is `PADDLE2_…`), so paddle 1 is the left striped player, 2 the right solid, 3 the right striped, 4 the left solid; Coin, one Start | Play-time potentiometer `POT_555_ASTABLE` 10–60 kΩ on 9D, default 35 kΩ; no DIP | Four-level video (contrast 1.5), 455 × 262 pixel clocks; audio wired (13F.3). Speed: Chromium 1.00/1.44, Firefox 0.30/0.36, WebKit 0.88/1.11 | One coin is a two-player game: paddle 1 moves both striped players, paddle 2 both solid players, paddles 3 and 4 move nobody; two coins before Start are a four-player game. Every coin stops VBLANK for about 0.53 s (the 3B one-shot), clears both scores and reloads the clock; in play it restarts the game as a two-player game. A ball in the right basket scores two for the striped team (left score), the left basket two for the solid team | **Ported in 0.3.0.** Data-only contract; no mutable static beyond the restored descriptors. The clock counts down from 120 once per 9D period (ln 2 (R + 30 kΩ) 22 µF): 73, 119 and 165 s at 10, 35 and 60 kΩ. A registered game may declare its coin's frame gap (`frame_gap_windows`). The 9D astable's run-time `log()` arguments are constants (its control voltage is never written) |
| Pin Pong | `games/pinpong.cpp` (1632 lines), 14.318 MHz | `BUTTONS1_INPUT` buttons 1/2 (left/right flipper), Coin, Start ("Start Game / Serve Ball") | DIP coinage, free ball, ball count 3/5 | `ROTATE_90`: the portrait 324 × 432 raster; 450 × 263 pixel clocks; **no audio hookup** ("TODO: Finish Sound"). Speed: Chromium 0.71/0.93, Firefox 0.15/0.18, WebKit 0.55/0.84 (below real time in all three) | The original's `OPTIMIZATION_HINT` tables need about 590 MB in Wasm (840 MB native); the Wasm memory limit was raised to 2 GiB for it | **Ported in 0.3.0.** Portrait-raster contract (`portrait`), mouse-button flippers. Start serves each ball; the score shows ten times the counted value. The free-ball award (all knockdown targets) is not reached by any scenario |
| Hi-Way | `games/highway.cpp` + `highway.h` (1654 lines; DICE ID `hiway`), 12.096 MHz | `WHEEL1_INPUT` quadrature steering wheel, `BUTTONS1` button 1 accelerator, Coin starts (no Start) | DIP extended-play score (`DIPSWITCH_4SPST`, None/10–150, default 60), concurrent and opposing traffic regular/double; play-time potentiometer 10–1010 kΩ on E9, default 510 kΩ | Default monochrome; **no audio hookup** (commented "todo: needs work"). Speed: Chromium 0.51/0.98, Firefox 0.16/0.25, WebKit 0.41/0.80 (below real time in all three) | Custom `HIGHWAY_SPEED_CONTROL` (run-time `exp()` of 16 input combinations), 2533 RAM, wired-AND chips | **Ported in 0.3.0.** Wheel contract (`wheels`, replay `wheelN`/`wheelleftN`/`wheelrightN`); prepare-core maps `hiway` to `highway.cpp`. A game with wheels leaves BUTTONS button 3 unassigned (it shared a joystick button with the wheel's left key). The game lasts ln 3 (R + 470 kΩ) C + 7 ln 2 (R + 940 kΩ) C (C = 10 µF): 51.4, 81.1 and 110.9 s at 10, 510 and 1010 kΩ; reaching the extended-play score clears the clock. A coin in play clears the score only. All 18 run-time `exp()` arguments give identical, correctly rounded bits in glibc 2.27, glibc 2.39 and musl |

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
| Rebound | Original/native/Wasm comparison passes for `rebound-default` and `rebound-15-two-credits` (0.2.0 run, [ACCEPTANCE.md](ACCEPTANCE.md)): coin/Start rules, each horizontal paddle across its half, paddle contacts, scoring, game end at 11 and 15, coin/Start and second-credit restarts, exact full-RGB snapshots. Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds (automated, [ACCEPTANCE.md](ACCEPTANCE.md)) |
| Restarted line, six compiled games | Original/native/Wasm comparisons pass for the bounded scenarios in [ACCEPTANCE.md](ACCEPTANCE.md) (0.1.1; re-run with the ABI 5 core in 0.2.0). Automated browser tests pass in Playwright's Chromium, Firefox and WebKit builds in CI (Stunt Cycle and Indy 4 from private ROMs, Chromium and Firefox only); from 0.1.3 each release publishes them as its desktop acceptance record. No manual check in a release desktop browser is recorded yet |
| Quadrapong | Original/native/Wasm comparison passes for `quadrapong-default` and `quadrapong-two-credits` (0.2.0 Quadrapong run, [ACCEPTANCE.md](ACCEPTANCE.md)): no-credit Start, coin without Start, one- and two-credit games, each of the four paddles across its side alone, contacts by all four paddles, each miss counted once, game end with one player left, restarts, exact full-RGB snapshots (contrast 3.0 raster). Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds (automated, [ACCEPTANCE.md](ACCEPTANCE.md)) |
| Crossfire | Original/native/Wasm comparison passes for `crossfire-default`, `crossfire-min-time` and `crossfire-max-time` (0.2.0 Crossfire run, [ACCEPTANCE.md](ACCEPTANCE.md)): coin starts (Fire in attract or after the end does not), each stick over its full range alone, one bullet per press with held and in-flight presses, hits ending the bullet, one point per goal for the shooter, play time and GNE warning at 680, 1180 and 1680 kΩ, a coin in play ignored, restarts with cleared scores, exact full-RGB snapshots. Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds (automated, [ACCEPTANCE.md](ACCEPTANCE.md)) |
| Gotcha | Original/native/Wasm comparison passes for `gotcha-default`, `gotcha-min-time` and `gotcha-mid-time` (0.2.0 Gotcha run, [ACCEPTANCE.md](ACCEPTANCE.md)): Start needs a credit, one coin buys two games, coins in play ignored, each of the eight stick directions moves only its player, catches counted one each, maze blanking and change, play time at 47, 172 and 297 kΩ, game end at 99, the proximity tone, restarts with cleared counters, both reset epochs identical, exact full-RGB snapshots. Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds (automated, [ACCEPTANCE.md](ACCEPTANCE.md)); in Playwright's Firefox build it runs at only about 0.35x real time on the test host |
| TV Basketball | Original/native/Wasm comparison passes for `tvbasketball-default`, `tvbasketball-four-players` and `tvbasketball-max-time` (0.3.0 run, [ACCEPTANCE.md](ACCEPTANCE.md)): Start needs a credit, one and two coins choose the two- and four-player games, which players each paddle moves, two points a basket for each side, coins clearing the scores (and in play restarting the game), the clock at 10, 35 and 60 kΩ, exact full-RGB snapshots. Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds |
| Hi-Way | Original/native/Wasm comparison passes for `hiway-default`, `hiway-extended-play` and `hiway-double-traffic` (0.3.0 run): the coin starting a cleared game, wheel turns by axis and by keys, the accelerator, distance scoring, play time at 10, 510 and 1010 kΩ, extended play at 10 points, double traffic, a coin in play. Its browser tests pass in Playwright's Chromium, Firefox and WebKit builds. Runs below real time in all three (measured on a 4-vCPU Xeon @2.1 GHz CI-class host; may run below real time on slower machines). Inherits DICE's absent audio |
| Pin Pong | Original/native/Wasm comparison passes for `pinpong-default`, `pinpong-five-balls` and `pinpong-two-credits` (0.3.0 run, [ACCEPTANCE.md](ACCEPTANCE.md)): coin and Start rules, one coin buying one or two games, Start serving each ball, each flipper rising alone while held, scoring, game end after three and five balls, the free ball disabled, the portrait raster, exact full-RGB snapshots; the free-ball award is not reached. Its browser tests (both flippers by keyboard, mouse buttons and gamepad, the DIP settings) pass in Playwright's Chromium, Firefox and WebKit builds. Runs below real time in all three (measured on a 4-vCPU Xeon @2.1 GHz CI-class host; may run below real time on slower machines). Inherits DICE's absent audio |
| Eight unported games | Source-inventoried only; no render or play claim |
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
