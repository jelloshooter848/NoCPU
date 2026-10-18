#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Build an auditable disposable DICE core; never modify the archived DICE tree.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
TARGET=${1:-all}
case "$TARGET" in native|wasm|all) ;; *) echo 'Usage: tools/build-core.sh [native|wasm|all]' >&2; exit 2;; esac
mkdir -p build/core
# A build invocation owns this directory. Do not prepare/build it concurrently.
python3 tools/prepare-core.py --output build/core/source
mapfile -t SOURCES < build/core/sources.txt
SOURCES+=("$ROOT/core/api.cpp" "$ROOT/core/platform/portable_input.cpp")
# Each game ported from 0.2.0 on registers its access contract in core/games/<id>.cpp.
mapfile -t GAME_DEFINITIONS < <(find "$ROOT/core/games" -maxdepth 1 -name '*.cpp' | LC_ALL=C sort)
SOURCES+=("${GAME_DEFINITIONS[@]}")
COMMON=(-std=c++14 -O3 -fexceptions -I "$ROOT/build/core/source" -I "$ROOT/core")

record_build() {
  local target=$1 compiler=$2 version=$3
  shift 3
  python3 - "$target" "$compiler" "$version" "${COMMON[@]}" "$@" <<'PY'
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path.cwd();target,compiler,version=sys.argv[1:4]
out=root/'build/core'/target
inputs=[root/p for p in ('core/nocpu.h','core/api.cpp','core/port_hooks.h','core/game_registry.h','core/platform/portable_input.cpp','tools/prepare-core.py','tools/build-core.sh','VERSION','tests/source-manifest.json')]
inputs+=sorted(p for p in (root/'core/platform').rglob('*') if p.is_file())
inputs+=sorted(p for p in (root/'core/games').glob('*') if p.is_file())
if target=='native':inputs.append(root/'core/native_runner.cpp')
inputs+=sorted(p for p in (root/'build/core/source').rglob('*') if p.is_file())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files={str(p.relative_to(root)):digest(p) for p in inputs}
outputs={p.name:digest(p) for p in sorted(out.iterdir()) if p.is_file() and p.name!='build-provenance.json'}
compiled=(root/'build/core/sources.txt').read_text().splitlines()+[str(root/'core/api.cpp'),str(root/'core/platform/portable_input.cpp')]
compiled+=[str(p) for p in sorted((root/'core/games').glob('*.cpp'))]
if target=='native':compiled.append(str(root/'core/native_runner.cpp'))
games=json.loads((root/'build/core/adapter-files.json').read_text())['games']
data={'target':target,'abi':5,'games':games,'compiler':compiler,'compiler_version':version,'flags':sys.argv[4:], 'compiled_sources':compiled,'source_manifest_sha256':digest(root/'tests/source-manifest.json'),'inputs':files,'outputs':outputs,'threads':False,'fast_math':False,'lto':False}
(out/'build-provenance.json').write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')
PY
}

if [[ "$TARGET" == native || "$TARGET" == all ]]; then
  CXX=${CXX:-g++}
  command -v "$CXX" >/dev/null
  [[ -f core/native_runner.cpp ]] || { echo 'Missing core/native_runner.cpp' >&2; exit 1; }
  mkdir -p build/core/native
  "$CXX" "${COMMON[@]}" "${SOURCES[@]}" core/native_runner.cpp -lz -Wl,-Map=build/core/native/linker.map -o build/core/native/pong-runner
  "$CXX" "${COMMON[@]}" -MM "${SOURCES[@]}" core/native_runner.cpp > build/core/native/dependencies.mk
  record_build native "$CXX" "$("$CXX" --version | head -1)" -lz -Wl,-Map=build/core/native/linker.map
fi

if [[ "$TARGET" == wasm || "$TARGET" == all ]]; then
  SDK_ROOT=${EMSDK:-"$ROOT/build/emsdk"}
  EMXX="$SDK_ROOT/upstream/emscripten/em++"
  [[ -x "$EMXX" ]] || { echo 'Install Emscripten with tools/install-web-toolchain.sh first.' >&2; exit 1; }
  export EM_CONFIG="$SDK_ROOT/.emscripten"
  EM_VERSION=$("$EMXX" --version | head -1)
  [[ "$EM_VERSION" == *' 3.1.74 '* ]] || { echo "Expected Emscripten 3.1.74; got $EM_VERSION" >&2; exit 1; }
  # Reproducible output across checkout paths. Emscripten builds missing system
  # libraries on demand with source paths relative to the cache, and libc++abi
  # embeds one, so the Wasm bytes depended on where the checkout and cache were.
  # embuilder builds them with deterministic paths (-ffile-prefix-map to
  # /emsdk/emscripten) into a cache dedicated to that recipe; the link then
  # runs with a frozen cache so nothing can be rebuilt path-dependently.
  # Our own sources map the checkout (and an outside SDK) the same way.
  SYSTEM_LIBS=(libGL-getprocaddr libal libc libc++ libc++abi libcompiler_rt libdlmalloc libhtml5 libnoexit libsockets libstubs)
  CACHE_KEY=$(printf '%s\n' "$EM_VERSION" 'embuilder deterministic_paths v1' "${SYSTEM_LIBS[@]}" | sha256sum | cut -c1-12)
  export EM_CACHE=${NOCPU_EM_CACHE:-"$ROOT/build/emscripten-cache-repro-$CACHE_KEY"}
  mkdir -p "$EM_CACHE" build/core/wasm web/public/core
  if [[ ! -f "$EM_CACHE/nocpu-system-libs.stamp" ]]; then
    "$SDK_ROOT/upstream/emscripten/embuilder" build sysroot "${SYSTEM_LIBS[@]}"
    printf '%s\n' "$CACHE_KEY" > "$EM_CACHE/nocpu-system-libs.stamp"
  fi
  export EM_FROZEN_CACHE=1
  PREFIX_MAPS=("-ffile-prefix-map=$ROOT=/nocpu")
  SDK_REAL=$(cd -- "$SDK_ROOT" && pwd -P)
  [[ "$SDK_REAL/" == "$(pwd -P)/"* ]] || PREFIX_MAPS+=("-ffile-prefix-map=$SDK_REAL=/emsdk")
  EXPORTS=$(python3 - <<'PY'
import json,re
from pathlib import Path
names=re.findall(r'\b(nocpu_\w+)\s*\(',Path('core/nocpu.h').read_text())
print(json.dumps(['_'+name for name in dict.fromkeys(names)]))
PY
)
  # Pin Pong's original optimizer tables need about 590 MB of Wasm memory
  # (OPTIMIZATION_HINT queues); memory grows on demand up to 2 GiB.
  WASM_FLAGS=(--no-entry -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648
    -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 "-sEXPORTED_FUNCTIONS=$EXPORTS"
    -Wl,-Map=build/core/wasm/linker.map)
  "$EMXX" "${COMMON[@]}" "${PREFIX_MAPS[@]}" "${SOURCES[@]}" "${WASM_FLAGS[@]}" -o build/core/wasm/nocpu.js
  "$EMXX" "${COMMON[@]}" -MM "${SOURCES[@]}" > build/core/wasm/dependencies.mk
  cp build/core/wasm/nocpu.js build/core/wasm/nocpu.wasm web/public/core/
  record_build wasm "$EMXX" "$EM_VERSION" "${PREFIX_MAPS[@]}" "${WASM_FLAGS[@]}"
fi
