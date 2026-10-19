#!/usr/bin/env python3
"""Compare retained original/new-game evidence without widening Pong gates."""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import concurrent.futures
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
    if analysis.game_media.registered_game(game):
        # Games ported from 0.2.0 on: every snapshot is full-RGB exact, and the
        # objects their module reads from it must agree. No tolerance.
        for left, right in zip(a, b):
            fields = [key for key in left if key not in ('image', 'requested_ms')]
            check = all(left[key] == right.get(key) for key in fields) and set(left) == set(right)
            passed &= check
            observations.append({'requested_ms': left['requested_ms'], 'original_sha256': left['sha256'],
                                 'portable_sha256': right['sha256'], 'full_RGB_bytes_and_objects_exact': check,
                                 'passed': check})
        return {'passed': bool(observations) and passed, 'snapshots': observations,
                'tolerance': None, 'scope': 'Exact full RGB snapshots and the objects read from them.'}
    if game == 'breakout':
        for left, right in zip(a, b):
            check = left['sha256'] == right['sha256'] and all(left[key] == right[key]
                for key in ('time_ps', 'paddle', 'ball', 'brick_pixels', 'palette'))
            passed &= check
            observations.append({'requested_ms': left['requested_ms'], 'actual_frame_time_ps': left['time_ps'],
                                 'original_sha256': left['sha256'], 'portable_sha256': right['sha256'],
                                 'full_RGB_bytes_and_geometry_exact': check, 'passed': check})
        return {'passed': bool(observations) and passed, 'snapshots': observations,
                'tolerance': None, 'scope': 'Exact clockwise portrait full RGB and source-shaped observations.'}
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
    # A NoCPU audio reconstruction (Pin Pong) has no original counterpart: its
    # PCM is compared native<->Wasm and checked by the game's analysis instead.
    reconstructed = analysis.game_media.reconstructed_audio(game)
    original_exact = compare_pair(fresh, native / 'epoch0',
                                  [name for name in EXACT if not (reconstructed and name == 'audio.s16le')])
    native_wasm = [compare_pair(native / f'epoch{i}', wasm / f'epoch{i}') for i in range(2)]
    reset = {label: compare_pair(path / 'epoch0', path / 'epoch1') for label, path in [('native', native), ('wasm', wasm)]}
    geometry = snapshot_geometry(fresh, native / 'epoch0', game)
    snapshot_exact = {}
    if game == 'breakout' or analysis.game_media.registered_game(game):
        original_images = {image.name: digest(image) for image in fresh.glob('*ms.ppm')}
        for label, path in [('native', native), ('wasm', wasm)]:
            for epoch in range(2):
                actual_images = {image.name: digest(image) for image in (path / f'epoch{epoch}').glob('*ms.ppm')}
                snapshot_exact[f'{label}_epoch{epoch}'] = bool(original_images) and original_images == actual_images
    passed = all(original_exact.values()) and all(all(item.values()) for item in native_wasm) \
        and all(all(item.values()) for item in reset.values()) and geometry['passed'] \
        and all(epoch['passed'] for group in epochs.values() for epoch in group) and all(snapshot_exact.values())
    return {'id': name, 'game': game, 'options': {'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']},
            'original_to_native_exact': original_exact,
            'original_to_native_audio': 'not compared: NoCPU reconstruction from the schematic; DICE has no audio for this game'
                if reconstructed else 'exact', 'native_to_wasm_exact': native_wasm,
            'same_module_reset_exact': reset, 'renderer': geometry, 'selected_full_RGB_snapshots_exact': snapshot_exact,
            'behavioral_epochs': epochs, 'passed': passed}


def compare_one(original, evidence, scenario):
    try:
        return compare_scenario(original, evidence, scenario)
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        return {'id': scenario['id'], 'game': scenario['game'],
                'options': {'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']},
                'passed': False, 'errors': [f'{type(error).__name__}: {error}']}


def compare(original, evidence, *, allow_subset=False, jobs=1):
    """Compare every declared scenario, or with allow_subset a selected run.

    A subset result records full_batch false and never stands in for the
    whole-batch qualification; the per-scenario checks are identical.
    """
    reference = json.loads((original / 'report.json').read_text())
    if not reference.get('passed') or not (reference.get('full_batch') or allow_subset):
        raise ValueError('Original whole declared batch must be qualified before comparison')
    whole_manifest = json.loads((ROOT / 'tests/replays/game-scenarios.json').read_text())
    original_bindings = analysis.game_media.validate_selection(original, whole_manifest)
    evidence_bindings = analysis.game_media.validate_selection(evidence, whole_manifest, capture_layout='portable')
    complete = original_bindings['full_batch'] and evidence_bindings['full_batch']
    if original_bindings['errors'] or evidence_bindings['errors'] or not (complete or allow_subset) \
            or original_bindings['requested_ids'] != evidence_bindings['requested_ids']:
        raise ValueError('Captured source/scenario binding failed: ' + json.dumps({'original': original_bindings, 'portable': evidence_bindings}))
    selected = set(original_bindings['requested_ids'])
    manifest = [item for item in whole_manifest['scenarios'] if item['id'] in selected]
    result = {'schema_version': 1, 'version': (ROOT / 'VERSION').read_text().strip(), 'seed': 848,
              'original': str(original), 'scenarios': [], 'analog_tolerance': None,
              'full_batch': bool(complete), 'selection_scope': 'complete_batch' if complete else 'selected_scenarios',
              'source_bindings': {'original': original_bindings, 'portable': evidence_bindings},
              'limitations': ['Generated PCM equality does not establish audible physical speaker output.',
                              'Original source TODOs and physical-phone qualifications remain separately reported.']}
    if jobs > 1:
        # Independent scenarios in separate processes; results keep manifest order.
        with concurrent.futures.ProcessPoolExecutor(max_workers=jobs) as pool:
            count = len(manifest)
            result['scenarios'] = list(pool.map(compare_one, [original] * count, [evidence] * count, manifest))
    else:
        result['scenarios'] = [compare_one(original, evidence, scenario) for scenario in manifest]
    result['passed'] = bool(result['scenarios']) and all(item['passed'] for item in result['scenarios'])
    (evidence / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--allow-subset', action='store_true',
                        help='compare a selected-scenario original run; the report keeps full_batch false')
    parser.add_argument('--jobs', type=int, default=1, help='scenarios compared at once')
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('--jobs must be positive')
    try:
        result = compare(args.original, args.evidence, allow_subset=args.allow_subset, jobs=args.jobs)
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        result = {'schema_version': 1, 'original': str(args.original), 'scenarios': [],
                  'passed': False, 'errors': [f'{type(error).__name__}: {error}']}
        args.evidence.mkdir(parents=True, exist_ok=True)
        (args.evidence / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    scope = '' if result.get('full_batch', True) or not result['passed'] else ' (SUBSET ONLY: not the whole-batch qualification)'
    print(f"Additional-game original/native/Wasm comparison: {'PASS' if result['passed'] else 'FAIL'}{scope}; {args.evidence / 'report.json'}")
    raise SystemExit(0 if result['passed'] else 1)
