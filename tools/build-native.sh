#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: tools/build-native.sh [--jobs N] [--rebuild-image]

Compile an untouched copy of upstream/dice-0.9 into build/native/dice.
Requires Docker with access to its daemon. All build outputs stay in build/native.

Options:
  --jobs N         Positive parallel build count (default BUILD_JOBS, otherwise 2).
  --rebuild-image  Rebuild the toolchain image and check the pinned base image.
  --help          Show this help.

Environment:
  BUILD_JOBS          Same as --jobs N.
  NOCPU_NATIVE_IMAGE  Toolchain image tag (default nocpu-dice-qt4:0.1.0).
  DOCKER_CONFIG      Docker's normal client configuration; respected if set.
  NOCPU_DOCKER_BUILD_NETWORK  Package-download network (default host).
EOF
}

fail() {
    printf 'Native build failed: %s\n' "$*" >&2
    exit 1
}

jobs="${BUILD_JOBS:-2}"
rebuild_image=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --jobs)
            [[ $# -ge 2 ]] || fail '--jobs requires a positive integer'
            jobs="$2"
            shift 2
            ;;
        --rebuild-image)
            rebuild_image=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *) fail "unknown argument: $1 (use --help)" ;;
    esac
done
[[ "$jobs" =~ ^[1-9][0-9]*$ ]] || fail '--jobs / BUILD_JOBS must be a positive integer'

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/upstream/dice-0.9"
build_dir="$repo_root/build/native"
image="${NOCPU_NATIVE_IMAGE:-nocpu-dice-qt4:0.1.0}"

[[ -f "$source_dir/Makefile" && -f "$source_dir/game_list.h" ]] || fail "original DICE source missing: $source_dir"
command -v docker >/dev/null || fail 'Docker is not installed; install Docker Engine or Docker Desktop'

# Keep Docker buildx client state inside the ignored build tree on managed
# environments with a read-only home directory. Never copy user credentials.
[[ ! -L "$repo_root/build" && ! -L "$build_dir" ]] || fail 'build paths must not be symbolic links'
mkdir -p -- "$repo_root/build"
if [[ -z "${DOCKER_CONFIG+x}" ]]; then
    if { [[ -d "${HOME}/.docker" ]] && [[ ! -w "${HOME}/.docker" ]]; } \
       || { [[ ! -d "${HOME}/.docker" ]] && [[ ! -w "$HOME" ]]; }; then
        export DOCKER_CONFIG="$repo_root/build/docker-config"
        [[ ! -L "$DOCKER_CONFIG" ]] || fail 'Docker client state path must not be a symbolic link'
        mkdir -p -- "$DOCKER_CONFIG"
        printf 'Using writable Docker client state: %s\n' "$DOCKER_CONFIG"
    fi
fi
docker info >/dev/null 2>&1 || fail 'Docker daemon unavailable; start Docker and grant your user daemon access'

if "$rebuild_image" || ! docker image inspect "$image" >/dev/null 2>&1; then
    docker build --platform linux/amd64 --pull \
        --network "${NOCPU_DOCKER_BUILD_NETWORK:-host}" \
        --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
        --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy \
        --tag "$image" "$repo_root/tools/native"
fi

docker run --rm --platform linux/amd64 --network none "$image" \
    /usr/local/bin/nocpu-check-toolchain

# Refuse redirected output directories before removing the previous build.
[[ ! -L "$repo_root/build" && ! -L "$build_dir" ]] || fail 'build paths must not be symbolic links'
rm -rf -- "$build_dir"
mkdir -- "$build_dir"

docker run --rm --platform linux/amd64 --network none \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$repo_root,target=/repo,readonly" \
    --mount "type=bind,source=$build_dir,target=/build" \
    --workdir /build "$image" /bin/bash -euo pipefail -c \
    'cp -a /repo/upstream/dice-0.9/. /build/; cp -a /usr/local/share/nocpu-toolchain /build/toolchain-provenance; /usr/local/bin/nocpu-check-toolchain > /build/toolchain-provenance/check.txt; make -j "$1"; test -x /build/dice; sha256sum dice > /build/toolchain-provenance/binary.sha256' \
    nocpu-native-build "$jobs"

docker image inspect --format '{{.Id}}' "$image" > "$build_dir/toolchain-provenance/image-id.txt"

printf '\nNative reference built: %s/dice\nToolchain image: %s\n' "$build_dir" "$image"
