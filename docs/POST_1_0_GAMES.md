# NoCPU post-1.0 game candidates

Scope: additions beyond the 21 games in DICE 0.9. These are research candidates, not implementation commitments. Preserve the faithful 1.0 scope first.

## Evidence and limitations

Inspected MAME source at commit `a025aba9df9d417ddff6cf6c501db1059507d642`. The Atari, Exidy, Taito, Sega, Meadows and Midway TTL drivers identify discrete hardware families. The registered candidates below are marked `MACHINE_NOT_WORKING | MACHINE_NO_SOUND` in that snapshot. This is static source inspection, not a runtime test. It does not establish absence of FPGA implementations, standalone simulators, commercial recreations, console ports or newer work. A console adaptation also does not establish faithful emulation of an original arcade circuit.

Primary sources:

- [Atari/Kee TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/atari/atarittl.cpp)
- [Exidy TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/exidy/exidyttl.cpp)
- [Taito TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/taito/taitottl.cpp)
- [Sega TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/sega/segattl.cpp)
- [Monaco GP](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/sega/monacogp.cpp)
- [Meadows TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/meadows/meadwttl.cpp)
- [Midway TTL](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/bally/midwayttl.cpp)

## ROM requirements

CPU-less does not mean ROM-free. Discrete control circuits can read semiconductor ROMs/PROMs containing graphics, tracks, timing, motion lookup tables, or sound data without executing a software game program. Those chips require compatible dumped bytes. Hardwired diode graphics are a different case: their fixed connections can be reconstructed from adequate schematics rather than requiring a semiconductor ROM dump.

All four first-priority candidates have ROM declarations in the inspected MAME source:

| Candidate | Declared data dependency | Pinned evidence |
| --- | --- | --- |
| Tank | One 2 KiB graphics ROM, `90-2006.k10` | [Tank ROM definition](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/atari/atarittl.cpp#L540) |
| Gran Trak 10 | One 2 KiB track/game-data ROM, `074186.j5`; another registered set uses `074181.j5` | [Gran Trak 10 definitions](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/atari/atarittl.cpp#L384) |
| Death Race | Fifteen board-location declarations with eleven distinct image identities; graphics, timing/sync, score/timer, and motion lookup data | [Death Race board inventory and ROM definition](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/exidy/exidyttl.cpp#L180) |
| Qwak! | One 512-byte graphics ROM, `90-2002.9k` | [Qwak ROM definition](https://github.com/mamedev/mame/blob/a025aba9df9d417ddff6cf6c501db1059507d642/src/mame/atari/atarittl.cpp#L494) |

The broader backlog also contains data dependencies. These are source declarations, not an audit of test files in our possession:

| Candidate | Evidence or remaining uncertainty |
| --- | --- |
| Tank II / Gran Trak 20 | Atari defines a Tank II image with an anomalous 2,049-byte length and three 2 KiB Gran Trak 20 images. Validate each variant separately. |
| Destruction Derby / Le Mans | Exidy declares ROM images for Destruction Derby; Atari declares three 2 KiB Le Mans images. |
| Speed Race / Gunman / Missile-X | Taito declares ROM/PROM loads for all three. A listed set is not proof its contents are complete or validated for a future circuit implementation. |
| Fonz / Moto-Cross | Sega declares four Fonz PROM images. Moto-Cross is a catalog lead; its exact variant requirements remain unresolved. |
| Indy 800 | Four Atari ROM declarations; checkpoint `003188.e5` and track `003189.f4` are marked `NO_DUMP`. The suggestion they might match Indy 4 is unverified. |
| Monaco GP / Pro Monaco GP | Monaco GP has graphics/oscillator ROM/PROM definitions for two board configurations. Pro Monaco GP's exact requirements remain unresolved. |
| Wheels II / Bombs Away / Cobra Gunship | Midway and Meadows declare ROM/PROM loads for these games. |
| T.T. Block / Zun Zun Block | Taito declares one 2 KiB image for T.T. Block, and two 512-byte images plus one 32-byte image for Zun Zun Block. |
| Touch-Me / Pursuit / World Cup / Goal IV | Atari's hardware catalog explicitly lists no ROM requirement. This still needs board/schematic verification before implementation. |
| Ball Park / T.V. Flipper | Midway's catalog identifies Ball Park as using ROM; exact dumped requirements are not established here. T.V. Flipper is marked `?`, so its requirement is unresolved. |
| Western Gun / Heavyweight Champ / Computer Space / Magnavox Odyssey | This review has not established their exact data-storage requirements from sufficient hardware evidence. Keep them unresolved rather than infer ROM-free status from a missing declaration. |

Except for the two Indy 800 `NO_DUMP` entries, the listed dumped definitions carry CRC/SHA1 metadata in the linked source. Such metadata does not establish that compatible files are available to us, validate their bytes, or grant redistribution rights. Each accepted game still needs its own asset audit; the existing ten DICE fixture sets do not cover this expansion list.

## Evidence inventory (2026-10-13)

This is a documentary-evidence survey. It does not accept any title. Sources were verified by opening the Internet Archive (IA) item or file listing, or by an HTTP `200 application/pdf` from the Museum of the Game/KLOV manual archive (`arcade-museum.com/manuals-videogames/<letter>/<name>.pdf`). Search-only mentions are marked *unconfirmed*. Gameplay videos are YouTube uploads that were not individually verified as real hardware. "MAME skeleton" means a ROM-only `MACHINE_NOT_WORKING | MACHINE_NO_SOUND` entry with no netlist (MAME master `cefe053`, which matches the `a025aba` statuses above). No ROM or PROM data was downloaded. Manuals and PROM images remain third-party material with no redistribution grant. Owner-supplied PDFs (2026-10-14) are archived only in the private NoCPU-Roms repository under `references/`; they are copyrighted and are never committed here. See [owner-supplied references](#owner-supplied-references-2026-10-14).

**No later DICE version covers any candidate.** The official SourceForge git history ends at the 0.9 release (2014-04-23). The author's blog ends with the 0.9 announcement. The active forks, DirtBagXon/DICE (SDL2/Qt) and mittonk/dice-libretro (GPL-3.0, active in 2026), still ship the same 21 games. No DICE reference implementation exists for this list.

Most new schematics come from Peter Mount's 2025 IA uploads (`*_ptm` items in the `arcademanuals` collection).

Evidence grades:

- **A:** complete schematics with sound, a manual, data dumps where needed, and a reference simulation or real-hardware footage.
- **B:** schematics and manual present, with one major leg missing.
- **C:** partial schematics or no manual.
- **D:** flyer, catalog or ROM declarations only.

| Game | Schematics | Manual | ROM needs / dumps | Existing sims | Recordings | Grade |
| --- | --- | --- | --- | --- | --- | --- |
| Tank | Board I Rev G/H/J and Board II Rev F/H, 1-bit 600 ppi ([IA](https://archive.org/details/tank_tm-010_schematics_board_i_rev-j_ptm)); also inside the manual | TM-010 Kee/Atari, cocktail TM-036, kiosk edition, bulletin ([IA](https://archive.org/details/tank_tm-010_kee_games_operation_and_maintanence_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/T/Tank.pdf)) | 1 × 2 KiB `90-2006.k10`, CRC 87f5c365 | MAME `nl_tank` netlist with sound (BSD-3); not working; some resistor values guessed | Several uploads | **A** |
| Tank II | In TM-049 | TM-049, 44 pp ([IA](https://archive.org/details/tank_ii_tm-049_ptm)) | `90-2006.k10` c25f6014, anomalous 2,049 bytes; re-verify | MAME skeleton | None found | **B** |
| Gran Trak 10 | Two sheets in TM-011, only 150 ppi in the IA copy; 7 MB KLOV copy not checked | TM-011 plus O&M manual ([IA](https://archive.org/details/gran_trak_10_tm-011_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/G/GranTrak10.pdf)) | `074186.j5` 3bad3280; older `074181.j5` f564c58a | MAME `nl_gtrak10` netlist (BSD-3) with speed hacks/TODOs; notes schematic errata, cross-checked with Le Mans | Several uploads | **A−** |
| Gran Trak 20 | Rev E, 2 sheets at 600 ppi ([IA](https://archive.org/details/gran_trak_20_schematics_rev_e_ptm)) | TM-004, 26 pp; TM-039 bulletin | 3 × 2 KiB (d38709ca, 3d30654f, a811cc11) | MAME skeleton | None specific | **B** |
| Death Race | 18-sheet set including audio and motor/crash ([IA](https://archive.org/details/death_race_schematics_ptm)) | Service manual, 19 pp ([IA](https://archive.org/details/death_race_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/D/DeathRace.pdf)) | 15 sockets / 11 distinct 6331/6301 images, all dumped; one verified against a real board | MAME skeleton; fan remakes only | Many uploads | **A−** ([references](#death-race--references-owner-supplied-2026-10-14)) |
| Demolition Derby (Chicago Coin 466, licensed Destruction Derby) | 19 typeset sheets including crash and motor sound, audio output and steering pulse generators ([references](#destruction-derby--demolition-derby--references-owner-supplied-2026-10-14)) | None found | MAME `destdrby` PROMs match these schematics (82S123-34, 82S129-93 to -96); others shared with Death Race | MAME skeleton | One upload | **B−** |
| Destruction Derby (Exidy) | No Exidy original; the same design is documented by Death Race DR-1A and Demolition Derby | None found; flyer only | 15 PROM sockets dumped; several match Death Race; board origin of the `destdrby` dump unverified | MAME skeleton | One upload | **C** |
| Fonz / Moto-Cross | Fonz: one large sheet in the manual, 300 ppi 1-bit, small values marginal. Moto-Cross: none | Fonz 18 pp ([IA](https://archive.org/details/fonz_ptm)); Moto-Cross flyer only | Fonz: 4 PROMs dumped. Moto-Cross: no MAME set | Fonz: MAME skeleton | Fonz: uploads | **B−** / **D** |
| Gunman | Full multi-board set: main, K-57 A/B/C, sound mother, six effect-sound boards, video, counter, power ([IA](https://archive.org/details/taito-gunman-1977-schematics)) | English manual and wiring diagram (same item) | 8 images dumped | MAME skeleton | None found | **B** |
| Monaco GP | 11×17 at 600 ppi in owner's manuals; boards 96577/96578 and 96598 oscillator ([IA](https://archive.org/details/monaco_gp_420-0358_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/M/MonacoGP.pdf)) | 420-0358 and stand model 420-0445 | 20 (set 1) / 18 (set 2) PROMs dumped | MAME skeleton | Cabinet uploads; some are MAME captures | **B** ([references](#monaco-gp--references-owner-supplied-2026-10-14)) |
| Indy 800 | TM-026: sync, score, coin, car 003000 E (logic and per-car audio), PSU, remote, harness; steering board 001151 and monitor missing ([references](#indy-800-kee-gamesatari-1975--proposed-new-entry)) | TM-026, 96 pp, with a 23-page circuit description | Car video and motion PROMs identical to Indy 4's; checkpoint `003188.e5` and track `003189.f4` **NO_DUMP** | MAME skeleton; DICE Indy 4 shares the A003000 car board (partial reference) | Not surveyed | **B**, blocked on two undumped PROMs |
| Pro Monaco GP | Schematic section in 420-0525 ([IA](https://archive.org/details/pro_monaco_gp_420-0525_ptm)) | 420-0525, 20 pp | No MAME set; requirement unknown | None | None found | **C** |
| Wheels II | Three single sheets plus wiring diagram; no sheet index ([IA](https://archive.org/details/wheels_ii_schematics_1_ptm)) | None found; flyer only | 12 × 32-byte PROMs; catalog numbering 257–269 suggests one may be missing | MAME skeleton | None found | **C** |
| Bombs Away / Cobra Gunship | None found | Flyers only | 3 / 11 PROMs dumped | MAME skeletons | Bombs Away PCB upload; none for Cobra | **D** / **D** |
| Touch-Me | Schematic and component-location pages in TM-002; full-resolution legibility not checked | TM-002, 10 pp, with game sequence ([IA](https://archive.org/details/touch_me_tm-002_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/T/Touchme.pdf)) | None (MAME catalog) | None found | Collector upload; arcade unit unconfirmed | **B−** |
| Western Gun | Main PCB (3 parts), sound PCB, score display, credit, power, monitor ([IA](https://archive.org/details/wnr-00002-main-pcb-hit-gunman-positions)) | Manual and parts list (same item) | Unresolved; no MAME TTL set | None found | Original-hardware footage unconfirmed | **B−** |
| Pursuit | Five 17×11 sheets in TM-019, about 300 ppi | TM-019 plus 51-page service information keyed to schematic regions ([IA](https://archive.org/details/pursuit_tm-019_ptm)) | None | None found | None found | **B** |
| World Cup | "SCHEMATIC, WORLD CUP" drawings inside the Goal IV TM-035 manual (shared A000823 board) | Own manual not found | None | None found | None found | **C** |
| Goal IV | Several 11×17 sheets in TM-035 | TM-035, 98 pp, plus supplement; separate high-resolution scan ([IA](https://archive.org/details/goal_iv_tm-035_ptm), [IA hi-res](https://archive.org/details/atari-goal-iv-service-manual)) | None | None found | None found | **B** |
| Computer Space | Sync Star / Motion / Memory boards at 600–727 ppi 1-bit ([IA](https://archive.org/details/computer_space_ptm), [KLOV](https://www.arcade-museum.com/manuals-videogames/C/ComputerSpace.pdf)) | Same 36-page manual | None (hard-wired image patterns) | Gate-level FPGA "release 1.0" (fpgaarcade, 2015): sound is sampled, no license stated ([thread](https://forums.arcade-museum.com/threads/computer-space-fpga-release-1-0.364662/)); its MiSTer port with partly modelled sound ([Arcade-ComputerSpace_MiSTer](https://github.com/MiSTer-devel/Arcade-ComputerSpace_MiSTer)); PDP-1 port is not a circuit model. Redrawn, board-checked schematics: [ComputerSpaceSchematics](https://github.com/pong74ls/ComputerSpaceSchematics). See [references](#computer-space--references-owner-supplied-2026-10-14) | Many real-hardware uploads; [machine registry](https://www.computerspacefan.com/rogues/) | **A−** |
| Magnavox Odyssey | 1TL200 service manual, 600 dpi ([IA](https://archive.org/details/MagnavoxOdyssey)) | 1972 installation & game rules ([IA](https://archive.org/details/odyssey-installation-and-game-rules-1972-magnavox-standard)) | None | Magnavody simulator (GPL-3.0+, fidelity not established); OdySim (behavioural); no MiSTer core | Plentiful | **B** (docs only); scope risk unchanged |

### Owner-supplied references (2026-10-14)

Research only: nothing here authorizes porting any of these games or copying
any of this material. The owner's PDFs are copyrighted and live only in the
private NoCPU-Roms repository (`references/<game>/`), never in this one.

#### Computer Space — References (owner-supplied, 2026-10-14)

Nothing here authorizes porting Computer Space or copying any of this
material. Each source was read on 2026-10-14 (file listings, READMEs, HDL
headers and the forum thread's first page); no binaries were downloaded into
the repository.

| Reference | What it is | License / terms | Sound | Last update | Use for NoCPU |
| --- | --- | --- | --- | --- | --- |
| [pong74ls/ComputerSpaceSchematics](https://github.com/pong74ls/ComputerSpaceSchematics) | Nine PDFs, redrawn (not scans) from scans of the original schematics: Memory, Motion and Sync Star (Model 1) board schematics and PCB layouts, backplane wiring, bill of materials, and a Sync Star Model 2 schematic. Errors in the original drawings were corrected against a real board set (serial 9392); logical symbols replace pin-layout drawings. The Model 2 sheet is unverified (the author owns no Model 2 board) | No LICENSE file and no terms stated: all rights reserved by default | Drawn as part of the board schematics | 2016-04-23 (version 1A; 9 commits since 2016-03-17) | Primary evidence, secondary to the original scans: cross-check every correction against the IA/KLOV scans, and record which drawing a model follows. Not redistributable |
| [MiSTer-devel/Arcade-ComputerSpace_MiSTer](https://github.com/MiSTer-devel/Arcade-ComputerSpace_MiSTer) | MiSTer port (Sorgelig, 2017) of the 2015 VHDL model below, with DarFPGA's v1.1 changes (2017: sync fixes, a rocket-movement bug fix, separate video levels) and later fixes (2021: DIP switches, start/end logic, explosion sound). `rtl/` holds the gate-by-gate Memory, Motion and Sync Star board VHDL (asynchronous flip-flops resynchronized to a fast clock, analog timers as counters); `releases/` holds prebuilt `.rbf` bitstreams | No LICENSE/COPYING file. The MiSTer wrapper and `sys/` files carry GPL headers; the board VHDL (Mattias G, 2015) states none; `computer_space_sound.vhd` (DarFPGA) says "Educational use only" and forbids redistributing synthesized files with ROMs | Partly modelled: turn and both missile sounds are gated counter frequencies taken from the Motion Board schematics; ambiance, thrust and explosion are approximations (filtered noise shaped to the original samples' spectra) | 2025-12-09 (`sys` framework update); game logic last changed 2021-01-13 | Comparison reference for behavior and timing questions only. Its board logic has no license, so no code is copied; its approximated noise voices are not a sound reference |
| [Computer Space FPGA release 1.0](https://forums.arcade-museum.com/threads/computer-space-fpga-release-1-0.364662/) (fpgaarcade, KLOV forum) | The original 2015 VHDL model for a Terasic DE0-Nano, posted with a JIC bitstream, a VHDL zip, interface schematics and a Quartus project link. Copied "wire by wire" from the schematics, with timer values and star layout checked against real-board measurements (Mike Salay) | None stated in the thread's first page | Sampled (signed 8-bit, 11 kHz, from computerspacefan.com), with the sample range shortened to fit memory | 2015-12-30, with replies into January 2016 (DE1 and Xilinx ports announced) | Same as the MiSTer port, which descends from it; its board measurements are useful secondary evidence for analog timer values |

Effect on the grade: still **A−**. The redrawn set adds a second, board-checked
reading of the schematics, and the MiSTer port adds partly circuit-derived
sound, but there is still no reference whose sound and analog timing are
modelled from the circuit throughout, and no reference code that NoCPU could
reuse.

#### Death Race — References (owner-supplied, 2026-10-14)

- [Death Race Schematics.pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Death%20Race%20Schematics.pdf): Exidy logic diagram DR-1A (5-17-76, updated 6-29-76). Complete set of 18 sheets, including PROM locations, crash logic, motor speed, motor and crash audio, +15 V audio supply with LM380 outputs, and scream audio (sheet W).
- [Death_Race.pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Death_Race.pdf): Exidy service manual scan (2006 revision of the file). Adjustments, troubleshooting, Figs. 1–9 and **Fig. 10, the optical steering board schematic**. This is the preferred copy.
- [Death Race.pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Death%20Race.pdf): the same scan before the 2006 edit. It has a duplicate table-of-contents page and no Fig. 10.
- [arcade-museum.com entry](https://www.arcade-museum.com/Videogame/death-race): catalogue data (no CPU, B&W raster, stereo, ~500 built); lists a 41-page manual, so both scans above are incomplete (no Fig. 11, no blank pages).
- [Pinside restoration thread](https://pinside.com/pinball/forum/topic/the-1976-exidy-death-race-project-is-completed): not reviewed. The site blocks automated access (HTTP 403). A Wayback snapshot dated 2025-04-08 exists. Its content is unverified.

Private copies of the three PDFs are archived in NoCPU-Roms `references/death-race/`. They are copyrighted and must not be committed here.

Evidence update: the schematics confirm complete coverage of logic, audio, motor/crash and scream. The logic +5 V supply is a module (EAPS-5-10) that is not drawn, which is acceptable. The manual parts list calls the bezel plex "Plex panel destruction derby", and the Chicago Coin Demolition Derby schematic (below) independently documents the shared logic. **Grade stays A−.** The missing leg is still a reference simulation; recordings have not been verified as real hardware.

#### Destruction Derby / Demolition Derby — References (owner-supplied, 2026-10-14)

- [Demolition Derby Schematics.pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Demolition%20Derby%20Schematics.pdf): Chicago Coin (Chicago Dynamic Industries) game 466, the licensed version of Exidy's Destruction Derby. 19 typeset sheets: video/clock, game control, timer/score, car shape, crash/scoring, picture output, game cars 1–2, player cars 1–2, motor speed, crash and motor sound, audio PSU/output, steering pulse generators, cabinet wiring. Also IC and capacitor location drawings for board 466-2500.

A private copy is archived in NoCPU-Roms `references/death-race/`.

Evidence update:
- The sheets use Exidy's sheet letters and signal names, so the logic is the same design as Death Race DR-1A.
- **Shared:** timing, game control, score/timer, car and drone motion, motor audio, and PROM part numbers -31/-32/-33/-35/-91/-92. These also have identical CRCs in MAME's `deathrac` and `destdrby` sets.
- **Different:**
  - Drone PROM -34 instead of -36.
  - Car image PROMs -93 to -96 instead of -97 to -100.
  - Two crash-noise generators and no scream circuit.
  - A different steering pulse board.
  - Chicago Coin's own board locations.
- Demolition Derby: **D → B−**. Full schematics with audio, PROMs declared in MAME `destdrby` (82S123-34, 82S129-93 to -96 match these schematics), no manual, no simulation.
- Exidy Destruction Derby: **D → C**. No Exidy-original documents, but the design is now documented through both relatives.
- Whether MAME's `destdrby` dump came from an Exidy board or a Chicago Coin board remains unverified.

#### Indy 800 (Kee Games/Atari, 1975) — proposed new entry

- [Indy_800_TM-026.pdf](https://arcarc.xmission.com/PDF_Arcade_Atari_Kee/Indy_800/Indy_800_TM-026.pdf): service manual TM-026, 96 pp, owner-supplied 2026-10-14. Contents:
  - A 23-page circuit description: timing, checkpoint/leader logic, steering decoder, the GO speed table, and the 32-direction motion-code table.
  - Schematics: sync 003182 E, score 003170 E, coin 003184 E, **car 003000 E** (logic and full per-car audio), PSU 003191 F, remote 003193 C, harness 003153 D.
  - Parts lists and assembly drawings.
  - Missing: steering-board schematic 001151 and monitor schematic.
  - No DIP switches. Settings are a master-volume rotary switch, a game-time pot, a lockout switch, the remote panel's car toggles, and test-video jumpers.
- A private copy is archived in NoCPU-Roms `references/indy-800/`.

ROM needs (MAME `indy800`):
- `003186.p6` car video b3443354 and `003187.f7` motion 01dca5b9. Both are **identical to Indy 4's**, which NoCPU already holds.
- `003188.e5` checkpoints (32 B) and `003189.f4` racetrack: **NO_DUMP**. Indy 4 uses different part numbers at those sockets (005502/005503), so it cannot be assumed that Indy 4's data fits.
- The manual specifies 003189 as 256×4, while MAME reserves 0x200 bytes. Check this.

Relationship to Indy 4:
- Indy 4 uses the same A003000 car board, with a reworked sync/score set (A006268/A006270).
- DICE's `indy4.cpp` already cross-references the Indy 800 schematic.
- This manual strengthens the Indy 4 evidence, and DICE Indy 4 is a partial reference simulation for Indy 800.

**Grade: B.** Complete schematics, audio and manual, plus a sibling simulation. **Blocked on two undumped PROMs** (track and checkpoints) before any port. Product gates (8 players, colour, phone presentation) are unchanged.

#### Monaco GP — References (owner-supplied, 2026-10-14)

- [Monaco_GP_(420-0358).pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Monaco_GP_%28420-0358%29.pdf): Gremlin/Sega cockpit owner's manual. Settings, parts, wiring chart SGB-2552 no. 314. Full 600 dpi schematics:
  - 96577-P board A and 96578-P board B (all 13 logic sheets).
  - 96598-P oscillator/sound board (7 sheets).
  - 96597-P / MO-4202 LED score display (3 sheets).
  - 96599-P handle board.
- [Monaco_GP_Stand_Model_(420-0445).pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Monaco_GP_Stand_Model_%28420-0445%29.pdf): stand-model owner's manual. Same schematic revision as 420-0358 (compared page by page), plus stand chart 315 (mono, MO-4215 LED board, coinage DIP table).
- [Monaco_GP_Stand_Model_Service_Manual_and_Parts_Catolog_(Sega).pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Monaco_GP_Stand_Model_Service_Manual_and_Parts_Catolog_%28Sega%29.pdf): Sega 1980 service manual and parts catalog. How-to-play and scoring, board VR/DIP settings (SW2 stereo cockpit vs mono stand), troubleshooting, chart 315. No logic schematics.
- [Monaco_GP_Cockpit_Wiring_Diagram.pdf](https://files.stardustarcade.com/PDF_Arcade_Manuals_and_Schematics/Monaco_GP_Cockpit_Wiring_Diagram.pdf): SGB-2552 chart 314-1, a later revision of the cockpit wiring with pencilled coin/DIP/transformer tables.

Private copies are archived in NoCPU-Roms `references/monaco-gp/`.

Evidence update:
- Schematic PROM labels and IC numbers match MAME **monacogp set 1** exactly: PR-125–PR-141 at IC59…IC17, PR-38 at IC115, PR-39 at IC105. prm40.ic21 was not located on a sheet.
- Set 2's 1 KiB variants are not what these drawings show.
- Sound board and score display are fully drawn. Regulator and amplifier modules appear only as blocks.

**Grade stays B, now firm on documents.** Remaining gaps: no reference simulation, no verified real-hardware recordings, module internals, and IC21/prm40 placement.

Discovered leads not previously listed:

- **Midway Wheels (1975):** the MAME catalog lists no ROM. It has a Wheels I schematics databook ([IA](https://archive.org/details/wheels_i_databook_schematics_ptm)), a wiring diagram, and working-PCB/cabinet videos. There is no MAME GAME entry. Worth a closer look.
- **Atari Outlaw (1976):** manual TM-040 ([IA](https://archive.org/details/outlaw_tm-040_ptm)) and one dumped 512-byte ROM.
- **Already on the broader list:** Qwak! (TM-008), Le Mans (TM-077) and Indy 800 (TM-026) also have manuals on IA and KLOV.

## Revised ranking by evidence readiness

This ranking orders investigation by documentation readiness only. It does not authorize scheduling.

1. **Tank** (A): multi-revision schematics and manuals, a dumped ROM, and an existing (non-working) MAME netlist with sound to compare against.
2. **Gran Trak 10** (A−): netlist and both ROM revisions exist. It needs a higher-resolution schematic scan and must account for known schematic errata.
3. **Death Race** (A−): a complete 18-sheet set with audio, all PROMs dumped, and abundant footage. There is no reference simulation.
4. **Computer Space** (A−): sharp complete schematics plus a board-checked redrawn set, no ROM, a gate-level FPGA model and its MiSTer port to compare with (sound sampled or approximated; no license on the board logic, so no code reuse), and real-hardware recordings.
5. **Pursuit, Goal IV, Gunman, Monaco GP, Gran Trak 20, Tank II** (B): each lacks a reference simulation, recordings, or a ROM sanity check. Monaco GP's documents are now firm (owner-supplied manuals match MAME set 1). **Indy 800** (B) has complete schematics, audio and manual and DICE Indy 4 as a partial sibling reference, but is **blocked on two undumped PROMs** (track and checkpoints).
6. **Touch-Me, Western Gun, Fonz, Demolition Derby** (B−), then **Magnavox Odyssey** (B for documents, with product-scope risk).
7. **World Cup, Wheels II, Pro Monaco GP, Destruction Derby** (C), and **Bombs Away, Cobra Gunship, Moto-Cross** (D): these need new primary sources before any further work.

Biggest gaps:

- No candidate has a working independent reference.
- Analog sound and control circuits lack measured real-hardware references.
- Several key scans are marginal: Gran Trak 10 at 150 ppi, the single Fonz sheet, and the Touch-Me schematic page.
- No Exidy-original documents were found for Destruction Derby (its design is documented through Death Race and Chicago Coin's Demolition Derby), and no circuit documents for the Meadows games, Moto-Cross, or World Cup's own manual.
- The Tank II and Wheels II dumps need sanity checks.

## Ranked investigation list

The list below predates the evidence inventory above. It ranks candidates by product appeal and keeps the original gates.

| Candidate | Why investigate | Main gate before scheduling |
| --- | --- | --- |
| Tank / Tank II | Recognizable two-player combat; strong fit alongside DICE's existing competitive games. MAME has a partial Tank netlist. | Validate schematics, tank PROM, analog audio and dual-track controls. Treat Tank II as a separate verification task. |
| Death Race | Memorable preservation flagship; different driving objective from existing DICE racers. | Exidy schematics, graphics and timing/lookup PROMs, reference gameplay and sound. MAME registration is a skeleton, not a working implementation to port. |
| Gran Trak 10 / Gran Trak 20 | Historically important circuit-based racers; single-player entry plus two-player follow-up. MAME has a partial Gran Trak 10 netlist. | Track PROM, wheel/pedal/shifter mapping, timer and collision behavior. Shared hardware does not guarantee cheap variants. |
| Speed Race (Taito, 1974) | Adds scrolling racing; distinct from DICE's top-down circuit games. | Complete board documentation, video timing and steering behavior. |
| Qwak! (Atari, 1974) | Adds a duck-shooting light-gun game; touch aiming could be approachable. | Target PROM, gun/CRT timing model, explicitly documented touch adaptation. |
| Destruction Derby (Exidy, 1976) | Another competitive driving game; investigate possible overlap with Death Race. | Chicago Coin's Demolition Derby schematics show the same logic design as Death Race with different drone and car-image PROMs, crash noise and steering board (see [references](#destruction-derby--demolition-derby--references-owner-supplied-2026-10-14)); verify against the PROM dumps before assuming reuse. |
| Le Mans (Atari, 1976) | Expands Atari's discrete racing lineage; existing DICE racing experience may help. | Multiple graphics PROMs, controls and distinct race rules. |
| Fonz / Moto-Cross (Sega) | Motorcycle racing adds variety beyond Stunt Cycle's jump challenge. Fonz has a nonworking MAME entry; Moto-Cross is listed in the discrete catalog. | Establish board variants and documentation; do not presume identical games. |
| Gunman (Taito, 1977) | Light-gun shooting broadens the control styles. | Gun timing, cabinet reference and ROM validation. |
| Missile-X (Taito, 1977) | Additional shooting game from an underrepresented discrete family. | Verify original gameplay, cabinet controls and complete circuit documentation. |
| Indy 800 | Eight-player racing makes a strong showcase; investigate relationship to existing Indy 4. | Large simulation, colored display, eight input sets and meaningful phone presentation. |
| Monaco GP / Pro Monaco GP | Ambitious later CPU-less racing target; colorful and visually different from the core library. Monaco GP is explicitly nonworking in MAME. | Complex multi-board circuitry, many graphics PROMs, audio board and external LED score display. Verify Pro variant separately. |
| Wheels II (Midway) | Another documented nonworking discrete racer; useful if schematics prove more accessible. | Circuit completeness and steering/reference evidence. |
| Bombs Away / Cobra Gunship (Meadows) | Less familiar preservation targets; both have discrete-driver ROM definitions. | Acquire gameplay evidence and schematics before assigning priority. |
| T.T. Block / Zun Zun Block | Potential lower-risk paddle-game extensions after existing Breakout experience. | Confirm distinctive rules and circuit reuse rather than simply adding more clones. |

## Watchlist: hardware catalogs identify these, but readiness is less established

- **Touch-Me (Atari's 1974 arcade machine):** four-button memory/reaction play could suit phones particularly well; the Atari TTL catalog lists no ROM. Do not substitute the later handheld hardware.
- **Western Gun (Taito's original 1975 game):** attractive two-player cowboy duel. Distinguish it from Midway's CPU-based Gun Fight adaptation. Catalog evidence does not provide a complete working implementation.
- **Heavyweight Champ (Sega's original 1976 game):** unusually early boxing; physical cabinet controls make faithful touch adaptation a design issue. Distinguish later games with the same name.
- **Pursuit, World Cup and Goal IV (Atari/Kee):** additional no-ROM opportunities listed in Atari's catalog. Schematics and gameplay references remain the gates.
- **Ball Park and T.V. Flipper (Midway):** baseball/pinball diversify the library. Header listings establish leads, not implementation completeness; T.V. Flipper's ROM requirement is unresolved there.
- **Computer Space (Nutting, 1971):** excellent thematic flagship for circuit-based space combat. Schematics and existing simulations are surveyed under [references](#computer-space--references-owner-supplied-2026-10-14); analog behavior (sound, timers) still needs investigation. No global emulation-absence claim is made.
- **Magnavox Odyssey (1972):** a possible later home-hardware collection. Its analog/discrete circuits fit the theme, but overlays, physical props and player-enforced rules broaden the product substantially.

## Suggested sequencing

1. First assess **Tank, Gran Trak 10, Death Race and Qwak!**. Select the first implementation by documentation completeness and validated assets, not popularity alone. The 2026-10-13 evidence inventory puts Tank, Gran Trak 10, Death Race and Computer Space at the top. Qwak! has a manual and a dumped ROM but has not been graded yet.
2. Expand into **Speed Race, Destruction Derby, Le Mans and Fonz**, plus variants whose circuit relationships have actually been checked.
3. Keep **Monaco GP, Indy 800 and Computer Space** as stretch research targets rather than promised releases.

Before accepting a title, collect its schematic revision, board photos, manual, exact PROM checksums where applicable, reference gameplay/audio and a practical browser/mobile control plan. Estimate performance only after a representative circuit runs. MAME's software source license does not grant redistribution rights to game PROM data. ROM-free circuits still need faithful reconstruction and validation.

Original circuit-designed NoCPU games could be a separate later line: design playable netlists, publish their schematics and offer an optional signal inspector. These should be labeled originals and kept distinct from historical preservation.
