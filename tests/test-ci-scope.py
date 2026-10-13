#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The CI scope decision skips core comparisons only for docs/UI-only changes."""
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


class ClassifyTests(unittest.TestCase):
    def test_docs_and_ui_only_skip(self):
        for paths in (['docs/TESTING.md'], ['README.md', 'bug-reports/x.md'], ['web/src/main.ts', 'web/src/style.css'],
                      ['tests/browser/pong.spec.ts', 'docs/ROADMAP.md', 'CHANGELOG.md']):
            run, reason = scope.classify(paths)
            self.assertFalse(run, paths)
            self.assertIn('only', reason)

    def test_anything_else_runs_everything(self):
        for path in ('core/api.cpp', 'upstream/dice-0.9/chip.cpp', 'tools/reference/analyze.py', 'tools/capture-games.sh',
                     'tools/replay-core.mjs', 'tests/replays/pong.tsv', 'tests/replays/game-scenarios.json',
                     '.github/workflows/verify-browser.yml', 'tools/native/README.md', 'core/README.md',
                     'Makefile', 'VERSION', 'package.json', 'vite.config.ts', 'LICENSE', 'tests/release-readiness.json'):
            run, reason = scope.classify(['docs/TESTING.md', path])
            self.assertTrue(run, path)
            self.assertIn(path, reason)

    def test_empty_or_unknown_runs_everything(self):
        self.assertTrue(scope.classify([])[0])
        self.assertTrue(scope.decide('push', False, '0' * 40, 'abc')[0])
        self.assertTrue(scope.decide('push', False, '', 'abc')[0])
        self.assertTrue(scope.decide('workflow_dispatch', False, 'a', 'b')[0])
        self.assertTrue(scope.decide('pull_request', True, 'a', 'b')[0])
        self.assertTrue(scope.decide('pull_request', False, 'no-such-commit', 'HEAD')[0])


class MergeBaseTests(unittest.TestCase):
    def test_diff_is_relative_to_the_merge_base(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.invalid',
                   'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.invalid'}

            def git(*args):
                return subprocess.run(['git', '-C', directory, *args], check=True, capture_output=True, text=True, env=env).stdout.strip()

            def commit(path, text):
                target = Path(directory, path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
                git('add', path)
                git('commit', '-q', '-m', path)
                return git('rev-parse', 'HEAD')

            git('init', '-q', '-b', 'base')
            commit('core/api.cpp', '1')
            git('checkout', '-q', '-b', 'topic')
            head = commit('docs/A.md', 'docs')
            git('checkout', '-q', 'base')
            base = commit('core/api.cpp', '2')  # moved on after the branch point
            cwd = os.getcwd()
            os.chdir(directory)
            try:
                run, reason, paths = scope.decide('pull_request', False, base, head)
            finally:
                os.chdir(cwd)
            self.assertEqual(paths, ['docs/A.md'])
            self.assertFalse(run, reason)


if __name__ == '__main__':
    unittest.main()
