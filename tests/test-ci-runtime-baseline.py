#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Real Git/ZIP failure cases for prior-FULL CI continuity proof."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('baseline', Path(__file__).resolve().parents[1] / 'tools/ci-runtime-baseline.py')
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


class BaselineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        (self.root / 'VERSION').write_text('0.6.0\n')
        self.git('add', 'VERSION')
        self.git('commit', '-qm', 'fixture')
        self.base = self.git('rev-parse', 'HEAD')
        identity = {'git_head': self.base, 'git_tree': self.git('rev-parse', 'HEAD^{tree}'), 'version': '0.6.0', 'dirty': False}
        outputs = {name: (name + ' fixture').encode() for name in baseline.FILES if name != 'build-provenance.json'}
        outputs['build-provenance.json'] = json.dumps({'target': 'wasm', 'outputs': {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()}}).encode()
        self.payloads = {'wasm/' + name: data for name, data in outputs.items()}
        manifest = {'schema_version': 1, 'kind': 'core-runtime-transfer', 'source_binding': identity,
                    'files': [{'path': 'build/core/wasm/' + name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in outputs.items()]}
        self.payloads['core-transfer.json'] = json.dumps(manifest).encode()
        self.archive = self.root / 'build/baseline.zip'
        self.archive.parent.mkdir()
        (self.root / '.git/info/exclude').write_text('build/\n')
        self.run = {'id': 12, 'run_attempt': 2, 'head_sha': self.base, 'head_branch': 'main', 'path': '.github/workflows/ci.yml', 'event': 'push', 'status': 'completed', 'conclusion': 'success', 'repository': {'full_name': baseline.REPOSITORY}}
        self.jobs = {'jobs': [{'name': name, 'run_id': 12, 'run_attempt': 2, 'head_sha': self.base, 'status': 'completed', 'conclusion': 'success'} for name in ('verify / core-reference', 'verify / browser')]}
        self.artifact = {'id': 42, 'name': 'core-runtime-transfer-' + self.base + '-2', 'expired': False, 'workflow_run': {'id': 12, 'head_sha': self.base}}
        self.write_zip()

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, check=True, capture_output=True, text=True).stdout.strip()

    def write_zip(self):
        with zipfile.ZipFile(self.archive, 'w') as zipped:
            for name, data in self.payloads.items():
                zipped.writestr(name, data)
        self.artifact['digest'] = 'sha256:' + hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def verify(self):
        return baseline.verify(self.root, self.base, self.run, self.jobs, self.artifact, self.archive)

    def test_exact_full_pass(self):
        self.assertEqual(self.verify()['run_attempt'], 2)

    def test_narrative_skipped_failed_missing_and_mixed_jobs(self):
        original = copy.deepcopy(self.jobs)
        for conclusion in ('skipped', 'failure', 'cancelled'):
            self.jobs = copy.deepcopy(original)
            self.jobs['jobs'][0]['conclusion'] = conclusion
            with self.assertRaises(ValueError): self.verify()
        self.jobs = {'jobs': []}
        with self.assertRaises(ValueError): self.verify()
        self.jobs = copy.deepcopy(original)
        self.jobs['jobs'][1]['run_attempt'] = 1
        with self.assertRaises(ValueError): self.verify()

    def test_wrong_run_source_workflow_or_repository(self):
        original = copy.deepcopy(self.run)
        for key, value in (('head_sha', '0' * 40), ('head_branch', 'feature'), ('path', '.github/workflows/other.yml'), ('event', 'pull_request'), ('repository', {'full_name': 'untrusted/NoCPU'})):
            self.run = copy.deepcopy(original)
            self.run[key] = value
            with self.assertRaises(ValueError): self.verify()

    def test_expired_wrong_attempt_and_tampered_digest(self):
        original = copy.deepcopy(self.artifact)
        for key, value in (('expired', True), ('name', 'core-runtime-transfer-' + self.base + '-1'), ('digest', 'sha256:' + '0' * 64)):
            self.artifact = copy.deepcopy(original)
            self.artifact[key] = value
            with self.assertRaises(ValueError): self.verify()

    def test_archive_inventory_and_internal_hash_tamper(self):
        original = copy.deepcopy(self.payloads)
        for name in ('../escape', 'unexpected', 'wasm/nocpu.wasm'):
            self.payloads = copy.deepcopy(original)
            self.payloads[name] = b'tampered'
            self.write_zip()
            with self.assertRaises(ValueError): self.verify()

    def test_source_binding_mismatch(self):
        manifest = json.loads(self.payloads['core-transfer.json'])
        manifest['source_binding']['git_tree'] = '0' * 40
        self.payloads['core-transfer.json'] = json.dumps(manifest).encode()
        self.write_zip()
        with self.assertRaises(ValueError): self.verify()

    def test_declared_nonregular_zip_types(self):
        for kind in (0o010000, 0o020000, 0o060000, 0o120000, 0o140000):
            with zipfile.ZipFile(self.archive, 'w') as zipped:
                for name, data in self.payloads.items():
                    entry = zipfile.ZipInfo(name)
                    entry.create_system = 3
                    entry.external_attr = ((kind if name == 'wasm/nocpu.js' else 0o100000) | 0o644) << 16
                    zipped.writestr(entry, data)
            self.artifact['digest'] = 'sha256:' + hashlib.sha256(self.archive.read_bytes()).hexdigest()
            with self.assertRaises(ValueError): self.verify()
    def test_dirty_checkout_with_valid_baseline(self):
        self.verify()
        (self.root / 'VERSION').write_text('0.7.0\n')
        with self.assertRaises(ValueError): self.verify()


if __name__ == '__main__':
    unittest.main(verbosity=2)
