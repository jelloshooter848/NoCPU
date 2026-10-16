# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Quadrapong (Atari, 1974) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"quadrapong". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.

Observed scores are the original miss counters: left/right count 4 bits and
are out at 8 (bit D), top/bottom count 3 bits and are out at 4. Start loads
them for the game the credits bought: one credit is a two-player game (left
and right from 0, top and bottom already out), two credits a four-player game
(left and right from 4, top and bottom from 0). The game ends when one player
is left.
"""

GAME = "quadrapong"
CORE_ID = 8
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 238944 periods of the 14.318 MHz source clock (69840 ps).
FIRST_FRAME_PS = 16688853120
FRAME_PERIOD_PS = 16687848960
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 456 pixel clocks (2 source clocks each) by 262 lines"
HORIZONTAL_CLOCK_COUNTS = 456
VERTICAL_LINES = 262
LINE_PS = FRAME_PERIOD_PS // VERTICAL_LINES

# Original 576x432 raster: walls occupy rows 42..48 and 400..406 and columns
# 117..122 and 461..466; the paddle lanes are columns 129..134 (left) and
# 449..454 (right), rows 56..62 (top) and 386..392 (bottom).
LANES = {1: ("column", 131), 2: ("column", 451), 3: ("row", 59), 4: ("row", 389)}
INTERIOR = {"column": (49, 399), "row": (123, 460)}
OUT_AT = (8, 8, 4, 4)


def valid_options(dip, pot):
    """DSW1 coinage (bit 0); no potentiometer."""
    return 0 <= dip <= 1 and pot == 0


def snapshot_objects(rgb, width, height):
    """First/last pixel of each paddle along its lane (None when absent)."""
    if (width, height) != (576, 432):
        raise ValueError("Quadrapong renders the 576x432 landscape raster")
    objects = {}
    for slot, (kind, at) in LANES.items():
        low, high = INTERIOR[kind]
        if kind == "column":
            lit = [rgb[(y * width + at) * 3] > 150 for y in range(low, high + 1)]
        else:
            lit = [rgb[(at * width + x) * 3] > 150 for x in range(low, high + 1)]
        runs, start = [], None
        for index, value in enumerate(lit + [False]):
            if value and start is None:
                start = index
            elif not value and start is not None:
                runs.append((low + start, low + index - 1))
                start = None
        # A paddle is up to 27 pixels (about 14 where the circuit clips it at
        # the low end of a vertical lane); crossings of the other lanes are 7.
        paddles = [run for run in runs if 10 <= run[1] - run[0] <= 30]
        objects[f"paddle{slot}_first"] = paddles[0][0] if len(paddles) == 1 else None
        objects[f"paddle{slot}_last"] = paddles[0][1] if len(paddles) == 1 else None
    return objects


def hit_paddle(signal, time_ps):
    """The paddle a hit belongs to, from its raster position in the frame:
    A5.8 (event 200) is a left/right hit, A5.6 (201) a top/bottom hit."""
    offset = (time_ps - FIRST_FRAME_PS) % FRAME_PERIOD_PS
    if signal == "200":
        return 1 if (offset % LINE_PS) * 2 < LINE_PS + LINE_PS // 6 else 2
    return 3 if offset // LINE_PS < VERTICAL_LINES // 2 else 4


def scores(state):
    return [int(state[f"score{slot}"]) for slot in range(1, 5)]


def analyze(ctx):
    """Original Quadrapong behavior, checked from its own captured observations."""
    scenario, replay, telemetry = ctx.scenario, ctx.replay, ctx.telemetry
    checks, controls = {}, {}
    active = lambda milliseconds: ctx.state_at(milliseconds)["active"] == "1"
    starts = [time for time, action, value in replay if action == "start" and value == 1]
    coins = [time for time, action, value in replay if action == "coin" and value == 1]
    first_coin = coins[0] // ctx.PS_PER_MS
    if starts and starts[0] < coins[0]:
        checks["start_without_credit_does_not_start"] = not active(starts[0] // ctx.PS_PER_MS + 200)
    checks["coin_without_start_does_not_start"] = not active(first_coin + 250)
    checks["separate_start_begins_game"] = active(1500)
    checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
    # Start loads the miss counters for the game the credits bought.
    loaded = {2: [0, 0, 4, 4], 4: [4, 4, 0, 0]}
    controls["counters_at_start"] = scores(ctx.state_at(1500))
    checks["start_loads_counters_for_bought_game"] = controls["counters_at_start"] == loaded[scenario["players"]]
    # Every MISS during play adds exactly one miss to exactly one counter.
    misses = [int(row["time_ps"]) for row in ctx.events if row["signal"] == "202" and row["value"] == "1"]
    increments, previous, mismatched = [], None, 0
    for row in telemetry:
        now = scores(row)
        if previous is not None and row["active"] == "1" and previous[1] == "1":
            changes = [b - a for a, b in zip(previous[0], now) if b != a]
            if changes:
                increments.append(int(row["time_ps"]))
                mismatched += changes != [1]
        previous = (now, row["active"])
    in_play = [time for time in misses if ctx.state_at(time // ctx.PS_PER_MS)["active"] == "1"
               and ctx.state_at(time // ctx.PS_PER_MS + 2)["active"] == "1"]
    controls["misses_during_play"] = len(in_play)
    checks["circuit_scoring_observed"] = len(increments) >= 3
    checks["each_miss_counts_once"] = mismatched == 0 and len(increments) == len(in_play) and all(
        0 <= increment - miss <= 2 * ctx.PS_PER_MS for miss, increment in zip(in_play, increments))
    # Paddle contacts during actual play, attributed to each of the four paddles.
    contacts = {slot: 0 for slot in range(1, 5)}
    last = {}
    for row in ctx.events:
        if row["signal"] in ("200", "201") and row["value"] == "0":
            time = int(row["time_ps"])
            slot = hit_paddle(row["signal"], time)
            if time - last.get(slot, -10**15) > 50 * ctx.PS_PER_MS and ctx.state_at(time // ctx.PS_PER_MS)["active"] == "1":
                contacts[slot] += 1
            last[slot] = time
    controls["contacts_during_play"] = contacts
    checks["paddle_contacts_by_all_four_players"] = all(count >= 1 for count in contacts.values())
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0 and item["time_ps"] > 2 * 10**12]
    checks["game_end_observed"] = bool(ends)
    if ends:
        final = scores(ctx.state_at(ends[0] // ctx.PS_PER_MS + 5))
        controls["final_counters"] = final
        out = [count >= limit for count, limit in zip(final, OUT_AT)]
        checks["game_ends_when_one_player_is_left"] = sum(out) == 3
    for sweep in scenario.get("paddle_sweeps", []):
        slot = sweep["slot"]
        low, high = ctx.snapshot_at(sweep["low_ms"]), ctx.snapshot_at(sweep["high_ms"])
        others = [other for other in range(1, 5) if other != slot]
        keys = [f"paddle{index}_first" for index in range(1, 5)]
        if any(low[key] is None or high[key] is None for key in keys):
            raise ValueError("Missing a Quadrapong paddle during its calibrated sweep")
        key = f"paddle{slot}_first"
        controls[f"paddle{slot}_sweep"] = {"first_at_minimum": low[key], "first_at_maximum": high[key],
                                           "other_paddles": [[low[f"paddle{o}_first"], high[f"paddle{o}_first"]] for o in others]}
        # The paddle crosses its whole side (a larger axis moves it down or
        # right) and no other paddle moves.
        checks[f"paddle{slot}_sweeps_its_side_independently"] = high[key] - low[key] >= 250 \
            and all(low[f"paddle{o}_first"] == high[f"paddle{o}_first"] for o in others)
    no_credit = scenario.get("no_credit_start_ms")
    if no_credit is not None:
        checks["start_after_game_without_credit_does_not_restart"] = not active(no_credit + 500)
    restart = scenario.get("restart_ms")
    if restart is not None:
        before, after = ctx.state_at(restart - 500), ctx.state_at(restart + 500)
        controls["counters_after_restart"] = scores(after)
        checks["post_end_coin_and_start_restarts_with_loaded_counters"] = before["active"] == "0" and after["active"] == "1" \
            and scores(after) == loaded[scenario["restart_players"]]
    return {"checks": checks, "controls": controls}
