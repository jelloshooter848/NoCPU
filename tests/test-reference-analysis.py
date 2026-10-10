#!/usr/bin/env python3
"""Qualification-gate regressions; native artifacts are optional and local-only.

Without arguments, test complete media timing and exact replay-log accounting.
With --reference-dir, additionally mutate copies of real captures under ignored
build/audit-reference. No ROM, executable, or capture fixture is tracked here.
"""
import argparse
import csv
import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("reference_analysis", ROOT / "tools/reference/analyze.py")
ANALYZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ANALYZER)
ARTIFACT_DIR = None


def recorded_events():
    return [{"requested_ps": str(time), "applied_ps": str(time), "action": action, "value": str(value)}
            for time, action, value in ANALYZER.read_replay()]


def frame_timestamps():
    # Timing-only data models the measured original cadence, without simulating
    # gameplay or inventing pixel/audio fixtures.
    return [{"frame": str(i), "time_ps": str(16_652_246_960 + i * 16_651_252_800)} for i in range(960)]


class QualificationGateTests(unittest.TestCase):
    def test_complete_native_timing_is_accepted(self):
        coverage = ANALYZER.media_coverage(frame_timestamps(), 768002, 16 * 10**12)
        self.assertTrue(all(coverage["checks"].values()))

    def test_six_second_video_is_rejected(self):
        checks = ANALYZER.media_coverage(frame_timestamps()[:360], 768002, 16 * 10**12)["checks"]
        self.assertFalse(checks["native_video_duration_complete"])

    def test_thirteen_second_pcm_is_rejected(self):
        checks = ANALYZER.media_coverage(frame_timestamps(), 624000, 16 * 10**12)["checks"]
        self.assertFalse(checks["native_pcm_duration_complete"])

    def test_missing_frame_inside_stream_is_rejected(self):
        rows = frame_timestamps()
        del rows[400]
        self.assertFalse(ANALYZER.media_coverage(rows, 768002, 16 * 10**12)["checks"]["native_video_cadence_complete"])

    def test_duplicate_frame_timestamp_is_rejected(self):
        rows = frame_timestamps()
        rows[400]["time_ps"] = rows[399]["time_ps"]
        self.assertFalse(ANALYZER.media_coverage(rows, 768002, 16 * 10**12)["checks"]["native_video_cadence_complete"])

    def test_missing_first_frame_is_rejected(self):
        rows = frame_timestamps()[1:]
        self.assertFalse(ANALYZER.media_coverage(rows, 768002, 16 * 10**12)["checks"]["native_video_duration_complete"])

    def test_missing_final_frame_is_rejected(self):
        self.assertFalse(ANALYZER.media_coverage(frame_timestamps()[:-1], 768002, 16 * 10**12)["checks"]["native_video_duration_complete"])

    def test_pcm_sample_tolerance_is_bounded(self):
        for count in (767996, 768004):
            self.assertTrue(ANALYZER.media_coverage(frame_timestamps(), count, 16 * 10**12)["checks"]["native_pcm_duration_complete"])
        for count in (767995, 768005):
            self.assertFalse(ANALYZER.media_coverage(frame_timestamps(), count, 16 * 10**12)["checks"]["native_pcm_duration_complete"])

    def test_declared_replay_is_accepted(self):
        self.assertTrue(ANALYZER.validate_recorded_inputs(recorded_events(), ANALYZER.read_replay()))

    def test_only_recreation_event_is_rejected(self):
        self.assertFalse(ANALYZER.validate_recorded_inputs(recorded_events()[-1:], ANALYZER.read_replay()))

    def test_each_missing_event_is_rejected(self):
        for i in range(len(recorded_events())):
            with self.subTest(event=i):
                rows = recorded_events()
                del rows[i]
                self.assertFalse(ANALYZER.validate_recorded_inputs(rows, ANALYZER.read_replay()))

    def test_changed_values_actions_and_timestamps_are_rejected(self):
        for field, value in (("value", "-17000"), ("action", "paddle2"), ("requested_ps", "1500000000001")):
            with self.subTest(field=field):
                rows = recorded_events()
                rows[2][field] = value
                self.assertFalse(ANALYZER.validate_recorded_inputs(rows, ANALYZER.read_replay()))

    def test_extra_duplicate_is_rejected(self):
        rows = recorded_events()
        rows.insert(8, dict(rows[7]))
        self.assertFalse(ANALYZER.validate_recorded_inputs(rows, ANALYZER.read_replay()))

    def test_equal_timestamp_events_must_retain_order(self):
        rows = recorded_events()
        self.assertEqual(rows[7]["requested_ps"], rows[8]["requested_ps"])
        rows[7], rows[8] = rows[8], rows[7]
        self.assertFalse(ANALYZER.validate_recorded_inputs(rows, ANALYZER.read_replay()))


@unittest.skipUnless(ARTIFACT_DIR, "Pass --reference-dir after native capture to test actual artifact mutations")
class NativeArtifactRegressions(unittest.TestCase):
    def setUp(self):
        audit_root = ROOT / "build/audit-reference"
        audit_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="regression-", dir=audit_root)
        self.addCleanup(self.temp.cleanup)
        self.epoch = Path(self.temp.name) / "epoch"
        shutil.copytree(ARTIFACT_DIR / "baseline/epoch0", self.epoch)

    def assert_rejected(self, check):
        evidence = ANALYZER.analyze_epoch(self.epoch)
        self.assertFalse(evidence["passed"])
        self.assertFalse(evidence["checks"][check])

    def write_inputs(self, rows):
        with (self.epoch / "inputs.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["requested_ps", "applied_ps", "action", "value"])
            writer.writeheader()
            writer.writerows(rows)

    def test_unmodified_native_capture_passes(self):
        self.assertTrue(ANALYZER.analyze_epoch(self.epoch)["passed"])

    def test_real_video_truncated_to_360_frames_is_rejected(self):
        rows = ANALYZER.read_rows(self.epoch / "frames.csv")[:360]
        with (self.epoch / "frames.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["frame", "time_ps", "fnv1a64"])
            writer.writeheader()
            writer.writerows(rows)
        raw = (self.epoch / "frames.gray").read_bytes()
        (self.epoch / "frames.gray").write_bytes(raw[:360 * ANALYZER.WIDTH * ANALYZER.HEIGHT])
        self.assert_rejected("native_video_duration_complete")

    def test_real_pcm_truncated_to_624000_samples_is_rejected(self):
        raw = (self.epoch / "audio.s16le").read_bytes()
        (self.epoch / "audio.s16le").write_bytes(raw[:624000 * 2])
        self.assert_rejected("native_pcm_duration_complete")

    def test_real_input_log_with_only_recreation_is_rejected(self):
        self.write_inputs(ANALYZER.read_rows(self.epoch / "inputs.csv")[-1:])
        self.assert_rejected("recorded_inputs_match_declared_replay")

    def test_real_input_log_with_changed_paddle_value_is_rejected(self):
        rows = ANALYZER.read_rows(self.epoch / "inputs.csv")
        rows[2]["value"] = "-17000"
        self.write_inputs(rows)
        self.assert_rejected("recorded_inputs_match_declared_replay")

    def test_real_input_log_with_extra_duplicate_is_rejected(self):
        rows = ANALYZER.read_rows(self.epoch / "inputs.csv")
        rows.insert(8, dict(rows[7]))
        self.write_inputs(rows)
        self.assert_rejected("recorded_inputs_match_declared_replay")

    def test_real_equal_timestamp_input_order_is_checked(self):
        rows = ANALYZER.read_rows(self.epoch / "inputs.csv")
        rows[7], rows[8] = rows[8], rows[7]
        self.write_inputs(rows)
        self.assert_rejected("recorded_inputs_match_declared_replay")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-dir", type=Path)
    args, unittest_args = parser.parse_known_args()
    ARTIFACT_DIR = args.reference_dir.resolve() if args.reference_dir else None
    # The decorator is evaluated before command-line arguments are parsed.
    NativeArtifactRegressions.__unittest_skip__ = ARTIFACT_DIR is None
    unittest.main(argv=[str(Path(__file__))] + unittest_args)
