# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Gotcha (Atari, 1973) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"gotcha". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.

Two players steer a cross (JOYSTICK1) and a square (JOYSTICK2) through a maze
that keeps changing. When they meet, the B7 9602 catch one-shot (CATCHOS)
blanks the maze, advances the G8/J8 catch counter and the chase goes on. The
D8 555 astable clocks the K8/L8 play-time counter; the game ends when it
passes 99, ln 3 (R + 2k) C + 99 ln 2 (R + 4k) C after Start (R the play-time
potentiometer, C 5 uF). One coin buys two games: the C6 games-per-coin input
is wired to VCC in DICE (an inherited "should be connected to dip switch"
TODO), and coins do not accumulate. The custom PROXIMITY chip sets the E8 555
astable's control voltage from the players' relative position, so its beeps
speed up as the cross and the square line up across the screen.
"""
import math

GAME = "gotcha"
CORE_ID = 7
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 238944 periods of the 14.318 MHz source clock (69840 ps).
FIRST_FRAME_PS = 16688843120
FRAME_PERIOD_PS = 16687848960
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 456 pixel clocks (2 source clocks each) by 262 lines"

POT_MIN, POT_MAX = 47000, 297000
PS = 10**12
MS = 10**9
LN_2 = 0.6931471805599453          # chips/555astable.cpp
LN_3 = math.log(3.0)               # first high phase from reset: -ln((5 - 10/3) / 5)
D8_R2, D8_C = 2000.0, 5e-6
# E8, the proximity tone: low phase ln 2 * 100 kOhm * 1 uF, truncated to ps as
# chips/555astable.cpp does; the high phase follows the PROXIMITY control
# voltage, between 1.337 V and 4.8 V (gotcha.cpp), i.e. 50.3..769.5 ms.
E8_LOW_PS = int(LN_2 * 100000.0 * 1e-6 / 1e-12)
E8_HIGH_RANGE_PS = (50 * MS, 770 * MS)
# The game end is compared with the RC prediction to within one frame.
TIMER_TOLERANCE_PS = 20 * MS
# Event signals (core/games/gotcha.cpp): HIT is CATCHOS (B7.10).
CATCH, START, E8 = "0", "200", "201"
PLAYFIELD_TOP = 90                  # first raster row below the score digits
SLOTS = {"cross": 1, "square": 2}


def valid_options(dip, pot):
    """No DIP switch; the play-time potentiometer 47..297 kOhm."""
    return dip == 0 and isinstance(pot, int) and not isinstance(pot, bool) and POT_MIN <= pot <= POT_MAX


def snapshot_objects(rgb, width, height):
    """Centre of the cross and the square (None when not isolated from the
    maze) and the number of lit playfield pixels. Both players are seven
    raster rows tall and isolated: the square a solid block 6 or 7 pixels
    wide, the cross a sparse one 7 to 9 pixels wide; maze walls are longer and
    the maze's small blocks are shorter."""
    if (width, height) != (576, 432):
        raise ValueError("Gotcha renders the 576x432 landscape raster")
    lit = bytearray(width * height)
    for index in range(PLAYFIELD_TOP * width, width * height):
        if rgb[index * 3] > 150:
            lit[index] = 1
    seen = bytearray(width * height)
    objects = {"cross_x": None, "cross_y": None, "square_x": None, "square_y": None, "playfield_lit": 0}
    for start in range(PLAYFIELD_TOP * width, width * height):
        if not lit[start] or seen[start]:
            continue
        seen[start] = 1
        stack, area = [start], 0
        left = right = start % width
        top = bottom = start // width
        while stack:
            pixel = stack.pop()
            area += 1
            x, y = pixel % width, pixel // width
            left, right, top, bottom = min(left, x), max(right, x), min(top, y), max(bottom, y)
            for near in (pixel - 1 if x else -1, pixel + 1 if x < width - 1 else -1,
                         pixel - width if y > PLAYFIELD_TOP else -1, pixel + width if y < height - 1 else -1):
                if near >= 0 and lit[near] and not seen[near]:
                    seen[near] = 1
                    stack.append(near)
        objects["playfield_lit"] += area
        w, h = right - left + 1, bottom - top + 1
        if h == 7 and w in (6, 7) and area == w * h:
            objects["square_x"], objects["square_y"] = (left + right) // 2, (top + bottom) // 2
        elif h == 7 and 7 <= w <= 9 and area * 10 < w * h * 6:
            objects["cross_x"], objects["cross_y"] = (left + right) // 2, (top + bottom) // 2
    return objects


def play_time_ps(pot):
    """Start to game end: D8's first high phase from reset, then 99 periods."""
    return (LN_3 * (pot + D8_R2) + 99 * LN_2 * (pot + 2 * D8_R2)) * D8_C * PS


def analyze(ctx):
    """Original Gotcha behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    checks, controls = {}, {}
    state = ctx.state_at
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    games = [(start, next((end for end in ends if end > start), None)) for start in starts]
    complete = [(start, end) for start, end in games if end]
    playing = lambda time: any(start <= time < (end or 1 << 62) for start, end in games)
    # Telemetry samples each millisecond; the circuit's own edges at a game
    # start or end may precede the sample by up to that much.
    around_play = lambda time: any(start - MS <= time <= (end or 1 << 62) + MS for start, end in games)
    controls["game_starts_ps"], controls["game_ends_ps"] = starts, ends
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)

    # Coin and Start: Start needs a credit; one coin buys two games; a coin or
    # Start during play changes nothing.
    start_rises = edges(START, "1")
    for at in scenario.get("credit_start_ms", []):
        checks[f"start_{at}ms_begins_a_game"] = state(at - 1)["active"] == "0" and state(at + 200)["active"] == "1"
    for at in scenario.get("no_credit_start_ms", []):
        checks[f"start_{at}ms_without_credit_does_not_start"] = state(at - 1)["active"] == "0" and state(at + 500)["active"] == "0"
    if "coin_without_start_ms" in scenario:
        at = scenario["coin_without_start_ms"]
        checks["coin_alone_does_not_start"] = state(at + 400)["active"] == "0"
    for at in scenario.get("ignored_in_play_ms", []):
        before, after = state(at - 1), state(at + 500)
        checks[f"input_{at}ms_in_play_is_ignored"] = before["active"] == "1" and after["active"] == "1" \
            and not any(at * MS <= time <= at * MS + 100 * MS for time in start_rises) \
            and int(after["score2"]) >= int(before["score2"])
    checks["start_clears_both_counters"] = bool(starts) and all(
        state(time // MS + 50)["score1"] == "0" and state(time // MS + 50)["score2"] == "0" for time in starts)

    # Catches: CATCHOS also fires from START at a game start (the counters are
    # cleared then); every other catch in play adds exactly one to G8/J8, and
    # nothing else changes it during play.
    catches = [time for time in edges(CATCH, "1") if playing(time)
               and not any(0 <= time - start <= MS for start in start_rises)]
    controls["catches"] = len(catches)
    checks["catches_observed"] = len(catches) >= scenario.get("minimum_catches", 1)
    checks["each_catch_counts_one"] = all(
        int(state(time // MS + 50)["score1"]) == int(state(time // MS - 1)["score1"]) + 1 for time in catches)
    changes, previous = [], None
    for row in telemetry:
        if previous is not None and row["active"] == "1" and previous["active"] == "1" and row["score1"] != previous["score1"]:
            changes.append(int(row["time_ps"]))
        previous = row
    checks["catch_counter_changes_only_on_catches"] = len(changes) == len(catches) and all(
        any(0 <= change - time <= 2 * MS for time in catches) for change in changes)
    for window in scenario.get("solo_windows", []):
        mover, begin, end = window["mover"], window["ms"][0] * MS, window["ms"][1] * MS
        other = 3 - SLOTS[mover]
        idle = not any(begin <= time < end and value == 1 and action[-1] == str(other) for time, action, value in replay
                       if action[:-1] in ("up", "down", "left", "right"))
        checks[f"{mover}_alone_catches_{window['ms'][0]}ms"] = idle and any(begin <= time < end for time in catches)

    # The maze: blank while CATCHOS is high (only the players are drawn),
    # present otherwise, and changing shape during play.
    hits = [(int(row["time_ps"]), row["value"]) for row in events if row["signal"] == CATCH]
    blank = [(a[0], b[0]) for a, b in zip(hits, hits[1:]) if a[1] == "1" and b[1] == "0"]
    in_blank = [row for row in ctx.snapshots if any(a + 20 * MS <= row["requested_ms"] * MS <= b for a, b in blank)]
    shown = [row for row in ctx.snapshots if playing(row["requested_ms"] * MS)
             and not any(a - 20 * MS <= row["requested_ms"] * MS <= b + 20 * MS for a, b in blank)]
    controls["maze_pixels"] = {"blank": sorted({row["playfield_lit"] for row in in_blank}),
                               "shown": sorted({row["playfield_lit"] for row in shown})}
    checks["maze_blank_during_catch"] = bool(in_blank) and all(row["playfield_lit"] < 200 for row in in_blank)
    checks["maze_shown_and_changing_in_play"] = len(shown) >= 3 and all(row["playfield_lit"] > 10000 for row in shown) \
        and len({row["playfield_lit"] for row in shown}) >= 3

    # Play time: D8 clocks the K8/L8 counter once per period; the game ends on
    # its hundredth count, as the counter passes 99, after the RC prediction.
    pot = scenario["pot_ohms"]
    expected = play_time_ps(pot)
    controls["play_time_ps"] = [end - start for start, end in complete]
    controls["expected_play_time_ps"] = round(expected)
    checks["game_end_observed"] = len(complete) >= scenario.get("complete_games", 1)
    checks["play_time_matches_potentiometer"] = bool(complete) and all(
        abs((end - start) - expected) <= TIMER_TOLERANCE_PS for start, end in complete)
    steps, previous = [], None
    for row in telemetry:
        if previous is not None and row["active"] == "1" and previous["active"] == "1" and row["score2"] != previous["score2"]:
            steps.append((int(row["time_ps"]), int(row["score2"]) - int(previous["score2"])))
        previous = row
    period = LN_2 * (pot + 2 * D8_R2) * D8_C * PS
    gaps = [b[0] - a[0] for a, b in zip(steps, steps[1:]) if playing(a[0]) and not any(a[0] < start <= b[0] for start in starts)]
    controls["timer_step_ps"] = [min(gaps), max(gaps)] if gaps else None
    checks["timer_steps_by_one_each_d8_period"] = bool(steps) and all(step == 1 for _, step in steps) \
        and bool(gaps) and all(abs(gap - period) <= 2 * MS for gap in gaps)
    checks["game_ends_as_the_timer_passes_99"] = bool(complete) and all(
        state(end // MS - 2)["score2"] == "99" and state(end // MS + 2)["score2"] == "0" for _, end in complete)
    checks["catches_still_shown_after_end"] = bool(complete) and all(
        state(end // MS + 100)["score1"] == state(end // MS - 2)["score1"] for _, end in complete)

    # The proximity tone: E8 runs only in play (reset by ATTRACT_n); its low
    # phase is fixed, its high phase follows the PROXIMITY control voltage.
    tone = [(int(row["time_ps"]), row["value"]) for row in events if row["signal"] == E8]
    # A game end resets E8 (ATTRACT_n on its /RST): that cuts the phase it is in.
    cut = lambda a, b: any(a < end <= b + MS for end in ends)
    lows = [b[0] - a[0] for a, b in zip(tone, tone[1:]) if a[1] == "0" and b[1] == "1" and not cut(a[0], b[0])]
    highs = [(a[0], b[0] - a[0]) for a, b in zip(tone, tone[1:]) if a[1] == "1" and b[1] == "0" and not cut(a[0], b[0])]
    controls["tone_high_ms"] = [round(min(h for _, h in highs) / MS, 3), round(max(h for _, h in highs) / MS, 3)] if highs else None
    checks["tone_only_in_play"] = bool(tone) and all(around_play(time) for time, _ in tone)
    checks["tone_low_phase_is_fixed"] = bool(lows) and all(low == E8_LOW_PS for low in lows)
    checks["tone_high_phase_in_control_range"] = bool(highs) and all(
        E8_HIGH_RANGE_PS[0] <= high <= E8_HIGH_RANGE_PS[1] for _, high in highs)
    near, far = [], []
    for row in ctx.snapshots:
        time = row["requested_ms"] * MS
        if row["cross_x"] is None or row["square_x"] is None or not playing(time) \
                or any(a - 300 * MS <= time <= b for a, b in blank):
            continue
        phases = [high for start, high in highs if abs(start + high // 2 - time) <= 200 * MS]
        if not phases:
            continue
        separation = abs(row["cross_x"] - row["square_x"])
        (near if separation <= 20 else far if separation >= 120 else []).append(sum(phases) / len(phases))
    controls["tone_high_ms_near_far"] = [[round(value / MS, 1) for value in near], [round(value / MS, 1) for value in far]]
    checks["tone_beeps_faster_when_players_line_up"] = bool(near) and bool(far) and max(near) < min(far)
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)

    # Each stick direction moves only its own player, that way.
    for test in scenario.get("stick_tests", []):
        player, direction = test["player"], test["direction"]
        other = "square" if player == "cross" else "cross"
        rows = [ctx.snapshot_at(time) for time in test["ms"]]
        axis, sign = ("x", -1) if direction == "left" else ("x", 1) if direction == "right" else ("y", -1) if direction == "up" else ("y", 1)
        values = [row[f"{player}_{axis}"] for row in rows]
        still = {(row[f"{other}_x"], row[f"{other}_y"]) for row in rows}
        cross_axis = {row[f"{player}_{'y' if axis == 'x' else 'x'}"] for row in rows}
        controls[f"{player}_{direction}"] = values
        checks[f"{player}_{direction}_moves_only_the_{player}"] = None not in values \
            and all(sign * (b - a) >= 0 for a, b in zip(values, values[1:])) and sign * (values[-1] - values[0]) >= 6 \
            and len(cross_axis) == 1 and len(still) == 1 and None not in next(iter(still))
    return {"checks": checks, "controls": controls}
