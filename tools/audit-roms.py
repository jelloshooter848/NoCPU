#!/usr/bin/env python3
"""Audit external test ZIPs without copying or extracting ROMs into NoCPU.

Without --rom-dir this validates public metadata only. With --rom-dir every
selected game's required CRC and observed byte length must be present. Archive
member names may differ, matching DICE's CRC-first lookup behavior.
"""

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tests/fixtures/game-manifest.json"
MAX_MEMBER_BYTES = 1024 * 1024
MAX_ARCHIVE_BYTES = 8 * 1024 * 1024


def inventory_module():
    spec = importlib.util.spec_from_file_location("game_inventory", ROOT / "tools/audit-games.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inspect_archive(path):
    """Read actual bytes and verify ZIP CRCs, with bounded decompression."""
    result = []
    with zipfile.ZipFile(path) as archive:
        members = [info for info in archive.infolist() if not info.is_dir()]
        if not members or len(members) > 1024:
            raise ValueError("empty ZIP or excessive member count")
        if any(info.file_size > MAX_MEMBER_BYTES for info in members):
            raise ValueError("member exceeds audit size limit")
        if sum(info.file_size for info in members) > MAX_ARCHIVE_BYTES:
            raise ValueError("archive exceeds audit size limit")
        for info in members:
            # No names are used as filesystem paths, and no extraction occurs.
            with archive.open(info) as stream:
                payload = stream.read(MAX_MEMBER_BYTES + 1)
            if len(payload) != info.file_size or len(payload) > MAX_MEMBER_BYTES:
                raise ValueError("member byte length does not match ZIP metadata")
            actual_crc = zlib.crc32(payload) & 0xFFFFFFFF
            if actual_crc != info.CRC:
                raise ValueError("member bytes do not match ZIP CRC")
            result.append((f"{actual_crc:08X}", len(payload)))
    return result


def check_game(game, directory):
    archives = sorted({rom["archive"] for rom in game["roms"]})
    if len(archives) != 1:
        raise ValueError("this audit expects one archive per original game")
    candidates = [directory / name for name in archives + game.get("archive_aliases", [])]
    present = [path for path in candidates if path.is_file()]
    if not present:
        raise ValueError("missing required ZIP: " + " or ".join(path.name for path in candidates))
    if len(present) != 1:
        raise ValueError("multiple archive aliases present; select one unambiguous fixture")
    actual = set(inspect_archive(present[0]))
    missing = []
    for rom in game["roms"]:
        accepted = {(v["crc32"], v["size_bytes"]) for v in rom["dump_variants"]}
        if not actual.intersection(accepted):
            missing.append(rom["expected_member"] + " (" + "/".join(rom["accepted_crc32"]) + ")")
    if missing:
        raise ValueError("required verified dump not found: " + ", ".join(missing))
    return present[0].name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--rom-dir", type=Path, help="external directory containing local test ZIPs")
    parser.add_argument("--game", help="original DICE command-line ID; defaults to all ROM-dependent games")
    args = parser.parse_args()
    try:
        games = inventory_module().validate_manifest(json.loads(args.manifest.read_text(encoding="utf-8")))
        if args.game and args.game not in {g["id"] for g in games}:
            raise ValueError(f"unknown game ID: {args.game}")
        selected = [g for g in games if g["roms"] and (not args.game or g["id"] == args.game)]
        if not selected:
            print(f"NOT REQUIRED: {args.game} has no external ROM descriptors; no ZIP bytes inspected.")
            return 0
        if args.rom_dir is None:
            print(f"PASS: metadata for {len(selected)} ROM-dependent games; no ROM bytes inspected.")
            print("Use --rom-dir PATH to check external private fixtures.")
            return 0
        if not args.rom_dir.is_dir():
            raise ValueError("--rom-dir must be an existing directory")
        failures = 0
        for game in selected:
            try:
                archive = check_game(game, args.rom_dir)
            except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, zlib.error) as error:
                print(f"FAIL {game['id']}: {error}", file=sys.stderr)
                failures += 1
            else:
                print(f"PASS {game['id']}: {archive}; {len(game['roms'])} required descriptors verified")
        if failures:
            return 1
        print(f"PASS: {len(selected)} ZIP fixtures verified; no files extracted or copied.")
        print("CRC/size checks do not verify gameplay, audible sound, or distribution rights.")
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
