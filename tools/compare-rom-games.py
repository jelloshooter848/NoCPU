#!/usr/bin/env python3
"""Original/native/Wasm comparison for the ROM-backed games.

Stunt Cycle and Indy 4, and from 0.5.0 the registered ROM-backed games
(Anti-Aircraft, Shark Jaws, Jet Fighter, Attack).

ROM fixtures come from --rom-dir, else NOCPU_ROM_DIR, else build/roms when it
exists (see tools/fetch-roms.sh). Without fixtures nothing is run and the
result is reported as SKIPPED (blocked), exit 77: never as a pass.

For each scenario in tests/replays/rom-scenarios.json this captures one fresh
original DICE process in the pinned Docker toolchain (the private ZIP is
bind-mounted read-only under its original runtime basename), replays the same
inputs through the portable native runner and the Wasm module for two reset
epochs, and requires byte equality of every common evidence stream (decoded
RGB frames and snapshots, raw PCM, inputs, events, telemetry and hardware
observations). The descriptor bytes the portable runners need are staged in
a private 0700 directory below the run and removed afterwards. Captured
frames are ROM-derived; they stay under ignored build/ output and only the
payload-free report.json is suitable for upload.

A registered game with an analysis module (tools/reference/games/<id>.py)
also has its original capture checked for the game's original behavior, as
the ROM-free comparison does; the report records only the checks' outcomes.
A scenario may select another accepted dump identity with "rom_variant" (the
index into each descriptor's manifest dump_variants, Attack's alternative
CRCs): the original then reads a private ZIP holding only those members,
staged like the descriptors. After the scenarios, the registered-game ABI
probe (tools/probe-core-games.mjs) runs with the staged descriptors.
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import concurrent.futures
import datetime
import gzip
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = 77
SCENARIOS = ROOT / 'tests/replays/rom-scenarios.json'
IMAGE = os.environ.get('NOCPU_NATIVE_IMAGE', 'nocpu-dice-qt4:0.1.0')
# Streams every runtime must produce and match exactly.
REQUIRED = ['audio.s16le', 'inputs.csv', 'events.csv', 'telemetry.csv', 'hardware.csv', 'frames.csv', 'frames.rgb',
            'frames.gray', 'frame-geometry.csv', 'audio-boundary.json']
# Runtime-specific record formats compared on their shared fields only.
GEOMETRY_FIELDS = ['frame', 'time_ps', 'width', 'height']


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolve_rom_dir(argument):
    for candidate, label in [(argument, '--rom-dir'), (os.environ.get('NOCPU_ROM_DIR'), 'NOCPU_ROM_DIR')]:
        if candidate:
            path = Path(candidate).resolve()
            return (path, label) if path.is_dir() else (None, f'{label} is not a directory')
    default = ROOT / 'build/roms'
    return (default, 'build/roms') if default.is_dir() else (None, 'no ROM fixture directory')


def payload_bytes(path):
    """Logical content: gzip members are compared after decompression."""
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == '.gz' else data


def logical_name(name):
    return name[:-3] if name.endswith('.gz') else name


def projected(name, data):
    """Shared fields of records whose original and portable layouts differ."""
    if name == 'frame-geometry.csv':
        rows = [line.split(',') for line in data.decode().splitlines()]
        columns = [rows[0].index(field) for field in GEOMETRY_FIELDS]
        return ''.join(','.join(row[i] for i in columns) + '\n' for row in rows).encode()
    if name == 'audio-boundary.json':
        return json.dumps({'constructor_samples': json.loads(data)['constructor_samples']}).encode()
    if name == 'audio-events.csv':
        # The original records each construction-phase sample individually.
        rows = data.decode().splitlines()[1:]
        return json.dumps({'constructor_samples': sum(row.split(',')[1] == 'construction' for row in rows)}).encode()
    return data


PROJECTED = {'frame-geometry.csv', 'audio-boundary.json', 'audio-events.csv'}


def streamed_digest(path):
    """(bytes, sha256) of a file's logical content, decompressed in chunks: a
    long scenario's full-RGB stream is several gigabytes."""
    digest, size = hashlib.sha256(), 0
    with (gzip.open(path, 'rb') if path.suffix == '.gz' else path.open('rb')) as stream:
        for chunk in iter(lambda: stream.read(1 << 22), b''):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def digest_tree(directory):
    """Map logical evidence names to (bytes, sha256) of their decoded content."""
    result = {}
    for path in sorted(directory.iterdir()):
        if path.is_file() and not path.name.endswith('.log'):
            name = logical_name(path.name)
            if name in PROJECTED:
                data = projected(name, payload_bytes(path))
                digest = (len(data), hashlib.sha256(data).hexdigest())
            else:
                digest = streamed_digest(path)
            result['audio-boundary.json' if name == 'audio-events.csv' else name] = digest
    return result


def compare_trees(left, right):
    a, b = digest_tree(left), digest_tree(right)
    common = sorted(set(a) & set(b))
    return {
        'equal': {name: a[name] == b[name] for name in common},
        'only_left': sorted(set(a) - set(b)),
        'only_right': sorted(set(b) - set(a)),
        'sha256': {name: a[name][1] for name in common},
    }


def stage_descriptors(game, archive, stage, variant=None):
    """Write each required descriptor, found by CRC like DICE, as <stage>/<game>/<member>.

    With ``variant`` (an index into each descriptor's manifest dump_variants)
    only that identity is accepted, and the same members are also written to
    a private ZIP, <stage>/<runtime archive>, for the original to read.
    """
    target = stage / game['id']
    target.mkdir(mode=0o700, parents=True)
    staged = []
    with zipfile.ZipFile(archive) as source:
        members = [info for info in source.infolist() if not info.is_dir() and info.file_size <= 1048576]
        for rom in game['roms']:
            variants = rom['dump_variants'] if variant is None else rom['dump_variants'][variant:variant + 1]
            accepted = {(int(v['crc32'], 16), v['size_bytes']) for v in variants}
            match = next((info for info in members if (info.CRC, info.file_size) in accepted), None)
            if match is None:
                raise ValueError(f"{game['id']}: required descriptor {rom['expected_member']} missing")
            data = source.read(match)
            if (zlib.crc32(data) & 0xFFFFFFFF, len(data)) not in accepted:
                raise ValueError(f"{game['id']}: descriptor bytes do not match the manifest")
            (target / rom['expected_member']).write_bytes(data)
            staged.append((rom['expected_member'], data))
    if variant is not None:
        private = stage / game['roms'][0]['archive']
        with zipfile.ZipFile(private, 'w', zipfile.ZIP_DEFLATED) as zipped:
            for name, data in staged:
                zipped.writestr(name, data)
        os.chmod(private, 0o600)
        return private
    return None


def registered_rom_game(game_id):
    """A game ported from 0.5.0 on through the registered-game contract."""
    return game_id not in ('stuntcycle', 'indy4')


def run(command, log, timeout, **kwargs):
    with open(log, 'w') as stream:
        result = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, timeout=timeout, **kwargs)
    if result.returncode:
        raise RuntimeError(f'{command[0]} failed ({result.returncode}); see {log}')


def capture_original(run_dir, scenario, archive, runtime_name, timeout):
    artifacts = run_dir / scenario['id'] / 'original'
    artifacts.mkdir(parents=True)
    uid, gid = os.getuid(), os.getgid()
    command = ['docker', 'run', '--rm', '--platform', 'linux/amd64', '--network', 'none',
               '--env', 'SDL_AUDIODRIVER=dummy', '--env', 'LIBGL_ALWAYS_SOFTWARE=1',
               '--env', 'NOCPU_REFERENCE_OUTPUT=/artifacts', '--env', f"NOCPU_REFERENCE_REPLAY=/repo/{scenario['replay']}",
               '--env', 'NOCPU_REFERENCE_SEED=848', '--env', f"NOCPU_REFERENCE_GAME={scenario['game']}",
               '--env', 'NOCPU_REFERENCE_EPOCHS=1', '--env', f"NOCPU_REFERENCE_DIP={scenario['dip']}",
               '--env', f"NOCPU_REFERENCE_POT_OHMS={scenario['pot_ohms']}",
               '--mount', f'type=bind,source={ROOT},target=/repo,readonly',
               '--mount', f"type=bind,source={run_dir / 'source'},target=/source,readonly",
               '--mount', f'type=bind,source={archive},target=/source/roms/{runtime_name},readonly',
               '--mount', f'type=bind,source={artifacts},target=/artifacts',
               '--workdir', '/source', IMAGE, '/bin/bash', '-euo', 'pipefail', '-c',
               'trap \'chown -R "$3:$4" /artifacts\' EXIT; python3 /repo/tools/reference/check-config-isolation.py; '
               'timeout "$1" xvfb-run -a -s "-screen 0 800x600x24 +extension GLX" ./dice "$2" -window',
               'nocpu-rom-reference', f'{timeout}s', scenario['game'], str(uid), str(gid)]
    run(command, run_dir / scenario['id'] / 'original.log', timeout + 120)
    epoch = artifacts / 'epoch0'
    if not (epoch / 'frames.csv').is_file():
        raise RuntimeError('Original capture produced no epoch0 evidence')
    return epoch


def replay_portable(run_dir, scenario, stage):
    common = ['--game', scenario['game'], '--replay', scenario['replay'], '--seed', '848', '--dip', str(scenario['dip']),
              '--pot-ohms', str(scenario['pot_ohms']), '--epochs', '2', '--rom-dir', str(stage), '--snapshot-encoding', 'gzip']
    base = run_dir / scenario['id']
    run([str(ROOT / 'build/core/native/pong-runner'), '--output', str(base / 'native'), *common], base / 'native.log', 1800, cwd=ROOT)
    run(['node', str(ROOT / 'tools/replay-core.mjs'), '--output', str(base / 'wasm'), *common], base / 'wasm.log', 1800, cwd=ROOT)
    return base / 'native', base / 'wasm'


def analyze_original(scenario, original):
    """The game's original-behavior checks on the original capture, if it has a module."""
    analysis = load('analyze_games', ROOT / 'tools/reference/analyze-games.py')
    if analysis.game_media.registered_game(scenario['game']) is None:
        return None
    try:
        evidence = analysis.analyze_epoch(original, scenario, original=True)
    except (OSError, ValueError, KeyError, IndexError) as error:
        return {'passed': False, 'error': f'{type(error).__name__}: {error}'}
    # Outcomes only: positions and hashes of ROM-derived frames stay local.
    return {'passed': evidence['passed'], 'checks': evidence['checks'],
            'failed_checks': sorted(name for name, passed in evidence['checks'].items() if not passed),
            'maximum_scores': evidence['maximum_scores'], 'active_transitions': evidence['active_transitions']}


def evaluate(scenario, original, native, wasm):
    pairs = {'original_vs_native_epoch0': compare_trees(original, native / 'epoch0')}
    for epoch in range(2):
        pairs[f'native_vs_wasm_epoch{epoch}'] = compare_trees(native / f'epoch{epoch}', wasm / f'epoch{epoch}')
    for label, path in [('native', native), ('wasm', wasm)]:
        pairs[f'{label}_reset_epoch0_vs_epoch1'] = compare_trees(path / 'epoch0', path / 'epoch1')
    failures = []
    for name, pair in pairs.items():
        missing = [stream for stream in REQUIRED if stream not in pair['equal']]
        if missing:
            failures.append(f'{name}: required streams not compared: {", ".join(missing)}')
        failures += [f'{name}: {stream} differs' for stream, same in pair['equal'].items() if not same]
        unmatched = pair['only_left'] + pair['only_right']
        if name == 'original_vs_native_epoch0':
            # Original-only adapter metadata is allowed; snapshots must pair up.
            unmatched = [item for item in unmatched if item.endswith('.ppm')] + pair['only_right']
        if unmatched:
            failures.append(f'{name}: unpaired evidence: {", ".join(unmatched)}')
    for pair in pairs.values():
        pair.pop('sha256')
        pair['streams_compared'] = len(pair['equal'])
        pair['all_equal'] = all(pair['equal'].values())
    frames = sum(1 for _ in (native / 'epoch0/frames.csv').open()) - 1
    analysis = analyze_original(scenario, original)
    if analysis is not None and not analysis['passed']:
        failures.append('original behavior checks failed: ' + ', '.join(analysis.get('failed_checks') or [analysis.get('error', '')]))
    return {'id': scenario['id'], 'game': scenario['game'], 'replay': scenario['replay'],
            'replay_sha256': hashlib.sha256((ROOT / scenario['replay']).read_bytes()).hexdigest(),
            'options': {'dip': scenario['dip'], 'pot_ohms': scenario['pot_ohms']},
            'rom_variant': scenario.get('rom_variant', 0), 'frames': frames,
            'original_behavior': analysis, 'comparisons': pairs, 'failures': failures, 'passed': not failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--rom-dir', help='directory holding the fixture ZIPs (default NOCPU_ROM_DIR, then build/roms)')
    parser.add_argument('--scenario', action='append', help='scenario ID (repeatable); default all')
    parser.add_argument('--output-root', type=Path, default=ROOT / 'build/rom-comparison')
    parser.add_argument('--timeout', type=int, default=int(os.environ.get('NOCPU_REFERENCE_TIMEOUT', '900')))
    parser.add_argument('--jobs', type=int, default=int(os.environ.get('NOCPU_ROM_COMPARE_JOBS', '1')),
                        help='scenarios compared at once (default NOCPU_ROM_COMPARE_JOBS, else 1)')
    args = parser.parse_args()

    if args.jobs < 1:
        parser.error('--jobs must be a positive integer')
    manifest = json.loads(SCENARIOS.read_text())['scenarios']
    scenarios = [item for item in manifest if not args.scenario or item['id'] in args.scenario]
    if not scenarios or (args.scenario and len(scenarios) != len(set(args.scenario))):
        parser.error('unknown scenario ID')
    rom_dir, source = resolve_rom_dir(args.rom_dir)
    if rom_dir is None:
        print(f'SKIPPED (blocked: no ROM access): {source}. Set NOCPU_ROM_DIR or run tools/fetch-roms.sh. '
              f'{len(scenarios)} ROM-backed comparison(s) not run; this is not a pass.')
        return BLOCKED

    audit = load('audit_roms', ROOT / 'tools/audit-roms.py')
    games = {game['id']: game for game in audit.inventory_module().validate_manifest(
        json.loads(audit.MANIFEST.read_text(encoding='utf-8')))}
    archives = {}
    for game_id in sorted({item['game'] for item in scenarios}):
        try:
            archives[game_id] = rom_dir / audit.check_game(games[game_id], rom_dir)
        except (OSError, ValueError, zipfile.BadZipFile, zlib.error) as error:
            print(f'FAIL {game_id}: ROM audit: {error}', file=sys.stderr)
            return 1
        print(f'ROM audit PASS {game_id}: {archives[game_id].name} (from {source})')

    prerequisites = [ROOT / 'build/native/dice', ROOT / 'build/core/native/pong-runner', ROOT / 'build/core/wasm/nocpu.js']
    missing = [str(path.relative_to(ROOT)) for path in prerequisites if not path.is_file()]
    if missing:
        print('FAIL: build first (./tools/build-native.sh, ./tools/build-core.sh all); missing ' + ', '.join(missing), file=sys.stderr)
        return 1
    if subprocess.run(['docker', 'image', 'inspect', IMAGE], capture_output=True).returncode:
        print(f'FAIL: Docker image {IMAGE} unavailable; run ./tools/build-native.sh', file=sys.stderr)
        return 1

    root = args.output_root.resolve()
    if not root.is_relative_to(ROOT / 'build'):
        parser.error('output root must be below build/')
    run_dir = root / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    run_dir.mkdir(parents=True)
    stage = run_dir / '.rom-stage'
    stage.mkdir(mode=0o700)
    report = {'schema_version': 1, 'version': (ROOT / 'VERSION').read_text().strip(), 'seed': 848,
              'rom_source': source, 'archives': {game: path.name for game, path in archives.items()},
              'image_id': subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGE],
                                         capture_output=True, text=True).stdout.strip(),
              # The original capture refuses hosts without FMA (check-config-isolation.py).
              'host_cpu_fma': any(line.startswith('flags') and 'fma' in line.split(':', 1)[1].split()
                                  for line in Path('/proc/cpuinfo').read_text().splitlines()),
              'scenarios': [], 'limitations': [
                  'Exact equality covers the listed bounded replays only, not complete gameplay.',
                  'Generated PCM equality does not establish audible speaker output; Stunt Cycle, Indy 4, Anti-Aircraft, '
                  'Shark Jaws and Jet Fighter inherit absent DICE audio hookups.',
                  'Desktop browser behavior is checked separately.']}
    # One staged descriptor set per (game, dump variant). The default variant
    # is found by CRC in the player's archive exactly as DICE finds it; the
    # original reads that archive itself.
    variants = sorted({(item['game'], item.get('rom_variant')) for item in scenarios}, key=str)
    variant_dir = lambda variant: stage / ('default' if variant is None else f'variant{variant}')
    private_archives = {}
    try:
        for game_id, archive in archives.items():
            private_archives[(game_id, None)] = stage_descriptors(games[game_id], archive, variant_dir(None))
        for game_id, variant in variants:
            if variant is not None:
                private_archives[(game_id, variant)] = stage_descriptors(games[game_id], archives[game_id], variant_dir(variant), variant)
        shutil.copytree(ROOT / 'build/native', run_dir / 'source', symlinks=True)
        subprocess.run([sys.executable, str(ROOT / 'tools/reference/apply_adapter.py'), str(run_dir / 'source'),
                        str(ROOT / 'tools/reference')], check=True, cwd=ROOT)
        (run_dir / 'source/roms').mkdir(exist_ok=True)
        for game_id in archives:
            # Empty mountpoints for the read-only original-basename ZIP binds.
            (run_dir / 'source/roms' / games[game_id]['roms'][0]['archive']).touch()
        print(f'Building original observation adapter: {run_dir}')
        run(['docker', 'run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--user', f'{os.getuid()}:{os.getgid()}',
             '--mount', f"type=bind,source={run_dir / 'source'},target=/source", '--workdir', '/source', IMAGE,
             '/bin/bash', '-euo', 'pipefail', '-c', 'make -j "$1"', 'nocpu-rom-reference-build',
             os.environ.get('BUILD_JOBS', '2')], run_dir / 'build.log', 3600)
        def compare(scenario):
            print(f"Comparing {scenario['id']}: original DICE, portable native and Wasm", flush=True)
            try:
                variant = scenario.get('rom_variant')
                original = capture_original(run_dir, scenario, private_archives[(scenario['game'], variant)] or archives[scenario['game']],
                                            games[scenario['game']]['roms'][0]['archive'], args.timeout)
                native, wasm = replay_portable(run_dir, scenario, variant_dir(variant))
                result = evaluate(scenario, original, native, wasm)
            except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
                result = {'id': scenario['id'], 'game': scenario['game'], 'passed': False,
                          'failures': [f'{type(error).__name__}: {error}']}
            print(f"  {scenario['id']}: {'PASS' if result['passed'] else 'FAIL'}"
                  + ''.join(f'\n    {failure}' for failure in result['failures']), flush=True)
            return result
        # Scenarios are independent (each writes only below its own directory);
        # NOCPU_ROM_COMPARE_JOBS runs that many at once. The report keeps the
        # manifest order.
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            report['scenarios'] = list(pool.map(compare, scenarios))
        # The registered-game ABI contract, with the ROM-backed games' staged
        # default descriptors (each registered ROM game of this run).
        if any(registered_rom_game(game_id) for game_id, _ in variants):
            print('Registered-game ABI probe with the staged ROM descriptors')
            probe = run_dir / 'abi-games.json'
            result = subprocess.run(['node', str(ROOT / 'tools/probe-core-games.mjs'), '--module', str(ROOT / 'build/core/wasm/nocpu.js'),
                                     '--output', str(probe), '--rom-dir', str(variant_dir(None))],
                                    cwd=ROOT, capture_output=True, text=True, timeout=3600)
            summary = json.loads(probe.read_text()) if probe.is_file() else {}
            report['abi_probe'] = {'passed': result.returncode == 0 and summary.get('passed') is True,
                                   'passed_checks': summary.get('passed_checks'), 'completed_checks': summary.get('completed_checks'),
                                   'rom_games': summary.get('rom_games_checked'), 'rom_games_not_staged': summary.get('rom_games_skipped'),
                                   'error': summary.get('error')}
            print(f"  ABI probe: {'PASS' if report['abi_probe']['passed'] else 'FAIL'}; {result.stdout.strip()}")
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        for placeholder in (run_dir / 'source/roms').glob('*.zip'):
            placeholder.unlink()
    report['passed'] = bool(report['scenarios']) and all(item['passed'] for item in report['scenarios']) \
        and report.get('abi_probe', {'passed': True})['passed']
    (run_dir / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if report['passed']:
        (root / 'latest.txt').write_text(f'{run_dir}\n')
    print(f"ROM-backed original/native/Wasm comparison: {'PASS' if report['passed'] else 'FAIL'}; {run_dir / 'report.json'}")
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
