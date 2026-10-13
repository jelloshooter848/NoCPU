#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Reference-cache keys: every capture input changes the key; unchanged inputs hit."""
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference_cache', ROOT / 'tools/reference-cache.py')
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)

GAMES = {'schema_version': 1, 'seed': 848, 'scenarios': [
    {'id': 'pongdoubles-default', 'game': 'pongdoubles', 'replay': 'tests/replays/pongdoubles.tsv', 'dip': 0, 'pot_ohms': 0},
    {'id': 'breakout-default', 'game': 'breakout', 'replay': 'tests/replays/breakout.tsv', 'dip': 0, 'pot_ohms': 0}]}
ROMS = {'schema_version': 1, 'scenarios': [
    {'id': 'indy4-default', 'game': 'indy4', 'replay': 'tests/replays/indy4.tsv', 'dip': 0, 'pot_ohms': 0}]}


class ReferenceCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'repo'
        files = {
            'upstream/dice-0.9/chip.cpp': 'original',
            'tools/native/Dockerfile': 'FROM ubuntu@sha256:0',
            'tools/reference/analyze.py': 'analysis',
            'tools/build-native.sh': 'build', 'tools/capture-pong.sh': 'pong', 'tools/capture-games.sh': 'games',
            'tools/reference-cache.py': 'this tool',
            'tests/replays/game-scenarios.json': json.dumps(GAMES), 'tests/replays/rom-scenarios.json': json.dumps(ROMS),
            'tests/replays/pong.tsv': '0 coin 1\n', 'tests/replays/pongdoubles.tsv': '1 start 1\n',
            'tests/replays/breakout.tsv': '2 start 1\n',
            'build/native/toolchain-provenance/packages.tsv': 'gcc\t7.5\n',
            'build/native/toolchain-provenance/base-image.txt': 'base=ubuntu@sha256:0\n',
            'build/native/toolchain-provenance/binary.sha256': 'a' * 64 + '  dice\n',
            'run/source/dice': 'adapted executable',
        }
        for name, text in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        self.saved = (cache.ROOT, os.environ.get('NOCPU_REFERENCE_CACHE'), cache.host_fma)
        cache.ROOT = self.root
        cache.host_fma = lambda: True
        os.environ['NOCPU_REFERENCE_CACHE'] = str(Path(self.temp.name) / 'cache')
        self.source = self.root / 'run/source'
        self.capture('run/pongdoubles-default')
        self.capture('run/pong-capture')
        (self.root / 'run/report.json').write_text(json.dumps({'passed': True, 'scenarios': [
            {'id': 'pongdoubles-default', 'passed': True}, {'id': 'breakout-default', 'passed': False}]}))
        (self.root / 'run/capture-report.json').write_text(json.dumps({'repeats': [
            {'scenario': 'pongdoubles-default', 'exact': True}, {'scenario': 'breakout-default', 'exact': True}]}))

    def tearDown(self):
        cache.ROOT, environment, cache.host_fma = self.saved
        if environment is None:
            os.environ.pop('NOCPU_REFERENCE_CACHE', None)
        else:
            os.environ['NOCPU_REFERENCE_CACHE'] = environment
        self.temp.cleanup()

    def capture(self, name):
        directory = self.root / name
        for attempt in ('baseline', 'repeat'):
            (directory / attempt / 'epoch0').mkdir(parents=True)
            (directory / attempt / 'epoch0/frames.gray').write_bytes(bytes(range(256)) * 4)
            (directory / attempt / 'epoch0/audio.s16le').write_bytes(b'\x01\x00' * 64)
            (directory / attempt / 'epoch0/evidence.json').write_text('{"derived": true}')
            (directory / f'{attempt}.log').write_text('log\n')

    def store(self, scenario='pongdoubles-default'):
        return cache.store('game', scenario, self.source, self.root / 'run' / scenario, 'sha256:image')

    def restore(self, scenario='pongdoubles-default'):
        destination = Path(tempfile.mkdtemp(dir=self.temp.name)) / scenario
        return cache.restore('game', scenario, self.source, destination), destination

    def test_unchanged_inputs_hit_with_identical_bytes_and_no_derived_files(self):
        self.assertTrue(self.store()['stored'])
        result, destination = self.restore()
        self.assertTrue(result['hit'], result)
        original = self.root / 'run/pongdoubles-default'
        self.assertEqual((destination / 'baseline/epoch0/frames.gray').read_bytes(),
                         (original / 'baseline/epoch0/frames.gray').read_bytes())
        self.assertFalse((destination / 'baseline/epoch0/evidence.json').exists())
        self.assertEqual(result['produced']['toolchain_image_id'], 'sha256:image')

    def test_each_changed_input_misses(self):
        self.store()
        mutations = {
            'upstream DICE byte': ('upstream/dice-0.9/chip.cpp', 'changed'),
            'new upstream file': ('upstream/dice-0.9/extra.h', 'new'),
            'toolchain recipe': ('tools/native/Dockerfile', 'FROM ubuntu@sha256:1'),
            'image package inventory': ('build/native/toolchain-provenance/packages.tsv', 'gcc\t7.6\n'),
            'built native binary': ('build/native/toolchain-provenance/binary.sha256', 'b' * 64 + '  dice\n'),
            'reference tools': ('tools/reference/analyze.py', 'analysis v2'),
            'capture script': ('tools/capture-games.sh', 'games v2'),
            'cache tool': ('tools/reference-cache.py', 'this tool v2'),
            'adapted executable': ('run/source/dice', 'rebuilt executable'),
            'replay bytes': ('tests/replays/pongdoubles.tsv', '1 start 0\n'),
            'manifest entry': ('tests/replays/game-scenarios.json',
                               json.dumps({**GAMES, 'scenarios': [{**GAMES['scenarios'][0], 'dip': 1}, GAMES['scenarios'][1]]})),
            'manifest seed': ('tests/replays/game-scenarios.json', json.dumps({**GAMES, 'seed': 849})),
        }
        for label, (name, text) in mutations.items():
            with self.subTest(label):
                path = self.root / name
                before = path.read_text() if path.exists() else None
                path.write_text(text)
                try:
                    result, _ = self.restore()
                    self.assertFalse(result['hit'], label)
                    self.assertIn('no entry for this key', result['reason'])
                finally:
                    path.unlink() if before is None else path.write_text(before)
        result, _ = self.restore()
        self.assertTrue(result['hit'], 'restoring every input must hit again')

    def test_host_without_fma_misses(self):
        self.store()
        cache.host_fma = lambda: False
        self.assertFalse(self.restore()[0]['hit'])

    def test_other_scenario_change_keeps_this_entry(self):
        self.store()
        (self.root / 'tests/replays/breakout.tsv').write_text('3 start 1\n')
        self.assertTrue(self.restore()[0]['hit'])

    def test_corrupted_or_unqualified_entry_misses(self):
        self.store()
        key = cache.digest_inputs(cache.key_inputs('game', 'pongdoubles-default', self.source))
        entry = cache.entry_dir('game', 'pongdoubles-default', key)
        frames = entry / 'payload/baseline/epoch0/frames.gray'
        frames.write_bytes(frames.read_bytes()[:-1])
        result, _ = self.restore()
        self.assertFalse(result['hit'])
        self.assertIn('do not match', result['reason'])
        shutil.rmtree(entry)
        self.store()
        metadata = json.loads((entry / 'entry.json').read_text())
        metadata['original_analysis_passed'] = False
        (entry / 'entry.json').write_text(json.dumps(metadata))
        self.assertFalse(self.restore()[0]['hit'])

    def test_store_keeps_only_the_current_key(self):
        self.store()
        (self.root / 'tests/replays/pongdoubles.tsv').write_text('1 start 0\n')
        self.store()
        entries = list((Path(os.environ['NOCPU_REFERENCE_CACHE']) / 'v1/game/pongdoubles-default').iterdir())
        self.assertEqual(len(entries), 1)

    def test_only_passed_scenarios_are_stored_and_rom_games_never(self):
        self.assertEqual(cache.passed_scenarios(self.root / 'run', 'game'), {'pongdoubles-default'})
        with self.assertRaisesRegex(ValueError, 'ROM-backed'):
            cache.key_inputs('game', 'indy4-default', None)
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            cache.key_inputs('game', 'stuntcycle-anything', None)

    def test_pong_entry_round_trip(self):
        stored = cache.store('pong', 'pong', self.source, self.root / 'run/pong-capture', 'sha256:image')
        self.assertTrue(stored['stored'])
        destination = Path(tempfile.mkdtemp(dir=self.temp.name))
        self.assertTrue(cache.restore('pong', 'pong', self.source, destination)['hit'])
        (self.root / 'tests/replays/pong.tsv').write_text('0 coin 0\n')
        self.assertFalse(cache.restore('pong', 'pong', self.source, Path(tempfile.mkdtemp(dir=self.temp.name)))['hit'])

    def test_combined_key_tracks_inputs(self):
        first = cache.combined_key()
        self.assertEqual(first, cache.combined_key())
        (self.root / 'tests/replays/breakout.tsv').write_text('3 start 1\n')
        self.assertNotEqual(first, cache.combined_key())

    def test_cache_must_stay_in_ignored_output(self):
        os.environ['NOCPU_REFERENCE_CACHE'] = '/var/nocpu-cache'
        with self.assertRaises(SystemExit):
            cache.cache_root()


if __name__ == '__main__':
    unittest.main()
