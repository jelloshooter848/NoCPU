// SPDX-License-Identifier: GPL-3.0-or-later
// Original Anti-Aircraft observation (upstream games/antiaircraft.cpp), written
// for the reference independently of core/games/antiaircraft.cpp. Original
// DICE reads the player's antiaircraft.zip itself.
REFERENCE_GAME(antiaircraft) {
    g.name = "antiaircraft";
    g.dips = {{"coinage", 1, 2, 0}, {"plane_type", 1, 2, 0}};                                // DSW1, DSW2
    g.pot = "playtime"; g.pot_min = 220000; g.pot_max = 1220000; g.pot_default = 830000; // POT1 -> D9, K_OHM(220..1220), 830
    g.button_slots = 2; g.buttons = 3; g.starts = 1; // BUTTONS1/2_INPUT i1..i3, COIN_INPUT, START_INPUT
    // Left score C4 (units) / C5 (tens), right score B4 / B5: 7490 QA..QD pins 12, 9, 8, 11.
    g.scores = {{{"C4.12", 1}, {"C4.9", 2}, {"C4.8", 4}, {"C4.11", 8}, {"C5.12", 10}, {"C5.9", 20}, {"C5.8", 40}, {"C5.11", 80}},
                {{"B4.12", 1}, {"B4.9", 2}, {"B4.8", 4}, {"B4.11", 8}, {"B5.12", 10}, {"B5.9", 20}, {"B5.8", 40}, {"B5.11", 80}}};
    g.active = "D8.8"; g.attract_n = "D8.8"; // ATTRACT_n
    // RT_HIT, LT_HIT, FIRE_RIGHT, FIRE_LEFT, START, D9 timer, credit LATCH, RANDOM_CLOCK
    g.events = {"B1.6", "B1.10", "J8.6", "J8.8", "D8.5", "D9.3", "LATCH.3", "D3.8"};
    g.roms = true;
}
