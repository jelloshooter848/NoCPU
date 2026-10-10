#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-"$ROOT/build/playwright"}
export XDG_CACHE_HOME=${XDG_CACHE_HOME:-"$ROOT/build/browser-cache"}
mkdir -p "$XDG_CACHE_HOME"
# This optional adapter loads verified, locally extracted Debian dependencies.
# Playwright's normal registry check only consults the system ldconfig cache,
# so it cannot recognize libraries installed without root under build/.
if [[ -d "$ROOT/build/browser-libs/root/usr/lib/x86_64-linux-gnu" ]]; then
  export LD_LIBRARY_PATH="$ROOT/build/browser-libs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  LAUNCHER="$ROOT/build/browser-libs/webkit-launcher.sh"
  cat > "$LAUNCHER" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
bundle=("${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/build/playwright}"/webkit-*)
[[ ${#bundle[@]} == 1 && -d "${bundle[0]}" ]] || { echo 'Expected one installed Playwright WebKit bundle' >&2; exit 1; }
platform=minibrowser-gtk
[[ " $* " != *' --headless '* ]] || platform=minibrowser-wpe
runtime="${bundle[0]}/$platform"
export WEBKIT_EXEC_PATH="$runtime/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$runtime/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$runtime/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1
export LD_LIBRARY_PATH="$runtime/lib:$runtime/sys/lib:$ROOT/build/browser-libs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$runtime/bin/MiniBrowser" "$@"
SH
  chmod +x "$LAUNCHER"
  export NOCPU_WEBKIT_EXECUTABLE="$LAUNCHER"
fi
exec "$ROOT/tools/with-headless-audio.sh" ./node_modules/.bin/playwright test "$@"
