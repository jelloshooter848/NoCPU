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

## Ranked investigation list

| Candidate | Why investigate | Main gate before scheduling |
| --- | --- | --- |
| Tank / Tank II | Recognizable two-player combat; strong fit alongside DICE's existing competitive games. MAME has a partial Tank netlist. | Validate schematics, tank PROM, analog audio and dual-track controls. Treat Tank II as a separate verification task. |
| Death Race | Memorable preservation flagship; different driving objective from existing DICE racers. | Exidy schematics, sprite PROMs, reference gameplay and sound. MAME registration is a skeleton, not a working implementation to port. |
| Gran Trak 10 / Gran Trak 20 | Historically important circuit-based racers; single-player entry plus two-player follow-up. MAME has a partial Gran Trak 10 netlist. | Track PROM, wheel/pedal/shifter mapping, timer and collision behavior. Shared hardware does not guarantee cheap variants. |
| Speed Race (Taito, 1974) | Adds scrolling racing; distinct from DICE's top-down circuit games. | Complete board documentation, video timing and steering behavior. |
| Qwak! (Atari, 1974) | Adds a duck-shooting light-gun game; touch aiming could be approachable. | Target PROM, gun/CRT timing model, explicitly documented touch adaptation. |
| Destruction Derby (Exidy, 1976) | Another competitive driving game; investigate possible overlap with Death Race. | Compare actual schematics before assuming reuse. |
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
- **Computer Space (Nutting, 1971):** excellent thematic flagship for circuit-based space combat. Separate investigation needed for schematics, analog behavior and existing independent simulations; no global emulation-absence claim is made.
- **Magnavox Odyssey (1972):** a possible later home-hardware collection. Its analog/discrete circuits fit the theme, but overlays, physical props and player-enforced rules broaden the product substantially.

## Suggested sequencing

1. First assess **Tank, Gran Trak 10, Death Race and Qwak!**. Select the first implementation by documentation completeness and validated assets, not popularity alone.
2. Expand into **Speed Race, Destruction Derby, Le Mans and Fonz**, plus variants whose circuit relationships have actually been checked.
3. Keep **Monaco GP, Indy 800 and Computer Space** as stretch research targets rather than promised releases.

Before accepting a title, collect its schematic revision, board photos, manual, exact PROM checksums where applicable, reference gameplay/audio and a practical browser/mobile control plan. Estimate performance only after a representative circuit runs. MAME's software source license does not grant redistribution rights to game PROM data. ROM-free circuits still need faithful reconstruction and validation.

Original circuit-designed NoCPU games could be a separate later line: design playable netlists, publish their schematics and offer an optional signal inspector. These should be labeled originals and kept distinct from historical preservation.
