#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
    cat <<'EOF'
Usage: tools/capture-pong.sh

Requires tools/build-native.sh to have produced build/native/dice.
Build a reviewable observation/input adapter in build/reference/source, then
capture two fixed-seed native Pong runs, each with an in-process recreation.
Outputs and assertion report: build/reference/report.json.

Environment: NOCPU_NATIVE_IMAGE (same image used by build-native.sh),
BUILD_JOBS (default 2), NOCPU_REFERENCE_TIMEOUT (seconds per run, default 180),
NOCPU_REFERENCE_CACHE (directory below build/ or /tmp/: reuse an original
capture whose inputs are unchanged, see tools/reference-cache.py; the analysis
below always runs).
No ROM is required. SDL dummy playback is used; generated native PCM is captured.
EOF
    exit 0
fi
[[ $# == 0 ]] || { printf 'Unexpected argument; use --help.\n' >&2; exit 2; }
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
native_dir="$repo_root/build/native"
reference_dir="$repo_root/build/reference"
image="${NOCPU_NATIVE_IMAGE:-nocpu-dice-qt4:0.1.0}"
jobs="${BUILD_JOBS:-2}"
timeout_seconds="${NOCPU_REFERENCE_TIMEOUT:-180}"
[[ "$jobs" =~ ^[1-9][0-9]*$ && "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || {
    printf 'BUILD_JOBS and NOCPU_REFERENCE_TIMEOUT must be positive integers.\n' >&2; exit 2;
}
[[ -x "$native_dir/dice" ]] || { printf 'Run tools/build-native.sh first.\n' >&2; exit 1; }
[[ ! -L "$repo_root/build" && ! -L "$reference_dir" && ! -L "$native_dir" ]] || {
    printf 'Build paths must not be symbolic links.\n' >&2; exit 1;
}
command -v python3 >/dev/null
command -v docker >/dev/null
docker image inspect "$image" >/dev/null
rm -rf -- "$reference_dir"
mkdir -p -- "$reference_dir/source"
docker image inspect --format '{{.Id}}' "$image" > "$reference_dir/capture-image-id.txt"
cp -a -- "$native_dir/." "$reference_dir/source/"
python3 "$repo_root/tools/reference/apply_adapter.py" "$reference_dir/source" "$repo_root/tools/reference"
printf 'Building native observation/input adapter.\n'
docker run --rm --platform linux/amd64 --network none \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$reference_dir/source,target=/source" \
    --workdir /source "$image" /bin/bash -euo pipefail -c 'make -j "$1"' \
    nocpu-reference-build "$jobs" > "$reference_dir/build.log" 2>&1

cache="${NOCPU_REFERENCE_CACHE:-}"
fresh=true
if [[ -n "$cache" ]]; then
    status=0
    # The key is computed once, before capture; store refuses if any input changes meanwhile.
    key=$(python3 "$repo_root/tools/reference-cache.py" key --kind pong --scenario pong --source "$reference_dir/source")
    python3 "$repo_root/tools/reference-cache.py" restore --kind pong --scenario pong \
        --source "$reference_dir/source" --key "$key" --run "$reference_dir" --into "$reference_dir" \
        --receipt "$reference_dir/reference-cache.jsonl" || status=$?
    if [[ "$status" == 0 ]]; then
        fresh=false
    elif [[ "$status" != 3 ]]; then
        printf 'Reference cache restore failed.\n' >&2; exit 1
    fi
else
    printf 'Reference cache disabled (NOCPU_REFERENCE_CACHE unset): capturing the original fresh.\n'
fi
for run in baseline repeat; do
    "$fresh" || break
    mkdir -- "$reference_dir/$run"
    printf 'Capturing %s: two 16-second simulation epochs, seed 848.\n' "$run"
    # The historical nall::userpath requires getpwuid(getuid()) to succeed.
    # Use the image's existing root account inside this disposable container;
    # source/repository mounts remain read-only, runtime network is disabled.
    docker run --rm --platform linux/amd64 --network none \
        --env SDL_AUDIODRIVER=dummy --env LIBGL_ALWAYS_SOFTWARE=1 \
        --env NOCPU_REFERENCE_OUTPUT=/artifacts \
        --env NOCPU_REFERENCE_REPLAY=/repo/tests/replays/pong.tsv \
        --env NOCPU_REFERENCE_SEED=848 \
        --mount "type=bind,source=$repo_root,target=/repo,readonly" \
        --mount "type=bind,source=$reference_dir/source,target=/source,readonly" \
        --mount "type=bind,source=$reference_dir/$run,target=/artifacts" \
        --workdir /source "$image" /bin/bash -euo pipefail -c \
        'trap '\''chown -R "$2:$3" /artifacts'\'' EXIT; python3 /repo/tools/reference/check-config-isolation.py; timeout "$1" xvfb-run -a -s "-screen 0 800x600x24 +extension GLX" ./dice pong -window' \
        nocpu-reference-run "${timeout_seconds}s" "$(id -u)" "$(id -g)" \
        > "$reference_dir/$run.log" 2>&1
done
python3 "$repo_root/tools/reference/analyze.py" "$reference_dir"
python3 "$repo_root/tests/test-reference-analysis.py" --reference-dir "$reference_dir"
if [[ -n "$cache" ]] && "$fresh"; then
    python3 "$repo_root/tools/reference-cache.py" store --kind pong --scenario pong \
        --source "$reference_dir/source" --key "$key" --run "$reference_dir" --capture "$reference_dir" \
        --receipt "$reference_dir/reference-cache.jsonl"
fi
printf 'Native Pong assertions passed: %s/report.json\n' "$reference_dir"
