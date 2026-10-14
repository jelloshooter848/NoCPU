#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""ROM-backed browser reports keep results and reviewed small JSON, never images."""
import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n' + bytes(32)).decode()
ALLOWED = 'stunt-original-score9-software.json'


def encode(value):
    return base64.b64encode(json.dumps(value).encode()).decode()


def run(attachments):
    report = {'suites': [{'specs': [{'title': 'stunt', 'tests': [{'results': [
        {'status': 'passed', 'attachments': attachments}]}]}]}]}
    with tempfile.TemporaryDirectory() as directory:
        source, output = Path(directory, 'in.json'), Path(directory, 'out.json')
        source.write_text(json.dumps(report))
        result = subprocess.run([sys.executable, str(ROOT / 'tools/strip-rom-report.py'), str(source), str(output)],
                                capture_output=True, text=True)
        data = json.loads(output.read_text()) if output.exists() else None
    kept = None if data is None else data['suites'][0]['specs'][0]['tests'][0]['results'][0]['attachments']
    return result, data, kept


class StripTests(unittest.TestCase):
    def test_images_and_files_are_dropped_reviewed_json_kept(self):
        result, data, kept = run([
            {'name': 'stuntcycle-playing-viewport.png', 'contentType': 'image/png', 'body': PNG},
            {'name': 'trace', 'contentType': 'application/zip', 'path': '/tmp/trace.zip'},
            {'name': 'screenshot', 'contentType': 'image/png', 'path': '/tmp/a.png'},
            {'name': ALLOWED, 'contentType': 'application/json', 'body': encode({'rawScore': 9, 'axis': 6554})}])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([item['name'] for item in kept], [ALLOWED])
        self.assertEqual(data['suites'][0]['specs'][0]['tests'][0]['results'][0]['status'], 'passed')
        self.assertNotIn('iVBORw0KGgo', json.dumps(data))
        self.assertEqual(len(data['nocpu_filter']['dropped_attachments']), 3)
        self.assertIn('Dropped attachment stuntcycle-playing-viewport.png', result.stdout)

    def test_unlisted_name_is_dropped(self):
        result, data, kept = run([{'name': 'indy4-geometry.json', 'contentType': 'application/json',
                                   'body': encode({'ok': True})}])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(kept, [])
        self.assertIn('indy4-geometry.json: name not on the allow-list', data['nocpu_filter']['dropped_attachments'])

    def test_oversized_body_is_dropped(self):
        result, data, kept = run([{'name': ALLOWED, 'contentType': 'application/json',
                                   'body': encode({'note': 'x' * 5000})}])
        self.assertEqual(kept, [])
        self.assertTrue(any('over 4096' in item for item in data['nocpu_filter']['dropped_attachments']))

    def test_numeric_pixel_array_is_dropped(self):
        pixels = list(range(256)) * 2  # raster-like values; 300 of them stay under the size cap
        body = base64.b64encode(json.dumps({'row': pixels[:300]}, separators=(',', ':')).encode()).decode()
        self.assertLess(len(base64.b64decode(body)), 4096)
        result, data, kept = run([{'name': ALLOWED, 'contentType': 'application/json', 'body': body}])
        self.assertEqual(kept, [])
        self.assertTrue(any('numeric array' in item for item in data['nocpu_filter']['dropped_attachments']))

    def test_bodies_of_any_length_are_scanned_without_crashing(self):
        # Run 38503290638 crashed on an 89-character body outside the attachments.
        for length in (89, 90, 91, 93, 1, 5):
            report = {'config': {'metadata': {'note': {'body': 'A' * length}}}, 'suites': []}
            with tempfile.TemporaryDirectory() as directory:
                source, output = Path(directory, 'in.json'), Path(directory, 'out.json')
                source.write_text(json.dumps(report))
                result = subprocess.run([sys.executable, str(ROOT / 'tools/strip-rom-report.py'), str(source), str(output)],
                                        capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f'{length}: {result.stderr}')

    def test_image_bytes_in_a_misaligned_body_or_buffer_are_refused(self):
        # One leading byte shifts the base64 so the PNG prefix text never appears raw.
        hidden = base64.b64encode(b'x' + b'\x89PNG\r\n\x1a\n' + bytes(40)).decode()
        self.assertNotIn('iVBORw0KGgo', hidden)
        jpeg = base64.b64encode(b'yy' + b'\xff\xd8\xff\xe0' + bytes(40)).decode()
        for node in ({'body': hidden + 'A'}, {'body': hidden + 'AB'}, {'buffer': jpeg + 'A'}, {'buffer': jpeg}):
            report = {'suites': [{'specs': [{'tests': [{'results': [{'stdout': [node], 'attachments': []}]}]}]}]}
            with tempfile.TemporaryDirectory() as directory:
                source, output = Path(directory, 'in.json'), Path(directory, 'out.json')
                source.write_text(json.dumps(report))
                result = subprocess.run([sys.executable, str(ROOT / 'tools/strip-rom-report.py'), str(source), str(output)],
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, node)
                self.assertFalse(output.exists())
                self.assertIn('Refusing to write', result.stderr)

    def test_image_data_that_survives_filtering_is_refused(self):
        # A kept attachment whose JSON carries base64 PNG text: the final scan refuses to write.
        result, data, kept = run([{'name': ALLOWED, 'contentType': 'application/json', 'body': encode({'frame': PNG})}])
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(data)


if __name__ == '__main__':
    unittest.main()
