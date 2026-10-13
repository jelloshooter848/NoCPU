#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Decide whether CI must run the original/native/Wasm core comparisons.

Deliberately small and conservative. The comparisons are skipped only when
every changed file (relative to the merge base) is documentation or browser UI
code, which no capture, replay or comparison reads. Anything else, an unknown
base, a release or a manual run runs everything. The build, the repository
checks, the unit tests and the browser matrix always run.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys

# Paths that cannot change a core comparison result. Keep this list short.
DOCS = ('docs/*', 'bug-reports/*')
UI = ('web/*', 'tests/browser/*')


def kind(path: str) -> str | None:
    """'docs', 'web UI', or None for anything that may affect the core."""
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in DOCS) or ('/' not in path and path.endswith('.md')):
        return 'docs'
    if any(fnmatch.fnmatchcase(path, pattern) for pattern in UI):
        return 'web UI'
    return None


def classify(paths: list[str]) -> tuple[bool, str]:
    """Return (run_core, reason) for a list of changed repository paths."""
    if not paths:
        return True, 'no changed files could be listed; running everything'
    other = [path for path in paths if kind(path) is None]
    if other:
        shown = ', '.join(other[:5]) + (f' and {len(other) - 5} more' if len(other) > 5 else '')
        return True, f'core-relevant changes: {shown}'
    kinds = sorted({kind(path) for path in paths})
    return False, f'only {" and ".join(kinds)} files changed ({len(paths)} files)'


def git(*args: str) -> str:
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def changed_paths(base: str, head: str) -> list[str]:
    merge_base = git('merge-base', base, head).strip()
    return [line for line in git('diff', '--name-only', '--no-renames', merge_base, head).splitlines() if line]


def decide(event: str, release: bool, base: str, head: str) -> tuple[bool, str, list[str]]:
    if release:
        return True, 'release run: the full comparison always runs', []
    if event not in ('pull_request', 'push'):
        return True, f'{event or "unknown"} event: running everything', []
    if not base or set(base) == {'0'} or not head:
        return True, 'no base commit to diff against (new branch or missing history): running everything', []
    try:
        paths = changed_paths(base, head)
    except (subprocess.CalledProcessError, OSError) as error:
        return True, f'cannot diff {base[:12]}..{head[:12]} ({error}); running everything', []
    run, reason = classify(paths)
    return run, reason, paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event', default=os.environ.get('GITHUB_EVENT_NAME', ''))
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--base', default='', help='pull request base SHA, or the pushed range start')
    parser.add_argument('--head', default='', help='commit being verified')
    args = parser.parse_args()
    run, reason, paths = decide(args.event, args.release, args.base, args.head)
    print(json.dumps({'core_comparisons': run, 'reason': reason, 'changed_files': paths}, indent=2))
    message = ('Core comparisons: RUN — ' if run else 'Core comparisons: SKIPPED — ') + reason
    print(message)
    if output := os.environ.get('GITHUB_OUTPUT'):
        with open(output, 'a') as stream:
            stream.write(f'core={"true" if run else "false"}\n')
    if summary := os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(summary, 'a') as stream:
            stream.write(f'**{message}.**\n\n'
                         + ('' if run else 'The original/native/Wasm comparisons were skipped by scope, not passed: '
                            'no file they read changed. Build, repository checks, unit tests and the browser matrix ran.\n'))
    if not run:
        print(f'::notice title=Core comparisons skipped::{reason}; skipped by scope, not passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
