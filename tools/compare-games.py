#!/usr/bin/env python3
"""Compare retained original/new-game evidence without widening Pong gates."""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('game_analysis', ROOT / 'tools/reference/analyze-games.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)
EXACT = analysis.EXACT


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare_pair(a, b, names=EXACT):
    return {name: digest(a / name) == digest(b / name) for name in names}


def snapshot_geometry(original, native, game):
    a = analysis.snapshot_positions(original, game)
    b = analysis.snapshot_positions(native, game)
    observations = []
    passed = [row['requested_ms'] for row in a] == [row['requested_ms'] for row in b]
    keys = [f'paddle{i}_y' for i in range(1, 5)] if game == 'pongdoubles' else [f'rocket{i}_y' for i in range(1, 3)]
    for left, right in zip(a, b):
        if left['requested_ms'] < 250:
            continue
        errors = {key: None if left[key] is None or right[key] is None else abs(left[key] - right[key]) for key in keys}
        presence = {key: (left[key] is None) == (right[key] is None) for key in keys}
        check = all(presence.values()) and all(value is None or value <= 4 for value in errors.values())
        passed &= check
        observations.append({'requested_ms': left['requested_ms'], 'presence_equal': presence, 'native_pixel_errors': errors,
                             'original_sha256': left['sha256'], 'portable_sha256': right['sha256'], 'passed': check})
    return {'passed': bool(observations) and passed, 'snapshots': observations,
            'tolerance': 'At most four full native pixels, the existing one 160x120 observation-pixel renderer tolerance; component presence must agree.'}


def compare_scenario(original, evidence, scenario):
    name, game = scenario['id'], scenario['game']
    fresh = original / name / 'baseline/epoch0'
    native, wasm = evidence / name / 'native', evidence / name / 'wasm'
    epochs = {label: [analysis.analyze_epoch(path / f'epoch{i}', scenario) for i in range(2)]
              for label, path in [('native', native), ('wasm', wasm)]}
    original_exact = compare_pair(fresh, native / 'epoch0')
    native_wasm = [compare_pair(native / f'epoch{i}', wasm / f'epoch{i}') for i in range(2)]
    reset = {label: compare_pair(path / 'epoch0', path / 'epoch1') for label, path in [('native', native), ('wasm', wasm)]}
    geometry = snapshot_geometry(fresh, native / 'epoch0', game)
    passed = all(original_exact.values()) and all(all(item.values()) for item in native_wasm) \
        and all(all(item.values()) for item in reset.values()) and geometry['passed'] \
        and all(epoch['passed'] for group in epochs.values() for epoch in group)
    return {'id': name, 'game': game, 'options': {'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']},
            'original_to_native_exact': original_exact, 'native_to_wasm_exact': native_wasm,
            'same_module_reset_exact': reset, 'renderer': geometry, 'behavioral_epochs': epochs, 'passed': passed}


def compare(original, evidence):
    reference = json.loads((original / 'report.json').read_text())
    if not reference.get('passed') or not reference.get('full_batch'):
        raise ValueError('Original whole declared batch must be qualified before comparison')
    whole_manifest = json.loads((ROOT / 'tests/replays/game-scenarios.json').read_text())
    original_bindings = analysis.game_media.validate_selection(original, whole_manifest)
    evidence_bindings = analysis.game_media.validate_selection(evidence, whole_manifest, capture_layout='portable')
    if original_bindings['errors'] or not original_bindings['full_batch'] or evidence_bindings['errors'] or not evidence_bindings['full_batch']:
        raise ValueError('Captured source/scenario binding failed: ' + json.dumps({'original': original_bindings, 'portable': evidence_bindings}))
    manifest = whole_manifest['scenarios']
    result = {'schema_version': 1, 'version': (ROOT / 'VERSION').read_text().strip(), 'seed': 848,
              'original': str(original), 'scenarios': [], 'analog_tolerance': None,
              'source_bindings': {'original': original_bindings, 'portable': evidence_bindings},
              'limitations': ['Generated PCM equality does not establish audible physical speaker output.',
                              'Original source TODOs and physical-phone qualifications remain separately reported.']}
    for scenario in manifest:
        try:
            result['scenarios'].append(compare_scenario(original, evidence, scenario))
        except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
            result['scenarios'].append({'id': scenario['id'], 'game': scenario['game'],
                                        'options': {'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']},
                                        'passed': False, 'errors': [f'{type(error).__name__}: {error}']})
    result['passed'] = bool(result['scenarios']) and all(item['passed'] for item in result['scenarios'])
    (evidence / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = compare(args.original, args.evidence)
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        result = {'schema_version': 1, 'original': str(args.original), 'scenarios': [],
                  'passed': False, 'errors': [f'{type(error).__name__}: {error}']}
        args.evidence.mkdir(parents=True, exist_ok=True)
        (args.evidence / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f"Additional-game original/native/Wasm comparison: {'PASS' if result['passed'] else 'FAIL'}; {args.evidence / 'report.json'}")
    raise SystemExit(0 if result['passed'] else 1)
