// SPDX-License-Identifier: GPL-3.0-or-later
// Original Jet Fighter observation (upstream games/jetfighter.cpp), written for
// the reference independently of core/games/jetfighter.cpp. Original DICE reads
// the player's jetfighter.zip itself.
REFERENCE_GAME(jetfighter) {
    g.name = "jetfighter";
    g.dips = {{"coinage", 1, 2, 0}};                                                     // DSW1
    g.pot = "playtime"; g.pot_min = 10000; g.pot_max = 1010000; g.pot_default = 510000;  // POT1 -> K9, K_OHM(10..1010), 510
    g.joysticks = 2; g.joystick_directions = 15; g.button_slots = 2; g.buttons = 1; g.starts = 2;
    // White jet (player 1) B5, black jet A6: 7493 counters, QA..QD pins 12, 9, 8, 11.
    g.scores = {{{"B5.12", 1}, {"B5.9", 2}, {"B5.8", 4}, {"B5.11", 8}},
                {{"A6.12", 1}, {"A6.9", 2}, {"A6.8", 4}, {"A6.11", 8}}};
    g.active = "C7.8"; g.attract_n = "C7.8"; // _ATTRACTn
    // HIT1, HIT2, FIRE1, FIRE2, START, ENDGAMEn, GNEn, 1PLAY
    g.events = {"E7.6", "E7.8", "C7.6", "C7.10", "D3.15", "E8.4", "E5.8", "E8.13"};
    g.roms = true;
}
