#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The optional manual desktop checks in docs/ACCEPTANCE.md: supplementary, but complete."""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ManualCheckTests(unittest.TestCase):
    def test_manual_rows_are_supplementary_but_complete(self):
        check_spec = importlib.util.spec_from_file_location('repo_check', ROOT / 'tools/check.py')
        check = importlib.util.module_from_spec(check_spec)
        check_spec.loader.exec_module(check)
        text = (ROOT / 'docs/ACCEPTANCE.md').read_text()
        good = '| 2026-10-20 | `v0.1.3` | Firefox 147.0.2 | Windows 11 24H2 | Pong, Breakout | pass | — |\n'
        bad = ['| 2026-10-20 | `v0.1.3` | Firefox | Windows 11 | Pong | pass | — |\n',
               '| 20 Oct | `v0.1.3` | Firefox 147.0.2 | Windows 11 | Pong | pass | — |\n',
               '| 2026-10-20 | `v0.1.3` | Firefox 147.0.2 | Windows 11 | Pong | great | — |\n',
               '| 2026-10-20 | `v0.1.3` | Firefox 147.0.2 |  | Pong | pass | — |\n']
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'docs').mkdir()
            def write(row):
                (root / 'docs/ACCEPTANCE.md').write_text(text.replace('<!-- manual-checks:end -->', row + '<!-- manual-checks:end -->'))
            write('')
            self.assertEqual(check.verify_manual_checks(root), [])
            write(good)
            self.assertEqual(check.verify_manual_checks(root), [])
            for row in bad:
                write(row)
                with self.subTest(row=row):
                    self.assertTrue(check.verify_manual_checks(root))


if __name__ == '__main__':
    unittest.main()
