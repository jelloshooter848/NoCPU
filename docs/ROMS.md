# ROM requirements and private fixtures

Eleven of the original 21 games need no external ROMs. The ten games below require small graphics or timing PROM dumps even though their game logic has no CPU. NoCPU's public repository, release archives, Pages output, logs, and CI artifacts must contain no game-ROM payloads. A hidden directory in a public Git repository is still public.

[The public game manifest](../tests/fixtures/game-manifest.json) contains names, accepted CRC32 values, and observed byte sizes only. The private testing repository is [NoCPU-Roms](https://github.com/jelloshooter848/NoCPU-Roms). It supplies fixtures for development and CI only; players still supply their own ROMs at run time, and loading from the private repository inside the app is not authorized. Its access must be explicitly configured for each environment that needs it; a reference in documentation does not grant access. The ordinary CI workflow validates the source and metadata without private credentials; the separate ROM validation workflow below needs a configured secret.

## Fetching the private fixtures

```sh
./tools/fetch-roms.sh            # or: make roms
```

This clones (or updates) NoCPU-Roms with a depth-1 fetch into `build/roms/`, which is Git-ignored, and then runs `python3 tools/audit-roms.py --rom-dir build/roms` against the manifest. The script refuses a destination inside the checkout that Git does not ignore, and a non-empty directory that is not a fixture checkout. It never prints ZIP contents.

| Variable | Meaning |
| --- | --- |
| `NOCPU_ROMS_REPO` | Source repository. Default `https://github.com/jelloshooter848/NoCPU-Roms.git`; a local path or `file://` URL works too. |
| `NOCPU_ROMS_REF` | Branch, tag or commit to fetch. Default: the remote's default branch. |
| `NOCPU_ROM_DIR` | Fixture directory. Default `build/roms`. Also read by `tools/compare-rom-games.py`, `tests/test-dev-rom-exclusion.py`, the Vite dev server and the private browser test. |
| `NOCPU_ROMS_TOKEN` | Optional token for HTTPS GitHub sources, used in CI. It reaches Git through environment configuration as an HTTP authorization header, never in a URL, argument list, `.git/config` or log; in GitHub Actions the derived header is also masked. Without it your existing Git credentials (credential helper, `gh auth`, SSH URL) are used. |

Exit status: `0` fetched and audited, `1` failure (unsafe destination, different existing origin, or a fixture failing the audit), `77` **blocked: no ROM access** (the repository is unreachable or the credentials do not grant access). A blocked fetch is not a pass; ROM-dependent checks must then be reported as skipped/blocked.

## ROM-backed original/native/Wasm comparison

```sh
./tools/build-native.sh && ./tools/build-core.sh all
python3 tools/compare-rom-games.py   # or: make rom-compare
```

For each scenario in [rom-scenarios.json](../tests/replays/rom-scenarios.json) (Stunt Cycle throttle pilot, Indy 4 controls pilot) this audits the fixture, runs one fresh original DICE process in the pinned Docker toolchain with the private ZIP bind-mounted read-only under its original runtime basename (`stuntcycle.zip`, `indy4.zip`), and replays the same inputs through the portable native runner and the Wasm module for two reset epochs. It requires byte equality of the decoded full-RGB frames and snapshots, raw PCM including the constructor sample, inputs, events, telemetry and hardware observations between original and native, between native and Wasm in both epochs, and across each runtime's reset. Frame geometry and the audio boundary are compared on the fields both formats record. The descriptor bytes the portable runners read are staged in a private `0700` directory under the run and deleted afterwards. Evidence and `report.json` go to `build/rom-comparison/<timestamp>/`; frames and PCM there are ROM-derived and must not be published or uploaded.

The fixture directory is `--rom-dir`, else `NOCPU_ROM_DIR`, else `build/roms` when it exists. Without one the tool prints `SKIPPED (blocked: no ROM access)` and exits `77`; it never reports the comparison as passed. A pass covers these bounded replays only, not complete gameplay, and equal generated PCM is not audible sound: both games inherit absent DICE audio hookups.

## Development server

When `build/roms` (or `NOCPU_ROM_DIR`) exists, `npm run dev` serves the fixture ZIPs at a dev-only endpoint, and the development build imports them through the normal CRC/size validation for that session only (never saved to device storage). The endpoint answers loopback requests only, although `npm run dev` listens on all interfaces. `NOCPU_DEV_ROMS=0` turns it off. The middleware is a Vite `apply: 'serve'` plugin and the client module is imported behind `import.meta.env.DEV`, so production builds contain neither; `python3 tests/test-dev-rom-exclusion.py` checks an actual `build/web` for the endpoint, ZIP data and, when fixtures are present, every fixture archive and descriptor-sized member in raw and base64 form.

## CI secret setup

The [ROM validation workflow](../.github/workflows/rom-validation.yml) runs on pushes to `main` and `restart/desktop-first`, on manual dispatch, and on pull requests. Its `access` job checks for the `NOCPU_ROMS_TOKEN` Actions secret. Without it (always the case for pull requests from forks, which receive no secrets) it prints `blocked: NOCPU_ROMS_TOKEN not configured`, adds a warning and a summary line, and the `rom-validation` job is shown as skipped. With it, that job fetches and audits the fixtures (the token is given to that step only), builds the reference and cores, runs the comparison and the production-bundle exclusion test, and uploads only the payload-free comparison `report.json` files. ROM ZIPs, staged descriptors, frames and audio are never uploaded.

Owner steps to create the token and the secret:

1. On GitHub, open your profile menu → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name**: `NoCPU CI ROM fixtures (read-only)`. **Expiration**: choose a date (for example 90 days) and note it for rotation. **Resource owner**: `jelloshooter848`.
3. **Repository access**: select **Only select repositories** and choose `jelloshooter848/NoCPU-Roms` only.
4. **Permissions** → **Repository permissions**: set **Contents** to **Read-only**. GitHub adds **Metadata: Read-only** automatically. Leave every other repository permission and all account permissions at **No access**.
5. Click **Generate token** and copy the token (it is shown once).
6. Open `https://github.com/jelloshooter848/NoCPU` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. **Name**: `NOCPU_ROMS_TOKEN`. **Secret**: paste the token. Click **Add secret**.
7. Check it: **Actions** → **ROM-backed validation** → **Run workflow** on `restart/desktop-first`. The `rom-validation` job should run and its fetch step should print `ROM fixture commit:` and ten `PASS` audit lines. If the `access` job prints `blocked: NOCPU_ROMS_TOKEN not configured`, the secret name is wrong; if the fetch step exits with `blocked: no ROM access`, the token lacks access to NoCPU-Roms or has expired.
8. Before expiry, regenerate the token (or create a new one the same way) and update the secret. If it may have leaked, revoke it under **Fine-grained tokens** at once.

Anyone who can push branches to NoCPU or edit its workflows can run code next to the fetched fixtures, so keep write access to trusted collaborators.

## Local audit

Without the fetch script, keep any manual fixture copy outside the public NoCPU checkout or in an ignored directory. With the ZIPs available locally:

```sh
python3 tools/audit-games.py
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures
python3 tools/audit-roms.py --rom-dir /path/to/private-fixtures --game antiaircraft
```

The ROM audit reads and decompresses archive members in memory, checks actual bytes against ZIP CRC metadata, and requires an accepted source CRC plus its observed size for every active descriptor. It rejects missing sets, missing/incorrect required dumps, bad ZIP CRCs, encrypted archives, and excessive decompressed sizes. It writes or extracts no ROM files. Other valid archive members are allowed but do not satisfy unrelated required descriptors.

Without `--rom-dir`, `audit-roms.py` checks public metadata only and explicitly reports that no ROM bytes were inspected. Unknown game IDs fail; selecting a ROM-free game reports `NOT REQUIRED` and explicitly says no ZIP bytes were inspected.

## Archive mapping

Original DICE looks for the runtime ZIP basename shown below relative to its executable (`roms/` or `../../roms/`). The short archive names in the private repository are accepted aliases by the audit, but the original native program needs the runtime basename. Any local preparation of those runtime names belongs outside the public repository. If both an alias and runtime name exist in the audit directory, the audit fails rather than choosing an ambiguous fixture.

| Game | Original DICE runtime archive | Private test archive | Active descriptors |
| --- | --- | --- | --- |
| Stunt Cycle (`stuntcycle`) | `stuntcycle.zip` | `stuntcyc.zip` | 2 |
| Anti-Aircraft (`antiaircraft`) | `antiaircraft.zip` | `antiairc.zip` | 1 |
| Attack (`attack`) | `attack.zip` | `attckexd.zip` | 6 |
| Shark Jaws (`sharkjaws`) | `sharkjaws.zip` | `sharkjaw.zip` | 2 |
| Jet Fighter (`jetfighter`) | `jetfighter.zip` | `jetfight.zip` | 6 |
| Crash 'N Score (`crashnscore`) | `crashnscore.zip` | `crashnsc.zip` | 6 |
| Clean Sweep (`cleansweep`) | `cleansweep.zip` | `cleanswp.zip` | 3 |
| Wipe Out (`wipeout`) | `wipeout.zip` | `wipeormt.zip` | 2 |
| Steeplechase (`steeplechase`) | `steeplechase.zip` | `steeplec.zip` | 2 |
| Indy 4 (`indy4`) | `indy4.zip` | `indy4.zip` | 4 |

## Required dump identities

These member names are documentary labels from `RomDesc`. DICE searches by accepted CRC before checking a name, so a correctly identified dump may have a different filename or be in a nested ZIP directory. The audit follows CRC lookup and deliberately rejects DICE's fallback that warns about, but loads, a matching filename with a wrong CRC.

Sizes are observed in the supplied private fixtures, keyed to each accepted CRC. `RomDesc` itself has no size field and returns `0xff` for out-of-range reads. These sizes document known good identities; they do not prove that every possible historical dump format has been catalogued. CRC32 is an emulator compatibility identifier, not a cryptographic authenticity proof.

| Game | Expected source member | Accepted CRC32 → observed bytes |
| --- | --- | --- |
| Stunt Cycle | `82s123.4d` | `31A09EFB` → 32 |
| Stunt Cycle | `82s115.1fh` | `4ED5A99D` → 512 |
| Anti-Aircraft | `aa.k1` | `9DE772D5` → 32 |
| Attack | `attack.a1` | `D9B116B8` → 256; `5AFD5AFF` → 512 |
| Attack | `attack.b1` | `2317197F` → 256; `92D0FBF4` → 512 |
| Attack | `attack.c1` | `7391E44C` → 256; `25625D6E` → 512 |
| Attack | `attack.d1` | `D4A06439` → 256; `2FF8DD6B` → 512 |
| Attack | `attack.j6` | `1CE2921C` → 256; `21F87C1A` → 512 |
| Attack | `attack.k6` | `E120839F` → 256; `BA5115B3` → 512 |
| Shark Jaws | `004182.1da` | `05242912` → 256 |
| Shark Jaws | `004183.1db` | `B161B889` → 256 |
| Jet Fighter | `jet1.a4` | `08A0B011` → 256 |
| Jet Fighter | `jet1.j1` | `BEE62D20` → 32 |
| Jet Fighter | `jet1.j5` | `C58EE65D` → 512 |
| Jet Fighter | `jet1.k5` | `0D5648A9` → 512 |
| Jet Fighter | `jet1.m1` | `BEE62D20` → 32 |
| Jet Fighter | `jet1.r5` | `BD95F87E` → 32 |
| Crash 'N Score | `cns.d2` | `683B203B` → 512 |
| Crash 'N Score | `cns.e2` | `478AFAC2` → 512 |
| Crash 'N Score | `cns.f6` | `B3443354` → 512 |
| Crash 'N Score | `cns.f7` | `01DCA5B9` → 32 |
| Crash 'N Score | `cns.p6` | `B3443354` → 512 |
| Crash 'N Score | `cns.p7` | `01DCA5B9` → 32 |
| Clean Sweep | `clean.6c` | `BE02B5F5` → 32 |
| Clean Sweep | `clean.d7` | `BE40B153` → 32 |
| Clean Sweep | `clean.k3` | `515A34BA` → 32 |
| Wipe Out | `wipeout.d4` | `205BF9A1` → 32 |
| Wipe Out | `wipeout.g7` | `215437E1` → 32 |
| Steeplechase | `003773-A.C4` | `5DDC49B6` → 256 |
| Steeplechase | `003773-B.D4` | `E6994CDE` → 256 |
| Indy 4 | `indy.s1` | `1AAFBE72` → 512 |
| Indy 4 | `indy.s2` | `E30EA877` → 32 |
| Indy 4 | `indy.c1` | `B3443354` → 512 |
| Indy 4 | `indy.c2` | `01DCA5B9` → 32 |

Attack's six alternate CRCs represent 512-byte overdumps; the source comments identify the 256-byte set as likely correct and note zero-filled upper halves in the alternate set. Both identities are accepted by the preserved source and the audit.

Crash 'N Score, Jet Fighter, and Indy 4 reuse some CRC identities for different circuit chips. DICE's CRC lookup can reuse one matching ZIP member for multiple descriptors; the audit therefore validates logical requirements instead of demanding duplicate copies.

Steeplechase's two active horse-video descriptors are required. The source's bugle-ROM descriptor is commented out with an unknown checksum and is not loaded. The private archive also contains a 32-byte candidate bugle dump (`003774.8c`, CRC `F3785F4A`); this is an investigation lead, not a verified or required runtime asset. Extra alternate Jet Fighter members likewise do not expand the accepted source CRC list.

## Evidence and distribution

Of the ROM-dependent games, the core currently compiles Stunt Cycle and Indy 4.
In the browser the player selects their own ZIP; the frontend reads it locally,
checks every required descriptor's CRC and size against the manifest, and hands
the exact bytes to the core, which checks them again (see
[ARCHITECTURE.md](ARCHITECTURE.md#portable-core-abi-4)). Reset keeps the loaded
ROM bytes in the core; destroying the circuit clears them. The other eight ROM-backed games are
unported.

All ten private fixture sets pass this audit, and in the legacy line each
reached basic rendered output in original DICE and the DirtBagXon rebuild.
Controls, audible sound and complete gameplay remain unverified for the
unported games; per-game evidence is in
[GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md#verification-status).

Keeping fixtures private gives authorized testers repeatable access; it does not
establish redistribution permission. No bundled ROM, public fixture copy or
in-app ROM retrieval service is authorized. Do not add private-repository
credentials to source, workflows, reports or releases; CI reads the token only
from the `NOCPU_ROMS_TOKEN` Actions secret.
