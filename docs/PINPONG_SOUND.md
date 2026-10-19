# Pin Pong sound and free-game select (reconstructed)

DICE 0.9 leaves two parts of Pin Pong unfinished: its sound (`// TODO: Finish
Sound` in `upstream/dice-0.9/games/pinpong.cpp`, no output reaches the AUDIO
chip) and the free-game score select (`// TODO: FREE GAME SELECT`, the
free-game flip-flop's preset tied to VCC). The owner approved reconstructing
both from Atari's schematic in 0.4.0 (ROADMAP decision of 2026-10-18), as the
first opt-in exception to reproducing only what DICE implements. This page
records the circuit, the model, its derivations and how it is checked.

Everything here comes from component values on the schematic and from data
sheets. **No recording of a real Pin Pong cabinet was used**; none was found.
The result is NoCPU's reconstruction, labelled as such in the game's help, the
changelog and the comparison reports, and not a DICE behavior.

## Sources

- Atari, *Pin Pong Operation and Maintenance Manual* TM-007, schematic Rev G,
  drawing 001660 sheet 3 (PDF page 12): "SOUND", "SCORE", "FREE GAME OPTIONS"
  and "POWER"; parts list 001660-01 (MFC6040, NE566, 0.22 µF Mylar, 470 pF
  mica, 2N3643, 1N914). Public copy:
  <https://archive.org/details/ArcadeGameManualPinpong>. The manual is linked
  only; it is not in this repository.
- Motorola MC3340P data sheet, rev 6 (the DIP version of the MFC6040
  electronic attenuator; no MFC6040 data sheet was found): Fig. 2 (internal
  schematic), Fig. 3 (attenuation versus control voltage), Fig. 4
  (attenuation versus control resistor), Fig. 6 (output swing), the +13 dB
  gain and the application circuit.
- Signetics/National NE566 data sheet: f = 2 (V+ − Vc) / (R1 C1 V+), valid
  for 0.75 V+ ≤ Vc ≤ V+ and 2 kΩ ≤ R1 ≤ 20 kΩ; triangle output 2.4 Vpp typical.
- 2N3643 data sheet: hFE at least 100.

## The circuit (sheet 3)

All values below were read from the sheet and are legible; none was guessed.

| Part | Role |
| --- | --- |
| A5 9602 (pin 10), F1 7474 (D = SERVE_n, CLK = A5.10, /CLR = VRST_n) | The hit pulse: F1.Q (pin 9) rises when the hit one-shot fires during play and falls at the next vertical reset, so it lasts 0–16.7 ms |
| R53 1K, Q8 2N3643 (emitter to ground) | F1.Q turns Q8 on; its collector discharges C33 |
| C33 100 µF ("DECAY"), B10 MFC6040 pin 2 | The attenuator's control pin; C33 recharges from the pin's own internal source after the pulse, so the tone fades |
| D9-2 (pins 8–13) Q-bar → D19, R47 15K | Latched slingshot hit (10 points) |
| D9-2 (pins 1–6) Q-bar → D20, R48 12K | Latched 100-point object |
| D9-1 (pins 1–6) Q-bar → D18, R46 4.7K | Latched cross centre (1000 points) |
| D9-1 (pins 8–13) Q-bar → D17, R45 27K | Latched moving-flipper hit (no score; DICE prunes this latch because nothing it simulates reads it) |
| R41 10K TONE (rheostat), R49 220Ω from +14 V | Pull-up of the NE566 control input; each latch's diode pulls it down |
| C10 NE566: R1 2.2K (pin 6), C26 0.22 µF Mylar (pin 7), C21 0.1 µF bypass | The VCO; its triangle output (pin 4) is the tone |
| R43 100Ω / R42 4.7K, C23 5 µF | Divider and coupling into B10 pin 3 |
| B10 MFC6040 (pin 5 out, C29 470 pF roll-off) | Electronic attenuator |
| C31 10 µF, R60 47K, R59 5K VOLUME, A10 LM380, C35 500 µF | Volume, power amplifier and speaker |
| J3 (A9 outputs) | Score increments to an optional chime unit (not modelled: optional, and the unit is not on the sheet) |

The four D9 latches are preset by their object's contact and cleared by the
next hit's clock (D = ground, CLK = D8.8), so they hold the last object hit.
DICE simulates the three scoring latches (their Q outputs feed the score
counters through A9); the flipper latch is emulated by the model from its
original inputs C8.3 (preset) and D8.8 (clock).

The free-game select: the C6 7490 (the 10,000s digit of the displayed score,
which shows ten times the counted value) outputs M, N, O, P (QA..QD) go to a
jumper block whose terminals 1 and 2 feed the C5 NAND gate (pins 9, 10 → 8),
whose output presets the B5 7474 free-game flip-flop (pin 4). The schematic's
table:

| Score | Jumpers | C6 digit |
| --- | --- | --- |
| 10,000 | M to 1 & 2 | 1 |
| 20,000 | N to 1 & 2 | 2 |
| 30,000 | M to 1, N to 2 | 3 |
| 40,000 | O to 1 & 2 | 4 |
| 50,000 | M to 1, O to 2 | 5 |
| 60,000 | O to 1, N to 2 | 6 |
| 80,000 | P to 1 & 2 | 8 |
| 90,000 | P to 2, M to 1 | 9 |
| No free game | 3 (ground) to 1 & 2 | — |

"No free game" holds B5.4 high, exactly as DICE's `CONNECTION(VCC, "B5", 4)`.

## The model

`core/games/pinpong_sound.{h,cpp}` holds the sound board. `core/api.cpp`
feeds it the output transitions of six original pins (F1.9, D9-2.9, D9-2.5,
D9-1.5, C8.3, D8.8) through the read-only observation hook, and it writes PCM
at DICE's own sample instants k × 20,833,333 ps (48 kHz) after the AUDIO
chip's constructor sample. It never drives a pin and adds no event to DICE's
scheduler, so the circuit runs exactly as without it (an AUDIO-timer chip in
the netlist would add 48,000 events a second to DICE's binary heap, which is
not stable for simultaneous events). It integrates exactly over the
intervals between transitions and sample instants, all integer picoseconds,
so the samples depend only on the circuit's history and not on how a host
splits time into steps. It uses only IEEE-754 + − × ÷ and `floor`, with its
own series exponential, so native and Wasm give identical bytes.

1. **Pitch.** The node at NE566 pin 5 is +14 V through R41 + R49 against each
   conducting latch: Vc = (14/Rtop + Σ 0.85/Rk) / (1/Rtop + Σ 1/Rk), with a
   TTL low of 0.2 V (DICE's) plus a 1N914 drop of 0.65 V. Then
   f = 2 (14 − Vc) / (2.2 kΩ × 0.22 µF × 14 V) = 295.16 Hz/V × (14 − Vc).
2. **Waveform.** A symmetric triangle of 2.4 Vpp through the R43/R42 divider
   (× 0.979) into the attenuator.
3. **Envelope.** The MC3340's control pin behaves as a 7.39 V source behind
   4.7 kΩ at 16 V: fitting Fig. 4 (35 dB at 10 kΩ, 70 dB at 20 kΩ) to Fig. 3
   gives 4.73 kΩ and 7.39 V, matching the 4.7 kΩ at pin 2 in Fig. 2. Scaled
   to 14 V (the curves move in proportion to the supply) the source is
   6.47 V. With C33 the recharge time constant is τ = 4.7 kΩ × 100 µF =
   0.47 s. During F1.Q, Q8 sinks 100 × (3.4 − 0.7) V / 1 kΩ = 270 mA, so C33
   falls at 2.7 V/ms to 0.1 V (2.4 ms from rest).
4. **Attenuation.** Fig. 3 read at its 12 V and 16 V curves and interpolated
   to 14 V: 0 dB up to 3.80 V, 20 dB at 4.07 V, 40 dB at 4.56 V, 60 dB at
   5.11 V, 80 dB at 5.67 V, then the same slope, capped at 100 dB. The gain is
   13 dB minus that.
5. **Output.** The attenuator output is clipped at ±3.85 V (7.7 Vpp swing at
   14 V, Fig. 6), so a fresh hit is a flat-topped triangle. PCM is 4000 per
   volt (±15,400 at full drive, about Pong's loudest). The VOLUME control,
   LM380 and speaker are linear stages left to the player's volume setting;
   the C35/speaker high-pass (about 40 Hz for an 8 Ω speaker, which the
   sheet does not specify) is below the lowest tone and is not modelled.

### TONE trimmer

The factory setting of R41 is not documented. NoCPU exposes it as a Pin Pong
setting ("Tone (sound board trimmer)", the core's potentiometer) from 100 Ω to
1.5 kΩ, default 1.5 kΩ. Above about 1.49 kΩ the cross-centre state would leave
the NE566's specified control range (0.75 V+ = 10.5 V); at 1.5 kΩ it sits at
10.48 V, 0.2 % below that edge and well inside the uncertainty of the diode
drop. The limit is 100 Ω rather than 0 because NoCPU's replay tools read a
potentiometer of 0 as "the default".

| TONE | Flipper (27K) | Slingshot (15K) | 100 points (12K) | Cross centre (4.7K) |
| --- | --- | --- | --- | --- |
| 1.5 kΩ (default) | 232.4 Hz (Vc 13.21 V) | 399.3 Hz (12.65 V) | 486.6 Hz (12.35 V) | 1039.9 Hz (10.48 V) |
| 800 Ω | 141.3 Hz | 247.1 Hz | 304.1 Hz | 692.1 Hz |
| 100 Ω | 45.5 Hz | 81.1 Hz | 100.8 Hz | 247.4 Hz |

### Decay

From the end of a long hit pulse (C33 at 0.1 V), V(t) = 6.47 − 6.37 e^(−t/τ):

| Output level | Attenuation | Control voltage | Time after the pulse |
| --- | --- | --- | --- |
| below clipping | 2.7 dB | 3.83 V | 0.416 s |
| half drive (−6 dB) | 8.7 dB | 3.92 V | 0.430 s |
| −20 dB | 22.7 dB | 4.14 V | 0.472 s |
| −40 dB | 42.7 dB | 4.63 V | 0.585 s |
| silent (\|sample\| ≤ 1) | > 85 dB | > 5.8 V | about 1.2 s |

### Tolerances

The reconstruction is only as exact as its inputs: resistors ±5 %, the 0.22 µF
Mylar and the NE566's own frequency accuracy (data sheet: a few percent),
electrolytic C33 (−20/+50 % typical for the period), the MC3340's internal
4.7 kΩ and open-circuit voltage (fitted from two figures, about ±10 %), the
Fig. 3 reading (±0.1 V), β of Q8 (100–300: discharge 0.8–2.4 ms) and the
diode drop (0.6–0.7 V). A real board's pitches could differ by several
percent and its decay by tens of percent; the TONE trimmer was set by hand on
each machine. The checks below test the model against these nominal values,
not a cabinet.

## Free-game select

The default ("None", DICE's wiring) runs the original layout unchanged.
`tools/prepare-core.py` derives a second layout, `circuit_pinpong_free_game()`,
from the original text: it adds one NoCPU chip (`NOCPU_JUMPERS`, created
first so that it settles B5.4 high during construction, as VCC does) holding
the jumper choice and the C5 NAND (7400 delays), wired to C6 pins 12/9/8/11
and to B5.4. The core uses it only for a non-default choice (DIP bits 3–6).
The free game then works as the rest of DICE's circuit already does: B5.Q
(FREE GAME) enters the credit logic through J8.

## Verification

- **Video and logic are unchanged.** The original/native/Wasm comparison
  runs every Pin Pong scenario with the original receiving only the settings
  DICE has (`original_options` in `tools/reference/games/pinpong.py`: `dip &
  7`, no potentiometer). Frames, telemetry, inputs, collisions and events,
  now including F1.Q and the three scoring latches, must be byte-identical.
- **The PCM is compared native against Wasm only**, byte for byte in both
  reset epochs; the report marks the original↔native audio as "not compared:
  NoCPU reconstruction".
- **Analysis checks** (`sound_checks` in `tools/reference/games/pinpong.py`)
  on every native and Wasm epoch, against values computed from the component
  values above, not by re-running the model:
  - the constructor sample comes first and the stream covers the scenario;
  - silence (|sample| ≤ 1) before the first hit pulse and from 1.2 s after a
    pulse until the next;
  - every hit pulse makes the output louder, and every pulse of at least
    2.5 ms reaches full drive within 3 ms;
  - for each hit held at least 150 ms, the measured pitch (interpolated zero
    crossings) is within 0.5 % of the latched object's derived frequency;
  - for each isolated hit, the output falls below half drive, −20 dB and
    −40 dB within 6 ms of the derived times.
- **Free game:** `tools/probe-core-pinpong.mjs` plays a recorded game
  (`tests/replays/pinpong-free-game.tsv`, recorded closed-loop against the
  Wasm core: one coin, play past 10,000 points, let the balls drain, then
  Start once more without a coin) through the Wasm ABI with no free game,
  the 10,000 jumpers and the 20,000 jumpers. It checks that the 20,000 run
  plays exactly as DICE's wiring for the whole game; that the 10,000 run does
  too until the score reaches 10,000, after which only the score display
  blinks (B5.Q-bar reaches the video through H4 pin 12) and the final Start
  begins a free game; and that neither other setting gives one.
  `tools/replay-games.sh` runs it whenever Pin Pong scenarios are compared,
  and requires the 10,000 run to be byte-identical native↔Wasm in both reset
  epochs. There is no original to compare: DICE has no free-game select.
- **Free ball (DICE's own circuit):** the `pinpong-free-ball` scenario, also
  recorded closed-loop, knocks down all eight targets with one ball; it is
  compared with original DICE like the others and checks that the indicator
  lights and that the next serve is not counted. It runs with the TONE
  trimmer at 800 Ω and reaches all four latch pitches.
