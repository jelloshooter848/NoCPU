#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Decide whether CI must run the original/native/Wasm core comparisons.

Deliberately small and decided by content, not by a push or PR diff. The
"core hash" is a SHA-256 over every tracked path, mode and blob of a commit
except files no capture, replay or comparison reads: documentation (every .md
file), browser UI, distribution packaging and license records, and release
metadata (VERSION and the release records), with the version field
left out of package.json and package-lock.json. It also covers the runner's
native C++ compiler, the one compare input not pinned in the repository.

After core-compare passes, CI uploads a marker artifact nocpu-compared-<core
hash>. Artifacts, unlike Actions caches, are visible to every run of the
repository whatever its branch or pull request, so content compared on the
working branch or in a pull request is found again by the merge push to main
and by the next release pull request. A later run skips the comparisons only
when a marker exists for its own core hash, uploaded by a run of this
repository (never a fork). A docs-only commit that follows a cancelled or
failed core change therefore still runs them. A release follows the same rule:
it skips them only for core content a run already compared on the same host
compiler. A missing marker or any error runs everything. The build, the
repository checks, the unit tests, packaging and the browser matrix always run.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from typing import Callable

# Paths that cannot change a core comparison result. Keep these lists short:
# anything not listed is hashed, so a forgotten input runs the comparisons.
DOCS = ('docs/*', 'bug-reports/*', '*.md')
UI = ('web/*', 'tests/browser/*', 'tests/test-web-foundations.cjs')
# Distribution packaging and license records. The core comparison never reads
# them; the package, browser and release jobs that do always run.
PACKAGING = ('tools/package-web.py', 'tools/package-release.py', 'tests/test-web-release.py',
             'tests/test-release-tools.py', 'tests/license-audit.json', 'LICENSE')
# Release records a release commit rewrites. VERSION is not compiled into the
# native or Wasm core (tools/build-core.sh only records its digest in the build
# provenance) and the comparisons only copy it into their reports as a label.
RELEASE_METADATA = ('VERSION', 'tests/release-readiness.json', 'tests/browser-license-audit.json')
# Hashed without their version field, which nothing but the release tooling reads.
VERSION_FIELD_FILES = ('package.json', 'package-lock.json')
MARKER_PREFIX = 'nocpu-compared-'
HASH_PATTERN = re.compile(r'[0-9a-f]{64}')


def kind(path: str) -> str | None:
    """'docs', 'web UI', 'packaging', 'release metadata', or None for anything that may affect the core."""
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in DOCS):
        return 'docs'
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in UI):
        return 'web UI'
    if path in PACKAGING:
        return 'packaging'
    if path in RELEASE_METADATA:
        return 'release metadata'
    return None


def without_version(path: str, blob: bytes) -> bytes:
    """package.json/package-lock.json with the project version removed, canonically encoded."""
    try:
        data = json.loads(blob)
    except ValueError:
        return blob
    if not isinstance(data, dict):
        return blob
    data.pop('version', None)
    packages = data.get('packages') if path == 'package-lock.json' else None
    root = packages.get('') if isinstance(packages, dict) else None
    if isinstance(root, dict):
        root.pop('version', None)
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def tree_hash(ref: str = 'HEAD', cwd: str | None = None) -> str:
    """Hash of the commit's tree without docs, web UI, packaging and release metadata."""
    listing = subprocess.run(['git', 'ls-tree', '-r', '-z', '--full-tree', ref], cwd=cwd,
                             check=True, capture_output=True).stdout
    digest = hashlib.sha256(b'nocpu-core-tree-v2\n')
    for entry in listing.split(b'\0'):
        if not entry:
            continue
        meta, path = entry.split(b'\t', 1)
        name = path.decode('utf-8', 'surrogateescape')
        if kind(name) is not None:
            continue
        if name in VERSION_FIELD_FILES:
            mode, kind_, blob_id = meta.split(b' ')
            blob = subprocess.run(['git', 'cat-file', 'blob', blob_id.decode()], cwd=cwd,
                                  check=True, capture_output=True).stdout
            meta = mode + b' ' + kind_ + b' normalized:' + hashlib.sha256(without_version(name, blob)).hexdigest().encode()
        digest.update(meta + b'\t' + path + b'\0')
    return digest.hexdigest()


def host_identity() -> str:
    """The runner's native C++ compiler, which builds the native runner under comparison."""
    compiler = os.environ.get('CXX') or 'g++'
    try:
        result = subprocess.run([compiler, '--version'], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return f'{compiler}: unavailable'
    first = result.stdout.splitlines()[0] if result.returncode == 0 and result.stdout else 'unavailable'
    return f'{compiler}: {first}'


def core_hash(ref: str = 'HEAD', cwd: str | None = None, host: str = '') -> str:
    """The scope key: the tree hash bound to the host compiler identity."""
    return hashlib.sha256(f'nocpu-core-scope-v2\n{tree_hash(ref, cwd)}\n{host}\n'.encode()).hexdigest()


def find_marker(digest: str, fetch: Callable[[str], dict], api: str, repository: str) -> tuple[bool, str]:
    """Look for an unexpired marker artifact for digest uploaded by a run of this repository."""
    if not HASH_PATTERN.fullmatch(digest):
        return False, 'no valid core hash to look up'
    name = MARKER_PREFIX + digest
    query = urllib.parse.urlencode({'name': name, 'per_page': 100})
    data = fetch(f'{api}/repos/{repository}/actions/artifacts?{query}')
    rejected = 0
    for artifact in data.get('artifacts') or ():
        if not isinstance(artifact, dict) or artifact.get('name') != name or artifact.get('expired') is not False:
            continue
        run = artifact.get('workflow_run') or {}
        repo_id = run.get('repository_id')
        if repo_id is None or run.get('head_repository_id') != repo_id:
            rejected += 1  # uploaded by a fork pull request run: never trusted
            continue
        return True, (f"marker {name[:len(MARKER_PREFIX) + 16]} from run {run.get('id')} "
                      f"({run.get('head_branch')} {str(run.get('head_sha') or '')[:12]})")
    suffix = f'; ignored {rejected} uploaded by fork runs' if rejected else ''
    return False, f'no marker artifact {name[:len(MARKER_PREFIX) + 16]}{suffix}'


def github_fetch(token: str) -> Callable[[str], dict]:
    def fetch(url: str) -> dict:
        request = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github+json', 'Authorization': f'Bearer {token}',
            'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    return fetch


def decide(release: bool, marker_hit: bool, digest: str) -> tuple[bool, str]:
    # A release reuses a passing comparison of byte-identical core content on
    # the same host compiler, like any other run (owner decision 2026-10-17).
    if not digest:
        return True, 'no core hash: running everything'
    if marker_hit:
        return False, (f'{"release run: " if release else ""}core comparisons already passed for this exact '
                       f'content outside docs, web UI, packaging and release metadata '
                       f'(marker {MARKER_PREFIX}{digest[:16]})')
    return True, f'no passing comparison recorded for core content {digest[:16]}'


def write(name: str, text: str) -> None:
    if path := os.environ.get(name):
        with open(path, 'a') as stream:
            stream.write(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    hashing = commands.add_parser('hash', help='print (and output) the core hash of a commit')
    hashing.add_argument('--ref', default='HEAD')
    hashing.add_argument('--host', default=None, help='host compiler identity (default: `$CXX --version`)')
    looking = commands.add_parser('lookup', help='find a marker artifact for a core hash (GitHub API)')
    looking.add_argument('--hash', default='')
    deciding = commands.add_parser('decide', help='decide from the core hash and its marker lookup')
    deciding.add_argument('--hash', default='')
    deciding.add_argument('--marker-hit', default='false', help="'true' when the marker exists")
    deciding.add_argument('--release', default='false', help="'true' for a release run")
    args = parser.parse_args()
    if args.command == 'hash':
        host = host_identity() if args.host is None else args.host
        tree = tree_hash(args.ref)
        digest = core_hash(args.ref, host=host)
        print(f'tree hash (outside docs, web UI, packaging, release metadata): {tree}', file=sys.stderr)
        print(f'host compiler: {host}', file=sys.stderr)
        print(digest)
        write('GITHUB_OUTPUT', f'core_hash={digest}\n')
        return 0
    if args.command == 'lookup':
        try:
            hit, reason = find_marker(args.hash, github_fetch(os.environ['GITHUB_TOKEN']),
                                      os.environ.get('GITHUB_API_URL', 'https://api.github.com'),
                                      os.environ['GITHUB_REPOSITORY'])
        except Exception as error:  # any lookup failure runs the comparisons
            hit, reason = False, f'marker lookup failed ({type(error).__name__}: {error})'
        print(('Marker found: ' if hit else 'Marker not found: ') + reason)
        write('GITHUB_OUTPUT', f'marker_hit={"true" if hit else "false"}\n')
        return 0
    run, reason = decide(args.release == 'true', args.marker_hit == 'true', args.hash)
    message = ('Core comparisons: RUN — ' if run else 'Core comparisons: SKIPPED — ') + reason
    print(message)
    write('GITHUB_OUTPUT', f'core={"true" if run else "false"}\n')
    write('GITHUB_STEP_SUMMARY', f'**{message}.**\n\n' + ('' if run else
          'The original/native/Wasm comparisons were skipped, not passed, for this run: an earlier run passed them '
          'for identical content outside docs, web UI files, packaging and release metadata. Build, repository '
          'checks, unit tests, packaging and the browser matrix ran.\n'))
    if not run:
        print(f'::notice title=Core comparisons skipped::{reason}; skipped, not passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
