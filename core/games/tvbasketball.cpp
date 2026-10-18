// SPDX-License-Identifier: GPL-3.0-or-later
// TV Basketball (Midway, 1974): the original access contract of games/tvbasketball.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_tvbasketball();
extern void nocpu_reset_tvbasketball_descriptors();

NOCPU_REGISTER_GAME(tvbasketball) {
    g.id=NOCPU_TVBASKETBALL; g.name="tvbasketball";
    g.circuit=circuit_tvbasketball; g.reset_descriptors=nocpu_reset_tvbasketball_descriptors;
    // No DIP switch. POT1 "playtime" sets 9D.r1, the game-timer astable.
    g.pot="playtime"; g.pot_min=10000; g.pot_max=60000; g.pot_default=35000;
    // Four PADDLEn_VERTICAL_INPUT chips; the chip type, not the descriptor,
    // selects the input axis. One Start switch.
    g.paddles=4; g.starts=1;
    // Scores, cleared by START (B = 13A.4): 6D 7490 clocked on CKB counts
    // baskets by two (QA..QD = 12,9,8,11) with the 6B tens; 6C with 6A tens.
    g.scores={{{"6D.12",1},{"6D.9",2},{"6D.8",4},{"6D.11",8},{"6B.12",10},{"6B.9",20},{"6B.8",40},{"6B.11",80}},
              {{"6C.12",1},{"6C.9",2},{"6C.8",4},{"6C.11",8},{"6A.12",10},{"6A.9",20},{"6A.8",40},{"6A.11",80}}};
    g.active="3J.5";     // the Start flip-flop: high from Start to the end of time
    // Events: the two score clocks, end of time, the player-count flip-flop
    // (4J.6 low after a second coin: four-player game) and the credit (3J.9).
    g.events={"8E.13","8E.1","7E.8","4J.6","3J.9"};
}
