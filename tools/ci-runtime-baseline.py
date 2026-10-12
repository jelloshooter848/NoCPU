#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Verify a prior FULL CI core artifact before a narrative-only shortcut."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ('nocpu.js', 'nocpu.wasm', 'build-provenance.json', 'dependencies.mk', 'linker.map')
REPOSITORY = 'jelloshooter848/NoCPU'


def verify(root: Path, base: str, run: dict, jobs: dict, artifact: dict, archive: Path) -> dict:
    if subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=root,
                      check=True, capture_output=True).stdout:
        raise ValueError('Narrative baseline requires a clean checkout')
    if not re.fullmatch(r'[0-9a-f]{40}', base):
        raise ValueError('Invalid baseline commit')
    if (run.get('head_sha') != base or run.get('head_branch') != 'main'
            or run.get('path') != '.github/workflows/ci.yml'
            or run.get('event') not in {'push', 'workflow_dispatch'}
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('repository', {}).get('full_name') != REPOSITORY):
        raise ValueError('Baseline is not a successful exact-main CI run')
    run_id, attempt = run.get('id'), run.get('run_attempt')
    if type(run_id) is not int or type(attempt) is not int or attempt < 1:
        raise ValueError('Missing baseline run/attempt identity')
    for name in ('verify / core-reference', 'verify / browser'):
        matching = [job for job in jobs.get('jobs', []) if job.get('name') == name]
        if len(matching) != 1:
            raise ValueError('Missing or duplicate FULL job')
        job = matching[0]
        if (job.get('run_id') != run_id or job.get('run_attempt') != attempt
                or job.get('head_sha') != base or job.get('status') != 'completed'
                or job.get('conclusion') != 'success'):
            raise ValueError('Skipped, failed or mixed-source FULL job')
    if (artifact.get('name') != f'core-runtime-transfer-{base}-{attempt}'
            or artifact.get('expired') is not False
            or type(artifact.get('id')) is not int
            or artifact.get('workflow_run', {}).get('id') != run_id
            or artifact.get('workflow_run', {}).get('head_sha') != base):
        raise ValueError('Stale, expired or unrelated baseline artifact')
    digest = 'sha256:' + hashlib.sha256(archive.read_bytes()).hexdigest()
    if artifact.get('digest') != digest:
        raise ValueError('Baseline download digest mismatch')
    with zipfile.ZipFile(archive) as zipped:
        expected = {'core-transfer.json'} | {'wasm/' + name for name in FILES}
        members = zipped.infolist()
        if len(members) != len(expected) or {m.filename for m in members} != expected:
            raise ValueError('Unexpected baseline artifact members')
        if any(m.is_dir() or (m.external_attr >> 16) & 0o170000 not in {0, 0o100000} for m in members):
            raise ValueError('Baseline artifact is not regular files')
        payloads = {m.filename: zipped.read(m) for m in members}
    manifest = json.loads(payloads['core-transfer.json'])
    tree = subprocess.run(['git', 'rev-parse', base + '^{tree}'], cwd=root,
                          check=True, capture_output=True, text=True).stdout.strip()
    version = subprocess.run(['git', 'show', base + ':VERSION'], cwd=root,
                             check=True, capture_output=True, text=True).stdout.strip()
    identity = {'git_head': base, 'git_tree': tree, 'version': version, 'dirty': False}
    if manifest.get('schema_version') != 1 or manifest.get('kind') != 'core-runtime-transfer' or manifest.get('source_binding') != identity:
        raise ValueError('Baseline source identity mismatch')
    records = manifest.get('files')
    expected_paths = {'build/core/wasm/' + name for name in FILES}
    if not isinstance(records, list) or len(records) != 5 or {r.get('path') for r in records} != expected_paths:
        raise ValueError('Unexpected baseline transfer inventory')
    for record in records:
        payload = payloads['wasm/' + record['path'].rsplit('/', 1)[1]]
        if type(record.get('bytes')) is not int or record['bytes'] != len(payload) or record.get('sha256') != hashlib.sha256(payload).hexdigest():
            raise ValueError('Baseline transfer bytes/hash mismatch')
    provenance = json.loads(payloads['wasm/build-provenance.json'])
    if provenance.get('target') != 'wasm' or set(provenance.get('outputs', {})) != set(FILES) - {'build-provenance.json'}:
        raise ValueError('Unexpected baseline provenance')
    for name, sha in provenance['outputs'].items():
        if hashlib.sha256(payloads['wasm/' + name]).hexdigest() != sha:
            raise ValueError('Baseline provenance output mismatch')
    return {'source_binding': identity, 'full_run_id': run_id, 'run_attempt': attempt,
            'artifact_id': artifact.get('id'), 'artifact_digest': digest,
            'core_files': records,
            'scope': 'Prior fixture-free FULL CI continuity; no private-ROM or device attestation.'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    for name in ('run', 'jobs', 'artifact', 'archive'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = verify(ROOT, args.base, json.loads(args.run.read_text()),
                    json.loads(args.jobs.read_text()), json.loads(args.artifact.read_text()), args.archive)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
