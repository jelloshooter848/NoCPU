// SPDX-License-Identifier: GPL-3.0-or-later
// Original Gotcha observation (upstream games/gotcha.cpp), written for the
// reference independently of core/games/gotcha.cpp.
REFERENCE_GAME(gotcha) {
    g.name = "gotcha";
    g.pot = "playtime"; g.pot_min = 47000; g.pot_max = 297000; g.pot_default = 297000; // POT1, K_OHM(47..297), 297
    // JOYSTICK1_INPUT (cross), JOYSTICK2_INPUT (square), four switches each; COIN and START.
    g.joysticks = 2; g.joystick_directions = 15; g.starts = 1;
    // Catches: G8 7490 (QA..QD pins 12, 9, 8, 11), J8 74107 tens (Q pins 3, 5).
    // Play time: K8 7490 units, L8 7490 tens.
    g.scores = {{{"G8.12", 1}, {"G8.9", 2}, {"G8.8", 4}, {"G8.11", 8}, {"J8.3", 10}, {"J8.5", 20}},
                {{"K8.12", 1}, {"K8.9", 2}, {"K8.8", 4}, {"K8.11", 8},
                 {"L8.12", 10}, {"L8.9", 20}, {"L8.8", 40}, {"L8.11", 80}}};
    g.active = "C7.8"; g.attract_n = "C7.8"; // ATTRACT_n
    g.hit = "B7.10";                          // CATCHOS
    g.events = {"B6.5", "E8.3"};              // START, proximity tone (E8 555 astable)
}
