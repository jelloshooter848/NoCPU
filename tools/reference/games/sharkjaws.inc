// SPDX-License-Identifier: GPL-3.0-or-later
// Original Shark Jaws observation (upstream games/sharkjaws.cpp), written for
// the reference independently of core/games/sharkjaws.cpp. Original DICE reads
// the player's sharkjaws.zip itself.
REFERENCE_GAME(sharkjaws) {
    g.name = "sharkjaws";
    g.dips = {{"coinage", 1, 2, 0}};                                                       // DSW1
    g.pot = "playtime"; g.pot_min = 470000; g.pot_max = 1470000; g.pot_default = 970000;   // POT1 -> N9A, K_OHM(470..1470), 970
    g.joysticks = 1; g.joystick_directions = 15; g.starts = 1;                             // JOYSTICK1_INPUT, COIN_INPUT, START_INPUT
    // Score 6F (units) / 6E (tens): 7490 QA..QD pins 12, 9, 8, 11.
    g.scores = {{{"6F.12", 1}, {"6F.9", 2}, {"6F.8", 4}, {"6F.11", 8}, {"6E.12", 10}, {"6E.9", 20}, {"6E.8", 40}, {"6E.11", 80}}};
    g.active = "8E.8"; g.attract_n = "8E.8"; // _ATTRACTn
    // _FISHSCORE, _RESET, _START, _ENDGAMEn, credit LATCH, N8
    g.events = {"C9A.3", "6H.9", "8E.6", "N9A.3", "LATCH.3", "N8.3"};
    g.roms = true;
}
