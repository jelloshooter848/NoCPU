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
PNG = base64.b64encode(b'\x89PNG\r\n\x1a\n' + bytes(64)).decode()
ALLOWED = 'stunt-original-score9-software.json'


def encode(value):
    return base64.b64encode(json.dumps(value).encode()).decode()


def run_report(report):
    with tempfile.TemporaryDirectory() as directory:
        source, output = Path(directory, 'in.json'), Path(directory, 'out.json')
        source.write_text(json.dumps(report))
        result = subprocess.run([sys.executable, str(ROOT / 'tools/strip-rom-report.py'), str(source), str(output)],
                                capture_output=True, text=True)
        return result, (json.loads(output.read_text()) if output.exists() else None)


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
            result, data = run_report({'config': {'metadata': {'note': {'body': 'A' * length}}}, 'suites': []})
            self.assertEqual(result.returncode, 0, f'{length}: {result.stderr}')

    def test_ci_commit_metadata_is_not_mistaken_for_image_data(self):
        # Playwright's CI metadata copies the commit message into config.metadata.gitCommit.body.
        # e3f7b1d's message said "the image/trace markers" and was refused; 7c38d1b's PR merge
        # message was an 89-character body that crashed a base64 decode.
        commit = {'shortHash': 'e3f7b1d', 'subject': 'Scan ROM report bodies of any length instead of crashing',
                  'body': 'truncated to whole base64 quanta) for the image/trace markers and for\n'
                          'PNG, JPEG, GIF, RIFF and ZIP magic bytes. /9j/ UklGR R0lGOD iVBORw0KGgo\n',
                  'branch': 'restart/desktop-first'}
        merge = {'shortHash': '7c38d1b', 'body': 'M' * 89}
        for git_commit in (commit, merge):
            metadata = {'gitCommit': git_commit, 'actualWorkers': 1}
            report = {'config': {'metadata': metadata, 'projects': [{'metadata': metadata}, {'metadata': metadata}]},
                      'suites': [{'specs': [{'tests': [{'results': [{'status': 'passed', 'stdout': [{'text': 'image/png ok'}],
                                                                     'attachments': [
                          {'name': 'stuntcycle-playing-viewport.png', 'contentType': 'image/png', 'body': PNG},
                          {'name': ALLOWED, 'contentType': 'application/json', 'body': encode({'rawScore': 9})}]}]}]}]}]}
            result, data = run_report(report)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('metadata', data['config'])
            self.assertTrue(all('metadata' not in project for project in data['config']['projects']))
            self.assertNotIn('iVBORw0KGgoAAAA', json.dumps(data))

    def test_pr_source_diff_in_metadata_is_dropped_not_scanned(self):
        # Run 38509694561 (PR merge ref 584f731): Playwright's gitDiff held this tool's own
        # source, with its data-URI and trace patterns, in config.projects[*].metadata.
        diff = ('diff --git a/tools/strip-rom-report.py b/tools/strip-rom-report.py\n'
                "+DATA_URI = re.compile(r'data:(?:image|video)/[A-Za-z0-9.+-]+;base64,', re.I)\n"
                "+            'data URI in stdout text': {'stdout': [{'text': 'data:image/png;base64,AAAA'}]},\n"
                "+    if 'trace.zip' in text:\n")
        metadata = {'ci': {'pr': {'title': 'Release v0.1.2: data:image/png;base64, trace.zip'}},
                    'gitCommit': {'body': 'see trace.zip'}, 'gitDiff': diff}
        report = {'config': {'metadata': metadata, 'projects': [{'name': 'chromium', 'metadata': metadata},
                                                                {'name': 'firefox', 'metadata': metadata}]},
                  'suites': []}
        result, data = run_report(report)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('gitDiff', json.dumps(data))
        self.assertIn('config.metadata: run metadata (commit, diff, CI) not published',
                      data['nocpu_filter']['dropped_attachments'])
        # The same text anywhere else is still refused.
        report = {'config': {'projects': [{'name': 'chromium'}]},
                  'suites': [{'specs': [{'tests': [{'results': [{'errors': [{'message': diff}], 'attachments': []}]}]}]}]}
        result, data = run_report(report)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(data)

    def test_browser_test_sources_cannot_trip_the_scan_through_error_snippets(self):
        # A failing ROM test's errors carry a source snippet of the spec or its helpers.
        import importlib.util
        spec = importlib.util.spec_from_file_location('strip_rom_report', ROOT / 'tools/strip-rom-report.py')
        tool = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(tool)
        for path in sorted((ROOT / 'tests/browser').glob('*.ts')):
            self.assertEqual(tool.text_findings(path.read_text()), [], path.name)

    def test_image_data_outside_attachments_is_refused(self):
        png = base64.b64encode(b'\x89PNG\r\n\x1a\n' + bytes(64)).decode()
        jpeg = base64.b64encode(b'\xff\xd8\xff\xe0' + bytes(64)).decode()
        cases = {
            'base64 PNG in an error message': {'errors': [{'message': f'frame "{png}"'}]},
            'data URI in stdout text': {'stdout': [{'text': 'data:image/png;base64,AAAA'}]},
            'PNG bytes in a stdout buffer': {'stdout': [{'buffer': png}]},
            'JPEG bytes in a stderr buffer': {'stderr': [{'buffer': jpeg}]},
            'misaligned buffer that does not decode': {'stdout': [{'buffer': jpeg + 'A'}]},
            'trace reference': {'errors': [{'message': 'see build/browser-results/trace.zip'}]},
        }
        for label, result_fields in cases.items():
            report = {'suites': [{'specs': [{'tests': [{'results': [{'status': 'failed', 'attachments': [],
                                                                     **result_fields}]}]}]}]}
            result, data = run_report(report)
            self.assertNotEqual(result.returncode, 0, label)
            self.assertIsNone(data, label)
            self.assertIn('Refusing to write', result.stderr)

    def test_image_data_that_survives_filtering_is_refused(self):
        # A kept attachment whose JSON carries base64 PNG text: the final scan refuses to write.
        result, data, kept = run([{'name': ALLOWED, 'contentType': 'application/json', 'body': encode({'frame': PNG})}])
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(data)
        self.assertIn('attachments/0/body: base64 image', result.stderr)


if __name__ == '__main__':
    unittest.main()
