#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Pinned web dependencies; all mutable caches stay under ignored build/.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
case "${1:-}" in ''|--browsers) ;; *) echo 'Usage: tools/install-web-toolchain.sh [--browsers]' >&2; exit 2;; esac
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12))throw Error("Node 22.12 or newer is required")'
command -v python3 >/dev/null
command -v git >/dev/null
mkdir -p build/npm-cache
npm ci --cache "$ROOT/build/npm-cache" --no-audit --no-fund
SDK_ROOT=${EMSDK:-"$ROOT/build/emsdk"}
SDK_COMMIT=3d6d8ee910466516a53e665b86458faa81dae9ba
if [[ ! -d "$SDK_ROOT" ]]; then
  git clone --no-checkout https://github.com/emscripten-core/emsdk.git "$SDK_ROOT"
  git -C "$SDK_ROOT" checkout --detach "$SDK_COMMIT"
fi
[[ "$(git -C "$SDK_ROOT" rev-parse HEAD)" == "$SDK_COMMIT" ]] || { echo "Expected emsdk checkout $SDK_COMMIT; refusing to overwrite another checkout" >&2; exit 1; }
[[ -z "$(git -C "$SDK_ROOT" status --porcelain --untracked-files=no)" ]] || { echo 'emsdk tracked files have changed' >&2; exit 1; }
"$SDK_ROOT/emsdk" install 3.1.74
"$SDK_ROOT/emsdk" activate 3.1.74
export EM_CONFIG="$SDK_ROOT/.emscripten"
export EM_CACHE=${EM_CACHE:-"$ROOT/build/emscripten-cache"}
mkdir -p "$EM_CACHE"
"$SDK_ROOT/upstream/emscripten/em++" --version
if [[ "${1:-}" == --browsers ]]; then
  export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-"$ROOT/build/playwright"}
  ./node_modules/.bin/playwright install chromium firefox webkit
  # Cloud Debian dependencies can be installed without writing system paths.
  if [[ -f /etc/debian_version ]] && [[ "$(cut -d. -f1 /etc/debian_version)" == 13 ]]; then
    "$ROOT/tools/install-browser-libs.sh"
  fi
fi
