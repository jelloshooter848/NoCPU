#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""capture-games.sh restores hits without Docker runs and stores only what passed.

A stub `docker` on PATH stands in for the pinned image: it records each call
and writes placeholder capture files, so no original DICE runs. The analysis
of placeholder media fails, which must keep the capture out of the cache.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STUB = textwrap.dedent('''\
    #!/usr/bin/env python3
    import os, sys
    from pathlib import Path
    args = sys.argv[1:]
    log = Path(os.environ['STUB_DOCKER_LOG'])
    if args[:2] == ['image', 'inspect']:
        if '--format' in args:
            print(os.environ.get('STUB_IMAGE_ID', 'sha256:stub'))
        sys.exit(0)
    assert args[0] == 'run', args
    mounts = {}
    for index, value in enumerate(args):
        if value == '--mount':
            fields = dict(item.split('=', 1) for item in args[index + 1].split(',') if '=' in item)
            mounts[fields['target']] = Path(fields['source'])
    if '/artifacts' in mounts:
        with log.open('a') as stream:
            stream.write('capture\\n')
        out = mounts['/artifacts']
        (out / 'epoch0').mkdir(parents=True, exist_ok=True)
        for name in ('frames.csv', 'frames.gray', 'audio.s16le', 'telemetry.csv', 'inputs.csv', 'collisions.csv',
                     'events.csv', 'hardware.csv', 'frame-geometry.csv', 'renderer-errors.csv'):
            (out / 'epoch0' / name).write_text('placeholder\\n')
        for name in ('configuration.json', 'container-environment.json', 'renderer-identity.txt'):
            (out / name).write_text('{}\\n')
    else:
        with log.open('a') as stream:
            stream.write('build\\n')
        (mounts['/source'] / 'dice').write_text('stub adapted executable\\n')
''')


class CaptureWiringTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.repo = base / 'repo'
        for name in ('tools/capture-games.sh', 'tools/reference-cache.py', 'tools/build-native.sh',
                     'tools/capture-pong.sh', 'VERSION'):
            target = self.repo / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        for name in ('tools/reference', 'tools/native', 'tests/replays', 'upstream/dice-0.9'):
            shutil.copytree(ROOT / name, self.repo / name, ignore=shutil.ignore_patterns('__pycache__'))
        native = self.repo / 'build/native'
        shutil.copytree(ROOT / 'upstream/dice-0.9', native)
        (native / 'dice').write_text('stub pristine executable\n')
        (native / 'dice').chmod(0o755)
        provenance = native / 'toolchain-provenance'
        provenance.mkdir()
        for name, text in {'packages.tsv': 'gcc\t7.5\n', 'base-image.txt': 'base=ubuntu@sha256:0\n',
                           'binary.sha256': 'a' * 64 + '  dice\n', 'image-id.txt': 'sha256:stub\n'}.items():
            (provenance / name).write_text(text)
        bin_dir = base / 'bin'
        bin_dir.mkdir()
        (bin_dir / 'docker').write_text(STUB)
        (bin_dir / 'docker').chmod(0o755)
        self.log = base / 'docker.log'
        self.env = {**os.environ, 'PATH': f'{bin_dir}:{os.environ["PATH"]}', 'STUB_DOCKER_LOG': str(self.log),
                    'NOCPU_REFERENCE_CACHE': str(self.repo / 'build/reference-cache'),
                    'NOCPU_GAME_REFERENCE_ROOT': str(self.repo / 'build/reference-games')}

    def tearDown(self):
        self.temp.cleanup()

    def capture(self):
        self.log.write_text('')
        result = subprocess.run([str(self.repo / 'tools/capture-games.sh'), '--scenarios', 'breakout-default'],
                                cwd=self.repo, env=self.env, capture_output=True, text=True, timeout=600)
        run = Path((self.repo / 'build/reference-games/last-run.txt').read_text().strip())
        receipts = [json.loads(line) for line in (run / 'reference-cache.jsonl').read_text().splitlines()]
        return result, run, receipts, self.log.read_text().split()

    def cache_module(self):
        spec = importlib.util.spec_from_file_location('reference_cache_copy', self.repo / 'tools/reference-cache.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        os.environ['NOCPU_REFERENCE_CACHE'] = self.env['NOCPU_REFERENCE_CACHE']
        return module

    def test_miss_captures_and_failed_analysis_is_not_stored_then_a_hit_skips_docker(self):
        result, run, receipts, calls = self.capture()
        self.assertNotEqual(result.returncode, 0, 'placeholder media must fail the original analysis')
        self.assertEqual(calls, ['build', 'capture', 'capture'])
        self.assertEqual([(item['action'], item.get('hit'), item.get('stored')) for item in receipts],
                         [('restore', False, None), ('store', None, False)])
        self.assertIn('did not pass', receipts[1]['reason'])
        self.assertIn('Reference cache MISS game/breakout-default', result.stdout)
        cache = self.cache_module()
        self.assertEqual(list(Path(self.env['NOCPU_REFERENCE_CACHE']).glob('v1/*/*/*/entry.json')), [])

        # Seed an entry from that capture as a passing run would have, then capture again.
        stored = cache.store('game', 'breakout-default', run / 'source', run / 'breakout-default', run)
        self.assertTrue(stored['stored'], stored)
        result, run, receipts, calls = self.capture()
        self.assertEqual(calls, ['build'], 'a hit must not run the original capture')
        self.assertTrue(receipts[0]['hit'], receipts)
        self.assertIn('Reference cache HIT game/breakout-default', result.stdout)
        self.assertEqual((run / 'breakout-default/capture-image-id.txt').read_text().strip(), 'sha256:stub')
        self.assertEqual(len(receipts), 1, 'a restored scenario is never stored again')

        # A capture image other than the provenance image refuses the cache.
        self.env['STUB_IMAGE_ID'] = 'sha256:other'
        result, run, receipts, calls = self.capture()
        self.assertEqual(calls, ['build', 'capture', 'capture'])
        self.assertFalse(receipts[0]['hit'])
        self.assertIn('NOCPU_NATIVE_IMAGE', receipts[0]['reason'])

    def test_cache_disabled_always_captures(self):
        self.env.pop('NOCPU_REFERENCE_CACHE')
        self.log.write_text('')
        result = subprocess.run([str(self.repo / 'tools/capture-games.sh'), '--scenarios', 'breakout-default'],
                                cwd=self.repo, env=self.env, capture_output=True, text=True, timeout=600)
        self.assertIn('Reference cache disabled', result.stdout)
        self.assertEqual(self.log.read_text().split(), ['build', 'capture', 'capture'])


if __name__ == '__main__':
    unittest.main()
