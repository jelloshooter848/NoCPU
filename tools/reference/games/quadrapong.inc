// SPDX-License-Identifier: GPL-3.0-or-later
// Original Quadrapong observation (upstream games/quadrapong.cpp), written for
// the reference independently of core/games/quadrapong.cpp.
REFERENCE_GAME(quadrapong) {
    g.name = "quadrapong";
    g.dips = {{"coinage", 1, 2, 0}};
    g.paddles = 4; g.starts = 1;
    // Miss counters: left _1A.._1D (L9 pin 3, K9/J9/H9 pin 5), right _2A.._2D
    // (L9 pin 5, K9/J9/H9 pin 9); top _3B, _3C (L10 pin 3, K10 pin 5) and
    // _3D as the complement of _3D_n (J10 pin 6); bottom _4B, _4C (L10 pin 5,
    // K10 pin 9) and _4D from _4D_n (J10 pin 8). J10's Q outputs are pruned.
    g.scores = {{{"L9.3", 1}, {"K9.5", 2}, {"J9.5", 4}, {"H9.5", 8}},
                {{"L9.5", 1}, {"K9.9", 2}, {"J9.9", 4}, {"H9.9", 8}},
                {{"L10.3", 1}, {"K10.5", 2}, {"J10.6", 4, true}},
                {{"L10.5", 1}, {"K10.9", 2}, {"J10.8", 4, true}}};
    g.active = "F9.6"; g.attract_n = "F9.6";   // ATTRAC_n
    g.hit = "E3.3";                             // ball on any paddle (active low)
    g.events = {"A5.8", "A5.6", "MISS_BUF.2", "A1.5"}; // side/end paddle hits, buffered MISS, SERVE
}
