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
  Bumpers and targets add 1, 10 or 100 (10, 100 or 1000 points).
- The game ends when the last ball (3 or 5 by the ball-count switch) is lost.
- DICE wires no circuit output to its AUDIO chip ("TODO: Finish Sound"): the
  PCM is the audio chip's single constructor sample (inherited absent audio).
"""

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
# The raised flippers are a dark row 324 across their side of the outlane.
FLIPPER_ROW = 324
FLIPPER_SPANS = {"left": (65, 124), "right": (170, 239)}
STEPS = (1, 10, 100)


def valid_options(dip, pot):
    """S1 coinage (bit 0), S2 free ball (bit 1), S3 ball count (bit 2); no potentiometer."""
    return 0 <= dip <= 7 and pot == 0


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
    checks["absent_dice_audio_is_one_constructor_sample"] = all(item["maximum"] == item["minimum"] == 0 for item in ctx.pcm_context)
    return {"checks": checks, "controls": controls}
