# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Pin Pong (Atari, 1974) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"pinpong". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.

What the original circuit does, as observed here:

- The monitor is rotated (VIDEO_ORIENTATION ROTATE_90): the raster is the
  324x432 portrait crop, playfield at the top, flippers at the bottom.
- A coin is a credit (two with the coinage switch); Start ("Start Game /
  Serve Ball") begins a game with a credit, clearing the score, and serves the
  first ball; each later Start in a game serves the next ball once the
  previous one is lost. Each counted serve shifts a one into the N10 74164
  (score2, balls served).
- FLIPPERS button 1 raises the left flipper and button 2 the right one while
  held (row 324 of the portrait raster).
- score1 counts in tens of displayed points: the display shows it times ten.
  Bumpers and targets add 1, 10 or 100 (10, 100 or 1000 points); two objects
  latched by one contact add both at once.
- The game ends when the last ball (3 or 5 by the ball-count switch) is lost.
- DICE wires no circuit output to its AUDIO chip ("TODO: Finish Sound"): the
  original PCM is the audio chip's single constructor sample.

NoCPU additions reconstructed from Atari's schematic (owner decision
2026-10-18; docs/PINPONG_SOUND.md), never given to the original:

- Sound: the portable PCM is the constructor sample followed by the sound
  board model at 48 kHz. The checks below compare it with values derived
  from the schematic's components (no recording of a cabinet was used): the
  NE566 pitch for each latched object, the MFC6040 decay, a sound on each hit
  pulse F1.Q and silence otherwise. The original/native comparison leaves the
  PCM out; native and Wasm PCM must still be byte-identical.
- Settings: DIP bits 3-6 select the free-game score (0 = none, DICE's
  hard-wired behaviour) and the potentiometer is the TONE trimmer R41 in
  ohms (100..1500, default 1500). The original runs with dip & 7 and no pot.
"""
import array
import math
import sys

GAME = "pinpong"
CORE_ID = 11
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 236700 periods of the 14.318 MHz source clock (69840 ps).
FIRST_FRAME_PS = 15589532760
FRAME_PERIOD_PS = 16531128000
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 450 pixel clocks (2 source clocks each) by 263 lines"
HORIZONTAL_CLOCK_COUNTS = 450
VERTICAL_LINES = 263
MS = 10**9
NO_AUDIO_HOOKUP = True
RECONSTRUCTED_AUDIO = True
# Free-game options in DIP bits 3-6: the C6 digit (10,000s of displayed
# points) at which the jumpered outputs are all high (schematic table).
FREE_GAME_DIGITS = (None, 1, 2, 3, 4, 5, 6, 8, 9)
# The raised flippers are a dark row 324 across their side of the outlane.
FLIPPER_ROW = 324
FLIPPER_SPANS = {"left": (65, 124), "right": (170, 239)}
# One hit pulse adds 1, 10 or 100 through each latched object's A9 gate; two
# objects latched by one contact add both at once (110 seen in play).
STEPS = (1, 10, 100, 11, 101, 110, 111)


def valid_options(dip, pot):
    """S1 coinage (bit 0), S2 free ball (bit 1), S3 ball count (bit 2); NoCPU
    free-game select (bits 3-6, 0..8) and TONE trimmer (100..1500 ohms)."""
    return 0 <= dip < 128 and (dip >> 3) <= 8 and 100 <= pot <= 1500


def original_options(dip, pot):
    """Original DICE has neither the free-game select nor the sound board."""
    return dip & 7, 0


# Sound board constants from the schematic (TM-007 Rev G, sheet 3) and the
# NE566 / MC3340P data sheets; docs/PINPONG_SOUND.md derives each value.
V_PLUS = 14.0
HZ_PER_VOLT = 2.0 / (2200.0 * 0.22e-6 * V_PLUS)       # NE566: f = 2(V+ - Vc)/(R1 C1 V+)
V_PULL = 0.2 + 0.65                                   # TTL low + 1N914
LATCH_OHMS = {"slingshot": 15000.0, "100": 12000.0, "1000": 4700.0, "flipper": 27000.0}
V_OPEN, TAU = 7.39 * 14.0 / 16.0, 4700.0 * 100e-6     # MFC6040 control source; C33
Q5_SAT = 0.1
INPUT_PEAK = 1.2 * 4700.0 / 4800.0                    # NE566 triangle through R43/R42
OUT_PEAK, MAX_GAIN_DB = 3.85, 13.0
PCM_PER_VOLT = 4000.0
SAMPLE_PS = 20833333
ATTENUATION = ((3.80, 0.0), (4.07, 20.0), (4.56, 40.0), (5.11, 60.0), (5.67, 80.0))
DECAY_LEVELS = (("half", 0.5), ("minus20db", 0.1), ("minus40db", 0.01))


def expected_frequency(kind, tone_ohms):
    """NE566 frequency with one latch pulling pin 5 down (Thevenin node)."""
    top, pull = tone_ohms + 220.0, LATCH_OHMS[kind]
    control = (V_PLUS / top + V_PULL / pull) / (1.0 / top + 1.0 / pull)
    return HZ_PER_VOLT * (V_PLUS - control), control


def expected_decay_s(level):
    """Seconds after the hit pulse ends until the output peak falls below
    `level` of full drive: C33 recharges from Q5's saturation voltage towards
    the control pin's open-circuit voltage through its internal resistance."""
    attenuation = MAX_GAIN_DB - 20.0 * math.log10(level * OUT_PEAK / INPUT_PEAK)
    for (v0, a0), (v1, a1) in zip(ATTENUATION, ATTENUATION[1:]):
        if a0 <= attenuation <= a1:
            target = v0 + (v1 - v0) * (attenuation - a0) / (a1 - a0)
            return TAU * math.log((V_OPEN - Q5_SAT) / (V_OPEN - target))
    raise ValueError("attenuation outside the data-sheet curve")


def _index(time_ps):
    """First PCM index at or after a circuit time (index 0 is DICE's constructor sample)."""
    return -(-time_ps // SAMPLE_PS)


def _peak(samples):
    return max(map(abs, samples), default=0)


def _frequency(pcm, begin, end):
    """Rising zero crossings, interpolated between samples."""
    crossings = [i + pcm[i] / (pcm[i] - pcm[i + 1]) for i in range(begin, end - 1) if pcm[i] < 0 <= pcm[i + 1]]
    if len(crossings) < 3:
        return None
    return (len(crossings) - 1) / ((crossings[-1] - crossings[0]) * SAMPLE_PS * 1e-12)


def sound_checks(path, events, scenario, duration_ps):
    """Compare the reconstructed PCM with the schematic-derived expectations."""
    checks, controls = {}, {}
    pcm = array.array("h", (path / "audio.s16le").read_bytes())
    if sys.byteorder != "little":
        pcm.byteswap()
    tone, full_drive = scenario["pot_ohms"], int(OUT_PEAK * PCM_PER_VOLT)
    signal = lambda number: [(int(row["time_ps"]), int(row["value"])) for row in events if row["signal"] == str(number)]
    pulses, rise = [], None
    for time, value in signal(204):          # F1.Q, the hit pulse
        if value:
            rise = time
        elif rise is not None:
            pulses.append((rise, time))
            rise = None
    latches = {"slingshot": signal(205), "100": signal(206), "1000": signal(207)}

    def latched(at):
        held = [kind for kind, rows in latches.items() if [value for time, value in rows if time <= at][-1:] == [1]]
        return held[0] if len(held) == 1 else "flipper" if not held else None

    checks["constructor_sample_first"] = len(pcm) >= 1 and pcm[0] == 0
    checks["pcm_covers_the_scenario"] = abs(len(pcm) - 1 - duration_ps // SAMPLE_PS) <= 1
    controls["hit_pulses"] = len(pulses)
    # Silence before the first hit pulse and from 1.2 s after a pulse ends to
    # the next: the attenuator is then beyond 85 dB (|sample| <= 1).
    starts = [begin for begin, _ in pulses] + [duration_ps]
    windows = [(0, starts[0])]
    for _, end in pulses:
        following = min(time for time in starts if time > end) if any(time > end for time in starts) else duration_ps
        if following - end > 1_300 * MS:
            windows.append((end + 1_200 * MS, following))
    controls["silent_windows"] = len(windows)
    checks["silent_without_a_recent_hit"] = all(_peak(pcm[max(1, _index(a)):_index(b)]) <= 1 for a, b in windows)
    # Every pulse makes the output louder (unless already at full drive); a
    # pulse long enough to discharge C33 (2.4 ms at 270 mA) reaches full drive.
    onsets, long_pulses, full = 0, 0, 0
    for begin, end in pulses:
        before = _peak(pcm[max(1, _index(begin - 3 * MS)):_index(begin)])
        after = _peak(pcm[_index(begin):_index(begin + 30 * MS)])
        onsets += after > before or before >= full_drive - 1
        if end - begin >= 2_500_000_000:
            long_pulses += 1
            full += _peak(pcm[_index(begin + 3 * MS):_index(begin + 30 * MS)]) >= full_drive - 1
    controls["long_hit_pulses"] = long_pulses
    checks["sound_starts_on_every_hit_pulse"] = bool(pulses) and onsets == len(pulses)
    checks["full_drive_on_each_long_hit_pulse"] = long_pulses > 0 and full == long_pulses
    # Pitch of each latched object, on hits held for at least 150 ms.
    # The window also ends at the next latch change: a retriggered A5 can
    # latch another object without a new F1 pulse.
    latch_changes = sorted(time for rows in latches.values() for time, _ in rows)
    pitches = {}
    for index, (begin, _) in enumerate(pulses):
        following = min([starts[index + 1]] + [time for time in latch_changes if time > begin + 5 * MS])
        kind = latched(begin + 5 * MS)
        if kind is None or following - begin < 150 * MS:
            continue
        measured = _frequency(pcm, _index(begin + 5 * MS), _index(min(following, begin + 300 * MS)))
        expected, control = expected_frequency(kind, tone)
        pitches.setdefault(kind, []).append((measured, expected, control))
    controls["pitches"] = {kind: {"expected_hz": round(items[0][1], 3), "control_v": round(items[0][2], 4), "hits": len(items),
                                  "measured_hz": sorted({round(item[0], 2) for item in items if item[0]})}
                           for kind, items in pitches.items()}
    checks["pitch_of_each_latched_object_within_half_a_percent"] = bool(pitches) and all(
        measured is not None and abs(measured / expected - 1) <= 0.005 for items in pitches.values() for measured, expected, _ in items)
    # Decay of isolated long pulses: below half drive, -20 dB and -40 dB at the
    # derived times after the pulse ends, within 6 ms (5 ms windows, 48 kHz grid).
    decays = []
    for index, (begin, end) in enumerate(pulses):
        following = starts[index + 1]
        if end - begin < 2_500_000_000 or following - end < 1_000 * MS:
            continue
        measured = {}
        for label, level in DECAY_LEVELS:
            at = _index(end)
            while at < _index(following) and _peak(pcm[at:at + 240]) >= level * full_drive:
                at += 240
            measured[label] = round((at * SAMPLE_PS - end) / 1e12, 4)
        decays.append(measured)
    expected_decays = {label: round(expected_decay_s(level), 4) for label, level in DECAY_LEVELS}
    controls["decay_expected_s"] = expected_decays
    controls["decay_measured_s"] = decays[:5]
    controls["isolated_decays"] = len(decays)
    checks["decay_matches_the_component_values"] = bool(decays) and all(
        abs(item[label] - expected_decays[label]) <= 0.006 for item in decays for label in expected_decays)
    return checks, controls


def snapshot_objects(rgb, width, height):
    """Whether each flipper is raised (a dark flipper row across its side)."""
    if (width, height) != (324, 432):
        raise ValueError("Pin Pong renders the rotated 324x432 portrait raster")
    objects = {}
    for side, (left, right) in FLIPPER_SPANS.items():
        dark = sum(rgb[(FLIPPER_ROW * width + x) * 3] < 80 for x in range(left, right + 1))
        objects[f"{side}_flipper_up"] = dark >= 40
    return objects


def analyze(ctx):
    """Original Pin Pong behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    checks, controls = {}, {}
    state = ctx.state_at
    active = lambda milliseconds: state(milliseconds)["active"] == "1"
    score = lambda row: int(row["score1"])
    balls = lambda row: int(row["score2"])
    starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    presses = [time for time, action, value in replay if action == "start" and value == 1]
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    checks["games_begin_only_on_start"] = all(any(0 <= time - press <= 20 * MS for press in presses) for time in starts)
    for ms in scenario.get("no_credit_start_ms", []):
        checks[f"start_without_credit_does_not_start_{ms}"] = not active(ms + 500)
    if "coin_without_start_ms" in scenario:
        checks["coin_without_start_does_not_start"] = not active(scenario["coin_without_start_ms"])
    for ms in scenario["credit_start_ms"]:
        checks[f"start_at_{ms}_begins_a_cleared_game_and_serves"] = not active(ms - 1) and active(ms + 100) \
            and score(state(ms + 100)) == 0 and balls(state(ms + 100)) == 1
    controls["games"] = len(starts)
    checks["expected_game_count"] = len(starts) == len(scenario["credit_start_ms"])
    # Flippers: each button held alone raises only its flipper; released, both rest.
    for test in scenario.get("flipper_tests", []):
        held, rest = ctx.snapshot_at(test["held_ms"]), ctx.snapshot_at(test["rest_ms"])
        other = "right" if test["side"] == "left" else "left"
        checks[f"{test['side']}_flipper_rises_alone_while_held"] = held[f"{test['side']}_flipper_up"] is True \
            and held[f"{other}_flipper_up"] is False and rest["left_flipper_up"] is False and rest["right_flipper_up"] is False
    # Scores move only in play, by 1, 10 or 100 tens of points; serves add one ball each.
    previous, steps, bad, serves = None, {step: 0 for step in STEPS}, 0, 0
    for row in telemetry:
        now = (score(row), balls(row), row["active"])
        if previous is not None and now[:2] != previous[:2]:
            time = int(row["time_ps"])
            if any(0 <= time - start <= 20 * MS for start in starts) and now[:2] in ((0, 0), (0, 1)):
                pass  # Start clears the score and the ball count and serves the first ball
            elif now[1] != previous[1]:
                serves += 1
                bad += now[1] != previous[1] + 1 or now[0] != previous[0] or now[2] != "1"
            else:
                step = now[0] - previous[0]
                if step in steps and now[2] == "1" and previous[2] == "1":
                    steps[step] += 1
                else:
                    bad += 1
        previous = now
    controls["score_steps"] = steps
    controls["later_serves"] = serves
    checks["score_and_ball_counter_change_only_as_the_circuit_counts"] = bad == 0
    checks["play_scores_points"] = sum(steps.values()) >= 10
    # The game ends when the last ball the ball-count switch allows is lost.
    allowed = 5 if scenario["dip"] & 4 else 3
    controls["balls_at_end"] = [balls(state(end // MS - 1)) for end in ends]
    misses = [int(row["time_ps"]) for row in events if row["signal"] == "200" and row["value"] == "0"]
    checks["game_ends_after_the_last_ball"] = bool(ends) and all(
        balls(state(end // MS - 1)) == allowed and any(0 <= end - miss <= 2000 * MS for miss in misses) for end in ends)
    # Free ball: the indicator (K10.6) is cleared by Start; with the switch off it never lights.
    lit = [int(row["time_ps"]) for row in events if row["signal"] == "202" and row["value"] == "1" and int(row["time_ps"]) > 2 * MS]
    controls["free_ball_awards"] = len(lit)
    if scenario["dip"] & 2:
        checks["free_ball_disabled_never_awards"] = not lit
    if scenario.get("free_ball_award"):
        # All eight knockdown targets down in one ball (M1.8 low) clears K10:
        # the indicator lights; after the next lost ball, Start serves a ball
        # that the N10 counter does not count, and that serve clocks K10 and
        # puts the indicator out.
        uses = []
        for time in lit:
            miss = next((int(row["time_ps"]) for row in events if row["signal"] == "200" and row["value"] == "0"
                         and int(row["time_ps"]) > time), None)
            serve = next((int(row["time_ps"]) for row in events if row["signal"] == "201" and row["value"] == "1"
                          and miss is not None and int(row["time_ps"]) > miss), None)
            out = next((int(row["time_ps"]) for row in events if row["signal"] == "202" and row["value"] == "0"
                        and int(row["time_ps"]) > time), None)
            if miss is None or serve is None:
                continue
            uses.append({"lit_ps": time, "miss_ps": miss, "serve_ps": serve, "out_ps": out,
                         "balls_before": balls(state(miss // MS - 1)), "balls_after": balls(state(serve // MS + 100))})
        controls["free_ball_uses"] = uses
        checks["free_ball_awarded_and_its_serve_is_not_counted"] = bool(uses) and all(
            item["balls_after"] == item["balls_before"] and item["out_ps"] is not None
            and 0 <= item["out_ps"] - item["serve_ps"] <= 1000 * MS for item in uses)
    if ctx.original:
        checks["absent_dice_audio_is_one_constructor_sample"] = all(item["maximum"] == item["minimum"] == 0 for item in ctx.pcm_context)
    else:
        sound, controls["sound"] = sound_checks(ctx.path, events, scenario, ctx.duration_ps)
        checks.update(sound)
    return {"checks": checks, "controls": controls}
