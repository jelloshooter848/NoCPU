// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/rebound.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built.
void nocpu_reset_rebound_descriptors() {
    b9_555_desc=Mono555Desc(K_OHM(200.0),P_FARAD(220.0));
    c9_555_desc=Mono555Desc(K_OHM(100.0),P_FARAD(220.0));
    d1_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(5.0),K_OHM(47.0),U_FARAD(10.0));
    k1_desc=Mono9602Desc(K_OHM(33.0),U_FARAD(47.0),K_OHM(47.0),U_FARAD(10.0));
    pad2_desc=Paddle2HorizontalDesc(150000.0,250000.0,&b9_555_desc);
    pad1_desc=Paddle1HorizontalDesc(42000.0,132000.0,&c9_555_desc);
    dipswitch1_desc=DipswitchDesc("winning_score","Winning Score",0,"11","15");
    dipswitch2_desc=DipswitchDesc("coinage","Coinage",0,"1 Coin / 1 Credit","1 Coin / 2 Credits");
}
