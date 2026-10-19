// SPDX-License-Identifier: GPL-3.0-or-later
// Anti-Aircraft (Atari, 1975): the original access contract of
// games/antiaircraft.cpp. The player supplies the K1 PROM (plane graphics).
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_antiaircraft();
extern void nocpu_reset_antiaircraft_descriptors();

NOCPU_REGISTER_GAME(antiaircraft) {
    g.id=NOCPU_ANTIAIRCRAFT; g.name="antiaircraft";
    g.circuit=circuit_antiaircraft; g.reset_descriptors=nocpu_reset_antiaircraft_descriptors;
    // DSW1 "coinage" (1 coin / 1 or 2 credits), DSW2 "plane_type" (Airplane or
    // UFO: K1's A4 address line); POT1 "playtime" sets the D9 game timer.
    g.dips={{"coinage",1,2,0},{"plane_type",1,2,0}};
    g.pot="playtime"; g.pot_min=220000; g.pot_max=1220000; g.pot_default=830000;
    // BUTTONS1_INPUT (left launcher) and BUTTONS2_INPUT (right launcher),
    // three held buttons each; COIN_INPUT and one START_INPUT.
    g.button_slots=2; g.buttons=3; g.starts=1;
    // Score counters, cleared by START: the left launcher's hits count on C4
    // (units) and C5 (tens), the right launcher's on B4 and B5 (7490 QA..QD =
    // pins 12, 9, 8, 11).
    g.scores={{{"C4.12",1},{"C4.9",2},{"C4.8",4},{"C4.11",8},{"C5.12",10},{"C5.9",20},{"C5.8",40},{"C5.11",80}},
              {{"B4.12",1},{"B4.9",2},{"B4.8",4},{"B4.11",8},{"B5.12",10},{"B5.9",20},{"B5.8",40},{"B5.11",80}}};
    g.active="D8.8";     // ATTRACT_n: high while a game is in play
    g.attract_n="D8.8";
    // Events: RT_HIT and LT_HIT (B1 9602 one-shots: right and left missile on
    // the plane), FIRE_RIGHT and FIRE_LEFT (J8: a missile in flight), START
    // (D8.5), the D9 play timer, the credit LATCH and RANDOM_CLOCK (D3.8).
    g.events={"B1.6","B1.10","J8.6","J8.8","D8.5","D9.3","LATCH.3","D3.8"};
    g.rom_file="antiaircraft";
    g.roms={{"aa.k1",{{0x9DE772D5,32}}}};
}
