#!/usr/bin/env python3
"""Release metadata rules: SemVer VERSION, Keep a Changelog sections, tag/notes extraction and site zips."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_tool(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load_tool("release_check_under_test", "release_check.py")
web = load_tool("web_package_under_test", "package-web.py")

CHANGELOG = """# Changelog

Intro text with a [link](docs/RELEASING.md).

## [Unreleased]

### Fixed

- Something not yet released.

## [0.2.0-rc.1] - 2026-11-01

### Added

- Release candidate entry.

## [0.2.0] - 2026-11-05

### Added

- Breakout batch.

### Fixed

- Paddle jitter.

## [0.1.10] - 2026-10-20

- Tenth patch.

## [0.1.1] - 2026-10-14

- First patch.

[Unreleased]: https://github.com/jelloshooter848/NoCPU/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.10...v0.2.0
[0.1.1]: https://github.com/jelloshooter848/NoCPU/compare/v0.1.0...v0.1.1
"""


class SemverTests(unittest.TestCase):
    def test_accepts_releases_and_prereleases(self):
        for version in ("0.1.0", "1.0.0", "0.2.0-rc.1", "0.10.3-rc.12", "1.0.0+build.5"):
            with self.subTest(version=version):
                self.assertTrue(release.is_semver(version))

    def test_rejects_malformed_versions(self):
        for version in ("0.1", "v0.1.0", "01.0.0", "0.1.0-", "0.1.0-rc.01", "0.1.0 ", "0.1.0\n0.2.0", "", None):
            with self.subTest(version=version):
                self.assertFalse(release.is_semver(version))


class ChangelogTests(unittest.TestCase):
    def test_base_check_passes_with_unreleased_first(self):
        errors, notes = release.check_release("0.2.0", CHANGELOG)
        self.assertEqual(errors, [])
        self.assertIsNone(notes)

    def test_missing_duplicate_or_misplaced_unreleased(self):
        cases = {
            "no": CHANGELOG.replace("## [Unreleased]\n", ""),
            "more than one": CHANGELOG + "\n## [Unreleased]\n",
            "first version section": CHANGELOG.replace("## [Unreleased]\n", "").replace(
                "## [0.1.1] - 2026-10-14", "## [Unreleased]\n\n## [0.1.1] - 2026-10-14"),
        }
        for expected, text in cases.items():
            with self.subTest(case=expected):
                errors, _ = release.check_release("0.2.0", text)
                self.assertEqual(len(errors), 1, errors)
                self.assertIn(expected, errors[0])

    def test_heading_must_be_exact(self):
        # Legacy-style and unbracketed headings are not Keep a Changelog sections.
        for heading in ("## Unreleased", "## [unreleased]", "### [Unreleased]", "## 0.1.0 — In development"):
            with self.subTest(heading=heading):
                errors, _ = release.check_release("0.1.0", f"# Changelog\n\n{heading}\n\n- entry\n")
                self.assertTrue(errors)

    def test_tag_notes_are_the_exact_section_body(self):
        errors, notes = release.check_release("0.2.0", CHANGELOG, "v0.2.0")
        self.assertEqual(errors, [])
        self.assertTrue(notes.startswith("### Added\n\n- Breakout batch."))
        self.assertIn("- Paddle jitter.", notes)
        # Neither the rc section above nor the patch below nor the link footers leak in.
        for absent in ("Release candidate", "Tenth patch", "Something not yet released", "https://"):
            self.assertNotIn(absent, notes)

    def test_prefix_versions_do_not_match_each_other(self):
        _, notes = release.check_release("0.1.1", CHANGELOG, "v0.1.1")
        self.assertEqual(notes, "- First patch.")
        _, notes = release.check_release("0.2.0-rc.1", CHANGELOG, "v0.2.0-rc.1")
        self.assertEqual(notes, "### Added\n\n- Release candidate entry.")

    def test_last_section_drops_footers(self):
        _, notes = release.check_release("0.1.1", CHANGELOG, "v0.1.1")
        self.assertNotIn("[Unreleased]:", notes)

    def test_tag_must_equal_v_plus_version(self):
        for tag, expected in (("v0.1.10", "does not match VERSION"), ("0.2.0", "not v followed"),
                              ("v0.2", "not v followed"), ("release-0.2.0", "not v followed")):
            with self.subTest(tag=tag):
                errors, notes = release.check_release("0.2.0", CHANGELOG, tag)
                self.assertTrue(any(expected in error for error in errors), errors)

    def test_tag_needs_a_dated_non_empty_section(self):
        undated = CHANGELOG.replace("## [0.2.0] - 2026-11-05", "## [0.2.0]")
        errors, notes = release.check_release("0.2.0", undated, "v0.2.0")
        self.assertIsNone(notes)
        self.assertTrue(any("## [0.2.0] - YYYY-MM-DD" in error for error in errors))
        impossible = CHANGELOG.replace("2026-11-05", "2026-02-30")
        errors, _ = release.check_release("0.2.0", impossible, "v0.2.0")
        self.assertTrue(any("invalid date" in error for error in errors))
        empty = "## [Unreleased]\n\n## [0.3.0] - 2026-12-01\n\n## [0.2.0] - 2026-11-05\n\n- x\n"
        errors, _ = release.check_release("0.3.0", empty, "v0.3.0")
        self.assertTrue(any("is empty" in error for error in errors))

    def test_unreleased_notes(self):
        self.assertEqual(release.unreleased_notes(CHANGELOG), "### Fixed\n\n- Something not yet released.")
        self.assertEqual(release.unreleased_notes("# Changelog\n"), "")

    def test_repository_changelog_and_version_pass_the_base_check(self):
        errors, _ = release.check_files(ROOT / "VERSION", ROOT / "CHANGELOG.md")
        self.assertEqual(errors, [])


class CliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nocpu-release-check-")
        self.dir = Path(self.temp.name)
        (self.dir / "VERSION").write_text("0.2.0\n")
        (self.dir / "CHANGELOG.md").write_text(CHANGELOG)

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(ROOT / "tools/release_check.py"), "--version-file", str(self.dir / "VERSION"),
                               "--changelog", str(self.dir / "CHANGELOG.md"), *args], capture_output=True, text=True)

    def test_notes_print_only_the_section(self):
        result = self.run_cli("--tag", "v0.2.0", "--notes")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "### Added\n\n- Breakout batch.\n\n### Fixed\n\n- Paddle jitter.\n")

    def test_failures_exit_nonzero_without_notes(self):
        result = self.run_cli("--tag", "v0.1.10", "--notes")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("does not match VERSION", result.stderr)
        (self.dir / "VERSION").write_text("0.2\n")
        self.assertEqual(self.run_cli().returncode, 1)

    def test_notes_require_a_tag(self):
        self.assertEqual(self.run_cli("--notes").returncode, 2)


class SiteZipTests(unittest.TestCase):
    def test_zip_is_rooted_deterministic_and_checksummed(self):
        with tempfile.TemporaryDirectory(prefix="nocpu-site-zip-") as temp:
            site = Path(temp) / "pages"
            (site / "notices").mkdir(parents=True)
            (site / "index.html").write_text("<!doctype html>")
            (site / "notices/LICENSE").write_text("GPL")
            first = web.write_site_zip(site, Path(temp) / "a.zip")
            (site / "index.html").touch()  # A new modification time must not change the archive.
            second = web.write_site_zip(site, Path(temp) / "b.zip")
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(archive.namelist(), ["index.html", "notices/LICENSE"])
                self.assertEqual(archive.read("notices/LICENSE"), b"GPL")
            checksum = (Path(temp) / "a.zip.sha256").read_text()
            self.assertEqual(checksum, f"{web.sha256(first)}  a.zip\n")


if __name__ == "__main__":
    unittest.main()
