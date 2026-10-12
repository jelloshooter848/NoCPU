#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Bind a five-file Wasm transfer to the exact clean checkout; no test attestation."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import shutil
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
TRANSFER_FILES = tuple('build/core/wasm/' + name for name in
                       ('nocpu.js', 'nocpu.wasm', 'build-provenance.json', 'dependencies.mk', 'linker.map'))
REQUIRED_INPUTS = {'core/nocpu.h', 'core/api.cpp', 'core/port_hooks.h',
                   'tools/prepare-core.py', 'tools/build-core.sh', 'VERSION', 'tests/source-manifest.json'}


def checked_file(root: Path, name: str) -> Path:
    relative = PurePosixPath(name)
    if '\\' in name or '\0' in name or relative.is_absolute() or '..' in relative.parts or relative.as_posix() != name:
        raise ValueError('Unsafe transfer/provenance path')
    path = root / name
    if any(root.joinpath(*relative.parts[:index]).is_symlink() for index in range(1, len(relative.parts) + 1)):
        raise ValueError('Transfer/provenance symlink is forbidden')
    if not path.is_file():
        raise ValueError('Missing transfer/provenance file: ' + name)
    return path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def source_identity(root: Path) -> dict:
    def git(*args: str) -> str:
        return subprocess.run(['git', *args], cwd=root, check=True,
                              capture_output=True, text=True).stdout.strip()
    if git('status', '--porcelain', '--untracked-files=all'):
        raise ValueError('Core transfer requires a clean committed checkout')
    version = checked_file(root, 'VERSION').read_text().strip()
    # SemVer core with an optional pre-release suffix (0.2.0-rc.1), as tools/release_check.py accepts.
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?', version):
        raise ValueError('Invalid source version')
    return {'git_head': git('rev-parse', 'HEAD'), 'git_tree': git('rev-parse', 'HEAD^{tree}'),
            'version': version, 'dirty': False}


def validate_provenance(root: Path) -> None:
    provenance = json.loads(checked_file(root, 'build/core/wasm/build-provenance.json').read_text())
    output_names = {PurePosixPath(name).name for name in TRANSFER_FILES if not name.endswith('/build-provenance.json')}
    outputs = provenance.get('outputs')
    if provenance.get('target') != 'wasm' or not isinstance(outputs, dict) or set(outputs) != output_names:
        raise ValueError('Unexpected Wasm provenance target/output inventory')
    for name, digest in provenance['outputs'].items():
        if sha256(checked_file(root, 'build/core/wasm/' + name)) != digest:
            raise ValueError('Wasm provenance output mismatch: ' + name)
    required = REQUIRED_INPUTS | {path.relative_to(root).as_posix()
                                 for path in (root / 'core/platform').rglob('*') if path.is_file()}
    inputs = provenance.get('inputs')
    if not isinstance(inputs, dict) or not required.issubset(inputs):
        raise ValueError('Wasm provenance omits required source inputs')
    for name, digest in inputs.items():
        relative = PurePosixPath(name)
        if '\\' in name or '\0' in name or relative.is_absolute() or '..' in relative.parts or relative.as_posix() != name:
            raise ValueError('Unsafe Wasm source input')
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid Wasm source input hash')
        if name.startswith('build/core/source/'):
            # The consumer has no generated build copy. Packaging must still
            # prepare fresh source and compare this entire generated inventory.
            continue
        if sha256(checked_file(root, name)) != digest:
            raise ValueError('Stale Wasm source input: ' + name)


def make_manifest(root: Path) -> dict:
    identity = source_identity(root)
    validate_provenance(root)
    files = []
    for name in TRANSFER_FILES:
        path = checked_file(root, name)
        files.append({'path': name, 'sha256': sha256(path), 'bytes': path.stat().st_size})
    return {'schema_version': 1, 'kind': 'core-runtime-transfer', 'source_binding': identity,
            'files': files, 'scope': 'Transfer continuity only; no gameplay, license or test attestation.'}


def verify_manifest(root: Path, manifest: dict) -> dict:
    if manifest.get('schema_version') != 1 or manifest.get('kind') != 'core-runtime-transfer':
        raise ValueError('Unsupported core transfer manifest')
    if manifest.get('source_binding') != source_identity(root):
        raise ValueError('Core transfer checkout identity mismatch')
    records = manifest.get('files')
    if not isinstance(records, list) or len(records) != len(TRANSFER_FILES):
        raise ValueError('Incomplete core transfer inventory')
    names = [record.get('path') for record in records if isinstance(record, dict)]
    if len(names) != len(records) or not all(isinstance(name, str) for name in names) or set(names) != set(TRANSFER_FILES):
        raise ValueError('Unexpected or duplicate core transfer paths')
    for record in records:
        path = checked_file(root, record['path'])
        if type(record.get('bytes')) is not int or record['bytes'] != path.stat().st_size or record.get('sha256') != sha256(path):
            raise ValueError('Core transfer bytes/hash mismatch: ' + record['path'])
    validate_provenance(root)
    return {'verified_files': len(records), 'source_binding': manifest['source_binding'],
            'scope': 'Transfer continuity only; fresh package source/provenance checks remain required.'}


def install_runtime(root: Path, manifest: dict) -> dict:
    """Stage only verified JS/Wasm for Vite; preserve or reject existing bytes."""
    result = verify_manifest(root, manifest)
    destination = root / 'web/public/core'
    for name in ('web', 'web/public', 'web/public/core'):
        path = root / name
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError('Vite core destination must use ordinary directories')
    records = {Path(record['path']).name: record for record in manifest['files']
               if Path(record['path']).name in ('nocpu.js', 'nocpu.wasm')}
    if destination.exists():
        if any(path.name not in records for path in destination.iterdir()):
            raise ValueError('Unexpected existing Vite core destination member')
        for name, record in records.items():
            path = destination / name
            if path.is_symlink() or (path.exists() and
                    (not path.is_file() or path.stat().st_size != record['bytes'] or sha256(path) != record['sha256'])):
                raise ValueError('Stale or nonregular Vite core destination')
    destination.mkdir(parents=True, exist_ok=True)
    for name, record in records.items():
        target = destination / name
        if not target.exists():
            with checked_file(root, record['path']).open('rb') as source, target.open('xb') as output:
                shutil.copyfileobj(source, output)
        if sha256(checked_file(root, 'web/public/core/' + name)) != record['sha256']:
            raise ValueError('Installed Vite core bytes changed')
    return {**result, 'installed_runtime_files': len(records),
            'runtime_destination': 'web/public/core', 'core_rebuilt': False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--write', type=Path)
    action.add_argument('--verify', type=Path)
    parser.add_argument('--install-runtime', action='store_true',
                        help='After verification, stage the exact tested JS/Wasm for Vite without rebuilding')
    args = parser.parse_args()
    if args.install_runtime and not args.verify:
        parser.error('--install-runtime requires --verify')
    if args.write:
        manifest = make_manifest(ROOT)
        destination = args.write.resolve()
        if not destination.is_relative_to(ROOT / 'build'):
            raise ValueError('Transfer manifest output must remain under ignored build/')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
        print(json.dumps({'created_files': len(manifest['files']), 'source_binding': manifest['source_binding']}))
    else:
        manifest = json.loads(args.verify.read_text())
        print(json.dumps((install_runtime if args.install_runtime else verify_manifest)(ROOT, manifest), sort_keys=True))


if __name__ == '__main__':
    main()
