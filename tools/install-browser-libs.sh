#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Debian 13 cloud fallback. apt verifies signed indexes and package hashes.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
[[ -f /etc/debian_version && "$(cut -d. -f1 /etc/debian_version)" == 13 ]] || { echo 'Local browser libraries require Debian 13; on CI use playwright install --with-deps.' >&2; exit 1; }
BASE="$ROOT/build/browser-libs"
mkdir -p "$BASE/apt/configparts" "$BASE/apt/lists/partial" "$BASE/apt/archives/partial" "$BASE/root"
cat > "$BASE/apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
SOURCES
cat > "$BASE/apt/apt.conf" <<CONF
Dir::Etc::Parts "$BASE/apt/configparts";
Dir::Etc::sourcelist "$BASE/apt/sources.list";
Dir::Etc::sourceparts "$BASE/apt/configparts";
Dir::State "$BASE/apt";
Dir::State::status "/var/lib/dpkg/status";
Dir::State::lists "$BASE/apt/lists";
Dir::Cache "$BASE/apt";
Dir::Cache::archives "$BASE/apt/archives";
APT::Sandbox::User "$(id -un)";
Acquire::Retries "3";
CONF
APT_CONFIG="$BASE/apt/apt.conf" /usr/bin/apt-get update
cd "$BASE/apt/archives"
APT_CONFIG="$BASE/apt/apt.conf" /usr/bin/apt-get download libwoff1 libharfbuzz-icu0 libhyphen0 libgles2 libcairo-script-interpreter2 liblzo2-2 libgtk-4-1 libgtk-4-common libgraphene-1.0-0 libmanette-0.2-0 libhidapi-hidraw0 pulseaudio pulseaudio-utils libspeexdsp1 libtdb1 libwebrtc-audio-processing-1-3 libwrap0 libasound2-plugins
for package in ./*.deb; do dpkg-deb -x "$package" "$BASE/root"; done
sha256sum ./*.deb > "$BASE/packages.sha256"
echo "Verified Debian browser libraries extracted to $BASE/root"
