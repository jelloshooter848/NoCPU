// SPDX-License-Identifier: GPL-3.0-or-later
// Original Rebound observation (upstream games/rebound.cpp), written for the
// reference independently of core/games/rebound.cpp.
REFERENCE_GAME(rebound) {
    g.name = "rebound";
    g.dips = {{"winning_score", 1, 2, 0}, {"coinage", 1, 2, 0}};
    g.paddles = 2; g.starts = 1;
    // K9/J9 7490 score units (QA..QD pins 12, 9, 8, 11); H9 74107 tens (Q pins 5 and 3).
    g.scores = {{{"K9.12", 1}, {"K9.9", 2}, {"K9.8", 4}, {"K9.11", 8}, {"H9.5", 10}},
                {{"J9.12", 1}, {"J9.9", 2}, {"J9.8", 4}, {"J9.11", 8}, {"H9.3", 10}}};
    g.active = "E8.6"; g.attract_n = "E8.6"; // ATTRACT_n
    g.hit = "E6.10";                          // HIT
    g.events = {"A1.3", "A1.11"};             // LEFT_SCORE, RIGHT_SCORE
}
