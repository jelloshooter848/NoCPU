#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Decide whether CI must run the original/native/Wasm core comparisons.

Deliberately small and decided by content, not by a push or PR diff. The
"core hash" is a SHA-256 over every tracked path, mode and blob of a commit
except documentation and browser UI files, which no capture, replay or
comparison reads. After core-compare passes, CI saves a marker cache entry
nocpu-compared-<core hash>. A later run skips the comparisons only when that
marker exists for its own core hash, so a docs-only commit that follows a
cancelled or failed core change still runs them. A release, a missing marker
or any error runs everything. The build, the repository checks, the unit tests
and the browser matrix always run.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import os
import subprocess
import sys

# Paths that cannot change a core comparison result. Keep this list short.
DOCS = ('docs/*', 'bug-reports/*')
UI = ('web/*', 'tests/browser/*')
MARKER_PREFIX = 'nocpu-compared-'


def kind(path: str) -> str | None:
    """'docs', 'web UI', or None for anything that may affect the core."""
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in DOCS) or ('/' not in path and path.endswith('.md')):
        return 'docs'
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in UI):
        return 'web UI'
    return None


def core_hash(ref: str = 'HEAD', cwd: str | None = None) -> str:
    """Hash of the commit's tree with docs and web UI paths left out."""
    listing = subprocess.run(['git', 'ls-tree', '-r', '-z', '--full-tree', ref], cwd=cwd,
                             check=True, capture_output=True).stdout
    digest = hashlib.sha256(b'nocpu-core-tree-v1\n')
    for entry in listing.split(b'\0'):
        if not entry:
            continue
        meta, path = entry.split(b'\t', 1)
        if kind(path.decode('utf-8', 'surrogateescape')) is None:
            digest.update(meta + b'\t' + path + b'\0')
    return digest.hexdigest()


def decide(release: bool, marker_hit: bool, digest: str) -> tuple[bool, str]:
    if release:
        return True, 'release run: the full comparison always runs'
    if not digest:
        return True, 'no core hash: running everything'
    if marker_hit:
        return False, (f'core comparisons already passed for this exact non-docs, non-UI content '
                       f'(marker {MARKER_PREFIX}{digest[:16]}); only docs or web UI files differ')
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
    deciding = commands.add_parser('decide', help='decide from the core hash and its marker lookup')
    deciding.add_argument('--hash', default='')
    deciding.add_argument('--marker-hit', default='false', help="'true' when the marker cache entry exists")
    deciding.add_argument('--release', default='false', help="'true' for a release run")
    args = parser.parse_args()
    if args.command == 'hash':
        digest = core_hash(args.ref)
        print(digest)
        write('GITHUB_OUTPUT', f'core_hash={digest}\n')
        return 0
    run, reason = decide(args.release == 'true', args.marker_hit == 'true', args.hash)
    message = ('Core comparisons: RUN — ' if run else 'Core comparisons: SKIPPED — ') + reason
    print(message)
    write('GITHUB_OUTPUT', f'core={"true" if run else "false"}\n')
    write('GITHUB_STEP_SUMMARY', f'**{message}.**\n\n' + ('' if run else
          'The original/native/Wasm comparisons were skipped, not passed, for this run: an earlier run passed them '
          'for identical content outside docs/ and web UI files. Build, repository checks, unit tests and the '
          'browser matrix ran.\n'))
    if not run:
        print(f'::notice title=Core comparisons skipped::{reason}; skipped, not passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
