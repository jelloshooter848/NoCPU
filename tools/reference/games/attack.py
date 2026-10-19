# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Attack (Exidy, 1977) behavior checks for the ROM-backed comparison.

Loaded by tools/reference/game_media.py for the "attack" scenarios of
tests/replays/rom-scenarios.json. tools/compare-rom-games.py runs these checks
on the original DICE capture (made with the player's ROMs, in either accepted
dump set) and requires every native/Wasm stream to be byte-equal to it. No ROM
byte is read here; the checks read the captured telemetry, events, PCM and
rasters, which stay in ignored build/ output.

A ship (JOYSTICK1/BUTTONS1) sails along the bottom and a plane
(JOYSTICK2/BUTTONS2) flies over it. Left and Right move the ship, Up and Down
turn its gun (Up toward the left, Down toward the right, as the bullets fly;
the browser test checks this), button 1 fires. Left and Right rotate the
plane (counter-clockwise and clockwise), button 1 fires and the held button 2
makes it faster. The ship's counters (L11/M11) count each fall of the plane
(shot down, flown into the sea or into the ship) as the PLN_FAL flip-flop (C4)
clears; the plane's (L12/M12) count each sunk ship (by the plane's bullets, a
collision, or a shot-down plane falling on it) as SNK_SHP ends. A coin starts the game
at once and CLK_SCR clears the scores; the E13 astable (play-time
potentiometer R plus 330 Ohm, 33 uF) ends it ln 3 (R + 330) C later. A coin
during a game neither restarts nor extends it. The plane's engine and the
shots, falls and sinkings drive the sound, gated by the game (CON_LTH).
"""
import csv

GAME = "attack"
CORE_ID = 16
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 262144 half periods (62500 ps) of the 8 MHz clock.
FIRST_FRAME_PS = 17408916500
FRAME_PERIOD_PS = 16384000000
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 262144 half periods of the 8 MHz clock"

POT_MIN, POT_MAX = 1000000, 3000000
E13_FARAD, E13_RB = 33e-6, 330.0
LN_3 = 1.0986122886681098
TIMER_TOLERANCE_PS = 20 * 10**9
# Events (core/games/attack.cpp).
PLN_FAL, SNK_SHP, SHP_BF_N, PLN_BF_N, E13, CLK_SCR = "200", "201", "202", "203", "204", "205"
FIRE_LATENCY_PS = 100 * 10**9
POINT_LATENCY_PS = 50 * 10**9
WIDTH, HEIGHT = 576, 432
SHIP_ROWS = (360, 381)       # the ship's band above the sea
PLANE_ROWS = (85, 355)       # below the score digits
GRAY_PLANE_ROWS = (23, 100)  # the same in the 160x120 observation raster
SEA_ROW = 95                 # a plane last seen below this gray row fell into the sea


def valid_options(dip, pot):
    """No DIP switch; play time 1000..3000 kOhm."""
    return type(dip) is int and dip == 0 and type(pot) is int and POT_MIN <= pot <= POT_MAX


def play_time_ps(pot):
    return int(LN_3 * (pot + E13_RB) * E13_FARAD * 10**12)


def snapshot_objects(rgb, width, height):
    """The ship's centre column, the plane's centre and the raster's colours."""
    if (width, height) != (WIDTH, HEIGHT):
        raise ValueError("Attack renders the 576x432 landscape raster")
    ship, plane = [], []
    for i in range(0, len(rgb), 3):
        if rgb[i] > 200:
            x, y = i // 3 % width, i // 3 // width
            if SHIP_ROWS[0] <= y < SHIP_ROWS[1]:
                ship.append(x)
            elif PLANE_ROWS[0] <= y < PLANE_ROWS[1]:
                plane.append((x, y))
    colors = sorted({tuple(rgb[i:i + 3]) for i in range(0, len(rgb), 3)})
    return {"ship": sum(ship) / len(ship) if len(ship) >= 20 else None,
            "plane": [sum(p[0] for p in plane) / len(plane), sum(p[1] for p in plane) / len(plane)] if len(plane) >= 20 else None,
            "colors": colors}


def _largest(points):
    best = []
    while points:
        first = points.pop()
        stack, group = [first], [first]
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbor = (x + dx, y + dy)
                    if neighbor in points:
                        points.remove(neighbor)
                        stack.append(neighbor)
                        group.append(neighbor)
        if len(group) > len(best):
            best = group
    return best


def _plane_centres(raw, frames):
    """Per-frame centre of the plane (the largest white blob above the ship) in the 160x120 raster."""
    centres = {}
    for index in frames:
        frame = raw[index * 19200:(index + 1) * 19200]
        blob = _largest({(i % 160, i // 160) for i, v in enumerate(frame)
                         if v == 255 and GRAY_PLANE_ROWS[0] <= i // 160 < GRAY_PLANE_ROWS[1]})
        centres[index] = (sum(p[0] for p in blob) / len(blob), sum(p[1] for p in blob) / len(blob)) if len(blob) >= 4 else None
    return centres


def _speed(times, centres, begin, end):
    """Mean speed (raster samples per second) between consecutive frames that both show the plane."""
    points = [(times[i], centres[i]) for i in sorted(centres) if begin <= times[i] < end and centres[i]]
    steps = [((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2) ** 0.5 / ((u - t) / 1e12)
             for (t, p), (u, q) in zip(points, points[1:]) if abs(q[0] - p[0]) < 40]
    return sum(steps) / len(steps) if len(steps) >= 6 else None


def analyze(ctx):
    """Original Attack behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    ms = ctx.PS_PER_MS
    checks, controls = {}, {}
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    pressed = lambda action: [time for time, name, value in replay if name == action and value == 1]
    game_starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    game_ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0 and item["time_ps"] > 10**12]
    controls["game_starts_ps"], controls["game_ends_ps"] = game_starts, game_ends
    in_play = lambda time: any(begin <= time < next((end for end in game_ends if end > begin), float("inf")) for begin in game_starts)

    # The coin starts the game (there is no Start switch) and clears the scores.
    coins = pressed("coin")
    idle_coins = [time for time in coins if not in_play(time)]
    play_coins = [time for time in coins if in_play(time)]
    checks["coin_starts_the_game_at_once"] = bool(idle_coins) and all(
        any(0 <= start - time <= 50 * ms for start in game_starts) for time in idle_coins)
    checks["no_game_before_the_coin"] = bool(coins) and not any(start < coins[0] for start in game_starts)
    checks["new_game_clears_the_scores"] = bool(game_starts) and all(
        [int(ctx.state_at(t // ms + 2)["score1"]), int(ctx.state_at(t // ms + 2)["score2"])] == [0, 0] for t in game_starts)
    clears = edges(CLK_SCR, "1")
    checks["score_clear_pulse_at_each_start"] = all(any(abs(clear - start) <= 50 * ms for clear in clears) for start in game_starts)
    if scenario.get("games") is not None:
        checks["games_started_match_coins_outside_play"] = len(game_starts) == scenario["games"]
    for time in scenario.get("coin_in_play_ms", []):
        checks[f"coin_at_{time}ms_in_play_neither_restarts_nor_clears"] = (
            in_play(time * ms) and not any(time * ms <= start <= time * ms + 500 * ms for start in game_starts)
            and not any(time * ms <= clear <= time * ms + 500 * ms for clear in clears))

    # The ship: Left and Right move it that way.
    for test in scenario.get("move_tests", []):
        before, after = ctx.snapshot_at(test["ms"][0])["ship"], ctx.snapshot_at(test["ms"][1])["ship"]
        controls[f"ship_{test['direction']}"] = [before, after]
        sign = -1 if test["direction"] == "left" else 1
        checks[f"ship_moves_{test['direction']}"] = before is not None and after is not None and (after - before) * sign >= 50

    # Fire: each bullet (SHP_BF_n, PLN_BF_n falling) follows its own button in play.
    for name, button, signal in (("ship", "button11", SHP_BF_N), ("plane", "button21", PLN_BF_N)):
        presses = pressed(button)
        shots = [time for time in edges(signal, "0") if in_play(time)]
        controls[f"{name}_shots"] = len(shots)
        checks[f"{name}_bullets_follow_its_fire_button"] = len(shots) >= 3 and all(
            any(0 <= shot - time <= FIRE_LATENCY_PS for time in presses) for shot in shots)

    # Scoring: the ship counts the plane's falls, the plane counts sunk ships;
    # each point lands as its flip-flop clears.
    falls, sinks = edges(PLN_FAL, "1"), edges(SNK_SHP, "1")
    for slot, name, signal in ((1, "ship", PLN_FAL), (2, "plane", SNK_SHP)):
        increments, previous = [], None
        for row in telemetry:
            value = int(row[f"score{slot}"])
            if previous is not None and value == previous + 1 and row["active"] == "1":
                increments.append(int(row["time_ps"]))
            previous = value
        clears_of_flag = edges(signal, "0")
        controls[f"{name}_points"] = len(increments)
        checks[f"{name}_scores"] = len(increments) >= scenario.get("minimum_points", 1)
        checks[f"{name}_points_follow_{'plane_falls' if slot == 1 else 'sunk_ships'}"] = all(
            any(0 <= time - clear <= POINT_LATENCY_PS for clear in clears_of_flag) for time in increments)
        checks[f"every_{'fall' if slot == 1 else 'sinking'}_in_play_scores"] = all(
            any(0 <= time - clear <= POINT_LATENCY_PS for time in increments)
            for clear in clears_of_flag if in_play(clear) and in_play(clear - 2 * 10**12))

    # How the plane fell: in the air (shot down) or into the sea; how the ship sank.
    with (ctx.path / "frames.csv").open() as stream:
        times = [int(row["time_ps"]) for row in csv.DictReader(stream)]
    raw = (ctx.path / "frames.gray").read_bytes()
    frame_before = lambda time: max(0, max((i for i, t in enumerate(times) if t < time - 40 * ms), default=0))
    kinds = []
    for fall in falls:
        index = frame_before(fall)
        seen = [c for c in _plane_centres(raw, range(max(0, index - 90), index + 1)).values() if c]
        centre = seen[-1] if seen else None
        # A plane flown into the ship sinks it in the same instant.
        collision = any(abs(sink - fall) <= 100 * ms for sink in sinks)
        # Shot down: in the air, with a ship bullet fired in the 2 s before.
        fired = any(0 <= fall - shot <= 2000 * ms for shot in edges(SHP_BF_N, "0"))
        kinds.append("collision" if collision else "sea" if centre and centre[1] >= SEA_ROW else "shot_down" if fired else "in_the_air")
    controls["plane_falls"] = kinds
    # A falling plane can still land on the ship; a sinking with no fall before it is the plane's shot.
    controls["ship_sinkings_without_a_fall"] = len([s for s in sinks if not any(-100 * ms <= s - f <= 2000 * ms for f in falls)])
    if scenario.get("expect_sea_fall"):
        checks["plane_flown_into_the_sea_falls"] = "sea" in kinds
    if scenario.get("expect_shot_down", True):
        checks["ship_shoots_the_plane_down"] = "shot_down" in kinds
    if scenario.get("expect_bombing", True):
        checks["plane_sinks_the_ship"] = controls["ship_sinkings_without_a_fall"] >= 1

    # The held button 2 makes the plane faster.
    test = scenario.get("faster_test")
    if test:
        t0, t1 = test["ms"][0] * ms, test["ms"][1] * ms
        frames = [i for i, t in enumerate(times) if t0 - 1000 * ms <= t < t1 + 1000 * ms]
        centres = _plane_centres(raw, frames)
        before, during, after = (_speed(times, centres, t0 - 1000 * ms, t0), _speed(times, centres, t0 + 200 * ms, t1),
                                 _speed(times, centres, t1 + 200 * ms, t1 + 1000 * ms))
        controls["plane_speed_before_during_after"] = [before, during, after]
        checks["held_button_2_makes_the_plane_faster"] = None not in (before, during, after) and during >= 2 * before and during >= 2 * after

    # Play time: E13 ends the game ln 3 (R + 330) C after the coin.
    expected = play_time_ps(scenario["pot_ohms"])
    games = [(begin, next((end for end in game_ends if end > begin), None)) for begin in game_starts]
    complete = [(begin, end) for begin, end in games if end]
    controls["play_time_ps"] = [end - begin for begin, end in complete]
    checks["game_end_observed"] = len(complete) >= 1
    checks["play_time_matches_potentiometer"] = bool(complete) and all(
        abs((end - begin) - expected) <= TIMER_TOLERANCE_PS for begin, end in complete)

    # Sound: the PCM moves during play.
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)
    colors = {tuple(color) for row in ctx.snapshots for color in row["colors"]}
    checks["white_objects_on_a_gray_sky"] = colors == {(0, 0, 0), (112, 112, 112), (255, 255, 255)}
    return {"checks": checks, "controls": controls}
