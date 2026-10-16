// SPDX-License-Identifier: GPL-3.0-or-later
// Crossfire (Atari, 1975): the original access contract of games/crossfire.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_crossfire();
extern void nocpu_reset_crossfire_descriptors();

NOCPU_REGISTER_GAME(crossfire) {
    g.id=NOCPU_CROSSFIRE; g.name="crossfire";
    g.circuit=circuit_crossfire; g.reset_descriptors=nocpu_reset_crossfire_descriptors;
    // No DIP switch. POT1 "playtime" sets N9 (and the GNE timer that reads it).
    g.pot="playtime"; g.pot_min=680000; g.pot_max=1680000; g.pot_default=1180000;
    // JOYSTICK1/2_INPUT (Up and Down only) and BUTTONS1/2_INPUT button 1 (Fire).
    // The original wires JOYSTICK1/BUTTONS1 to the left gun ("STICK2") and
    // JOYSTICK2/BUTTONS2 to the right gun. Coin starts the game: no Start switch.
    g.joysticks=2; g.joystick_directions=3; g.button_slots=2; g.buttons=1; g.starts=0;
    // Score counters, cleared by START. Left player: L3 7490 (QA..QD = 12,9,8,11)
    // with the J3.5 tens flip-flop (the left score digit); right player: K3 with
    // J3.3. The tens stage toggles, so a score past 19 wraps to 0 as displayed.
    g.scores={{{"L3.12",1},{"L3.9",2},{"L3.8",4},{"L3.11",8},{"J3.5",10}},
              {{"K3.12",1},{"K3.9",2},{"K3.8",4},{"K3.11",8},{"J3.3",10}}};
    g.active="M8.3";     // ATTRACT_n: high while a game is in play
    g.attract_n="M8.3";
    g.hit="B5.11";       // HIT1 or HIT2 (the hit sound gate)
    // The original's gun 2 is the left gun and gun 1 the right gun. Events:
    // HIT2 and HIT1 (left and right bullet on the ball), FIRE2 and FIRE1 (left
    // and right bullet in flight), START, the N9 play timer and GNE.
    g.events={"J6.11","J6.3","F7.9","F7.5","L8.6","N9.3","GNE.2"};
}
