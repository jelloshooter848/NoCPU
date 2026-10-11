#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Bind actual original capture bytes to the prepared source and fresh attempts.

This receipt is an identity/I/O record. Gameplay qualification is performed by
analyze-games.py and is never inferred from capture completion or repeat hashes.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

STREAMS = ('frames.csv', 'frames.gray', 'audio.s16le', 'telemetry.csv',
           'inputs.csv', 'collisions.csv', 'events.csv', 'hardware.csv',
           'frame-geometry.csv', 'renderer-errors.csv')
SOURCE_PATHS = ('main.cpp', 'reference_driver.cpp', 'reference_api.h',
                'chips/video.cpp', 'chips/audio.cpp', 'chips/input.cpp',
                'game_config.cpp', 'circuit.cpp', 'chip.cpp', 'games/breakout.cpp')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(run, failed=False):
    run = Path(run)
    result = {'schema_version': 1, 'qualified': False,
              'scope': 'Original capture/source/replay/fresh-repeat identity only; separate behavioral report decides qualification',
              'capture_complete': False, 'all_fresh_repeat_streams_exact': False,
              'attempts': [], 'repeats': [], 'errors': []}
    if failed:
        result['errors'].append('Original build/capture command failed; retained receipt is incomplete')
    try:
        source = run / 'source'
        result['source_pins'] = {name: digest(source / name) for name in SOURCE_PATHS}
        result['executable_sha256'] = digest(source / 'dice')
        result['scenario_manifest_sha256'] = digest(run / 'scenario-manifest.json')
        result['replay_hashes_sha256'] = digest(run / 'replay-hashes.json')
        result['scenarios_tsv_sha256'] = digest(run / 'scenarios.tsv')
        with (run / 'scenarios.tsv').open(newline='') as stream:
            selected = list(csv.reader(stream, delimiter='\t'))
        if not selected or any(len(row) != 5 for row in selected):
            raise ValueError('Missing or malformed selected scenarios')
        identifiers = [row[0] for row in selected]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError('Duplicate selected scenario ID')
        for identifier in identifiers:
            if not identifier or any(char not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in identifier):
                raise ValueError('Unsafe selected scenario ID')
            attempts = []
            for attempt in ('baseline', 'repeat'):
                directory = run / identifier / attempt
                files = {}
                if directory.is_dir() and not directory.is_symlink():
                    for path in sorted(directory.rglob('*')):
                        if path.is_symlink():
                            raise ValueError('Redirected original evidence path')
                        if path.is_file():
                            files[path.relative_to(directory).as_posix()] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
                missing = [name for name in STREAMS if 'epoch0/' + name not in files]
                missing.extend(name for name in ('configuration.json', 'container-environment.json') if name not in files)
                captured = not missing
                entry = {'scenario': identifier, 'attempt': attempt, 'captured': captured,
                         'missing_streams': missing, 'files': files}
                result['attempts'].append(entry)
                attempts.append(entry)
            names = ['epoch0/' + name for name in STREAMS] + ['configuration.json', 'renderer-identity.txt']
            names.extend(name for name in attempts[0]['files'] if name.endswith('.ppm'))
            # Host resource timing and environment timestamps are observations,
            # never purported deterministic circuit/media stream bytes.
            exact = all(attempts[0]['files'].get(name) is not None
                        and attempts[0]['files'].get(name) == attempts[1]['files'].get(name) for name in names)
            result['repeats'].append({'scenario': identifier, 'compared': names, 'exact': exact,
                                      'host_performance_observations_excluded': True})
        result['capture_complete'] = not failed and all(item['captured'] for item in result['attempts'])
        result['all_fresh_repeat_streams_exact'] = bool(result['repeats']) and all(item['exact'] for item in result['repeats'])
    except (OSError, ValueError, TypeError) as error:
        result['errors'].append(f'{type(error).__name__}: {error}')
    (run / 'capture-report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    parser.add_argument('--failed', action='store_true')
    arguments = parser.parse_args()
    receipt = record(arguments.run, arguments.failed)
    print('Original capture identity: ' + ('complete' if receipt['capture_complete'] else 'incomplete'))
    raise SystemExit(0 if receipt['capture_complete'] and receipt['all_fresh_repeat_streams_exact'] and not receipt['errors'] else 1)
