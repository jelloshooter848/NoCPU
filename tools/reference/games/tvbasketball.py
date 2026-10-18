# SPDX-License-Identifier: GPL-3.0-or-later
"""Original TV Basketball (Midway, 1974) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"tvbasketball". The same checks run on the original DICE capture and on each
native/Wasm epoch; tools/compare-games.py additionally requires every stream
and snapshot to be byte-equal. Nothing here generates frames or inputs.

What the original circuit does, as observed here:

- A coin is a credit (3J.9); Start (the 3J flip-flop, observed as `active`)
  begins the game only with a credit. One coin buys a two-player game, a second
  coin before Start a four-player game (the 4J flip-flop, event 203, low).
- In a two-player game paddle 1 moves both striped players and paddle 2 both
  solid players; paddles 3 and 4 move nothing. In a four-player game each
  paddle moves one player: 1 the left striped, 2 the right solid, 3 the right
  striped, 4 the left solid player (the PADn chip type selects the input).
- A ball in the right-hand basket gives two points to the left score
  (score1, the 6D/6B counters), in the left-hand basket to the right score
  (score2, 6C/6A); each count follows the end of its 8E pulse (events 200/201).
- Every coin stops the video sync for about 0.53 s (no VBLANK), clears both
  scores and reloads the clock; in play it starts the game over (as a
  two-player game) without a new Start.
- The clock counts down from 120 once per period of the 9D astable (R = the
  play-time potentiometer, 15 kOhm, 22 uF) and ends the game (7E.8, event 202).
"""

GAME = "tvbasketball"
CORE_ID = 10
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period, 238420 periods of the 14.318 MHz source clock (69840 ps).
FIRST_FRAME_PS = 16652316800
FRAME_PERIOD_PS = 16651252800
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 455 pixel clocks (2 source clocks each) by 262 lines, interrupted by each coin"
HORIZONTAL_CLOCK_COUNTS = 455
VERTICAL_LINES = 262
MS = 10**9
COIN_ONE_SHOT_PS = round(1.0986122886681098 * 100e3 * 4.7e-6 * 10**12)

# Column bands of the four players on the 576x432 raster, and the rows a player
# (51 rows tall) can occupy: its top row runs from 84 (axis -32768) to 313.
BANDS = {"striped_left": (101, 124), "solid_left": (225, 248), "striped_right": (323, 346), "solid_right": (446, 470)}
ROWS = (75, 366)
# Players each paddle moves, by game size.
MOVES = {2: {1: ["striped_left", "striped_right"], 2: ["solid_left", "solid_right"], 3: [], 4: []},
         4: {1: ["striped_left"], 2: ["solid_right"], 3: ["striped_right"], 4: ["solid_left"]}}


def valid_options(dip, pot):
    """No DIP switch; POT1 "playtime" 10..60 kOhm on the 9D astable."""
    return dip == 0 and 10000 <= pot <= 60000


def clock_period_ps(pot):
    """One 9D astable period, ln 2 x (R + 2 x 15 kOhm) x 22 uF."""
    return round(0.6931471805599453 * (pot + 30000) * 22e-6 * 10**12)


def frame_gap_windows(scenario, replay):
    """Each coin press stops the video sync once for 0.50..0.56 s. The reset
    may first cut the frame in progress short: one shorter frame ending within
    20 ms of the press (the coin input is polled every 10 ms)."""
    windows = []
    for time, action, value in replay:
        if action == "coin" and value == 1:
            windows.append((time - FRAME_PERIOD_PS, time + 20 * MS, 1, FRAME_PERIOD_PS - 1, False))
            windows.append((time - FRAME_PERIOD_PS, time + 600 * MS, 500 * MS, 560 * MS, True))
    return windows


def snapshot_objects(rgb, width, height):
    """Top row of each of the four players in its column band (None if unclear)."""
    if (width, height) != (576, 432):
        raise ValueError("TV Basketball renders the 576x432 landscape raster")
    objects = {}
    for name, (left, right) in BANDS.items():
        lit = [any(rgb[(y * width + x) * 3] > 200 for x in range(left, right + 1)) for y in range(*ROWS)]
        runs, start, gap = [], None, 0
        for index, value in enumerate(lit + [False] * 6):
            if value:
                start = index if start is None else start
                gap = 0
            elif start is not None:
                gap += 1
                if gap > 4:
                    runs.append((ROWS[0] + start, ROWS[0] + index - gap))
                    start, gap = None, 0
        players = [run for run in runs if 44 <= run[1] - run[0] <= 52]
        objects[f"{name}_top"] = players[0][0] if len(players) == 1 else None
    return objects


def analyze(ctx):
    """Original TV Basketball behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    checks, controls = {}, {}
    state = ctx.state_at
    active = lambda milliseconds: state(milliseconds)["active"] == "1"
    scores = lambda row: (int(row["score1"]), int(row["score2"]))
    edges = lambda signal, value: [int(row["time_ps"]) for row in events if row["signal"] == signal and row["value"] == value]
    coins = [time for time, action, value in replay if action == "coin" and value == 1]
    starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1]
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0]
    checks["active_starts_only_from_start"] = all(
        any(0 <= time - press <= 20 * MS for press, action, value in replay if action == "start" and value == 1) for time in starts)
    for ms in scenario.get("no_credit_start_ms", []):
        checks[f"start_without_credit_does_not_start_{ms}"] = not active(ms + 500)
    if "coin_without_start_ms" in scenario:
        checks["coin_without_start_does_not_start"] = not active(scenario["coin_without_start_ms"])
    # Start with a credit begins a game; the second coin before it chooses four players.
    four = {int(row["time_ps"]): row["value"] for row in events if row["signal"] == "203"}
    mode_at = lambda time: ([value for at, value in sorted(four.items()) if at <= time] or ["1"])[-1]
    for game in scenario["games"]:
        start, players = game["start_ms"], game["players"]
        began = active(start + 500) and not active(start - 1)
        checks[f"start_at_{start}_begins_{players}_player_game"] = began and mode_at((start + 500) * MS) == ("0" if players == 4 else "1") \
            and scores(state(start + 500)) == (0, 0)
    # Paddles: each held alone moves exactly the players the game size gives it.
    for sweep in scenario.get("paddle_sweeps", []):
        low, high = ctx.snapshot_at(sweep["low_ms"]), ctx.snapshot_at(sweep["high_ms"])
        keys = [f"{name}_top" for name in BANDS]
        if any(low[key] is None or high[key] is None for key in keys):
            raise ValueError("Missing a TV Basketball player during a calibrated paddle sweep")
        moved = MOVES[sweep["players"]][sweep["slot"]]
        controls[f"paddle{sweep['slot']}_{sweep['players']}p_sweep"] = {key: [low[key], high[key]] for key in keys}
        checks[f"paddle{sweep['slot']}_moves_its_players_in_{sweep['players']}_player_game"] = all(
            (high[f"{name}_top"] - low[f"{name}_top"] >= 200) if name in moved else low[f"{name}_top"] == high[f"{name}_top"] for name in BANDS)
    # Scores: every count in play adds two points to one side, at the end of its
    # 8E pulse; every coin clears both.
    falls = {"1": edges("200", "0"), "2": edges("201", "0")}
    previous, steps, bad = None, {"1": 0, "2": 0}, 0
    for row in telemetry:
        now, time = scores(row), int(row["time_ps"])
        if previous is not None and now != previous:
            if now == (0, 0) and any(0 <= time - coin <= 20 * MS for coin in coins):
                pass
            else:
                changed = [slot for slot in (0, 1) if now[slot] != previous[slot]]
                slot = str(changed[0] + 1) if len(changed) == 1 else None
                if slot and now[changed[0]] - previous[changed[0]] == 2 and row["active"] == "1" \
                        and any(0 <= time - fall <= 2 * MS for fall in falls[slot]):
                    steps[slot] += 1
                else:
                    bad += 1
        previous = now
    controls["baskets"] = steps
    checks["each_basket_adds_two_points_to_one_side"] = bad == 0
    checks["both_sides_score"] = steps["1"] >= 1 and steps["2"] >= 1
    checks["every_coin_clears_both_scores"] = all(scores(state(coin // MS + 600)) == (0, 0) or
        any(0 <= fall - coin <= 600 * MS for fall in falls["1"] + falls["2"]) for coin in coins)
    # The clock: 7E.8 ends the game; it counts from Start, or from a coin in play.
    period = clock_period_ps(scenario["pot_ohms"])
    time_up = edges("202", "1")
    checks["game_end_observed"] = bool(ends) and len(time_up) == len(ends) and all(
        any(abs(end - up) <= 2 * MS for up in time_up) for end in ends)
    # A coin holds the clock loaded for the length of its 3B 555 one-shot
    # (ln 3 x 100 kOhm x 4.7 uF) before it counts.
    durations = []
    for end in ends:
        begin = max([time for time in starts if time < end] + [coin + COIN_ONE_SHOT_PS for coin in coins
                                                               if coin < end and active(coin // MS - 1)])
        durations.append(end - begin)
    controls["game_lengths_ps"] = durations
    controls["clock_period_ps"] = period
    checks["clock_runs_120_periods"] = bool(durations) and all(118 * period <= d <= 120 * period for d in durations)
    for coin in scenario.get("coin_in_play_ms", []):
        checks[f"coin_in_play_at_{coin}_restarts_as_two_player_game"] = active(coin - 1) and active(coin + 700) \
            and scores(state(coin + 700)) == (0, 0) and mode_at((coin + 700) * MS) == "1" and mode_at((coin - 1) * MS) == "0"
    for ms in scenario.get("ignored_in_play_ms", []):
        before, after = state(ms - 1), state(ms + 700)
        checks[f"start_in_play_at_{ms}_changes_nothing"] = before["active"] == after["active"] == "1" \
            and not any(ms * MS <= end <= (ms + 700) * MS for end in ends)
    checks["nontrivial_pcm_during_actual_active_gameplay"] = any(
        item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in ctx.pcm_context)
    return {"checks": checks, "controls": controls}
