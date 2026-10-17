// SPDX-License-Identifier: GPL-3.0-or-later
// Gotcha (Atari, 1973): the original access contract of games/gotcha.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_gotcha();
extern void nocpu_reset_gotcha_descriptors();

NOCPU_REGISTER_GAME(gotcha) {
    g.id=NOCPU_GOTCHA; g.name="gotcha";
    g.circuit=circuit_gotcha; g.reset_descriptors=nocpu_reset_gotcha_descriptors;
    // No DIP switch. POT1 "playtime" sets D8.r1, the play-timer astable.
    g.pot="playtime"; g.pot_min=47000; g.pot_max=297000; g.pot_default=297000;
    // JOYSTICK1_INPUT ("Move Cross") and JOYSTICK2_INPUT ("Move Square"), all
    // four switches each; Coin and one Start switch.
    g.joysticks=2; g.joystick_directions=15; g.starts=1;
    // The two displayed numbers, cleared by START: catches, G8 7490 units
    // (QA..QD = 12,9,8,11) with the J8 tens flip-flops (Q pins 3 and 5), and
    // the elapsed play time, K8 units and L8 tens (the game ends as L8 wraps).
    g.scores={{{"G8.12",1},{"G8.9",2},{"G8.8",4},{"G8.11",8},{"J8.3",10},{"J8.5",20}},
              {{"K8.12",1},{"K8.9",2},{"K8.8",4},{"K8.11",8},{"L8.12",10},{"L8.9",20},{"L8.8",40},{"L8.11",80}}};
    g.active="C7.8";     // ATTRACT_n: high while a game is in play
    g.attract_n="C7.8";
    g.hit="B7.10";       // CATCHOS, the catch one-shot (counted by G8)
    // Events: START and the E8 proximity-tone astable. (D8, the play-timer
    // astable, runs unattended after its first periods, so its output changes
    // are not observable one by one; the K8/L8 counter shows its count.)
    g.events={"B6.5","E8.3"};
}
