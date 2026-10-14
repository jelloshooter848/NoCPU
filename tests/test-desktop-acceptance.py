#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Failure injection for the generated desktop acceptance record (tools/desktop-acceptance.py)."""
from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('desktop_acceptance', ROOT / 'tools/desktop-acceptance.py')
assert spec and spec.loader
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)

POLICY = {'required_for_release': True, 'games': ['pong', 'stuntcycle'], 'browsers': ['chromium', 'firefox']}
VERSIONS = {'chromium': '145.0.7632.6', 'firefox': '146.0.1', 'webkit': '26.0'}


def identity(engine):
    return {'schema_version': 1, 'project': engine, 'engine': engine, 'version': VERSIONS[engine], 'headless': True,
            'playwright_version': '1.58.2', 'emulated_user_agent': 'Mozilla/5.0', 'os': 'Ubuntu 24.04'}


def spec_entry(title, tags, engine, status='expected', result='passed', file='game.spec.ts'):
    results = [] if status == 'skipped' else [{'status': result}]
    # Playwright's JSON reporter writes tags without the leading '@'.
    return {'title': title, 'file': file, 'tags': [tag.lstrip('@') for tag in tags],
            'tests': [{'projectName': engine, 'status': status, 'results': results}]}


def report(engine, *, rom=False, pong='expected', stunt=None):
    stunt = stunt or ('expected' if rom else 'skipped')
    specs = [spec_entry('browser identity', [], engine, file='browser-identity.spec.ts'),
             spec_entry('stunt ROM play', ['@game-stuntcycle'], engine, status=stunt,
                        result='passed' if stunt == 'expected' else 'failed', file='v060-driving.spec.ts')]
    if not rom:
        specs += [spec_entry('pong play', ['@game-pong'], engine, status=pong,
                             result='passed' if pong == 'expected' else 'failed'),
                  spec_entry('untagged storage test', [], engine)]
    return {'suites': [{'title': 'all', 'file': '', 'specs': specs, 'suites': []}], 'errors': []}


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nocpu-acceptance-')
        self.site = Path(self.temp.name) / 'pages'
        (self.site / 'core').mkdir(parents=True)
        (self.site / 'index.html').write_text('<html></html>')
        (self.site / 'core/nocpu.wasm').write_bytes(b'\x00asm\x01\x00\x00\x00')
        files = [{'path': name, 'size': (self.site / name).stat().st_size,
                  'sha256': acceptance.sha256((self.site / name).read_bytes())} for name in ('core/nocpu.wasm', 'index.html')]
        self.digest = acceptance.load_packager().runtime_digest(files)
        self.manifest = {'version': '0.1.3', 'stage': 'release', 'tag': 'v0.1.3', 'source_commit': 'a' * 40,
                         'runtime_sha256': self.digest, 'runtime_files': files,
                         'release_readiness': {'desktop_acceptance': dict(POLICY, policy='generated_at_release', scope='s')}}
        (self.site / 'BUILD-MANIFEST.json').write_text(json.dumps(self.manifest))

    def tearDown(self):
        self.temp.cleanup()

    def site_identity(self):
        site = acceptance.site_identity(self.site)
        site.pop('policy')
        return site

    def results(self, **changes):
        site = self.site_identity()
        out = []
        for engine in ('chromium', 'firefox'):
            out.append(acceptance.collect(report(engine, **changes.get(engine, {})), identity(engine), engine, 'public', site))
            out.append(acceptance.collect(report(engine, rom=True), identity(engine), engine, 'rom', site))
        return out

    def test_every_required_game_passed_in_every_required_engine_is_passed(self):
        record = acceptance.combine(self.results(), self.site_identity(), POLICY)
        self.assertEqual(record['status'], 'passed', record['problems'])
        self.assertEqual(record['runtime_sha256'], self.digest)
        self.assertEqual(record['summary'], {'pong': {'chromium': 'passed', 'firefox': 'passed'},
                                             'stuntcycle': {'chromium': 'passed', 'firefox': 'passed'}})
        names = [entry['name'] for entry in record['browsers']]
        self.assertEqual(names, ['Chromium 145.0.7632.6 (Playwright 1.58.2 build, headless)',
                                 'Firefox 146.0.1 (Playwright 1.58.2 build, headless)'])
        stunt = record['browsers'][0]['games']['stuntcycle']['tests'][0]
        self.assertEqual(stunt['runs'], {'public': 'skipped', 'rom': 'passed'})
        release = acceptance.identity_from_manifest(self.manifest, self.digest)
        acceptance.check_record(record, release)

    def test_missing_rom_results_leave_the_rom_games_incomplete_and_block_a_required_release(self):
        results = [result for result in self.results() if result['source'] == 'public']
        record = acceptance.combine(results, self.site_identity(), POLICY)
        self.assertEqual(record['status'], 'incomplete')
        self.assertEqual(record['summary']['stuntcycle'], {'chromium': 'not_run', 'firefox': 'not_run'})
        release = acceptance.identity_from_manifest(self.manifest, self.digest)
        with self.assertRaisesRegex(ValueError, 'required for this release'):
            acceptance.check_record(record, release)
        optional = copy.deepcopy(release)
        optional['policy']['required_for_release'] = False
        record['policy'] = dict(POLICY, required_for_release=False)
        acceptance.check_record(record, optional)

    def test_a_failure_or_a_missing_required_engine_is_never_passed(self):
        record = acceptance.combine(self.results(firefox={'pong': 'unexpected'}), self.site_identity(), POLICY)
        self.assertEqual(record['status'], 'failed')
        self.assertEqual(record['summary']['pong']['firefox'], 'failed')
        chromium_only = [result for result in self.results() if result['engine'] == 'chromium']
        record = acceptance.combine(chromium_only, self.site_identity(), POLICY)
        self.assertEqual(record['status'], 'incomplete')
        self.assertIn('firefox: no results', record['problems'])
        # An untagged test failing in an engine fails that engine's games too.
        site = self.site_identity()
        broken = report('chromium')
        broken['suites'][0]['specs'][3]['tests'][0].update(status='unexpected', results=[{'status': 'failed'}])
        results = [r for r in self.results() if not (r['engine'] == 'chromium' and r['source'] == 'public')]
        results.append(acceptance.collect(broken, identity('chromium'), 'chromium', 'public', site))
        self.assertEqual(acceptance.combine(results, site, POLICY)['status'], 'failed')

    def test_results_bind_to_the_tested_runtime_and_one_browser_build(self):
        results = self.results()
        results[0]['runtime_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'another build'):
            acceptance.combine(results, self.site_identity(), POLICY)
        results = self.results()
        results[1]['browser']['version'] = '144.0.1'
        with self.assertRaisesRegex(ValueError, 'different browser builds'):
            acceptance.combine(results, self.site_identity(), POLICY)
        (self.site / 'index.html').write_text('<html>changed</html>')
        with self.assertRaisesRegex(ValueError, 'differs from its manifest'):
            acceptance.site_identity(self.site)

    def test_collect_requires_a_real_identity_for_the_same_engine(self):
        site = self.site_identity()
        with self.assertRaisesRegex(ValueError, 'not firefox'):
            acceptance.collect(report('firefox'), identity('chromium'), 'firefox', 'public', site)
        with self.assertRaisesRegex(ValueError, 'real browser.version'):
            acceptance.collect(report('firefox'), dict(identity('firefox'), version=''), 'firefox', 'public', site)
        without = report('firefox')
        without['suites'][0]['specs'].pop(0)
        with self.assertRaisesRegex(ValueError, 'identity test did not pass'):
            acceptance.collect(without, identity('firefox'), 'firefox', 'public', site)
        with self.assertRaisesRegex(ValueError, 'no webkit results'):
            acceptance.collect(report('firefox'), identity('webkit'), 'webkit', 'public', site)

    def test_verify_rejects_records_for_another_build_or_claims_beyond_their_results(self):
        record = acceptance.combine(self.results(), self.site_identity(), POLICY)
        release = acceptance.identity_from_manifest(self.manifest, self.digest)
        changes = [
            lambda value: value.update(runtime_sha256='0' * 64),
            lambda value: value.update(tag='v0.1.4'),
            lambda value: value.update(version='0.1.4'),
            lambda value: value.update(source_commit='b' * 40),
            lambda value: value.update(policy=dict(POLICY, browsers=['chromium'])),
            lambda value: value['browsers'][1]['games']['pong'].update(status='failed'),
            lambda value: value['browsers'][1]['games']['pong'].update(tests=[]),
            lambda value: value['browsers'][1]['games']['pong']['tests'][0].update(outcome='skipped'),
            lambda value: value['browsers'][0].update(name='Chrome 145.0.7632.6'),
            lambda value: value.update(problems=['firefox: something']),
            lambda value: value.update(browsers=value['browsers'][:1]),
            lambda value: value.update(status='accepted'),
            lambda value: value.update(schema_version=0),
        ]
        for change in changes:
            changed = copy.deepcopy(record)
            change(changed)
            with self.subTest(change=change), self.assertRaises((ValueError, KeyError)):
                acceptance.check_record(changed, release)

    def test_zip_identity_recomputes_the_runtime_digest(self):
        archive = Path(self.temp.name) / 'web.zip'

        def pack(replace=None):
            with zipfile.ZipFile(archive, 'w') as bundle:
                for path in self.site.rglob('*'):
                    if path.is_file():
                        name = path.relative_to(self.site).as_posix()
                        bundle.writestr(name, (replace or {}).get(name, path.read_bytes()))
        pack()
        self.assertEqual(acceptance.zip_identity(archive)['runtime_sha256'], self.digest)
        pack({'index.html': b'<html>other</html>'})
        with self.assertRaisesRegex(ValueError, 'differs from its manifest'):
            acceptance.zip_identity(archive)


if __name__ == '__main__':
    unittest.main()
