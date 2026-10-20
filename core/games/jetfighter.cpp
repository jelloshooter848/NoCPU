// SPDX-License-Identifier: GPL-3.0-or-later
// Jet Fighter (Atari, 1975): the original access contract of
// games/jetfighter.cpp. The player supplies its six PROMs.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_jetfighter();
extern void nocpu_reset_jetfighter_descriptors();

NOCPU_REGISTER_GAME(jetfighter) {
    g.id=NOCPU_JETFIGHTER; g.name="jetfighter";
    g.circuit=circuit_jetfighter; g.reset_descriptors=nocpu_reset_jetfighter_descriptors;
    // DSW1 "coinage" (25 or 50 cents for two players); POT1 "playtime" sets
    // the K9 astable that clocks the D5 game timer.
    g.dips={{"coinage",1,2,0}};
    g.pot="playtime"; g.pot_min=10000; g.pot_max=1010000; g.pot_default=510000;
    // JOYSTICK1/2_INPUT (left/right rotate, up faster, down slower),
    // BUTTONS1/2_INPUT button 1 (fire); COIN_INPUT and two START_INPUTs.
    g.joysticks=2; g.joystick_directions=15; g.button_slots=2; g.buttons=1; g.starts=2;
    // Score counters (7493 QA..QD = pins 12, 9, 8, 11), cleared by START.
    // Player 1 (JOYSTICK1/BUTTONS1) flies the white jet, whose score (right,
    // white) is B5, counting HIT2; the black jet's (left) is A6, counting HIT1.
    g.scores={{{"B5.12",1},{"B5.9",2},{"B5.8",4},{"B5.11",8}},
              {{"A6.12",1},{"A6.9",2},{"A6.8",4},{"A6.11",8}}};
    g.active="C7.8";     // ATTRACT_n: high while a game is in play
    g.attract_n="C7.8";
    // Events: HIT1 and HIT2 (E7: points for the black and the white jet),
    // C7.6 and C7.10 (a black and a white shell in flight), START (D3.15),
    // ENDGAME_n (E8.4), GNE_n (E5.8: game near end) and 1PLAY (E8.13).
    g.events={"E7.6","E7.8","C7.6","C7.10","D3.15","E8.4","E5.8","E8.13"};
    g.rom_file="jetfighter";
    g.roms={{"jet1.a4",{{0x08A0B011,256}}},{"jet1.j1",{{0xBEE62D20,32}}},{"jet1.j5",{{0xC58EE65D,512}}},
            {"jet1.k5",{{0x0D5648A9,512}}},{"jet1.m1",{{0xBEE62D20,32}}},{"jet1.r5",{{0xBD95F87E,32}}}};
}
