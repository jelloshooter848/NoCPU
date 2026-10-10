#!/usr/bin/env bash
set -euo pipefail

fail() {
    printf 'Native toolchain check failed: %s\n' "$*" >&2
    exit 1
}

# This historical environment is a reference for the untouched 2014 source.
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 18.04 ]] || fail 'expected Ubuntu 18.04'
[[ "$(dpkg --print-architecture)" == amd64 ]] || fail 'expected linux/amd64'

[[ "$(gcc -dumpfullversion)" == 7.5.0 ]] || fail 'expected GCC 7.5.0'
[[ "$(g++ -dumpfullversion)" == 7.5.0 ]] || fail 'expected G++ 7.5.0'
[[ "$(qmake -query QT_VERSION)" == 4.8.7 ]] || fail 'expected Qt 4.8.7'
[[ "$(sdl-config --version)" == 1.2.15 ]] || fail 'expected SDL 1.2.15'

check_package() {
    local package="$1" expected="$2" actual
    actual="$(dpkg-query -W -f='${Version}' "$package")"
    [[ "$actual" == "$expected" ]] || fail "$package: expected $expected, got $actual"
}

check_package gcc-7 '7.5.0-3ubuntu1~18.04'
check_package g++-7 '7.5.0-3ubuntu1~18.04'
check_package libqt4-dev '4:4.8.7+dfsg-7ubuntu1'
check_package libsdl1.2-dev '1.2.15+dfsg2-0.1ubuntu0.2'
check_package libgl1-mesa-dev '20.0.8-0ubuntu1~18.04.1'
check_package libgl1-mesa-dri '20.0.8-0ubuntu1~18.04.1'
check_package libxi-dev '2:1.7.9-1'

pkg-config --exists QtCore QtGui gl xi || fail 'missing development pkg-config metadata'
for command in make gcc g++ moc qmake sdl-config Xvfb xauth xdotool python3 timeout; do
    command -v "$command" >/dev/null || fail "missing command: $command"
done

printf 'Native toolchain OK: Ubuntu 18.04 amd64, GCC 7.5.0, Qt 4.8.7, SDL 1.2.15.\n'
