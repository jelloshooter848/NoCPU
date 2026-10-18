// SPDX-License-Identifier: GPL-3.0-or-later
// Hi-Way (Atari, 1975): the original access contract of games/highway.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_hiway();
extern void nocpu_reset_hiway_descriptors();

NOCPU_REGISTER_GAME(hiway) {
    g.id=NOCPU_HIWAY; g.name="hiway";
    g.circuit=circuit_hiway; g.reset_descriptors=nocpu_reset_hiway_descriptors;
    // SW_EXT_PLAY (four bits, 16 choices) bits 0-3, SW_K4L4 concurrent traffic
    // bit 4, SW_H6N4 opposing traffic bit 5.
    g.dips={{"ext_play",4,16,6},{"concurrent_traffic",1,2,0},{"opposing_traffic",1,2,0}};
    // E9POT "playtime" 10..1010 kOhm on the E9 timer astable, default 510 kOhm.
    g.pot="playtime"; g.pot_min=10000; g.pot_max=1010000; g.pot_default=510000;
    // STEERINGWHEEL is WHEEL1_INPUT; ACCELERATOR is BUTTONS1_INPUT button 1.
    // The coin starts the game (no Start switch).
    g.wheels=1; g.button_slots=1; g.buttons=1; g.starts=0;
    // Score: N2 7490 units (QA..QD = 12,9,8,11) and L2 7493 tens, cleared by
    // E5.4; play time: the E8 7493 counting E9 periods (B section first).
    g.scores={{{"N2.12",1},{"N2.9",2},{"N2.8",4},{"N2.11",8},{"L2.12",10},{"L2.9",20},{"L2.8",40},{"L2.11",80}},
              {{"E8.9",1},{"E8.8",2},{"E8.11",4},{"E8.12",8}}};
    g.active="F9.6";     // game time (GT, before its CAP_F9_6 delay)
    // Events: the score clock Fx (C6.12), FLASH (D8.6), off road (F7.9), crash
    // (CAP_F7_7.2) and the extended-play match (K1.8).
    g.events={"C6.12","D8.6","F7.9","CAP_F7_7.2","K1.8"};
}
