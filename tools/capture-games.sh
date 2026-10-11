#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Independent original desktop reference for the authorized ROM-free game batch.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo 'Usage: tools/capture-games.sh [--scenario ID | --explore]'
  echo 'Requires the pinned original build. Fresh baseline/repeat processes capture original inputs, GL and PCM.'
  exit 0
fi
SELECTED=''
EXPLORE=0
EXPLORATION_MS=${NOCPU_GAME_EXPLORATION_MS:-7000}
if [[ $# == 2 && "$1" == --scenario ]]; then SELECTED=$2; elif [[ $# == 1 && "$1" == --explore ]]; then EXPLORE=1; elif [[ $# != 0 ]]; then echo 'Use --help.' >&2; exit 2; fi
NATIVE="$ROOT/build/native"
DEST=${NOCPU_GAME_REFERENCE_ROOT:-"$ROOT/build/reference-games"}
LATEST="$ROOT/build/reference-games/latest.txt"
IMAGE=${NOCPU_NATIVE_IMAGE:-nocpu-dice-qt4:0.1.0}
JOBS=${BUILD_JOBS:-2}
TIMEOUT=${NOCPU_REFERENCE_TIMEOUT:-900}
[[ "$JOBS" =~ ^[1-9][0-9]*$ && "$TIMEOUT" =~ ^[1-9][0-9]*$ ]] || { echo 'Positive build/timeout limits required.' >&2; exit 2; }
[[ -x "$NATIVE/dice" && ! -L build && ! -L "$DEST" && ! -L "$NATIVE" ]] || { echo 'Build the original native DICE source first; build paths must be ordinary directories.' >&2; exit 1; }
python3 - "$ROOT" "$DEST" "$EXPLORE" <<'PY'
import pathlib, sys
root, destination = map(pathlib.Path, sys.argv[1:3])
if not destination.is_absolute() or destination.resolve() != destination \
        or not (destination.is_relative_to(root / 'build') or destination.is_relative_to(pathlib.Path('/tmp'))):
    raise SystemExit('Reference root must be an ordinary absolute directory below build/ or /tmp/')
if sys.argv[3] == '1' and not destination.is_relative_to(root):
    raise SystemExit('External reference roots support full/selected captures; exploration requires the default repository build root')
for path in [destination, *destination.parents]:
    if path.exists() and not path.is_dir():
        raise SystemExit('Reference root ancestor is not a directory')
PY
mkdir -p "$DEST"
# A single invocation owns this source directory; independent previous runs are retained.
STAMP=$(date -u +%Y%m%dT%H%M%S%NZ)
RUN="$DEST/$STAMP"
mkdir "$RUN"
mkdir "$RUN/source"
# Persist incomplete source/I/O identity on a real build/capture failure.
trap 'python3 tools/reference/capture_metadata.py "$RUN" --failed || true' ERR
cp -a "$NATIVE/." "$RUN/source/"
python3 tools/reference/apply_adapter.py "$RUN/source" tools/reference
docker image inspect --format '{{.Id}}' "$IMAGE" > "$RUN/capture-image-id.txt"
python3 - "$SELECTED" "$RUN/scenarios.tsv" "$EXPLORE" "$EXPLORATION_MS" <<'PY'
import hashlib, json, pathlib, sys
selected, destination, explore, exploration_ms = sys.argv[1:]
exploration_ms = int(exploration_ms)
if not 1000 <= exploration_ms <= 170000:
    raise SystemExit("Exploration must be bounded to 1000..170000 ms")
manifest = json.loads(pathlib.Path('tests/replays/game-scenarios.json').read_text())
scenarios = [item for item in manifest['scenarios'] if not selected or item['id'] == selected]
if explore == '1':
    scenarios = [item.copy() for item in scenarios if item['id'].endswith('-default')]
    for item in scenarios:
        replay = pathlib.Path(item['replay'])
        target = pathlib.Path(destination).parent / (item['id'] + '-exploration.tsv')
        rows = [line for line in replay.read_text().splitlines() if line.strip() and not line.startswith('#')
                and int(line.split()[0]) < exploration_ms and line.split()[1] != 'recreate']
        target.write_text(f'# Bounded {exploration_ms}-ms original exploration; not final qualification.\n' + '\n'.join(rows) + f'\n{exploration_ms} recreate 1\n')
        item['replay'] = target.relative_to(pathlib.Path.cwd()).as_posix()
    (pathlib.Path(destination).parent / 'EXPLORATION.json').write_text(json.dumps({'qualified': False, 'purpose': 'Retained original geometry/control/timer calibration only', 'scenarios': scenarios}, indent=2) + '\n')
if not scenarios:
    raise SystemExit('Unknown selected game scenario')
run = pathlib.Path(destination).parent
(run / 'scenario-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(run / 'replay-hashes.json').write_text(json.dumps({'schema_version': 1, 'replays': {item['id']: {'path': item['replay'], 'sha256': hashlib.sha256(pathlib.Path(item['replay']).read_bytes()).hexdigest()} for item in scenarios}}, indent=2) + '\n')
with open(destination, 'w') as stream:
    for item in scenarios:
        stream.write('\t'.join(str(item[key]) for key in ['id', 'game', 'replay', 'dip', 'pot_ohms']) + '\n')
PY
echo "Building original observation adapter: $RUN"
docker run --rm --platform linux/amd64 --network none --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$RUN/source,target=/source" --workdir /source "$IMAGE" \
  /bin/bash -euo pipefail -c 'make -j "$1"' nocpu-game-reference-build "$JOBS" > "$RUN/build.log" 2>&1
while IFS=$'\t' read -r ID GAME REPLAY DIP POT; do
  for ATTEMPT in baseline repeat; do
    python3 - "$RUN" <<'PY'
import shutil, sys
if shutil.disk_usage(sys.argv[1]).free < 1073741824:
    raise SystemExit('Capture stopped before the next attempt: less than 1 GiB free reserve')
PY
    mkdir -p "$RUN/$ID/$ATTEMPT"
    echo "Capturing original $ID ($ATTEMPT), fresh process, seed 848"
    docker run --rm --platform linux/amd64 --network none \
      --env SDL_AUDIODRIVER=dummy --env LIBGL_ALWAYS_SOFTWARE=1 \
      --env NOCPU_REFERENCE_OUTPUT=/artifacts --env "NOCPU_REFERENCE_REPLAY=/repo/$REPLAY" \
      --env NOCPU_REFERENCE_SEED=848 --env "NOCPU_REFERENCE_GAME=$GAME" --env NOCPU_REFERENCE_EPOCHS=1 \
      --env "NOCPU_REFERENCE_DIP=$DIP" --env "NOCPU_REFERENCE_POT_OHMS=$POT" \
      --mount "type=bind,source=$ROOT,target=/repo,readonly" \
      --mount "type=bind,source=$RUN/source,target=/source,readonly" \
      --mount "type=bind,source=$RUN/$ID/$ATTEMPT,target=/artifacts" \
      --workdir /source "$IMAGE" /bin/bash -euo pipefail -c \
      'trap '\''chown -R "$3:$4" /artifacts'\'' EXIT; python3 /repo/tools/reference/check-config-isolation.py; timeout "$1" xvfb-run -a -s "-screen 0 800x600x24 +extension GLX" ./dice "$2" -window' \
      nocpu-game-reference-run "${TIMEOUT}s" "$GAME" "$(id -u)" "$(id -g)" > "$RUN/$ID/$ATTEMPT.log" 2>&1
  done
done < "$RUN/scenarios.tsv"
python3 tools/reference/capture_metadata.py "$RUN"
trap - ERR
if [[ "$EXPLORE" == 1 ]]; then
  echo "Original short exploration captured; no qualification claim: $RUN/EXPLORATION.json"
  exit 0
fi
python3 tools/reference/analyze-games.py "$RUN"
if python3 - "$RUN/report.json" <<'PY'
import json, sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('whole_batch_qualified') else 1)
PY
then
  mkdir -p "$(dirname -- "$LATEST")"
  printf '%s\n' "$RUN" > "$LATEST"
  echo "Original whole game reference qualification passed: $RUN/report.json"
else
  echo "Selected original scenario passed; whole batch pointer unchanged: $RUN/report.json"
fi
