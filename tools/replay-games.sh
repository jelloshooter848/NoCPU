#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Fresh retained native/Wasm replay evidence for every declared original scenario.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
[[ $# == 0 ]] || { echo 'Usage: tools/replay-games.sh' >&2; exit 2; }
[[ -f build/reference-games/latest.txt ]] || { echo 'Capture qualified original game references first.' >&2; exit 1; }
ORIGINAL=$(cat build/reference-games/latest.txt)
[[ -f "$ORIGINAL/report.json" ]] || { echo 'Missing qualified original reference report.' >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%S%NZ)
DEST=${NOCPU_GAME_EVIDENCE_ROOT:-"$ROOT/build/core/game-evidence"}
python3 - "$ROOT" "$DEST" <<'PY'
import pathlib, sys
root, destination = map(pathlib.Path, sys.argv[1:])
if not destination.is_absolute() or destination.resolve() != destination \
        or not (destination.is_relative_to(root / 'build') or destination.is_relative_to(pathlib.Path('/tmp'))):
    raise SystemExit('Replay root must be an ordinary absolute directory below build/ or /tmp/')
for path in [destination, *destination.parents]:
    if path.exists() and not path.is_dir():
        raise SystemExit('Replay root ancestor is not a directory')
PY
mkdir -p "$DEST"
RUN="$DEST/$STAMP"
mkdir "$RUN"
cp tests/replays/game-scenarios.json "$RUN/scenario-manifest.json"
cp "$ORIGINAL/scenarios.tsv" "$RUN/scenarios.tsv"
cp "$ORIGINAL/replay-hashes.json" "$RUN/replay-hashes.json"
printf '%s\n' "$ORIGINAL" > "$RUN/original.txt"
while IFS=$'\t' read -r ID GAME REPLAY DIP POT; do
  python3 - "$RUN" <<'PY'
import shutil, sys
if shutil.disk_usage(sys.argv[1]).free < 1073741824:
    raise SystemExit('Replay stopped before the next scenario: less than 1 GiB free reserve')
PY
  mkdir -p "$RUN/$ID"
  echo "Replaying $ID through native and Wasm, two independent reset epochs"
  build/core/native/pong-runner --output "$RUN/$ID/native" --game "$GAME" --replay "$REPLAY" --seed 848 --dip "$DIP" --pot-ohms "$POT" --epochs 2 > "$RUN/$ID-native.log" 2>&1
  node tools/replay-core.mjs --output "$RUN/$ID/wasm" --game "$GAME" --replay "$REPLAY" --seed 848 --dip "$DIP" --pot-ohms "$POT" --epochs 2 > "$RUN/$ID-wasm.log" 2>&1
done < "$RUN/scenarios.tsv"
python3 tools/compare-games.py --original "$ORIGINAL" --evidence "$RUN"
node tools/probe-core-games.mjs --module build/core/wasm/nocpu.js --output "$RUN/abi-games.json" > "$RUN/abi-games.log" 2>&1
node tools/probe-core-breakout.mjs --module build/core/wasm/nocpu.js --output "$RUN/abi-breakout.json" \
  --original-epoch "$ORIGINAL/breakout-pilot/baseline/epoch0" \
  --rally-epoch "$ORIGINAL/breakout-default/baseline/epoch0" > "$RUN/abi-breakout.log" 2>&1
mkdir -p build/core/game-evidence
printf '%s\n' "$RUN" > build/core/game-evidence/latest.txt
echo "Original/native/Wasm game comparisons passed: $RUN/report.json"
