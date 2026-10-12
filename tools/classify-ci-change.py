#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Select lightweight checks only for additive/plain Markdown documentation diffs."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
ROOT_DOCS = {'README.md', 'CHANGELOG.md', 'AGENTS.md'}


def classify_changes(event: str, changes: list[tuple[str, str]]) -> bool:
    if event not in {'push', 'pull_request'} or not changes:
        return False
    for status, name in changes:
        path = PurePosixPath(name)
        if status not in {'A', 'M'} or '..' in path.parts or path.is_absolute():
            return False
        if name in ROOT_DOCS:
            continue
        if len(path.parts) == 2 and path.parts[0] == 'docs' and path.suffix == '.md':
            continue
        return False
    return True


def changed_paths(root: Path, base: str, head: str) -> list[tuple[str, str]]:
    # Disabling rename detection retains both deletion and addition. A rename
    # from runtime source into an allowed doc must never hide the source removal.
    result = subprocess.run(['git', 'diff', '--no-renames', '--name-status', '-z',
                             base, head, '--'], cwd=root, check=True, capture_output=True)
    fields = result.stdout.decode('utf-8', errors='strict').split('\0')
    if fields[-1] != '' or (len(fields) - 1) % 2:
        raise ValueError('Malformed Git change list')
    return list(zip(fields[:-1:2], fields[1:-1:2]))


def ordinary_documentation_blobs(root: Path, head: str, names: list[str]) -> bool:
    result = subprocess.run(['git', 'ls-tree', '-z', head, '--', *names], cwd=root,
                            check=True, capture_output=True)
    entries = result.stdout.decode('utf-8', errors='strict').split('\0')
    found = set()
    for entry in entries:
        if not entry:
            continue
        metadata, name = entry.split('\t', 1)
        mode, kind, _ = metadata.split(' ', 2)
        # Narrative docs must be ordinary non-executable files. A new or
        # modified symlink/submodule is not a lightweight documentation edit.
        if mode != '100644' or kind != 'blob' or name not in names:
            return False
        found.add(name)
    return found == set(names)


def classify_repository(root: Path, event: str, base: str, head: str, ref: str = '') -> dict:
    result = {'documentation_only': False, 'reason': 'full verification required', 'changes': []}
    if event not in {'push', 'pull_request'}:
        result['reason'] = 'manual, Pages and tagged release runs require full verification'
        return result
    if event == 'push' and not ref.startswith('refs/heads/'):
        result['reason'] = 'tagged or unidentified push requires full verification'
        return result
    if not re.fullmatch(r'[0-9a-f]{40,64}', base) or set(base) == {'0'}:
        result['reason'] = 'no usable base identity'
        return result
    if not re.fullmatch(r'[0-9a-f]{40,64}', head):
        raise ValueError('Invalid checked-out head identity')
    actual = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, check=True,
                            capture_output=True, text=True).stdout.strip()
    if actual != head:
        raise ValueError('Requested head differs from the actual checkout')
    if subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=root,
                      check=True, capture_output=True).stdout:
        result['reason'] = 'checkout has uncommitted changes'
        return result
    try:
        changes = changed_paths(root, base, head)
    except subprocess.CalledProcessError:
        result['reason'] = 'base identity is unavailable; no shortcut permitted'
        return result
    result['changes'] = [{'status': status, 'path': name} for status, name in changes]
    result['documentation_only'] = classify_changes(event, changes)
    if result['documentation_only'] and not ordinary_documentation_blobs(root, head, [name for _, name in changes]):
        result['documentation_only'] = False
        result['reason'] = 'documentation entries are not ordinary non-executable blobs'
    if result['documentation_only']:
        result['reason'] = 'only added/modified allowlisted Markdown documentation'
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event', required=True)
    parser.add_argument('--ref', required=True)
    parser.add_argument('--base', default='')
    parser.add_argument('--head', required=True)
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args()
    result = classify_repository(ROOT, args.event, args.base, args.head, args.ref)
    print(json.dumps(result, sort_keys=True))
    if args.github_output:
        with args.github_output.open('a') as output:
            output.write('documentation_only=' + str(result['documentation_only']).lower() + '\n')


if __name__ == '__main__':
    main()
