#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Local fast path (make quick): builds, Pong and one scenario per ROM-free game
# against cached original references. A pass is NOT the whole-batch
# qualification; docs/TESTING.md says when the full comparison is required.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
[[ $# == 0 ]] || { echo 'Usage: tools/quick-check.sh (run after make test; see make quick)' >&2; exit 2; }
export NOCPU_REFERENCE_CACHE=${NOCPU_REFERENCE_CACHE:-build/reference-cache}
CPUS=$(nproc 2>/dev/null || echo 2)
export NOCPU_ANALYZE_JOBS=${NOCPU_ANALYZE_JOBS:-$CPUS}
export NOCPU_REPLAY_JOBS=${NOCPU_REPLAY_JOBS:-$CPUS}
# Default: every "<game>-default" scenario of the ROM-free manifest, one per game.
DEFAULT_SCENARIOS=$(python3 -c 'import json; print(",".join(item["id"] for item in json.load(open("tests/replays/game-scenarios.json"))["scenarios"] if item["id"] == item["game"] + "-default"))')
SCENARIOS=${NOCPU_QUICK_SCENARIOS:-$DEFAULT_SCENARIOS}
# Quick runs keep only their latest evidence (about 2.5 GB), under build/quick/.
QUICK="$ROOT/build/quick"
[[ ! -L "$ROOT/build" && ! -L "$QUICK" ]] || { echo 'Build paths must not be symbolic links.' >&2; exit 1; }
rm -rf -- "$QUICK"
mkdir -p -- "$QUICK"
export NOCPU_GAME_REFERENCE_ROOT="$QUICK/reference-games" NOCPU_GAME_EVIDENCE_ROOT="$QUICK/game-evidence"
echo "Quick check: reference cache $NOCPU_REFERENCE_CACHE, scenarios pong,$SCENARIOS"
./tools/build-native.sh --jobs "${BUILD_JOBS:-$CPUS}"
./tools/build-core.sh all
./tools/capture-pong.sh
build/core/native/pong-runner --output build/core/native-evidence --replay tests/replays/pong.tsv --seed 848 --epochs 2
node tools/replay-core.mjs
python3 tools/compare-core.py
./tools/capture-games.sh --scenarios "$SCENARIOS"
ORIGINAL=$(cat build/reference-games/last-run.txt)
./tools/replay-games.sh --original "$ORIGINAL" --subset
echo 'QUICK PASS: Pong and the selected scenarios match original/native/Wasm.'
echo 'This is not the full comparison. Changes to core/, upstream/, tools/reference/, the capture/replay/compare'
echo 'tools or tests/replays/ need the full run (docs/TESTING.md), which CI runs on every such change.'
