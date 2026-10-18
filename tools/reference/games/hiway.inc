// SPDX-License-Identifier: GPL-3.0-or-later
// Original Hi-Way observation (upstream games/highway.cpp, DICE ID "hiway"),
// written for the reference independently of core/games/hiway.cpp.
REFERENCE_GAME(hiway) {
    g.name = "hiway";
    // SW_EXT_PLAY (DIPSWITCH_4SPST, 16 choices, original default 6), SW_K4L4,
    // SW_H6N4, packed in declared order.
    g.dips = {{"ext_play", 4, 16, 6}, {"concurrent_traffic", 1, 2, 0}, {"opposing_traffic", 1, 2, 0}};
    g.pot = "playtime"; g.pot_min = 10000; g.pot_max = 1010000; g.pot_default = 510000; // E9POT, K_OHM(10..1010), 510
    // STEERINGWHEEL = WHEEL1_INPUT, ACCELERATOR = BUTTONS1_INPUT button 1; COIN_IN starts.
    g.wheels = 1; g.button_slots = 1; g.buttons = 1;
    // Score: N2 7490 (QA..QD pins 12, 9, 8, 11) units, L2 7493 tens.
    // Time: E8 7493, its B section (pins 9, 8, 11) clocked by E9, then QA (12).
    g.scores = {{{"N2.12", 1}, {"N2.9", 2}, {"N2.8", 4}, {"N2.11", 8},
                 {"L2.12", 10}, {"L2.9", 20}, {"L2.8", 40}, {"L2.11", 80}},
                {{"E8.9", 1}, {"E8.8", 2}, {"E8.11", 4}, {"E8.12", 8}}};
    g.active = "F9.6";                                       // GT before CAP_F9_6
    g.events = {"C6.12", "D8.6", "F7.9", "CAP_F7_7.2", "K1.8"}; // Fx, FLASH, OFR, CRASH, extended-play match
}
