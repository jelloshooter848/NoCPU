# External ROM test fixtures

Eleven of the original 21 games need no external ROMs. The ten games below require small graphics or timing PROM dumps even though their game logic has no CPU. NoCPU's public repository, release archives, Pages output, logs, and CI artifacts must contain no game-ROM payloads. A hidden directory in a public Git repository is still public.

[The public game manifest](../tests/fixtures/game-manifest.json) contains names, accepted CRC32 values, and observed byte sizes only. The private testing repository is [NoCPU-Roms](https://github.com/jelloshooter848/NoCPU-Roms). Its access must be explicitly configured for each environment that needs it; a reference in documentation does not grant access. Public CI validates the source and metadata without private credentials.

## Local audit

Keep the private checkout outside the public NoCPU checkout. With the ZIPs available locally:

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

The selected [0.6.0 batch](legacy/0.6.0_TASKS.md) integrates Stunt Cycle and Indy 4
with player-supplied compatible files. The browser validates exact descriptors
and the core independently checks actual staged size/CRC; trusted fixture
gameplay, loader failure paths and metadata audits have separate coverage.
Reset retains circuit-owned ROMs; destroy clears staged/live buffers. Imports
remain local and optional retention is the player's choice. No ROM retrieval
service, public fixture checkout, bundled ROM or credential-bearing public job
is authorized. Fixture-free CI must explicitly skip/block actual new-game
gameplay and identify any source-bound independently accepted local evidence
as a separate attestation. See [current validation](legacy/0.6.0_VALIDATION.md).

All ten supplied sets have passed this audit. Earlier native comparison runs also reached basic rendered output using each set in original DICE and the modern rebuilding. Controls, audible sound, complete gameplay, cabinet accuracy, and browser/mobile behavior remain unverified.

Keeping fixtures private solves repeatable access for authorized testing. It does not establish redistribution permission. Future browser ROM import should keep user-provided bytes local; no public download, bundled fixture, or ROM retrieval service is part of 0.1.0. Do not add private-repository credentials to source, workflows, reports, or releases.
