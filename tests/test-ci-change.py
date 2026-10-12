#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fail-closed documentation classifier boundaries and real Git rename regression."""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ci_change', Path(__file__).resolve().parents[1] / 'tools/classify-ci-change.py')
classifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(classifier)


class ClassifierTests(unittest.TestCase):
    def test_plain_docs_only(self):
        for event in ('push', 'pull_request'):
            self.assertTrue(classifier.classify_changes(event, [('M', 'README.md'), ('A', 'docs/0.6.0_VALIDATION.md')]))

    def test_manual_tag_and_empty_always_full(self):
        for event in ('workflow_dispatch', 'workflow_call', 'release', 'tag', ''):
            self.assertFalse(classifier.classify_changes(event, [('M', 'README.md')]))
        self.assertFalse(classifier.classify_changes('pull_request', []))

    def test_all_protected_boundaries(self):
        for path in ('docs/licenses/notice.md', 'docs/licenses/LICENSE.txt', 'core/api.cpp',
                     'web/src/main.ts', 'tests/release-readiness.json', 'VERSION',
                     'package-lock.json', 'package.json', '.github/workflows/ci.yml',
                     'tools/classify-ci-change.py', 'CONTRIBUTING.md', 'other/report.md',
                     '../docs/report.md', '/docs/report.md', 'docs/nested/report.md'):
            with self.subTest(path=path):
                self.assertFalse(classifier.classify_changes('pull_request', [('M', 'README.md'), ('M', path)]))

    def test_deletion_rename_type_change_rejected(self):
        for status in ('D', 'R100', 'C100', 'T', 'U', '?'):
            with self.subTest(status=status):
                self.assertFalse(classifier.classify_changes('push', [(status, 'docs/report.md')]))

    def test_real_git_rename_and_checkout_binding(self):
        with tempfile.TemporaryDirectory(prefix='nocpu-ci-classifier-') as temporary:
            root = Path(temporary)
            def git(*args):
                return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
            def commit(message):
                git('add', '.')
                git('-c', 'user.name=Classifier test', '-c', 'user.email=classifier@example.invalid', 'commit', '-m', message)
                return git('rev-parse', 'HEAD')
            git('init', '-q')
            (root / 'core').mkdir()
            (root / 'docs').mkdir()
            (root / 'core/api.cpp').write_text('runtime source\n')
            (root / 'README.md').write_text('first\n')
            base = commit('base')
            (root / 'README.md').write_text('updated\n')
            docs_head = commit('docs')
            self.assertTrue(classifier.classify_repository(root, 'pull_request', base, docs_head)['documentation_only'])
            self.assertTrue(classifier.classify_repository(root, 'push', base, docs_head, 'refs/heads/main')['documentation_only'])
            self.assertFalse(classifier.classify_repository(root, 'push', base, docs_head, 'refs/tags/v0.6.0')['documentation_only'])
            self.assertFalse(classifier.classify_repository(root, 'push', base, docs_head)['documentation_only'])
            with self.assertRaises(ValueError):
                classifier.classify_repository(root, 'pull_request', base, base)
            (root / 'core/api.cpp').rename(root / 'docs/disguised.md')
            renamed = commit('rename runtime')
            self.assertFalse(classifier.classify_repository(root, 'pull_request', docs_head, renamed)['documentation_only'])
            self.assertFalse(classifier.classify_repository(root, 'push', '0' * 40, renamed)['documentation_only'])
            self.assertFalse(classifier.classify_repository(root, 'push', 'f' * 40, renamed)['documentation_only'])
            (root / 'docs/uncommitted.md').write_text('dirty\n')
            self.assertFalse(classifier.classify_repository(root, 'pull_request', base, renamed)['documentation_only'])

    def test_real_git_documentation_symlink_and_executable_rejected(self):
        with tempfile.TemporaryDirectory(prefix='nocpu-ci-classifier-modes-') as temporary:
            root = Path(temporary)
            def git(*args):
                return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
            def commit(message):
                git('add', '.')
                git('-c', 'user.name=Classifier test', '-c', 'user.email=classifier@example.invalid', 'commit', '-m', message)
                return git('rev-parse', 'HEAD')
            git('init', '-q')
            (root / 'docs').mkdir()
            (root / 'README.md').write_text('base\n')
            base = commit('base')
            (root / 'docs/link.md').symlink_to('../README.md')
            linked = commit('new symlink')
            self.assertFalse(classifier.classify_repository(root, 'pull_request', base, linked)['documentation_only'])
            (root / 'docs/link.md').unlink()
            (root / 'docs/link.md').symlink_to('../OTHER.md')
            modified = commit('modified symlink')
            self.assertFalse(classifier.classify_repository(root, 'pull_request', linked, modified)['documentation_only'])
            (root / 'README.md').chmod(0o755)
            executable = commit('mode change')
            self.assertFalse(classifier.classify_repository(root, 'pull_request', modified, executable)['documentation_only'])


if __name__ == '__main__':
    unittest.main()
