// SPDX-License-Identifier: GPL-3.0-or-later
// Rebound (Atari, 1974): the original access contract of games/rebound.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_rebound();
extern void nocpu_reset_rebound_descriptors();

NOCPU_REGISTER_GAME(rebound) {
    g.id=NOCPU_REBOUND; g.name="rebound";
    g.circuit=circuit_rebound; g.reset_descriptors=nocpu_reset_rebound_descriptors;
    // DSW1 winning score (11/15) in bit 0, DSW2 coinage in bit 1.
    g.dips={{"winning_score",1,2,0},{"coinage",1,2,0}};
    // PAD1/PAD2 are PADDLE1/2_HORIZONTAL_INPUT; one Start switch.
    g.paddles=2; g.starts=1;
    // Left score: K9 7490 units (QA..QD = 12,9,8,11) and H9.5 tens flip-flop;
    // right score: J9 units and H9.3 tens. Both are cleared by START.
    g.scores={{{"K9.12",1},{"K9.9",2},{"K9.8",4},{"K9.11",8},{"H9.5",10}},
              {{"J9.12",1},{"J9.9",2},{"J9.8",4},{"J9.11",8},{"H9.3",10}}};
    g.active="E8.6";     // ATTRACT_n: high while a game is in play
    g.attract_n="E8.6";
    g.hit="E6.10";       // HIT, the ball/paddle coincidence
    g.events={"A1.3","A1.11"}; // LEFT_SCORE, RIGHT_SCORE pulses
}
