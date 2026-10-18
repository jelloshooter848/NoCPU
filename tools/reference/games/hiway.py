# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Hi-Way (Atari, 1975) behavior checks for the ROM-free comparison.

Loaded by tools/reference/game_media.py for every scenario whose game is
"hiway" (DICE's command-line ID; the circuit is games/highway.cpp). The same
checks run on the original DICE capture and on each native/Wasm epoch;
tools/compare-games.py additionally requires every stream and snapshot to be
byte-equal. Nothing here generates frames or inputs.

What the original circuit does, as observed here:

- The coin starts a game at once (there is no Start switch) and clears the
  score; a coin in play clears the score again but does not restart the clock.
- The steering wheel is DICE's quadrature WHEEL1_INPUT: turning it left or
  right turns the car (the player's car, on rows 318..332, then drifts that
  way). The accelerator is BUTTONS1 button 1, held.
- score1 is the displayed score (N2 units, L2 tens); it counts up by one as
  the car covers distance (Fx, event 200). One count exactly as the time runs
  out came without an Fx edge (hiway-extended-play) and is accepted as such.
- score2 is the E8 play-time counter, one count per period of the E9 555
  astable (R the play-time potentiometer, 470 kOhm, 10 uF). The game ends as
  the counter's B section wraps: ln 3 (R + 470k) C + 7 ln 2 (R + 940k) C after
  the coin. When the score reaches the extended-play setting (K1.8 low, event
  204) the clock is cleared at once: extended play.
- DICE wires no circuit output to its AUDIO chip ("todo: needs work"): the PCM
  is the audio chip's single constructor sample (inherited absent audio).
"""

import math

GAME = "hiway"
CORE_ID = 12
# Measured on the original capture (frames.csv): the cold first VBLANK and the
# frame period of the 12.096 MHz crystal (the same cadence as Crossfire).
FIRST_FRAME_PS = 16011484094
FRAME_PERIOD_PS = 16253583360
FRAME_PERIOD_BASIS = "measured original VBLANK cadence; 393216 half periods of the 12.096 MHz crystal"
MS = 10**9
NO_AUDIO_HOOKUP = True
# The coin is polled every 10 ms; the clock lengths come from 555 arithmetic.
TIMER_TOLERANCE_PS = 20 * MS
CAR_ROWS = (318, 333)


def valid_options(dip, pot):
    """SW_EXT_PLAY bits 0-3, concurrent traffic bit 4, opposing traffic bit 5; play time 10..1010 kOhm."""
    return 0 <= dip <= 63 and 10000 <= pot <= 1010000


def game_length_ps(pot):
    """The E9 astable's first period from the coin, then seven more."""
    c = 10e-6
    return round((math.log(3) * (pot + 470e3) + 7 * math.log(2) * (pot + 940e3)) * c * 10**12)


def snapshot_objects(rgb, width, height):
    """The horizontal centre of the player's car (white on its rows), or None."""
    if (width, height) != (576, 432):
        raise ValueError("Hi-Way renders the 576x432 landscape raster")
    columns = [x for x in range(40, width)
               if any(rgb[(y * width + x) * 3] > 220 for y in range(*CAR_ROWS))]
    if not columns or columns[-1] - columns[0] > 40:
        return {"car_x": None}
    return {"car_x": (columns[0] + columns[-1]) / 2}


def analyze(ctx):
    """Original Hi-Way behavior, checked from its own captured observations."""
    scenario, replay, telemetry, events = ctx.scenario, ctx.replay, ctx.telemetry, ctx.events
    checks, controls = {}, {}
    state = ctx.state_at
    active = lambda milliseconds: state(milliseconds)["active"] == "1"
    score = lambda row: int(row["score1"])
    clock = lambda row: int(row["score2"])
    coins = [time for time, action, value in replay if action == "coin" and value == 1]
    starts = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 1 and item["time_ps"] > MS]
    ends = [item["time_ps"] for item in ctx.active_transitions if item["active"] == 0 and item["time_ps"] > MS]
    checks["not_in_play_before_the_coin"] = not active(coins[0] // MS - 1)
    checks["only_coins_start_games"] = bool(starts) and all(any(0 <= time - coin <= 20 * MS for coin in coins) for time in starts)
    checks["coin_starts_a_cleared_game"] = all(active(start // MS + 10) and score(state(start // MS + 10)) == 0
                                                and clock(state(start // MS + 10)) == 0 for start in starts)
    # The score counts one at a time, only in play, on Fx; a coin clears it.
    fx = [int(row["time_ps"]) for row in events if row["signal"] == "200"]
    previous, steps, bad, final = None, 0, 0, 0
    for row in telemetry:
        now, time = score(row), int(row["time_ps"])
        if previous is not None and now != previous:
            if now == 0 and any(0 <= time - coin <= 20 * MS for coin in coins):
                pass
            elif now == previous + 1 and row["active"] == "1" and any(0 <= time - edge <= 2 * MS for edge in fx):
                steps += 1
            elif now == previous + 1 and any(0 <= time - end <= 2 * MS for end in ends):
                final += 1  # the original counts once more, without Fx, as the time runs out
            else:
                bad += 1
        previous = now
    controls["score_steps"] = steps
    controls["score_steps_at_time_out"] = final
    checks["score_counts_distance_one_at_a_time"] = bad == 0 and steps >= scenario.get("minimum_score", 3)
    # The clock: one count per E9 period, the game ends as it wraps. Reaching
    # the extended-play score (K1.8 low, event 204) clears the clock at once,
    # so the game then runs on for the rest of that E9 period plus seven more.
    period = round(math.log(2) * (scenario["pot_ohms"] + 940e3) * 10e-6 * 10**12)
    matches = [int(row["time_ps"]) for row in events if row["signal"] == "204" and row["value"] == "0"]
    lengths, extended = [], 0
    for end in ends:
        begin = max(start for start in starts if start < end)
        lengths.append(end - begin)
        match = [time for time in matches if begin < time < end]
        if match:
            extended += 1
            checks[f"extended_play_at_{match[0] // MS}_clears_the_clock"] = clock(state(match[0] // MS + 2)) == 0 \
                and 10 * (score(state(match[0] // MS + 2)) // 10) == scenario["extended_play"]
            checks[f"extended_game_runs_seven_to_eight_periods_after_{match[0] // MS}"] = \
                7 * period - TIMER_TOLERANCE_PS <= end - match[0] <= 8 * period + TIMER_TOLERANCE_PS \
                and end - begin > game_length_ps(scenario["pot_ohms"])
        else:
            checks[f"game_from_{begin // MS}_ends_with_the_play_time_potentiometer"] = \
                abs(end - begin - game_length_ps(scenario["pot_ohms"])) <= TIMER_TOLERANCE_PS
    controls["game_lengths_ps"] = lengths
    controls["expected_game_length_ps"] = game_length_ps(scenario["pot_ohms"])
    checks["clock_ends_the_game"] = bool(lengths) and all(clock(state(end // MS + 2)) == 0 for end in ends)
    if scenario.get("extended_play"):
        checks["extended_play_observed"] = extended >= 1
    for ms in scenario.get("coin_in_play_ms", []):
        checks[f"coin_in_play_at_{ms}_clears_the_score_only"] = active(ms - 1) and active(ms + 100) \
            and score(state(ms - 1)) > 0 and score(state(ms + 100)) == 0 and clock(state(ms + 100)) == clock(state(ms - 1))
    # The wheel: a left turn sends the car left, a right turn right.
    for test in scenario.get("wheel_tests", []):
        before, after = ctx.snapshot_at(test["before_ms"])["car_x"], ctx.snapshot_at(test["after_ms"])["car_x"]
        if before is None or after is None:
            raise ValueError("Missing the Hi-Way car during a calibrated wheel test")
        controls[f"wheel_{test['direction']}_{test['before_ms']}"] = [before, after]
        checks[f"wheel_turned_{test['direction']}_at_{test['before_ms']}_moves_the_car_{test['direction']}"] = \
            (after < before - 10) if test["direction"] == "left" else (after > before + 10)
    # The accelerator released: no distance is scored while it is up.
    for window in scenario.get("accelerator_released_ms", []):
        checks[f"no_score_while_the_accelerator_is_released_{window[0]}"] = score(state(window[0])) == score(state(window[1]))
    checks["absent_dice_audio_is_one_constructor_sample"] = all(item["maximum"] == item["minimum"] == 0 for item in ctx.pcm_context)
    return {"checks": checks, "controls": controls}
