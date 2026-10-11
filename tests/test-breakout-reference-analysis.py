#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fault challenges for source-frame identity; synthetic images are not goldens."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('breakout_analysis', ROOT / 'tools/reference/breakout_analysis.py')
ANALYSIS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ANALYSIS)


def read_rows(path):
    with path.open() as stream:
        return list(csv.DictReader(stream))


class SnapshotBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        # Independent arithmetic: one nonzero pixel on the top row. A reversed
        # row order has a different whole-buffer FNV, testing the GL/PPM boundary.
        self.rgb = bytearray(324 * 432 * 3)
        self.rgb[:3] = bytes((163, 30, 10))
        value = 14695981039346656037
        bottom_up = bytes(self.rgb[324 * 3:]) + bytes(self.rgb[:324 * 3])
        for byte in bottom_up:
            value = ((value ^ byte) * 1099511628211) % (2**64)
        self.frame = {'frame': '0', 'time_ps': '250000000000', 'fnv1a64': str(value)}
        self.write_frames([self.frame])
        self.write_image()

    def write_frames(self, frames):
        with (self.path / 'frames.csv').open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['frame', 'time_ps', 'fnv1a64'])
            writer.writeheader()
            writer.writerows(frames)

    def write_image(self):
        (self.path / '250ms.ppm').write_bytes(b'P6\n324 432\n255\n' + self.rgb)

    def test_matching_actual_frame_identity_includes_index_time_and_RGB_hash(self):
        rows = ANALYSIS.snapshot_positions(self.path, read_rows)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['frame'], 0)
        self.assertEqual(rows[0]['time_ps'], 250000000000)
        self.assertEqual(rows[0]['bottom_up_RGB_fnv1a64'], self.frame['fnv1a64'])

    def test_stale_valid_PPM_payload_cannot_borrow_correct_name_and_timestamp(self):
        self.rgb[3] = 204
        self.write_image()
        with self.assertRaisesRegex(ValueError, 'RGB bytes differ'):
            ANALYSIS.snapshot_positions(self.path, read_rows)

    def test_top_down_hash_cannot_replace_original_GL_bottom_up_hash(self):
        value = 14695981039346656037
        for byte in self.rgb:
            value = ((value ^ byte) * 1099511628211) % (2**64)
        self.frame['fnv1a64'] = str(value)
        self.write_frames([self.frame])
        with self.assertRaisesRegex(ValueError, 'RGB bytes differ'):
            ANALYSIS.snapshot_positions(self.path, read_rows)

    def test_missing_duplicate_and_noncanonical_frame_indices_fail(self):
        for records in ([], [self.frame, self.frame], [{**self.frame, 'frame': '1'}]):
            with self.subTest(records=records):
                self.write_frames(records)
                with self.assertRaises(ValueError):
                    ANALYSIS.snapshot_positions(self.path, read_rows)

    def test_missing_extra_and_aliased_snapshot_names_fail(self):
        image = self.path / '250ms.ppm'
        for name in ('399ms.ppm', '0250ms.ppm'):
            with self.subTest(name=name):
                extra = self.path / name
                extra.write_bytes(image.read_bytes())
                with self.assertRaises(ValueError):
                    ANALYSIS.snapshot_positions(self.path, read_rows)
                extra.unlink()
        image.unlink()
        with self.assertRaises(ValueError):
            ANALYSIS.snapshot_positions(self.path, read_rows)


if __name__ == '__main__':
    unittest.main()
