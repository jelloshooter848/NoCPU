#!/usr/bin/env python3
"""Assert behavior from native generated frames, circuit telemetry and PCM.

No golden rendering is invented here: this establishes a measured original
native reference that future browser work can compare against.
"""
import array
import csv
import hashlib
import json
import statistics
import sys
import wave
from pathlib import Path

WIDTH, HEIGHT = 160, 120
CONTACT_GAP_PS = 100_000_000_000  # 100 ms; raster pulses within one contact group together.


def read_rows(path):
    with path.open(newline="") as stream:
        return list(csv.DictReader(stream))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def components(frame):
    remaining = {i for i, value in enumerate(frame) if value > 150}
    result = []
    while remaining:
        start = remaining.pop()
        stack, pixels = [start], [start]
        while stack:
            i = stack.pop()
            x, y = i % WIDTH, i // WIDTH
            for j in (i - 1 if x else -1, i + 1 if x + 1 < WIDTH else -1,
                      i - WIDTH if y else -1, i + WIDTH if y + 1 < HEIGHT else -1):
                if j in remaining:
                    remaining.remove(j)
                    stack.append(j)
                    pixels.append(j)
        xs, ys = [i % WIDTH for i in pixels], [i // WIDTH for i in pixels]
        result.append({"x": statistics.mean(xs), "y": statistics.mean(ys),
                       "width": max(xs) - min(xs) + 1, "height": max(ys) - min(ys) + 1,
                       "area": len(pixels)})
    return result


def observe_frames(path):
    times = read_rows(path / "frames.csv")
    raw = (path / "frames.gray").read_bytes()
    if len(raw) != len(times) * WIDTH * HEIGHT:
        raise ValueError("Observation raster length does not match frame timestamps")
    observations = []
    for i, row in enumerate(times):
        parts = components(raw[i * WIDTH * HEIGHT:(i + 1) * WIDTH * HEIGHT])
        left = [p for p in parts if 10 < p["x"] < 35 and p["width"] <= 3 and p["height"] >= 5]
        right = [p for p in parts if 120 < p["x"] < 145 and p["width"] <= 3 and p["height"] >= 5]
        ball = [p for p in parts if 10 < p["x"] < 145 and not 73 < p["x"] < 79
                and p["width"] <= 3 and p["height"] <= 3 and 2 <= p["area"] <= 9]
        observations.append({"time_ps": int(row["time_ps"]),
                             "left_y": max(left, key=lambda p: p["area"])["y"] if left else None,
                             "right_y": max(right, key=lambda p: p["area"])["y"] if right else None,
                             "ball_x": ball[0]["x"] if len(ball) == 1 else None,
                             "ball_y": ball[0]["y"] if len(ball) == 1 else None})
    with (path / "positions.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["time_ps", "left_y", "right_y", "ball_x", "ball_y"])
        writer.writeheader()
        writer.writerows(observations)
    return observations


def window_median(observations, key, start_ms, end_ms):
    values = [row[key] for row in observations if row[key] is not None
              and start_ms * 10**9 <= row["time_ps"] <= end_ms * 10**9]
    if not values:
        raise ValueError("No observed %s in %s..%s ms" % (key, start_ms, end_ms))
    return statistics.median(values)


def velocity(observations, start, end):
    values = [(r["time_ps"] / 10**12, r["ball_x"]) for r in observations
              if r["ball_x"] is not None and start <= r["time_ps"] <= end]
    if len(values) < 3:
        raise ValueError("Not enough rendered ball positions near a contact")
    mean_t = statistics.mean(t for t, x in values)
    mean_x = statistics.mean(x for t, x in values)
    return sum((t - mean_t) * (x - mean_x) for t, x in values) / sum((t - mean_t)**2 for t, x in values)


def analyze_epoch(path):
    observations = observe_frames(path)
    telemetry = read_rows(path / "telemetry.csv")
    inputs = read_rows(path / "inputs.csv")
    collisions = read_rows(path / "collisions.csv")
    rising = [int(row["time_ps"]) for row in collisions if row["hit_output"] == "1"]
    groups = []
    for time in rising:
        if not groups or time - groups[-1][-1] > CONTACT_GAP_PS:
            groups.append([])
        groups[-1].append(time)
    contacts = []
    for group in groups:
        time = group[0]
        before = velocity(observations, time - 250 * 10**9, time - 50 * 10**9)
        after = velocity(observations, time + 50 * 10**9, time + 250 * 10**9)
        contacts.append({"time_ps": time, "rising_hit_pulses": len(group),
                         "x_velocity_before": before, "x_velocity_after": after,
                         "rendered_direction_reversed": before * after < 0})

    def state(ms):
        return min(telemetry, key=lambda row: abs(int(row["time_ps"]) - ms * 10**9))

    left_center = window_median(observations, "left_y", 900, 1200)
    right_center = window_median(observations, "right_y", 900, 1200)
    left_moved = window_median(observations, "left_y", 1800, 2100)
    right_held = window_median(observations, "right_y", 1800, 2100)
    left_held = window_median(observations, "left_y", 2600, 2750)
    right_moved = window_median(observations, "right_y", 2600, 2750)
    maximum_score = max(int(row["score1"]) + int(row["score2"]) for row in telemetry)
    pre_restart = state(13800)
    after_restart = state(14500)
    skews = [int(row["applied_ps"]) - int(row["requested_ps"]) for row in inputs]

    pcm = (path / "audio.s16le").read_bytes()
    samples = array.array("h")
    samples.frombytes(pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    # Generated samples during active play; skip initial settling/attract.
    active = samples[48000:14 * 48000]
    transitions = sum(a != b for a, b in zip(active, active[1:]))
    with wave.open(str(path / "audio.wav"), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes(pcm)
    gl_errors = read_rows(path / "renderer-errors.csv") if (path / "renderer-errors.csv").exists() else []
    checks = {
        "settled_attract_before_coin": state(250)["run_n"] == "1" and state(250)["attract_n"] == "0",
        "coin_starts_active_game": state(1000)["run_n"] == "0" and state(1000)["attract_n"] == "1",
        "left_paddle_moves_independently": abs(left_moved - left_center) >= 15 and abs(right_held - right_center) <= 2,
        "right_paddle_moves_independently": abs(right_moved - right_center) >= 15 and abs(left_held - left_center) <= 2,
        "two_distinct_paddle_contacts": len(contacts) >= 2,
        "rendered_rally_reverses_at_contacts": len(contacts) >= 2 and all(c["rendered_direction_reversed"] for c in contacts[:2]),
        "circuit_score_increases": maximum_score >= 1,
        "coin_restarts_and_clears_score": int(pre_restart["score1"]) + int(pre_restart["score2"]) >= 1
            and after_restart["score1"] == "0" and after_restart["score2"] == "0" and after_restart["run_n"] == "0",
        "native_pcm_contains_sound_transitions": len(active) >= 12 * 48000 and max(active) - min(active) > 500 and transitions > 100,
        "input_schedule_skew_bounded": bool(skews) and min(skews) >= 0 and max(skews) < 10**7,
        "full_scenario_completed": int(telemetry[-1]["time_ps"]) >= 16000 * 10**9 and inputs[-1]["action"] == "recreate",
    }
    evidence = {"checks": checks, "passed": all(checks.values()), "frame_count": len(observations),
                "contacts": contacts, "maximum_total_score": maximum_score,
                "paddle_observations": {"center": [left_center, right_center], "left_move": [left_moved, right_held],
                                        "right_move": [left_held, right_moved]},
                "input_maximum_skew_ps": max(skews),
                "pcm": {"rate": 48000, "channels": 1, "sample_count": len(samples),
                        "active_min": min(active), "active_max": max(active), "active_transitions": transitions,
                        "sha256": sha256(path / "audio.s16le")},
                "initial_telemetry": telemetry[0], "settled_telemetry_250ms": state(250),
                "preexisting_renderer_errors": gl_errors,
                "hashes": {name: sha256(path / name) for name in ["frames.csv", "frames.gray", "telemetry.csv", "inputs.csv", "collisions.csv"]}}
    (path / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def main():
    root = Path(sys.argv[1])
    repo = Path(__file__).resolve().parents[2]
    manifest = json.loads((repo / "tests/source-manifest.json").read_text())
    provenance = root / "source/toolchain-provenance"
    image_file = root / "capture-image-id.txt"
    build_identity = {
        "version": (repo / "VERSION").read_text().strip(),
        "source_archive_sha256": manifest["source_archive_sha256"],
        "replay_sha256": sha256(repo / "tests/replays/pong.tsv"),
        "adapted_binary_sha256": sha256(root / "source/dice"),
        "adapter_diff_sha256": sha256(root / "adapter.diff"),
        "native_binary_sha256_record": (provenance / "binary.sha256").read_text().strip(),
        "toolchain_image_id": image_file.read_text().strip() if image_file.exists() else None,
        "toolchain_provenance_path": "source/toolchain-provenance",
        "native_toolchain_image_id": (provenance / "image-id.txt").read_text().strip(),
        "toolchain_check": (provenance / "check.txt").read_text().strip(),
        "toolchain_packages_sha256": sha256(provenance / "packages.tsv"),
    }
    epochs = {run: [analyze_epoch(root / run / ("epoch%d" % i)) for i in range(2)]
              for run in ["baseline", "repeat"]}
    identical = []
    for i in range(2):
        a, b = epochs["baseline"][i], epochs["repeat"][i]
        identical.append(a["hashes"] == b["hashes"] and a["pcm"]["sha256"] == b["pcm"]["sha256"])
    first, recreated = epochs["baseline"]
    report = {"schema_version": 1, "reference": "original DICE 0.9 native Qt4/OpenGL/SDL1.2",
              "seed": 848, "scenario": "tests/replays/pong.tsv", "simulation_epochs_per_process": 2,
              "build_identity": build_identity,
              "fresh_process_repeat_identical_by_epoch": identical,
              "same_process_recreation": {
                  "fresh_and_recreated_pcm_identical": first["pcm"]["sha256"] == recreated["pcm"]["sha256"],
                  "fresh_and_recreated_frames_identical": first["hashes"]["frames.csv"] == recreated["hashes"]["frames.csv"],
                  "initial_signal_state_equal": first["initial_telemetry"] == recreated["initial_telemetry"],
                  "both_epochs_pass_behavioral_checks": first["passed"] and recreated["passed"],
                  "interpretation": "Recreation reuses original static descriptors and frontend objects. Startup equivalence is measured, not assumed; future reset isolation remains a port requirement."},
              "epochs": epochs,
              "limitations": ["PCM is tapped at native sample production; SDL dummy playback does not verify audible speaker output.",
                              "Replay uses injected keyboard and absolute joystick values; physical input-device handling is not covered.",
                              "HIT raster pulses are grouped using 100 ms gaps; contact assertions also require rendered horizontal trajectory reversals.",
                              "This is a measured DICE reference, not validation against an original physical Pong board.",
                              "Fresh-process hash equality is scoped to this pinned native toolchain and renderer.",
                              "Native preexisting OpenGL errors are recorded separately before adapter reads."],
              "passed": all(e["passed"] for runs in epochs.values() for e in runs) and all(identical)}
    (root / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    if not report["passed"]:
        for run, runs in epochs.items():
            for i, evidence in enumerate(runs):
                for check, passed in evidence["checks"].items():
                    if not passed:
                        print("FAILED %s/epoch%d: %s" % (run, i, check), file=sys.stderr)
        if not all(identical):
            print("FAILED fresh-process repeat hashes: %r" % identical, file=sys.stderr)
        raise SystemExit(1)
    print("Pong reference passed: independent paddles, two contacts, scoring, restart, native PCM, and repeat hashes.")


if __name__ == "__main__":
    main()
