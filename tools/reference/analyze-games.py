#!/usr/bin/env python3
"""Qualify independent original DICE input, media and per-game observations.

This reads actual captured circuit/GL/PCM evidence. It does not manufacture
golden frames or infer audible speakers, hardware latency or phone performance.
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import array
import csv
import hashlib
import importlib.util
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("pong_analysis", ROOT / "tools/reference/analyze.py")
pong = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pong)
media_spec = importlib.util.spec_from_file_location("game_media", ROOT / "tools/reference/game_media.py")
game_media = importlib.util.module_from_spec(media_spec)
media_spec.loader.exec_module(game_media)
EXACT = ["audio.s16le", "telemetry.csv", "inputs.csv", "collisions.csv", "events.csv", "frames.csv", "frames.gray"]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scenarios():
    return json.loads((ROOT / "tests/replays/game-scenarios.json").read_text())["scenarios"]


def state_at(rows, milliseconds):
    return min(rows, key=lambda row: abs(int(row["time_ps"]) - milliseconds * 10**9))


def connected_parts(frame, width=160, height=120):
    # Diagonal continuity preserves the original diode-matrix rocket outline
    # at the independent 160x120 sample scale; four-neighbor connectivity
    # fragments that outline and can accidentally select the score digit.
    remaining = {i for i, value in enumerate(frame) if value > 150}
    result = []
    while remaining:
        first = remaining.pop()
        stack, pixels = [first], [first]
        while stack:
            pixel = stack.pop()
            x, y = pixel % width, pixel // width
            for dy in [-1, 0, 1]:
                for dx in [-1, 0, 1]:
                    if not (dx or dy) or not 0 <= x + dx < width or not 0 <= y + dy < height:
                        continue
                    neighbor = (y + dy) * width + x + dx
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
                        pixels.append(neighbor)
        xs, ys = [i % width for i in pixels], [i // width for i in pixels]
        result.append({"x": statistics.mean(xs), "y": statistics.mean(ys), "width": max(xs) - min(xs) + 1,
                       "height": max(ys) - min(ys) + 1, "area": len(pixels)})
    return result


def positions(path, game):
    frames = pong.read_rows(path / "frames.csv")
    raw = (path / "frames.gray").read_bytes()
    if len(raw) != len(frames) * 160 * 120:
        raise ValueError("Incomplete actual observation raster")
    observations = []
    # Fixed source-geometry regions will be reviewed against the first native
    # capture; they are independent of NoCPU's renderer and control positions.
    paddle_bands = [(15, 28), (125, 137), (43, 55), (98, 110)]
    for index, frame in enumerate(frames):
        parts = connected_parts(raw[index * 19200:(index + 1) * 19200])
        row = {"time_ps": int(frame["time_ps"])}
        if game == "pongdoubles":
            for slot, (left, right) in enumerate(paddle_bands):
                candidates = [part for part in parts if left < part["x"] < right
                              and part["width"] <= 3 and 5 <= part["height"] <= 10]
                row[f"paddle{slot + 1}_y"] = max(candidates, key=lambda part: part["area"])["y"] if candidates else None
            balls = [part for part in parts if 8 < part["x"] < 151 and not 74 < part["x"] < 81
                     and part["width"] <= 3 and part["height"] <= 3 and 2 <= part["area"] <= 9]
            row["ball_x"] = balls[0]["x"] if len(balls) == 1 else None
            row["ball_y"] = balls[0]["y"] if len(balls) == 1 else None
        else:
            for slot, (left, right) in enumerate([(48, 56), (96, 104)]):
                rockets = [part for part in parts if left < part["x"] < right
                           and 2 <= part["width"] <= 6 and 4 <= part["height"] <= 10 and part["area"] >= 5]
                row[f"rocket{slot + 1}_y"] = max(rockets, key=lambda part: part["area"])["y"] if rockets else None
        observations.append(row)
    if not observations:
        raise ValueError("No captured rendered frames")
    with (path / "positions.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(observations[0]))
        writer.writeheader()
        writer.writerows(observations)
    return observations


def snapshot_positions(path, game):
    result = []
    # Measured full original GL images resolve outlines which alias into
    # disconnected single pixels in the coarse observation raster.
    for image in sorted(path.glob('*ms.ppm'), key=lambda name: int(name.stem[:-2])):
        header, dimensions, maximum, rgb = image.read_bytes().split(b'\n', 3)
        if header != b'P6' or dimensions != b'576 432' or maximum != b'255' or len(rgb) != 576 * 432 * 3:
            raise ValueError('Malformed actual native full-resolution snapshot')
        parts = connected_parts(rgb[0::3], 576, 432)
        row = {'requested_ms': int(image.stem[:-2]), 'image': image.name, 'sha256': sha256(image)}
        if game == 'pongdoubles':
            for slot, (left, right) in enumerate([(60, 95), (450, 495), (155, 195), (355, 390)]):
                candidates = [part for part in parts if left < part['x'] < right and 1 <= part['width'] <= 8 and 15 <= part['height'] <= 40]
                row[f'paddle{slot + 1}_y'] = max(candidates, key=lambda part: part['area'])['y'] if candidates else None
        else:
            for slot, (left, right) in enumerate([(172, 200), (345, 373)]):
                candidates = [part for part in parts if left < part['x'] < right and 12 <= part['width'] <= 30 and 15 <= part['height'] <= 40]
                row[f'rocket{slot + 1}_y'] = max(candidates, key=lambda part: part['area'])['y'] if candidates else None
        result.append(row)
    (path / 'snapshot-positions.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def snapshot_at(rows, milliseconds):
    selected = [row for row in rows if row["requested_ms"] == milliseconds]
    if len(selected) != 1:
        raise ValueError(f"Missing/duplicate independent full-resolution snapshot at {milliseconds} ms")
    return selected[0]


def active_pcm(pcm, telemetry):
    # Only actual GAME_ON/native-active intervals after initial settling count.
    spans, start = [], None
    for row in telemetry:
        at = int(row["time_ps"])
        active = row["active"] == "1" and at >= 1500 * 10**9
        if active and start is None:
            start = at
        elif not active and start is not None:
            spans.append((start, at))
            start = None
    if start is not None:
        spans.append((start, int(telemetry[-1]["time_ps"])))
    observations = []
    for begin, end in spans:
        samples = pcm[begin * 48000 // 10**12:end * 48000 // 10**12]
        if samples:
            observations.append({"begin_ps": begin, "end_ps": end, "samples": len(samples),
                                 "minimum": min(samples), "maximum": max(samples),
                                 "transitions": sum(a != b for a, b in zip(samples, samples[1:]))})
    return observations


def analyze_epoch(path, scenario):
    game = scenario["game"]
    captured_configuration = json.loads((path.parent / "configuration.json").read_text())
    expected_configuration = {"game": game, "dip": scenario["dip"], "pot_ohms": scenario["pot_ohms"]}
    configuration_matches = captured_configuration == expected_configuration and all(
        type(captured_configuration.get(key)) is type(value) for key, value in expected_configuration.items())
    replay = pong.read_replay(ROOT / scenario["replay"])
    duration = replay[-1][0]
    telemetry = pong.read_rows(path / "telemetry.csv")
    inputs = pong.read_rows(path / "inputs.csv")
    events = pong.read_rows(path / "events.csv")
    frame_rows = pong.read_rows(path / "frames.csv")
    if not telemetry or not inputs or not frame_rows:
        raise ValueError("Missing circuit, input or rendered frame evidence")
    if len((path / "frames.gray").read_bytes()) != len(frame_rows) * 160 * 120:
        raise ValueError("Incomplete actual observation raster")
    snapshots = snapshot_positions(path, game)
    pcm_bytes = (path / "audio.s16le").read_bytes()
    if len(pcm_bytes) % 2:
        raise ValueError("Odd signed-16 PCM byte count")
    pcm = array.array("h", pcm_bytes)
    if sys.byteorder != "little":
        pcm.byteswap()
    if not pcm:
        raise ValueError("Missing generated PCM")
    coverage = game_media.media_coverage(frame_rows, len(pcm), duration, game, pcm_byte_count=len(pcm_bytes),
                                        scenario=scenario if configuration_matches else None,
                                        replay=replay if configuration_matches else None)
    skews = [int(row["applied_ps"]) - int(row["requested_ps"]) for row in inputs]
    maximum_scores = [max(int(row[f"score{slot}"]) for row in telemetry) for slot in [1, 2]]
    event_counts = {str(signal): sum(int(row["signal"]) == signal for row in events) for signal in range(5)}
    active_transitions, previous = [], None
    for row in telemetry:
        value = int(row["active"])
        if previous is not None and value != previous:
            active_transitions.append({"time_ps": int(row["time_ps"]), "active": value})
        previous = value
    checks = {
        "selected_game_configuration_matches_capture": configuration_matches,
        "not_active_before_inputs": state_at(telemetry, 150)["active"] == "0",
        "recorded_inputs_match_declared_replay": pong.validate_recorded_inputs(inputs, replay),
        "input_schedule_skew_bounded": min(skews) >= 0 and max(skews) < 10**7,
        "full_scenario_completed": int(telemetry[-1]["time_ps"]) >= duration and inputs[-1]["action"] == "recreate",
    }
    checks.update(coverage["checks"])
    controls, contacts, crashes = {}, [], []
    pcm_context = active_pcm(pcm, telemetry)
    if scenario.get("kind") == "coin_only":
        checks["coin_without_start_never_enables_game_on"] = all(row["active"] == "0" for row in telemetry)
        checks["no_fabricated_start_input"] = not any(action == "start" for _, action, _ in replay)
    else:
        checks["separate_start_begins_game"] = state_at(telemetry, 1500)["active"] == "1"
        checks["circuit_scoring_observed"] = max(maximum_scores) >= 1
        checks["game_end_observed"] = any(item["active"] == 0 and item["time_ps"] > 2 * 10**12 for item in active_transitions)
        checks["nontrivial_pcm_during_actual_active_gameplay"] = any(item["samples"] >= 48000 and item["maximum"] - item["minimum"] > 500 and item["transitions"] > 100 for item in pcm_context)
        if game == "pongdoubles":
            checks["start_without_credit_does_not_start"] = state_at(telemetry, 400)["active"] == "0"
            checks["coin_without_start_does_not_start"] = state_at(telemetry, 850)["active"] == "0"
            for slot, (before, after) in enumerate([(1800, 2250), (2750, 3250), (3750, 4250), (4750, 5250)]):
                baseline = [snapshot_at(snapshots, before)[f"paddle{i}_y"] for i in range(1, 5)]
                moved = [snapshot_at(snapshots, after)[f"paddle{i}_y"] for i in range(1, 5)]
                if None in baseline or None in moved:
                    raise ValueError("Missing four-player paddle components during independent movement")
                deltas = [b - a for a, b in zip(baseline, moved)]
                checks[f"paddle{slot + 1}_moves_independently"] = abs(deltas[slot]) >= 35 and all(abs(delta) <= 7.2 for i, delta in enumerate(deltas) if i != slot)
                controls[f"paddle{slot + 1}"] = {"before": baseline, "after": moved, "delta": deltas}
            observed = positions(path, game)
            rising = [int(row["time_ps"]) for row in events if row["signal"] == "0" and row["value"] == "1"]
            groups = []
            for time in rising:
                if not groups or time - groups[-1][-1] > pong.CONTACT_GAP_PS:
                    groups.append([])
                groups[-1].append(time)
            for group in groups[:2]:
                time = group[0]
                before = pong.velocity(observed, time - 250 * 10**9, time - 50 * 10**9)
                after = pong.velocity(observed, time + 50 * 10**9, time + 250 * 10**9)
                contacts.append({"time_ps": time, "rising_pulses": len(group), "velocity_before": before,
                                 "velocity_after": after, "rendered_direction_reversed": before * after < 0})
            checks["two_distinct_source_hit_contacts"] = len(groups) >= 2
            checks["rendered_ball_reverses_at_contacts"] = len(contacts) >= 2 and all(item["rendered_direction_reversed"] for item in contacts)
            checks["winning_score_setting_observed"] = max(maximum_scores) >= scenario["winning_score"]
            checks["active_and_attract_pin_match"] = all(row["active"] == row["attract_n"] for row in telemetry)
            restart = scenario.get("restart_ms")
            checks["post_end_coin_and_start_restarts_and_clears_score"] = restart is not None and state_at(telemetry, restart - 500)["active"] == "0" and state_at(telemetry, restart + 1000)["active"] == "1" and all(state_at(telemetry, restart + 1000)[f"score{i}"] == "0" for i in [1, 2])
        else:
            checks["source_start_without_coin_timer_quirk_retained"] = state_at(telemetry, 400)["active"] == "1"
            checks["real_game_on_pin_used"] = all(int(row["active"]) == 1 - int(row["run_n"]) for row in telemetry)
            checks["unsupported_attract_and_hit_explicit"] = all(row["attract_n"] == "4294967295" and row["hits"] == "0" for row in telemetry)
            checks["both_rocket_crash_events_observed"] = all(any(int(row["signal"]) == signal and row["value"] == "0" for row in events) for signal in [1, 2])
            checks["score_pulse_observed"] = any(int(row["signal"]) in [3, 4] and row["value"] == "1" for row in events)
            timer_intervals = []
            for index, transition in enumerate(active_transitions[:-1]):
                following = active_transitions[index + 1]
                if transition["active"] == 1 and following["active"] == 0:
                    timer_intervals.append(following["time_ps"] - transition["time_ps"])
            expected_timer_ps = int(1.0986122886681 * scenario["pot_ohms"] * 0.0001 * 10**12)
            checks["playtime_timer_tracks_original_selected_rc"] = bool(timer_intervals) and all(abs(value - expected_timer_ps) <= 2 * 10**9 for value in timer_intervals)
            controls["playtime_timer"] = {"measured_active_intervals_ps": timer_intervals, "expected_source_ln3_rc_ps": expected_timer_ps, "telemetry_endpoint_tolerance_ps": 2 * 10**9, "source": "chips/555mono.cpp LN_3*r*c; games/spacerace.cpp C9=100uF/POT1"}
            if scenario.get("restart_ms") is not None:
                restart = scenario["restart_ms"]
                checks["alternate_coinage_second_explicit_start_timer_restart"] = state_at(telemetry, restart - 500)["active"] == "0" and state_at(telemetry, restart + 1000)["active"] == "1" and all(state_at(telemetry, restart + 1000)[f"score{i}"] == "0" for i in [1, 2])
            windows = scenario.get("control_windows", {"1": [2000, 2300, 2400, 2700], "2": [3200, 3500, 3600, 3900]})
            if set(windows) != {"1", "2"}:
                raise ValueError("Both physical rocket direction windows must be declared")
            for slot, times in windows.items():
                if not isinstance(times, list) or len(times) != 4 or any(type(time) is not int for time in times) or not all(a < b for a, b in zip(times, times[1:])):
                    raise ValueError("Malformed physical rocket direction window")
                required = [(time * 10**9, action + slot, value) for time, action, value in zip(times, ["up", "up", "down", "down"], [1, 0, 1, 0])]
                if any(event not in replay for event in required):
                    raise ValueError("Direction observation window does not match the declared physical replay")
            for slot, times in [(int(slot), times) for slot, times in windows.items()]:
                key = f"rocket{slot}_y"
                values = dict(zip(["up_before", "up_after", "down_before", "down_after"], [snapshot_at(snapshots, time)[key] for time in times]))
                if None in values.values():
                    raise ValueError("Rocket absent during the calibrated collision-free direction window")
                checks[f"rocket{slot}_up_moves_rendered_rocket"] = values["up_after"] < values["up_before"] - 15
                checks[f"rocket{slot}_down_moves_rendered_rocket"] = values["down_after"] > values["down_before"] + 5
                checks[f"rocket{slot}_movement_window_collision_free"] = not any(int(event["signal"]) == slot and event["value"] == "0" and times[0] * 10**9 <= int(event["time_ps"]) <= times[-1] * 10**9 for event in events)
                controls[key] = values
                previous_fall = None
                for event in events:
                    if int(event["signal"]) != slot:
                        continue
                    if event["value"] == "0":
                        previous_fall = int(event["time_ps"])
                    elif previous_fall is not None:
                        rise = int(event["time_ps"])
                        blank = [row for row in snapshots if previous_fall + 100 * 10**9 <= row["requested_ms"] * 10**9 <= rise - 100 * 10**9]
                        next_fall = min([int(row["time_ps"]) for row in events if int(row["signal"]) == slot and row["value"] == "0" and int(row["time_ps"]) > rise] or [duration])
                        returned = [row for row in snapshots if rise + 100 * 10**9 <= row["requested_ms"] * 10**9 <= min(rise + 10**12, next_fall - 100 * 10**9)]
                        crashes.append({"slot": slot, "fall_ps": previous_fall, "rise_ps": rise, "blank_duration_ps": rise - previous_fall,
                                        "snapshot_names": [row["image"] for row in blank], "blanked": bool(blank) and all(row[key] is None for row in blank),
                                        "recovery_snapshot_names": [row["image"] for row in returned], "rendered_recovery": bool(returned) and all(row[key] is not None for row in returned)})
                        previous_fall = None
            checks["crashed_rockets_disappear_in_actual_images"] = all(any(item["slot"] == slot and item["blanked"] for item in crashes) for slot in [1, 2])
            checks["crashed_rockets_return_after_source_recovery"] = all(any(item["slot"] == slot and item["blanked"] and item["rendered_recovery"] for item in crashes) for slot in [1, 2])
    evidence = {"game": game, "scenario": scenario["id"], "configuration": {key: scenario[key] for key in ["dip", "pot_ohms"]},
                "captured_configuration": captured_configuration,
                "checks": checks, "passed": all(checks.values()), "maximum_scores": maximum_scores,
                "active_transitions": active_transitions, "events_by_signal": event_counts, "contacts": contacts, "crashes": crashes,
                "rendered_controls": controls, "media_coverage": coverage,
                "pcm": {"sample_count": len(pcm), "minimum": min(pcm), "maximum": max(pcm), "active_gameplay_intervals": pcm_context, "sha256": sha256(path / "audio.s16le")},
                "input_maximum_skew_ps": max(skews), "hashes": {name: sha256(path / name) for name in EXACT},
                "limitations": ["Generated native PCM does not prove audible speaker output or historical analog-sound completeness.",
                                "Actual captured original behavior, including inherited coin/start/timer and analog-model TODOs, is the fidelity reference.",
                                "Alternate-coinage second Start/timer behavior does not by itself establish credit consumption because original no-credit Start can enable GAME_ON."]}
    (path / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT / "tests/replays/game-scenarios.json").read_text())
    selection = game_media.validate_selection(args.directory, manifest)
    result = {"schema_version": 1, "scenarios": [], "source": "immutable DICE 0.9 desktop + independently reviewed observation/input adapter",
              "requested_ids": selection["requested_ids"], "full_batch": selection["full_batch"],
              "selection_scope": selection.get("selection_scope"), "selection_errors": selection["errors"]}
    for scenario in selection["scenarios"]:
        path = args.directory / scenario["id"]
        attempts = []
        for attempt in ["baseline", "repeat"]:
            try:
                attempts.append(analyze_epoch(path / attempt / "epoch0", scenario))
            except (ValueError, OSError, KeyError, IndexError) as error:
                attempts.append({"passed": False, "error": str(error)})
        exact = {}
        for name in EXACT:
            try:
                exact[name] = sha256(path / "baseline/epoch0" / name) == sha256(path / "repeat/epoch0" / name)
            except OSError:
                exact[name] = False
        result["scenarios"].append({"id": scenario["id"], "game": scenario["game"], "attempts": attempts,
                                    "fresh_process_repeat_exact": exact, "passed": all(item["passed"] for item in attempts) and all(exact.values())})
    result["passed"] = not selection["errors"] and bool(result["scenarios"]) and all(item["passed"] for item in result["scenarios"])
    result["whole_batch_qualified"] = result["passed"] and result["full_batch"]
    (args.directory / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Original additional-game reference: {'PASS' if result['passed'] else 'FAIL'}; {args.directory / 'report.json'}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
