#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""ROM-backed browser reports keep results and JSON evidence, never images."""
import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n' + bytes(32)).decode()


def run(report):
    with tempfile.TemporaryDirectory() as directory:
        source, output = Path(directory, 'in.json'), Path(directory, 'out.json')
        source.write_text(json.dumps(report))
        result = subprocess.run([sys.executable, str(ROOT / 'tools/strip-rom-report.py'), str(source), str(output)],
                                capture_output=True, text=True)
        return result, (json.loads(output.read_text()) if output.exists() else None)


class StripTests(unittest.TestCase):
    def test_images_and_files_are_dropped_json_kept(self):
        evidence = base64.b64encode(b'{"score": 9}').decode()
        report = {'suites': [{'specs': [{'title': 'stunt', 'tests': [{'results': [{'status': 'passed', 'attachments': [
            {'name': 'stuntcycle-playing-viewport.png', 'contentType': 'image/png', 'body': PNG},
            {'name': 'trace', 'contentType': 'application/zip', 'path': '/tmp/trace.zip'},
            {'name': 'screenshot', 'contentType': 'image/png', 'path': '/tmp/a.png'},
            {'name': 'score.json', 'contentType': 'application/json', 'body': evidence}]}]}]}]}]}
        result, output = run(report)
        self.assertEqual(result.returncode, 0, result.stderr)
        attachments = output['suites'][0]['specs'][0]['tests'][0]['results'][0]['attachments']
        self.assertEqual([item['name'] for item in attachments], ['score.json'])
        self.assertEqual(output['suites'][0]['specs'][0]['tests'][0]['results'][0]['status'], 'passed')
        self.assertNotIn('iVBORw0KGgo', json.dumps(output))
        self.assertEqual(len(output['nocpu_filter']['dropped_attachments']), 3)

    def test_image_data_hidden_in_a_kept_attachment_is_refused(self):
        sneaky = base64.b64encode(json.dumps({'frame': PNG}).encode()).decode()
        report = {'attachments': [{'name': 'x.json', 'contentType': 'application/json', 'body': sneaky}]}
        result, output = run(report)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
