#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""CI skips core comparisons only for content an earlier run already compared."""
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ci_scope', ROOT / 'tools/ci-scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)
ENV = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.invalid',
       'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.invalid'}


class Repo:
    def __init__(self, directory):
        self.directory = directory
        self.git('init', '-q', '-b', 'main')

    def git(self, *args):
        return subprocess.run(['git', '-C', self.directory, *args], check=True, capture_output=True,
                              text=True, env=ENV).stdout.strip()

    def write(self, path, text):
        target = Path(self.directory, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        self.git('add', '--', path)

    def commit(self, message='c'):
        self.git('commit', '-q', '--allow-empty', '-m', message)
        return scope.core_hash('HEAD', cwd=self.directory)


class ClassifyTests(unittest.TestCase):
    def test_docs_and_ui_paths(self):
        for path in ('docs/TESTING.md', 'README.md', 'CHANGELOG.md', 'bug-reports/x.md', 'web/src/main.ts',
                     'tests/browser/pong.spec.ts'):
            self.assertIsNotNone(scope.kind(path), path)

    def test_everything_else_is_core_relevant(self):
        for path in ('core/api.cpp', 'upstream/dice-0.9/chip.cpp', 'tools/reference/analyze.py',
                     'tools/capture-games.sh', 'tools/replay-core.mjs', 'tests/replays/pong.tsv',
                     '.github/workflows/verify-browser.yml', 'tools/native/README.md', 'core/README.md',
                     'Makefile', 'VERSION', 'package.json', 'vite.config.ts', 'LICENSE', 'tests/release-readiness.json'):
            self.assertIsNone(scope.kind(path), path)


class DecisionTests(unittest.TestCase):
    def test_release_and_missing_marker_run_everything(self):
        self.assertTrue(scope.decide(True, True, 'a' * 64)[0])
        self.assertTrue(scope.decide(False, False, 'a' * 64)[0])
        self.assertTrue(scope.decide(False, True, '')[0])
        self.assertFalse(scope.decide(False, True, 'a' * 64)[0])


class CoreHashTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Repo(self.temp.name)
        self.repo.write('core/api.cpp', '1')
        self.repo.write('docs/A.md', 'docs')
        self.repo.write('web/src/main.ts', 'ui')
        self.base = self.repo.commit()

    def tearDown(self):
        self.temp.cleanup()

    def test_docs_and_ui_edits_keep_the_hash(self):
        self.repo.write('docs/A.md', 'more docs')
        self.repo.write('README.md', 'readme')
        self.repo.write('web/src/main.ts', 'ui 2')
        self.assertEqual(self.repo.commit(), self.base)
        self.repo.git('mv', 'docs/A.md', 'docs/B.md')
        self.assertEqual(self.repo.commit(), self.base, 'renaming within docs keeps the hash')
        self.repo.git('rm', '-q', 'web/src/main.ts')
        self.assertEqual(self.repo.commit(), self.base, 'deleting a UI file keeps the hash')

    def test_core_edit_rename_delete_and_mode_change_the_hash(self):
        seen = {self.base}
        self.repo.write('core/api.cpp', '2')
        seen.add(self.repo.commit())
        self.repo.git('mv', 'core/api.cpp', 'core/api2.cpp')
        seen.add(self.repo.commit())
        self.repo.git('mv', 'web/src/main.ts', 'core/main.ts')
        seen.add(self.repo.commit())
        self.repo.git('update-index', '--chmod=+x', 'core/main.ts')
        seen.add(self.repo.commit())
        self.repo.git('rm', '-q', 'core/api2.cpp')
        seen.add(self.repo.commit())
        self.assertEqual(len(seen), 6, 'each core-relevant change must give a new hash')

    def test_quoted_and_unusual_paths(self):
        for name in ('tools/with space.sh', 'tools/quo"te.py', 'tools/ünïcode.txt', 'tools/tab\tname'):
            before = scope.core_hash('HEAD', cwd=self.temp.name)
            self.repo.write(name, 'x')
            after = self.repo.commit()
            self.assertNotEqual(before, after, name)
        unchanged = scope.core_hash('HEAD', cwd=self.temp.name)
        self.repo.write('docs/with space "and" ünï.md', 'x')
        self.assertEqual(self.repo.commit(), unchanged)

    def test_docs_only_push_after_a_cancelled_or_failed_core_push_still_runs(self):
        # Markers are saved only after a passing core-compare.
        markers = {self.base}
        self.repo.write('core/api.cpp', 'uncompared change')
        cancelled = self.repo.commit('core change whose run was cancelled or failed')
        self.assertTrue(scope.decide(False, cancelled in markers, cancelled)[0])
        self.repo.write('docs/A.md', 'docs on top')
        docs_on_top = self.repo.commit('docs-only push')
        self.assertTrue(scope.decide(False, docs_on_top in markers, docs_on_top)[0],
                        'the docs-only push must run the comparisons the core change never passed')
        markers.add(docs_on_top)  # its comparisons pass
        self.repo.write('docs/A.md', 'docs again')
        later = self.repo.commit()
        self.assertFalse(scope.decide(False, later in markers, later)[0])
        self.assertTrue(scope.decide(True, later in markers, later)[0], 'a release always runs')

    def test_reverting_to_compared_content_may_skip(self):
        self.repo.write('core/api.cpp', '2')
        self.repo.commit()
        self.repo.write('core/api.cpp', '1')
        self.assertEqual(self.repo.commit(), self.base)


if __name__ == '__main__':
    unittest.main()
