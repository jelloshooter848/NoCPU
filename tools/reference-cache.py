#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Content-addressed cache of ROM-free original DICE reference captures.

The original DICE 0.9 tree never changes, so an original capture is a pure
function of its inputs. Each entry is keyed by a SHA-256 over every input the
capture depends on (see key_inputs): the upstream/dice-0.9 bytes, the native
toolchain recipe and the built image's package inventory and binary hash, the
adapted executable that actually produces the capture, tools/reference/**, the
capture scripts, this tool, the scenario's manifest entry and replay bytes, and
the host CPU's FMA flag. Any changed input is a miss and the capture runs
fresh. A hit only replaces the Docker original run: the original analysis and
every native/Wasm comparison still run on the cached bytes. The fresh-process
repeat check (two independent original processes giving identical streams)
was proven when the entry was stored; on a hit it compares the two cached
attempts again but does not re-run the original. Restore and store both
refuse a run whose capture image is not the image build-native.sh recorded.

Only ROM-free scenarios (tests/replays/game-scenarios.json and Pong) can be
cached. ROM-backed captures contain ROM-derived frames and are never stored.
An entry is written only after its capture passed the original analysis and
the repeat check. Release CI never uses this cache (see docs/RELEASING.md).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'nocpu-reference-cache-v1'
GAME_MANIFEST = 'tests/replays/game-scenarios.json'
ROM_MANIFEST = 'tests/replays/rom-scenarios.json'
PONG_REPLAY = 'tests/replays/pong.tsv'
PAYLOAD = ('baseline', 'repeat', 'baseline.log', 'repeat.log')
# Written by the original analysis, which always reruns; never cached.
DERIVED = frozenset({'evidence.json', 'positions.csv', 'snapshot-positions.json'})
MISS = 3


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def tree_digest(base: Path, relative: str) -> str:
    """Hash every regular file below ROOT/relative by path and bytes."""
    top = base / relative
    if not top.is_dir() or top.is_symlink():
        raise ValueError(f'Missing input tree: {relative}')
    digest = hashlib.sha256()
    for path in sorted(top.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Symlink in cache input tree: {path}')
        if path.is_file() and '__pycache__' not in path.parts:
            digest.update(path.relative_to(base).as_posix().encode() + b'\0' + sha256_file(path).encode() + b'\n')
    return digest.hexdigest()


def host_fma() -> bool:
    try:
        lines = Path('/proc/cpuinfo').read_text().splitlines()
    except OSError:
        return False
    return any(line.startswith('flags') and 'fma' in line.split(':', 1)[1].split() for line in lines)


def cache_root() -> Path:
    value = os.environ.get('NOCPU_REFERENCE_CACHE', '')
    if not value:
        raise SystemExit('NOCPU_REFERENCE_CACHE is not set')
    path = Path(value)
    path = (ROOT / path) if not path.is_absolute() else path
    resolved = path.resolve()
    if resolved != path.absolute() and path.exists():
        raise SystemExit('Reference cache path must not traverse symlinks')
    if not (resolved.is_relative_to(ROOT / 'build') or resolved.is_relative_to(Path('/tmp'))):
        raise SystemExit('Reference cache must be below ignored build/ or /tmp/')
    return resolved / 'v1'


def scenario_entry(kind: str, scenario: str) -> dict:
    """Return the manifest inputs of one ROM-free scenario; refuse ROM games."""
    rom = json.loads((ROOT / ROM_MANIFEST).read_text())
    rom_games = {item['game'] for item in rom['scenarios']}
    rom_ids = {item['id'] for item in rom['scenarios']}
    if kind == 'pong':
        if scenario != 'pong':
            raise ValueError('Pong entries use the scenario id "pong"')
        return {'id': 'pong', 'game': 'pong', 'replay': PONG_REPLAY, 'seed': 848, 'epochs': 2}
    if scenario in rom_ids:
        raise ValueError(f'ROM-backed scenario {scenario} is never cached')
    manifest = json.loads((ROOT / GAME_MANIFEST).read_text())
    matches = [item for item in manifest['scenarios'] if item.get('id') == scenario]
    if len(matches) != 1:
        raise ValueError(f'Unknown ROM-free game scenario: {scenario}')
    item = matches[0]
    if item['game'] in rom_games or scenario in rom_ids:
        raise ValueError(f'ROM-backed scenario {scenario} is never cached')
    return {'manifest_schema_version': manifest['schema_version'], 'manifest_seed': manifest['seed'],
            'entry': item, 'epochs': 1}


def common_inputs() -> dict:
    """Inputs shared by every entry, available once build-native.sh has run."""
    provenance = ROOT / 'build/native/toolchain-provenance'
    for name in ('packages.tsv', 'base-image.txt', 'binary.sha256'):
        if not (provenance / name).is_file():
            raise ValueError(f'Run tools/build-native.sh first: missing toolchain-provenance/{name}')
    files = ['tools/build-native.sh', 'tools/capture-pong.sh', 'tools/capture-games.sh', 'tools/reference-cache.py']
    return {
        'schema': SCHEMA,
        'upstream_dice_0_9': tree_digest(ROOT, 'upstream/dice-0.9'),
        'native_recipe': tree_digest(ROOT, 'tools/native'),
        'toolchain_packages_sha256': sha256_file(provenance / 'packages.tsv'),
        'toolchain_base_image': (provenance / 'base-image.txt').read_text().strip(),
        'toolchain_native_binary': (provenance / 'binary.sha256').read_text().split()[0],
        'reference_tools': tree_digest(ROOT, 'tools/reference'),
        'capture_scripts': {name: sha256_file(ROOT / name) for name in files},
        'host_cpu_fma': host_fma(),
    }


def key_inputs(kind: str, scenario: str, source: Path | None, common: dict | None = None) -> dict:
    inputs = dict(common or common_inputs())
    entry = scenario_entry(kind, scenario)
    replay = entry['replay'] if kind == 'pong' else entry['entry']['replay']
    inputs.update({'kind': kind, 'scenario': scenario, 'scenario_inputs': entry,
                   'replay_sha256': sha256_file(ROOT / replay)})
    if source is not None:
        # The adapted executable that actually produces the capture.
        inputs['adapted_executable_sha256'] = sha256_file(source / 'dice')
    return inputs


def digest_inputs(inputs: dict) -> str:
    return hashlib.sha256(json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def scenario_ids(kind: str) -> list[str]:
    if kind == 'pong':
        return ['pong']
    return [item['id'] for item in json.loads((ROOT / GAME_MANIFEST).read_text())['scenarios']]


def combined_key() -> str:
    """One key over every cacheable scenario, for the CI cache archive name."""
    common = common_inputs()
    parts = {f'{kind}/{name}': digest_inputs(key_inputs(kind, name, None, common))
             for kind in ('pong', 'game') for name in scenario_ids(kind)}
    return digest_inputs(parts)


def entry_dir(kind: str, scenario: str, key: str) -> Path:
    return cache_root() / kind / scenario / key


def inventory(directory: Path) -> dict:
    files = {}
    for name in PAYLOAD:
        top = directory / name
        if top.is_symlink():
            raise ValueError(f'Symlink in capture payload: {name}')
        paths = [top] if top.is_file() else sorted(top.rglob('*')) if top.is_dir() else []
        if not paths:
            raise ValueError(f'Missing capture payload: {name}')
        for path in paths:
            if path.is_symlink():
                raise ValueError(f'Symlink in capture payload: {path}')
            if path.is_file() and path.name not in DERIVED:
                files[path.relative_to(directory).as_posix()] = {'bytes': path.stat().st_size, 'sha256': sha256_file(path)}
    return files


def image_mismatch(run: Path) -> str | None:
    """The run must capture with the image that build-native.sh recorded."""
    try:
        capture = (run / 'capture-image-id.txt').read_text().strip()
        provenance = (ROOT / 'build/native/toolchain-provenance/image-id.txt').read_text().strip()
    except OSError as error:
        return f'cannot read the capture or provenance image ID ({error})'
    if not capture or capture != provenance:
        return f'capture image {capture or "(none)"} is not the provenance image {provenance} (NOCPU_NATIVE_IMAGE mismatch)'
    return None


def checked_key(kind: str, scenario: str, source: Path, expected: str | None) -> tuple[dict, str]:
    inputs = key_inputs(kind, scenario, source)
    key = digest_inputs(inputs)
    if expected is not None and key != expected:
        raise ValueError(f'Cache key inputs changed during the run for {kind}/{scenario}')
    return inputs, key


def restore(kind: str, scenario: str, source: Path, destination: Path, run: Path, expected: str | None = None) -> dict:
    inputs, key = checked_key(kind, scenario, source, expected)
    entry = entry_dir(kind, scenario, key)
    record = {'scenario': scenario, 'kind': kind, 'key': key}
    if mismatch := image_mismatch(run):
        return {**record, 'hit': False, 'reason': mismatch}
    if not (entry / 'entry.json').is_file():
        return {**record, 'hit': False, 'reason': 'no entry for this key (an input changed or nothing cached yet)'}
    try:
        metadata = json.loads((entry / 'entry.json').read_text())
        if metadata.get('schema') != SCHEMA or metadata.get('key') != key or metadata.get('key_inputs') != inputs:
            return {**record, 'hit': False, 'reason': 'entry metadata does not match the current inputs'}
        payload = entry / 'payload'
        if inventory(payload) != metadata.get('files'):
            return {**record, 'hit': False, 'reason': 'entry payload bytes do not match its recorded hashes'}
        if not metadata.get('original_analysis_passed'):
            return {**record, 'hit': False, 'reason': 'entry was not recorded as a passed original capture'}
    except (OSError, ValueError, TypeError) as error:
        return {**record, 'hit': False, 'reason': f'unreadable entry: {type(error).__name__}: {error}'}
    destination.mkdir(parents=True, exist_ok=True)
    for name in PAYLOAD:
        target = destination / name
        if target.exists() or target.is_symlink():
            raise ValueError(f'Refusing to overwrite capture output: {target}')
        source_path = payload / name
        if source_path.is_dir():
            shutil.copytree(source_path, target, symlinks=False, ignore=shutil.ignore_patterns(*DERIVED))
        else:
            shutil.copy2(source_path, target)
    if inventory(destination) != metadata['files']:
        raise ValueError('Restored capture bytes differ from the cache entry')
    produced = metadata.get('produced', {})
    # Name the image that actually captured these streams, not the current one.
    (destination / 'capture-image-id.txt').write_text(str(produced.get('toolchain_image_id')) + '\n')
    return {**record, 'hit': True, 'produced': produced}


def store(kind: str, scenario: str, source: Path, capture: Path, run: Path, expected: str | None = None) -> dict:
    inputs, key = checked_key(kind, scenario, source, expected)
    if mismatch := image_mismatch(run):
        return {'scenario': scenario, 'key': key, 'stored': False, 'reason': mismatch}
    image_id = (run / 'capture-image-id.txt').read_text().strip()
    entry = entry_dir(kind, scenario, key)
    if (entry / 'entry.json').is_file():
        return {'scenario': scenario, 'key': key, 'stored': False, 'reason': 'already cached'}
    files = inventory(capture)
    parent = entry.parent
    parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=parent))
    try:
        payload = staging / 'payload'
        payload.mkdir()
        for name in PAYLOAD:
            source_path = capture / name
            if source_path.is_dir():
                shutil.copytree(source_path, payload / name, symlinks=False, ignore=shutil.ignore_patterns(*DERIVED))
            else:
                shutil.copy2(source_path, payload / name)
        if inventory(payload) != files:
            raise ValueError('Capture changed while it was being cached')
        metadata = {'schema': SCHEMA, 'key': key, 'key_inputs': inputs, 'files': files,
                    'original_analysis_passed': True,
                    'produced': {'toolchain_image_id': image_id, 'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                                 'github_run_id': os.environ.get('GITHUB_RUN_ID'), 'github_sha': os.environ.get('GITHUB_SHA')}}
        (staging / 'entry.json').write_text(json.dumps(metadata, indent=2, sort_keys=True) + '\n')
        # Keep one entry per scenario: older keys can never hit again.
        for sibling in parent.iterdir():
            if sibling != staging:
                shutil.rmtree(sibling)
        staging.rename(entry)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return {'scenario': scenario, 'key': key, 'stored': True}


def prune() -> list[str]:
    """Remove entries for scenarios no longer declared and stale staging dirs."""
    removed = []
    root = cache_root()
    for kind in ('pong', 'game'):
        declared = set(scenario_ids(kind))
        base = root / kind
        if not base.is_dir():
            continue
        for directory in base.iterdir():
            if directory.name not in declared:
                shutil.rmtree(directory)
                removed.append(f'{kind}/{directory.name}')
            else:
                for child in directory.iterdir():
                    if child.name.startswith('.staging-'):
                        shutil.rmtree(child)
    for stray in root.iterdir() if root.is_dir() else []:
        if stray.name not in ('pong', 'game'):
            shutil.rmtree(stray) if stray.is_dir() else stray.unlink()
            removed.append(stray.name)
    return removed


def content_key() -> str:
    """Digest of the entries now in the cache, to name a CI cache archive."""
    root = cache_root()
    entries = sorted(path.parent.relative_to(root).as_posix() for path in root.glob('*/*/*/entry.json'))
    return digest_inputs(entries)


def passed_scenarios(run: Path, kind: str) -> set[str]:
    """Scenarios whose original analysis passed in this run's report."""
    if not (run / 'report.json').is_file():
        return set()
    report = json.loads((run / 'report.json').read_text())
    if kind == 'pong':
        return {'pong'} if report.get('passed') is True else set()
    capture = json.loads((run / 'capture-report.json').read_text())
    exact = {item['scenario'] for item in capture.get('repeats', []) if item.get('exact') is True}
    return {item['id'] for item in report.get('scenarios', []) if item.get('passed') is True and item['id'] in exact}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('combined-key', help='print the key over all cacheable scenarios')
    commands.add_parser('prune', help='drop entries for undeclared scenarios')
    commands.add_parser('content-key', help='print a digest of the entries in the cache')
    for name in ('key', 'restore', 'store'):
        command = commands.add_parser(name)
        command.add_argument('--kind', choices=('pong', 'game'), required=True)
        command.add_argument('--scenario', required=True)
        command.add_argument('--source', type=Path, help='adapted source directory holding the capture executable')
        if name in ('restore', 'store'):
            command.add_argument('--key', help='key computed before capture; the command fails if the inputs changed since')
        if name == 'restore':
            command.add_argument('--run', type=Path, required=True,
                                 help='capture run whose capture-image-id.txt must equal the provenance image')
            command.add_argument('--into', type=Path, required=True)
            command.add_argument('--receipt', type=Path, required=True)
        if name == 'store':
            command.add_argument('--run', type=Path, required=True,
                                 help='capture run whose analysis report must pass for this scenario')
            command.add_argument('--capture', type=Path, required=True)
            command.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'combined-key':
        print(combined_key())
        return 0
    if args.command == 'content-key':
        print(content_key())
        return 0
    if args.command == 'prune':
        for item in prune():
            print(f'Reference cache: pruned {item}')
        return 0
    if args.command == 'key':
        print(digest_inputs(key_inputs(args.kind, args.scenario, args.source)))
        return 0
    if args.source is None or not (args.source / 'dice').is_file():
        raise SystemExit('--source must hold the built adapted dice executable')
    receipt_lines = []
    if args.command == 'restore':
        result = restore(args.kind, args.scenario, args.source, args.into, args.run, args.key)
        if result['hit']:
            produced = result['produced']
            print(f"Reference cache HIT {args.kind}/{args.scenario} key {result['key'][:16]}: "
                  f"original run skipped; captured by image {produced.get('toolchain_image_id')} "
                  f"(run {produced.get('github_run_id')}, {produced.get('created_utc')}). Analysis and comparisons still run.")
        else:
            print(f"Reference cache MISS {args.kind}/{args.scenario} key {result['key'][:16]}: {result['reason']}; capturing fresh.")
        receipt_lines.append(result)
    else:
        if args.scenario not in passed_scenarios(args.run, args.kind):
            result = {'scenario': args.scenario, 'stored': False, 'reason': 'original analysis did not pass; not cached'}
            print(f'Reference cache: not storing {args.kind}/{args.scenario}: {result["reason"]}')
        else:
            result = store(args.kind, args.scenario, args.source, args.capture, args.run, args.key)
            print(f"Reference cache: {'stored' if result['stored'] else 'kept'} {args.kind}/{args.scenario} key {result['key'][:16]}"
                  + ('' if result['stored'] else f" ({result['reason']})"))
        receipt_lines.append({'kind': args.kind, **result})
    with args.receipt.open('a') as stream:
        for line in receipt_lines:
            stream.write(json.dumps({'action': args.command, **line}, sort_keys=True) + '\n')
    return 0 if args.command == 'store' or result['hit'] else MISS


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'Reference cache error: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
