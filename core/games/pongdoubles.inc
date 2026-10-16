// SPDX-License-Identifier: GPL-3.0-or-later
void nocpu_reset_pongdoubles_descriptors() {
    a3_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    a10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9a_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9b_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    f5_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    g5_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(1.0));
    c33_desc=SeriesRCDesc(K_OHM(1.0),U_FARAD(0.1));
    pad1_desc=Paddle1VerticalDesc(17000.0,145000.0,&b10_555_desc);
    pad2_desc=Paddle2VerticalDesc(17000.0,145000.0,&a10_555_desc);
    pad3_desc=Paddle3VerticalDesc(17000.0,145000.0,&b9a_555_desc);
    pad4_desc=Paddle4VerticalDesc(17000.0,145000.0,&b9b_555_desc);
    dipswitch1_desc=DipswitchDesc("winning_score","Winning Score",0,"11","15");
}
void nocpu_configure_pongdoubles(unsigned dip) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
}
