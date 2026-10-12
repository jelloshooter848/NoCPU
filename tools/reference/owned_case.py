# SPDX-License-Identifier: GPL-3.0-or-later
"""Bounded cleanup and final evidence commit for owned validation processes."""
import subprocess


def stop_owned_process(process, grace_seconds=20, reap_seconds=20):
    if process.poll() is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    try:
        return process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        return process.wait(timeout=reap_seconds)


def commit_case_pass(item, evidence, *, elapsed_seconds, wall_bound_seconds,
                     used_bytes, budget_bytes, free_bytes, reserve_bytes):
    """Validate closure before mutating a running case to a passed case."""
    if item.get('status') != 'running':
        raise RuntimeError('Case is not running at evidence closure')
    if not 0 <= elapsed_seconds <= wall_bound_seconds:
        raise RuntimeError('Whole case artifact closure wall bound')
    if not 0 <= used_bytes <= budget_bytes or free_bytes < reserve_bytes:
        raise RuntimeError('Whole case artifact closure capacity bound')
    if 'status' in evidence:
        raise RuntimeError('Evidence cannot assign case status')
    item.update(evidence)
    item['status'] = 'passed_exact_media'
