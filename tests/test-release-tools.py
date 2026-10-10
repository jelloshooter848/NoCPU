#!/usr/bin/env python3
"""Failure-injection tests for public source packaging and preservation checks."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import shutil
import tarfile
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load_tool(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


package = load_tool("release_package", "package-release.py")
checks = load_tool("repository_checks", "check.py")


class ReleaseToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nocpu-release-test-")
        self.root = Path(self.temp.name) / "source"
        (self.root / "tests").mkdir(parents=True)
        (self.root / "tools").mkdir()
        (self.root / "README.md").write_text("Source fixture\n")
        (self.root / "VERSION").write_text("0.1.0\n")
        (self.root / "tools/run.sh").write_text("#!/bin/sh\nexit 0\n")
        (self.root / "tools/run.sh").chmod(0o755)
        (self.root / "tests/license-audit.json").write_text(json.dumps({"schema_version": 1, "release_ready": False, "blockers": ["unresolved test notice"]}))
        (self.root / "tests/source-manifest.json").write_text(json.dumps({"source_archive_sha256": "a" * 64}))

    def tearDown(self):
        self.temp.cleanup()

    def test_wrong_or_missing_release_tag_rejected(self):
        for tag in (None, "v0.2.0", "0.1.0", "v0.1.0-beta"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                package.check_tag("0.1.0", tag, False)
        package.check_tag("0.1.0", "v0.1.0", False)
        package.check_tag("0.1.0", None, True)
        with self.assertRaises(ValueError):
            package.check_tag("0.1.0", "v0.1.0", True)

    def test_rom_and_private_payloads_rejected(self):
        for filename in ("tests/example.zip", "tests/example.tar.xz", "docs/private.key", "tools/.env", "tests/roms/readme.txt"):
            path = self.root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("private fixture")
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                package.collect_files(self.root)
            path.unlink()

    def test_release_notes_use_exact_version_and_stop_at_next_entry(self):
        (self.root / "CHANGELOG.md").write_text("# Changelog\n\n## 0.1.01 — later\nwrong\n\n## 0.1.0 — 2026-10-09\nreviewed notes\n\n## 0.0.1\nold notes\n")
        notes = package.release_notes(self.root, "0.1.0")
        self.assertIn("reviewed notes", notes)
        self.assertNotIn("wrong", notes)
        self.assertNotIn("old notes", notes)
        (self.root / "CHANGELOG.md").write_text("## 0.1.01\nwrong\n")
        with self.assertRaises(ValueError):
            package.release_notes(self.root, "0.1.0")

    def test_release_cli_blocks_uncleared_license_and_preparation_heading(self):
        (self.root / "tools/check.py").write_text("raise SystemExit(0)\n")
        (self.root / "tools/package-release.py").write_text("# Test fixture root\n")
        (self.root / "CHANGELOG.md").write_text("## 0.1.0 — prepared locally\nUnpublished source foundation.\n")
        output = Path(self.temp.name) / "output"
        args = ["package-release.py", "--tag", "v0.1.0", "--output-dir", str(output)]
        with patch.object(package, "ROOT", self.root), patch("sys.argv", args), redirect_stderr(io.StringIO()) as error:
            self.assertEqual(package.main(), 1)
        self.assertIn("blocked by license audit", error.getvalue())
        self.assertFalse(output.exists())
        (self.root / "tests/license-audit.json").write_text(json.dumps({"schema_version": 1, "release_ready": True, "blockers": []}))
        with patch.object(package, "ROOT", self.root), patch("sys.argv", args), redirect_stderr(io.StringIO()) as error:
            self.assertEqual(package.main(), 1)
        self.assertIn("Finalize the current CHANGELOG heading", error.getvalue())
        self.assertFalse(output.exists())
        args = ["package-release.py", "--candidate", "--output-dir", str(output)]
        with patch.object(package, "ROOT", self.root), patch("sys.argv", args), redirect_stdout(io.StringIO()):
            self.assertEqual(package.main(), 0)
        self.assertTrue((output / "nocpu-0.1.0-candidate-source.tar.gz").is_file())

    def test_repository_payload_check_detects_ignored_rom_and_private_file(self):
        (self.root / "hidden.zip").write_bytes(b"ROM fixture")
        (self.root / ".env.local").write_text("private fixture")
        errors = checks.verify_payloads(self.root)
        self.assertTrue(any("hidden.zip" in error for error in errors))
        self.assertTrue(any(".env.local" in error for error in errors))

    def test_nested_git_directory_rejected_even_when_empty(self):
        metadata = self.root / "tools/vendor/.git"
        metadata.mkdir(parents=True)
        destination = Path(self.temp.name) / "unsafe.tar.gz"
        for populated in (False, True):
            if populated:
                (metadata / "config").write_text("[remote \"origin\"]\nurl = https://example.invalid/private-fixture\n")
            with self.subTest(populated=populated):
                self.assertTrue(any("Nested Git metadata" in error for error in checks.verify_payloads(self.root)))
                with self.assertRaisesRegex(ValueError, "Nested Git metadata"):
                    package.collect_files(self.root)
                with self.assertRaisesRegex(ValueError, "Nested Git metadata"):
                    package.make_archive(self.root, destination, "0.1.0", True)
                self.assertFalse(destination.exists())

    def test_nested_git_worktree_pointer_rejected(self):
        metadata = self.root / "tools/vendor/.git"
        metadata.parent.mkdir(parents=True)
        metadata.write_text("gitdir: /tmp/nocpu-private-fixture\n")
        self.assertTrue(any("Nested Git metadata" in error for error in checks.verify_payloads(self.root)))
        with self.assertRaisesRegex(ValueError, "Nested Git metadata"):
            package.collect_files(self.root)
        destination = Path(self.temp.name) / "unsafe.tar.gz"
        with self.assertRaisesRegex(ValueError, "Nested Git metadata"):
            package.make_archive(self.root, destination, "0.1.0", True)
        self.assertFalse(destination.exists())

    def test_root_git_directory_or_worktree_pointer_allowed_and_excluded(self):
        metadata = self.root / ".git"
        for directory in (True, False):
            if directory:
                metadata.mkdir()
                (metadata / "config").write_text("[remote \"origin\"]\nurl = https://example.invalid/private-fixture\n")
            else:
                metadata.write_text("gitdir: /tmp/nocpu-private-fixture\n")
            with self.subTest(directory=directory):
                self.assertEqual(checks.verify_payloads(self.root), [])
                self.assertFalse(any(".git" in path.relative_to(self.root).parts for path in package.collect_files(self.root)))
                destination = Path(self.temp.name) / "safe.tar.gz"
                package.make_archive(self.root, destination, "0.1.0", True)
                with tarfile.open(destination, "r:gz") as archive:
                    self.assertFalse(any(".git" in Path(member.name).parts for member in archive))
            if directory:
                shutil.rmtree(metadata)
            else:
                metadata.unlink()

    def test_license_notice_missing_tampered_and_unsafe_paths_detected(self):
        shutil.copyfile(ROOT / "tests/license-audit.json", self.root / "tests/license-audit.json")
        audit = json.loads((self.root / "tests/license-audit.json").read_text())
        for notice in audit["notices"]:
            path = self.root / notice["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / notice["path"], path)
        self.assertEqual(checks.verify_license_notices(self.root), [])
        target = self.root / "docs/licenses/puff-zlib.txt"
        original = target.read_bytes()
        target.write_bytes(original + b"\ntampered")
        self.assertTrue(any("License notice changed" in error for error in checks.verify_license_notices(self.root)))
        target.unlink()
        self.assertTrue(any("Required license notice missing" in error for error in checks.verify_license_notices(self.root)))
        target.write_bytes(original)
        audit["notices"].append({"path": "../outside"})
        (self.root / "tests/license-audit.json").write_text(json.dumps(audit))
        self.assertTrue(any("Unsafe license notice path" in error for error in checks.verify_license_notices(self.root)))
        audit["notices"].pop()
        (self.root / "tests/license-audit.json").write_text(json.dumps(audit))
        target.unlink()
        target.symlink_to(self.root / "README.md")
        self.assertTrue(any("License notice may not use a symlink" in error for error in checks.verify_license_notices(self.root)))

    def test_symlinks_rejected(self):
        (self.root / "docs").symlink_to(self.root / "tests", target_is_directory=True)
        with self.assertRaises(ValueError):
            package.collect_files(self.root)

    def test_archive_reproducible_and_manifest_matches_content(self):
        generated = self.root / "build/private-roms/game.zip"
        generated.parent.mkdir(parents=True)
        generated.write_bytes(b"excluded output")
        first = Path(self.temp.name) / "first.tar.gz"
        second = Path(self.temp.name) / "second.tar.gz"
        first_hash = package.make_archive(self.root, first, "0.1.0", True)
        for path in self.root.rglob("*"):
            if path.is_file():
                # Input timestamps cannot affect the deterministic archive.
                import os
                os.utime(path, (987654321, 987654321))
        second_hash = package.make_archive(self.root, second, "0.1.0", True)
        self.assertEqual(first_hash, second_hash)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        with tarfile.open(first, "r:gz") as archive:
            prefix = "nocpu-0.1.0-candidate/"
            manifest_file = archive.extractfile(prefix + "RELEASE-MANIFEST.json")
            assert manifest_file
            manifest = json.load(manifest_file)
            self.assertFalse(manifest["license_release_ready"])
            self.assertEqual(manifest["artifact_type"], "local-review-candidate")
            self.assertEqual(manifest["license_blockers"], ["unresolved test notice"])
            for entry in manifest["files"]:
                member = archive.extractfile(prefix + entry["path"])
                assert member
                payload = member.read()
                self.assertEqual(len(payload), entry["size"])
                self.assertEqual(hashlib.sha256(payload).hexdigest(), entry["sha256"])
            self.assertEqual(archive.getmember(prefix + "tools/run.sh").mode, 0o755)
            self.assertFalse(any("build/" in entry.name for entry in archive))

    def test_original_source_mutation_missing_extra_and_symlink_detected(self):
        source_root = self.root / "upstream/dice-0.9"
        shutil.copytree(ROOT / "upstream/dice-0.9", source_root)
        shutil.copyfile(ROOT / "tests/source-manifest.json", self.root / "tests/source-manifest.json")
        shutil.copyfile(ROOT / "LICENSE", self.root / "LICENSE")
        self.assertEqual(checks.verify_source(self.root), [])
        target = source_root / "README.txt"
        original = target.read_bytes()
        target.write_bytes(original + b"\nmodified")
        self.assertTrue(any("Original source changed" in error for error in checks.verify_source(self.root)))
        target.unlink()
        self.assertTrue(any("Original source missing" in error for error in checks.verify_source(self.root)))
        target.symlink_to(self.root / "README.md")
        self.assertTrue(any("Symlink in immutable source" in error for error in checks.verify_source(self.root)))
        target.unlink()
        target.write_bytes(original)
        (source_root / "unexpected.txt").write_text("new")
        self.assertTrue(any("Unexpected original-source file" in error for error in checks.verify_source(self.root)))

    def test_manifest_path_traversal_rejected(self):
        (self.root / "tests/source-manifest.json").write_text(json.dumps({
            "schema_version": 1, "root": "upstream/dice-0.9", "file_count": 1,
            "files": [{"path": "../outside", "size": 0, "sha256": "a" * 64}],
        }))
        self.assertTrue(any("Unsafe source manifest path" in error for error in checks.verify_source(self.root)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
