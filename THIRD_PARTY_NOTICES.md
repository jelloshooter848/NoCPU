# Third-party notices

DICE's original work is copyright (C) 2008–2014 DICE Team and licensed under
GPL-3.0-or-later. NoCPU-owned files derived from that work use the same grant.
Root [`LICENSE`](LICENSE) contains the complete GPL version 3 text, copied
unchanged from DICE 0.9. The historical library copies below are conservatively
distributed under GPL version 3 where supported by their historical package
evidence. The combined source distribution therefore uses **GPL version
3**, preserving each component's individual notices and exceptions.

## Bundled source inventory

| Scope in `upstream/dice-0.9/` | Authors / origin | Recorded license basis |
| --- | --- | --- |
| DICE engine, chips, games, UI, icons, and build files (166 files) | DICE Team | GPL-3.0-or-later, original `README.txt` and `LICENSE.txt` |
| `phoenix/`, excluding `phoenix/nall/` (270 files) | byuu/Near and contributors; historical Phoenix GUI library | GPL version 3 as distributed in historical higan; retain attribution and source |
| `phoenix/nall/` (120 files), except the granular entries below | byuu/Near and contributors; historical nall utility library | GPL version 3 as distributed in historical higan; not blanket public domain or blanket ISC |
| `phoenix/nall/sha256.hpp` | vladitx, named in the file | Historical higan GPL version 3 package basis; file matches v094 exactly |
| `phoenix/nall/dsp/resample/lib/sinc.hpp` | Historical bsnes/higan sinc resampler; package contributors include Ryphecha | Historical higan GPL version 3 package basis; no more specific file-level grant established |
| `phoenix/nall/inflate.hpp` | Mark Adler's puff implementation, adapted in nall by byuu | zlib-style terms; restored complete notice in [`docs/licenses/puff-zlib.txt`](docs/licenses/puff-zlib.txt) |
| `manymouse/` (10 files), except incorporated Apple code below | Ryan C. Gordon and others | zlib license, retained original `manymouse/LICENSE.txt` and [`docs/licenses/ManyMouse-zlib.txt`](docs/licenses/ManyMouse-zlib.txt) |
| Incorporated portion of `manymouse/macosx_hidutilities.c` | Apple Computer, Inc.; HID Utilities by George Warner | Apple's sample-code terms, restored in [`docs/licenses/Apple-HID-Utilities.txt`](docs/licenses/Apple-HID-Utilities.txt) |

The nested rows identify exceptions and attributions within the parent file
counts; they are not extra copies. No separate third-party family was identified
in the remaining DICE files by the header/notice and path audit. Original source
files and UI artwork are preserved; no game ROMs are included.

## Historical library evidence and attribution

Phoenix/nall retain their existing author comments. Their exact path/hash
correspondence to historical higan is recorded in
[`docs/PROVENANCE.md`](docs/PROVENANCE.md). Primary higan v094 source declares
`GPLv3`; the retained historical Debian inventory records GPL-3 for the
remaining library files and zlib for inflate. These provide the distribution
basis used here. Missing individual headers are not treated as evidence of a
license conflict, and a Makefile-only dedication is not treated as a family
license.

The bsnes 0.088 package credits byuu, Nach, blargg, krom, BearOso, RedDwarf, OV2,
vladitx, Andreas Naive, and Ryphecha. This list preserves historical package
attribution; it does not claim that each person authored every file imported
by DICE. Contemporary package inventories and the later higan license are
retained in `docs/licenses/` with source links in `docs/PROVENANCE.md` and
`tests/license-audit.json`.

The archive's nall inflate file incorporates a modified puff implementation.
Its zlib notice was absent from the supplied archive and is restored as a
supplemental notice without altering the archival bytes. Mark Adler remains
the original puff author; the nall wrapper/adaptation is not represented as
unmodified puff. ManyMouse's legacy Mac source explicitly identifies the Apple
HID Utilities incorporation and George Warner; Apple's full original header
is supplied alongside it. That header was decoded from Mac Roman to UTF-8 for
readability; the original archival ManyMouse file remains unchanged.

## fflate source and browser helper

The 0.3.0 ROM-file importer uses **fflate 0.8.2**, copyright (c) 2023 Arjun
Barrett, under the MIT license. Its exact [license](docs/licenses/fflate-0.8.2-LICENSE.txt)
and [preferred library source](upstream/fflate-0.8.2/NOCPU_SOURCE.md) accompany
the distribution. The unmodified source snapshot comes from
[commit d3243651cb142e3e04f3e4bc037b9e985878f444](https://github.com/101arrowz/fflate/tree/d3243651cb142e3e04f3e4bc037b9e985878f444),
which matches the v0.8.2 tag and the published npm package's gitHead. The exact
npm version and integrity are pinned in the root lockfile; retained source and
imported-file hashes are recorded in [the dependency manifest](tests/fflate-source-manifest.json).
NoCPU does not claim authorship of fflate. This compression helper supplies no
game ROMs and grants no rights to distribute player-supplied game data.

fflate's preferred source and distributed browser module explicitly credit
algorithms similar to Photopea's UZIP.js. The exact
[UZIP MIT notice](docs/licenses/UZIP-MIT-LICENSE.txt), copyright (c) 2018
Photopea, is retained conservatively from
[source commit 95071093542682c2d4ed9b4e91855110ade73ce2](https://github.com/photopea/UZIP.js/blob/95071093542682c2d4ed9b4e91855110ade73ce2/LICENSE).
UZIP.js is not separately imported as a NoCPU runtime dependency.

## External build dependencies

The original native reference links Qt 4, SDL 1.2, OpenGL, and X11 and uses a
C/C++ compiler, platform headers, and operating-system libraries. Linux
ManyMouse uses XInput dynamically. These are installed toolchain dependencies,
not vendored payloads in the 0.1.0 source package. Qt 4 and SDL 1.2 offer LGPL
licensing; OpenGL and X11 implementations have their own notices. Windows and
macOS builds additionally require platform libraries listed by the original
Makefile. Any future binary distribution must inventory the exact linked or
bundled implementations and preserve their applicable notices; the current
source-package audit does not clear redistribution of a toolchain container.

ROM images and game trademarks are not licensed by DICE's GPL grant. Private
test ROMs are excluded from this repository and its release archives.

## Pong browser runtime

The 0.2.0 Pong port retains DICE's simulation and replaces native input,
presentation and device-audio access with maintained adapters. The separately
reviewed [browser distribution assessment](docs/BROWSER_DISTRIBUTION.md) and
[`tests/browser-license-audit.json`](tests/browser-license-audit.json) cover the
exact compiled browser artifact; the original source inventory above does not
mean every archived GUI or device library is linked into it.

The browser build uses the following retained permissive runtime notices:

| Component | Author attribution and terms | Complete retained notices |
| --- | --- | --- |
| Emscripten 3.1.74 generated JavaScript and runtime support | Emscripten authors; MIT option of MIT/NCSA dual license | [LICENSE](docs/licenses/Emscripten-3.1.74-LICENSE.txt) and [AUTHORS](docs/licenses/Emscripten-3.1.74-AUTHORS.txt) |
| LLVM libc++ | LLVM Project contributors; Apache 2.0 with LLVM exception, including retained historical alternatives | [LICENSE](docs/licenses/LLVM-libcxx-3.1.74-LICENSE.txt) and [CREDITS](docs/licenses/LLVM-libcxx-3.1.74-CREDITS.txt) |
| LLVM libc++abi | LLVM Project contributors; Apache 2.0 with LLVM exception, including retained historical alternatives | [LICENSE](docs/licenses/LLVM-libcxxabi-3.1.74-LICENSE.txt) and [CREDITS](docs/licenses/LLVM-libcxxabi-3.1.74-CREDITS.txt) |
| LLVM compiler-rt | LLVM Project contributors; Apache 2.0 with LLVM exception, including retained historical alternatives | [LICENSE](docs/licenses/LLVM-compiler-rt-3.1.74-LICENSE.txt) and [CREDITS](docs/licenses/LLVM-compiler-rt-3.1.74-CREDITS.txt) |
| Emscripten's bundled musl libc | Rich Felker and contributors; MIT plus individual permissive routine terms | [COPYRIGHT](docs/licenses/musl-emscripten-3.1.74-COPYRIGHT.txt); linked math notices are recorded by the browser assessment |
| Vite 7.3.1 browser helpers | VoidZero Inc. and Vite contributors; MIT | [Exact package license and bundled dependency notices](docs/licenses/Vite-7.3.1-LICENSE.md) |
| fflate 0.8.2 ZIP inflation helper | Copyright (c) 2023 Arjun Barrett; MIT | [Exact package license](docs/licenses/fflate-0.8.2-LICENSE.txt); preferred source and build inputs included in corresponding source |

The LLVM compilation exception is retained in each complete license. These
permissive components do not replace the combined application's GPLv3 source
requirements. Browser source downloads and notices must accompany previews as
well as final deployments. The SDK/compiler, Node.js, TypeScript, bundlers and
browser automation installations themselves are build/test tools, not public
runtime payloads.
