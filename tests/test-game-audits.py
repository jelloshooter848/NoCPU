#!/usr/bin/env python3
"""Public regression checks using synthetic bytes, never game-ROM payloads."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]


def load_tool(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inventory = load_tool("inventory_under_test", "audit-games.py")
rom_audit = load_tool("rom_audit_under_test", "audit-roms.py")


class GameAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nocpu-game-audit-")
        self.directory = Path(self.temp.name)
        self.payload = b"synthetic discrete-logic test fixture\n"
        crc = f"{zlib.crc32(self.payload) & 0xFFFFFFFF:08X}"
        self.game = {
            "id": "synthetic", "archive_aliases": ["short.zip"],
            "roms": [{"archive": "synthetic.zip", "expected_member": "chip.prom",
                      "accepted_crc32": [crc],
                      "dump_variants": [{"crc32": crc, "size_bytes": len(self.payload)}]}],
        }

    def tearDown(self):
        self.temp.cleanup()

    def write_zip(self, name="short.zip", member="chip.prom", payload=None, compression=zipfile.ZIP_STORED):
        path = self.directory / name
        with zipfile.ZipFile(path, "w", compression=compression) as archive:
            archive.writestr(member, self.payload if payload is None else payload)
        return path

    def test_crc_identity_accepts_different_member_name_without_extracting(self):
        self.write_zip(member="nested/different-name.dat")
        self.assertEqual(rom_audit.check_game(self.game, self.directory), "short.zip")
        self.assertEqual(sorted(p.name for p in self.directory.iterdir()), ["short.zip"])

    def test_matching_filename_with_wrong_crc_fails(self):
        self.write_zip(payload=b"incorrect bytes")
        with self.assertRaisesRegex(ValueError, "required verified dump not found"):
            rom_audit.check_game(self.game, self.directory)

    def test_matching_crc_with_unexpected_observed_size_fails(self):
        self.write_zip()
        self.game["roms"][0]["dump_variants"][0]["size_bytes"] += 1
        with self.assertRaisesRegex(ValueError, "required verified dump not found"):
            rom_audit.check_game(self.game, self.directory)

    def test_missing_archive_fails(self):
        with self.assertRaisesRegex(ValueError, "missing required ZIP"):
            rom_audit.check_game(self.game, self.directory)

    def test_alias_ambiguity_fails(self):
        self.write_zip()
        self.write_zip(name="synthetic.zip")
        with self.assertRaisesRegex(ValueError, "multiple archive aliases"):
            rom_audit.check_game(self.game, self.directory)

    def test_stored_payload_corruption_fails_actual_zip_crc(self):
        path = self.write_zip()
        raw = bytearray(path.read_bytes())
        raw[30 + len("chip.prom")] ^= 1
        path.write_bytes(raw)
        with self.assertRaises(zipfile.BadZipFile):
            rom_audit.inspect_archive(path)

    def test_deflate_corruption_returns_failure_without_traceback(self):
        path = self.write_zip(compression=zipfile.ZIP_DEFLATED)
        raw = bytearray(path.read_bytes())
        raw[30 + len("chip.prom")] = 255  # Invalid deflate block type.
        path.write_bytes(raw)
        output = io.StringIO()
        # Keep the CLI parser and exception handler real; substitute only fixture metadata.
        with patch.object(rom_audit, "inventory_module") as loader:
            loader.return_value.validate_manifest.return_value = [self.game]
            with patch("sys.argv", ["audit-roms.py", "--rom-dir", str(self.directory)]):
                with redirect_stdout(output), redirect_stderr(output):
                    code = rom_audit.main()
        self.assertEqual(code, 1)
        self.assertIn("FAIL synthetic:", output.getvalue())
        self.assertNotIn("Traceback", output.getvalue())

    def test_oversize_decompressed_member_fails(self):
        path = self.write_zip(payload=b"x" * (rom_audit.MAX_MEMBER_BYTES + 1), compression=zipfile.ZIP_DEFLATED)
        with self.assertRaisesRegex(ValueError, "exceeds audit size limit"):
            rom_audit.inspect_archive(path)

    def test_rom_free_selection_reports_no_inspection(self):
        output = io.StringIO()
        with patch("sys.argv", ["audit-roms.py", "--rom-dir", str(self.directory), "--game", "pong"]):
            with redirect_stdout(output), redirect_stderr(output):
                code = rom_audit.main()
        self.assertEqual(code, 0)
        self.assertIn("NOT REQUIRED", output.getvalue())
        self.assertIn("no ZIP bytes inspected", output.getvalue())
        self.assertNotIn("fixtures verified", output.getvalue())

    def test_unknown_selection_fails(self):
        output = io.StringIO()
        with patch("sys.argv", ["audit-roms.py", "--game", "unknown_test_game"]):
            with redirect_stdout(output), redirect_stderr(output):
                code = rom_audit.main()
        self.assertEqual(code, 1)
        self.assertIn("unknown game ID", output.getvalue())

    def test_changed_manifest_input_cannot_pass_source_audit(self):
        data = json.loads(inventory.MANIFEST.read_text())
        data["games"][0]["controls"][0]["label"] = "Incorrect source-derived input"
        path = self.directory / "changed-manifest.json"
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "source mismatch in controls"):
            inventory.audit(inventory.SOURCE, path)

    def test_default_audio_descriptor_does_not_mean_unwired_sound(self):
        games = {g["id"]: g for g in inventory.source_games(inventory.SOURCE)}
        self.assertIsNone(games["pong"]["audio"]["descriptor"])
        self.assertTrue(games["pong"]["audio"]["circuit_audio_present"])
        self.assertTrue(games["pong"]["audio"]["mono_output_wired"])
        self.assertEqual(games["pong"]["audio"]["gain"], 10.0)
        self.assertIsNotNone(games["hiway"]["audio"]["descriptor"])
        self.assertFalse(games["hiway"]["audio"]["circuit_audio_present"])
        self.assertFalse(games["hiway"]["audio"]["mono_output_wired"])


if __name__ == "__main__":
    unittest.main()
