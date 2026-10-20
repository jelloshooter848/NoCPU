# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Shark Jaws (Atari, 1975) behavior checks for the ROM-backed comparison.

Loaded by tools/reference/game_media.py for the "sharkjaws" scenarios of
tests/replays/rom-scenarios.json. tools/compare-rom-games.py runs these checks
on the original DICE capture (made with the player's ROMs) and requires every
native/Wasm stream to be byte-equal to it. No ROM byte is read here.

One player steers a diver with a four-way joystick (JOYSTICK1_INPUT, inverted
by XF so that a pressed switch is high) to catch small fish while a shark
hunts the diver. A catch fires the C9A one-shot (FISHSCORE, ln 3 * 470 kOhm *
1 uF), whose end clocks the 6F/6E score counters, cleared by START. When the
shark catches the diver, the 6H RESET flip-flop (clocked by the half-second
clock) removes the diver and puts it back when it falls. A credit and Start
begin the game; the N9A 555 ends it ln 3 * R * 100 uF after Start, R being
the play-time potentiometer. The whole raster is behind DICE's blue overlay.
"""

GAME = "sharkjaws"
CORE_ID = 14
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 476840 half periods (34920 ps) of the 14.318 MHz crystal.
FIRST_FRAME_PS = 16652253960
FRAME_PERIOD_PS = 16651252800
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 476840 half periods of the 14.318 MHz crystal"
# DICE's audio hookup is commented out ("dissapointing without the analog part").
NO_AUDIO_HOOKUP = True

POT_MIN, POT_MAX = 470000, 1470000
N9A_FARAD = 100e-6
LN_3 = 1.0986122886681098            # 555 monostable, as chips/555mono.cpp
TIMER_TOLERANCE_PS = 20 * 10**9
# FISHSCORE: the C9A one-shot, ln 3 * 470 kOhm * 1 uF = 0.5164 s.
FISHSCORE_PS = int(LN_3 * 470e3 * 1e-6 * 10**12)
FISHSCORE_TOLERANCE_PS = 2 * 10**9

FISHSCORE, RESET, START, TIMER, CREDIT = "200", "201", "202", "203", "204"
# The diver is the 24..32 x 18..24 component of the playfield (below the score
# digits, which end at row 100), the shark about 60 x 25 and a fish 10 x 8.
DIVER_SIZE = ((24, 32), (18, 24))
PLAYFIELD_TOP = 101
OVERLAY = (51, 191, 242)


def valid_options(dip, pot):
    """DSW1 coinage (bit 0); play time 470..1470 kOhm."""
    return type(dip) is int and dip in (0, 1) and type(pot) is int and POT_MIN <= pot <= POT_MAX


def _components(lit):
    found = []
    while lit:
        first = lit.pop()
        stack, pixels = [first], [first]
        while stack:
            x, y = stack.pop()
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    neighbor = (x + dx, y + dy)
                    if neighbor in lit:
                        lit.remove(neighbor)
                        stack.append(neighbor)
                        pixels.append(neighbor)
        xs, ys = [p[0] for p in pixels], [p[1] for p in pixels]
        found.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs) + 1, max(ys) - min(ys) + 1))
    return found


def snapshot_objects(rgb, width, height):
    """The diver's centre (None when absent or merged) and the raster's colours."""
    if (width, height) != (576, 432):
        raise ValueError("Shark Jaws renders the 576x432 landscape raster")
    colors = {tuple(rgb[i:i + 3]) for i in range(0, len(rgb), 3)}
    lit = {(i // 3 % width, i // 3 // width) for i in range(0, len(rgb), 3)
           if i // 3 // width >= PLAYFIELD_TOP and sum(rgb[i:i + 3]) > 120}
    divers = [(x, y) for x, y, w, h in _components(lit)
              if DIVER_SIZE[0][0] <= w <= DIVER_SIZE[0][1] and DIVER_SIZE[1][0] <= h <= DIVER_SIZE[1][1]]
    return {"diver": list(divers[0]) if len(divers) == 1 else None, "colors": sorted(colors)}


def score(state):
    return int(state["score1"])


def analyze(ctx):
    """Original Shark Jaws behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    ms = ctx.PS_PER_MS
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    pressed = lambda action: [time for time, name, value in replay if name == action and value == 1]
    coins, starts = pressed("coin"), pressed("start")
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    early = [time for time in starts if time < coins[0]]
    if early:
        checks["start_without_credit_does_not_start"] = not active(early[0] // ms + 200)
    checks["coin_alone_does_not_start"] = not active(coins[0] // ms + 200)
    game_starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    game_ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    controls["game_starts_ps"], controls["game_ends_ps"] = game_starts, game_ends
    checks["start_with_credit_begins_game"] = bool(game_starts) and any(
        0 <= game_starts[0] - press <= 50 * ms for press in starts)
    checks["start_clears_score"] = all(score(ctx.state_at(time // ms + 2)) == 0 for time in game_starts)
    if scenario.get("games") is not None:
        checks["games_started_match_credits"] = len(game_starts) == scenario["games"]
    for time in scenario.get("start_without_credit_ms", []):
        checks[f"start_without_credit_at_{time}ms_does_not_start"] = not active(time + 500)

    # Each stick direction moves the diver that way alone.
    for test in scenario.get("direction_tests", []):
        before, after = ctx.snapshot_at(test["before_ms"])["diver"], ctx.snapshot_at(test["after_ms"])["diver"]
        controls[f"diver_{test['direction']}"] = {"before": before, "after": after}
        moved = None if before is None or after is None else (after[0] - before[0], after[1] - before[1])
        expected = {"left": (-1, 0), "right": (1, 0), "up": (0, -1), "down": (0, 1)}[test["direction"]]
        checks[f"stick_{test['direction']}_moves_diver"] = moved is not None and all(
            (delta * sign >= 20) if sign else abs(delta) <= 2 for delta, sign in zip(moved, expected))

    # Scoring: one point for each catch, counted as the FISHSCORE one-shot ends.
    rises, increments, previous, bad = edges(FISHSCORE, "1"), [], None, 0
    for row in telemetry:
        now = score(row)
        if previous is not None and now != previous[0] and row["active"] == "1" and previous[1] == "1":
            bad += now != previous[0] + 1
            increments.append(int(row["time_ps"]))
        previous = (now, row["active"])
    controls["points"] = len(increments)
    checks["each_catch_scores_one_point"] = bad == 0 and len(increments) >= scenario.get("minimum_points", 3)
    checks["points_follow_the_fishscore_one_shot"] = all(
        any(abs(time - rise - FISHSCORE_PS) <= FISHSCORE_TOLERANCE_PS for rise in rises) for time in increments)
    checks["tens_digit_counts"] = not scenario.get("expect_tens") or max(score(row) for row in telemetry) >= 10

    # The shark: while RESET is high (after the cold start-up pulse) the diver
    # is gone; once it falls the diver is back.
    windows, start = [], None
    for row in events:
        if row["signal"] != RESET:
            continue
        time = int(row["time_ps"])
        if row["value"] == "1":
            start = time
        elif start is not None:
            windows.append((start, time))
            start = None
    windows = [(begin, end) for begin, end in windows if begin > 2 * 10**12]
    controls["shark_catches"] = len([1 for begin, end in windows if end - begin > 10**12])
    inside = [row for row in ctx.snapshots for begin, end in windows
              if begin + 100 * ms <= row["requested_ms"] * ms <= end - 50 * ms]
    after = [row for row in ctx.snapshots if any(end + 100 * ms <= row["requested_ms"] * ms
             and not any(b - 50 * ms <= row["requested_ms"] * ms <= e + 100 * ms for b, e in windows)
             for begin, end in windows) and active(row["requested_ms"])]
    controls["snapshots_while_caught"] = [row["requested_ms"] for row in inside]
    checks["shark_catches_the_diver"] = controls["shark_catches"] >= scenario.get("minimum_catches", 1)
    checks["caught_diver_is_gone"] = bool(inside) and all(row["diver"] is None for row in inside)
    checks["diver_returns_after_a_catch"] = any(row["diver"] is not None for row in after)

    # Play time: N9A ends the game ln 3 * R * C after Start.
    expected = LN_3 * scenario["pot_ohms"] * N9A_FARAD * 10**12
    games = [(begin, next((end for end in game_ends if end > begin), None)) for begin in game_starts]
    controls["play_time_ps"] = [end - begin if end else None for begin, end in games]
    complete = [(begin, end) for begin, end in games if end]
    checks["game_end_observed"] = len(complete) >= scenario.get("timed_games", 1)
    checks["play_time_matches_potentiometer"] = bool(complete) and all(
        abs((end - begin) - expected) <= TIMER_TOLERANCE_PS for begin, end in complete)
    # DICE's whole-screen blue overlay colours every lit pixel.
    colors = {tuple(color) for row in ctx.snapshots for color in row["colors"]}
    checks["blue_overlay_on_the_whole_raster"] = colors == {(0, 0, 0), OVERLAY}
    return {"checks": checks, "controls": controls}
