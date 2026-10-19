# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Anti-Aircraft (Atari, 1975) behavior checks for the ROM-backed comparison.

Loaded by tools/reference/game_media.py for the "antiaircraft" scenarios of
tests/replays/rom-scenarios.json. tools/compare-rom-games.py runs these checks
on the original DICE capture (made with the player's ROM) and requires every
native/Wasm stream to be byte-equal to it. Nothing here generates frames or
inputs, and no ROM byte is read: the checks use the captured telemetry, events
and full-RGB snapshots, which stay in ignored build/ output.

Two launchers at the bottom of the screen shoot at planes crossing the sky.
Each has three held buttons (BUTTONS1/2_INPUT i1..i3) multiplexed by J9 into
its K8/K9 aim latches: each button sets one of three barrel angles and fires.
The C4/C5 (left) and B4/B5 (right) 7490 counters count planes caught in that
launcher's missile burst (the B1 9602 one-shots LT_HIT and RT_HIT); START
clears them. A credit and Start begin the game; the D9 555 ends it after
ln 3 * R * 100 uF, R being the play-time potentiometer. A coin always presets
ATTRACT and resets D9 (E8.11 to D8.10 and D9.4): a coin inserted during a game
ends it. DIP "plane_type" selects the K1 PROM's airplane or UFO pictures.
"""

GAME = "antiaircraft"
CORE_ID = 13
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 475280 half periods (34920 ps) of the 14.318 MHz clock.
FIRST_FRAME_PS = 16597851600
FRAME_PERIOD_PS = 16596777600
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 475280 half periods of the 14.318 MHz clock"
# DICE wires no output to the audio chip of Anti-Aircraft (inherited absence).
NO_AUDIO_HOOKUP = True

POT_MIN, POT_MAX = 220000, 1220000
D9_FARAD = 100e-6
LN_3 = 1.0986122886681098            # 555 monostable, as chips/555mono.cpp
TIMER_TOLERANCE_PS = 20 * 10**9      # one frame and the 1 ms telemetry step

# Event signals (core/games/antiaircraft.cpp).
RT_HIT, LT_HIT, FIRE_RIGHT, FIRE_LEFT, START, D9_TIMER, CREDIT = "200", "201", "202", "203", "204", "205", "206"
HIT = {1: LT_HIT, 2: RT_HIT}
FIRE = {1: FIRE_LEFT, 2: FIRE_RIGHT}
# A pressed button sets its launcher's fire flip-flop within 30 ms: one 10 ms
# input poll and one 16.6 ms frame, whose V256 clocks the J8 fire flip-flops
# (measured at most 23.4 ms).
FIRE_LATENCY_PS = 30 * 10**9
# The B1 burst one-shots last about 0.28 s (9.1 kOhm, 100 uF); a point is
# counted while the plane meets the burst.
BURST_PS = 300 * 10**9

# Original 576x432 raster. Launchers occupy rows 355..431, the left one in
# columns 0..99 and the right one in 476..575. A barrel's topmost lit row and
# the columns lit there give its angle (measured on the original captures).
LAUNCHER_COLUMNS = {1: (0, 100), 2: (476, 576)}
LAUNCHER_ROWS = (355, 432)
AIM = {1: {(370, 47): "high", (370, 69): "middle", (384, 66): "low"},
       2: {(370, 518): "high", (370, 494): "middle", (384, 494): "low"}}
# Each launcher's buttons 1..3 select these angles (J9 wiring, measured).
BUTTON_AIM = {1: {1: "high", 2: "middle", 3: "low"}, 2: {1: "low", 2: "middle", 3: "high"}}
SKY_ROWS = 360
# Plane pictures: airplanes are 20-24 columns wide and 7-11 rows tall, UFOs
# 22-28 wide and 12-13 tall (both in formations of one or two).
PLANE_WIDTH = (20, 28)


def valid_options(dip, pot):
    """DSW1 coinage (bit 0) and DSW2 plane type (bit 1); play time 220..1220 kOhm."""
    return type(dip) is int and 0 <= dip <= 3 and type(pot) is int and POT_MIN <= pot <= POT_MAX


def _components(lit):
    found = []
    while lit:
        first = lit.pop()
        stack, pixels = [first], [first]
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbor = (x + dx, y + dy)
                    if neighbor in lit:
                        lit.remove(neighbor)
                        stack.append(neighbor)
                        pixels.append(neighbor)
        xs, ys = [p[0] for p in pixels], [p[1] for p in pixels]
        found.append((max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, len(pixels)))
    return found


def snapshot_objects(rgb, width, height):
    """Each launcher's aim and the heights of the plane pictures in the sky."""
    if (width, height) != (576, 432):
        raise ValueError("Anti-Aircraft renders the 576x432 landscape raster")
    lit = lambda x, y: rgb[(y * width + x) * 3] > 100
    objects = {}
    for slot, (left, right) in LAUNCHER_COLUMNS.items():
        points = [(x, y) for y in range(*LAUNCHER_ROWS) for x in range(left, right) if lit(x, y)]
        top = min((y for _, y in points), default=None)
        first = min((x for x, y in points if y == top), default=None)
        objects[f"launcher{slot}_aim"] = AIM[slot].get((top, first))
    sky = {(x, y) for y in range(SKY_ROWS) for x in range(width) if lit(x, y)}
    objects["plane_heights"] = sorted(h for w, h, _ in _components(sky) if PLANE_WIDTH[0] <= w <= PLANE_WIDTH[1])
    return objects


def scores(state):
    return [int(state["score1"]), int(state["score2"])]


def analyze(ctx):
    """Original Anti-Aircraft behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    ms = ctx.PS_PER_MS
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    pressed = lambda action: [time for time, name, value in replay if name == action and value == 1]
    coins, starts_pressed = pressed("coin"), pressed("start")
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    early_starts = [time for time in starts_pressed if time < coins[0]]
    if early_starts:
        checks["start_without_credit_does_not_start"] = not active(early_starts[0] // ms + 200)
    checks["coin_alone_does_not_start"] = not active(coins[0] // ms + 300)
    checks["attract_fires_both_launchers"] = all(any(time < coins[0] for time in edges(FIRE[slot], "1")) for slot in (1, 2))
    game_starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    game_ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    controls["game_starts_ps"], controls["game_ends_ps"] = game_starts, game_ends
    checks["start_with_credit_begins_game"] = bool(game_starts) and any(
        0 <= start - press <= 50 * ms for start in game_starts[:1] for press in starts_pressed)
    checks["start_clears_scores"] = all(scores(ctx.state_at(time // ms + 2)) == [0, 0] for time in game_starts)

    # Aim: a press sets that launcher's barrel angle (and only its own).
    for test in scenario.get("aim_tests", []):
        slot, button = test["slot"], test["button"]
        before, after = ctx.snapshot_at(test["before_ms"]), ctx.snapshot_at(test["after_ms"])
        other = 3 - slot
        expected = BUTTON_AIM[slot][button]
        controls[f"aim_{slot}{button}"] = {"before": [before["launcher1_aim"], before["launcher2_aim"]],
                                           "after": [after["launcher1_aim"], after["launcher2_aim"]]}
        checks[f"launcher{slot}_button{button}_aims_{expected}"] = after[f"launcher{slot}_aim"] == expected \
            and before[f"launcher{other}_aim"] == after[f"launcher{other}_aim"] is not None
    # Fire: every press in play fires within a frame; a held button refires.
    playing = lambda time: active(time // ms) and active(time // ms + 2)
    for slot in (1, 2):
        presses = [time for button in (1, 2, 3) for time in pressed(f"button{slot}{button}")]
        rises = edges(FIRE[slot], "1")
        # A press while that launcher's missile is still flying only aims.
        ready = [time for time in presses if playing(time) and playing(time + FIRE_LATENCY_PS)
                 and not _flying(time, rises, edges(FIRE[slot], "0"))]
        controls[f"launcher{slot}_presses_with_no_missile_in_flight"] = len(ready)
        checks[f"launcher{slot}_fires_on_each_press"] = bool(ready) and all(
            any(0 <= rise - time <= FIRE_LATENCY_PS for rise in rises) for time in ready)
        unpressed = [rise for rise in rises if playing(rise) and not any(0 <= rise - time <= FIRE_LATENCY_PS for time in presses)]
        controls[f"launcher{slot}_refires_while_held"] = len(unpressed)
        checks[f"launcher{slot}_held_button_refires"] = len(unpressed) >= 3 and all(
            _held(rise - FIRE_LATENCY_PS, replay, slot) or _held(rise, replay, slot) for rise in unpressed)

    # Scoring: each point is one launcher's, counted during its burst.
    increments = {1: [], 2: []}
    previous = None
    bad = 0
    for row in telemetry:
        now = scores(row)
        if previous is not None and row["active"] == "1" and previous[1] == "1":
            changes = [(slot, b - a) for slot, (a, b) in enumerate(zip(previous[0], now), 1) if b != a]
            bad += len(changes) > 1 or any(change != 1 for _, change in changes)
            for slot, _ in changes:
                increments[slot].append(int(row["time_ps"]))
        previous = (now, row["active"])
    controls["points"] = {slot: len(times) for slot, times in increments.items()}
    checks["each_point_is_one_launchers"] = bad == 0
    minimum = scenario.get("minimum_points", 2)
    checks["both_launchers_score"] = all(len(times) >= minimum for times in increments.values())
    checks["points_counted_during_that_launchers_burst"] = all(
        any(0 <= time - rise <= BURST_PS for rise in edges(HIT[slot], "1")) for slot in (1, 2) for time in increments[slot])
    checks["tens_digit_counts"] = scenario.get("expect_tens", False) is False or max(
        max(int(row["score1"]), int(row["score2"])) for row in telemetry) >= 10

    # Play time: D9 ends the game ln 3 * R * C after Start.
    expected = LN_3 * scenario["pot_ohms"] * D9_FARAD * 10**12
    games = [(start, next((end for end in game_ends if end > start), None)) for start in game_starts]
    controls["play_time_ps"] = [end - start if end else None for start, end in games]
    timed = [(start, end) for start, end in games if end and not any(start < coin < end for coin in coins)]
    checks["game_end_observed"] = len(timed) >= scenario.get("timed_games", 1)
    checks["play_time_matches_potentiometer"] = bool(timed) and all(
        abs((end - start) - expected) <= TIMER_TOLERANCE_PS for start, end in timed)
    for time in [coin for coin in coins if any(start < coin < (end or 10**30) for start, end in games)]:
        checks["coin_during_play_ends_game"] = not active(time // ms + 50) and any(abs(end - time) <= 20 * ms for end in game_ends)
    # Credits: the number of games one coin buys, then Start without a credit.
    expected_games = scenario.get("games")
    if expected_games is not None:
        checks["games_started_match_credits"] = len(game_starts) == expected_games
    for time in scenario.get("start_without_credit_ms", []):
        checks[f"start_without_credit_at_{time}ms_does_not_start"] = not active(time + 500)
    # Plane pictures: the DIP selects airplanes or UFOs (K1 address line A4).
    heights = [height for row in ctx.snapshots for height in row["plane_heights"]]
    controls["plane_heights"] = sorted(set(heights))
    ufo = bool(scenario["dip"] & 2)
    checks[f"planes_are_{'ufos' if ufo else 'airplanes'}"] = len(heights) >= 10 and all(
        (height >= 12) if ufo else (height <= 11) for height in heights)
    return {"checks": checks, "controls": controls}


def _flying(time, rises, falls):
    """True when that launcher's missile is already in flight at `time`."""
    last_rise = max((rise for rise in rises if rise < time), default=None)
    return last_rise is not None and not any(last_rise < fall <= time for fall in falls)


def _held(time, replay, slot):
    """True when one of that launcher's buttons is held at `time`."""
    state = {}
    for at, action, value in replay:
        if at > time:
            break
        if action.startswith(f"button{slot}"):
            state[action] = value
    return any(state.values())
