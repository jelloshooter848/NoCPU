#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Fresh retained native/Wasm replay evidence for every declared original scenario.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
usage() {
  echo 'Usage: tools/replay-games.sh [--original RUN --subset]' >&2
  echo 'Default: replay the qualified whole-batch original in build/reference-games/latest.txt.' >&2
  echo '--original RUN --subset: replay a selected-scenario original run (tools/capture-games.sh --scenarios);' >&2
  echo '  the result is a subset check, never the whole-batch qualification, and latest.txt is not moved.' >&2
  echo 'NOCPU_REPLAY_JOBS=N runs up to N native/Wasm replays and comparisons at once (default 1).' >&2
}
SUBSET=0
ORIGINAL=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --original) [[ $# -ge 2 ]] || { usage; exit 2; }; ORIGINAL=$2; shift 2 ;;
    --subset) SUBSET=1; shift ;;
    *) usage; exit 2 ;;
  esac
done
[[ -z "$ORIGINAL" || "$SUBSET" == 1 ]] || { echo '--original requires --subset; the full comparison uses latest.txt.' >&2; exit 2; }
[[ "$SUBSET" == 0 || -n "$ORIGINAL" ]] || { echo '--subset requires --original RUN.' >&2; exit 2; }
JOBS=${NOCPU_REPLAY_JOBS:-1}
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo 'NOCPU_REPLAY_JOBS must be a positive integer.' >&2; exit 2; }
if [[ -z "$ORIGINAL" ]]; then
  [[ -f build/reference-games/latest.txt ]] || { echo 'Capture qualified original game references first.' >&2; exit 1; }
  ORIGINAL=$(cat build/reference-games/latest.txt)
fi
[[ -f "$ORIGINAL/report.json" ]] || { echo 'Missing original reference report.' >&2; exit 1; }
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

# One task is one engine (native or wasm) for one scenario. Each task checks the
# disk reserve before it starts and writes only its own directory and log.
replay_task() {
  local run=$1 engine=$2 id=$3 game=$4 replay=$5 dip=$6 pot=$7
  python3 - "$run" <<'PY' || return 1
import shutil, sys
if shutil.disk_usage(sys.argv[1]).free < 1073741824:
    raise SystemExit('Replay stopped before the next scenario: less than 1 GiB free reserve')
PY
  echo "Replaying $id through $engine, two independent reset epochs"
  if [[ "$engine" == native ]]; then
    build/core/native/pong-runner --output "$run/$id/native" --game "$game" --replay "$replay" --seed 848 --dip "$dip" --pot-ohms "$pot" --epochs 2 > "$run/$id-native.log" 2>&1
  else
    node tools/replay-core.mjs --output "$run/$id/wasm" --game "$game" --replay "$replay" --seed 848 --dip "$dip" --pot-ohms "$pot" --epochs 2 > "$run/$id-wasm.log" 2>&1
  fi || { echo "FAILED: $id $engine replay; see $run/$id-$engine.log" >&2; return 1; }
}
export -f replay_task
while IFS=$'\t' read -r ID GAME REPLAY DIP POT; do
  mkdir -p "$RUN/$ID"
  for ENGINE in native wasm; do
    printf '%s\0' "$RUN" "$ENGINE" "$ID" "$GAME" "$REPLAY" "$DIP" "$POT"
  done
done < "$RUN/scenarios.tsv" > "$RUN/replay-tasks.bin"
echo "Running native/Wasm replays with up to $JOBS at once"
xargs -0 -n 7 -P "$JOBS" bash -c 'replay_task "$@"' replay-task < "$RUN/replay-tasks.bin"
rm -f -- "$RUN/replay-tasks.bin"

COMPARE_ARGS=(--original "$ORIGINAL" --evidence "$RUN" --jobs "$JOBS")
[[ "$SUBSET" == 0 ]] || COMPARE_ARGS+=(--allow-subset)
# The ABI probes are independent of the stream comparison; run them alongside it.
node tools/probe-core-games.mjs --module build/core/wasm/nocpu.js --output "$RUN/abi-games.json" > "$RUN/abi-games.log" 2>&1 &
GAMES_PROBE=$!
BREAKOUT_PROBE=''
if [[ -d "$ORIGINAL/breakout-pilot/baseline/epoch0" && -d "$ORIGINAL/breakout-default/baseline/epoch0" ]]; then
  node tools/probe-core-breakout.mjs --module build/core/wasm/nocpu.js --output "$RUN/abi-breakout.json" \
    --original-epoch "$ORIGINAL/breakout-pilot/baseline/epoch0" \
    --rally-epoch "$ORIGINAL/breakout-default/baseline/epoch0" > "$RUN/abi-breakout.log" 2>&1 &
  BREAKOUT_PROBE=$!
elif [[ "$SUBSET" == 1 ]]; then
  echo 'Breakout ABI probe skipped: this subset has no breakout-pilot and breakout-default originals (the full run requires it).'
else
  echo 'Missing breakout-pilot/breakout-default originals for the Breakout ABI probe.' >&2; exit 1
fi
STATUS=0
python3 tools/compare-games.py "${COMPARE_ARGS[@]}" || STATUS=1
wait "$GAMES_PROBE" || { echo "FAILED: multi-game ABI probe; see $RUN/abi-games.log" >&2; STATUS=1; }
if [[ -n "$BREAKOUT_PROBE" ]]; then
  wait "$BREAKOUT_PROBE" || { echo "FAILED: Breakout ABI probe; see $RUN/abi-breakout.log" >&2; STATUS=1; }
fi
[[ "$STATUS" == 0 ]] || exit 1
if [[ "$SUBSET" == 1 ]]; then
  echo "Subset original/native/Wasm game comparisons passed (not the whole-batch qualification): $RUN/report.json"
  exit 0
fi
mkdir -p build/core/game-evidence
printf '%s\n' "$RUN" > build/core/game-evidence/latest.txt
echo "Original/native/Wasm game comparisons passed: $RUN/report.json"
