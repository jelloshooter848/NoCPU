#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""CI skips core comparisons only for content an earlier run already compared."""
import importlib.util
import json
import os
import subprocess
import sys
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
    def test_docs_ui_and_release_metadata_paths(self):
        for path in ('docs/TESTING.md', 'README.md', 'CHANGELOG.md', 'bug-reports/x.md', 'web/src/main.ts',
                     'core/README.md', 'tools/native/README.md', 'THIRD_PARTY_NOTICES.md',
                     'tests/browser/pong.spec.ts', 'tests/test-web-foundations.cjs', 'VERSION',
                     'tests/release-readiness.json', 'tests/browser-license-audit.json',
                     'tools/package-web.py', 'tools/package-release.py', 'tests/test-web-release.py',
                     'tests/test-release-tools.py', 'tests/license-audit.json', 'LICENSE'):
            self.assertIsNotNone(scope.kind(path), path)

    def test_everything_else_is_core_relevant(self):
        for path in ('core/api.cpp', 'core/platform/portable_input.cpp', 'upstream/dice-0.9/chip.cpp',
                     'tools/reference/analyze.py', 'tools/capture-games.sh', 'tools/capture-pong.sh',
                     'tools/replay-core.mjs', 'tools/replay-games.sh', 'tools/compare-core.py',
                     'tools/compare-games.py', 'tools/build-core.sh', 'tools/prepare-core.py',
                     'tools/build-native.sh', 'tools/native/Dockerfile', 'tools/install-web-toolchain.sh',
                     'tools/reference-cache.py', 'tools/core-handoff.py', 'tools/ci-scope.py',
                     'tests/replays/pong.tsv', 'tests/replays/game-scenarios.json', 'tests/source-manifest.json',
                     'tests/test-reference-analysis.py', 'tests/test-ci-scope.py',
                     '.github/workflows/verify-browser.yml', '.github/workflows/ci.yml', 'core/README.txt',
                     'Makefile', 'package.json', 'package-lock.json', 'vite.config.ts', 'LICENSE.txt',
                     'tests/web-foundations.cjs', 'web', 'VERSION.txt', 'tests/release-readiness.json.bak',
                     'core/VERSION', 'tools/package-web.py.orig', 'core/games/LICENSE', 'core/notes.md.cpp'):
            self.assertIsNone(scope.kind(path), path)


class DecisionTests(unittest.TestCase):
    def test_missing_marker_runs_everything_on_releases_too(self):
        self.assertTrue(scope.decide(True, False, 'a' * 64)[0])
        self.assertTrue(scope.decide(False, False, 'a' * 64)[0])
        self.assertTrue(scope.decide(True, True, '')[0])
        self.assertTrue(scope.decide(False, True, '')[0])

    def test_marker_for_identical_content_skips_on_releases_too(self):
        self.assertFalse(scope.decide(False, True, 'a' * 64)[0])
        run, reason = scope.decide(True, True, 'a' * 64)
        self.assertFalse(run)
        self.assertIn('release run', reason)


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
        self.assertFalse(scope.decide(True, later in markers, later)[0], 'a release reuses the passing comparison')

    def test_reverting_to_compared_content_may_skip(self):
        self.repo.write('core/api.cpp', '2')
        self.repo.commit()
        self.repo.write('core/api.cpp', '1')
        self.assertEqual(self.repo.commit(), self.base)

    def test_release_metadata_edits_keep_the_hash(self):
        self.repo.write('package.json', '{"name": "nocpu", "version": "0.1.5", "type": "module"}\n')
        self.repo.write('package-lock.json', json.dumps(
            {'name': 'nocpu', 'version': '0.1.5', 'lockfileVersion': 3,
             'packages': {'': {'name': 'nocpu', 'version': '0.1.5'},
                          'node_modules/fflate': {'version': '0.8.2'}}}, indent=2))
        before = self.repo.commit()
        self.repo.write('VERSION', '0.1.6\n')
        self.repo.write('tests/release-readiness.json', '{"version": "0.1.6"}')
        self.repo.write('tests/browser-license-audit.json', '{"version": "0.1.6"}')
        self.repo.write('package.json', '{\n  "name": "nocpu",\n  "version": "0.1.6",\n  "type": "module"\n}\n')
        self.repo.write('package-lock.json', json.dumps(
            {'name': 'nocpu', 'version': '0.1.6', 'lockfileVersion': 3,
             'packages': {'': {'name': 'nocpu', 'version': '0.1.6'},
                          'node_modules/fflate': {'version': '0.8.2'}}}, indent=2))
        self.assertEqual(self.repo.commit('Release v0.1.6'), before)

    def test_package_changes_beyond_the_version_change_the_hash(self):
        lock = {'name': 'nocpu', 'version': '0.1.5', 'lockfileVersion': 3,
                'packages': {'': {'name': 'nocpu', 'version': '0.1.5'}, 'node_modules/fflate': {'version': '0.8.2'}}}
        self.repo.write('package.json', '{"name": "nocpu", "version": "0.1.5", "type": "module"}')
        self.repo.write('package-lock.json', json.dumps(lock))
        seen = {self.repo.commit()}
        self.repo.write('package.json', '{"name": "nocpu", "version": "0.1.5", "type": "commonjs"}')
        seen.add(self.repo.commit())
        lock['packages']['node_modules/fflate']['version'] = '0.8.3'
        self.repo.write('package-lock.json', json.dumps(lock))
        seen.add(self.repo.commit())
        self.repo.write('package-lock.json', 'not json')
        seen.add(self.repo.commit())
        self.repo.git('update-index', '--chmod=+x', 'package.json')
        seen.add(self.repo.commit())
        self.assertEqual(len(seen), 5)

    def test_unreadable_or_non_object_json_is_hashed_raw(self):
        self.assertEqual(scope.without_version('package.json', b'[1, 2]'), b'[1, 2]')
        self.assertEqual(scope.without_version('package.json', b'{'), b'{')
        self.assertEqual(scope.without_version('package-lock.json', b'{"version": "1", "packages": []}'),
                         b'{"packages":[]}')

    def test_host_compiler_identity_is_part_of_the_hash(self):
        gcc13 = scope.core_hash('HEAD', cwd=self.temp.name, host='g++: g++ 13.3.0')
        gcc14 = scope.core_hash('HEAD', cwd=self.temp.name, host='g++: g++ 14.2.0')
        self.assertNotEqual(gcc13, gcc14)
        self.assertEqual(gcc13, scope.core_hash('HEAD', cwd=self.temp.name, host='g++: g++ 13.3.0'))


def artifact(name, repo=1, head=1, expired=False, run=7):
    return {'name': name, 'expired': expired,
            'workflow_run': {'id': run, 'repository_id': repo, 'head_repository_id': head,
                             'head_branch': 'restart/desktop-first', 'head_sha': 'f' * 40}}


class MarkerLookupTests(unittest.TestCase):
    DIGEST = 'ab' * 32
    NAME = scope.MARKER_PREFIX + DIGEST

    def lookup(self, *artifacts):
        urls = []

        def fetch(url):
            urls.append(url)
            return {'total_count': len(artifacts), 'artifacts': list(artifacts)}
        hit, reason = scope.find_marker(self.DIGEST, fetch, 'https://api.github.com', 'o/r')
        return hit, reason, urls

    def test_any_branch_or_pull_request_of_this_repository_counts(self):
        hit, reason, urls = self.lookup(artifact(self.NAME))
        self.assertTrue(hit)
        self.assertIn('run 7', reason)
        self.assertEqual(urls, [f'https://api.github.com/repos/o/r/actions/artifacts?name={self.NAME}&per_page=100'])

    def test_fork_expired_and_other_names_never_count(self):
        self.assertFalse(self.lookup(artifact(self.NAME, head=2))[0], 'a fork run must not mark content compared')
        self.assertIn('fork', self.lookup(artifact(self.NAME, head=2))[1])
        self.assertFalse(self.lookup(artifact(self.NAME, head=None))[0])
        self.assertFalse(self.lookup(artifact(self.NAME, repo=None, head=None))[0])
        self.assertFalse(self.lookup(artifact(self.NAME, expired=True))[0])
        self.assertFalse(self.lookup({**artifact(self.NAME), 'expired': None})[0])
        self.assertFalse(self.lookup(artifact(self.NAME + '0'))[0])
        self.assertFalse(self.lookup(artifact(scope.MARKER_PREFIX + 'cd' * 32))[0])
        self.assertFalse(self.lookup()[0])
        self.assertTrue(self.lookup(artifact(self.NAME, head=2), artifact(self.NAME, run=9))[0])

    def test_invalid_hash_is_never_looked_up(self):
        for digest in ('', 'AB' * 32, 'ab' * 31, 'ab' * 32 + '&name=x'):
            def fetch(url):
                raise AssertionError('must not query')
            self.assertFalse(scope.find_marker(digest, fetch, 'https://api.github.com', 'o/r')[0], digest)

    def test_a_failing_lookup_runs_the_comparisons(self):
        env = {k: v for k, v in os.environ.items() if k not in ('GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY')}
        env.update(GITHUB_TOKEN='x', GITHUB_REPOSITORY='o/r', GITHUB_API_URL='http://127.0.0.1:9')
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, 'out')
            env['GITHUB_OUTPUT'] = str(output)
            result = subprocess.run([sys.executable, str(ROOT / 'tools/ci-scope.py'), 'lookup', '--hash', self.DIGEST],
                                    env=env, capture_output=True, text=True, check=True)
            self.assertIn('marker lookup failed', result.stdout)
            self.assertEqual(output.read_text(), 'marker_hit=false\n')


class HistoryTests(unittest.TestCase):
    """The v0.1.4-v0.1.6 release commits changed only docs, web UI and release metadata."""

    def test_release_commits_keep_the_hash_of_their_compared_parent(self):
        pairs = (('0ce1700c8281ed5e6d01913ec073afa05aa26a9c', '194c74ad04882c73a7fa1f8917f2b83bd0410690'),
                 ('44f13ba6457ad5aa9d2838ecde03a6d074cfdcde', '8307f4c5cd26b910f0bea00d134627df2bdc2ddd'))
        for before, after in pairs:
            present = all(subprocess.run(['git', 'cat-file', '-e', f'{c}^{{commit}}'], cwd=ROOT,
                                         capture_output=True).returncode == 0 for c in (before, after))
            if not present:
                self.skipTest('release history not in this checkout')
            self.assertEqual(scope.tree_hash(before, cwd=str(ROOT)), scope.tree_hash(after, cwd=str(ROOT)))

    def test_docs_and_packaging_patch_keeps_the_hash_of_its_compared_release(self):
        # v0.2.0 (merge 1a8a55f) to the 0.2.1 docs, license and packaging-check commits (fdc1169).
        before, after = '1a8a55f964dc4345858c632f3b66585420c5d1b8', 'fdc116915a81a24821182143e11757607f385edf'
        present = all(subprocess.run(['git', 'cat-file', '-e', f'{c}^{{commit}}'], cwd=ROOT,
                                     capture_output=True).returncode == 0 for c in (before, after))
        if not present:
            self.skipTest('release history not in this checkout')
        self.assertEqual(scope.tree_hash(before, cwd=str(ROOT)), scope.tree_hash(after, cwd=str(ROOT)))


if __name__ == '__main__':
    unittest.main()
