#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fault challenges for batch identity and original source-clock media gates.

Timing records model the retained original cadence only. No pixels, audio,
gameplay or emulator artifacts are fabricated or used as goldens.
"""
import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("game_media", ROOT / "tools/reference/game_media.py")
MEDIA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEDIA)


def timing_records(game="pongdoubles", duration=130 * 10**12, alternate=False):
    # Independently retained phases/periods, including the six original
    # Breakout pilots and Space Coin reset. No helper-derived golden values.
    time = {"pongdoubles": 16652246960, "spacerace": 16652279880,
            "breakout": 14018475800}[game]
    period = 15768335520 if game == "breakout" else 16651252800
    rows = []
    while time <= duration:
        rows.append({"frame": str(len(rows)), "time_ps": str(time)})
        if game == "spacerace" and time == 499538611080:
            time = 510001034000 if alternate else 616652189640
        elif game == "spacerace" and alternate and time == 510001034000:
            time = 616652189640
        else:
            time += period
    return rows


class SelectionGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.scenarios = [
            {"id": "doubles", "game": "pongdoubles", "replay": "tests/replays/doubles.tsv", "dip": 0, "pot_ohms": 0},
            {"id": "space", "game": "spacerace", "replay": "tests/replays/space.tsv", "dip": 1, "pot_ohms": 470000},
        ]
        self.manifest = {"schema_version": 1, "scenarios": self.scenarios}
        self.repo_root = self.path / "repo"
        for item in self.scenarios:
            replay = self.repo_root / item["replay"]
            replay.parent.mkdir(parents=True, exist_ok=True)
            replay.write_text(f"Identity-only bytes for {item['id']}; no captured gameplay fixture.\n")
            for attempt in ("baseline", "repeat"):
                (self.path / item["id"] / attempt / "epoch0").mkdir(parents=True)
        self.write_requests(self.scenarios)

    def write_requests(self, scenarios):
        self.rows = [[str(item[key]) for key in ("id", "game", "replay", "dip", "pot_ohms")] for item in scenarios]
        self.write_rows()
        (self.path / "scenario-manifest.json").write_text(json.dumps(self.manifest))
        self.replay_metadata = {"schema_version": 1, "replays": {
            item["id"]: {"path": item["replay"], "sha256": hashlib.sha256((self.repo_root / item["replay"]).read_bytes()).hexdigest()}
            for item in scenarios}}
        self.write_replay_metadata()

    def write_replay_metadata(self):
        (self.path / "replay-hashes.json").write_text(json.dumps(self.replay_metadata))

    def write_rows(self):
        (self.path / "scenarios.tsv").write_text("".join("\t".join(row) + "\n" for row in self.rows))

    def validate(self):
        return MEDIA.validate_selection(self.path, self.manifest, repo_root=self.repo_root)

    def add_breakout(self):
        item = {"id": "breakout", "game": "breakout", "replay": "tests/replays/breakout.tsv",
                "dip": 3, "pot_ohms": 0}
        self.scenarios.append(item)
        replay = self.repo_root / item["replay"]
        replay.parent.mkdir(parents=True, exist_ok=True)
        replay.write_text("Identity-only Breakout replay bytes; no captured gameplay fixture.\n")
        for attempt in ("baseline", "repeat"):
            (self.path / item["id"] / attempt / "epoch0").mkdir(parents=True)
        return item

    def test_breakout_packed_switches_preserve_full_batch_and_exact_replay_binding(self):
        item = self.add_breakout()
        for packed in (0, 3, 8, 16, 32, 64, 112, 120):
            with self.subTest(packed=packed):
                item["dip"] = packed
                self.write_requests(self.scenarios)
                result = self.validate()
                self.assertEqual(result["errors"], [])
                self.assertTrue(result["full_batch"])
                self.assertTrue(result["source_bindings"]["replays"]["breakout"]["matches"])
        (self.repo_root / item["replay"]).write_text("Changed identity-only bytes\n")
        result = self.validate()
        self.assertFalse(result["full_batch"])
        self.assertFalse(result["source_bindings"]["replays"]["breakout"]["matches"])

    def test_breakout_reserved_bonus_bits_types_and_pot_fail_closed(self):
        item = self.add_breakout()
        for dip, pot in ((-1, 0), (9, 0), (15, 0), (121, 0), (127, 0), (128, 0),
                         (3, 1), (True, 0), (3.0, 0), (3, False), (3, 0.0)):
            with self.subTest(dip=dip, pot=pot):
                item.update(dip=dip, pot_ohms=pot)
                self.write_requests(self.scenarios)
                result = self.validate()
                self.assertTrue(result["errors"])
                self.assertFalse(result["full_batch"])

    def test_breakout_requested_switches_must_match_current_and_captured_manifest(self):
        item = self.add_breakout()
        self.write_requests(self.scenarios)
        self.rows[2][3] = "115"
        self.write_rows()
        self.assertFalse(self.validate()["full_batch"])
        self.write_requests(self.scenarios)
        item["dip"] = 115
        self.rows[2][3] = "115"
        self.write_rows()
        result = self.validate()
        self.assertFalse(result["full_batch"])
        self.assertFalse(result["source_bindings"]["manifest_matches_current"])

    def test_complete_requested_batch_is_identified(self):
        result = self.validate()
        self.assertEqual(result["errors"], [])
        self.assertTrue(result["full_batch"])
        self.assertEqual(result["requested_ids"], ["doubles", "space"])

    def test_selected_subset_is_explicitly_incomplete_batch(self):
        self.write_requests(self.scenarios[:1])
        result = self.validate()
        self.assertEqual(result["errors"], [])
        self.assertFalse(result["full_batch"])
        self.assertEqual(result["selection_scope"], "selected_scenarios")

    def test_missing_requested_repeat_is_rejected(self):
        (self.path / "space/repeat/epoch0").rmdir()
        self.assertTrue(self.validate()["errors"])
        self.assertFalse(self.validate()["full_batch"])

    def test_unknown_duplicate_and_malformed_requests_are_rejected(self):
        for extra in (["unknown", "spacerace", "fake.tsv", "0", "970000"], self.rows[0], ["space"]):
            with self.subTest(extra=extra):
                original = self.rows.copy()
                self.rows.append(extra)
                self.write_rows()
                self.assertTrue(self.validate()["errors"])
                self.assertFalse(self.validate()["full_batch"])
                self.rows = original
        self.write_rows()

    def test_game_replay_dip_and_pot_are_bound_to_exact_manifest(self):
        original = self.rows[1].copy()
        for field, value in ((1, "pongdoubles"), (2, "tests/replays/other.tsv"), (3, "0"), (4, "1470000")):
            with self.subTest(field=field):
                self.rows[1] = original.copy()
                self.rows[1][field] = value
                self.write_rows()
                self.assertTrue(self.validate()["errors"])
                self.assertFalse(self.validate()["full_batch"])

    def test_duplicate_manifest_id_does_not_silently_replace_scenario(self):
        self.manifest["scenarios"] = self.scenarios + [dict(self.scenarios[0])]
        self.assertTrue(self.validate()["errors"])
        self.assertFalse(self.validate()["full_batch"])

    def test_exploration_cannot_be_reported_as_qualification(self):
        (self.path / "EXPLORATION.json").write_text('{"qualified": false}')
        self.assertTrue(self.validate()["errors"])
        self.assertFalse(self.validate()["full_batch"])

    def test_invalid_manifest_metadata_fails_closed(self):
        for manifest in ({"schema_version": True, "scenarios": self.scenarios},
                         {"schema_version": 1, "scenarios": []},
                         {"schema_version": 1, "scenarios": [{**self.scenarios[0], "dip": True}]}):
            with self.subTest(manifest=manifest):
                result = MEDIA.validate_selection(self.path, manifest, repo_root=self.repo_root)
                self.assertTrue(result["errors"])
                self.assertFalse(result["full_batch"])

    def test_manifest_change_outside_tsv_fields_is_rejected(self):
        self.manifest["scenarios"][0]["winning_score"] = 15
        result = self.validate()
        self.assertTrue(result["errors"])
        self.assertFalse(result["source_bindings"]["manifest_matches_current"])

    def test_changed_or_missing_replay_bytes_are_rejected(self):
        replay = self.repo_root / self.scenarios[0]["replay"]
        replay.write_text("Different identity-only replay bytes\n")
        self.assertTrue(self.validate()["errors"])
        self.assertFalse(self.validate()["source_bindings"]["replays"]["doubles"]["matches"])
        replay.unlink()
        self.assertTrue(self.validate()["errors"])

    def test_corrupt_path_hash_or_requested_hash_set_is_rejected(self):
        original = json.dumps(self.replay_metadata)
        mutations = [lambda data: data["replays"]["doubles"].update(path="other.tsv"),
                     lambda data: data["replays"]["doubles"].update(sha256="0" * 64),
                     lambda data: data["replays"].pop("space"),
                     lambda data: data["replays"].update(unknown={"path": "fake", "sha256": "0" * 64})]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                self.replay_metadata = json.loads(original)
                mutate(self.replay_metadata)
                self.write_replay_metadata()
                self.assertTrue(self.validate()["errors"])
                self.assertFalse(self.validate()["full_batch"])

    def test_missing_capture_identity_metadata_is_rejected(self):
        for name in ("scenario-manifest.json", "replay-hashes.json"):
            with self.subTest(name=name):
                path = self.path / name
                original = path.read_text()
                path.unlink()
                self.assertTrue(self.validate()["errors"])
                path.write_text(original)

    def test_portable_requires_both_native_and_wasm_reset_epochs(self):
        for item in self.scenarios:
            for runtime in ("native", "wasm"):
                for epoch in ("epoch0", "epoch1"):
                    (self.path / item["id"] / runtime / epoch).mkdir(parents=True)
        result = MEDIA.validate_selection(self.path, self.manifest, repo_root=self.repo_root, capture_layout="portable")
        self.assertEqual(result["errors"], [])
        self.assertTrue(result["full_batch"])
        (self.path / "space/wasm/epoch1").rmdir()
        result = MEDIA.validate_selection(self.path, self.manifest, repo_root=self.repo_root, capture_layout="portable")
        self.assertTrue(result["errors"])
        self.assertFalse(result["full_batch"])
        self.assertTrue(MEDIA.validate_selection(self.path, self.manifest, repo_root=self.repo_root, capture_layout="unknown")["errors"])


class MediaGateTests(unittest.TestCase):
    duration = 130 * 10**12
    samples = 130 * 48000 + 2

    def coverage(self, rows, game="pongdoubles", samples=None, **kwargs):
        if game == "spacerace":
            kwargs.setdefault("scenario", {"game": game, "dip": 0, "pot_ohms": 970000})
            kwargs.setdefault("replay", [(200 * 10**9, "start", 1), (300 * 10**9, "start", 0),
                                         (500 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)])
        return MEDIA.media_coverage(rows, self.samples if samples is None else samples, self.duration, game, **kwargs)

    def alternate_coverage(self, rows, **kwargs):
        kwargs.setdefault("scenario", {"game": "spacerace", "dip": 1, "pot_ohms": 470000})
        return self.coverage(rows, "spacerace", **kwargs)

    def breakout_coverage(self, rows, *, samples=384002, **kwargs):
        return MEDIA.media_coverage(rows, samples, 8 * 10**12, "breakout", **kwargs)

    def test_breakout_exact_original_cold_phase_and_distinct_cadence(self):
        rows = timing_records("breakout", 8 * 10**12)
        result = self.breakout_coverage(rows, pcm_byte_count=768004)
        self.assertTrue(all(result["checks"].values()))
        self.assertEqual(result["observed_frame_count"], 507)
        self.assertEqual(result["frame_first_time_ps"], 14018475800)
        self.assertEqual(result["source_frame_period_ps"], 15768335520)
        self.assertIsNone(result["source_horizontal_clock_counts"])
        self.assertIsNone(result["source_vertical_lines"])
        self.assertIn("measured original VBLANK", result["source_frame_period_basis"])
        self.assertEqual(result["source_bound_coin_reset_gaps"], [])

    def test_breakout_cannot_use_old_game_or_rounded_sixty_hz_clock(self):
        for first, period in ((16652246960, 16651252800),
                              (14018475800, 16651252800),
                              (14018475800, 16666666667),
                              (14018475800 - 16400, 15768335520)):
            with self.subTest(first=first, period=period):
                rows = [{"frame": str(i), "time_ps": str(first + i * period)} for i in range(507)]
                self.assertFalse(all(self.breakout_coverage(rows)["checks"].values()))

    def test_breakout_missing_duplicate_perturbed_and_reset_shaped_frames_fail(self):
        rows = timing_records("breakout", 8 * 10**12)
        missing = rows[:40] + rows[41:]
        renumbered = [{**row, "frame": str(i)} for i, row in enumerate(missing)]
        duplicate = [dict(row) for row in rows]
        duplicate[40]["time_ps"] = duplicate[39]["time_ps"]
        perturbed = [dict(row) for row in rows]
        perturbed[40]["time_ps"] = str(int(perturbed[40]["time_ps"]) + 1)
        for changed in (rows[1:], rows[:-1], missing, renumbered, duplicate, perturbed):
            with self.subTest(rows=len(changed)):
                self.assertFalse(all(self.breakout_coverage(changed)["checks"].values()))
        # Space's measured Coin gap is never a Breakout allowance, even if
        # a caller supplies a genuine Space settings/replay context.
        changed = [dict(row) for row in rows]
        for row in changed[40:]:
            row["time_ps"] = str(int(row["time_ps"]) + 117113578560 - 15768335520)
        result = self.breakout_coverage(changed,
            scenario={"game": "spacerace", "dip": 0, "pot_ohms": 970000},
            replay=[(500 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)])
        self.assertFalse(result["checks"]["native_video_cadence_complete"])
        self.assertEqual(result["source_bound_coin_reset_gaps"], [])

    def test_breakout_pcm_duration_and_container_stay_strict(self):
        rows = timing_records("breakout", 8 * 10**12)
        self.assertFalse(self.breakout_coverage(rows, samples=7 * 48000)
                         ["checks"]["native_pcm_duration_complete"])
        for byte_count in (768003, 768002):
            with self.subTest(byte_count=byte_count):
                self.assertFalse(self.breakout_coverage(rows, pcm_byte_count=byte_count)
                                 ["checks"]["native_pcm_container_complete"])

    def test_exact_alternate_coin_split_and_default_coin_only_are_complete(self):
        result = self.alternate_coverage(timing_records("spacerace", alternate=True))
        self.assertTrue(all(result["checks"].values()))
        self.assertEqual(result["expected_source_bound_coin_reset_sequence_ps"],
                         [499538611080, 510001034000, 616652189640])
        self.assertEqual(len(result["source_bound_coin_reset_gaps"]), 2)
        self.assertEqual(result["observed_frame_count"], len(timing_records("spacerace")) + 1)
        coin_only = [(500 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)]
        result = self.coverage(timing_records("spacerace"), "spacerace",
                               scenario={"game": "spacerace", "dip": 0, "pot_ohms": 970000,
                                         "kind": "coin_only"}, replay=coin_only)
        self.assertTrue(all(result["checks"].values()))

    def test_coin_reset_requires_exact_game_options_and_physical_inputs(self):
        rows = timing_records("spacerace", alternate=True)
        wrong = [{"scenario": None}, {"replay": None},
                 {"scenario": {"game": "spacerace", "dip": 0, "pot_ohms": 470000}},
                 {"scenario": {"game": "spacerace", "dip": True, "pot_ohms": 470000}},
                 {"scenario": {"game": "spacerace", "dip": 1, "pot_ohms": 970000}},
                 {"scenario": {"game": "pongdoubles", "dip": 1, "pot_ohms": 470000}},
                 {"replay": [(200 * 10**9, "start", 1), (300 * 10**9, "start", 0),
                              (501 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)]},
                 {"replay": [(500 * 10**9, "coin", 1), (600 * 10**9, "coin", 0)]}]
        for context in wrong:
            with self.subTest(context=context):
                self.assertFalse(self.alternate_coverage(rows, **context)["checks"]["native_video_cadence_complete"])
        self.assertFalse(self.coverage(timing_records("spacerace"), "spacerace", replay=None)
                         ["checks"]["native_video_cadence_complete"])

    def test_alternate_reset_cannot_hide_missing_perturbed_or_duplicate_frames(self):
        rows = timing_records("spacerace", alternate=True)
        removed = [{**row, "frame": str(i)} for i, row in enumerate(rows[:30] + rows[31:])]
        changed = [dict(row) for row in rows]
        changed[30]["time_ps"] = "510001034001"
        duplicate = [{**row, "frame": str(i)} for i, row in enumerate(rows[:31] + [rows[30]] + rows[31:])]
        for mutated in (removed, changed, duplicate):
            with self.subTest(reset_region=mutated[29:33]):
                self.assertFalse(self.alternate_coverage(mutated)["checks"]["native_video_cadence_complete"])

    def test_bound_reset_must_exist_and_cannot_allow_later_missing_frames(self):
        regular = timing_records("spacerace")
        for i, row in enumerate(regular):
            row["time_ps"] = str(16652279880 + i * 16651252800)
        self.assertFalse(self.coverage(regular, "spacerace")["checks"]["native_video_cadence_complete"])
        rows = timing_records("spacerace", alternate=True)
        removed = [{**row, "frame": str(i)} for i, row in enumerate(rows[:400] + rows[401:])]
        self.assertFalse(self.alternate_coverage(removed)["checks"]["native_video_cadence_complete"])

    def test_long_original_cadence_is_not_rounded_to_sixty_hz(self):
        for game in ("pongdoubles", "spacerace"):
            with self.subTest(game=game):
                result = self.coverage(timing_records(game), game)
                self.assertTrue(all(result["checks"].values()))
                self.assertEqual(result["source_frame_period_ps"], 16651252800)
                self.assertEqual(result["observed_frame_count"], result["expected_frame_count_from_source_clock"])
        self.assertGreater(len(timing_records()), 130 * 60 + 2)

    def test_missing_first_last_and_interior_frames_are_rejected(self):
        rows = timing_records()
        for mutated in (rows[1:], rows[:-1], rows[:400] + rows[401:]):
            with self.subTest(length=len(mutated)):
                self.assertFalse(all(self.coverage(mutated)["checks"].values()))
        # Renumbering hides an index hole, but the clock-period hole still fails.
        mutated = rows[:400] + rows[401:]
        mutated = [{**row, "frame": str(i)} for i, row in enumerate(mutated)]
        self.assertFalse(self.coverage(mutated)["checks"]["native_video_cadence_complete"])

    def test_duplicate_timestamp_and_broken_frame_index_are_rejected(self):
        rows = timing_records()
        rows[400] = {**rows[400], "time_ps": rows[399]["time_ps"]}
        self.assertFalse(self.coverage(rows)["checks"]["native_video_cadence_complete"])
        rows = timing_records()
        rows[400] = {**rows[400], "frame": "399"}
        self.assertFalse(self.coverage(rows)["checks"]["native_video_cadence_complete"])

    def test_coin_reset_gap_cannot_mask_a_missing_later_frame(self):
        rows = timing_records("spacerace")
        for i in range(200, len(rows)):
            rows[i] = {**rows[i], "time_ps": str(int(rows[i]["time_ps"]) + 100462325760)}
        result = self.coverage(rows, "spacerace")
        self.assertFalse(result["checks"]["native_video_cadence_complete"])
        self.assertEqual(len(result["source_bound_coin_reset_gaps"]), 1)
        self.assertTrue(result["unexpected_frame_gaps"])

    def test_truncated_pcm_and_odd_or_mismatched_pcm_container_are_rejected(self):
        rows = timing_records()
        self.assertFalse(self.coverage(rows, samples=129 * 48000)["checks"]["native_pcm_duration_complete"])
        for byte_count in (self.samples * 2 - 1, self.samples * 2 - 2):
            with self.subTest(byte_count=byte_count):
                self.assertFalse(self.coverage(rows, pcm_byte_count=byte_count)["checks"]["native_pcm_container_complete"])

    def test_malformed_unsupported_and_empty_evidence_fails_closed(self):
        for rows in ([], [{"frame": "0", "time_ps": "bad"}], [{"frame": "-1", "time_ps": "0"}],
                     [{"frame": False, "time_ps": "16652246960"}], [{"frame": 0.0, "time_ps": "16652246960"}]):
            with self.subTest(rows=rows):
                self.assertFalse(all(self.coverage(rows)["checks"].values()))
        self.assertFalse(all(self.coverage(timing_records(), "unsupported")["checks"].values()))


class RegisteredGameModuleTests(unittest.TestCase):
    """Games ported from 0.2.0 on declare settings and cadence in tools/reference/games/<id>.py."""
    # Reuse the selection fixture without re-running its tests.
    setUp = SelectionGateTests.setUp
    write_requests = SelectionGateTests.write_requests
    write_replay_metadata = SelectionGateTests.write_replay_metadata
    write_rows = SelectionGateTests.write_rows
    validate = SelectionGateTests.validate

    def add_rebound(self, dip=0, pot=0):
        item = {"id": "rebound", "game": "rebound", "replay": "tests/replays/rebound.tsv", "dip": dip, "pot_ohms": pot}
        self.scenarios.append(item)
        replay = self.repo_root / item["replay"]
        replay.parent.mkdir(parents=True, exist_ok=True)
        replay.write_text("Identity-only Rebound replay bytes; no captured gameplay fixture.\n")
        for attempt in ("baseline", "repeat"):
            (self.path / item["id"] / attempt / "epoch0").mkdir(parents=True)
        return item

    def test_only_games_with_a_module_are_registered(self):
        module = MEDIA.registered_game("rebound")
        self.assertEqual((module.GAME, module.CORE_ID), ("rebound", 6))
        for game in ("pong", "pongdoubles", "breakout", "../rebound", "Rebound", "", None, "gotcha-x"):
            with self.subTest(game=game):
                self.assertIsNone(MEDIA.registered_game(game))

    def test_registered_settings_are_validated_by_the_game_module(self):
        item = self.add_rebound()
        for dip in (0, 1, 2, 3):
            with self.subTest(dip=dip):
                item["dip"] = dip
                self.write_requests(self.scenarios)
                self.assertEqual(self.validate()["errors"], [])
        for dip, pot in ((4, 0), (-1, 0), (0, 1), (True, 0), (1.0, 0)):
            with self.subTest(dip=dip, pot=pot):
                item.update(dip=dip, pot_ohms=pot)
                self.write_requests(self.scenarios)
                self.assertTrue(self.validate()["errors"])

    def test_registered_cadence_comes_from_the_module_and_stays_exact(self):
        module = MEDIA.registered_game("rebound")
        duration = 10 * 10**12
        rows, time = [], module.FIRST_FRAME_PS
        while time <= duration:
            rows.append({"frame": str(len(rows)), "time_ps": str(time)})
            time += module.FRAME_PERIOD_PS
        samples = duration * 48000 // 10**12
        self.assertTrue(all(MEDIA.media_coverage(rows, samples, duration, "rebound")["checks"].values()))
        shifted = [{"frame": row["frame"], "time_ps": str(int(row["time_ps"]) + 34920)} for row in rows]
        self.assertFalse(MEDIA.media_coverage(shifted, samples, duration, "rebound")["checks"]["native_video_duration_complete"])
        self.assertFalse(MEDIA.media_coverage(rows[:-2] + rows[-1:], samples, duration, "rebound")["checks"]["native_video_cadence_complete"])

    def test_incomplete_game_module_fails_closed(self):
        directory = self.path / "games"
        directory.mkdir()
        (directory / "partial.py").write_text('GAME = "partial"\nCORE_ID = 31\n')
        (directory / "other.py").write_text("\n".join(f"{name} = None" for name in (
            "CORE_ID", "FIRST_FRAME_PS", "FRAME_PERIOD_PS", "valid_options", "snapshot_objects", "analyze")) + '\nGAME = "rebound"\n')
        original = MEDIA.GAMES_DIRECTORY
        MEDIA.GAMES_DIRECTORY = directory
        MEDIA.registered_game.cache_clear()
        try:
            with self.assertRaises(ValueError):
                MEDIA.registered_game("partial")
            with self.assertRaises(ValueError):
                MEDIA.registered_game("other")
        finally:
            MEDIA.GAMES_DIRECTORY = original
            MEDIA.registered_game.cache_clear()


if __name__ == "__main__":
    unittest.main()
