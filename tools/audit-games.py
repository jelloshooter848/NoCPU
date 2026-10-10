#!/usr/bin/env python3
"""Compare the public game inventory with the preserved DICE 0.9 source.

This deliberately parses the descriptor dialect in this pinned source; it is
not a general C++ parser or an emulator accuracy test. No ROMs are required.
"""

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "upstream/dice-0.9"
MANIFEST = ROOT / "tests/fixtures/game-manifest.json"
SOURCE_FIELDS = (
    "id", "display_name", "manufacturer", "year", "source_file", "input_slots", "max_players_indicated",
    "controls", "dips", "potentiometers", "video", "audio", "roms",
)


def uncomment(text):
    """Keep quoted labels intact while discarding C++ comments."""
    pattern = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    return re.sub(pattern, lambda m: " " if m[0].startswith(("//", "/*")) else m[0], text)


def quoted(text):
    return [json.loads(m[0]) for m in re.finditer(r'"(?:\\.|[^"\\])*"', text)]


def calls(text, name):
    """Return balanced macro arguments, including commas in nested calls."""
    result = []
    for match in re.finditer(r"\b" + re.escape(name) + r"\s*\(", text):
        depth, i, start, string, escape = 1, match.end(), match.end(), False, False
        while i < len(text) and depth:
            char = text[i]
            if string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    string = False
            elif char == '"':
                string = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            i += 1
        if depth:
            raise ValueError(f"unbalanced {name} call")
        result.append(text[start:i - 1].strip())
    return result


def arguments(text):
    result, start, depth, string, escape = [], 0, 0, False, False
    for i, char in enumerate(text):
        if string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                string = False
        elif char == '"':
            string = True
        elif char in "({[":
            depth += 1
        elif char in ")}]":
            depth -= 1
        elif char == "," and depth == 0:
            result.append(text[start:i].strip())
            start = i + 1
    result.append(text[start:].strip())
    return result


def one_call(text, name, default=None):
    found = calls(text, name)
    if len(found) > 1:
        raise ValueError(f"multiple {name} declarations need explicit review")
    return found[0] if found else default


def control_info(raw):
    args = arguments(raw)
    chip = args[0]
    player = re.search(r"(?:PADDLE|JOYSTICK|WHEEL|THROTTLE|BUTTONS)(\d+)_", chip)
    kind = chip.split("_")[0]
    kind = re.sub(r"\d+$", "", kind).lower()
    pins = [] if len(args) == 2 else [p.strip() for p in args[1].strip("{}").split(",")]
    return {
        "chip": chip, "slot": int(player[1]) if player else None,
        "kind": kind, "pins": pins, "label": json.loads(args[-1]),
    }


def parse_game(source, path, registration):
    name, game_id, manufacturer, year = registration
    text = uncomment(path.read_text(encoding="utf-8"))
    controls = [control_info(raw) for raw in calls(text, "INPUT_INFO")]
    if not controls:
        raise ValueError(f"{game_id}: no input descriptor found")
    chip_calls = [arguments(raw) for raw in calls(text, "CHIP")]
    bindings = {}
    for chip in chip_calls:
        if len(chip) == 3 and chip[2].startswith("&"):
            bindings.setdefault(chip[2][1:], set()).add(chip[1])
    dips, pots, roms = [], [], []
    declarations = re.finditer(
        r"\b(?:static\s+)?(Dipswitch\w*|Potentimeter\w*|RomDesc)\s+(\w+)\s*\(", text
    )
    for match in declarations:
        cls, symbol = match.groups()
        if symbol not in bindings:
            continue  # Unwired declarations are not runtime requirements.
        raw = calls(text[match.start():], symbol)[0]
        args = arguments(raw)
        if cls == "RomDesc":
            crc = [f"{int(value, 16):08X}" for value in args[2:]]
            roms.append({
                "symbol": symbol, "archive": json.loads(args[0]) + ".zip",
                "expected_member": json.loads(args[1]), "accepted_crc32": list(dict.fromkeys(crc)),
                "chip_types": sorted(bindings[symbol]),
            })
        elif cls.startswith("Dipswitch"):
            settings = [None if a == "NULL" else json.loads(a) for a in args[3:]]
            if cls in ("Dipswitch53137Desc", "Dipswitch4SP4TDesc"):
                settings += [None] * (16 - len(settings))
            dips.append({
                "id": json.loads(args[0]), "label": json.loads(args[1]),
                "default_index": int(args[2]), "settings": settings, "descriptor": cls,
            })
        else:
            pots.append({
                "id": json.loads(args[0]), "label": json.loads(args[1]),
                "default_expression": args[2], "min_expression": args[3],
                "max_expression": args[4], "descriptor": cls,
            })
    video = {
        "descriptor": one_call(text, "VIDEO"),
        "rotation_clockwise_degrees": int(one_call(text, "VIDEO_ORIENTATION", "ROTATE_0").split("_")[1]),
        "monitor_type": one_call(text, "VIDEO_MONITOR_TYPE", "MONOCHRONE"),
        "scan_mode": one_call(text, "VIDEO_SCAN_MODE", "PROGRESSIVE"),
        "overlays": [[float(a) for a in arguments(raw)] for raw in calls(text, "VIDEO_OVERLAY")],
    }
    audio_connections = [raw for raw in calls(text, "CONNECTION") if '"AUDIO"' in raw]
    audio = {
        "descriptor": one_call(text, "AUDIO"),
        "circuit_audio_present": bool(audio_connections),
        "mono_output_wired": any("Audio::OUTPUT_MONO" in raw for raw in audio_connections),
        "gain": float(one_call(text, "AUDIO_GAIN", "10.0")),
        "speaker_config": one_call(text, "AUDIO_SPEAKER_CONFIG", "MONO"),
        "native_output_channels": 1,
    }
    return {
        "id": game_id, "display_name": name, "manufacturer": manufacturer, "year": year,
        "source_file": path.relative_to(source).as_posix(),
        "input_slots": sorted({c["slot"] for c in controls if c["slot"] is not None}),
        "max_players_indicated": max(
            [c["slot"] or 0 for c in controls] +
            [int(n) for c in controls for n in re.findall(r"(\d+)-Player", c["label"])],
        ),
        "controls": controls, "dips": dips, "potentiometers": pots,
        "video": video, "audio": audio, "roms": roms,
    }


def source_games(source):
    circuit = uncomment((source / "circuit.cpp").read_text(encoding="utf-8"))
    if not re.search(r'createChip\(chip_AUDIO,\s*"AUDIO"', circuit):
        raise ValueError("original runtime AUDIO special-chip construction changed")
    native_audio = uncomment((source / "chips/audio.cpp").read_text(encoding="utf-8"))
    if not re.search(r"as\.channels\s*=\s*1\s*;", native_audio):
        raise ValueError("original native output-channel assumption changed")
    text = uncomment((source / "game_list.h").read_text(encoding="utf-8"))
    registrations = re.findall(
        r'GAME\(\s*"([^"]+)"\s*,\s*(\w+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)', text
    )
    if len(registrations) != 21:
        raise ValueError(f"expected 21 original registrations, found {len(registrations)}")
    files = list((source / "games").glob("*.cpp"))
    layouts = {}
    for path in files:
        for layout in calls(uncomment(path.read_text(encoding="utf-8")), "CIRCUIT_LAYOUT"):
            if layout in layouts:
                raise ValueError(f"duplicate circuit layout: {layout}")
            layouts[layout] = path
    result = []
    for name, game_id, manufacturer, year in registrations:
        result.append(parse_game(source, layouts[game_id], (name, game_id, manufacturer, int(year))))
    return result


def validate_manifest(data):
    if data.get("schema_version") != 1 or not isinstance(data.get("games"), list):
        raise ValueError("unsupported or missing manifest schema")
    games = data["games"]
    if len(games) != 21 or len({g["id"] for g in games}) != 21:
        raise ValueError("manifest must contain exactly 21 distinct original games")
    required = [g for g in games if g["roms"]]
    if len(required) != 10:
        raise ValueError("expected ten ROM-dependent original games")
    for game in games:
        if not game.get("validation"):
            raise ValueError(f"{game['id']}: missing validation limits")
        for dip in game["dips"]:
            if not 0 <= dip["default_index"] < len(dip["settings"]):
                raise ValueError(f"{game['id']}: DIP default is outside settings")
        for rom in game["roms"]:
            crcs = rom["accepted_crc32"]
            variants = rom.get("dump_variants", [])
            if {v["crc32"] for v in variants} != set(crcs):
                raise ValueError(f"{game['id']}: dump sizes must cover every accepted CRC")
            for variant in variants:
                if not re.fullmatch(r"[0-9A-F]{8}", variant["crc32"]):
                    raise ValueError(f"{game['id']}: invalid CRC32")
                if not isinstance(variant["size_bytes"], int) or not 0 < variant["size_bytes"] <= 1048576:
                    raise ValueError(f"{game['id']}: invalid observed dump size")
                if not variant.get("evidence"):
                    raise ValueError(f"{game['id']}: missing size provenance")
            if Path(rom["archive"]).name != rom["archive"]:
                raise ValueError("ROM archive name must be a basename")
        for alias in game.get("archive_aliases", []):
            if Path(alias).name != alias or not alias.endswith(".zip"):
                raise ValueError("ROM archive alias must be a ZIP basename")
    return games


def audit(source, manifest):
    data = json.loads(manifest.read_text(encoding="utf-8"))
    games = validate_manifest(data)
    expected = source_games(source)
    if [g["id"] for g in games] != [g["id"] for g in expected]:
        raise ValueError("manifest game order/IDs differ from game_list.h")
    for saved, parsed in zip(games, expected):
        for field in SOURCE_FIELDS:
            actual = saved[field]
            if field == "roms":
                actual = [{k: v for k, v in rom.items() if k != "dump_variants"} for rom in actual]
            if actual != parsed[field]:
                raise ValueError(f"{parsed['id']}: source mismatch in {field}")
    return games


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    try:
        games = audit(args.source_dir, args.manifest)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {len(games)} source-derived games; 10 require external ROM fixtures.")
    print("This checks descriptor inventory, not gameplay, audio, or browser compatibility.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
