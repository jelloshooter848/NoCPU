# Source provenance

NoCPU preserves DICE 0.9 unchanged under `upstream/dice-0.9/` as its native
reference and as the source of the circuits compiled into the portable core.
Adapters, tools and generated build copies live outside that directory and are
listed in [UPSTREAM_PATCHES.md](UPSTREAM_PATCHES.md). Importing the source does
not by itself establish browser, audio or gameplay fidelity; that comes from
the comparisons in [TESTING.md](TESTING.md). Private ROM fixture access
identifies test inputs, never redistribution permission.

## Original source

| Property | Recorded value |
| --- | --- |
| Project | DICE, Discrete Integrated Circuit Emulator |
| Authors | DICE Team, copyright 2008–2014 |
| Original release | DICE 0.9 |
| Distribution | [SourceForge DICE 0.9 source](https://sourceforge.net/projects/dice/files/DICE/DICE%200.9/dice.0.9.src.zip/download) |
| Imported input | User-provided `dice.0.9.src.zip`, associated with that release |
| Archive SHA-256 | `3f89640cce1dc21d9e632b914fcf089a82efa868bad487b634ac9a76fc81257b` |
| Imported location | `upstream/dice-0.9/` |
| Regular files | 566 |
| File inventory | [`tests/source-manifest.json`](../tests/source-manifest.json) |
| Source grant | GPL version 3 or, at the recipient's option, any later version; see original [`README.txt`](../upstream/dice-0.9/README.txt) |

The original download endpoint was supplied by the user. The archive hash
identifies the exact uploaded bytes; it does not assert an upstream signature
or an independently authenticated download. The archive contains 602 entries:
566 regular files and 36 directory entries. The empty `roms/` directory has no
ROM payload. Empty archive directories are not tracked by Git.

Extraction verified the archive hash, rejected absolute paths, `..` components,
backslashes, duplicate paths, symlinks, and nonregular file entries before
writing regular-file bytes. No archive text was executed. Every imported file
has a relative path, byte count, and SHA-256 in the manifest. Root `LICENSE` is a
verbatim copy of original `LICENSE.txt`. Supplemental notices live outside the
immutable source tree.

## Other reference repositories

- [DirtBagXon/DICE](https://github.com/DirtBagXon/DICE/tree/742e8b48c38138491c55e85cd3c4f7342d641a6f),
  revision `742e8b48c38138491c55e85cd3c4f7342d641a6f`, informed the desktop
  dependency comparison. Its source is not the archival import, and no changes
  from that fork are silently substituted for DICE 0.9.
- [jelloshooter848/SMBC](https://github.com/jelloshooter848/SMBC/tree/d79b5f4163892a4212286ce566ad7276efd2970a)
  informed repository organization, controls, and release planning. Its code,
  assets, and MIT license are not imported into NoCPU.

## Bundled library provenance

The original archive contains 270 Phoenix files, 120 nall files, and 10
ManyMouse files. The other 166 files comprise DICE's engine, games, UI, build
files, and project notices. All remain byte-identical to the input archive.

Phoenix and nall identify with the historical higan/bsnes libraries. All 390
relative library paths exist in [higan v093](https://github.com/higan-emu/higan/tree/4e2eb23835228477859f4d9de69e8cd27a4eeea6);
346 files have identical Git blob hashes. The remaining 44 files are adapted
versions within those same libraries; this comparison does not attribute every
change to a particular author. nall's SHA-256 and inflate files also match
[higan v094](https://github.com/higan-emu/higan/tree/10464b8c54085702b6ac8225aeb5bd01501ae5ee)
byte for byte. Its sinc implementation is present there with small changes to
the Pi constant spelling.

The historical primary source [v094 `emulator/emulator.hpp`](https://github.com/higan-emu/higan/blob/10464b8c54085702b6ac8225aeb5bd01501ae5ee/emulator/emulator.hpp)
declares `GPLv3`. The contemporaneous [Debian higan 094-5 copyright inventory](https://sources.debian.org/src/higan/094-5/debian/copyright/)
is secondary scope evidence: its `Files: *` entry assigns GPL-3 and explicitly
excepts nall's inflate implementation as zlib. The earlier [bsnes 0.088-5 inventory](https://sources.debian.org/src/bsnes/0.088-5/debian/copyright/)
also credits vladitx and Ryphecha among the contributors. Retained copies and
additional primary exception notices are in [`docs/licenses/`](licenses).

This provides a documented basis to distribute these historical libraries
conservatively under GPL version 3 alongside their exceptions. It does not
establish that every historical library file was separately dedicated to the
public domain. The public-domain statement in nall's Makefile is not expanded
to the whole library. The later official [higan license](https://github.com/higan-emu/higan/blob/8f4df010715298455b92cfc0821ea833770a8b5a/LICENSE.txt)
grants ISC to newer nall/hiro copies; that later grant is retained as context,
not retroactively substituted for this import.

See [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for exact exception
scope and [`tests/license-audit.json`](../tests/license-audit.json) for the
machine-readable source-release assessment. That assessment covers source-only
distribution; compiled native binaries, Wasm, ROMs and toolchain containers are
outside it. The browser build has its own audit in
[BROWSER_DISTRIBUTION.md](BROWSER_DISTRIBUTION.md).

## Preservation rules

1. Keep every file in `upstream/dice-0.9/` unchanged.
2. Put adapters in `core/`, tools in `tools/`, and generated copies in `build/`.
3. Record each applied adaptation in [`UPSTREAM_PATCHES.md`](UPSTREAM_PATCHES.md).
4. Retain original and supplemental notices in any source release.
5. Keep ROMs, private fixtures, credentials, and generated build outputs out of
   public source and release archives.
