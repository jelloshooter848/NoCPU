// SPDX-License-Identifier: GPL-3.0-or-later
// Original Crossfire observation (upstream games/crossfire.cpp and crossfire.h),
// written for the reference independently of core/games/crossfire.cpp.
REFERENCE_GAME(crossfire) {
    g.name = "crossfire";
    g.pot = "playtime"; g.pot_min = 680000; g.pot_max = 1680000; g.pot_default = 1180000; // POT1, K_OHM(680..1680), 1180
    // JOYSTICK1/2_INPUT Up/Down, BUTTONS1/2_INPUT button 1; COIN starts (no START_INPUT).
    g.joysticks = 2; g.joystick_directions = 3; g.button_slots = 2; g.buttons = 1; g.starts = 0;
    // Left score L3, right score K3: 7490 units (QA..QD pins 12, 9, 8, 11); J3 74107 tens (Q pins 5 and 3).
    g.scores = {{{"L3.12", 1}, {"L3.9", 2}, {"L3.8", 4}, {"L3.11", 8}, {"J3.5", 10}},
                {{"K3.12", 1}, {"K3.9", 2}, {"K3.8", 4}, {"K3.11", 8}, {"J3.3", 10}}};
    g.active = "M8.3"; g.attract_n = "M8.3"; // ATTRACT_n
    g.hit = "B5.11";                          // HIT1 | HIT2 (NAND of HIT1_n, HIT2_n)
    // Left gun = original gun 2: HIT2, HIT1, FIRE2, FIRE1, START, N9 timer, GNE
    g.events = {"J6.11", "J6.3", "F7.9", "F7.5", "L8.6", "N9.3", "GNE.2"};
}
