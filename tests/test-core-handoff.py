#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Synthetic transfer integrity challenges; no compiled core/gameplay claims."""
import copy
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('core_handoff', Path(__file__).resolve().parents[1] / 'tools/core-handoff.py')
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='nocpu-core-transfer-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.git('init', '-q')
        (self.root / '.gitignore').write_text('/build/\n/web/public/core/\n')
        for name in handoff.REQUIRED_INPUTS | {'core/platform/portable_input.cpp'}:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('0.6.0\n' if name == 'VERSION' else 'synthetic source identity\n')
        self.commit('source fixture')
        for name in handoff.TRANSFER_FILES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'synthetic transfer bytes; not a compiled executable\n')
        provenance = {'target': 'wasm', 'outputs': {
            Path(name).name: handoff.sha256(self.root / name)
            for name in handoff.TRANSFER_FILES if not name.endswith('/build-provenance.json')},
            'inputs': {name: handoff.sha256(self.root / name)
                       for name in handoff.REQUIRED_INPUTS | {'core/platform/portable_input.cpp'}}}
        (self.root / 'build/core/wasm/build-provenance.json').write_text(json.dumps(provenance))
        self.manifest = handoff.make_manifest(self.root)

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, message):
        self.git('add', '.')
        self.git('-c', 'user.name=Transfer test', '-c', 'user.email=transfer@example.invalid', 'commit', '-m', message)

    def test_complete_roundtrip(self):
        self.assertEqual(handoff.verify_manifest(self.root, self.manifest)['verified_files'], 5)

    def test_verified_two_file_vite_install_and_repeat(self):
        for _ in range(2):
            result = handoff.install_runtime(self.root, self.manifest)
            self.assertEqual(result['installed_runtime_files'], 2)
            self.assertFalse(result['core_rebuilt'])
            destination = self.root / 'web/public/core'
            self.assertEqual({path.name for path in destination.iterdir()}, {'nocpu.js', 'nocpu.wasm'})
            for name in ('nocpu.js', 'nocpu.wasm'):
                self.assertEqual((destination/name).read_bytes(), (self.root/'build/core/wasm'/name).read_bytes())

    def test_vite_install_rejects_tampered_source_before_destination_write(self):
        source = self.root/'build/core/wasm/nocpu.wasm'
        source.write_bytes(b'tampered')
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)
        self.assertFalse((self.root/'web/public/core').exists())
        source.unlink()
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)
        self.assertFalse((self.root/'web/public/core').exists())

    def test_vite_install_rejects_stale_or_extra_destination_without_overwrite(self):
        directory = self.root/'web/public/core';directory.mkdir(parents=True)
        target = directory/'nocpu.js';target.write_bytes(b'stale user bytes')
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)
        self.assertEqual(target.read_bytes(), b'stale user bytes')
        self.assertFalse((directory/'nocpu.wasm').exists())
        target.write_bytes((self.root/'build/core/wasm/nocpu.js').read_bytes())
        (directory/'unexpected').write_bytes(b'preserve')
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)
        self.assertFalse((directory/'nocpu.wasm').exists())

    def test_vite_install_rejects_destination_file_and_parent_symlinks(self):
        directory = self.root/'web/public/core';directory.mkdir(parents=True)
        target = directory/'nocpu.js';target.symlink_to(self.root/'VERSION')
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)
        self.assertTrue(target.is_symlink())
        target.unlink();directory.rmdir();directory.symlink_to(self.root/'build/core/wasm', target_is_directory=True)
        with self.assertRaises(ValueError):handoff.install_runtime(self.root, self.manifest)

    def test_missing_and_tampered_runtime(self):
        target = self.root / 'build/core/wasm/nocpu.js'
        original = target.read_bytes()
        target.write_bytes(original + b'tampered')
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)
        target.unlink()
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)

    def test_unexpected_duplicate_and_traversal_inventory(self):
        for name in ('../nocpu.wasm', 'private-roms/fixture.zip', self.manifest['files'][0]['path']):
            changed = copy.deepcopy(self.manifest)
            changed['files'][-1]['path'] = name
            with self.subTest(name=name), self.assertRaises(ValueError):
                handoff.verify_manifest(self.root, changed)

    def test_symlink_file_and_parent_rejected(self):
        target = self.root / 'build/core/wasm/nocpu.js'
        original = target.read_bytes()
        target.unlink()
        target.symlink_to(self.root / 'VERSION')
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)
        with self.assertRaises(ValueError):
            handoff.checked_file(self.root, '../VERSION')
        with self.assertRaises(ValueError):
            handoff.checked_file(self.root, '..\\VERSION')
        target.unlink()
        target.write_bytes(original)
        wasm = self.root / 'build/core/wasm'
        actual = self.root / 'build/core/actual-wasm'
        wasm.rename(actual)
        wasm.symlink_to(actual, target_is_directory=True)
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)

    def test_dirty_and_different_commit_or_tree_rejected(self):
        (self.root / 'VERSION').write_text('0.7.0\n')
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)
        self.commit('new version')
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, self.manifest)
        changed = copy.deepcopy(self.manifest)
        changed['source_binding'] = handoff.source_identity(self.root)
        changed['source_binding']['git_tree'] = '0' * 40
        with self.assertRaises(ValueError):
            handoff.verify_manifest(self.root, changed)

    def test_stale_or_incomplete_provenance_rejected(self):
        path = self.root / 'build/core/wasm/build-provenance.json'
        provenance = json.loads(path.read_text())
        provenance['inputs']['core/api.cpp'] = '0' * 64
        path.write_text(json.dumps(provenance))
        with self.assertRaises(ValueError):
            handoff.make_manifest(self.root)
        provenance['inputs'].pop('core/api.cpp')
        path.write_text(json.dumps(provenance))
        with self.assertRaises(ValueError):
            handoff.make_manifest(self.root)


if __name__ == '__main__':
    unittest.main()
