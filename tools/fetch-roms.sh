#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Fetch the private NoCPU-Roms development/CI fixtures into ignored local
# storage, then audit their CRC/size identities against the public manifest.
# Exit status: 0 fetched and audited, 1 usage/safety/audit failure,
# 77 blocked: the fixture repository is unreachable or access is not granted.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
BLOCKED=77
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  cat <<'EOF'
Usage: tools/fetch-roms.sh
Clone or update the private ROM fixture repository and audit it.

  NOCPU_ROMS_REPO   source (default https://github.com/jelloshooter848/NoCPU-Roms.git;
                    a local path or file:// URL also works)
  NOCPU_ROMS_REF    branch/tag/commit to fetch (default: the remote's HEAD)
  NOCPU_ROM_DIR     destination (default build/roms, ignored by Git)
  NOCPU_ROMS_TOKEN  optional HTTPS token (CI). Passed to Git through environment
                    configuration as an HTTP header; never placed in a URL or log.
                    Without it, existing Git credentials are used.

Exit 0 = fetched and audited; 1 = failure; 77 = blocked: no ROM access.
EOF
  exit 0
fi
[[ $# == 0 ]] || { echo 'Use --help.' >&2; exit 1; }

REPO=${NOCPU_ROMS_REPO:-https://github.com/jelloshooter848/NoCPU-Roms.git}
REF=${NOCPU_ROMS_REF:-HEAD}
DIR=${NOCPU_ROM_DIR:-$ROOT/build/roms}
[[ "$DIR" == /* ]] || DIR="$PWD/$DIR"
# Never echo credentials that may be embedded as URL user information.
DISPLAY_REPO=$(printf '%s' "$REPO" | sed -E 's#(://)[^/@]*@#\1***@#')

# Inside this checkout the destination must be Git-ignored, so fixtures can
# never be staged. Outside the checkout any ordinary directory is accepted.
python3 - "$ROOT" "$DIR" <<'PY'
import pathlib, subprocess, sys
root, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
for path in [target, *target.parents]:
    if path.is_symlink():
        raise SystemExit('ROM directory and its ancestors must not be symlinks')
    if path.exists() and not path.is_dir():
        raise SystemExit('ROM directory ancestor is not a directory')
resolved = target.resolve()
if resolved == root or resolved.is_relative_to(root):
    relative = resolved.relative_to(root).as_posix()
    probe = relative + '/probe.txt'
    if subprocess.run(['git', '-C', str(root), 'check-ignore', '-q', '--no-index', probe]).returncode != 0:
        raise SystemExit(f'Refusing ROM directory {relative}/: it is inside the checkout but not Git-ignored')
PY

export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
if [[ -n "${NOCPU_ROMS_TOKEN:-}" ]]; then
  case "$REPO" in
    https://github.com/*) ;;
    *) echo 'NOCPU_ROMS_TOKEN is only sent to https://github.com/ sources.' >&2; exit 1 ;;
  esac
  HEADER=$(printf 'x-access-token:%s' "$NOCPU_ROMS_TOKEN" | base64 | tr -d '\n')
  # GitHub masks the secret itself, not this derived value.
  [[ "${GITHUB_ACTIONS:-}" == true ]] && echo "::add-mask::$HEADER"
  # Environment-supplied config: absent from argv, URLs, .git/config and logs.
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $HEADER"
  unset HEADER
fi

blocked() {
  echo "blocked: no ROM access ($1: $DISPLAY_REPO). ROM-dependent checks are not run." >&2
  exit "$BLOCKED"
}

if [[ -d "$DIR/.git" ]]; then
  CURRENT=$(git -C "$DIR" remote get-url origin 2>/dev/null || true)
  [[ "$CURRENT" == "$REPO" ]] || { echo "Existing $DIR has a different origin; remove it or set NOCPU_ROM_DIR." >&2; exit 1; }
  echo "Updating ROM fixtures in $DIR from $DISPLAY_REPO ($REF)"
  git -C "$DIR" fetch --quiet --depth 1 --no-tags origin "$REF" 2>/dev/null || blocked 'fetch failed'
  git -C "$DIR" checkout --quiet --force --detach FETCH_HEAD
elif [[ -e "$DIR" && -n "$(ls -A "$DIR" 2>/dev/null)" ]]; then
  echo "$DIR exists and is not a fixture checkout; audit it with tools/audit-roms.py --rom-dir instead." >&2
  exit 1
else
  echo "Cloning ROM fixtures into $DIR from $DISPLAY_REPO ($REF)"
  mkdir -p "$(dirname -- "$DIR")"
  rmdir "$DIR" 2>/dev/null || true
  git init --quiet "$DIR"
  git -C "$DIR" remote add origin "$REPO"
  if ! git -C "$DIR" fetch --quiet --depth 1 --no-tags origin "$REF" 2>/dev/null; then
    rm -rf -- "$DIR"
    blocked 'clone failed'
  fi
  git -C "$DIR" checkout --quiet --detach FETCH_HEAD
fi
chmod 700 "$DIR"
echo "ROM fixture commit: $(git -C "$DIR" rev-parse HEAD)"
python3 "$ROOT/tools/audit-roms.py" --rom-dir "$DIR"
