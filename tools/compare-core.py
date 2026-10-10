#!/usr/bin/env python3
"""Qualify the public Pong ABI against the immutable native DICE reference.

Exact comparison is required for PCM, event times, controls and chip telemetry.
The renderer is measured separately: matching complete hashes are reported;
settled geometry must remain within one 160x120 observation pixel. Wasm and
portable native outputs, including full framebuffer hashes, must be exact.
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_analysis", ROOT / "tools/reference/analyze.py")
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)
EXACT = ["audio.s16le", "telemetry.csv", "inputs.csv", "collisions.csv", "frames.csv", "frames.gray"]
PORTABLE_EXACT = EXACT


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path):
    with path.open(newline="") as stream:
        return list(csv.DictReader(stream))


def renderer(reference, portable):
    original_frames = rows(reference / "frames.csv")
    portable_frames = rows(portable / "frames.csv")
    timestamps_equal = [(r["frame"], r["time_ps"]) for r in original_frames] == [(r["frame"], r["time_ps"]) for r in portable_frames]
    original = rows(reference / "positions.csv")
    adapted = rows(portable / "positions.csv")
    errors = {key: [] for key in ["left_y", "right_y", "ball_x", "ball_y"]}
    unmatched = {key: 0 for key in errors}
    compared = 0
    for a, b in zip(original, adapted):
        # Native GL's first zero-projection frame is an inherited startup error.
        # Require every settled frame, without allowing missing geometry to pass.
        if int(a["time_ps"]) < 250_000_000_000:
            continue
        compared += 1
        for key in errors:
            if bool(a[key]) != bool(b[key]):
                unmatched[key] += 1
            elif a[key]:
                errors[key].append(abs(float(a[key]) - float(b[key])))
    geometry = {key: {"samples": len(values), "maximum_error_observation_pixels": max(values) if values else None,
                      "median_error_observation_pixels": statistics.median(values) if values else None,
                      "presence_mismatches": unmatched[key]} for key, values in errors.items()}
    passed = timestamps_equal and compared >= 900 and all(v["samples"] > 100 and v["maximum_error_observation_pixels"] <= 1 and v["presence_mismatches"] == 0 for v in geometry.values())
    return {"passed": passed, "frame_timestamps_exact": timestamps_equal,
            "full_frame_hashes_exact": original_frames == portable_frames,
            "observation_rasters_exact": digest(reference / "frames.gray") == digest(portable / "frames.gray"),
            "settled_frames_compared": compared, "geometry": geometry,
            "tolerance": "One 160x120 observation pixel after 250 ms; matching component presence required."}


def compare(original, native, wasm, report_path):
    behavioral = {}
    for label, path in [("portable_native", native), ("wasm", wasm)]:
        behavioral[label] = []
        for i in range(2):
            try:
                behavioral[label].append(analysis.analyze_epoch(path / f"epoch{i}"))
            except (ValueError, KeyError, IndexError, OSError) as error:
                behavioral[label].append({"passed": False, "checks": {"complete_observable_scenario": False}, "error": str(error)})
    native_original = {name: digest(original / "baseline/epoch0" / name) == digest(native / "epoch0" / name) for name in EXACT}
    portable_wasm = [{name: digest(native / f"epoch{i}" / name) == digest(wasm / f"epoch{i}" / name) for name in PORTABLE_EXACT} for i in range(2)]
    reset = {label: {name: digest(path / "epoch0" / name) == digest(path / "epoch1" / name) for name in PORTABLE_EXACT} for label, path in [("portable_native", native), ("wasm", wasm)]}
    geometry = renderer(original / "baseline/epoch0", native / "epoch0")
    report = {
        "schema_version": 1, "version": (ROOT / "VERSION").read_text().strip(), "scenario": "tests/replays/pong.tsv", "seed": 848,
        "original_to_portable_native_exact": native_original, "original_to_portable_native_renderer": geometry,
        "portable_native_to_wasm_exact_by_epoch": portable_wasm, "same_module_reset_isolation_exact": reset,
        "behavioral_epochs": behavioral,
        "limitations": ["Original GL startup frame is characterized separately; geometry comparisons begin at 250 ms.",
                        "Original same-process recreation retains mutable descriptors; portable reset deliberately restores fresh descriptors.",
                        "Generated PCM comparisons do not establish audible speaker output or physical phone performance."],
    }
    report["passed"] = all(native_original.values()) and geometry["passed"] and all(all(epoch.values()) for epoch in portable_wasm) and all(all(epoch.values()) for epoch in reset.values()) and all(e["passed"] for epochs in behavioral.values() for e in epochs)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path, default=ROOT / "build/reference")
    parser.add_argument("--native", type=Path, default=ROOT / "build/core/native-evidence")
    parser.add_argument("--wasm", type=Path, default=ROOT / "build/core/wasm-evidence")
    parser.add_argument("--report", type=Path, default=ROOT / "build/core/comparison.json")
    args = parser.parse_args()
    result = compare(args.original, args.native, args.wasm, args.report)
    print("Pong original/native/Wasm comparison: " + ("PASS" if result["passed"] else "FAIL") + "; " + str(args.report))
    raise SystemExit(0 if result["passed"] else 1)
