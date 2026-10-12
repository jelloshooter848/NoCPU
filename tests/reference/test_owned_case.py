# SPDX-License-Identifier: GPL-3.0-or-later
import os
from pathlib import Path
import subprocess
import selectors
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/reference'))
from owned_case import commit_case_pass, stop_owned_process


class OwnedCaseTests(unittest.TestCase):
    def test_ignoring_term_child_is_killed_and_reaped(self):
        child = subprocess.Popen([sys.executable, '-c',
            'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); '
            'print("ready",flush=True); time.sleep(60)'], stdout=subprocess.PIPE, text=True)
        try:
            with selectors.DefaultSelector() as ready:
                ready.register(child.stdout, selectors.EVENT_READ)
                self.assertTrue(ready.select(timeout=2), 'Owned child did not become ready')
            self.assertEqual(child.stdout.readline().strip(), 'ready')
            self.assertEqual(stop_owned_process(child, grace_seconds=.1, reap_seconds=2), -9)
            self.assertEqual(child.poll(), -9)
            with self.assertRaises(ChildProcessError):
                os.waitpid(child.pid, os.WNOHANG)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=2)
            child.stdout.close()

    def test_final_check_failure_never_commits_pass(self):
        baseline = dict(elapsed_seconds=1, wall_bound_seconds=10, used_bytes=2,
                        budget_bytes=3, free_bytes=5, reserve_bytes=4)
        for change in (dict(elapsed_seconds=11), dict(used_bytes=4), dict(free_bytes=3)):
            item = {'name': 'owned', 'status': 'running'}
            with self.assertRaises(RuntimeError):
                commit_case_pass(item, {'artifacts': {}}, **(baseline | change))
            self.assertEqual(item, {'name': 'owned', 'status': 'running'})

    def test_status_injection_and_nonrunning_case_rejected(self):
        bounds = dict(elapsed_seconds=1, wall_bound_seconds=10, used_bytes=2,
                      budget_bytes=3, free_bytes=5, reserve_bytes=4)
        item = {'status': 'running'}
        with self.assertRaises(RuntimeError):
            commit_case_pass(item, {'status': 'passed_exact_media'}, **bounds)
        self.assertEqual(item['status'], 'running')
        with self.assertRaises(RuntimeError):
            commit_case_pass({'status': 'failed'}, {}, **bounds)

    def test_pass_committed_after_all_bounds(self):
        item = {'status': 'running'}
        commit_case_pass(item, {'artifacts': {'retained': 'hash'}}, elapsed_seconds=1,
                         wall_bound_seconds=10, used_bytes=2, budget_bytes=3,
                         free_bytes=5, reserve_bytes=4)
        self.assertEqual(item['status'], 'passed_exact_media')
        self.assertEqual(item['artifacts'], {'retained': 'hash'})


if __name__ == '__main__':
    unittest.main()
