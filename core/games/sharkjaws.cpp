// SPDX-License-Identifier: GPL-3.0-or-later
// Shark Jaws (Atari, 1975): the original access contract of
// games/sharkjaws.cpp. The player supplies the 1DA (shark and fish) and 1DB
// (diver) PROMs.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_sharkjaws();
extern void nocpu_reset_sharkjaws_descriptors();

NOCPU_REGISTER_GAME(sharkjaws) {
    g.id=NOCPU_SHARKJAWS; g.name="sharkjaws";
    g.circuit=circuit_sharkjaws; g.reset_descriptors=nocpu_reset_sharkjaws_descriptors;
    // DSW1 "coinage" (1 coin / 1 or 2 credits); POT1 "playtime" sets the N9A game timer.
    g.dips={{"coinage",1,2,0}};
    g.pot="playtime"; g.pot_min=470000; g.pot_max=1470000; g.pot_default=970000;
    // JOYSTICK1_INPUT, all four directions (the diver); COIN_INPUT, one START_INPUT.
    g.joysticks=1; g.joystick_directions=15; g.starts=1;
    // The score: 6F (units) and 6E (tens) 7490s, cleared by START.
    g.scores={{{"6F.12",1},{"6F.9",2},{"6F.8",4},{"6F.11",8},{"6E.12",10},{"6E.9",20},{"6E.8",40},{"6E.11",80}}};
    g.active="8E.8";     // ATTRACT_n: high while a game is in play
    g.attract_n="8E.8";
    // Events: FISHSCORE (C9A), RESET (6H.9), START (8E.6), the N9A play
    // timer (ENDGAME_n), the credit LATCH and N8 (the start one-shot).
    g.events={"C9A.3","6H.9","8E.6","N9A.3","LATCH.3","N8.3"};
    g.rom_file="sharkjaws";
    g.roms={{"004182.1da",{{0x05242912,256}}},{"004183.1db",{{0xB161B889,256}}}};
}
