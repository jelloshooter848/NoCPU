// SPDX-License-Identifier: GPL-3.0-or-later
// Original TV Basketball observation (upstream games/tvbasketball.cpp), written
// for the reference independently of core/games/tvbasketball.cpp.
REFERENCE_GAME(tvbasketball) {
    g.name = "tvbasketball";
    g.pot = "playtime"; g.pot_min = 10000; g.pot_max = 60000; g.pot_default = 35000; // POT1 on 9D, K_OHM(10..60), 35
    // PAD1..PAD4 chips are PADDLE1/4/3/2_VERTICAL_INPUT; COIN and START.
    g.paddles = 4; g.starts = 1;
    // Score counters cleared by B (13A.4): 6D 7490 counted on CKB (pin 1) with
    // 6B tens (CKA from 6D QD); 6C with 6A tens. QA..QD are pins 12, 9, 8, 11.
    g.scores = {{{"6D.12", 1}, {"6D.9", 2}, {"6D.8", 4}, {"6D.11", 8},
                 {"6B.12", 10}, {"6B.9", 20}, {"6B.8", 40}, {"6B.11", 80}},
                {{"6C.12", 1}, {"6C.9", 2}, {"6C.8", 4}, {"6C.11", 8},
                 {"6A.12", 10}, {"6A.9", 20}, {"6A.8", 40}, {"6A.11", 80}}};
    g.active = "3J.5";                          // 3J start flip-flop Q
    g.events = {"8E.13", "8E.1", "7E.8", "4J.6", "3J.9"}; // score clocks, time up, 4J Q_n, credit
}
