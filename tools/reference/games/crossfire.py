# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Crossfire (Atari, 1975) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"crossfire". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.

Each player moves a gun up and down a side of the court (Up/Down switches
charging or discharging the original JOYSTICK_VOLTAGE capacitor) and fires a
bullet across it. A bullet that hits the ball pushes it toward the far goal;
a ball in the opponent's goal scores one point. Coin starts the game at once
(there is no Start switch) and the N9 555 ends it after ln 3 * R * C, R being
the play-time potentiometer and C 100 uF; the custom GNE timer lights its
warning at -ln(2.2 / 5) * R * C. Observed scores are the original L3/J3.5
(left) and K3/J3.3 (right) counters.
"""
import math

GAME = "crossfire"
CORE_ID = 9
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 393216 half periods (41335 ps) of the 12.096 MHz crystal.
FIRST_FRAME_PS = 16127785905
FRAME_PERIOD_PS = 16253583360
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 393216 half periods of the 12.096 MHz crystal"

POT_MIN, POT_MAX = 680000, 1680000
N9_FARAD = 100e-6
LN_3 = 1.0986122886681098           # 555 monostable, as chips/555mono.cpp
GNE_TC = -math.log((5.0 - 2.8) / 5.0)  # crossfire.h GNE
# Game end and GNE are compared with the RC prediction to within one frame.
TIMER_TOLERANCE_PS = 20 * 10**9

# Original 576x432 raster: the score band ends at row 108 and the bottom band
# starts at row 408; guns occupy columns 27..55 (left) and 521..548 (right).
# At its upper clamp (1.15 V) a gun's first row is 111; past about 4.8 V it
# moves under the bottom band and is hidden.
GUN_COLUMNS = {1: 40, 2: 534}
PLAYFIELD_ROWS = (109, 407)
TOP_ROW = 111
# Event signals (core/games/crossfire.cpp): HIT and FIRE of the left and right guns.
HIT = {1: "200", 2: "201"}
FIRE = {1: "202", 2: "203"}
START, N9_TIMER, GNE = "204", "205", "206"
BUTTON = {1: "button11", 2: "button21"}
# A pressed Fire sets the bullet flip-flop within 10 ms (measured).
FIRE_LATENCY_PS = 10 * 10**9 + 10**6


def valid_options(dip, pot):
    """No DIP switch; the play-time potentiometer 680..1680 kOhm."""
    return dip == 0 and isinstance(pot, int) and not isinstance(pot, bool) and POT_MIN <= pot <= POT_MAX


def snapshot_objects(rgb, width, height):
    """First/last row of each gun in its column (None when hidden)."""
    if (width, height) != (576, 432):
        raise ValueError("Crossfire renders the 576x432 landscape raster")
    lit = lambda x, y: rgb[(y * width + x) * 3] > 150
    objects = {}
    for slot, column in GUN_COLUMNS.items():
        rows = [y for y in range(PLAYFIELD_ROWS[0], PLAYFIELD_ROWS[1] + 1) if lit(column, y)]
        objects[f"gun{slot}_first"] = rows[0] if rows and rows[-1] - rows[0] <= 6 else None
        objects[f"gun{slot}_last"] = rows[-1] if rows and rows[-1] - rows[0] <= 6 else None
    return objects


def scores(state):
    return [int(state["score1"]), int(state["score2"])]


def analyze(ctx):
    """Original Crossfire behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    ms = ctx.PS_PER_MS
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    # In play, and still in play 2 ms later: attract's own firing begins the
    # instant ATTRACT returns at the game end.
    playing = lambda time: active(time // ms) and active(time // ms + 2)
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    coins = [time for time, action, value in replay if action == "coin" and value == 1]
    presses = {slot: [time for time, action, value in replay if action == BUTTON[slot] and value == 1] for slot in (1, 2)}
    first_coin = coins[0] // ms
    early = [time for slot in (1, 2) for time in presses[slot] if time < coins[0]]
    if early:
        checks["fire_in_attract_does_not_start"] = not active(first_coin - 1)
    checks["coin_starts_game_without_start"] = not active(first_coin - 1) and active(first_coin + 50)
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    checks["attract_fires_by_itself"] = any(time < min([coins[0]] + early) for time in edges(FIRE[1], "1") + edges(FIRE[2], "1"))
    starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    controls["game_starts_ps"], controls["game_ends_ps"] = starts, ends
    checks["start_clears_scores"] = all(scores(ctx.state_at(time // ms)) == [0, 0] for time in starts)

    # Fire: during play every bullet follows a press of its own Fire button;
    # a held button fires once, and a press while the bullet flies is ignored.
    for slot in (1, 2):
        rises = [time for time in edges(FIRE[slot], "1") if playing(time)]
        falls = edges(FIRE[slot], "0")
        checks[f"gun{slot}_bullets_follow_presses"] = bool(rises) and all(
            any(0 <= time - press <= FIRE_LATENCY_PS for press in presses[slot]) for time in rises)
        for test in scenario.get("fire_tests", []):
            if test["slot"] != slot:
                continue
            begin, release = test["hold_ms"][0] * ms, test["hold_ms"][1] * ms
            held = [time for time in rises if begin <= time < release]
            checks[f"gun{slot}_held_fire_shoots_once"] = len(held) == 1 and any(held[0] < time < release for time in falls)
            first, second, following = (value * ms for value in test["tap_ms"])
            window = [time for time in rises if first <= time < following]
            flight_end = [time for time in falls if window and time > window[0]]
            checks[f"gun{slot}_press_during_flight_is_ignored"] = len(window) == 1 and window[0] - first <= FIRE_LATENCY_PS \
                and bool(flight_end) and flight_end[0] > second
            checks[f"gun{slot}_next_press_fires_again"] = any(0 <= time - following <= FIRE_LATENCY_PS for time in rises)
        # A bullet hitting the ball ends its flight at that instant.
        hits = [time for time in edges(HIT[slot], "1") if playing(time)]
        controls[f"gun{slot}_hits_during_play"] = len(hits)
        checks[f"gun{slot}_hits_ball_during_play"] = len(hits) >= 2 and all(
            any(abs(fall - time) <= 10**6 for fall in falls) for time in hits)

    # Scoring: each change during play adds one point to one player.
    increments, previous, mismatched = {1: [], 2: []}, None, 0
    for row in telemetry:
        now = scores(row)
        if previous is not None and row["active"] == "1" and previous[1] == "1":
            changes = [(slot, b - a) for slot, (a, b) in enumerate(zip(previous[0], now), 1) if b != a]
            for slot, change in changes:
                increments[slot].append(int(row["time_ps"]))
            mismatched += len(changes) > 1 or any(change != 1 for _, change in changes)
        previous = (now, row["active"])
    controls["points"] = {slot: len(times) for slot, times in increments.items()}
    checks["each_goal_scores_one_point_for_one_player"] = mismatched == 0
    checks["both_players_score"] = all(len(times) >= 2 for times in increments.values())
    # While only one player shoots, only that player scores.
    for window in scenario.get("solo_windows", []):
        slot, begin, end = window["slot"], window["ms"][0] * ms, window["ms"][1] * ms
        own = [time for time in increments[slot] if begin <= time < end]
        other = [time for time in increments[3 - slot] if begin <= time < end]
        checks[f"gun{slot}_alone_scores_{window['ms'][0]}ms"] = len(own) >= 1 and not other

    # Play time: N9 ends the game ln 3 * R * C after the coin; GNE warns at
    # -ln(2.2/5) * R * C; a coin during play changes neither.
    pot = scenario["pot_ohms"]
    expected_end = LN_3 * pot * N9_FARAD * 10**12
    expected_gne = GNE_TC * pot * N9_FARAD * 10**12
    gne_rises = edges(GNE, "1")
    games = [(start, next((end for end in ends if end > start), None)) for start in starts]
    controls["play_time_ps"] = [end - start if end else None for start, end in games]
    complete = [(start, end) for start, end in games if end]
    checks["game_end_observed"] = bool(complete)
    checks["play_time_matches_potentiometer"] = bool(complete) and all(
        abs((end - start) - expected_end) <= TIMER_TOLERANCE_PS for start, end in complete)
    checks["gne_warning_matches_potentiometer"] = bool(complete) and all(
        sum(start < time < end for time in gne_rises) == 1
        and any(abs((time - start) - expected_gne) <= TIMER_TOLERANCE_PS for time in gne_rises) for start, end in complete)
    during = [time for time in coins[1:] if any(start < time < end for start, end in complete)]
    if during:
        checks["coin_during_play_is_ignored"] = all(
            scores(ctx.state_at(time // ms + 200)) == scores(ctx.state_at(time // ms - 1))
            and len([start for start in starts if time < start < time + 500 * ms]) == 0 for time in during)
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)

    # Each stick moves only its own gun over the full range: held Up stops at
    # the upper clamp, held Down moves it steadily down and under the border.
    for sweep in scenario.get("stick_sweeps", []):
        slot, other = sweep["slot"], 3 - sweep["slot"]
        top = [ctx.snapshot_at(time) for time in sweep["top_ms"]]
        down = [ctx.snapshot_at(time) for time in sweep["down_ms"]]
        hidden = [ctx.snapshot_at(time) for time in sweep["hidden_ms"]]
        key, other_key = f"gun{slot}_first", f"gun{other}_first"
        positions = [snapshot[key] for snapshot in down]
        controls[f"gun{slot}_sweep"] = {"top": [snapshot[key] for snapshot in top], "down": positions,
                                        "hidden": [snapshot[key] for snapshot in hidden],
                                        "other_gun": sorted({snapshot[other_key] for snapshot in top + down + hidden}, key=str)}
        checks[f"gun{slot}_stick_covers_its_full_range_alone"] = all(snapshot[key] == TOP_ROW for snapshot in top) \
            and None not in positions and all(a < b for a, b in zip(positions, positions[1:])) \
            and all(snapshot[key] is None for snapshot in hidden) \
            and len({snapshot[other_key] for snapshot in top + down + hidden}) == 1

    after_end = scenario.get("fire_after_end_ms")
    if after_end is not None:
        checks["fire_after_end_does_not_start"] = not active(after_end + 500)
    restart = scenario.get("restart_ms")
    if restart is not None:
        before, after = ctx.state_at(restart - 500), ctx.state_at(restart + 500)
        checks["post_end_coin_restarts_with_cleared_scores"] = before["active"] == "0" and after["active"] == "1" \
            and scores(after) == [0, 0] and scores(before) != [0, 0]
        checks["restarted_game_scores"] = any(time > restart * ms for slot in (1, 2) for time in increments[slot])
    return {"checks": checks, "controls": controls}
