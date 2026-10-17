// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/quadrapong.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// VIDEO_DESC (1 kOhm resistances, contrast 3.0) and INPUT_DESC are constant.
void nocpu_reset_quadrapong_descriptors() {
    a10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    c10_555_desc=Mono555Desc(K_OHM(100.0),P_FARAD(220.0));
    d10_555_desc=Mono555Desc(K_OHM(100.0),P_FARAD(220.0));
    e10_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    a2_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(5.0),K_OHM(33.0),U_FARAD(47.0));
    pad1_desc=Paddle1VerticalDesc(17000.0,145000.0,&a10_555_desc);
    pad2_desc=Paddle2VerticalDesc(17000.0,145000.0,&b10_555_desc);
    pad3_desc=Paddle3HorizontalDesc(30000.0,200000.0,&c10_555_desc);
    pad4_desc=Paddle4HorizontalDesc(30000.0,200000.0,&d10_555_desc);
    c34_desc=SeriesRCDesc(K_OHM(1.0),U_FARAD(0.1));
    miss_buf_desc=BufferDesc(DELAY_NS(15.0),DELAY_NS(15.0));
    dipswitch1_desc=DipswitchDesc("coinage","Coinage",0,"1 Coin / 1 Credit","1 Coin / 2 Credits");
}
