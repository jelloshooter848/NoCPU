# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Jet Fighter (Atari, 1975) behavior checks for the ROM-backed comparison.

Loaded by tools/reference/game_media.py for the "jetfighter" scenarios of
tests/replays/rom-scenarios.json. tools/compare-rom-games.py runs these checks
on the original DICE capture (made with the player's ROMs) and requires every
native/Wasm stream to be byte-equal to it. No ROM byte is read here; the
checks read the captured telemetry, events and the 160x120 observation
raster, which stay in ignored build/ output. Turning is compared exactly but
not checked here: the raster's resolution cannot tell a jet's heading
reliably; the browser test checks that Left and Right turn the jet that way.

Two jets fly on a gray sky: player 1 (JOYSTICK1/BUTTONS1) the white jet,
player 2 the black one. Left and Right turn a jet, Up makes it faster and
Down slower, the button fires a shell. A hit counts on the shooter's 7493:
B5 (white, shown right, HIT2) and A6 (black, shown left, HIT1); START clears
them. Coin and Start 1 or Start 2 begin the game; in a one-player game the
circuit's own pilot (the P5/R5/R6/R7 logic, selected through J8 by 1PLAY)
flies the black jet. DSW1 sets 25 or 50 cents for a two-player game. The K9
astable (play-time potentiometer R plus 470 kOhm, 10 uF) clocks the D5
counter, whose eighth count ends the game:
ln 3 (R + 470k) C + ln 2 470k C + 7 ln 2 (R + 940k) C.
"""
import csv
import math

GAME = "jetfighter"
CORE_ID = 15
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 417792 half periods (41335 ps) of the 12.096 MHz crystal.
FIRST_FRAME_PS = 32412889835
FRAME_PERIOD_PS = 17269432320
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 417792 half periods of the 12.096 MHz crystal"
# DICE does not implement Jet Fighter's sound circuits ("not implemented: ... sound circuits").
NO_AUDIO_HOOKUP = True

POT_MIN, POT_MAX = 10000, 1010000
K9_FARAD, K9_RB = 10e-6, 470e3
LN_2, LN_3 = 0.6931471805599453, 1.0986122886681098
TIMER_TOLERANCE_PS = 20 * 10**9
# Events (core/games/jetfighter.cpp).
HIT_BLACK, HIT_WHITE, SHELL_BLACK, SHELL_WHITE, START, ENDGAME_N, GNE_N, ONE_PLAY = (
    "200", "201", "202", "203", "204", "205", "206", "207")
# A hit counts on the shooter's counter about 0.09 s after its HIT pulse rises.
HIT_TO_POINT_PS = 200 * 10**9
FIRE_LATENCY_PS = 100 * 10**9
WIDTH, HEIGHT = 576, 432
SKY_TOP = 57                 # the score digits end above this row
GRAY_TOP = 16                # the same in the 160x120 observation raster
JET = {"white": 255, "black": 0}
SLOT = {1: "white", 2: "black"}


def valid_options(dip, pot):
    """DSW1 coinage (bit 0); play time 10..1010 kOhm."""
    return type(dip) is int and dip in (0, 1) and type(pot) is int and POT_MIN <= pot <= POT_MAX


def play_time_ps(pot):
    return int((LN_3 * (pot + K9_RB) * K9_FARAD + LN_2 * K9_RB * K9_FARAD + 7 * LN_2 * (pot + 2 * K9_RB) * K9_FARAD) * 10**12)


def snapshot_objects(rgb, width, height):
    """The sky's colours (white and black jets on gray)."""
    if (width, height) != (WIDTH, HEIGHT):
        raise ValueError("Jet Fighter renders the 576x432 landscape raster")
    return {"colors": sorted({tuple(rgb[i:i + 3]) for i in range(SKY_TOP * width * 3, len(rgb), 3)})}


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


def _gray_centres(path, frames, value):
    """Per-frame centre of the jet's largest blob in the 160x120 raster, or None."""
    raw = (path / "frames.gray").read_bytes()
    centres = {}
    for index in frames:
        frame = raw[index * 19200:(index + 1) * 19200]
        blob = _largest({(i % 160, i // 160) for i, v in enumerate(frame) if v == value and i // 160 >= GRAY_TOP})
        centres[index] = (sum(p[0] for p in blob) / len(blob), sum(p[1] for p in blob) / len(blob)) if len(blob) >= 4 else None
    return centres


def _speed(times, centres, begin, end):
    """Least-squares speed (raster samples per second) over the frames in [begin, end)."""
    points = [(times[i] / 1e12, c) for i, c in centres.items() if begin <= times[i] < end and c]
    if len(points) < 6:
        return None
    xs, ys = [points[0][1][0]], [points[0][1][1]]
    wrap = lambda d, m: (d + m / 2) % m - m / 2
    for (_, p), (_, q) in zip(points[1:], points):
        xs.append(xs[-1] + wrap(p[0] - q[0], 160))
        ys.append(ys[-1] + wrap(p[1] - q[1], 120 - GRAY_TOP))
    ts = [t for t, _ in points]
    mean = sum(ts) / len(ts)
    slope = lambda v: sum((t - mean) * (x - sum(v) / len(v)) for t, x in zip(ts, v)) / sum((t - mean) ** 2 for t in ts)
    return math.hypot(slope(xs), slope(ys))


def analyze(ctx):
    """Original Jet Fighter behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    ms = ctx.PS_PER_MS
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    pressed = lambda action: [time for time, name, value in replay if name == action and value == 1]
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    game_starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    game_ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    controls["game_starts_ps"], controls["game_ends_ps"] = game_starts, game_ends
    checks["start_clears_scores"] = bool(game_starts) and all(
        [int(ctx.state_at(t // ms + 2)["score1"]), int(ctx.state_at(t // ms + 2)["score2"])] == [0, 0] for t in game_starts)
    # Credits: the declared Start presses that do and do not begin a game.
    for test in scenario.get("start_tests", []):
        began = any(0 <= start - test["ms"] * ms <= 50 * ms for start in game_starts)
        checks[f"{test['action']}_at_{test['ms']}ms_{'starts' if test['starts'] else 'does_not_start'}"] = began == test["starts"]
    # 1PLAY falls as a two-player game starts and stays high in a one-player game.
    one_player = scenario["players"] == 1
    falls_at_start = lambda start: any(row["signal"] == ONE_PLAY and row["value"] == "0"
                                       and abs(int(row["time_ps"]) - start) <= 50 * ms for row in events)
    checks["one_play_signal_matches_the_game"] = bool(game_starts) and all(
        falls_at_start(start) != one_player for start in game_starts)

    # Fire: in play every shell follows its own player's button within 100 ms
    # (measured at most 88 ms: an input poll and the fire command's sampling
    # every few frames), and each player fires several.
    # Each jet has one shell circuit (Shell 1 and Shell 2 in the source), so
    # one shell in the air at a time.
    for slot, button, shell in ((1, "button11", SHELL_WHITE), (2, "button21", SHELL_BLACK)):
        presses = pressed(button)
        rises = [rise for rise in edges(shell, "1") if active(rise // ms) and rise > game_starts[0] + 100 * ms] if game_starts else []
        controls[f"{SLOT[slot]}_shells"] = len(rises)
        if presses or not one_player or slot == 1:
            checks[f"{SLOT[slot]}_shells_follow_its_button"] = len(rises) >= 3 and all(
                any(0 <= rise - time <= FIRE_LATENCY_PS for time in presses) for rise in rises)
    # Scoring: each point is the shooter's, after its HIT pulse.
    for slot, hit in ((1, HIT_WHITE), (2, HIT_BLACK)):
        increments, previous = [], None
        for row in telemetry:
            value = int(row[f"score{slot}"])
            if previous is not None and value == previous + 1 and row["active"] == "1":
                increments.append(int(row["time_ps"]))
            previous = value
        rises = edges(hit, "1")
        controls[f"{SLOT[slot]}_points"] = len(increments)
        checks[f"{SLOT[slot]}_jet_scores"] = len(increments) >= scenario.get("minimum_points", 1)
        checks[f"{SLOT[slot]}_points_follow_its_hits"] = all(
            any(0 <= time - rise <= HIT_TO_POINT_PS for rise in rises) for time in increments)

    # Speed: Up makes a jet faster and Down slower, measured on the raster.
    with (ctx.path / "frames.csv").open() as stream:
        times = [int(row["time_ps"]) for row in csv.DictReader(stream)]
    for test in scenario.get("speed_tests", []):
        name, t0, t1 = SLOT[test["slot"]], test["ms"][0] * ms, test["ms"][1] * ms
        frames = [i for i, t in enumerate(times) if t0 - 700 * ms <= t < t1]
        centres = _gray_centres(ctx.path, frames, JET[name])
        before, late = _speed(times, centres, t0 - 700 * ms, t0), _speed(times, centres, (t0 + t1) // 2, t1)
        controls[f"{name}_{test['direction']}_speed"] = [before, late]
        faster = test["direction"] == "up"
        checks[f"{name}_{test['direction']}_makes_it_{'faster' if faster else 'slower'}"] = before is not None and late is not None and (
            late >= 1.2 * before if faster else late <= 0.8 * before)
    # Play time: the eighth K9 count after Start ends the game; GNE warns first.
    expected = play_time_ps(scenario["pot_ohms"])
    games = [(begin, next((end for end in game_ends if end > begin), None)) for begin in game_starts]
    complete = [(begin, end) for begin, end in games if end]
    controls["play_time_ps"] = [end - begin for begin, end in complete]
    checks["game_end_observed"] = len(complete) >= 1
    checks["play_time_matches_potentiometer"] = bool(complete) and all(abs((end - begin) - expected) <= TIMER_TOLERANCE_PS for begin, end in complete)
    gne = edges(GNE_N, "0")
    checks["game_near_end_warning_before_the_end"] = bool(complete) and all(any(begin < time < end for time in gne) for begin, end in complete)
    # One-player game: the circuit's pilot turns the black jet with no player 2 input.
    if one_player:
        player2 = [time for time, name, _ in replay if name.endswith("2") and name != "start2"]
        checks["no_player_2_input_in_a_one_player_game"] = not [t for t in player2 if any(b <= t <= e for b, e in complete)]
        checks["circuit_pilot_scores_for_the_black_jet"] = controls["black_points"] >= 1
        checks["circuit_pilot_fires_the_black_jet"] = controls["black_shells"] >= 3
    colors = {tuple(color) for row in ctx.snapshots for color in row["colors"]}
    checks["white_and_black_jets_on_a_gray_sky"] = len(colors) == 3 and (255, 255, 255) in colors and (0, 0, 0) in colors
    return {"checks": checks, "controls": controls}

