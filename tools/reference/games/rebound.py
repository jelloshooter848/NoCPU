# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Rebound (Atari, 1974) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"rebound". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.
"""

GAME = "rebound"
CORE_ID = 6
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period. 16614656640 ps is 237896 periods of the 14.318 MHz source
# clock (34920 ps half period): 454 pixel clocks per line by 262 lines, with
# the pixel clock at half the crystal (J4).
FIRST_FRAME_PS = 16615680720
FRAME_PERIOD_PS = 16614656640
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 454 pixel clocks (2 source clocks each) by 262 lines"
HORIZONTAL_CLOCK_COUNTS = 454
VERTICAL_LINES = 262
# The original scheduler applies a replay input at the first queued event at
# or after its millisecond boundary. Rebound's optimized counters leave up to
# 10.78 us between events (measured on both original scenarios), more than the
# 10 us default sanity bound; the skews themselves are compared exactly.
INPUT_SKEW_BOUND_PS = 20 * 10**6

# The two paddles share one row of the 576x432 raster; the net is the
# two-pixel column at x 273..274. Each paddle is about 45 px wide.
PADDLE_ROW = 418
NET_COLUMNS = (273, 274)


def valid_options(dip, pot):
    """DSW1 winning score (bit 0) and DSW2 coinage (bit 1); no potentiometer."""
    return 0 <= dip <= 3 and pot == 0


def snapshot_objects(rgb, width, height):
    """Left/right edges of each paddle on its original raster row."""
    if (width, height) != (576, 432):
        raise ValueError("Rebound renders the 576x432 landscape raster")
    row = [rgb[(PADDLE_ROW * width + x) * 3] > 150 for x in range(width)]
    runs, start = [], None
    for x, lit in enumerate(row + [False]):
        if lit and start is None:
            start = x
        elif not lit and start is not None:
            runs.append((start, x - 1))
            start = None
    objects = {}
    for slot, side in ((1, lambda run: run[1] < NET_COLUMNS[0]), (2, lambda run: run[0] > NET_COLUMNS[1])):
        paddles = [run for run in runs if side(run) and run[1] - run[0] >= 30]
        objects[f"paddle{slot}_left"] = paddles[0][0] if len(paddles) == 1 else None
        objects[f"paddle{slot}_right"] = paddles[0][1] if len(paddles) == 1 else None
    return objects


def analyze(ctx):
    """Original Rebound behavior, checked from its own captured observations."""
    scenario, replay, telemetry = ctx.scenario, ctx.replay, ctx.telemetry
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    starts = [time for time, action, value in replay if action == "start" and value == 1]
    coins = [time for time, action, value in replay if action == "coin" and value == 1]
    first_coin = coins[0] // ctx.PS_PER_MS
    if starts and starts[0] < coins[0]:
        checks["start_without_credit_does_not_start"] = not active(starts[0] // ctx.PS_PER_MS + 200)
    checks["coin_without_start_does_not_start"] = not active(first_coin + 350)
    checks["separate_start_begins_game"] = active(1500)
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    checks["circuit_scoring_observed"] = max(ctx.maximum_scores) >= 1
    # LEFT_SCORE and RIGHT_SCORE (events 200, 201) each pulse at least once.
    checks["both_score_pulses_observed"] = all(any(row["signal"] == signal for row in ctx.events) for signal in ("200", "201"))
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0 and item["time_ps"] > 2 * 10**12]
    checks["game_end_observed"] = bool(ends)
    if ends:
        final = ctx.state_at(ends[0] // ctx.PS_PER_MS + 5)
        scores = [int(final["score1"]), int(final["score2"])]
        controls["final_scores"] = scores
        checks["winning_score_setting_ends_game"] = max(scores) == scenario["winning_score"] and min(scores) < scenario["winning_score"]
    # Physical paddle contacts during actual play (HIT rising edges, grouped).
    playing = [group for group in ctx.contact_groups() if ctx.state_at(group[0] // ctx.PS_PER_MS)["active"] == "1"]
    controls["contacts_during_play"] = len(playing)
    checks["paddle_contacts_during_play"] = len(playing) >= 2
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)
    for sweep in scenario.get("paddle_sweeps", []):
        slot, other = sweep["slot"], 3 - sweep["slot"]
        low, high = ctx.snapshot_at(sweep["left_ms"]), ctx.snapshot_at(sweep["right_ms"])
        key, other_key = f"paddle{slot}_left", f"paddle{other}_left"
        if None in (low[key], high[key], low[other_key], high[other_key]):
            raise ValueError("Missing a Rebound paddle during its calibrated sweep")
        controls[f"paddle{slot}_sweep"] = {"left_edge_at_minimum": low[key], "left_edge_at_maximum": high[key],
                                           "other_paddle_left_edges": [low[other_key], high[other_key]]}
        # Each paddle crosses its own half of the court and nothing else moves.
        checks[f"paddle{slot}_sweeps_its_half_independently"] = high[key] - low[key] >= 150 \
            and abs(high[other_key] - low[other_key]) <= 2 \
            and (high[f"paddle{slot}_right"] < 273 if slot == 1 else low[key] > 274)
    restart = scenario.get("restart_ms")
    if restart is not None:
        before, after = ctx.state_at(restart - 500), ctx.state_at(restart + 500)
        checks["post_end_start_restarts_and_clears_score"] = before["active"] == "0" and after["active"] == "1" \
            and after["score1"] == "0" and after["score2"] == "0"
        if scenario.get("kind") == "second_credit_restart":
            # The restart is the second credit of one coin: no coin after the first.
            checks["second_credit_restarts_without_coin"] = len(coins) == 1
    return {"checks": checks, "controls": controls}
