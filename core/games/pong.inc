// SPDX-License-Identifier: GPL-3.0-or-later
void nocpu_reset_pong_descriptors() {
    a9_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    f4_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    g4_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(1.0));
    pad1_desc=Paddle1VerticalDesc(17000.0,145000.0,&b9_555_desc);
    pad2_desc=Paddle2VerticalDesc(17000.0,145000.0,&a9_555_desc);
    dipswitch1_desc=DipswitchDesc("winning_score","Winning Score",0,"11","15");
}
void nocpu_configure_pong(unsigned dip) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
}
