#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Exercise real browser audio scheduling with an isolated PulseAudio null sink.
# This is automation evidence, never evidence of physical speaker playback.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ $# -gt 0 ]] || { echo 'Usage: tools/with-headless-audio.sh COMMAND [ARG...]' >&2; exit 2; }
if [[ -n "${PULSE_SERVER:-}" ]]; then exec "$@"; fi
LOCAL="$ROOT/build/browser-libs/root"
if [[ -x "$LOCAL/usr/bin/pulseaudio" ]]; then
  PULSE_BIN="$LOCAL/usr/bin/pulseaudio"
  PACTL_BIN="$LOCAL/usr/bin/pactl"
  export LD_LIBRARY_PATH="$LOCAL/usr/lib/x86_64-linux-gnu:$LOCAL/usr/lib/x86_64-linux-gnu/pulseaudio${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  module_dirs=("$LOCAL"/usr/lib/pulse-*/modules)
  [[ ${#module_dirs[@]} == 1 && -d "${module_dirs[0]}" ]] || { echo 'Expected one local PulseAudio module directory' >&2; exit 1; }
  MODULE_ARGS=(--dl-search-path="${module_dirs[0]}")
  export LD_LIBRARY_PATH="${module_dirs[0]}:$LD_LIBRARY_PATH"
elif command -v pulseaudio >/dev/null && command -v pactl >/dev/null; then
  PULSE_BIN=$(command -v pulseaudio)
  PACTL_BIN=$(command -v pactl)
  MODULE_ARGS=()
else
  echo 'No headless PulseAudio daemon; audio assertions will use the available host backend.' >&2
  exec "$@"
fi
mkdir -p "$ROOT/build"
SESSION_DIR=$(mktemp -d "$ROOT/build/headless-audio.XXXXXX")
mkdir -p "$SESSION_DIR/runtime" "$SESSION_DIR/state" "$SESSION_DIR/config"
SOCKET="$SESSION_DIR/native"
PULSE_RUNTIME_PATH="$SESSION_DIR/runtime" PULSE_STATE_PATH="$SESSION_DIR/state" \
XDG_CONFIG_HOME="$SESSION_DIR/config" "$PULSE_BIN" -n --daemonize=no --realtime=no \
  --exit-idle-time=-1 --use-pid-file=no --disable-shm --log-level=warning \
  --log-target="file:$SESSION_DIR/pulse.log" "${MODULE_ARGS[@]}" \
  --load='module-null-sink sink_name=nocpu rate=48000' \
  --load="module-native-protocol-unix socket=$SOCKET auth-anonymous=1" &
DAEMON_PID=$!
cleanup() { kill "$DAEMON_PID" 2>/dev/null || true; wait "$DAEMON_PID" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for ((attempt=0;attempt<50;attempt++)); do
  if [[ -S "$SOCKET" ]] && "$PACTL_BIN" --server="unix:$SOCKET" list short sinks > "$SESSION_DIR/sinks.txt" 2>/dev/null; then break; fi
  kill -0 "$DAEMON_PID" 2>/dev/null || { cat "$SESSION_DIR/pulse.log" >&2; exit 1; }
  sleep 0.1
done
export PULSE_SERVER="unix:$SOCKET"
"$PACTL_BIN" --server="$PULSE_SERVER" list short sinks > "$SESSION_DIR/sinks.txt"
rg -q $'\tnocpu\t' "$SESSION_DIR/sinks.txt" || { echo 'PulseAudio null sink did not initialize' >&2; exit 1; }
echo "Headless audio: real PulseAudio null sink ($SESSION_DIR)" >&2
"$@"
