# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent batch identity and original-clock media coverage gates.

These checks do not generate gameplay fixtures or establish game fidelity.
The exact early Space Race gaps are the measured 500--600ms Coin reset of
F7's scan counters, bound to captured settings and physical replay inputs;
they are not a general allowance for missing frames.
Breakout retains its measured original VBLANK period and cold phase. The
period's integer source-clock relation is not an analytic divider proof.
"""
import csv
import functools
import hashlib
import importlib.util
import json
import re
from pathlib import Path

PS_PER_SECOND = 10**12
PCM_RATE = 48000
# Keep the existing original-reference initialization allowance unchanged.
# Two additional initialization samples were measured; this is not audio loss
# tolerance in the native/Wasm exact stream comparisons.
PCM_SAMPLE_COUNT_TOLERANCE = 4
CLOCK_HALF_PERIOD_PS = 34920  # uint64_t((0.5 / 14.31818) * 10**6)
HORIZONTAL_CLOCK_COUNTS = 455
VERTICAL_LINES = 262
FRAME_PERIOD_PS = CLOCK_HALF_PERIOD_PS * 4 * HORIZONTAL_CLOCK_COUNTS * VERTICAL_LINES
FIRST_FRAME_PS = {"pongdoubles": 16652246960, "spacerace": 16652279880,
                  "breakout": 14018475800}
# All 506 gaps in each of six fresh 8s original Breakout attempts were exact.
# This is 451556 halfcycles of the source clock; the measured cold first phase
# has a 16400ps residual and must not be rounded to a clock boundary. Neither
# the visible scanline interval nor visible line count divides the full frame.
FRAME_PERIOD_PS_BY_GAME = {"pongdoubles": FRAME_PERIOD_PS, "spacerace": FRAME_PERIOD_PS,
                           "breakout": 15768335520}
SPACE_COIN_RESET_PAIR_PS = (499538611080, 616652189640)
SPACE_COIN_RESET_GAP_PS = SPACE_COIN_RESET_PAIR_PS[1] - SPACE_COIN_RESET_PAIR_PS[0]
SPACE_ALTERNATE_COIN_RESET_PS = (499538611080, 510001034000, 616652189640)
_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)\Z")
_FIELDS = ("id", "game", "replay", "dip", "pot_ohms")
ROOT = Path(__file__).resolve().parents[2]
GAMES_DIRECTORY = Path(__file__).resolve().parent / "games"


@functools.lru_cache(maxsize=None)
def registered_game(game):
    """The per-game analysis module of a game ported from 0.2.0 on, or None.

    tools/reference/games/<game>.py declares its core ID, settings validity,
    measured original frame cadence and its original-behavior checks
    (docs/PORT_GAME.md). The six earlier games keep their analysis here and in
    analyze-games.py.
    """
    if not isinstance(game, str) or not _ID.fullmatch(game):
        return None
    path = GAMES_DIRECTORY / f"{game}.py"
    if not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location(f"nocpu_reference_game_{game}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name in ("GAME", "CORE_ID", "FIRST_FRAME_PS", "FRAME_PERIOD_PS", "valid_options", "snapshot_objects", "analyze"):
        if not hasattr(module, name):
            raise ValueError(f"tools/reference/games/{game}.py lacks {name}")
    if module.GAME != game:
        raise ValueError(f"tools/reference/games/{game}.py declares another game")
    return module


def first_frame_ps(game):
    module = registered_game(game)
    return module.FIRST_FRAME_PS if module else FIRST_FRAME_PS.get(game)


def frame_period_ps(game):
    module = registered_game(game)
    return module.FRAME_PERIOD_PS if module else FRAME_PERIOD_PS_BY_GAME.get(game)


def validate_selection(directory, manifest, *, repo_root=ROOT, capture_layout="original"):
    """Bind every TSV request to the manifest and required capture directories.

    An explicitly selected subset can be analyzed, but full_batch stays false.
    Consumers claiming the complete milestone must require full_batch as well
    as successful per-scenario analysis. Exploration is never qualification.
    """
    directory = Path(directory)
    errors, declared, selected, requested = [], {}, [], []
    bindings = {"manifest_matches_current": False, "replays": {}}
    layouts = {"original": [(name, "epoch0") for name in ("baseline", "repeat")],
               "portable": [(name, epoch) for name in ("native", "wasm") for epoch in ("epoch0", "epoch1")]}
    if capture_layout not in layouts:
        errors.append("Unsupported capture layout")
    if not isinstance(manifest, dict) or type(manifest.get("schema_version")) is not int \
            or manifest["schema_version"] != 1 or not isinstance(manifest.get("scenarios"), list):
        return {"requested_ids": [], "full_batch": False, "scenarios": [], "errors": ["Invalid scenario manifest"]}
    for item in manifest["scenarios"]:
        if not isinstance(item, dict) or any(key not in item for key in _FIELDS):
            errors.append("Malformed manifest scenario")
            continue
        identifier = item["id"]
        if not isinstance(identifier, str) or not _ID.fullmatch(identifier):
            errors.append("Invalid manifest scenario ID")
            continue
        if identifier in declared:
            errors.append(f"Duplicate manifest scenario: {identifier}")
            continue
        game, dip, pot = item["game"], item["dip"], item["pot_ohms"]
        # Breakout packs the original bonus-credit index in bits 0..3 and
        # cabinet/coinage/ball-count switches in bits 4..6. Reserved bits and
        # unused bonus indices must fail before any capture is qualified.
        module = registered_game(game)
        valid_options = type(dip) is int and type(pot) is int and (
            (module is not None and module.valid_options(dip, pot)) or
            (game == "pongdoubles" and dip in (0, 1) and pot == 0) or
            (game == "spacerace" and dip in (0, 1) and 470000 <= pot <= 1470000) or
            (game == "breakout" and 0 <= dip < 128 and (dip & 15) <= 8 and pot == 0))
        if not valid_options or not isinstance(item["replay"], str) or not item["replay"]:
            errors.append(f"Invalid manifest game/settings/replay: {identifier}")
            continue
        declared[identifier] = item
    if not declared:
        errors.append("Empty scenario manifest")
    if (directory / "EXPLORATION.json").exists():
        errors.append("Exploration capture is not qualification")
    try:
        captured_manifest_path = directory / "scenario-manifest.json"
        captured_manifest = json.loads(captured_manifest_path.read_text())
        # Canonical JSON distinguishes int/bool/float metadata as well as values.
        bindings["manifest_matches_current"] = json.dumps(captured_manifest, sort_keys=True) == json.dumps(manifest, sort_keys=True)
        bindings["captured_manifest_sha256"] = hashlib.sha256(captured_manifest_path.read_bytes()).hexdigest()
        if not bindings["manifest_matches_current"]:
            errors.append("Captured scenario manifest differs from current manifest")
    except (OSError, ValueError, TypeError) as error:
        errors.append(f"Missing or malformed captured manifest: {error}")
    captured_replays = {}
    try:
        replay_metadata = json.loads((directory / "replay-hashes.json").read_text())
        if not isinstance(replay_metadata, dict) or type(replay_metadata.get("schema_version")) is not int \
                or replay_metadata["schema_version"] != 1 or not isinstance(replay_metadata.get("replays"), dict):
            raise ValueError("Invalid captured replay hash metadata")
        captured_replays = replay_metadata["replays"]
    except (OSError, ValueError, TypeError) as error:
        errors.append(f"Missing or malformed captured replay hashes: {error}")
    try:
        with (directory / "scenarios.tsv").open(newline="") as stream:
            rows = list(csv.reader(stream, delimiter="\t"))
    except (OSError, csv.Error) as error:
        errors.append(f"Cannot read requested scenarios: {error}")
        rows = []
    if not rows:
        errors.append("No requested scenarios")
    for row_number, row in enumerate(rows, 1):
        if len(row) != len(_FIELDS):
            errors.append(f"Malformed requested scenario row: {row_number}")
            continue
        identifier = row[0]
        if identifier in requested:
            errors.append(f"Duplicate requested scenario: {identifier}")
            continue
        requested.append(identifier)
        if identifier not in declared:
            errors.append(f"Unknown requested scenario: {identifier}")
            continue
        item = declared[identifier]
        expected = [str(item[key]) for key in _FIELDS]
        if row != expected or not _DECIMAL.fullmatch(row[3]) or not _DECIMAL.fullmatch(row[4]):
            errors.append(f"Requested scenario does not match manifest: {identifier}")
            continue
        for attempt, epoch in layouts.get(capture_layout, []):
            if not (directory / identifier / attempt / epoch).is_dir():
                errors.append(f"Missing requested capture: {identifier}/{attempt}/{epoch}")
        replay_info = captured_replays.get(identifier)
        try:
            root = Path(repo_root).resolve()
            replay_path = (root / item["replay"]).resolve()
            replay_path.relative_to(root)
            current_digest = hashlib.sha256(replay_path.read_bytes()).hexdigest()
            matches = isinstance(replay_info, dict) and replay_info.get("path") == item["replay"] \
                and replay_info.get("sha256") == current_digest
            bindings["replays"][identifier] = {"path": item["replay"], "current_sha256": current_digest,
                                               "captured_sha256": replay_info.get("sha256") if isinstance(replay_info, dict) else None,
                                               "matches": matches}
            if not matches:
                errors.append(f"Captured replay path/bytes differ from current replay: {identifier}")
        except (OSError, ValueError, TypeError) as error:
            errors.append(f"Cannot bind current replay bytes: {identifier}: {error}")
        selected.append(dict(item))
    if set(captured_replays) != set(requested):
        errors.append("Captured replay hash IDs differ from requested scenario IDs")
    complete = bool(declared) and set(requested) == set(declared) and len(requested) == len(declared)
    return {"requested_ids": requested, "full_batch": complete and not errors,
            "selection_scope": "complete_batch" if complete else "selected_scenarios",
            "scenarios": selected, "errors": errors, "capture_layout": capture_layout,
            "source_bindings": bindings}


def _space_reset_sequence(scenario, replay):
    """Return only reset phases actually measured for this setting/input pair.

    Source COIN_INPUT polls every10ms, drives active-low COIN.1 to F7's
    asynchronous H/V resets, and VIDEO presents on VBLANK rising edges.
    The extra blank frame is measured for the selected minimum-time/DIP1
    scenario, not a claimed universal coinage rule.
    """
    if not isinstance(scenario, dict) or scenario.get("game") != "spacerace" \
            or type(scenario.get("dip")) is not int or type(scenario.get("pot_ohms")) is not int \
            or not isinstance(replay, (list, tuple)):
        return ()
    if any(not isinstance(event, (list, tuple)) or len(event) != 3 \
           or type(event[0]) is not int or event[0] < 0 \
           or not isinstance(event[1], str) or type(event[2]) is not int for event in replay):
        return ()
    if any(b[0] < a[0] for a, b in zip(replay, replay[1:])):
        return ()
    early_inputs = [tuple(event) for event in replay if event[0] <= SPACE_COIN_RESET_PAIR_PS[1]]
    coins = [event for event in early_inputs if event[1] == "coin"]
    starts = [event for event in early_inputs if event[1] == "start"]
    if coins != [(500 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)]:
        return ()
    initial_start = [(200 * 10**9, "start", 1), (300 * 10**9, "start", 0)]
    if scenario["dip"] == 0 and scenario["pot_ohms"] in (970000, 1470000) \
            and (starts == initial_start or (scenario.get("kind") == "coin_only" and not starts)):
        return SPACE_COIN_RESET_PAIR_PS
    if scenario["dip"] == 1 and scenario["pot_ohms"] == 470000 and starts == initial_start \
            and scenario.get("kind") != "coin_only":
        return SPACE_ALTERNATE_COIN_RESET_PS
    return ()


def media_coverage(frame_rows, sample_count, duration_ps, game, *, pcm_byte_count=None,
                   scenario=None, replay=None):
    """Reject missing media using the exact per-game original cadence/phase.

    Full raster hashes, PCM bytes, replay accounting and gameplay assertions
    remain separate gates. Optional byte_count also rejects odd/truncated PCM
    containers; the analyzer must check that when decoding captured samples.
    """
    errors = []
    times, indices = [], []
    valid_parameters = first_frame_ps(game) is not None and type(duration_ps) is int and duration_ps > 0 \
        and type(sample_count) is int and sample_count >= 0
    if not valid_parameters:
        errors.append("Invalid game, duration or PCM count")
    try:
        for row in frame_rows:
            if any(type(row[key]) not in (str, int) or not _DECIMAL.fullmatch(str(row[key])) for key in ("frame", "time_ps")):
                raise ValueError("Frame index/time must be canonical unsigned integers")
            index, timestamp = int(row["frame"]), int(row["time_ps"])
            if index < 0 or timestamp < 0:
                raise ValueError("Negative frame index/time")
            indices.append(index)
            times.append(timestamp)
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        errors.append(f"Malformed frame record: {error}")
    periods = [b - a for a, b in zip(times, times[1:])]
    reset_pairs, unexpected_pairs = [], []
    frame_period = frame_period_ps(game)
    reset_sequence = _space_reset_sequence(scenario, replay) if game == "spacerace" else ()
    expected_reset_pairs = list(zip(reset_sequence, reset_sequence[1:]))
    # A registered game whose original circuit stops its own video sync (TV
    # Basketball's coin) declares, per replay input, windows in which one frame
    # gap may (or, if required, must) appear: (earliest frame before, latest
    # frame after, shortest gap, longest gap in ps, required).
    gap_rule = getattr(registered_game(game), "frame_gap_windows", None)
    gap_windows = list(gap_rule(scenario, replay)) if gap_rule and scenario is not None and replay is not None else []
    matched_windows = [0] * len(gap_windows)
    for a, b in zip(times, times[1:]):
        if b - a == frame_period:
            continue
        windows = [index for index, (earliest, latest, shortest, longest, _) in enumerate(gap_windows)
                   if earliest <= a and b <= latest and shortest <= b - a <= longest and not matched_windows[index]]
        if (a, b) in expected_reset_pairs:
            reset_pairs.append({"before_ps": a, "after_ps": b, "gap_ps": b - a})
        elif len(windows) == 1:
            matched_windows[windows[0]] += 1
            reset_pairs.append({"before_ps": a, "after_ps": b, "gap_ps": b - a})
        else:
            unexpected_pairs.append({"before_ps": a, "after_ps": b, "gap_ps": b - a})
    delay = sum(item["gap_ps"] - frame_period for item in reset_pairs)
    first = first_frame_ps(game)
    expected_frames = max(0, 1 + (duration_ps - first - delay) // frame_period) if valid_parameters else None
    indices_complete = indices == list(range(len(times))) and bool(times)
    # Both pieces of the split are required in order. A dropped reset frame
    # must not masquerade as the default long gap or a regular-cadence stream.
    required_pairs = [pair for pair in expected_reset_pairs if valid_parameters and pair[1] <= duration_ps]
    observed_pairs = [(item["before_ps"], item["after_ps"]) for item in reset_pairs]
    reset_complete = [pair for pair in observed_pairs if pair in required_pairs] == required_pairs \
        and len(observed_pairs) == len(required_pairs) + sum(matched_windows) \
        and all(count == 1 for count, window in zip(matched_windows, gap_windows) if window[4] and window[1] <= duration_ps)
    cadence_complete = valid_parameters and not errors and bool(periods) and indices_complete \
        and not unexpected_pairs and reset_complete
    duration_complete = valid_parameters and not errors and bool(times) and times[0] == first \
        and 0 <= duration_ps - times[-1] < frame_period and len(times) == expected_frames
    expected_samples = duration_ps * PCM_RATE // PS_PER_SECOND if valid_parameters else None
    # A game DICE leaves without an audio hookup (NO_AUDIO_HOOKUP in its module)
    # generates only the audio chip's single constructor sample.
    silent = getattr(registered_game(game), "NO_AUDIO_HOOKUP", False) if valid_parameters else False
    pcm_duration_complete = valid_parameters and (sample_count == 1 if silent
                                                  else abs(sample_count - expected_samples) <= PCM_SAMPLE_COUNT_TOLERANCE)
    pcm_container_complete = pcm_byte_count is None or (type(pcm_byte_count) is int \
        and pcm_byte_count >= 0 and pcm_byte_count % 2 == 0 and pcm_byte_count == sample_count * 2)
    return {"expected_duration_ps": duration_ps, "game": game, "errors": errors,
            "source_clock_half_period_ps": CLOCK_HALF_PERIOD_PS,
            "source_horizontal_clock_counts": getattr(registered_game(game), "HORIZONTAL_CLOCK_COUNTS", None)
                if registered_game(game) or game == "breakout" else HORIZONTAL_CLOCK_COUNTS,
            "source_vertical_lines": getattr(registered_game(game), "VERTICAL_LINES", None)
                if registered_game(game) or game == "breakout" else VERTICAL_LINES,
            "source_frame_period_ps": frame_period,
            "source_frame_period_basis": "measured original VBLANK cadence, 451556 source-clock halfcycles; not a complete analytic divider proof"
                if game == "breakout" else registered_game(game).FRAME_PERIOD_BASIS if registered_game(game)
                else "integer source-clock horizontal/vertical counts",
            "source_paths": ["upstream/dice-0.9/chips/clock.cpp", f"upstream/dice-0.9/games/{game}.cpp"]
                + (["upstream/dice-0.9/chips/video.cpp", "upstream/dice-0.9/chip.cpp"] if game == "breakout" else []),
            "frame_first_time_ps": times[0] if times else None,
            "frame_last_time_ps": times[-1] if times else None,
            "frame_minimum_period_ps": min(periods) if periods else None,
            "frame_maximum_period_ps": max(periods) if periods else None,
            "expected_frame_count_from_source_clock": expected_frames,
            "observed_frame_count": len(times), "source_bound_coin_reset_gaps": reset_pairs,
            "expected_source_bound_coin_reset_sequence_ps": list(reset_sequence),
            "source_bound_coin_reset_complete": reset_complete,
            "unexpected_frame_gaps": unexpected_pairs,
            "expected_pcm_sample_count": expected_samples,
            "pcm_sample_count_tolerance": PCM_SAMPLE_COUNT_TOLERANCE,
            "pcm_byte_count_provided": pcm_byte_count is not None,
            "checks": {"native_video_duration_complete": bool(duration_complete),
                       "native_video_cadence_complete": bool(cadence_complete),
                       "native_pcm_duration_complete": bool(pcm_duration_complete),
                       "native_pcm_container_complete": bool(pcm_container_complete)}}
