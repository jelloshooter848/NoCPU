// SPDX-License-Identifier: GPL-3.0-or-later
// Original Pin Pong observation (upstream games/pinpong.cpp), written for the
// reference independently of core/games/pinpong.cpp.
REFERENCE_GAME(pinpong) {
    g.name = "pinpong";
    // S1 coinage, S2 free ball, S3 ball count, one bit each in declared order.
    g.dips = {{"coinage", 1, 2, 0}, {"free_ball", 1, 2, 0}, {"ball_count", 1, 2, 0}};
    // FLIPPERS = BUTTONS1_INPUT buttons 1 (left) and 2 (right); COIN and START.
    g.button_slots = 1; g.buttons = 2; g.starts = 1;
    // Score decades C7, D7, D6, C6 (7490 QA..QD pins 12, 9, 8, 11);
    // balls served: N10 74164 outputs QA..QE (pins 3, 4, 5, 6, 10).
    g.scores = {{{"C7.12", 1}, {"C7.9", 2}, {"C7.8", 4}, {"C7.11", 8},
                 {"D7.12", 10}, {"D7.9", 20}, {"D7.8", 40}, {"D7.11", 80},
                 {"D6.12", 100}, {"D6.9", 200}, {"D6.8", 400}, {"D6.11", 800},
                 {"C6.12", 1000}, {"C6.9", 2000}, {"C6.8", 4000}, {"C6.11", 8000}},
                {{"N10.3", 1}, {"N10.4", 1}, {"N10.5", 1}, {"N10.6", 1}, {"N10.10", 1}}};
    g.active = "J9.6"; g.attract_n = "J9.6";     // ATTRACT_n
    // MISS_n, SERVE, FREE_BALL_INDICATOR, START; the hit pulse F1.Q and the
    // three scoring object latches (D9-2 Q pins 9 and 5, D9-1 Q pin 5).
    g.events = {"F4.3", "H10.6", "K10.6", "J9.9", "F1.9", "D9-2.9", "D9-2.5", "D9-1.5"};
}
