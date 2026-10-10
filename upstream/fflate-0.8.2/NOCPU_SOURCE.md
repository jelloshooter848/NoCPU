# fflate 0.8.2 preferred source

These library sources, build scripts/configuration, package lock and original notices are byte-for-byte copies from [101arrowz/fflate commit d3243651cb142e3e04f3e4bc037b9e985878f444](https://github.com/101arrowz/fflate/tree/d3243651cb142e3e04f3e4bc037b9e985878f444), the v0.8.2 tag and npm package gitHead. Original author: Arjun Barrett; original MIT license is retained in LICENSE. NoCPU does not claim authorship of these files.

NoCPU imports the exact integrity-pinned npm package. This snapshot supplies its preferred TypeScript library source and original library build inputs inside the corresponding-source archive. The optional demo, generated documentation and upstream tests are omitted; none is needed to build the library. The upstream library build command is `npm ci && npm run build:lib`; NoCPU's build uses the verified published npm distribution, not a separately rebuilt copy. See the original package scripts and README for upstream tooling.

`tests/fflate-source-manifest.json` records the upstream source commit, npm integrity, retained source-file hashes and expected imported npm file hashes. NoCPU packaging verifies the retained source and actual imported dependency bytes. The archive excludes installed node_modules; the pinned lockfile identifies the complete runtime package, while this directory includes its preferred library source.
