#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Guard the CI invariants that keep skips and caches honest.

Reads .github/workflows/verify-browser.yml as text (no YAML dependency): the
compared marker artifact is uploaded only after the comparisons pass, and
releases never use the reference cache or look up the marker.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / '.github/workflows/verify-browser.yml').read_text()


def job(name):
    match = re.search(rf'^  {re.escape(name)}:\n(.*?)(?=^  [a-z][a-z0-9-]*:\n|\Z)', WORKFLOW, re.S | re.M)
    if not match:
        raise AssertionError(f'job {name} not found')
    return match.group(1)


def steps(block):
    body = block.split('\n    steps:\n', 1)[1]
    return ['    - ' + part for part in re.split(r'^    - ', body, flags=re.M)[1:]]


def find(block_steps, needle):
    found = [index for index, step in enumerate(block_steps) if needle in step]
    if len(found) != 1:
        raise AssertionError(f'expected one step containing {needle!r}, found {len(found)}')
    return found[0]


def condition(step):
    match = re.search(r'^      if: (.*)$', step, re.M)
    return match.group(1).strip() if match else None


class CompareJobTests(unittest.TestCase):
    def setUp(self):
        self.block = job('core-compare')
        self.steps = steps(self.block)

    def test_marker_is_saved_only_after_passing_comparisons(self):
        compare = find(self.steps, 'Capture (or restore) and compare every')
        record = find(self.steps, '> build/compared-marker/compared.txt')
        save = find(self.steps, 'name: nocpu-compared-${{ needs.scope.outputs.core_hash }}')
        self.assertIn('actions/upload-artifact@', self.steps[save])
        self.assertIn('path: build/compared-marker/compared.txt', self.steps[save])
        self.assertNotIn('actions/cache', ''.join(step for step in self.steps if 'compared-marker' in step))
        self.assertLess(compare, record)
        self.assertLess(record, save)
        for index in (compare, record, save):
            step = self.steps[index]
            self.assertIsNone(condition(step), f'marker path must keep the default success() condition:\n{step}')
            self.assertNotIn('continue-on-error', step)
        for index in range(compare, save):
            self.assertNotIn('continue-on-error', self.steps[index])
        self.assertNotIn('continue-on-error', self.block.split('\n    steps:\n', 1)[0])

    def test_release_never_uses_the_reference_cache(self):
        self.assertIn("NOCPU_REFERENCE_CACHE: ${{ !inputs.release && 'build/reference-cache' || '' }}", self.block)
        cache_steps = [step for step in self.steps
                       if 'reference-cache.py' in step or 'path: build/reference-cache' in step]
        self.assertGreaterEqual(len(cache_steps), 4)
        for step in cache_steps:
            self.assertIn('!inputs.release', condition(step) or '', f'cache step must be skipped on releases:\n{step}')
        # The capture step itself reads only the job environment.
        compare = self.steps[find(self.steps, 'Capture (or restore) and compare every')]
        self.assertNotIn('NOCPU_REFERENCE_CACHE', compare)


class ScopeJobTests(unittest.TestCase):
    def test_release_looks_up_the_marker_like_any_other_run(self):
        # Owner decision 2026-10-17: a release reuses a passing comparison of
        # byte-identical core content; content never compared still runs it.
        scope_steps = steps(job('scope'))
        lookup = scope_steps[find(scope_steps, 'ci-scope.py lookup')]
        self.assertIsNone(condition(lookup))
        decide = scope_steps[find(scope_steps, 'ci-scope.py decide')]
        self.assertIn('RELEASE: ${{ inputs.release }}', decide)
        self.assertIn('--release "$RELEASE"', decide)
        self.assertIn('HIT: ${{ steps.marker.outputs.marker_hit }}', decide)

    def test_markers_are_repository_wide_artifacts_not_branch_scoped_caches(self):
        # Caches saved on the working branch or a pull request are invisible to
        # main and to other pull requests; artifacts are visible to every run.
        block = job('scope')
        self.assertNotIn('actions/cache', block)
        self.assertIn('      actions: read\n', block.split('\n    steps:\n', 1)[0])
        lookup = steps(block)[find(steps(block), 'ci-scope.py lookup')]
        self.assertIn('GITHUB_TOKEN: ${{ github.token }}', lookup)
        self.assertIn('--hash "$HASH"', lookup)

    def test_verify_accepts_a_skip_only_by_scope(self):
        verify = job('verify')
        self.assertIn('if: always()', verify)
        self.assertIn('elif [ "$COMPARE" = skipped ] && [ "$SCOPE" = success ] && [ "$CORE_SCOPE" = false ]; then',
                      verify)


class DesktopAcceptanceTests(unittest.TestCase):
    def test_rom_token_reaches_only_the_fixture_fetch_step(self):
        rom = steps(job('rom-browser'))
        holders = [step for step in rom if 'secrets.NOCPU_ROMS_TOKEN' in step]
        self.assertEqual(len(holders), 1)
        self.assertIn('./tools/fetch-roms.sh', holders[0])
        play = rom[find(rom, 'Play Stunt Cycle and Indy 4')]
        self.assertIn("NOCPU_TEST_ROM_SAFE: '1'", play)
        upload = [step for step in rom if 'upload-artifact' in step]
        self.assertTrue(upload)
        for step in upload:
            self.assertNotIn('build/roms', step)
            self.assertNotIn('rom-browser-matrix.json', step)

    def test_release_requires_a_passed_record_and_never_a_skipped_rom_job(self):
        generate = steps(job('acceptance'))[find(steps(job('acceptance')), 'desktop-acceptance.py combine')]
        self.assertIn('if [ "$RELEASE" = true ] || [ "$ROM_BROWSER" = success ]; then require=(--require-passed); fi', generate)
        verify = job('verify')
        for name in ('rom-access', 'rom-browser', 'acceptance'):
            self.assertIn(f'    - {name}\n', verify)
        self.assertIn('"acceptance=$ACCEPTANCE"', verify)
        self.assertIn('[ "$ROM_BROWSER" = skipped ] && [ "$ROM_ACCESS" = success ] && [ "$ROM_CONFIGURED" = false ] '
                      '&& [ "$RELEASE" != true ]', verify)

    def test_record_counts_only_results_this_run_freshly_produced(self):
        acceptance = job('acceptance')
        self.assertIn('BROWSER: ${{ needs.browser.result }}', acceptance)
        self.assertIn('ROM_BROWSER: ${{ needs.rom-browser.result }}', acceptance)
        self.assertIn('--job browser="$BROWSER" --job rom-browser="$ROM_BROWSER"', acceptance)
        for name in ('browser', 'rom-browser'):
            uploads = [step for step in steps(job(name)) if 'name: acceptance-input-' in step]
            self.assertEqual(len(uploads), 1, name)
            self.assertIn('overwrite: true', uploads[0])
            self.assertNotIn('if-no-files-found: ignore', uploads[0])
            collect = [step for step in steps(job(name)) if 'desktop-acceptance.py collect' in step]
            self.assertEqual(len(collect), 1, name)
            self.assertEqual(condition(collect[0]), 'always()')

    def test_publish_verifies_the_record_against_the_release_zip_before_releasing(self):
        release = (ROOT / '.github/workflows/release.yml').read_text()
        self.assertIn('NOCPU_ROMS_TOKEN: ${{ secrets.NOCPU_ROMS_TOKEN }}', release.split('  publish:')[0])
        publish = release.split('  publish:')[1].split('  deploy-pages:')[0]
        check = publish.index('desktop-acceptance.py verify --record "$record" --zip "$zip" --tag "$TAG"')
        self.assertLess(check, publish.index('gh release create'))
        self.assertIn('release-assets/*.json', publish)
        self.assertIn('requires a desktop acceptance record and this run produced none', publish)


if __name__ == '__main__':
    unittest.main()
